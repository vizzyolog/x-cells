package ws

import (
	"time"
)

// Константы для WebSocket сообщений
const (
	// Типы сообщений
	MessageTypeCreate  = "create"  // Создание объекта
	MessageTypeUpdate  = "update"  // Обновление объекта
	MessageTypePing    = "ping"    // Пинг для измерения задержки
	MessageTypePong    = "pong"    // Ответ на пинг
	MessageTypeCommand = "cmd"     // Команда от клиента
	MessageTypeAck     = "cmd_ack" // Подтверждение команды
	MessageTypeInfo    = "info"    // Информационное сообщение
)

// GetCurrentServerTime возвращает текущее серверное время в миллисекундах
func GetCurrentServerTime() int64 {
	return time.Now().UnixNano() / int64(time.Millisecond)
}

// NewPongMessage создает новое сообщение-ответ на пинг
func NewPongMessage(clientTime float64) map[string]interface{} {
	return map[string]interface{}{
		"type":        MessageTypePong,
		"client_time": clientTime,
		"server_time": GetCurrentServerTime(),
	}
}

// NewAckMessage создает новое сообщение-подтверждение команды
func NewAckMessage(cmd string, clientTime float64) map[string]interface{} {
	return map[string]interface{}{
		"type":        MessageTypeAck,
		"cmd":         cmd,
		"client_time": clientTime,
		"server_time": GetCurrentServerTime(),
	}
}

// NewInfoMessage создает новое информационное сообщение
func NewInfoMessage(message string) map[string]interface{} {
	return map[string]interface{}{
		"type":    MessageTypeInfo,
		"message": message,
	}
}

// NewUpdateMessage создает новое сообщение об обновлении объекта
func NewUpdateMessage(id string, position map[string]float64, rotation map[string]float64) map[string]interface{} {
	return map[string]interface{}{
		"type":        MessageTypeUpdate,
		"id":          id,
		"position":    position,
		"rotation":    rotation,
		"server_time": GetCurrentServerTime(),
	}
}
