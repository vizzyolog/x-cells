package ws

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"math"
	"math/rand"
	"net/http"
	"reflect"
	"sync"
	"time"

	"github.com/gorilla/websocket"

	pb "x-cells/backend/internal/physics/generated"
	"x-cells/backend/internal/transport"
	"x-cells/backend/internal/world"
)

const (
	DefaultUpdateInterval = 50 * time.Millisecond // Интервал отправки обновлений
	DefaultPingInterval   = 2 * time.Second       // Интервал отправки пингов
)

// NetworkSimulation - настройки для имитации сетевых условий
type NetworkSimulation struct {
	Enabled         bool          // Включена ли имитация
	BaseLatency     time.Duration // Базовая задержка
	LatencyVariance time.Duration // Вариация задержки (jitter)
	PacketLoss      float64       // Процент потери пакетов (0.0 - 1.0)
	BandwidthLimit  int           // Ограничение пропускной способности (байт/сек)
}

// DelayedMessage - сообщение с задержкой
type DelayedMessage struct {
	conn    *SafeWriter
	message interface{}
	sendAt  time.Time
}

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
	controllerStates   map[string]*ControllerState // id -> controller state
	impulseInterval    time.Duration               // интервал применения импульса
	mu                 sync.RWMutex                // мьютекс для безопасного доступа к состояниям

	// Имитация сетевых условий
	networkSim      NetworkSimulation
	delayedMessages chan DelayedMessage
	simMu           sync.RWMutex // мьютекс для настроек симуляции
}

// Структура для хранения данных контроллера
type ControllerState struct {
	LastUpdate time.Time
	Force      struct {
		X float32
		Y float32
		Z float32
	}
}

// Структура команды от клиента
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
		controllerStates:   make(map[string]*ControllerState),
		impulseInterval:    time.Millisecond * 50, // 50ms = 20 раз в секунду
		mu:                 sync.RWMutex{},

		// Инициализация имитации сети
		networkSim: NetworkSimulation{
			Enabled:         false, // По умолчанию выключена
			BaseLatency:     0,
			LatencyVariance: 0,
			PacketLoss:      0.0,
			BandwidthLimit:  0,
		},
		delayedMessages: make(chan DelayedMessage, 1000),
		simMu:           sync.RWMutex{},
	}

	// Регистрируем стандартные обработчики
	server.RegisterHandler(MessageTypePing, server.handlePing)
	server.RegisterHandler(MessageTypeCommand, server.handleCmd)

	// Запускаем обработчик отложенных сообщений
	go server.processDelayedMessages()

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

	// Обновляем состояние контроллера
	s.mu.Lock()
	if state, exists := s.controllerStates[cmdMsg.ObjectID]; exists {
		state.LastUpdate = time.Now()

		// Получаем данные о силе из Data
		if forceData, ok := cmdMsg.Data.(map[string]interface{}); ok {
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

		// Получаем данные о силе из Data
		if forceData, ok := cmdMsg.Data.(map[string]interface{}); ok {
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

		s.controllerStates[cmdMsg.ObjectID] = state
	}
	s.mu.Unlock()

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
	return s.simulateNetworkConditions(conn, ackMsg)
}

// Стандартный обработчик ping-сообщений
func (s *WSServer) handlePing(conn *SafeWriter, message interface{}) error {
	pingMsg, ok := message.(*PingMessage)
	if !ok {
		return ErrInvalidMessage
	}

	// Отправляем pong в ответ с применением имитации сетевых условий
	pongMessage := NewPongMessage(pingMsg.ClientTime)
	return s.simulateNetworkConditions(conn, pongMessage)
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

		// Применяем имитацию сетевых условий к ping сообщениям
		if err := s.simulateNetworkConditions(conn, pingMsg); err != nil {
			log.Printf("Error sending ping: %v", err)
			return
		}
	}
}

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

// Добавляем новый обработчик для отправки конфигурации физики клиенту
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

// Запуск сервера
func (s *WSServer) Start() {
	// Запускаем горутину для регулярного применения импульсов
	go s.applyImpulses()

	// Запускаем HTTP сервер
	http.HandleFunc("/ws", s.HandleWS)
	log.Printf("[Go] WebSocket сервер запущен на /ws")
}

// Регулярное применение импульсов
func (s *WSServer) applyImpulses() {
	ticker := time.NewTicker(s.impulseInterval)
	defer ticker.Stop()

	for range ticker.C {
		s.mu.RLock()
		for id, state := range s.controllerStates {
			// Вычисляем силу импульса с учетом интервала
			impulseForce := float32(s.impulseInterval.Milliseconds()) / 1000.0 // конвертируем в секунды

			// Создаем запрос на применение импульса
			req := &pb.ApplyImpulseRequest{
				Id: id,
				Impulse: &pb.Vector3{
					X: state.Force.X * impulseForce,
					Y: state.Force.Y * impulseForce,
					Z: state.Force.Z * impulseForce,
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

// ============ МЕТОДЫ ДЛЯ ИМИТАЦИИ СЕТЕВЫХ УСЛОВИЙ ============

// SetNetworkSimulation устанавливает параметры имитации сети
func (s *WSServer) SetNetworkSimulation(sim NetworkSimulation) {
	s.simMu.Lock()
	defer s.simMu.Unlock()
	s.networkSim = sim
	log.Printf("[NetworkSim] Настройки обновлены: Enabled=%v, BaseLatency=%v, Variance=%v, PacketLoss=%.2f%%",
		sim.Enabled, sim.BaseLatency, sim.LatencyVariance, sim.PacketLoss*100)
}

// GetNetworkSimulation возвращает текущие настройки имитации
func (s *WSServer) GetNetworkSimulation() NetworkSimulation {
	s.simMu.RLock()
	defer s.simMu.RUnlock()
	return s.networkSim
}

// simulateNetworkConditions применяет имитацию сетевых условий к сообщению
func (s *WSServer) simulateNetworkConditions(conn *SafeWriter, message interface{}) error {
	// Проверяем входные параметры
	if conn == nil {
		return fmt.Errorf("connection is nil")
	}
	if message == nil {
		return fmt.Errorf("message is nil")
	}

	// Дополнительная валидация сообщения
	if !s.isValidMessage(message) {
		log.Printf("[NetworkSim] Попытка отправить невалидное сообщение: %T", message)
		return fmt.Errorf("invalid message format")
	}

	s.simMu.RLock()
	sim := s.networkSim
	s.simMu.RUnlock()

	// Если имитация выключена, отправляем сразу
	if !sim.Enabled {
		return conn.WriteJSON(message)
	}

	// Имитация потери пакетов
	if sim.PacketLoss > 0 && rand.Float64() < sim.PacketLoss {
		log.Printf("[NetworkSim] Пакет потерян (%.1f%% loss rate)", sim.PacketLoss*100)
		return nil // Пакет "потерян"
	}

	// Вычисляем задержку
	delay := sim.BaseLatency
	if sim.LatencyVariance > 0 {
		// Добавляем случайную вариацию (jitter)
		variance := time.Duration(rand.Float64() * float64(sim.LatencyVariance))
		if rand.Float64() < 0.5 {
			variance = -variance
		}
		delay += variance
	}

	// Если задержка нулевая или отрицательная, отправляем сразу
	if delay <= 0 {
		return conn.WriteJSON(message)
	}

	// Отправляем сообщение с задержкой
	delayedMsg := DelayedMessage{
		conn:    conn,
		message: message,
		sendAt:  time.Now().Add(delay),
	}

	select {
	case s.delayedMessages <- delayedMsg:
		return nil
	default:
		log.Printf("[NetworkSim] Буфер отложенных сообщений переполнен, отправляем сразу")
		return conn.WriteJSON(message)
	}
}

// processDelayedMessages обрабатывает отложенные сообщения
func (s *WSServer) processDelayedMessages() {
	for delayedMsg := range s.delayedMessages {
		// Проверяем, что соединение еще активно
		if delayedMsg.conn == nil {
			log.Printf("[NetworkSim] Пропускаем сообщение: соединение nil")
			continue
		}

		// Проверяем, что сообщение не nil
		if delayedMsg.message == nil {
			log.Printf("[NetworkSim] Пропускаем сообщение: message nil")
			continue
		}

		// Дополнительная валидация сообщения
		if !s.isValidMessage(delayedMsg.message) {
			log.Printf("[NetworkSim] Пропускаем невалидное сообщение: %T", delayedMsg.message)
			continue
		}

		// Ждем до времени отправки
		now := time.Now()
		if delayedMsg.sendAt.After(now) {
			time.Sleep(delayedMsg.sendAt.Sub(now))
		}

		// Отправляем сообщение с дополнительной проверкой
		if err := delayedMsg.conn.WriteJSON(delayedMsg.message); err != nil {
			log.Printf("[NetworkSim] Ошибка отправки отложенного сообщения: %v", err)
		}
	}
}

// isValidMessage проверяет, что сообщение может быть безопасно сериализовано в JSON
func (s *WSServer) isValidMessage(message interface{}) bool {
	if message == nil {
		return false
	}

	// Проверяем, что это map[string]interface{} (наш основной тип сообщений)
	if msgMap, ok := message.(map[string]interface{}); ok {
		// Проверяем каждое значение в map
		for _, value := range msgMap {
			if !s.isValidValue(value) {
				log.Printf("[NetworkSim] Невалидное значение для ключа %T", value)
				return false
			}
		}
		return true
	}

	// Для других типов сообщений просто проверяем, что они не nil
	return true
}

// isValidValue проверяет, что значение может быть сериализовано в JSON
func (s *WSServer) isValidValue(value interface{}) bool {
	if value == nil {
		return true // nil значения допустимы в JSON
	}

	// Проверяем на reflect.Value, который может вызвать панику
	if reflect.TypeOf(value).String() == "reflect.Value" {
		log.Printf("[NetworkSim] Обнаружен reflect.Value, пропускаем")
		return false
	}

	switch v := value.(type) {
	case map[string]interface{}:
		// Рекурсивно проверяем вложенные map
		for _, nestedValue := range v {
			if !s.isValidValue(nestedValue) {
				return false
			}
		}
		return true
	case []interface{}:
		// Проверяем элементы массива
		for _, item := range v {
			if !s.isValidValue(item) {
				return false
			}
		}
		return true
	case map[string]float32:
		// Специальная проверка для наших position/rotation/velocity map
		for _, val := range v {
			if math.IsNaN(float64(val)) || math.IsInf(float64(val), 0) {
				log.Printf("[NetworkSim] NaN или Inf значение: %f", val)
				return false
			}
		}
		return true
	case float32:
		return !math.IsNaN(float64(v)) && !math.IsInf(float64(v), 0)
	case float64:
		return !math.IsNaN(v) && !math.IsInf(v, 0)
	default:
		// Для всех остальных типов возвращаем true (разрешаем JSON encoder решать)
		return true
	}
}

// EnableNetworkSimulation включает имитацию с предустановленными профилями
func (s *WSServer) EnableNetworkSimulation(profile string) {
	var sim NetworkSimulation

	switch profile {
	case "mobile_3g":
		sim = NetworkSimulation{
			Enabled:         true,
			BaseLatency:     100 * time.Millisecond,
			LatencyVariance: 50 * time.Millisecond,
			PacketLoss:      0.02, // 2%
		}
	case "mobile_4g":
		sim = NetworkSimulation{
			Enabled:         true,
			BaseLatency:     50 * time.Millisecond,
			LatencyVariance: 20 * time.Millisecond,
			PacketLoss:      0.01, // 1%
		}
	case "wifi_poor":
		sim = NetworkSimulation{
			Enabled:         true,
			BaseLatency:     80 * time.Millisecond,
			LatencyVariance: 40 * time.Millisecond,
			PacketLoss:      0.03, // 3%
		}
	case "wifi_good":
		sim = NetworkSimulation{
			Enabled:         true,
			BaseLatency:     20 * time.Millisecond,
			LatencyVariance: 10 * time.Millisecond,
			PacketLoss:      0.005, // 0.5%
		}
	case "high_latency":
		sim = NetworkSimulation{
			Enabled:         true,
			BaseLatency:     200 * time.Millisecond,
			LatencyVariance: 100 * time.Millisecond,
			PacketLoss:      0.05, // 5%
		}
	case "unstable":
		sim = NetworkSimulation{
			Enabled:         true,
			BaseLatency:     60 * time.Millisecond,
			LatencyVariance: 80 * time.Millisecond,
			PacketLoss:      0.04, // 4%
		}
	default:
		sim = NetworkSimulation{Enabled: false}
	}

	s.SetNetworkSimulation(sim)
}
