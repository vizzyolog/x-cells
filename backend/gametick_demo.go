package main

import (
	"fmt"
	"log"
	"math/rand"
	"os"
	"time"
)

// RunGameTickDemo запускает демонстрацию игрового тика
func RunGameTickDemo() {
	fmt.Println("=== ДЕМОНСТРАЦИЯ ИГРОВОГО ТИКА ===")

	// Создаем логгер
	logger := log.New(os.Stdout, "[GAME] ", log.LstdFlags|log.Lmicroseconds)

	// Создаем игровой тикер (20 TPS)
	gameTicker := NewGameTicker(20, logger)

	// Создаем основные компоненты игры
	collider := NewColliderDispatcher(2.0)
	foodManager := NewFoodManager(collider, 50.0)
	playerManager := NewPlayerManager(collider)

	// Добавляем тестовых игроков
	playerManager.AddPlayer("player1", Vector3{X: 0, Y: 0, Z: 0}, 1.0)
	playerManager.AddPlayer("player2", Vector3{X: 5, Y: 0, Z: 0}, 0.8)
	playerManager.AddPlayer("player3", Vector3{X: -3, Y: 2, Z: 1}, 1.2)

	// Регистрируем игровые системы в порядке приоритета
	gameTicker.RegisterSystem(NewPlayerMovementSystem(playerManager))                   // Приоритет 5
	gameTicker.RegisterSystem(NewCollisionSystem(collider, foodManager, playerManager)) // Приоритет 10
	gameTicker.RegisterSystem(NewFoodRespawnSystem(foodManager))                        // Приоритет 20
	gameTicker.RegisterSystem(NewNetworkSyncSystem())                                   // Приоритет 100

	logger.Printf("Все системы зарегистрированы, запускаем игровой цикл...")

	// Запускаем игровой цикл
	err := gameTicker.Start()
	if err != nil {
		logger.Fatalf("Ошибка запуска игрового тика: %v", err)
	}

	// Имитируем игровые действия
	go simulateGameplay(playerManager, logger)

	// Периодически выводим статистику
	go printPeriodicStats(gameTicker, logger)

	// Работаем 10 секунд
	time.Sleep(10 * time.Second)

	// Останавливаем игровой цикл
	gameTicker.Stop()

	// Финальная статистика
	time.Sleep(100 * time.Millisecond) // Даем время завершить последние операции
	gameTicker.PrintDetailedStats()
}

// RunPerformanceStressTest запускает стресс-тест производительности
func RunPerformanceStressTest() {
	fmt.Println("\n=== СТРЕСС-ТЕСТ ПРОИЗВОДИТЕЛЬНОСТИ ===")

	logger := log.New(os.Stdout, "[STRESS] ", log.LstdFlags|log.Lmicroseconds)

	// Создаем тикер с высокой частотой (60 TPS)
	gameTicker := NewGameTicker(60, logger)

	// Создаем компоненты
	collider := NewColliderDispatcher(3.0)
	foodManager := NewFoodManager(collider, 100.0)
	playerManager := NewPlayerManager(collider)

	// Добавляем много игроков для нагрузки
	for i := 0; i < 50; i++ {
		playerID := fmt.Sprintf("stress_player_%d", i)
		pos := Vector3{
			X: (rand.Float64() - 0.5) * 80,
			Y: (rand.Float64() - 0.5) * 80,
			Z: (rand.Float64() - 0.5) * 80,
		}
		playerManager.AddPlayer(playerID, pos, 0.5+rand.Float64()*1.0)
	}

	// Регистрируем основные системы
	gameTicker.RegisterSystem(NewPlayerMovementSystem(playerManager))
	gameTicker.RegisterSystem(NewCollisionSystem(collider, foodManager, playerManager))
	gameTicker.RegisterSystem(NewFoodRespawnSystem(foodManager))

	// Добавляем системы для создания искусственной нагрузки
	gameTicker.RegisterSystem(NewPerformanceTestSystem("cpu", 1*time.Millisecond))
	gameTicker.RegisterSystem(NewPerformanceTestSystem("memory", 0))

	logger.Printf("Стресс-тест: 50 игроков, 60 TPS, искусственная нагрузка")

	// Запускаем
	err := gameTicker.Start()
	if err != nil {
		logger.Fatalf("Ошибка запуска стресс-теста: %v", err)
	}

	// Имитируем интенсивную активность
	go intensiveGameplay(playerManager, logger)

	// Мониторим каждую секунду
	go printStressStats(gameTicker, logger)

	// Работаем 15 секунд
	time.Sleep(15 * time.Second)

	gameTicker.Stop()
	time.Sleep(100 * time.Millisecond)

	// Финальная статистика стресс-теста
	logger.Printf("\n=== РЕЗУЛЬТАТЫ СТРЕСС-ТЕСТА ===")
	gameTicker.PrintDetailedStats()
}

// simulateGameplay имитирует игровую активность
func simulateGameplay(playerManager *PlayerManager, logger *log.Logger) {
	rng := rand.New(rand.NewSource(time.Now().UnixNano()))

	for i := 0; i < 100; i++ {
		// Двигаем случайного игрока
		playerIDs := []string{"player1", "player2", "player3"}
		playerID := playerIDs[rng.Intn(len(playerIDs))]

		if player := playerManager.GetPlayer(playerID); player != nil {
			newPos := Vector3{
				X: player.Position.X + (rng.Float64()-0.5)*3.0,
				Y: player.Position.Y + (rng.Float64()-0.5)*3.0,
				Z: player.Position.Z + (rng.Float64()-0.5)*3.0,
			}

			// Ограничиваем мир
			if newPos.X > 25 {
				newPos.X = 25
			}
			if newPos.X < -25 {
				newPos.X = -25
			}
			if newPos.Y > 25 {
				newPos.Y = 25
			}
			if newPos.Y < -25 {
				newPos.Y = -25
			}
			if newPos.Z > 25 {
				newPos.Z = 25
			}
			if newPos.Z < -25 {
				newPos.Z = -25
			}

			playerManager.MovePlayer(playerID, newPos)
		}

		time.Sleep(100 * time.Millisecond)
	}
}

// intensiveGameplay создает интенсивную нагрузку для стресс-теста
func intensiveGameplay(playerManager *PlayerManager, logger *log.Logger) {
	rng := rand.New(rand.NewSource(time.Now().UnixNano()))

	for i := 0; i < 1000; i++ {
		// Двигаем много игроков одновременно
		for j := 0; j < 10; j++ {
			playerID := fmt.Sprintf("stress_player_%d", rng.Intn(50))

			if player := playerManager.GetPlayer(playerID); player != nil {
				newPos := Vector3{
					X: player.Position.X + (rng.Float64()-0.5)*5.0,
					Y: player.Position.Y + (rng.Float64()-0.5)*5.0,
					Z: player.Position.Z + (rng.Float64()-0.5)*5.0,
				}

				// Ограничиваем мир
				if newPos.X > 50 {
					newPos.X = 50
				}
				if newPos.X < -50 {
					newPos.X = -50
				}
				if newPos.Y > 50 {
					newPos.Y = 50
				}
				if newPos.Y < -50 {
					newPos.Y = -50
				}
				if newPos.Z > 50 {
					newPos.Z = 50
				}
				if newPos.Z < -50 {
					newPos.Z = -50
				}

				playerManager.MovePlayer(playerID, newPos)
			}
		}

		time.Sleep(50 * time.Millisecond)
	}
}

// printPeriodicStats выводит статистику каждые 2 секунды
func printPeriodicStats(gameTicker *GameTicker, logger *log.Logger) {
	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()

	for i := 0; i < 5; i++ {
		<-ticker.C

		stats := gameTicker.GetStats()
		logger.Printf("=== СТАТИСТИКА ТИК %d ===", i+1)
		logger.Printf("TPS: %.1f/%.0f, Тиков: %d, Среднее время: %v",
			stats["actual_tps"], stats["target_tps"], stats["tick_count"], stats["average_tick_time"])

		if stats["skipped_ticks"].(uint64) > 0 {
			logger.Printf("ВНИМАНИЕ: Пропущено тиков: %d", stats["skipped_ticks"])
		}
	}
}

// printStressStats выводит статистику для стресс-теста каждую секунду
func printStressStats(gameTicker *GameTicker, logger *log.Logger) {
	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()

	for i := 0; i < 15; i++ {
		<-ticker.C

		stats := gameTicker.GetStats()
		logger.Printf("Стресс %ds: TPS=%.1f, ТикВремя=%v, Пропущено=%d",
			i+1, stats["actual_tps"], stats["average_tick_time"], stats["skipped_ticks"])

		// Предупреждения о производительности
		if actualTPS := stats["actual_tps"].(float64); actualTPS < 50.0 {
			logger.Printf("ПРЕДУПРЕЖДЕНИЕ: TPS упал ниже 50! Текущий: %.1f", actualTPS)
		}

		if avgTime := stats["average_tick_time"].(time.Duration); avgTime > 20*time.Millisecond {
			logger.Printf("ПРЕДУПРЕЖДЕНИЕ: Среднее время тика превышает 20ms: %v", avgTime)
		}
	}
}

// RunGameTickPauseDemo демонстрирует паузу/возобновление игрового цикла
func RunGameTickPauseDemo() {
	fmt.Println("\n=== ДЕМОНСТРАЦИЯ ПАУЗЫ/ВОЗОБНОВЛЕНИЯ ===")

	logger := log.New(os.Stdout, "[PAUSE] ", log.LstdFlags)
	gameTicker := NewGameTicker(10, logger) // 10 TPS для наглядности

	// Добавляем простую систему
	gameTicker.RegisterSystem(NewPerformanceTestSystem("memory", 0))

	logger.Printf("Запускаем игровой цикл...")
	gameTicker.Start()

	time.Sleep(2 * time.Second)

	logger.Printf("Ставим на паузу...")
	gameTicker.Pause()

	time.Sleep(3 * time.Second)

	logger.Printf("Возобновляем...")
	gameTicker.Resume()

	time.Sleep(2 * time.Second)

	logger.Printf("Останавливаем...")
	gameTicker.Stop()

	time.Sleep(100 * time.Millisecond)
	gameTicker.PrintDetailedStats()
}
