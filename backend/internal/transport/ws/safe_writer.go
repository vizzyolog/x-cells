/*
Этот файл больше не используется после перехода на гексагональную архитектуру.
Функциональность перемещена в backend/internal/adapter/in/ws.

package ws

import (
	"sync"

	"github.com/gorilla/websocket"
)

// SafeWriter обеспечивает потокобезопасную запись в WebSocket соединение
type SafeWriter struct {
	conn  *websocket.Conn
	mutex sync.Mutex
}

// NewSafeWriter создает новый экземпляр SafeWriter
func NewSafeWriter(conn *websocket.Conn) *SafeWriter {
	return &SafeWriter{
		conn:  conn,
		mutex: sync.Mutex{},
	}
}

// WriteJSON потокобезопасно записывает JSON данные в WebSocket соединение
func (w *SafeWriter) WriteJSON(v interface{}) error {
	w.mutex.Lock()
	defer w.mutex.Unlock()
	return w.conn.WriteJSON(v)
}

// WriteMessage потокобезопасно записывает сообщение в WebSocket соединение
func (w *SafeWriter) WriteMessage(messageType int, data []byte) error {
	w.mutex.Lock()
	defer w.mutex.Unlock()
	return w.conn.WriteMessage(messageType, data)
}

// Close закрывает WebSocket соединение
func (w *SafeWriter) Close() error {
	w.mutex.Lock()
	defer w.mutex.Unlock()
	return w.conn.Close()
}

// GetUnderlyingConn возвращает базовое WebSocket соединение
func (w *SafeWriter) GetUnderlyingConn() *websocket.Conn {
	return w.conn
}

// ReadMessage читает сообщение из WebSocket соединения (небезопасно для параллельного чтения)
func (w *SafeWriter) ReadMessage() (int, []byte, error) {
	return w.conn.ReadMessage()
}

// WriteJSONWithType потокобезопасно записывает JSON данные в WebSocket соединение и возвращает тип сообщения
func (w *SafeWriter) WriteJSONWithType(messageType string, v interface{}) error {
	// Добавляем поле type к отправляемым данным
	// Для этого нужно преобразовать v в map, если это возможно,
	// или обернуть его в структуру с полем Type
	// Это просто пример реализации, не оптимальной для всех случаев
	if mapData, ok := v.(map[string]interface{}); ok {
		// Если это уже карта, просто добавляем поле type
		mapData["type"] = messageType
		return w.WriteJSON(mapData)
	}

	// Для других типов нужно создать обертку
	wrapper := map[string]interface{}{
		"type": messageType,
		"data": v,
	}
	return w.WriteJSON(wrapper)
}
*/
