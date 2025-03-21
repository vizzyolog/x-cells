package main

import (
	"context"
	"log"
	"math"
	"net/http"
	"os"
	"sync"
	"time"

	"github.com/gorilla/websocket"

	pb "x-cells/backend/internal/physics/generated"
	"x-cells/backend/internal/transport"
)

// Константы для террейна
const (
	// Физические размеры террейна в мире
	terrainPhysicalWidth = 100.0
	terrainPhysicalDepth = 100.0

	// Размеры сетки террейна
	terrainGridSize  = 128 // Одинаковая детализация для соответствия примеру three.js
	terrainHalfWidth = terrainGridSize / 2
	terrainHalfDepth = terrainGridSize / 2

	// Диапазон высот
	terrainMinHeight = -2.0
	terrainMaxHeight = 8.0
)

// Object - локальная структура хранения
type Object struct {
	ID         string    `json:"id"`
	ObjectType string    `json:"object_type"`
	X          float32   `json:"x"`
	Y          float32   `json:"y"`
	Z          float32   `json:"z"`
	Mass       float32   `json:"mass"`
	Radius     float32   `json:"radius"`
	Width      float32   `json:"width"`
	Height     float32   `json:"height"`
	Depth      float32   `json:"depth"`
	Color      string    `json:"color"`
	HeightData []float32 `json:"height_data,omitempty"`
	HeightmapW int32     `json:"heightmap_w,omitempty"`
	HeightmapH int32     `json:"heightmap_h,omitempty"`
	ScaleX     float32   `json:"scale_x,omitempty"`
	ScaleY     float32   `json:"scale_y,omitempty"`
	ScaleZ     float32   `json:"scale_z,omitempty"`
	MinHeight  float32   `json:"min_height,omitempty"`
	MaxHeight  float32   `json:"max_height,omitempty"`
	PhysicsBy  string    `json:"physics_by"`
}

var (
	objects      = make(map[string]*Object)
	objectsMutex sync.Mutex
	upgrader     = websocket.Upgrader{CheckOrigin: func(r *http.Request) bool { return true }}
)

// func generateTrees(count int) {
// 	for i := 0; i < count; i++ {
// 		x := float32(rand.Intn(200) - 100)
// 		z := float32(rand.Intn(200) - 100)
// 		tree := generateTree(x, z)
// 		createTreeInGo(tree)
// 	}
// }

// createObjectInGo - создаём объект в локальном maps и через gRPC
func createObjectInGo(obj *Object, client pb.PhysicsClient) {
	objectsMutex.Lock()
	objects[obj.ID] = obj
	objectsMutex.Unlock()

	// Создаем базовый запрос
	request := &pb.CreateObjectRequest{
		Id: obj.ID,
		Position: &pb.Vector3{
			X: obj.X,
			Y: obj.Y,
			Z: obj.Z,
		},
		Rotation: &pb.Quaternion{
			X: 0,
			Y: 0,
			Z: 0,
			W: 1, // Идентичное вращение
		},
	}

	// Создаем ShapeDescriptor в зависимости от типа объекта
	shapeDesc := &pb.ShapeDescriptor{}

	switch obj.ObjectType {
	case "sphere":
		shapeDesc.Type = pb.ShapeDescriptor_SPHERE
		shapeDesc.Shape = &pb.ShapeDescriptor_Sphere{
			Sphere: &pb.SphereData{
				Radius: obj.Radius,
				Mass:   obj.Mass,
				Color:  obj.Color,
			},
		}

	case "box":
		shapeDesc.Type = pb.ShapeDescriptor_BOX
		shapeDesc.Shape = &pb.ShapeDescriptor_Box{
			Box: &pb.BoxData{
				Width:  obj.Width,
				Height: obj.Height,
				Depth:  obj.Depth,
				Mass:   obj.Mass,
				Color:  obj.Color,
			},
		}

	case "terrain":
		shapeDesc.Type = pb.ShapeDescriptor_TERRAIN
		shapeDesc.Shape = &pb.ShapeDescriptor_Terrain{
			Terrain: &pb.TerrainData{
				Width:     obj.HeightmapW,
				Depth:     obj.HeightmapH,
				Heightmap: obj.HeightData,
				ScaleX:    obj.ScaleX,
				ScaleY:    obj.ScaleY,
				ScaleZ:    obj.ScaleZ,
			},
		}

	default:
		log.Printf("[Go] Неизвестный тип объекта: %s", obj.ObjectType)
		return
	}

	request.Shape = shapeDesc

	// Отправляем запрос в C++ сервер
	_, err := client.CreateObject(context.Background(), request)
	if err != nil {
		log.Printf("[Go] Ошибка создания объекта: %v", err)
		return
	}
}

// Генерация данных террейна - реализуем точно так же, как в примере three.js
func generateTerrainData(w, h int) []float32 {
	data := make([]float32, w*h)

	// Центр сетки
	w2 := float64(w) / 2.0
	d2 := float64(h) / 2.0

	// Параметры волн
	phaseMult := 12.0
	heightRange := terrainMaxHeight - terrainMinHeight

	for j := 0; j < h; j++ {
		for i := 0; i < w; i++ {
			// Нормализуем координаты относительно центра
			nx := float64(i-int(w2)) / w2
			nz := float64(j-int(d2)) / d2

			// Вычисляем нормализованное расстояние от центра
			radius := math.Sqrt(nx*nx + nz*nz)

			// Создаем круговую волну и масштабируем её в нужный диапазон высот
			// Точно такая же формула как в примере three.js
			height := (math.Sin(radius*phaseMult)+1.0)*0.5*heightRange + terrainMinHeight
			data[j*w+i] = float32(height)
		}
	}

	return data
}

// Стриминг состояния объектов
func streamStates(ws *websocket.Conn, client pb.PhysicsClient) {
	ticker := time.NewTicker(50 * time.Millisecond)
	defer ticker.Stop()

	for range ticker.C {
		objectsMutex.Lock()
		for _, obj := range objects {
			// Запрашиваем состояние у C++
			stateResp, err := client.GetObjectState(context.Background(), &pb.GetObjectStateRequest{
				Id: obj.ID,
			})
			if err != nil {
				log.Printf("[Go] Ошибка получения состояния: %v", err)
				continue
			}

			if stateResp.Status == "OK" && stateResp.State != nil {
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

	// Размещаем сферу над террейном на достаточной высоте
	sphereObj := &Object{
		ID:         "mainPlayer1",
		ObjectType: "sphere",
		X:          0,
		Y:          terrainMaxHeight + 50, // Размещаем выше максимальной высоты террейна
		Z:          0,
		Mass:       float32(1.0),
		Radius:     float32(1.0),
		Color:      "#ff0000",
		PhysicsBy:  "bullet",
	}
	createObjectInGo(sphereObj, client)

	// Отправляем сообщение о создании сферы клиенту
	msg := map[string]interface{}{
		"type":        "create",
		"id":          sphereObj.ID,
		"object_type": sphereObj.ObjectType,
		"x":           sphereObj.X,
		"y":           sphereObj.Y,
		"z":           sphereObj.Z,
		"mass":        sphereObj.Mass,
		"radius":      sphereObj.Radius,
		"color":       sphereObj.Color,
	}
	if err := ws.WriteJSON(msg); err != nil {
		log.Println("[Go] Error sending sphere creation message:", err)
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

			// Применяем импульс только к серверной сфере
			_, err := client.ApplyImpulse(context.Background(), &pb.ApplyImpulseRequest{
				Id:      "mainPlayer", // Всегда используем ID серверной сферы
				Impulse: &impulse,
			})
			if err != nil {
				log.Printf("[Go] Ошибка применения импульса: %v", err)
			} else {
				log.Printf("[Go] Применен импульс к server_sphere: (%f, %f, %f)",
					impulse.X, impulse.Y, impulse.Z)
			}
		}
	}
}

func sendCreateForAllObjects(ws *websocket.Conn) error {
	objectsMutex.Lock()
	defer objectsMutex.Unlock()

	// for _, obj := range objects {
	// 	if obj.ObjectType == "tree" {
	// 		tree := generateTree(obj.X, obj.Z) // Генерируем дерево из текущего объекта
	// 		if err := sendCreateTree(ws, tree); err != nil {
	// 			return err
	// 		}
	// 	}
	// }

	for _, obj := range objects {
		msg := map[string]interface{}{
			"type":        "create",
			"id":          obj.ID,
			"object_type": obj.ObjectType,
			"x":           obj.X,
			"y":           obj.Y,
			"z":           obj.Z,
			"mass":        obj.Mass,
			"radius":      obj.Radius,
			"width":       obj.Width,
			"height":      obj.Height,
			"depth":       obj.Depth,
			"color":       obj.Color,
		}
		if obj.ObjectType == "terrain" {
			msg["height_data"] = obj.HeightData
			msg["heightmap_w"] = obj.HeightmapW
			msg["heightmap_h"] = obj.HeightmapH
			msg["scale_x"] = obj.ScaleX
			msg["scale_y"] = obj.ScaleY
			msg["scale_z"] = obj.ScaleZ
			msg["min_height"] = obj.MinHeight
			msg["max_height"] = obj.MaxHeight
		}

		if err := ws.WriteJSON(msg); err != nil {
			return err
		}
	}

	return nil
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

	// Создаем террейн
	terrainData := generateTerrainData(terrainGridSize, terrainGridSize)
	terrain := &Object{
		ID:         "terrain1",
		ObjectType: "terrain",
		X:          0,
		Y:          0,
		Z:          0,
		HeightData: terrainData,
		HeightmapW: terrainGridSize,
		HeightmapH: terrainGridSize,
		Color:      "#5c8a50",
		Mass:       0,
		ScaleX:     float32(terrainPhysicalWidth / float64(terrainGridSize-1)),
		ScaleY:     1.0,
		ScaleZ:     float32(terrainPhysicalDepth / float64(terrainGridSize-1)),
		MinHeight:  terrainMinHeight,
		MaxHeight:  terrainMaxHeight,
	}
	createObjectInGo(terrain, physicsClient)

	// Генерируем деревья
	//generateTrees(50)

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
