package transport

import (
	"log"
	"net/http"

	"github.com/gorilla/websocket"

	"x-cells/backend/internal/world"
)

type WSServer struct {
	upgrader websocket.Upgrader
	world    *world.Manager
	physics  *PhysicsClient
}

func NewWSServer(world *world.Manager, physics *PhysicsClient) *WSServer {
	return &WSServer{
		upgrader: websocket.Upgrader{
			CheckOrigin: func(r *http.Request) bool { return true },
		},
		world:   world,
		physics: physics,
	}
}

func (s *WSServer) HandleWS(w http.ResponseWriter, r *http.Request) {
	conn, err := s.upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("Websocket upgrade error: %v", err)
		return
	}
	defer conn.Close()

	// TODO: Implement websocket handler
}
