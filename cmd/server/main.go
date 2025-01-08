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

	pb "x-cells/generated" // ваши сгенерированные go-файлы от physics.proto

	"github.com/gorilla/websocket"
	"google.golang.org/grpc"
)

// Object - локальная структура хранения
type Object struct {
	ID         string    `json:"id"`
	ObjectType string    `json:"object_type"`
	X, Y, Z    float32   `json:"x","y","z"`
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

// Посылаем клиенту create-команды для всех объектов
func sendCreateForAllObjects(ws *websocket.Conn) error {
	objectsMutex.Lock()
	defer objectsMutex.Unlock()

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

// Обработка WebSocket соединений
func wsHandler(w http.ResponseWriter, r *http.Request) {
	ws, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println("[Go] Upgrade error:", err)
		return
	}
	defer ws.Close()

	if err := sendCreateForAllObjects(ws); err != nil {
		log.Println("[Go] sendCreateForAllObjects error:", err)
		return
	}

	// Создаём личный sphere для нового подключения
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
	ws.WriteJSON(msg)

	go streamStates(ws)

	for {
		var input struct {
			Type string `json:"type"`
			Cmd  string `json:"cmd,omitempty"`
		}
		if err := ws.ReadJSON(&input); err != nil {
			log.Println("[Go] WS read error:", err)
			break
		}
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
			physicsClient.ApplyImpulse(context.Background(), &pb.ApplyImpulseRequest{
				Id:       sphereID,
				ImpulseX: ix,
				ImpulseY: iy,
				ImpulseZ: iz,
			})
		}
	}
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
		HeightmapW: 128,
		HeightmapH: 128,
		Color:      "#888888",
		Mass:       0,
		ScaleX:     2.0,
		ScaleY:     1.0,
		ScaleZ:     2.0,
		MinHeight:  -20.0,
		MaxHeight:  20.0,
	}

	createObjectInGo(terrain)

	http.HandleFunc("/ws", wsHandler)
	http.Handle("/", http.FileServer(http.Dir("./static")))

	fmt.Println("[Go] Listening on :8080")
	log.Fatal(http.ListenAndServe(":8080", nil))
}
