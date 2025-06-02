package main

import (
	"fmt"
	"math/rand"
	"time"
)

// PlayerManager простой менеджер игроков для демонстрации
type PlayerManager struct {
	collider *ColliderDispatcher
	players  map[string]*CollidableObject
}

// NewPlayerManager создает новый менеджер игроков
func NewPlayerManager(collider *ColliderDispatcher) *PlayerManager {
	return &PlayerManager{
		collider: collider,
		players:  make(map[string]*CollidableObject),
	}
}

// AddPlayer добавляет нового игрока
func (pm *PlayerManager) AddPlayer(playerID string, position Vector3, radius float64) {
	player := &CollidableObject{
		ID:       playerID,
		Position: position,
		Radius:   radius,
		Type:     "player",
		Mass:     radius * radius * 10, // Масса пропорциональна площади
		IsStatic: false,                // Игроки двигаются
	}

	pm.players[playerID] = player
	pm.collider.AddObject(player)

	fmt.Printf("[PlayerManager] Добавлен игрок %s в позиции (%.1f, %.1f, %.1f) с радиусом %.2f\n",
		playerID, position.X, position.Y, position.Z, radius)
}

// MovePlayer перемещает игрока
func (pm *PlayerManager) MovePlayer(playerID string, newPosition Vector3) {
	if player, exists := pm.players[playerID]; exists {
		player.Position = newPosition
		pm.collider.UpdateObjectPosition(playerID, newPosition)
	}
}

// GrowPlayer увеличивает размер игрока
func (pm *PlayerManager) GrowPlayer(playerID string, massGain float64) {
	if player, exists := pm.players[playerID]; exists {
		oldRadius := player.Radius
		player.Mass += massGain

		// Новый радиус на основе массы (обратная формула)
		newRadius := player.Radius * 1.1 // Простое увеличение на 10%
		if massGain > 1.0 {
			newRadius = player.Radius * 1.2 // Больший рост для большой еды
		}

		player.Radius = newRadius

		// Обновляем в коллайдере (нужно пересоздать объект)
		pm.collider.AddObject(player)

		fmt.Printf("[PlayerManager] Игрок %s вырос с %.2f до %.2f (прирост массы: %.2f)\n",
			playerID, oldRadius, newRadius, massGain)
	}
}

// GetPlayer возвращает игрока по ID
func (pm *PlayerManager) GetPlayer(playerID string) *CollidableObject {
	return pm.players[playerID]
}

// RunCollisionDemo запускает демонстрацию системы коллизий
func RunCollisionDemo() {
	fmt.Println("=== ДЕМОНСТРАЦИЯ СИСТЕМЫ КОЛЛИЗИЙ ===")

	// Создаем коллайдер диспетчер
	// Размер ячейки = 2.0 (оптимально для объектов размером 0.1-1.0)
	collider := NewColliderDispatcher(2.0)

	// Создаем систему еды
	worldSize := 50.0
	foodManager := NewFoodManager(collider, worldSize)

	// Создаем менеджер игроков
	playerManager := NewPlayerManager(collider)

	// Добавляем несколько игроков
	playerManager.AddPlayer("player1", Vector3{X: 0, Y: 0, Z: 0}, 1.0)
	playerManager.AddPlayer("player2", Vector3{X: 5, Y: 0, Z: 0}, 0.8)
	playerManager.AddPlayer("player3", Vector3{X: -3, Y: 2, Z: 1}, 1.2)

	fmt.Printf("\n[Demo] Создано %d игроков в мире размером %.0f\n",
		len(playerManager.players), worldSize)

	// Симулируем игровой цикл
	fmt.Println("\n=== НАЧИНАЕМ СИМУЛЯЦИЮ ===")

	rng := rand.New(rand.NewSource(time.Now().UnixNano()))

	for tick := 0; tick < 20; tick++ {
		fmt.Printf("\n--- ТИК %d ---\n", tick+1)

		// Обновляем систему еды
		foodManager.Update()

		// Двигаем игроков случайным образом
		for playerID, player := range playerManager.players {
			// Случайное движение
			newPos := Vector3{
				X: player.Position.X + (rng.Float64()-0.5)*2.0,
				Y: player.Position.Y + (rng.Float64()-0.5)*2.0,
				Z: player.Position.Z + (rng.Float64()-0.5)*2.0,
			}

			// Ограничиваем мир
			if newPos.X > worldSize/2 {
				newPos.X = worldSize / 2
			}
			if newPos.X < -worldSize/2 {
				newPos.X = -worldSize / 2
			}
			if newPos.Y > worldSize/2 {
				newPos.Y = worldSize / 2
			}
			if newPos.Y < -worldSize/2 {
				newPos.Y = -worldSize / 2
			}
			if newPos.Z > worldSize/2 {
				newPos.Z = worldSize / 2
			}
			if newPos.Z < -worldSize/2 {
				newPos.Z = -worldSize / 2
			}

			playerManager.MovePlayer(playerID, newPos)
		}

		// Обрабатываем коллизии с едой
		massGains := foodManager.ProcessAllFoodCollisions()

		// Применяем рост игроков
		for playerID, massGain := range massGains {
			if massGain > 0 {
				playerManager.GrowPlayer(playerID, massGain)
			}
		}

		// Выводим статистику каждые 5 тиков
		if (tick+1)%5 == 0 {
			fmt.Println("\n--- СТАТИСТИКА ---")

			// Статистика игроков
			for playerID, player := range playerManager.players {
				fmt.Printf("Игрок %s: позиция(%.1f,%.1f,%.1f), радиус=%.2f, масса=%.1f\n",
					playerID, player.Position.X, player.Position.Y, player.Position.Z,
					player.Radius, player.Mass)
			}

			// Статистика еды
			foodStats := foodManager.GetStats()
			fmt.Printf("Еда в мире: %d/%d\n",
				foodStats["total_food"], foodStats["max_food"])

			// Статистика коллайдера
			fmt.Printf("Всего объектов в коллайдере: %d\n", collider.GetObjectCount())
		}

		// Пауза между тиками
		time.Sleep(200 * time.Millisecond)
	}

	fmt.Println("\n=== ДЕМОНСТРАЦИЯ ЗАВЕРШЕНА ===")

	// Финальная статистика
	fmt.Println("\n--- ФИНАЛЬНЫЕ РЕЗУЛЬТАТЫ ---")
	for playerID, player := range playerManager.players {
		fmt.Printf("Игрок %s: финальный радиус=%.2f, масса=%.1f\n",
			playerID, player.Radius, player.Mass)
	}

	foodStats := foodManager.GetStats()
	fmt.Printf("Еды осталось в мире: %d\n", foodStats["total_food"])
}

// BenchmarkCollisions тестирует производительность системы коллизий
func BenchmarkCollisions() {
	fmt.Println("\n=== ТЕСТ ПРОИЗВОДИТЕЛЬНОСТИ ===")

	collider := NewColliderDispatcher(5.0) // Больший размер ячейки для теста

	// Создаем много объектов
	objectCount := 5000
	rng := rand.New(rand.NewSource(time.Now().UnixNano()))

	fmt.Printf("Создаем %d объектов...\n", objectCount)

	start := time.Now()

	// Добавляем объекты
	for i := 0; i < objectCount; i++ {
		obj := &CollidableObject{
			ID: fmt.Sprintf("obj_%d", i),
			Position: Vector3{
				X: (rng.Float64() - 0.5) * 100,
				Y: (rng.Float64() - 0.5) * 100,
				Z: (rng.Float64() - 0.5) * 100,
			},
			Radius:   rng.Float64()*0.5 + 0.1,
			Type:     "test",
			Mass:     1.0,
			IsStatic: true,
		}
		collider.AddObject(obj)
	}

	addTime := time.Since(start)
	fmt.Printf("Добавление %d объектов заняло: %v\n", objectCount, addTime)

	// Тест поиска коллизий
	start = time.Now()

	collisions := collider.GetAllCollisions()

	searchTime := time.Since(start)
	fmt.Printf("Поиск всех коллизий среди %d объектов занял: %v\n", objectCount, searchTime)
	fmt.Printf("Найдено коллизий: %d\n", len(collisions))

	// Тест обновления позиций
	start = time.Now()

	for i := 0; i < 100; i++ {
		objID := fmt.Sprintf("obj_%d", rng.Intn(objectCount))
		newPos := Vector3{
			X: (rng.Float64() - 0.5) * 100,
			Y: (rng.Float64() - 0.5) * 100,
			Z: (rng.Float64() - 0.5) * 100,
		}
		collider.UpdateObjectPosition(objID, newPos)
	}

	updateTime := time.Since(start)
	fmt.Printf("Обновление позиций 100 объектов заняло: %v\n", updateTime)

	fmt.Println("=== ТЕСТ ПРОИЗВОДИТЕЛЬНОСТИ ЗАВЕРШЕН ===")
}
