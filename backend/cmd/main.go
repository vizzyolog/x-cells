package main

import (
	"context"
	"fmt"
	"log"
	"math"
	"math/rand"
	"net/http"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"google.golang.org/grpc"

	pb "x-cells/backend/generated"
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
	objects       = make(map[string]*Object)
	objectsMutex  sync.Mutex
	physicsClient pb.PhysicsClient
	upgrader      = websocket.Upgrader{CheckOrigin: func(r *http.Request) bool { return true }}
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
func createObjectInGo(obj *Object) {
	objectsMutex.Lock()
	objects[obj.ID] = obj
	objectsMutex.Unlock()

	_, err := physicsClient.CreateObject(context.Background(), &pb.CreateObjectRequest{
		Id:              obj.ID,
		ObjectType:      obj.ObjectType,
		X:               obj.X,
		Y:               obj.Y,
		Z:               obj.Z,
		Mass:            obj.Mass,
		Radius:          obj.Radius,
		Width:           obj.Width,
		Height:          obj.Height,
		Depth:           obj.Depth,
		Color:           obj.Color,
		HeightData:      obj.HeightData,
		HeightmapWidth:  obj.HeightmapW,
		HeightmapHeight: obj.HeightmapH,
		ScaleX:          obj.ScaleX,
		ScaleY:          obj.ScaleY,
		ScaleZ:          obj.ScaleZ,
		MinHeight:       obj.MinHeight,
		MaxHeight:       obj.MaxHeight,
	})
	if err != nil {
		log.Println("[Go] CreateObject error:", err)
	}
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
func streamStates(ws *websocket.Conn) {
	ticker := time.NewTicker(50 * time.Millisecond)
	defer ticker.Stop()

	for range ticker.C {
		objectsMutex.Lock()
		for _, obj := range objects {
			// Запрашиваем состояние у C++
			stateResp, err := physicsClient.GetState(context.Background(), &pb.GetStateRequest{Id: obj.ID})
			if err != nil {
				log.Println("[Go] GetState error:", err)
				continue
			}
			if stateResp != nil {
				// Шлём "update" с позицией
				msg := map[string]interface{}{
					"type": "update",
					"id":   obj.ID,
					"x":    stateResp.GetX(),
					"y":    stateResp.GetY(),
					"z":    stateResp.GetZ(),
					"qx":   stateResp.GetQx(),
					"qy":   stateResp.GetQy(),
					"qz":   stateResp.GetQz(),
					"qw":   stateResp.GetQw(),
				}
				if err := ws.WriteJSON(msg); err != nil {
					log.Println("[Go] WriteJSON error in streamStates:", err)
					objectsMutex.Unlock()
					return
				}
			}
		}
		objectsMutex.Unlock()
	}
}

// Обработка WebSocket соединений
func wsHandler(w http.ResponseWriter, r *http.Request) {
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
		Y:          10,
		Z:          0,
		Mass:       mass,
		Radius:     radius,
		Color:      color,
	}
	createObjectInGo(sphereObj)

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
	go streamStates(ws)

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
			var ix, iy, iz float32
			switch input.Cmd {
			case "LEFT":
				ix = -2
			case "RIGHT":
				ix = 2
			case "UP":
				iz = -2
			case "DOWN":
				iz = 2
			case "SPACE":
				iy = 5
			}

			// Отправляем импульс через gRPC для текущей сферы
			_, err := physicsClient.ApplyImpulse(context.Background(), &pb.ApplyImpulseRequest{
				Id:       sphereID,
				ImpulseX: ix,
				ImpulseY: iy,
				ImpulseZ: iz,
			})
			if err != nil {
				log.Println("[Go] ApplyImpulse error:", err)
			} else {
				log.Printf("[Go] Applied impulse to sphere %s: (%f, %f, %f)", sphereID, ix, iy, iz)
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
	rand.Seed(time.Now().UnixNano())

	conn, err := grpc.Dial("localhost:50051", grpc.WithInsecure())
	if err != nil {
		log.Fatalf("[Go] gRPC dial error: %v", err)
	}
	defer conn.Close()
	physicsClient = pb.NewPhysicsClient(conn)

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

	createObjectInGo(terrain)

	generateTrees(50)

	http.HandleFunc("/ws", wsHandler)
	http.Handle("/", http.FileServer(http.Dir("./static")))

	fmt.Println("[Go] Listening on :8080")
	log.Fatal(http.ListenAndServe(":8080", nil))
}
