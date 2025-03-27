package ws

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/gorilla/websocket"
)

func TestSafeWriter_WriteJSON_Concurrency(t *testing.T) {
	// Создаем тестовый сервер
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		upgrader := websocket.Upgrader{}
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			t.Fatalf("Failed to upgrade connection: %v", err)
		}
		defer conn.Close()

		// Читаем все сообщения, убеждаемся, что все дошли корректно
		var receivedMsgs []string
		for i := 0; i < 10; i++ {
			_, msg, err := conn.ReadMessage()
			if err != nil {
				t.Errorf("Error reading message: %v", err)
				return
			}
			receivedMsgs = append(receivedMsgs, string(msg))
		}

		// Должны получить 10 сообщений, проверяем, что все они разные
		if len(receivedMsgs) != 10 {
			t.Errorf("Expected 10 messages, got %d", len(receivedMsgs))
		}

		// Все сообщения должны быть разными
		uniq := make(map[string]struct{})
		for _, msg := range receivedMsgs {
			uniq[msg] = struct{}{}
		}
		if len(uniq) != 10 {
			t.Errorf("Expected 10 unique messages, got %d", len(uniq))
		}
	}))
	defer server.Close()

	// Подключаемся к тестовому серверу
	wsURL := "ws" + strings.TrimPrefix(server.URL, "http")
	wsConn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("Failed to connect to WebSocket server: %v", err)
	}
	defer wsConn.Close()

	// Создаем SafeWriter
	writer := NewSafeWriter(wsConn)

	// Запускаем 10 горутин, каждая отправляет свое сообщение
	var wg sync.WaitGroup
	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func(id int) {
			defer wg.Done()

			// Добавляем случайную задержку, чтобы увеличить вероятность параллельной записи
			time.Sleep(time.Duration(id) * time.Millisecond)

			msg := struct {
				ID  int    `json:"id"`
				Msg string `json:"msg"`
			}{
				ID:  id,
				Msg: "Test message",
			}

			if err := writer.WriteJSON(msg); err != nil {
				t.Errorf("Error writing message: %v", err)
			}
		}(i)
	}

	// Ждем завершения всех горутин
	wg.Wait()
}

func TestSafeWriter_Close(t *testing.T) {
	// Создаем тестовый сервер
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		upgrader := websocket.Upgrader{}
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			t.Fatalf("Failed to upgrade connection: %v", err)
		}
		defer conn.Close()

		// Читаем одно сообщение
		_, _, err = conn.ReadMessage()
		if err != nil {
			// Ожидаем ошибку, так как соединение должно быть закрыто
			return
		}
	}))
	defer server.Close()

	// Подключаемся к тестовому серверу
	wsURL := "ws" + strings.TrimPrefix(server.URL, "http")
	wsConn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("Failed to connect to WebSocket server: %v", err)
	}

	// Создаем SafeWriter и сразу закрываем
	writer := NewSafeWriter(wsConn)
	if err := writer.Close(); err != nil {
		t.Errorf("Error closing connection: %v", err)
	}

	// Попытка записи в закрытое соединение должна вернуть ошибку
	err = writer.WriteJSON("test")
	if err == nil {
		t.Error("Expected error when writing to closed connection, got nil")
	}
}
