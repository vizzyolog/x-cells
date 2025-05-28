package ws

import (
	"context"
	"log"
	"time"

	pb "x-cells/backend/internal/physics/generated"
	"x-cells/backend/internal/world"
)

// startClientStreaming запускает потоковую передачу обновлений состояния объектов клиенту
func (s *WSServer) startClientStreaming(wsWriter *SafeWriter) {
	ticker := time.NewTicker(DefaultUpdateInterval)
	defer ticker.Stop()

	// Буфер для накопления обновлений
	updates := make(map[string]map[string]interface{})

	for range ticker.C {
		// Получаем список всех объектов из мира
		worldObjects := s.objectManager.GetAllWorldObjects()

		// Очищаем буфер обновлений
		for k := range updates {
			delete(updates, k)
		}

		// Для каждого объекта с физикой bullet или both получаем состояние
		for _, obj := range worldObjects {
			// Пропускаем объекты, которые обрабатываются только на клиенте
			if obj.PhysicsType == world.PhysicsTypeAmmo {
				continue
			}

			// Запрашиваем состояние объекта из физического движка
			resp, err := s.physics.GetObjectState(context.Background(), &pb.GetObjectStateRequest{
				Id: obj.ID,
			})

			if err != nil {
				log.Printf("[Go] Ошибка получения состояния для %s: %v", obj.ID, err)
				continue
			}

			// Проверяем, что получен ответ с состоянием
			if resp.Status != "OK" || resp.State == nil {
				log.Printf("[Go] Пропускаем объект %s: нет состояния", obj.ID)
				continue
			}

			// Проверяем наличие всех необходимых данных
			if resp.State.Position == nil || resp.State.Rotation == nil || resp.State.LinearVelocity == nil {
				log.Printf("[Go] Пропускаем объект %s: неполные данные", obj.ID)
				continue
			}

			// Создаем Vector3 и Quaternion из ответа сервера
			position := world.Vector3{
				X: resp.State.Position.X,
				Y: resp.State.Position.Y,
				Z: resp.State.Position.Z,
			}

			rotation := world.Quaternion{
				X: resp.State.Rotation.X,
				Y: resp.State.Rotation.Y,
				Z: resp.State.Rotation.Z,
				W: resp.State.Rotation.W,
			}

			// Создаем единое сообщение с позицией, вращением и скоростью
			update := map[string]interface{}{
				"type":        "update",
				"id":          obj.ID,
				"hasPosition": true,
				"hasVelocity": true,
				"position": map[string]float32{
					"x": position.X,
					"y": position.Y,
					"z": position.Z,
				},
				"rotation": map[string]float32{
					"x": rotation.X,
					"y": rotation.Y,
					"z": rotation.Z,
					"w": rotation.W,
				},
				"velocity": map[string]float32{
					"x": resp.State.LinearVelocity.X,
					"y": resp.State.LinearVelocity.Y,
					"z": resp.State.LinearVelocity.Z,
				},
			}

			// Добавляем обновление в буфер
			updates[obj.ID] = update
		}

		// Отправляем все накопленные обновления одним сообщением
		if len(updates) > 0 {
			// Создаем копию updates для безопасности
			updatesCopy := make(map[string]interface{})
			for id, update := range updates {
				if update != nil {
					updatesCopy[id] = update
				} else {
					log.Printf("[Go] Пропускаем nil обновление для объекта %s", id)
				}
			}

			// Проверяем, что у нас есть валидные обновления
			if len(updatesCopy) == 0 {
				log.Printf("[Go] Нет валидных обновлений для отправки")
				continue
			}

			batchUpdate := map[string]interface{}{
				"type":    "batch_update",
				"updates": updatesCopy,
				"time":    time.Now().UnixNano() / 1e6, // текущее время в миллисекундах
			}

			// Дополнительная проверка перед отправкой
			if batchUpdate["updates"] == nil {
				log.Printf("[Go] Ошибка: updates равно nil в batchUpdate")
				continue
			}

			// Используем имитацию сетевых условий
			if err := s.simulateNetworkConditions(wsWriter, batchUpdate); err != nil {
				log.Printf("[Go] Ошибка отправки пакетного обновления: %v", err)
			} else {
				log.Printf("[Go] Отправлено пакетное обновление для %d объектов", len(updatesCopy))
			}
		}
	}
}

// sendPhysicsConfig отправляет конфигурацию физики клиенту
func (s *WSServer) sendPhysicsConfig(conn *SafeWriter) {
	physicsConfig := world.GetPhysicsConfig()

	configMessage := map[string]interface{}{
		"type":   "physics_config",
		"config": physicsConfig,
	}

	// Используем имитацию сетевых условий
	if err := s.simulateNetworkConditions(conn, configMessage); err != nil {
		log.Printf("[Go] Ошибка отправки конфигурации физики: %v", err)
	} else {
		log.Printf("[Go] Конфигурация физики отправлена клиенту")
	}
}
