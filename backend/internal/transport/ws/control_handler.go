package ws

import (
	"context"
	"encoding/json"
	"log"
	"math"
	"time"

	pb "x-cells/backend/internal/physics/generated"
	"x-cells/backend/internal/world"
)

// ControllerState - структура для хранения данных контроллера
type ControllerState struct {
	LastUpdate time.Time
	Force      struct {
		X float32
		Y float32
		Z float32
	}
}

// Command - структура команды от клиента
type Command struct {
	ID         string
	Type       string
	ClientTime int64
	Force      struct {
		X float32
		Y float32
		Z float32
	}
}

// Direction структура для хранения направления
type Direction struct {
	X float32 `json:"x"`
	Y float32 `json:"y"`
	Z float32 `json:"z"`
}

// VectorSub вычитает два вектора
func VectorSub(v1, v2 *pb.Vector3) *pb.Vector3 {
	return &pb.Vector3{
		X: v1.X - v2.X,
		Y: v1.Y - v2.Y,
		Z: v1.Z - v2.Z,
	}
}

// VectorLength вычисляет длину вектора
func VectorLength(v *pb.Vector3) float32 {
	return float32(math.Sqrt(float64(v.X*v.X + v.Y*v.Y + v.Z*v.Z)))
}

// handleCmd обрабатывает команды управления
func (s *WSServer) handleCmd(conn *SafeWriter, message interface{}) error {
	cmdMsg, ok := message.(*CommandMessage)
	if !ok {
		return ErrInvalidMessage
	}

	// Получаем игрока по соединению
	player := s.getPlayerByConnection(conn)
	if player == nil {
		log.Printf("[Go] Игрок не найден для соединения")
		return nil
	}

	// Используем ObjectID игрока из соединения
	objectID := player.ObjectID
	// log.Printf("[Go] Команда для игрока %s", objectID)

	// Обновляем состояние контроллера
	s.updateControllerState(objectID, cmdMsg)

	// Вычисляем импульс на основе команды
	impulse := s.calculateImpulse(cmdMsg, objectID)
	if impulse == nil {
		return nil
	}

	// Применяем импульс к объекту
	err := s.applyImpulseToObject(objectID, impulse)
	if err != nil {
		return err
	}

	// Отправляем подтверждение обработки команды
	ackMsg := NewAckMessage(cmdMsg.Cmd, cmdMsg.ClientTime)
	return s.simulateNetworkConditions(conn, ackMsg)
}

// updateControllerState обновляет состояние контроллера для объекта
func (s *WSServer) updateControllerState(objectID string, cmdMsg *CommandMessage) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if state, exists := s.controllerStates[objectID]; exists {
		state.LastUpdate = time.Now()
		s.updateForceFromData(state, cmdMsg.Data)
	} else {
		// Создаем новое состояние контроллера
		state := &ControllerState{
			LastUpdate: time.Now(),
			Force: struct {
				X float32
				Y float32
				Z float32
			}{},
		}
		s.updateForceFromData(state, cmdMsg.Data)
		s.controllerStates[objectID] = state
	}
}

// updateForceFromData обновляет силу из данных команды
func (s *WSServer) updateForceFromData(state *ControllerState, data interface{}) {
	if forceData, ok := data.(map[string]interface{}); ok {
		if x, ok := forceData["x"].(float64); ok {
			state.Force.X = float32(x)
		}
		if y, ok := forceData["y"].(float64); ok {
			state.Force.Y = float32(y)
		}
		if z, ok := forceData["z"].(float64); ok {
			state.Force.Z = float32(z)
		}
	}
}

// calculateImpulse вычисляет импульс на основе команды
func (s *WSServer) calculateImpulse(cmdMsg *CommandMessage, objectID string) *pb.Vector3 {
	var impulse pb.Vector3

	switch cmdMsg.Cmd {
	case "LEFT":
		impulse.X = -15
	case "RIGHT":
		impulse.X = 15
	case "UP":
		impulse.Z = -15
	case "DOWN":
		impulse.Z = 15
	case "SPACE":
		impulse.Y = 20
	case "MOUSE_VECTOR":
		return s.calculateMouseVectorImpulse(cmdMsg, objectID)
	default:
		log.Printf("[Go] Неизвестная команда: %s", cmdMsg.Cmd)
		return nil
	}

	return &impulse
}

// calculateMouseVectorImpulse вычисляет импульс для команды MOUSE_VECTOR
func (s *WSServer) calculateMouseVectorImpulse(cmdMsg *CommandMessage, objectID string) *pb.Vector3 {
	// Получаем данные о направлении
	var direction struct {
		X        float32 `json:"x"`
		Y        float32 `json:"y"`
		Z        float32 `json:"z"`
		Distance float32 `json:"distance"`
	}

	// Преобразуем interface{} в []byte для json.Unmarshal
	dataBytes, err := json.Marshal(cmdMsg.Data)
	if err != nil {
		log.Printf("[Go] Ошибка преобразования данных MOUSE_VECTOR: %v", err)
		return nil
	}

	if err := json.Unmarshal(dataBytes, &direction); err != nil {
		log.Printf("[Go] Ошибка разбора данных MOUSE_VECTOR: %v", err)
		return nil
	}

	// log.Printf("[Go] Получен вектор направления для %s: (%f, %f, %f), расстояние: %f",
	//	objectID, direction.X, direction.Y, direction.Z, direction.Distance)

	// Используем настройки из конфигурации физики
	physicsConfig := world.GetPhysicsConfig()

	// Создаем импульс в направлении X, Y и Z с учетом полученного вектора
	impulse := &pb.Vector3{
		X: direction.X * physicsConfig.Control.BaseImpulse,
		Y: direction.Y * physicsConfig.Control.BaseImpulse,
		Z: direction.Z * physicsConfig.Control.BaseImpulse,
	}

	// Добавляем логирование для отладки
	// log.Printf("[Go] Импульсы для %s: X=%f, Y=%f, Z=%f", objectID, impulse.X, impulse.Y, impulse.Z)

	return impulse
}

// applyImpulseToObject применяет импульс к объекту
func (s *WSServer) applyImpulseToObject(objectID string, impulse *pb.Vector3) error {
	// Проверяем, что объект игрока существует
	obj, exists := s.objectManager.GetObject(objectID)
	if !exists {
		log.Printf("[Go] Объект игрока %s не найден", objectID)
		return nil
	}

	// Пропускаем объекты, которые обрабатываются только на клиенте
	if obj.PhysicsType == world.PhysicsTypeAmmo {
		log.Printf("[Go] Объект %s имеет тип физики ammo, пропускаем", objectID)
		return nil
	}

	// Применяем импульс к объекту игрока через Bullet Physics
	_, err := s.physics.ApplyImpulse(context.Background(), &pb.ApplyImpulseRequest{
		Id:      objectID,
		Impulse: impulse,
	})

	if err != nil {
		log.Printf("[Go] Ошибка применения импульса к объекту игрока %s: %v", objectID, err)
		return err
	}

	// log.Printf("[Go] Применен импульс к объекту игрока %s: (%f, %f, %f)",
	//	objectID, impulse.X, impulse.Y, impulse.Z)

	return nil
}

// applyImpulses регулярно применяет импульсы к объектам на основе состояния контроллеров
func (s *WSServer) applyImpulses() {
	ticker := time.NewTicker(s.impulseInterval)
	defer ticker.Stop()

	for range ticker.C {
		s.mu.RLock()
		for id, state := range s.controllerStates {
			// Вычисляем временной интервал в секундах
			deltaTime := float32(s.impulseInterval.Milliseconds()) / 1000.0 // конвертируем в секунды

			// Создаем запрос на применение импульса
			req := &pb.ApplyImpulseRequest{
				Id: id,
				Impulse: &pb.Vector3{
					X: state.Force.X * deltaTime,
					Y: state.Force.Y * deltaTime,
					Z: state.Force.Z * deltaTime,
				},
			}

			// Применяем импульс
			if _, err := s.physics.ApplyImpulse(context.Background(), req); err != nil {
				log.Printf("[Go] Ошибка применения импульса к объекту %s: %v", id, err)
			}
		}
		s.mu.RUnlock()
	}
}

// handlePing обрабатывает ping-сообщения
func (s *WSServer) handlePing(conn *SafeWriter, message interface{}) error {
	pingMsg, ok := message.(*PingMessage)
	if !ok {
		return ErrInvalidMessage
	}

	// Отправляем pong в ответ с применением имитации сетевых условий
	pongMessage := NewPongMessage(pingMsg.ClientTime)
	return s.simulateNetworkConditions(conn, pongMessage)
}

// startPing запускает периодическую отправку пингов для проверки соединения
func (s *WSServer) startPing(conn *SafeWriter) {
	ticker := time.NewTicker(s.pingInterval)
	defer ticker.Stop()

	for range ticker.C {
		pingMsg := map[string]interface{}{
			"type":        MessageTypePing,
			"server_time": GetCurrentServerTime(),
		}

		// Применяем имитацию сетевых условий к ping сообщениям
		if err := s.simulateNetworkConditions(conn, pingMsg); err != nil {
			log.Printf("Error sending ping: %v", err)
			return
		}
	}
}
