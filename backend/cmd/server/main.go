package main

import (
	"context"
	"fmt"
	"log"
	"math"
	"math/rand"
	"net/http"
	"os"
	"sync"
	"time"

	"github.com/gorilla/websocket"

	pb "x-cells/backend/internal/physics/generated"
	"x-cells/backend/internal/transport"
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
}

var (
	objects      = make(map[string]*Object)
	objectsMutex sync.Mutex
	upgrader     = websocket.Upgrader{CheckOrigin: func(r *http.Request) bool { return true }}
)

// TreeBranch - структура ветки дерева
type TreeBranch struct {
	StartX float32 `json:"start_x"`
	StartY float32 `json:"start_y"`
	StartZ float32 `json:"start_z"`
	EndX   float32 `json:"end_x"`
	EndY   float32 `json:"end_y"`
	EndZ   float32 `json:"end_z"`
	Radius float32 `json:"radius"`
	Color  string  `json:"color"`
}

// TreeObject - структура дерева
type TreeObject struct {
	ID         string       `json:"id"`
	ObjectType string       `json:"object_type"`
	X          float32      `json:"x"`
	Y          float32      `json:"y"`
	Z          float32      `json:"z"`
	Branches   []TreeBranch `json:"branches"`
	Color      string       `json:"color"`
}

func generateTree(x, z float32) *TreeObject {
	tree := &TreeObject{
		ID:         fmt.Sprintf("tree_%d", time.Now().UnixNano()),
		ObjectType: "tree",
		X:          x,
		Y:          0,
		Z:          z,
		Color:      fmt.Sprintf("#%06x", rand.Intn(0xffffff)),
	}

	// Генерация веток
	branchCount := 5 + rand.Intn(10)
	for i := 0; i < branchCount; i++ {
		startX := x + rand.Float32()*2 - 1
		startY := float32(i)
		startZ := z + rand.Float32()*2 - 1

		endX := startX + rand.Float32()*4 - 2
		endY := startY + rand.Float32()*2 + 1 // Добавляем 1 для гарантии разницы
		endZ := startZ + rand.Float32()*4 - 2

		// Проверяем, чтобы координаты начала и конца не совпадали
		if startX == endX && startY == endY && startZ == endZ {
			endY += 0.1 // Минимальная разница, чтобы избежать длины 0
		}

		branch := TreeBranch{
			StartX: startX,
			StartY: startY,
			StartZ: startZ,
			EndX:   endX,
			EndY:   endY,
			EndZ:   endZ,
			Radius: 0.1 + rand.Float32()*0.2,
			Color:  fmt.Sprintf("#%06x", rand.Intn(0xffffff)),
		}
		tree.Branches = append(tree.Branches, branch)
	}

	return tree
}

// createTreeInGo - добавление дерева в objects
func createTreeInGo(tree *TreeObject) {
	objectsMutex.Lock()
	defer objectsMutex.Unlock()
	objects[tree.ID] = &Object{
		ID:         tree.ID,
		ObjectType: tree.ObjectType,
		X:          tree.X,
		Y:          tree.Y,
		Z:          tree.Z,
		Color:      tree.Color,
	}
}

// sendCreateTree - отправка дерева через WebSocket
func sendCreateTree(ws *websocket.Conn, tree *TreeObject) error {
	branches := []map[string]interface{}{}
	for _, branch := range tree.Branches {
		if branch.StartX == 0 && branch.StartY == 0 && branch.StartZ == 0 &&
			branch.EndX == 0 && branch.EndY == 0 && branch.EndZ == 0 {
			log.Printf("Invalid branch detected: %+v", branch)
		}
		branches = append(branches, map[string]interface{}{
			"startX": branch.StartX,
			"startY": branch.StartY,
			"startZ": branch.StartZ,
			"endX":   branch.EndX,
			"endY":   branch.EndY,
			"endZ":   branch.EndZ,
			"radius": branch.Radius,
			"color":  branch.Color,
		})
	}

	message := map[string]interface{}{
		"type":        "create",
		"id":          tree.ID,
		"object_type": tree.ObjectType,
		"x":           tree.X,
		"y":           tree.Y,
		"z":           tree.Z,
		"color":       tree.Color,
		"branches":    branches,
	}
	log.Printf("Sending tree data: %+v\n", message)
	return ws.WriteJSON(message)
}

// Генерация деревьев
func generateTrees(count int) {
	for i := 0; i < count; i++ {
		x := float32(rand.Intn(200) - 100)
		z := float32(rand.Intn(200) - 100)
		tree := generateTree(x, z)
		createTreeInGo(tree)
	}
}

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
}

// Генерация данных террейна
func generateTerrainData(w, h int) []float32 {
	arr := make([]float32, w*h)
	for z := 0; z < h; z++ {
		for x := 0; x < w; x++ {
			fx := float32(x - w/2)
			fz := float32(z - h/2)
			h := 2.0 * float32(math.Sin(float64(fx)*0.1)*math.Cos(float64(fz)*0.1))
			arr[z*w+x] = h
		}
	}
	return arr
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

	// Создаём личную сферу для нового подключения
	sphereID := fmt.Sprintf("sphere_%d", time.Now().UnixNano())
	color := fmt.Sprintf("#%06x", rand.Intn(0xffffff))
	radius := float32(1.0 + rand.Float32()*1.5)
	mass := float32(1.0 + rand.Float32()*2.0)

	sphereObj := &Object{
		ID:         sphereID,
		ObjectType: "sphere",
		X:          0,
		Y:          30,
		Z:          0,
		Mass:       mass,
		Radius:     radius,
		Color:      color,
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

			// Применяем импульс вместо крутящего момента
			_, err := client.ApplyImpulse(context.Background(), &pb.ApplyImpulseRequest{
				Id:      sphereID,
				Impulse: &impulse,
			})
			if err != nil {
				log.Printf("[Go] Ошибка применения импульса: %v", err)
			} else {
				log.Printf("[Go] Применен импульс к %s: (%f, %f, %f)",
					sphereID, impulse.X, impulse.Y, impulse.Z)
			}
		}
	}
}

func sendCreateForAllObjects(ws *websocket.Conn) error {
	objectsMutex.Lock()
	defer objectsMutex.Unlock()

	for _, obj := range objects {
		if obj.ObjectType == "tree" {
			tree := generateTree(obj.X, obj.Z) // Генерируем дерево из текущего объекта
			if err := sendCreateTree(ws, tree); err != nil {
				return err
			}
		} else {
			// Отправляем прочие объекты
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
	terrainData := generateTerrainData(128, 128)
	terrain := &Object{
		ID:         "terrain1",
		ObjectType: "terrain",
		X:          0,
		Y:          0,
		Z:          0,
		HeightData: terrainData,
		HeightmapW: 64,
		HeightmapH: 64,
		Color:      "#888888",
		Mass:       0,
		ScaleX:     5.0,
		ScaleY:     1.0,
		ScaleZ:     10.0,
		MinHeight:  -10.0,
		MaxHeight:  20.0,
	}
	createObjectInGo(terrain, physicsClient)

	// Генерируем деревья
	generateTrees(50)

	// Настройка HTTP маршрутов
	http.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
		wsHandler(w, r, physicsClient)
	})

	// Добавим проверку существования директории
	staticDir := "../../../dist"
	if _, err := os.Stat(staticDir); os.IsNotExist(err) {
		log.Printf("Warning: Directory %s does not exist", staticDir)
	}

	fs := http.FileServer(http.Dir(staticDir))
	http.Handle("/", http.StripPrefix("/", fs))

	log.Printf("Serving static files from: %s\n", staticDir)
	log.Println("Server starting on :8080")
	if err := http.ListenAndServe(":8080", nil); err != nil {
		log.Fatal(err)
	}
}
