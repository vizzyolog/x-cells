package ws

import (
	"context"
	"encoding/json"
	"log"
	"math"
	"net/http"
	"time"

	"github.com/gorilla/websocket"

	pb "x-cells/backend/internal/physics/generated"
	"x-cells/backend/internal/transport"
	"x-cells/backend/internal/world"
)

const (
	DefaultUpdateInterval = 300 * time.Millisecond // Интервал отправки обновлений
	DefaultPingInterval   = 2 * time.Second        // Интервал отправки пингов
)

type ObjectManager interface {
	GetAllWorldObjects() []*world.WorldObject
	GetObject(id string) (*world.WorldObject, bool)
	UpdateObjectPosition(id string, position world.Vector3)
	UpdateObjectRotation(id string, rotation world.Quaternion)
}

// MessageHandler - тип функции обработчика сообщений
type MessageHandler func(conn *SafeWriter, message interface{}) error

// WSServer представляет WebSocket сервер с поддержкой потокобезопасной записи
type WSServer struct {
	upgrader           websocket.Upgrader
	objectManager      ObjectManager
	physics            transport.IPhysicsClient
	handlers           map[string]MessageHandler
	connectionHandlers []func(conn *SafeWriter)
	pingInterval       time.Duration
	serializer         *WorldSerializer
}

// NewWSServer создает новый экземпляр WebSocket сервера
func NewWSServer(objectManager ObjectManager, physics transport.IPhysicsClient, serialaizer *WorldSerializer) *WSServer {
	server := &WSServer{
		upgrader: websocket.Upgrader{
			CheckOrigin: func(r *http.Request) bool { return true },
		},
		objectManager:      objectManager,
		physics:            physics,
		handlers:           make(map[string]MessageHandler),
		connectionHandlers: []func(conn *SafeWriter){},
		pingInterval:       DefaultPingInterval,
		serializer:         serialaizer,
	}

	// Регистрируем стандартные обработчики
	server.RegisterHandler(MessageTypePing, server.handlePing)
	server.RegisterHandler(MessageTypeCommand, server.handleCmd)

	return server
}

// RegisterHandler регистрирует обработчик для конкретного типа сообщений
func (s *WSServer) RegisterHandler(messageType string, handler MessageHandler) {
	s.handlers[messageType] = handler
}

// OnConnection регистрирует функцию, которая будет вызвана при новом соединении
func (s *WSServer) OnConnection(handler func(conn *SafeWriter)) {
	s.connectionHandlers = append(s.connectionHandlers, handler)
}

// SetPingInterval устанавливает интервал отправки пингов
func (s *WSServer) SetPingInterval(interval time.Duration) {
	s.pingInterval = interval
}

// HandleWS обрабатывает входящие WebSocket соединения
func (s *WSServer) HandleWS(w http.ResponseWriter, r *http.Request) {
	conn, err := s.upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("Websocket upgrade error: %v", err)
		return
	}

	// Создаем потокобезопасную обертку для WebSocket соединения
	safeConn := NewSafeWriter(conn)
	defer safeConn.Close()

	log.Printf("New WebSocket connection established from %s", conn.RemoteAddr())

	// Отправляем приветственное сообщение
	if err := safeConn.WriteJSON(NewInfoMessage("Successfully connected to X-Cells server")); err != nil {
		log.Printf("Error sending welcome message: %v", err)
		return
	}

	// Отправляем клиенту конфигурацию физики перед созданием объектов
	s.sendPhysicsConfig(safeConn)

	// Теперь отправляем объекты
	if err := s.serializer.SendCreateForAllObjects(safeConn); err != nil {
		log.Printf("[Go] Ошибка при отправке существующих объектов: %v", err)
		return
	}

	// Запускаем пинг для поддержания соединения
	if s.pingInterval > 0 {
		go s.startPing(safeConn)
	}

	// Вызываем все обработчики новых соединений
	for _, handler := range s.connectionHandlers {
		handler(safeConn)
	}

	go s.startClientStreaming(safeConn)

	s.handlers[MessageTypeMove] = s.handleCmd
	// Основной цикл обработки сообщений
	for {
		_, data, err := conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("WebSocket error: %v", err)
			}
			break
		}

		// Разбираем сообщение
		message, err := ParseMessage(data)
		if err != nil {
			log.Printf("Error parsing message: %v", err)
			continue
		}

		// Получаем тип сообщения
		var messageType string
		switch msg := message.(type) {
		case *ObjectMessage:
			messageType = msg.Type
		case *CommandMessage:
			messageType = msg.Type
		case *PingMessage:
			messageType = msg.Type
		case *AckMessage:
			messageType = msg.Type
		case *PongMessage:
			messageType = msg.Type
		case *InfoMessage:
			messageType = msg.Type
		default:
			log.Printf("Unknown message type: %T", message)
			continue
		}

		// Ищем обработчик для данного типа сообщений
		if handler, ok := s.handlers[messageType]; ok {
			if err := handler(safeConn, message); err != nil {
				log.Printf("Error handling message %s: %v", messageType, err)
			}
		} else {
			log.Printf("No handler registered for message type: %s", messageType)
		}
	}

	log.Printf("WebSocket connection closed: %s", conn.RemoteAddr())
}

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

		log.Printf("[Go] Получен вектор направления: (%f, %f, %f), расстояние: %f",
			direction.X, direction.Y, direction.Z, direction.Distance)

		// Используем настройки из конфигурации физики
		physicsConfig := world.GetPhysicsConfig()

		// Создаем импульс в направлении X, Y и Z с учетом полученного вектора
		impulse.X = direction.X * physicsConfig.BaseImpulse
		impulse.Y = direction.Y * physicsConfig.BaseImpulse
		impulse.Z = direction.Z * physicsConfig.BaseImpulse

		// Добавляем логирование для отладки
		log.Printf("[Go] Импульсы: X=%f, Y=%f, Z=%f", impulse.X, impulse.Y, impulse.Z)

	default:
		log.Printf("[Go] Неизвестная команда: %s", cmdMsg.Cmd)
		return nil
	}

	// Получаем все объекты из менеджера мира
	worldObjects := s.objectManager.GetAllWorldObjects()

	// Счетчик успешно обработанных объектов
	successCount := 0

	// Применяем импульс ко всем объектам, кроме типа ammo
	for _, obj := range worldObjects {
		// Пропускаем объекты, которые обрабатываются только на клиенте
		if obj.PhysicsType == world.PhysicsTypeAmmo {
			continue
		}

		if obj.ID == "terrain_1" {
			continue
		}

		// Применяем импульс к объекту через Bullet Physics
		_, err := s.physics.ApplyImpulse(context.Background(), &pb.ApplyImpulseRequest{
			Id:      obj.ID,
			Impulse: &impulse,
		})

		if err != nil {
			log.Printf("[Go] Ошибка применения импульса к %s: %v", obj.ID, err)
			continue
		}

		successCount++
		log.Printf("[Go] Применен импульс к %s: (%f, %f, %f)",
			obj.ID, impulse.X, impulse.Y, impulse.Z)
	}

	log.Printf("[Go] Применен импульс к %d объектам с типами физики bullet и both", successCount)

	// Отправляем подтверждение обработки команды с временными метками
	ackMsg := NewAckMessage(cmdMsg.Cmd, cmdMsg.ClientTime)
	return conn.WriteJSON(ackMsg)
}

// Стандартный обработчик ping-сообщений
func (s *WSServer) handlePing(conn *SafeWriter, message interface{}) error {
	pingMsg, ok := message.(*PingMessage)
	if !ok {
		return ErrInvalidMessage
	}

	// Отправляем pong в ответ
	return conn.WriteJSON(NewPongMessage(pingMsg.ClientTime))
}

// Запускает периодическую отправку пингов для проверки соединения
func (s *WSServer) startPing(conn *SafeWriter) {
	ticker := time.NewTicker(s.pingInterval)
	defer ticker.Stop()

	for range ticker.C {
		pingMsg := map[string]interface{}{
			"type":        MessageTypePing,
			"server_time": GetCurrentServerTime(),
		}

		if err := conn.WriteJSON(pingMsg); err != nil {
			log.Printf("Error sending ping: %v", err)
			return
		}
	}
}

func (s *WSServer) startClientStreaming(wsWriter *SafeWriter) {
	ticker := time.NewTicker(DefaultUpdateInterval)
	defer ticker.Stop()

	for range ticker.C {
		// Получаем список всех объектов из мира
		worldObjects := s.objectManager.GetAllWorldObjects()

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

			// Отправляем обновление позиции и вращения клиенту
			if err := s.serializer.SendUpdateForObject(wsWriter, obj.ID, position, rotation); err != nil {
				log.Printf("[Go] Ошибка отправки обновления для %s: %v", obj.ID, err)
			}

			// Дополнительно отправляем скорость, если она есть в ответе от сервера
			if resp.State.LinearVelocity != nil {
				velocity := map[string]interface{}{
					"type":             "update",
					"id":               obj.ID,
					"server_time":      GetCurrentServerTime(),
					"server_send_time": time.Now().UnixMilli(),
					"objects": map[string]interface{}{
						obj.ID: map[string]interface{}{
							"velocity": map[string]float32{
								"x": resp.State.LinearVelocity.X,
								"y": resp.State.LinearVelocity.Y,
								"z": resp.State.LinearVelocity.Z,
							},
						},
					},
				}

				// Вычисляем общую скорость для логирования
				speed := float32(math.Sqrt(float64(
					resp.State.LinearVelocity.X*resp.State.LinearVelocity.X +
						resp.State.LinearVelocity.Y*resp.State.LinearVelocity.Y +
						resp.State.LinearVelocity.Z*resp.State.LinearVelocity.Z)))

				// Логируем отправку скорости только для основного игрока (чтобы не загрязнять лог)
				if obj.ID == "mainPlayer1" {
					log.Printf("[Go] Отправка данных о скорости %s: (%f, %f, %f), скорость: %f м/с",
						obj.ID, resp.State.LinearVelocity.X, resp.State.LinearVelocity.Y, resp.State.LinearVelocity.Z, speed)
				}

				if err := wsWriter.WriteJSON(velocity); err != nil {
					log.Printf("[Go] Ошибка отправки скорости для %s: %v", obj.ID, err)
				}
			}
		}
	}
}

// Добавляем новый обработчик для отправки конфигурации физики клиенту
func (s *WSServer) sendPhysicsConfig(conn *SafeWriter) {
	physicsConfig := world.GetPhysicsConfig()

	configMessage := map[string]interface{}{
		"type":   "physics_config",
		"config": physicsConfig,
	}

	if err := conn.WriteJSON(configMessage); err != nil {
		log.Printf("[Go] Ошибка отправки конфигурации физики: %v", err)
	} else {
		log.Printf("[Go] Конфигурация физики отправлена клиенту")
	}
}
