package main

import (
	"context"
	"fmt"
	"log"
	"net/http"

	pb "x-cells/generated"

	"github.com/gorilla/websocket"
	"google.golang.org/grpc"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

var physicsClient pb.PhysicsClient

func main() {
	// 1. Подключаемся к C++-серверу
	conn, err := grpc.Dial("localhost:50051", grpc.WithInsecure())
	if err != nil {
		log.Fatalf("Failed to dial C++ gRPC: %v", err)
	}
	defer conn.Close()

	physicsClient = pb.NewPhysicsClient(conn)

	fs := http.FileServer(http.Dir("./static"))
	http.Handle("/", fs)

	// 2. Поднимаем HTTP-сервер c WS
	http.HandleFunc("/ws", wsHandler)

	fmt.Println("[Go-Server] Listening on :8080")
	log.Fatal(http.ListenAndServe(":8080", nil))
}

// Обработка WebSocket
func wsHandler(w http.ResponseWriter, r *http.Request) {
	ws, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	defer ws.Close()

	for {
		// Ждём команду от JS
		var msg struct {
			Cmd string `json:"cmd"`
		}
		if err := ws.ReadJSON(&msg); err != nil {
			log.Println("ReadJSON error:", err)
			return
		}

		switch msg.Cmd {
		case "LEFT":
			applyImpulse(ws, -2, 0, 0)
		case "RIGHT":
			applyImpulse(ws, 2, 0, 0)
		case "UP":
			applyImpulse(ws, 0, 0, -2) // Z- (камера смотрит XZ?)
		case "DOWN":
			applyImpulse(ws, 0, 0, 2)
		case "SPACE":
			applyImpulse(ws, 0, 5, 0) // вверх
		default:
			// Ничего
		}
	}
}

func applyImpulse(ws *websocket.Conn, ix, iy, iz float32) {
	// Отправляем запрос на сервер для применения импульса
	req := &pb.ApplyImpulseRequest{
		ImpulseX: ix, ImpulseY: iy, ImpulseZ: iz,
	}
	resp, err := physicsClient.ApplyImpulse(context.Background(), req)
	if err != nil {
		log.Println("ApplyImpulse error:", err)
		return
	}
	log.Println("ApplyImpulse response:", resp.GetStatus())

	// Получаем текущее состояние сферы
	stateResp, err := physicsClient.GetState(context.Background(), &pb.GetStateRequest{})
	if err != nil {
		log.Println("GetState error:", err)
		return
	}

	// Отправляем клиенту обновлённое состояние
	msg := struct {
		X  float32 `json:"x"`
		Y  float32 `json:"y"`
		Z  float32 `json:"z"`
		Qx float32 `json:"qx"`
		Qy float32 `json:"qy"`
		Qz float32 `json:"qz"`
		Qw float32 `json:"qw"`
	}{
		X:  stateResp.GetX(),
		Y:  stateResp.GetY(),
		Z:  stateResp.GetZ(),
		Qx: stateResp.GetQx(),
		Qy: stateResp.GetQy(),
		Qz: stateResp.GetQz(),
		Qw: stateResp.GetQw(),
	}
	if err := ws.WriteJSON(msg); err != nil {
		log.Println("WriteJSON error:", err)
	}
}
