package ws

import (
	"sync"

	"github.com/gorilla/websocket"
)

// SafeWriter - потокобезопасная обертка для WebSocket соединения
// Позволяет безопасно писать в WebSocket из нескольких горутин
type SafeWriter struct {
	conn  *websocket.Conn
	mutex sync.Mutex
}

// NewSafeWriter создает новый экземпляр потокобезопасного райтера для WebSocket
func NewSafeWriter(conn *websocket.Conn) *SafeWriter {
	return &SafeWriter{
		conn:  conn,
		mutex: sync.Mutex{},
	}
}

// WriteJSON безопасно отправляет JSON данные через WebSocket соединение
func (w *SafeWriter) WriteJSON(data interface{}) error {
	w.mutex.Lock()
	defer w.mutex.Unlock()

	return w.conn.WriteJSON(data)
}

// WriteMessage безопасно отправляет сообщение через WebSocket соединение
func (w *SafeWriter) WriteMessage(messageType int, data []byte) error {
	w.mutex.Lock()
	defer w.mutex.Unlock()

	return w.conn.WriteMessage(messageType, data)
}

// Close закрывает WebSocket соединение
func (w *SafeWriter) Close() error {
	return w.conn.Close()
}

// Conn возвращает оригинальное соединение WebSocket
func (w *SafeWriter) Conn() *websocket.Conn {
	return w.conn
}
