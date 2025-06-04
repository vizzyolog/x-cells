package main

import (
	"time"
)

// CollisionSystem обертка для системы коллизий, реализующая TickSystem
type CollisionSystem struct {
	name          string
	priority      int
	collider      *ColliderDispatcher
	foodManager   *FoodManager
	playerManager *PlayerManager
}

// NewCollisionSystem создает новую систему коллизий для GameTicker
func NewCollisionSystem(collider *ColliderDispatcher, foodManager *FoodManager, playerManager *PlayerManager) *CollisionSystem {
	return &CollisionSystem{
		name:          "CollisionSystem",
		priority:      10, // Средний приоритет
		collider:      collider,
		foodManager:   foodManager,
		playerManager: playerManager,
	}
}

// Update обновляет систему коллизий
func (cs *CollisionSystem) Update(deltaTime time.Duration) error {
	if cs.foodManager == nil || cs.playerManager == nil {
		return nil // Нечего обрабатывать
	}

	// Обрабатываем коллизии еды с игроками
	massGains := cs.foodManager.ProcessAllFoodCollisions()

	// Применяем рост игроков
	for playerID, massGain := range massGains {
		if massGain > 0 {
			cs.playerManager.GrowPlayer(playerID, massGain)
		}
	}

	return nil
}

// GetName возвращает имя системы
func (cs *CollisionSystem) GetName() string {
	return cs.name
}

// GetPriority возвращает приоритет системы
func (cs *CollisionSystem) GetPriority() int {
	return cs.priority
}

// FoodRespawnSystem система автоматического респавна еды
type FoodRespawnSystem struct {
	name        string
	priority    int
	foodManager *FoodManager
}

// NewFoodRespawnSystem создает новую систему респавна еды
func NewFoodRespawnSystem(foodManager *FoodManager) *FoodRespawnSystem {
	return &FoodRespawnSystem{
		name:        "FoodRespawnSystem",
		priority:    20, // Низкий приоритет - выполняется после коллизий
		foodManager: foodManager,
	}
}

// Update обновляет систему респавна еды
func (frs *FoodRespawnSystem) Update(deltaTime time.Duration) error {
	if frs.foodManager != nil {
		frs.foodManager.Update()
	}
	return nil
}

// GetName возвращает имя системы
func (frs *FoodRespawnSystem) GetName() string {
	return frs.name
}

// GetPriority возвращает приоритет системы
func (frs *FoodRespawnSystem) GetPriority() int {
	return frs.priority
}

// PlayerMovementSystem система обновления позиций игроков (заготовка)
type PlayerMovementSystem struct {
	name          string
	priority      int
	playerManager *PlayerManager
	// Здесь будет логика обновления позиций игроков на основе input'а
}

// NewPlayerMovementSystem создает новую систему движения игроков
func NewPlayerMovementSystem(playerManager *PlayerManager) *PlayerMovementSystem {
	return &PlayerMovementSystem{
		name:          "PlayerMovementSystem",
		priority:      5, // Высокий приоритет - движение обрабатывается первым
		playerManager: playerManager,
	}
}

// Update обновляет позиции игроков
func (pms *PlayerMovementSystem) Update(deltaTime time.Duration) error {
	// TODO: Здесь будет обработка input'а от клиентов и обновление позиций
	// Пока что это заглушка

	return nil
}

// GetName возвращает имя системы
func (pms *PlayerMovementSystem) GetName() string {
	return pms.name
}

// GetPriority возвращает приоритет системы
func (pms *PlayerMovementSystem) GetPriority() int {
	return pms.priority
}

// NetworkSyncSystem система синхронизации состояния с клиентами (заготовка)
type NetworkSyncSystem struct {
	name     string
	priority int
	// Здесь будет WebSocket менеджер для отправки обновлений клиентам
}

// NewNetworkSyncSystem создает новую систему сетевой синхронизации
func NewNetworkSyncSystem() *NetworkSyncSystem {
	return &NetworkSyncSystem{
		name:     "NetworkSyncSystem",
		priority: 100, // Самый низкий приоритет - синхронизация в конце тика
	}
}

// Update отправляет обновления клиентам
func (nss *NetworkSyncSystem) Update(deltaTime time.Duration) error {
	// TODO: Здесь будет отправка обновлений всем подключенным клиентам
	// Пока что это заглушка

	return nil
}

// GetName возвращает имя системы
func (nss *NetworkSyncSystem) GetName() string {
	return nss.name
}

// GetPriority возвращает приоритет системы
func (nss *NetworkSyncSystem) GetPriority() int {
	return nss.priority
}

// PerformanceTestSystem система для тестирования производительности
type PerformanceTestSystem struct {
	name         string
	priority     int
	workloadType string
	workDuration time.Duration
}

// NewPerformanceTestSystem создает систему для тестирования производительности
func NewPerformanceTestSystem(workloadType string, workDuration time.Duration) *PerformanceTestSystem {
	return &PerformanceTestSystem{
		name:         "PerformanceTest_" + workloadType,
		priority:     50, // Средний приоритет
		workloadType: workloadType,
		workDuration: workDuration,
	}
}

// Update имитирует нагрузку для тестирования производительности
func (pts *PerformanceTestSystem) Update(deltaTime time.Duration) error {
	switch pts.workloadType {
	case "cpu":
		// Имитируем CPU нагрузку
		end := time.Now().Add(pts.workDuration)
		for time.Now().Before(end) {
			// Пустой цикл для нагрузки на CPU
		}
	case "sleep":
		// Имитируем блокирующую операцию
		time.Sleep(pts.workDuration)
	case "memory":
		// Имитируем работу с памятью
		data := make([]byte, 1024*1024) // 1MB
		for i := range data {
			data[i] = byte(i % 256)
		}
	}

	return nil
}

// GetName возвращает имя системы
func (pts *PerformanceTestSystem) GetName() string {
	return pts.name
}

// GetPriority возвращает приоритет системы
func (pts *PerformanceTestSystem) GetPriority() int {
	return pts.priority
}
