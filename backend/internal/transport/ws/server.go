package ws

import (
	"fmt"
	"log"
	"math/rand/v2"
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

// PlayerConnection представляет подключенного игрока
type PlayerConnection struct {
	ID       string      // Уникальный ID подключения
	ObjectID string      // ID объекта игрока в мире
	Conn     *SafeWriter // WebSocket соединение
	JoinTime time.Time   // Время подключения
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

		// Управление игроками
		players:   make(map[string]*PlayerConnection),
		playersMu: sync.RWMutex{},
	}

	// Создаем factory после инициализации сервера
	// Нужно привести objectManager к типу *world.Manager
	if manager, ok := objectManager.(*world.Manager); ok {
		server.factory = world.NewFactory(manager, physics)
	} else {
		log.Printf("[WSServer] Предупреждение: objectManager не является *world.Manager, factory не создан")
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

	// Создаем нового игрока для этого подключения
	player, err := s.addPlayer(safeConn)
	if err != nil {
		log.Printf("[WSServer] Ошибка создания игрока: %v", err)
		return
	}

	// Отправляем новый объект игрока всем клиентам (включая самого игрока)
	if err := s.serializer.SendCreateForObject(safeConn, player.ObjectID); err != nil {
		log.Printf("[WSServer] Ошибка отправки объекта игрока %s: %v", player.ObjectID, err)
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

// Запуск сервера
func (s *WSServer) Start() {
	// Запускаем горутину для регулярного применения импульсов
	go s.applyImpulses()

	// Запускаем HTTP сервер
	http.HandleFunc("/ws", s.HandleWS)
	log.Printf("[Go] WebSocket сервер запущен на /ws")
}

// generatePlayerID генерирует уникальный ID для игрока
func (s *WSServer) generatePlayerID() string {
	return fmt.Sprintf("player_%d_%d", time.Now().UnixNano(), rand.IntN(10000))
}

// generatePlayerObjectID генерирует уникальный ID для объекта игрока
func (s *WSServer) generatePlayerObjectID(playerID string) string {
	s.playersMu.RLock()
	playerCount := len(s.players)
	s.playersMu.RUnlock()

	// Первый игрок всегда получает ID mainPlayer1 для совместимости с фронтом
	if playerCount == 0 {
		return "mainPlayer1"
	}

	// Остальные игроки получают динамические ID
	return fmt.Sprintf("player_obj_%s", playerID)
}

// createPlayerObject создает объект игрока в мире
func (s *WSServer) createPlayerObject(playerID, objectID string) error {
	if s.factory == nil {
		return fmt.Errorf("factory не инициализирован")
	}

	// Получаем максимальную высоту террейна для размещения игрока
	terrainMaxHeight := float32(30.0) // Используем константу из test_objects.go

	var spawnX, spawnZ float32
	var color string

	// Первый игрок (mainPlayer1) появляется в центре карты
	if objectID == "mainPlayer1" {
		spawnX = 0
		spawnZ = 0
		color = "#ff00ff" // Пурпурный цвет как раньше
	} else {
		// Остальные игроки появляются в случайных позициях
		spawnX = float32(rand.IntN(40) - 20) // от -20 до 20
		spawnZ = float32(rand.IntN(40) - 20) // от -20 до 20

		// Генерируем случайный цвет для остальных игроков
		colors := []string{"#ff0000", "#00ff00", "#0000ff", "#ffff00", "#00ffff", "#ffa500", "#800080"}
		color = colors[rand.IntN(len(colors))]
	}

	spawnY := terrainMaxHeight + 50

	// Создаем сферу игрока
	playerSphere := world.NewSphere(
		objectID,
		world.Vector3{X: spawnX, Y: spawnY, Z: spawnZ},
		3.0,  // Радиус
		30.0, // Масса
		color,
		world.PhysicsTypeBoth, // Физика и на клиенте, и на сервере
	)

	// Создаем объект в клиентской физике (Ammo)
	if err := s.factory.CreateObjectInAmmo(playerSphere); err != nil {
		log.Printf("[WSServer] Ошибка при создании объекта игрока %s в Ammo: %v", objectID, err)
		return err
	}

	// Создаем объект в серверной физике (Bullet)
	if err := s.factory.CreateObjectBullet(playerSphere); err != nil {
		log.Printf("[WSServer] Ошибка при создании объекта игрока %s в Bullet: %v", objectID, err)
		return err
	}

	log.Printf("[WSServer] Создан объект игрока %s для игрока %s в позиции (%.2f, %.2f, %.2f)",
		objectID, playerID, spawnX, spawnY, spawnZ)

	return nil
}

// removePlayerObject удаляет объект игрока из мира
func (s *WSServer) removePlayerObject(objectID string) error {
	// Удаляем объект из менеджера мира
	s.objectManager.RemoveObject(objectID)

	// TODO: Добавить удаление из Bullet Physics когда будет доступен соответствующий метод

	log.Printf("[WSServer] Удален объект игрока %s", objectID)
	return nil
}

// addPlayer добавляет нового игрока при подключении
func (s *WSServer) addPlayer(conn *SafeWriter) (*PlayerConnection, error) {
	playerID := s.generatePlayerID()
	objectID := s.generatePlayerObjectID(playerID)

	// Создаем объект игрока в мире
	if err := s.createPlayerObject(playerID, objectID); err != nil {
		return nil, fmt.Errorf("ошибка создания объекта игрока: %v", err)
	}

	// Создаем структуру игрока
	player := &PlayerConnection{
		ID:       playerID,
		ObjectID: objectID,
		Conn:     conn,
		JoinTime: time.Now(),
	}

	// Добавляем игрока в карту
	s.playersMu.Lock()
	s.players[playerID] = player
	s.playersMu.Unlock()

	log.Printf("[WSServer] Добавлен игрок %s с объектом %s", playerID, objectID)

	// Отправляем клиенту информацию о его объекте
	infoMsg := NewInfoMessage(fmt.Sprintf("Вы подключены как игрок %s, ваш объект: %s", playerID, objectID))
	if err := conn.WriteJSON(infoMsg); err != nil {
		log.Printf("[WSServer] Ошибка отправки информации игроку %s: %v", playerID, err)
	}

	return player, nil
}

// removePlayer удаляет игрока при отключении
func (s *WSServer) removePlayer(conn *SafeWriter) {
	s.playersMu.Lock()
	defer s.playersMu.Unlock()

	// Ищем игрока по соединению
	var playerToRemove *PlayerConnection
	var playerIDToRemove string

	for playerID, player := range s.players {
		if player.Conn == conn {
			playerToRemove = player
			playerIDToRemove = playerID
			break
		}
	}

	if playerToRemove == nil {
		log.Printf("[WSServer] Игрок для удаления не найден")
		return
	}

	// Удаляем объект игрока из мира
	if err := s.removePlayerObject(playerToRemove.ObjectID); err != nil {
		log.Printf("[WSServer] Ошибка удаления объекта игрока %s: %v", playerToRemove.ObjectID, err)
	}

	// Удаляем игрока из карты
	delete(s.players, playerIDToRemove)

	log.Printf("[WSServer] Удален игрок %s с объектом %s", playerIDToRemove, playerToRemove.ObjectID)
}

// getPlayerByConnection возвращает игрока по соединению
func (s *WSServer) getPlayerByConnection(conn *SafeWriter) *PlayerConnection {
	s.playersMu.RLock()
	defer s.playersMu.RUnlock()

	for _, player := range s.players {
		if player.Conn == conn {
			return player
		}
	}
	return nil
}
