package ws

import (
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/gorilla/websocket"

	"x-cells/backend/internal/transport"
	"x-cells/backend/internal/world"
)

const (
	DefaultUpdateInterval = 50 * time.Millisecond // Интервал отправки обновлений
	DefaultPingInterval   = 2 * time.Second       // Интервал отправки пингов
)

type ObjectManager interface {
	GetAllWorldObjects() []*world.WorldObject
	GetObject(id string) (*world.WorldObject, bool)
	UpdateObjectPosition(id string, position world.Vector3)
	UpdateObjectRotation(id string, rotation world.Quaternion)
	AddWorldObject(obj *world.WorldObject)
	RemoveObject(id string)
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

	// Управление игроками
	players   map[string]*PlayerConnection // connectionID -> PlayerConnection
	playersMu sync.RWMutex                 // мьютекс для безопасного доступа к игрокам
	factory   *world.Factory               // фабрика для создания объектов

	// Очередь создания игроков
	playerQueue   chan *PlayerCreationRequest // очередь запросов на создание игроков
	queueWorkerMu sync.Mutex                  // мьютекс для worker'а очереди

	// Имитация сетевых условий
	networkSim      NetworkSimulation
	delayedMessages chan DelayedMessage
	simMu           sync.RWMutex // мьютекс для настроек симуляции

	// === НОВОЕ: Поддержка системы еды ===
	foodSystem interface{} // Ссылка на систему еды (интерфейс для гибкости)

	// === НОВОЕ: Поддержка GameTicker ===
	gameTicker interface{} // Ссылка на GameTicker для управления игроками
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

		// Управление игроками
		players:   make(map[string]*PlayerConnection),
		playersMu: sync.RWMutex{},

		// Очередь создания игроков
		playerQueue:   make(chan *PlayerCreationRequest, 100),
		queueWorkerMu: sync.Mutex{},
	}

	// Создаем factory после инициализации сервера
	// Нужно привести objectManager к типу *world.Manager
	if manager, ok := objectManager.(*world.Manager); ok {
		server.factory = world.NewFactory(manager, physics)
		// Устанавливаем factory в manager для обратного доступа
		manager.SetFactory(server.factory)
	} else {
		log.Printf("[WSServer] Предупреждение: objectManager не является *world.Manager, factory не создан")
	}

	// Регистрируем стандартные обработчики
	server.RegisterHandler(MessageTypePing, server.handlePing)
	server.RegisterHandler(MessageTypeCommand, server.handleCmd)

	// Запускаем обработчик отложенных сообщений
	go server.processDelayedMessages()

	// Запускаем worker для обработки очереди создания игроков
	go server.playerCreationWorker()

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
	defer func() {
		// Удаляем игрока при закрытии соединения
		s.removePlayer(safeConn)
		safeConn.Close()
	}()

	log.Printf("New WebSocket connection established from %s", conn.RemoteAddr())

	// Отправляем приветственное сообщение
	if err := safeConn.WriteJSON(NewInfoMessage("Successfully connected to X-Cells server")); err != nil {
		log.Printf("Error sending welcome message: %v", err)
		return
	}

	// Отправляем клиенту конфигурацию физики перед созданием объектов
	s.sendPhysicsConfig(safeConn)

	// Теперь отправляем существующие объекты
	if err := s.serializer.SendCreateForAllObjects(safeConn); err != nil {
		log.Printf("[Go] Ошибка при отправке существующих объектов: %v", err)
		return
	}

	// Создаем нового игрока через очередь для избежания гонок
	request := &PlayerCreationRequest{
		Conn:     safeConn,
		Response: make(chan *PlayerCreationResponse, 1),
	}

	// Отправляем запрос в очередь
	select {
	case s.playerQueue <- request:
		// Ждем ответа
		select {
		case response := <-request.Response:
			if response.Error != nil {
				log.Printf("[WSServer] Ошибка создания игрока: %v", response.Error)
				return
			}
			player := response.Player

			// Отправляем информацию о новом объекте игрока существующим клиентам
			s.playersMu.RLock()
			for _, existingPlayer := range s.players {
				if err := s.serializer.SendCreateForObject(existingPlayer.Conn, player.ObjectID); err != nil {
					log.Printf("[WSServer] Ошибка отправки объекта игрока %s клиенту %s: %v", player.ObjectID, existingPlayer.ID, err)
				}
			}
			s.playersMu.RUnlock()

			// Добавляем игрока в карту ПОСЛЕ отправки существующим клиентам
			s.playersMu.Lock()
			s.players[player.ID] = player
			s.playersMu.Unlock()

			// Отправляем новому игроку информацию о его объекте
			if err := s.serializer.SendCreateForObject(safeConn, player.ObjectID); err != nil {
				log.Printf("[WSServer] Ошибка отправки объекта игрока %s новому клиенту: %v", player.ObjectID, err)
			}

		case <-time.After(10 * time.Second):
			log.Printf("[WSServer] Таймаут создания игрока")
			return
		}
	case <-time.After(5 * time.Second):
		log.Printf("[WSServer] Очередь создания игроков переполнена")
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

// Start запускает сервер обновлений
func (s *WSServer) Start() {
	// Запускаем горутину для регулярного применения импульсов
	go s.applyImpulses()

	// Запускаем HTTP сервер
	http.HandleFunc("/ws", s.HandleWS)
	log.Printf("[Go] WebSocket сервер запущен на /ws")
}

// === МЕТОДЫ ДЛЯ РАБОТЫ С СИСТЕМОЙ ЕДЫ ===

// SetFoodSystem устанавливает ссылку на систему еды
func (s *WSServer) SetFoodSystem(foodSystem interface{}) {
	s.foodSystem = foodSystem
}

// SetGameTicker устанавливает ссылку на GameTicker
func (s *WSServer) SetGameTicker(gameTicker interface{}) {
	s.gameTicker = gameTicker
}

// BroadcastFoodConsumed отправляет всем клиентам событие поедания еды
func (s *WSServer) BroadcastFoodConsumed(playerID, foodID string, massGain float64) {
	message := map[string]interface{}{
		"type":      "food_consumed",
		"player_id": playerID,
		"food_id":   foodID,
		"mass_gain": massGain,
	}

	s.playersMu.RLock()
	defer s.playersMu.RUnlock()

	for _, player := range s.players {
		if err := player.Conn.WriteJSON(message); err != nil {
			log.Printf("[WSServer] Ошибка отправки события поедания еды игроку %s: %v", player.ID, err)
		}
	}

	log.Printf("[WSServer] Отправлено событие поедания еды: игрок %s съел %s (+%.1f массы)",
		playerID, foodID, massGain)
}

// BroadcastFoodState отправляет всем клиентам текущее состояние еды
func (s *WSServer) BroadcastFoodState(foodItems interface{}) {
	message := map[string]interface{}{
		"type": "food_state",
		"food": foodItems,
	}

	s.playersMu.RLock()
	defer s.playersMu.RUnlock()

	for _, player := range s.players {
		if err := player.Conn.WriteJSON(message); err != nil {
			log.Printf("[WSServer] Ошибка отправки состояния еды игроку %s: %v", player.ID, err)
		}
	}
}

// BroadcastFoodSpawned отправляет всем клиентам событие создания новой еды
func (s *WSServer) BroadcastFoodSpawned(food interface{}) {
	message := map[string]interface{}{
		"type":      "food_spawned",
		"food_item": food,
	}

	s.playersMu.RLock()
	defer s.playersMu.RUnlock()

	for _, player := range s.players {
		if err := player.Conn.WriteJSON(message); err != nil {
			log.Printf("[WSServer] Ошибка отправки события создания еды игроку %s: %v", player.ID, err)
		}
	}
}

// BroadcastPlayerSizeUpdate отправляет всем клиентам обновление размера игрока
func (s *WSServer) BroadcastPlayerSizeUpdate(playerID string, newRadius float64, newMass float64) {
	message := map[string]interface{}{
		"type":       "player_size_update",
		"player_id":  playerID,
		"new_radius": newRadius,
		"new_mass":   newMass,
	}

	s.playersMu.RLock()
	defer s.playersMu.RUnlock()

	for _, player := range s.players {
		if err := player.Conn.WriteJSON(message); err != nil {
			log.Printf("[WSServer] Ошибка отправки обновления размера игрока %s: %v", player.ID, err)
		}
	}

	log.Printf("[WSServer] Отправлено обновление размера игрока %s: радиус %.2f, масса %.2f",
		playerID, newRadius, newMass)
}
