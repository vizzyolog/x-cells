/*
Этот файл больше не используется после перехода на гексагональную архитектуру.
Функциональность перемещена в backend/internal/adapter/in/ws.

package ws

import (
	"log"
	"math"
	"time"

	"x-cells/backend/internal/world"
)

// WorldSerializer отвечает за сериализацию объектов мира для отправки клиенту
type WorldSerializer struct {
	worldManager *world.Manager
}

// NewWorldSerializer создает новый экземпляр WorldSerializer
func NewWorldSerializer(worldManager *world.Manager) *WorldSerializer {
	return &WorldSerializer{
		worldManager: worldManager,
	}
}

// Вспомогательная функция для проверки и замены NaN
func safeFloat32(val float32, defaultVal float32) float32 {
	if math.IsNaN(float64(val)) {
		return defaultVal
	}
	return val
}

// SendCreateForAllObjects отправляет информацию о всех объектах клиенту
func (s *WorldSerializer) SendCreateForAllObjects(wsWriter *SafeWriter) error {
	worldObjects := s.worldManager.GetAllWorldObjects()

	for _, obj := range worldObjects {
		// Получаем текущее время в миллисекундах для временной метки
		serverTime := time.Now().UnixNano() / int64(time.Millisecond)

		// Создаем базовый объект с общими полями
		msg := map[string]interface{}{
			"type":        "create",
			"id":          obj.ID,
			"x":           safeFloat32(obj.Position.X, 0.0),
			"y":           safeFloat32(obj.Position.Y, 0.0),
			"z":           safeFloat32(obj.Position.Z, 0.0),
			"color":       obj.Color,
			"physics_by":  string(obj.PhysicsType),
			"server_time": serverTime,
		}

		// Заполняем поля в зависимости от типа объекта
		switch obj.Shape.Type {
		case world.SPHERE:
			msg["object_type"] = "sphere"
			msg["radius"] = safeFloat32(obj.Shape.Sphere.Radius, 1.0)
			msg["mass"] = safeFloat32(obj.Shape.Sphere.Mass, 1.0)

		case world.BOX:
			msg["object_type"] = "box"
			msg["width"] = safeFloat32(obj.Shape.Box.Width, 1.0)
			msg["height"] = safeFloat32(obj.Shape.Box.Height, 1.0)
			msg["depth"] = safeFloat32(obj.Shape.Box.Depth, 1.0)
			msg["mass"] = safeFloat32(obj.Shape.Box.Mass, 1.0)

		case world.TERRAIN:
			msg["object_type"] = "terrain"

			// Проверяем HeightData на NaN
			if obj.Shape.Terrain.HeightData != nil {
				safeHeightData := make([]float32, len(obj.Shape.Terrain.HeightData))
				for i, h := range obj.Shape.Terrain.HeightData {
					safeHeightData[i] = safeFloat32(h, 0.0)
				}
				msg["height_data"] = safeHeightData
			} else {
				msg["height_data"] = []float32{}
			}

			msg["heightmap_w"] = obj.Shape.Terrain.Width
			msg["heightmap_h"] = obj.Shape.Terrain.Depth
			msg["scale_x"] = safeFloat32(obj.Shape.Terrain.ScaleX, 1.0)
			msg["scale_y"] = safeFloat32(obj.Shape.Terrain.ScaleY, 1.0)
			msg["scale_z"] = safeFloat32(obj.Shape.Terrain.ScaleZ, 1.0)
			msg["min_height"] = safeFloat32(obj.MinHeight, 0.0)
			msg["max_height"] = safeFloat32(obj.MaxHeight, 10.0)
		}

		// Отправляем сообщение
		if err := wsWriter.WriteJSON(msg); err != nil {
			log.Printf("[Serialize] Ошибка отправки объекта %s: %v", obj.ID, err)
			return err
		}
	}

	return nil
}

// SendUpdateForObject отправляет обновление состояния объекта клиенту
func (s *WorldSerializer) SendUpdateForObject(wsWriter *SafeWriter, objectID string, position world.Vector3, rotation world.Quaternion) error {
	// Получаем текущее время в миллисекундах для временной метки
	serverTime := time.Now().UnixNano() / int64(time.Millisecond)
	serverSendTime := time.Now().UnixNano() / int64(time.Millisecond)

	// Получаем скорость объекта из менеджера мира
	var velocity world.Vector3
	obj, exists := s.worldManager.GetWorldObject(objectID)
	if exists && obj != nil {
		// Используем поле Velocity из объекта
		velocity = obj.Velocity
	} else {
		// Если объект не найден, устанавливаем нулевую скорость
		velocity = world.Vector3{X: 0, Y: 0, Z: 0}
	}

	// Создаем сообщение обновления с безопасными значениями
	msg := map[string]interface{}{
		"type":             "update",
		"id":               objectID,
		"x":                safeFloat32(position.X, 0.0),
		"y":                safeFloat32(position.Y, 0.0),
		"z":                safeFloat32(position.Z, 0.0),
		"qx":               safeFloat32(rotation.X, 0.0),
		"qy":               safeFloat32(rotation.Y, 0.0),
		"qz":               safeFloat32(rotation.Z, 0.0),
		"qw":               safeFloat32(rotation.W, 1.0), // 1.0 как значение по умолчанию для w
		"server_time":      serverTime,
		"server_send_time": serverSendTime,
		"vx":               safeFloat32(velocity.X, 0.0),
		"vy":               safeFloat32(velocity.Y, 0.0),
		"vz":               safeFloat32(velocity.Z, 0.0),
	}

	// Отправляем сообщение
	if err := wsWriter.WriteJSON(msg); err != nil {
		log.Printf("[Serialize] Ошибка отправки обновления для объекта %s: %v", objectID, err)
		return err
	}

	return nil
}
*/
