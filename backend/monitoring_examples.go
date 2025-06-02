package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"time"
)

// MonitoringManager управляет мониторингом игрового сервера
type MonitoringManager struct {
	gameTicker *GameTicker
	logger     *log.Logger
	alerts     []PerformanceAlert
}

// PerformanceAlert представляет предупреждение о производительности
type PerformanceAlert struct {
	Timestamp time.Time `json:"timestamp"`
	Level     string    `json:"level"`  // "warning", "critical"
	System    string    `json:"system"` // название системы
	Message   string    `json:"message"`
	Value     string    `json:"value"`     // значение метрики
	Threshold string    `json:"threshold"` // пороговое значение
}

// NewMonitoringManager создает новый менеджер мониторинга
func NewMonitoringManager(gameTicker *GameTicker) *MonitoringManager {
	return &MonitoringManager{
		gameTicker: gameTicker,
		logger:     log.New(os.Stdout, "[MONITOR] ", log.LstdFlags),
		alerts:     make([]PerformanceAlert, 0),
	}
}

// 1. ПРОВЕРКА ОБЩЕГО СОСТОЯНИЯ СЕРВЕРА
func (mm *MonitoringManager) CheckServerHealth() map[string]interface{} {
	stats := mm.gameTicker.GetStats()

	health := map[string]interface{}{
		"status": "healthy",
		"issues": []string{},
	}

	// Проверяем TPS
	actualTPS := stats["actual_tps"].(float64)
	targetTPS := float64(stats["target_tps"].(int))

	if actualTPS < targetTPS*0.9 {
		health["status"] = "degraded"
		health["issues"] = append(health["issues"].([]string),
			fmt.Sprintf("TPS снижен: %.1f/%.0f", actualTPS, targetTPS))
	}

	// Проверяем время тика
	avgTickTime := stats["average_tick_time"].(time.Duration)
	targetTickTime := time.Second / time.Duration(targetTPS)

	if avgTickTime > targetTickTime/2 {
		health["status"] = "warning"
		health["issues"] = append(health["issues"].([]string),
			fmt.Sprintf("Медленные тики: %v (норма: <%v)", avgTickTime, targetTickTime/2))
	}

	// Проверяем пропущенные тики
	skippedTicks := stats["skipped_ticks"].(uint64)
	if skippedTicks > 0 {
		health["status"] = "critical"
		health["issues"] = append(health["issues"].([]string),
			fmt.Sprintf("Пропущено тиков: %d", skippedTicks))
	}

	health["stats"] = stats
	return health
}

// 2. АНАЛИЗ УЗКИХ МЕСТ
func (mm *MonitoringManager) FindBottlenecks() []BottleneckReport {
	stats := mm.gameTicker.GetStats()
	systemsStats := stats["systems"].(map[string]interface{})

	var bottlenecks []BottleneckReport

	targetTickTime := time.Second / time.Duration(stats["target_tps"].(int))
	warningThreshold := targetTickTime / 4 // 25% от времени тика

	for systemName, systemStatsInterface := range systemsStats {
		systemStats := systemStatsInterface.(map[string]interface{})
		avgTime := systemStats["average_time"].(time.Duration)
		maxTime := systemStats["max_time"].(time.Duration)

		severity := "none"
		if avgTime > warningThreshold {
			severity = "warning"
		}
		if avgTime > warningThreshold*2 {
			severity = "critical"
		}

		if severity != "none" {
			bottlenecks = append(bottlenecks, BottleneckReport{
				System:         systemName,
				Severity:       severity,
				AverageTime:    avgTime,
				MaxTime:        maxTime,
				PercentOfTick:  float64(avgTime) / float64(targetTickTime) * 100,
				Recommendation: mm.getOptimizationTip(systemName, avgTime),
			})
		}
	}

	return bottlenecks
}

type BottleneckReport struct {
	System         string        `json:"system"`
	Severity       string        `json:"severity"`
	AverageTime    time.Duration `json:"average_time"`
	MaxTime        time.Duration `json:"max_time"`
	PercentOfTick  float64       `json:"percent_of_tick"`
	Recommendation string        `json:"recommendation"`
}

// 3. АВТОМАТИЧЕСКИЙ МОНИТОРИНГ С АЛЕРТАМИ
func (mm *MonitoringManager) StartContinuousMonitoring(interval time.Duration) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	mm.logger.Printf("Запуск непрерывного мониторинга с интервалом %v", interval)

	go func() {
		for range ticker.C {
			mm.checkAndAlert()
		}
	}()
}

func (mm *MonitoringManager) checkAndAlert() {
	health := mm.CheckServerHealth()

	if health["status"] != "healthy" {
		alert := PerformanceAlert{
			Timestamp: time.Now(),
			Level:     health["status"].(string),
			System:    "GameServer",
			Message:   fmt.Sprintf("Проблемы сервера: %v", health["issues"]),
		}

		mm.addAlert(alert)
		mm.logger.Printf("АЛЕРТ [%s]: %s", alert.Level, alert.Message)
	}

	// Проверяем каждую систему
	bottlenecks := mm.FindBottlenecks()
	for _, bottleneck := range bottlenecks {
		if bottleneck.Severity == "critical" {
			alert := PerformanceAlert{
				Timestamp: time.Now(),
				Level:     "critical",
				System:    bottleneck.System,
				Message:   fmt.Sprintf("Критическая медлительность системы"),
				Value:     bottleneck.AverageTime.String(),
				Threshold: fmt.Sprintf("%.1f%% от тика", bottleneck.PercentOfTick),
			}

			mm.addAlert(alert)
			mm.logger.Printf("КРИТИЧЕСКИЙ АЛЕРТ: Система %s занимает %.1f%% времени тика (%v)",
				bottleneck.System, bottleneck.PercentOfTick, bottleneck.AverageTime)
		}
	}
}

// 4. HTTP API ДЛЯ МОНИТОРИНГА
func (mm *MonitoringManager) SetupHTTPMonitoring(port int) {
	mux := http.NewServeMux()

	// Эндпоинт для общей статистики
	mux.HandleFunc("/stats", func(w http.ResponseWriter, r *http.Request) {
		stats := mm.gameTicker.GetStats()
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(stats)
	})

	// Эндпоинт для проверки здоровья
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		health := mm.CheckServerHealth()
		w.Header().Set("Content-Type", "application/json")

		if health["status"] == "healthy" {
			w.WriteHeader(http.StatusOK)
		} else {
			w.WriteHeader(http.StatusServiceUnavailable)
		}

		json.NewEncoder(w).Encode(health)
	})

	// Эндпоинт для анализа узких мест
	mux.HandleFunc("/bottlenecks", func(w http.ResponseWriter, r *http.Request) {
		bottlenecks := mm.FindBottlenecks()
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(bottlenecks)
	})

	// Эндпоинт для получения алертов
	mux.HandleFunc("/alerts", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(mm.alerts)
	})

	// Эндпоинт для управления сервером
	mux.HandleFunc("/control", func(w http.ResponseWriter, r *http.Request) {
		action := r.URL.Query().Get("action")

		switch action {
		case "pause":
			mm.gameTicker.Pause()
			fmt.Fprintf(w, "Игровой цикл приостановлен")
		case "resume":
			mm.gameTicker.Resume()
			fmt.Fprintf(w, "Игровой цикл возобновлен")
		case "stats":
			mm.gameTicker.PrintDetailedStats()
			fmt.Fprintf(w, "Статистика выведена в лог")
		default:
			http.Error(w, "Неизвестное действие. Доступно: pause, resume, stats", http.StatusBadRequest)
		}
	})

	addr := fmt.Sprintf(":%d", port)
	mm.logger.Printf("HTTP мониторинг запущен на порту %d", port)
	mm.logger.Printf("Доступные эндпоинты:")
	mm.logger.Printf("  GET /stats - общая статистика")
	mm.logger.Printf("  GET /health - состояние сервера")
	mm.logger.Printf("  GET /bottlenecks - анализ узких мест")
	mm.logger.Printf("  GET /alerts - список алертов")
	mm.logger.Printf("  POST /control?action=pause/resume/stats - управление")

	go http.ListenAndServe(addr, mux)
}

// 5. СИСТЕМА РЕКОМЕНДАЦИЙ ПО ОПТИМИЗАЦИИ
func (mm *MonitoringManager) getOptimizationTip(systemName string, avgTime time.Duration) string {
	switch systemName {
	case "CollisionSystem":
		if avgTime > 5*time.Millisecond {
			return "Рекомендуется: увеличить размер ячеек spatial grid или уменьшить количество объектов"
		}
		return "Рекомендуется: проверить алгоритм поиска коллизий и spatial partitioning"

	case "FoodRespawnSystem":
		return "Рекомендуется: увеличить интервал респавна или уменьшить количество одновременно создаваемой еды"

	case "NetworkSyncSystem":
		return "Рекомендуется: оптимизировать сериализацию данных или снизить частоту отправки обновлений"

	case "PlayerMovementSystem":
		return "Рекомендуется: оптимизировать обработку input'а или использовать батчинг движений"

	default:
		return "Рекомендуется: профилировать систему и оптимизировать узкие места"
	}
}

// 6. ЭКСПОРТ МЕТРИК ДЛЯ ВНЕШНИХ СИСТЕМ
func (mm *MonitoringManager) ExportMetrics() map[string]float64 {
	stats := mm.gameTicker.GetStats()
	systemsStats := stats["systems"].(map[string]interface{})

	metrics := map[string]float64{
		"game_tps_actual":           stats["actual_tps"].(float64),
		"game_tps_target":           float64(stats["target_tps"].(int)),
		"game_tick_count":           float64(stats["tick_count"].(uint64)),
		"game_uptime_seconds":       stats["uptime_seconds"].(float64),
		"game_average_tick_time_ms": float64(stats["average_tick_time"].(time.Duration)) / float64(time.Millisecond),
		"game_max_tick_time_ms":     float64(stats["max_observed_tick"].(time.Duration)) / float64(time.Millisecond),
		"game_skipped_ticks":        float64(stats["skipped_ticks"].(uint64)),
		"game_systems_count":        float64(stats["systems_count"].(int)),
	}

	// Добавляем метрики по каждой системе
	for systemName, systemStatsInterface := range systemsStats {
		systemStats := systemStatsInterface.(map[string]interface{})
		prefix := fmt.Sprintf("system_%s_", systemName)

		metrics[prefix+"avg_time_ms"] = float64(systemStats["average_time"].(time.Duration)) / float64(time.Millisecond)
		metrics[prefix+"max_time_ms"] = float64(systemStats["max_time"].(time.Duration)) / float64(time.Millisecond)
		metrics[prefix+"executions"] = float64(systemStats["total_executions"].(uint64))
		metrics[prefix+"errors"] = float64(systemStats["errors"].(uint64))
	}

	return metrics
}

// Вспомогательные методы
func (mm *MonitoringManager) addAlert(alert PerformanceAlert) {
	mm.alerts = append(mm.alerts, alert)

	// Ограничиваем количество алертов (храним только последние 100)
	if len(mm.alerts) > 100 {
		mm.alerts = mm.alerts[len(mm.alerts)-100:]
	}
}

// RunMonitoringDemo демонстрирует использование мониторинга
func RunMonitoringDemo() {
	fmt.Println("=== ДЕМОНСТРАЦИЯ МОНИТОРИНГА ===")

	// Создаем игровой тикер
	logger := log.New(os.Stdout, "[DEMO] ", log.LstdFlags)
	gameTicker := NewGameTicker(30, logger) // 30 TPS

	// Создаем игровые системы
	collider := NewColliderDispatcher(2.0)
	foodManager := NewFoodManager(collider, 50.0)
	playerManager := NewPlayerManager(collider)

	// Добавляем несколько игроков
	for i := 0; i < 10; i++ {
		playerID := fmt.Sprintf("player_%d", i)
		pos := Vector3{X: float64(i * 2), Y: 0, Z: 0}
		playerManager.AddPlayer(playerID, pos, 1.0)
	}

	// Регистрируем системы
	gameTicker.RegisterSystem(NewCollisionSystem(collider, foodManager, playerManager))
	gameTicker.RegisterSystem(NewFoodRespawnSystem(foodManager))
	gameTicker.RegisterSystem(NewPerformanceTestSystem("cpu", 2*time.Millisecond)) // Искусственная нагрузка

	// Создаем менеджер мониторинга
	monitor := NewMonitoringManager(gameTicker)

	// Запускаем HTTP мониторинг
	monitor.SetupHTTPMonitoring(9090)

	// Запускаем игровой цикл
	gameTicker.Start()

	// Запускаем непрерывный мониторинг
	monitor.StartContinuousMonitoring(2 * time.Second)

	// Даем поработать системе
	time.Sleep(10 * time.Second)

	// Демонстрируем различные проверки
	fmt.Println("\n=== ПРОВЕРКА СОСТОЯНИЯ СЕРВЕРА ===")
	health := monitor.CheckServerHealth()
	healthJSON, _ := json.MarshalIndent(health, "", "  ")
	fmt.Println(string(healthJSON))

	fmt.Println("\n=== АНАЛИЗ УЗКИХ МЕСТ ===")
	bottlenecks := monitor.FindBottlenecks()
	for _, bottleneck := range bottlenecks {
		fmt.Printf("Система: %s, Серьезность: %s, Время: %v (%.1f%% тика)\n",
			bottleneck.System, bottleneck.Severity, bottleneck.AverageTime, bottleneck.PercentOfTick)
		fmt.Printf("  Рекомендация: %s\n", bottleneck.Recommendation)
	}

	fmt.Println("\n=== ЭКСПОРТ МЕТРИК ===")
	metrics := monitor.ExportMetrics()
	for name, value := range metrics {
		fmt.Printf("%s: %.2f\n", name, value)
	}

	gameTicker.Stop()

	fmt.Println("\n=== HTTP МОНИТОРИНГ ===")
	fmt.Println("Мониторинг доступен по адресу:")
	fmt.Println("  http://localhost:9090/health")
	fmt.Println("  http://localhost:9090/stats")
	fmt.Println("  http://localhost:9090/bottlenecks")
	fmt.Println("  http://localhost:9090/alerts")
}
