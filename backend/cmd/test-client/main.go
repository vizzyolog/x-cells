package main

import (
	"encoding/json"
	"log"
	"net/url"
	"time"

	"github.com/gorilla/websocket"
)

func main() {
	// Подключаемся к серверу
	u, err := url.Parse("ws://localhost:8080/ws")
	if err != nil {
		log.Fatalf("Неверный URL: %v", err)
	}

	log.Printf("Подключение к %s", u.String())

	conn, _, err := websocket.DefaultDialer.Dial(u.String(), nil)
	if err != nil {
		log.Fatalf("Ошибка подключения: %v", err)
	}
	defer conn.Close()

	log.Printf("Успешно подключен")

	// Читаем сообщения от сервера
	for i := 0; i < 10; i++ { // Читаем первые 10 сообщений
		_, data, err := conn.ReadMessage()
		if err != nil {
			log.Printf("Ошибка чтения сообщения: %v", err)
			break
		}

		var msg map[string]interface{}
		if err := json.Unmarshal(data, &msg); err != nil {
			log.Printf("Ошибка разбора сообщения: %v", err)
			continue
		}

		msgType, ok := msg["type"].(string)
		if !ok {
			log.Printf("Сообщение без типа: %v", msg)
			continue
		}

		switch msgType {
		case "info":
			if message, ok := msg["message"].(string); ok {
				log.Printf("INFO: %s", message)
			}

		case "player_id":
			if playerID, ok := msg["player_id"].(string); ok {
				if objectID, ok := msg["object_id"].(string); ok {
					log.Printf("PLAYER_ID: %s, OBJECT_ID: %s", playerID, objectID)
				}
			}

		case "create":
			if objID, ok := msg["id"].(string); ok {
				if objType, ok := msg["object_type"].(string); ok {
					log.Printf("CREATE: %s (%s)", objID, objType)
				}
			}

		default:
			log.Printf("Сообщение типа %s: %v", msgType, msg)
		}

		// Небольшая пауза
		time.Sleep(100 * time.Millisecond)
	}

	log.Printf("Тест завершен")
}
