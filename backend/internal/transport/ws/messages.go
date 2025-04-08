/*
Этот файл больше не используется после перехода на гексагональную архитектуру.
Функциональность перемещена в backend/internal/adapter/in/ws.

package ws

import (
	"encoding/json"
	"errors"
	"fmt"
)

// ParseMessage разбирает входящее сообщение в соответствующий тип
func ParseMessage(data []byte) (interface{}, error) {
	var baseMessage struct {
		Type string `json:"type"`
	}

	if err := json.Unmarshal(data, &baseMessage); err != nil {
		return nil, fmt.Errorf("error parsing message: %w", err)
	}

	switch baseMessage.Type {
	case MessageTypeCommand:
		var msg CommandMessage
		if err := json.Unmarshal(data, &msg); err != nil {
			return nil, fmt.Errorf("error parsing command message: %w", err)
		}
		return &msg, nil

	case MessageTypeObject:
		var msg ObjectMessage
		if err := json.Unmarshal(data, &msg); err != nil {
			return nil, fmt.Errorf("error parsing object message: %w", err)
		}
		return &msg, nil

	case MessageTypePing:
		var msg PingMessage
		if err := json.Unmarshal(data, &msg); err != nil {
			return nil, fmt.Errorf("error parsing ping message: %w", err)
		}
		return &msg, nil

	case MessageTypePong:
		var msg PongMessage
		if err := json.Unmarshal(data, &msg); err != nil {
			return nil, fmt.Errorf("error parsing pong message: %w", err)
		}
		return &msg, nil

	case MessageTypeAck:
		var msg AckMessage
		if err := json.Unmarshal(data, &msg); err != nil {
			return nil, fmt.Errorf("error parsing ack message: %w", err)
		}
		return &msg, nil

	case MessageTypeInfo:
		var msg InfoMessage
		if err := json.Unmarshal(data, &msg); err != nil {
			return nil, fmt.Errorf("error parsing info message: %w", err)
		}
		return &msg, nil

	case MessageTypeMove:
		var msg CommandMessage // Используем CommandMessage для Move
		if err := json.Unmarshal(data, &msg); err != nil {
			return nil, fmt.Errorf("error parsing move message: %w", err)
		}
		return &msg, nil

	default:
		return nil, errors.New("unknown message type: " + baseMessage.Type)
	}
}

// GetMessageType возвращает тип сообщения на основе входных данных
func GetMessageType(data []byte) (string, error) {
	var baseMessage struct {
		Type string `json:"type"`
	}

	if err := json.Unmarshal(data, &baseMessage); err != nil {
		return "", err
	}

	return baseMessage.Type, nil
}

// CreatePingMessage создает новое ping-сообщение
func CreatePingMessage(clientTime float64) *PingMessage {
	return &PingMessage{
		Type:       MessageTypePing,
		ClientTime: clientTime,
	}
}

// CreatePongMessage создает новое pong-сообщение
func CreatePongMessage(clientTime, serverTime, serverDelay float64) *PongMessage {
	return &PongMessage{
		Type:        MessageTypePong,
		ClientTime:  clientTime,
		ServerTime:  serverTime,
		ServerDelay: serverDelay,
	}
}

// CreateAckMessage создает новое сообщение подтверждения
func CreateAckMessage(messageID, status string, clientTime, serverTime float64) *AckMessage {
	return &AckMessage{
		Type:       MessageTypeAck,
		MessageID:  messageID,
		Status:     status,
		ClientTime: clientTime,
		ServerTime: serverTime,
	}
}

// NewInfoMessage создает новое информационное сообщение
func NewInfoMessage(message string) *InfoMessage {
	return &InfoMessage{
		Type:    MessageTypeInfo,
		Message: message,
	}
}

// NewCommandMessage создает новую команду
func NewCommandMessage(cmd string, data interface{}, clientTime float64) *CommandMessage {
	return &CommandMessage{
		Type:       MessageTypeCommand,
		Cmd:        cmd,
		Data:       data,
		ClientTime: clientTime,
	}
}

// NewObjectMessage создает новое сообщение об объекте
func NewObjectMessage(id string, x, y, z float32, clientTime float64) *ObjectMessage {
	return &ObjectMessage{
		Type:       MessageTypeObject,
		ID:         id,
		X:          x,
		Y:          y,
		Z:          z,
		ClientTime: clientTime,
	}
}
*/
