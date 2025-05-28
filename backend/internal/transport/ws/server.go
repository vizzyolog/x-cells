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

// Запуск сервера
func (s *WSServer) Start() {
	// Запускаем горутину для регулярного применения импульсов
	go s.applyImpulses()

	// Запускаем HTTP сервер
	http.HandleFunc("/ws", s.HandleWS)
	log.Printf("[Go] WebSocket сервер запущен на /ws")
}
