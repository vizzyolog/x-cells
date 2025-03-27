package ws

import (
	"log"
	"net/http"
	"time"

	"github.com/gorilla/websocket"

	"x-cells/backend/internal/transport"
)

// ObjectManager описывает интерфейс для работы с объектами
type ObjectManager interface {
	// Методы, необходимые для работы с объектами
}

// MessageHandler - тип функции обработчика сообщений
type MessageHandler func(conn *SafeWriter, message interface{}) error

// WSServer представляет WebSocket сервер с поддержкой потокобезопасной записи
type WSServer struct {
	upgrader           websocket.Upgrader
	objectManager      ObjectManager
	physics            *transport.PhysicsClient
	handlers           map[string]MessageHandler
	connectionHandlers []func(conn *SafeWriter)
	pingInterval       time.Duration
}

// NewWSServer создает новый экземпляр WebSocket сервера
func NewWSServer(objectManager ObjectManager, physics *transport.PhysicsClient) *WSServer {
	server := &WSServer{
		upgrader: websocket.Upgrader{
			CheckOrigin: func(r *http.Request) bool { return true },
		},
		objectManager:      objectManager,
		physics:            physics,
		handlers:           make(map[string]MessageHandler),
		connectionHandlers: []func(conn *SafeWriter){},
		pingInterval:       DefaultPingInterval,
	}

	// Регистрируем стандартные обработчики
	server.RegisterHandler(MessageTypePing, server.handlePing)

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

	// Запускаем пинг для поддержания соединения
	if s.pingInterval > 0 {
		go s.startPing(safeConn)
	}

	// Вызываем все обработчики новых соединений
	for _, handler := range s.connectionHandlers {
		handler(safeConn)
	}

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
