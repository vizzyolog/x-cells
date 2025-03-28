package main

import (
	"context"
	"log"
	"net/http"
	"os"

	"x-cells/backend/internal/transport"
	"x-cells/backend/internal/transport/ws"
	"x-cells/backend/internal/world"
)

// var (
// 	upgrader = websocket.Upgrader{CheckOrigin: func(r *http.Request) bool { return true }}
// )

// // streamStates стримит состояние объектов
// func streamStates(wsWriter *ws.SafeWriter, physicsClient pb.PhysicsClient, serializer *serialize.WorldSerializer, worldManager *world.Manager) {
// 	ticker := time.NewTicker(50 * time.Millisecond)
// 	defer ticker.Stop()

// 	for range ticker.C {
// 		// Получаем список всех объектов из мира
// 		worldObjects := worldManager.GetAllWorldObjects()

// 		// Для каждого объекта с физикой bullet или both получаем состояние
// 		for _, obj := range worldObjects {
// 			// Пропускаем объекты, которые обрабатываются только на клиенте
// 			if obj.PhysicsType == world.PhysicsTypeAmmo {
// 				continue
// 			}

// 			// Запрашиваем состояние объекта из физического движка
// 			resp, err := physicsClient.GetObjectState(context.Background(), &pb.GetObjectStateRequest{
// 				Id: obj.ID,
// 			})

// 			if err != nil {
// 				log.Printf("[Go] Ошибка получения состояния для %s: %v", obj.ID, err)
// 				continue
// 			}

// 			// Проверяем, что получен ответ с состоянием
// 			if resp.Status != "OK" || resp.State == nil {
// 				continue
// 			}

// 			// Создаем Vector3 и Quaternion из ответа сервера
// 			position := world.Vector3{
// 				X: resp.State.Position.X,
// 				Y: resp.State.Position.Y,
// 				Z: resp.State.Position.Z,
// 			}

// 			rotation := world.Quaternion{
// 				X: resp.State.Rotation.X,
// 				Y: resp.State.Rotation.Y,
// 				Z: resp.State.Rotation.Z,
// 				W: resp.State.Rotation.W,
// 			}

// 			// Отправляем обновление позиции и вращения
// 			if err := serializer.SendUpdateForObject(wsWriter, obj.ID, position, rotation); err != nil {
// 				log.Printf("[Go] Ошибка отправки обновления для %s: %v", obj.ID, err)
// 			}
// 		}
// 	}
// }

// wsHandler обрабатывает WebSocket соединения
// func wsHandler(w http.ResponseWriter, r *http.Request,
// 	physicsClient pb.PhysicsClient,
// 	worldManager *world.Manager,
// 	serializer *ws.WorldSerializer) {

// 	conn, err := upgrader.Upgrade(w, r, nil)
// 	if err != nil {
// 		log.Println("[Go] Upgrade error:", err)
// 		return
// 	}

// 	// Создаем SafeWriter для безопасной работы с WebSocket
// 	wsWriter := ws.NewSafeWriter(conn)
// 	defer wsWriter.Close()

// 	// Отправляем существующие объекты клиенту
// 	if err := serializer.SendCreateForAllObjects(wsWriter); err != nil {
// 		log.Printf("[Go] Ошибка при отправке существующих объектов: %v", err)
// 		return
// 	}

// 	// Стримим состояние объектов
// 	go streamStates(wsWriter, physicsClient, serializer, worldManager)

// 	// Обрабатываем входящие сообщения
// 	for {
// 		_, message, err := conn.ReadMessage()
// 		if err != nil {
// 			log.Println("[Go] WS read error:", err)
// 			break
// 		}

// 		// Декодируем сообщение
// 		var input struct {
// 			Type       string `json:"type"`
// 			Cmd        string `json:"cmd,omitempty"`
// 			ClientTime int64  `json:"client_time,omitempty"`
// 			PlayerId   string `json:"player_id,omitempty"`
// 		}

// 		if err := json.Unmarshal(message, &input); err != nil {
// 			log.Printf("[Go] Ошибка декодирования сообщения: %v", err)
// 			continue
// 		}

// 		// Обрабатываем различные типы сообщений
// 		switch input.Type {
// 		case "ping":
// 			// Отправляем pong с временной меткой сервера и клиента
// 			serverTime := time.Now().UnixNano() / int64(time.Millisecond)
// 			pongMsg := map[string]interface{}{
// 				"type":        "pong",
// 				"client_time": input.ClientTime,
// 				"server_time": serverTime,
// 			}

// 			if err := wsWriter.WriteJSON(pongMsg); err != nil {
// 				log.Printf("[Go] Ошибка отправки pong: %v", err)
// 				continue
// 			}

// 			log.Printf("[Go] Отправлен pong, время сервера: %d, время клиента: %d",
// 				serverTime, input.ClientTime)

// 		case "cmd":
// 			// Обрабатываем команды управления
// 			var impulse pb.Vector3
// 			switch input.Cmd {
// 			case "LEFT":
// 				impulse.X = -5
// 			case "RIGHT":
// 				impulse.X = 5
// 			case "UP":
// 				impulse.Z = -5
// 			case "DOWN":
// 				impulse.Z = 5
// 			case "SPACE":
// 				impulse.Y = 10
// 			default:
// 				log.Printf("[Go] Неизвестная команда: %s", input.Cmd)
// 				continue
// 			}

// 			// Получаем все объекты из менеджера мира
// 			worldObjects := worldManager.GetAllWorldObjects()

// 			// Счетчик успешно обработанных объектов
// 			successCount := 0

// 			// Применяем импульс ко всем объектам, кроме типа ammo
// 			for _, obj := range worldObjects {
// 				// Пропускаем объекты, которые обрабатываются только на клиенте
// 				if obj.PhysicsType == world.PhysicsTypeAmmo {
// 					continue
// 				}

// 				// Применяем импульс к объекту через Bullet Physics
// 				_, err := physicsClient.ApplyImpulse(context.Background(), &pb.ApplyImpulseRequest{
// 					Id:      obj.ID,
// 					Impulse: &impulse,
// 				})

// 				if err != nil {
// 					log.Printf("[Go] Ошибка применения импульса к %s: %v", obj.ID, err)
// 					continue
// 				}

// 				successCount++
// 				log.Printf("[Go] Применен импульс к %s: (%f, %f, %f)",
// 					obj.ID, impulse.X, impulse.Y, impulse.Z)
// 			}

// 			log.Printf("[Go] Применен импульс к %d объектам с типами физики bullet и both", successCount)

// 			// Отправляем подтверждение обработки команды с временными метками
// 			serverTime := time.Now().UnixNano() / int64(time.Millisecond)
// 			ackMsg := map[string]interface{}{
// 				"type":        "cmd_ack",
// 				"cmd":         input.Cmd,
// 				"client_time": input.ClientTime,
// 				"server_time": serverTime,
// 				"player_id":   "ALL",
// 				"count":       successCount,
// 			}

// 			if err := wsWriter.WriteJSON(ackMsg); err != nil {
// 				log.Printf("[Go] Ошибка отправки подтверждения команды: %v", err)
// 			}

// 		default:
// 			log.Printf("[Go] Получен неизвестный тип сообщения: %s", input.Type)
// 		}
// 	}
// }

// Основная функция
func main() {
	ctx := context.Background()

	// Инициализация физического клиента
	physicsClient, err := transport.NewPhysicsClient(ctx, "localhost:50051")
	if err != nil {
		log.Fatalf("Failed to create physics client: %v", err)
	}
	defer physicsClient.Close()

	// Создаем менеджер игрового мира
	worldManager := world.NewManager()

	// Создаем фабрику объектов
	factory := world.NewFactory(worldManager, physicsClient)

	// Создаем сериализатор
	serializer := ws.NewWorldSerializer(worldManager)

	// Создаем тестовые объекты
	testObjectsCreator := world.NewTestObjectsCreator(factory)
	testObjectsCreator.CreateAll(50.0) // Используем максимальную высоту 50.0

	wsServer := ws.NewWSServer(worldManager, physicsClient, serializer)

	http.HandleFunc("/ws", wsServer.HandleWS)
	// // Настройка HTTP маршрутов
	// http.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
	// 	wsHandler(w, r, physicsClient, worldManager, serializer)
	// })

	// Специальный обработчик для файлов Ammo.js
	http.HandleFunc("/ammo/", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/javascript")
		w.Header().Set("Access-Control-Allow-Origin", "*")

		// Добавляем заголовки для кэширования
		w.Header().Set("Cache-Control", "public, max-age=31536000")
		w.Header().Set("Vary", "Accept-Encoding")

		// Путь к статическим файлам
		staticDir := "../../../dist"
		http.ServeFile(w, r, staticDir+r.URL.Path)
	})

	// Добавим проверку существования директории
	staticDir := "../../../dist"
	if _, err := os.Stat(staticDir); os.IsNotExist(err) {
		log.Printf("Warning: Directory %s does not exist", staticDir)
	}

	// Обработчик для остальных статических файлов
	fs := http.FileServer(http.Dir(staticDir))
	http.Handle("/", http.StripPrefix("/", fs))

	log.Printf("Serving static files from: %s\n", staticDir)
	log.Println("Server starting on :8080")
	if err := http.ListenAndServe(":8080", nil); err != nil {
		log.Fatal(err)
	}
}
