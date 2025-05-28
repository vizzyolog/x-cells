package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"

	"x-cells/backend/internal/transport"
	"x-cells/backend/internal/transport/ws"
	"x-cells/backend/internal/world"
)

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
	testObjectsCreator.CreateAll(0.0) // Используем максимальную высоту 50.0

	// Сервер для WS
	wsServer := ws.NewWSServer(worldManager, physicsClient, serializer)

	http.HandleFunc("/ws", wsServer.HandleWS)

	// Эндпоинты для управления имитацией сети
	http.HandleFunc("/api/network-sim/enable", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		profile := r.URL.Query().Get("profile")
		if profile == "" {
			profile = "wifi_good" // профиль по умолчанию
		}

		wsServer.EnableNetworkSimulation(profile)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"status": "enabled", "profile": "` + profile + `"}`))
	})

	http.HandleFunc("/api/network-sim/disable", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		wsServer.EnableNetworkSimulation("disabled")
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"status": "disabled"}`))
	})

	http.HandleFunc("/api/network-sim/status", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "GET" {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		sim := wsServer.GetNetworkSimulation()
		w.Header().Set("Content-Type", "application/json")

		status := "disabled"
		if sim.Enabled {
			status = "enabled"
		}

		response := fmt.Sprintf(`{
			"status": "%s",
			"baseLatency": "%v",
			"latencyVariance": "%v", 
			"packetLoss": %.3f
		}`, status, sim.BaseLatency, sim.LatencyVariance, sim.PacketLoss)

		w.WriteHeader(http.StatusOK)
		w.Write([]byte(response))
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
