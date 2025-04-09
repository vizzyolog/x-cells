package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"time"

	"x-cells/backend/internal/adapter/in/ws"
	physicsAdapter "x-cells/backend/internal/adapter/out/physics"
	"x-cells/backend/internal/core/domain/entity"
	"x-cells/backend/internal/core/domain/service"
)

func main() {
	ctx := context.Background()

	// Инициализация адаптера для физического движка
	physicsPort, err := physicsAdapter.NewGRPCPhysicsAdapter(ctx, "localhost:50051")
	if err != nil {
		log.Fatalf("Ошибка при создании адаптера физики: %v", err)
	}
	defer physicsPort.Close()

	// Создаем сервис для работы с миром
	worldService := service.NewWorldService(physicsPort)

	// Создаем адаптер для WorldService
	worldServiceAdapter := ws.NewWorldServiceAdapter(worldService)

	// Создаем адаптер для WebSocket
	wsAdapter := ws.NewWSAdapter(worldServiceAdapter)

	// Создаем тестовые объекты
	createTestObjects(ctx, worldService)

	// Запускаем периодическую синхронизацию состояний объектов
	go startSyncLoop(ctx, worldService, wsAdapter)

	log.Println("started SyncLoop")
	// Настраиваем HTTP обработчики
	http.HandleFunc("/ws", wsAdapter.HandleWS)

	// Обработчик для файлов Ammo.js
	http.HandleFunc("/ammo/", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/javascript")
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Cache-Control", "public, max-age=31536000")
		w.Header().Set("Vary", "Accept-Encoding")

		staticDir := "../../../dist"
		http.ServeFile(w, r, staticDir+r.URL.Path)
	})

	// Проверяем существование директории со статическими файлами
	staticDir := "../../../dist"
	if _, err := os.Stat(staticDir); os.IsNotExist(err) {
		log.Printf("Предупреждение: Директория %s не существует", staticDir)
	}

	// Обработчик для статических файлов
	fs := http.FileServer(http.Dir(staticDir))
	http.Handle("/", http.StripPrefix("/", fs))

	log.Printf("Сервер запущен на порту :8080")
	if err := http.ListenAndServe(":8080", nil); err != nil {
		log.Fatal(err)
	}
}

// startSyncLoop запускает периодическую синхронизацию состояний объектов
func startSyncLoop(ctx context.Context, worldService *service.WorldService, wsAdapter *ws.WSAdapter) {
	ticker := time.NewTicker(50 * time.Millisecond) // 20 раз в секунду
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			// Синхронизируем состояния объектов с физическим движком
			worldService.SyncObjectStates(ctx)

			// Отправляем обновления клиентам
			wsAdapter.BroadcastUpdate()
		case <-ctx.Done():
			return
		}
	}
}

// createTestObjects создает тестовые объекты для демонстрации
func createTestObjects(ctx context.Context, worldService *service.WorldService) {
	// Пространство для тестовых объектов
	const (
		startHeight = 10.0
	)

	terrain, err := worldService.CreateTerrain(ctx)
	if err != nil {
		log.Printf("Ошибка при создании террейна: %v", err)
	}

	if err := worldService.CreateObject(ctx, terrain); err != nil {
		log.Printf("Ошибка при создании террейна: %v", err)
	}

	// Создаем основного игрока (сфера с ID mainPlayer1)
	mainPlayer := entity.NewSphere(
		"mainPlayer1",
		entity.Vector3{X: 0, Y: startHeight, Z: 0},
		1.0,       // Радиус
		5.0,       // Масса
		"#ff00ff", // Пурпурный цвет
	)
	mainPlayer.Properties["physics_type"] = "both" // Физика и на клиенте, и на сервере
	if err := worldService.CreateObject(ctx, mainPlayer); err != nil {
		log.Printf("Ошибка при создании игрока mainPlayer1: %v", err)
	}

	// Создаем дополнительный шар (mainPlayer3) - обрабатывается только на сервере
	player3 := entity.NewSphere(
		"mainPlayer3",
		entity.Vector3{X: 10, Y: startHeight, Z: 0},
		1.0,       // Радиус
		5.0,       // Масса
		"#0000ff", // Синий цвет
	)
	player3.Properties["physics_type"] = "bullet" // Физика только на сервере
	if err := worldService.CreateObject(ctx, player3); err != nil {
		log.Printf("Ошибка при создании игрока mainPlayer3: %v", err)
	}

	// Создаем тестовый бокс
	box := entity.NewBox(
		"box_bullet_1",
		entity.Vector3{X: 10, Y: startHeight, Z: 10},
		2.0,       // Размер
		5.0,       // Масса
		"#ffff00", // Желтый цвет
	)
	box.Properties["physics_type"] = "bullet" // Физика только на сервере
	if err := worldService.CreateObject(ctx, box); err != nil {
		log.Printf("Ошибка при создании куба box_bullet_1: %v", err)
	}

	// Создаем дополнительный объект - только для клиента
	clientSphere := entity.NewSphere(
		"mainPlayer2",
		entity.Vector3{X: -10, Y: startHeight, Z: 0},
		1.0,       // Радиус
		5.0,       // Масса
		"#00ff00", // Зеленый цвет
	)
	clientSphere.Properties["physics_type"] = "ammo" // Физика только на клиенте
	if err := worldService.CreateObject(ctx, clientSphere); err != nil {
		log.Printf("Ошибка при создании игрока mainPlayer2: %v", err)
	}

	log.Printf("Тестовые объекты созданы успешно")
}
