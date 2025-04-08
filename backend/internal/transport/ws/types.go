/*
Этот файл больше не используется после перехода на гексагональную архитектуру.
Функциональность перемещена в backend/internal/adapter/in/ws.

package ws

// MessageTypes определяет типы сообщений, используемые в WebSocket протоколе
const (
	MessageTypeCommand = "command" // Команда от клиента
	MessageTypeObject  = "object"  // Объектное сообщение
	MessageTypePing    = "ping"    // Ping-сообщение
	MessageTypePong    = "pong"    // Pong-сообщение
	MessageTypeAck     = "ack"     // Подтверждение
	MessageTypeInfo    = "info"    // Информационное сообщение
	MessageTypeMove    = "move"    // Движение объекта
)

// ErrInvalidMessage - ошибка, возвращаемая при неверном формате сообщения
var ErrInvalidMessage = &WSError{Code: 400, Message: "Invalid message format"}

// WSError представляет ошибку WebSocket
type WSError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

// Error реализует интерфейс error
func (e *WSError) Error() string {
	return e.Message
}

// CommandMessage представляет команду, отправленную клиентом
type CommandMessage struct {
	Type       string      `json:"type"`
	Cmd        string      `json:"cmd"`
	Data       interface{} `json:"data,omitempty"`
	ClientTime float64     `json:"clientTime"`
}

// ObjectMessage представляет сообщение об объекте
type ObjectMessage struct {
	Type       string      `json:"type"`
	ID         string      `json:"id"`
	X          float32     `json:"x"`
	Y          float32     `json:"y"`
	Z          float32     `json:"z"`
	Data       interface{} `json:"data,omitempty"`
	ClientTime float64     `json:"clientTime,omitempty"`
}

// PingMessage представляет ping-сообщение
type PingMessage struct {
	Type       string  `json:"type"`
	ClientTime float64 `json:"clientTime"`
}

// PongMessage представляет pong-сообщение
type PongMessage struct {
	Type        string  `json:"type"`
	ClientTime  float64 `json:"clientTime"`
	ServerTime  float64 `json:"serverTime"`
	ServerDelay float64 `json:"serverDelay,omitempty"`
}

// AckMessage представляет сообщение подтверждения
type AckMessage struct {
	Type        string  `json:"type"`
	MessageID   string  `json:"messageId"`
	Status      string  `json:"status"`
	ClientTime  float64 `json:"clientTime,omitempty"`
	ServerTime  float64 `json:"serverTime,omitempty"`
	ServerDelay float64 `json:"serverDelay,omitempty"`
}

// InfoMessage представляет информационное сообщение
type InfoMessage struct {
	Type    string `json:"type"`
	Message string `json:"message"`
}

// NewInfoMessage создает новое информационное сообщение
func NewInfoMessage(message string) *InfoMessage {
	return &InfoMessage{
		Type:    MessageTypeInfo,
		Message: message,
	}
}
*/
