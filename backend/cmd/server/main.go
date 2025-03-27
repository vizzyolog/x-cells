package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"sync"
	"time"

	"github.com/gorilla/websocket"

	pb "x-cells/backend/internal/physics/generated"
	"x-cells/backend/internal/transport"
	"x-cells/backend/internal/world"
)

var (
	worldManager *world.Manager
	worldFactory *world.Factory
	objectsMutex sync.Mutex
	upgrader     = websocket.Upgrader{CheckOrigin: func(r *http.Request) bool { return true }}
)

// Стриминг состояния объектов
func streamStates(ws *websocket.Conn, client pb.PhysicsClient) {
	ticker := time.NewTicker(50 * time.Millisecond)
	defer ticker.Stop()

	for range ticker.C {
		objectsMutex.Lock()
		// Получаем все объекты из менеджера
		for _, obj := range worldManager.GetAllWorldObjects() {
			// Запрашиваем состояние у C++
			stateResp, err := client.GetObjectState(context.Background(), &pb.GetObjectStateRequest{
				Id: obj.ID,
			})
			if err != nil {
				log.Printf("[Go] Ошибка получения состояния: %v", err)
				continue
			}

			if stateResp.Status == "OK" && stateResp.State != nil {
				// Обновляем позицию и вращение в менеджере
				worldManager.UpdateObjectState(obj.ID, world.Vector3{
					X: stateResp.State.Position.X,
					Y: stateResp.State.Position.Y,
					Z: stateResp.State.Position.Z,
				}, world.Quaternion{
					X: stateResp.State.Rotation.X,
					Y: stateResp.State.Rotation.Y,
					Z: stateResp.State.Rotation.Z,
					W: stateResp.State.Rotation.W,
				})

				// Отправляем обновление клиенту
				msg := map[string]interface{}{
					"type": "update",
					"id":   obj.ID,
					"x":    stateResp.State.Position.X,
					"y":    stateResp.State.Position.Y,
					"z":    stateResp.State.Position.Z,
					"qx":   stateResp.State.Rotation.X,
					"qy":   stateResp.State.Rotation.Y,
					"qz":   stateResp.State.Rotation.Z,
					"qw":   stateResp.State.Rotation.W,
				}
				if err := ws.WriteJSON(msg); err != nil {
					log.Printf("[Go] Ошибка отправки JSON: %v", err)
					objectsMutex.Unlock()
					return
				}
			}
		}
		objectsMutex.Unlock()
	}
}

// Обработка WebSocket соединений
func wsHandler(w http.ResponseWriter, r *http.Request, client pb.PhysicsClient) {
	ws, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println("[Go] Upgrade error:", err)
		return
	}
	defer ws.Close()

	// Отправляем существующие объекты клиенту
	if err := sendCreateForAllObjects(ws); err != nil {
		log.Println("[Go] sendCreateForAllObjects error:", err)
		return
	}

	// Стримим состояние объектов
	go streamStates(ws, client)

	// Обрабатываем входящие команды
	for {
		var input struct {
			Type string `json:"type"`
			Cmd  string `json:"cmd,omitempty"`
		}
		if err := ws.ReadJSON(&input); err != nil {
			log.Println("[Go] WS read error:", err)
			break
		}

		// Обработка команд
		if input.Type == "cmd" {
			var impulse pb.Vector3
			switch input.Cmd {
			case "LEFT":
				impulse.X = -5
			case "RIGHT":
				impulse.X = 5
			case "UP":
				impulse.Z = -5
			case "DOWN":
				impulse.Z = 5
			case "SPACE":
				impulse.Y = 10
			}

			// Применяем импульс ко всем сферам, кроме тех с типом физики "ammo"
			objectsMutex.Lock()
			for _, obj := range worldManager.GetAllWorldObjects() {
				// Пропускаем объекты, которые не являются сферами или имеют тип физики "ammo"
				if obj.Shape.Type != world.SPHERE || obj.PhysicsType == world.PhysicsTypeAmmo {
					continue
				}

				_, err := client.ApplyImpulse(context.Background(), &pb.ApplyImpulseRequest{
					Id:      obj.ID,
					Impulse: &impulse,
				})
				if err != nil {
					log.Printf("[Go] Ошибка применения импульса к %s: %v", obj.ID, err)
				} else {
					log.Printf("[Go] Применен импульс к %s (%s): (%f, %f, %f)",
						obj.ID, obj.PhysicsType, impulse.X, impulse.Y, impulse.Z)
				}
			}
			objectsMutex.Unlock()
		}
	}
}

func sendCreateForAllObjects(ws *websocket.Conn) error {
	objectsMutex.Lock()
	defer objectsMutex.Unlock()

	for _, obj := range worldManager.GetAllWorldObjects() {
		// Базовая информация для всех типов объектов
		msg := map[string]interface{}{
			"type":        "create",
			"id":          obj.ID,
			"object_type": getObjectTypeName(obj.Shape.Type),
			"x":           obj.Position.X,
			"y":           obj.Position.Y,
			"z":           obj.Position.Z,
			"physics_by":  string(obj.PhysicsType),
		}

		// Добавляем параметры в зависимости от типа объекта
		switch obj.Shape.Type {
		case world.SPHERE:
			msg["radius"] = obj.Shape.Sphere.Radius
			msg["mass"] = obj.Shape.Sphere.Mass
			msg["color"] = obj.Shape.Sphere.Color
		case world.BOX:
			msg["width"] = obj.Shape.Box.Width
			msg["height"] = obj.Shape.Box.Height
			msg["depth"] = obj.Shape.Box.Depth
			msg["mass"] = obj.Shape.Box.Mass
			msg["color"] = obj.Shape.Box.Color
		case world.TERRAIN:
			msg["height_data"] = obj.Shape.Terrain.HeightData
			msg["heightmap_w"] = obj.Shape.Terrain.Width
			msg["heightmap_h"] = obj.Shape.Terrain.Depth
			msg["scale_x"] = obj.Shape.Terrain.ScaleX
			msg["scale_y"] = obj.Shape.Terrain.ScaleY
			msg["scale_z"] = obj.Shape.Terrain.ScaleZ
			msg["min_height"] = obj.MinHeight
			msg["max_height"] = obj.MaxHeight
		}

		if err := ws.WriteJSON(msg); err != nil {
			return err
		}
	}

	return nil
}

// getObjectTypeName преобразует тип объекта в строку для клиента
func getObjectTypeName(objType world.ShapeType) string {
	switch objType {
	case world.SPHERE:
		return "sphere"
	case world.BOX:
		return "box"
	case world.TERRAIN:
		return "terrain"
	default:
		return "unknown"
	}
}

// Основная функция
func main() {
	ctx := context.Background()

	// Инициализация физического клиента
	physicsClient, err := transport.NewPhysicsClient(ctx, "localhost:50051")
	if err != nil {
		log.Fatalf("Failed to create physics client: %v", err)
	}
	defer physicsClient.Close()

	// Инициализация менеджера объектов
	worldManager = world.NewManager()

	// Инициализация фабрики объектов
	worldFactory = world.NewFactory(worldManager, physicsClient)

	// Создаем террейн через фабрику
	terrainData := world.GenerateTerrainData(world.TerrainGridSize, world.TerrainGridSize)
	terrainObj := world.NewTerrain(
		"terrain1",
		world.Vector3{X: 0, Y: 0, Z: 0},
		terrainData,
		world.TerrainGridSize,
		world.TerrainGridSize,
		float32(world.TerrainPhysicalWidth/float64(world.TerrainGridSize-1)),
		1.0,
		float32(world.TerrainPhysicalDepth/float64(world.TerrainGridSize-1)),
		world.TerrainMinHeight,
		world.TerrainMaxHeight,
	)
	terrainObj.PhysicsType = world.PhysicsTypeBoth
	worldFactory.CreateObjectBullet(terrainObj)

	// Создаем основного игрока через фабрику
	mainPlayer1 := world.NewSphere(
		"mainPlayer1",
		world.Vector3{X: 0, Y: world.TerrainMaxHeight + 50, Z: 0},
		1.0,
		1.0,
		"#ff0000",
	)
	mainPlayer1.PhysicsType = world.PhysicsTypeBoth
	worldFactory.CreateObjectBullet(mainPlayer1)
	log.Println("[Go] Создан основной игрок mainPlayer1")

	// Создаем основного игрока через фабрику
	mainPlayer2 := world.NewSphere(
		"mainPlayer2",
		world.Vector3{X: -20, Y: world.TerrainMaxHeight + 50, Z: 0},
		1.0,
		1.0,
		"#00ff00",
	)
	mainPlayer2.PhysicsType = world.PhysicsTypeBullet
	worldFactory.CreateObjectBullet(mainPlayer2)
	log.Println("[Go] Создан основной игрок mainPlayer2")

	// Создаем основного игрока через фабрику
	mainPlayer3 := world.NewSphere(
		"mainPlayer3",
		world.Vector3{X: 20, Y: world.TerrainMaxHeight + 50, Z: 0},
		1.0,
		1.0,
		"#0000ff",
	)
	mainPlayer3.PhysicsType = world.PhysicsTypeBullet
	worldFactory.CreateObjectBullet(mainPlayer3)
	log.Println("[Go] Создан основной игрок mainPlayer3")

	// Настройка HTTP маршрутов
	http.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
		wsHandler(w, r, physicsClient)
	})

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
