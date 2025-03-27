package ws

import (
	"encoding/json"
	"errors"
	"time"
)

// Ошибки при разборе сообщений
var (
	ErrInvalidMessage     = errors.New("invalid message format")
	ErrUnsupportedMessage = errors.New("unsupported message type")
)

// GetCurrentServerTime возвращает текущее серверное время в миллисекундах
func GetCurrentServerTime() int64 {
	return time.Now().UnixNano() / int64(time.Millisecond)
}

// NewObjectMessage создает новое сообщение о создании объекта
func NewObjectMessage(objectType, id string, x, y, z float32) *ObjectMessage {
	return &ObjectMessage{
		Type:       MessageTypeCreate,
		ID:         id,
		ObjectType: objectType,
		X:          x,
		Y:          y,
		Z:          z,
		ServerTime: GetCurrentServerTime(),
	}
}

// NewUpdateMessage создает новое сообщение об обновлении объекта
func NewUpdateMessage(id string, x, y, z, qx, qy, qz, qw float32) *ObjectMessage {
	return &ObjectMessage{
		Type:       MessageTypeUpdate,
		ID:         id,
		X:          x,
		Y:          y,
		Z:          z,
		QX:         qx,
		QY:         qy,
		QZ:         qz,
		QW:         qw,
		ServerTime: GetCurrentServerTime(),
	}
}

// NewPongMessage создает новое сообщение-ответ на пинг
func NewPongMessage(clientTime int64) *PongMessage {
	return &PongMessage{
		Type:       MessageTypePong,
		ClientTime: clientTime,
		ServerTime: GetCurrentServerTime(),
	}
}

// NewAckMessage создает новое сообщение-подтверждение команды
func NewAckMessage(cmd string, clientTime int64) *AckMessage {
	return &AckMessage{
		Type:       MessageTypeAck,
		Cmd:        cmd,
		ClientTime: clientTime,
		ServerTime: GetCurrentServerTime(),
	}
}

// NewInfoMessage создает новое информационное сообщение
func NewInfoMessage(message string) *InfoMessage {
	return &InfoMessage{
		Type:    MessageTypeInfo,
		Message: message,
	}
}

// ParseMessage разбирает сырые данные в соответствующую структуру сообщения
func ParseMessage(data []byte) (interface{}, error) {
	// Сначала получаем тип сообщения
	var baseMsg struct {
		Type string `json:"type"`
	}

	if err := json.Unmarshal(data, &baseMsg); err != nil {
		return nil, ErrInvalidMessage
	}

	// В зависимости от типа, десериализуем в соответствующую структуру
	switch baseMsg.Type {
	case MessageTypeCreate, MessageTypeUpdate:
		var msg ObjectMessage
		if err := json.Unmarshal(data, &msg); err != nil {
			return nil, err
		}
		return &msg, nil

	case MessageTypeCommand:
		var msg CommandMessage
		if err := json.Unmarshal(data, &msg); err != nil {
			return nil, err
		}
		return &msg, nil

	case MessageTypePing:
		var msg PingMessage
		if err := json.Unmarshal(data, &msg); err != nil {
			return nil, err
		}
		return &msg, nil

	case MessageTypeAck:
		var msg AckMessage
		if err := json.Unmarshal(data, &msg); err != nil {
			return nil, err
		}
		return &msg, nil

	case MessageTypePong:
		var msg PongMessage
		if err := json.Unmarshal(data, &msg); err != nil {
			return nil, err
		}
		return &msg, nil

	case MessageTypeInfo:
		var msg InfoMessage
		if err := json.Unmarshal(data, &msg); err != nil {
			return nil, err
		}
		return &msg, nil

	default:
		return nil, ErrUnsupportedMessage
	}
}
