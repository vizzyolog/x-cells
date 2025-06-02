package game

import (
	"log"
	"time"

	"x-cells/backend/internal/transport"
	"x-cells/backend/internal/world"
)

// WorldUpdateSystem система обновления игрового мира
type WorldUpdateSystem struct {
	name         string
	priority     int
	worldManager *world.Manager
	gameTicker   *GameTicker
	logger       *log.Logger
}

// NewWorldUpdateSystem создает новую систему обновления мира
func NewWorldUpdateSystem(worldManager *world.Manager, gameTicker *GameTicker, logger *log.Logger) *WorldUpdateSystem {
	return &WorldUpdateSystem{
		name:         "WorldUpdateSystem",
		priority:     5, // Высокий приоритет - обновляем мир первым
		worldManager: worldManager,
		gameTicker:   gameTicker,
		logger:       logger,
	}
}

// Update обновляет игровой мир
func (wus *WorldUpdateSystem) Update(deltaTime time.Duration) error {
	// Здесь можно добавить логику обновления объектов мира
	// Например, движение еды, анимации и т.д.

	// Логируем состояние каждые 30 секунд
	if wus.gameTicker.GetTickCount()%600 == 0 { // Каждые 30 секунд при 20 TPS
		wus.logger.Printf("[WorldUpdateSystem] Обновление мира: объектов %d, игроков %d",
			len(wus.worldManager.GetAllObjects()), len(wus.gameTicker.GetAllPlayers()))
	}

	return nil
}

// GetName возвращает имя системы
func (wus *WorldUpdateSystem) GetName() string {
	return wus.name
}

// GetPriority возвращает приоритет системы
func (wus *WorldUpdateSystem) GetPriority() int {
	return wus.priority
}

// PlayerManagementSystem система управления игроками
type PlayerManagementSystem struct {
	name         string
	priority     int
	gameTicker   *GameTicker
	worldManager *world.Manager
	logger       *log.Logger

	// Для очистки неактивных игроков
	inactiveTimeout time.Duration
}

// NewPlayerManagementSystem создает новую систему управления игроками
func NewPlayerManagementSystem(gameTicker *GameTicker, worldManager *world.Manager, logger *log.Logger) *PlayerManagementSystem {
	return &PlayerManagementSystem{
		name:            "PlayerManagementSystem",
		priority:        10, // Средний приоритет
		gameTicker:      gameTicker,
		worldManager:    worldManager,
		logger:          logger,
		inactiveTimeout: 5 * time.Minute, // Удаляем неактивных игроков через 5 минут
	}
}

// Update обновляет состояние игроков
func (pms *PlayerManagementSystem) Update(deltaTime time.Duration) error {
	// Проверяем неактивных игроков
	now := time.Now()
	players := pms.gameTicker.GetAllPlayers()

	var toRemove []string
	for playerID, player := range players {
		if now.Sub(player.LastSeen) > pms.inactiveTimeout {
			toRemove = append(toRemove, playerID)
		}
	}

	// Удаляем неактивных игроков
	for _, playerID := range toRemove {
		pms.gameTicker.RemovePlayer(playerID)
		pms.logger.Printf("[PlayerManagementSystem] Удален неактивный игрок: %s", playerID)
	}

	return nil
}

// GetName возвращает имя системы
func (pms *PlayerManagementSystem) GetName() string {
	return pms.name
}

// GetPriority возвращает приоритет системы
func (pms *PlayerManagementSystem) GetPriority() int {
	return pms.priority
}

// PhysicsUpdateSystem система обновления физики
type PhysicsUpdateSystem struct {
	name          string
	priority      int
	physicsClient transport.IPhysicsClient
	gameTicker    *GameTicker
	logger        *log.Logger
	lastUpdate    time.Time
}

// NewPhysicsUpdateSystem создает новую систему обновления физики
func NewPhysicsUpdateSystem(physicsClient transport.IPhysicsClient, gameTicker *GameTicker, logger *log.Logger) *PhysicsUpdateSystem {
	return &PhysicsUpdateSystem{
		name:          "PhysicsUpdateSystem",
		priority:      15, // Средний приоритет - после управления игроками
		physicsClient: physicsClient,
		gameTicker:    gameTicker,
		logger:        logger,
		lastUpdate:    time.Now(),
	}
}

// Update обновляет физику
func (pus *PhysicsUpdateSystem) Update(deltaTime time.Duration) error {
	// Обновляем физику каждые несколько тиков для производительности
	now := time.Now()
	if now.Sub(pus.lastUpdate) < 50*time.Millisecond { // Максимум 20 FPS для физики
		return nil
	}
	pus.lastUpdate = now

	// Здесь можно добавить логику обновления физики
	// Например, синхронизация позиций игроков с bullet-server

	return nil
}

// GetName возвращает имя системы
func (pus *PhysicsUpdateSystem) GetName() string {
	return pus.name
}

// GetPriority возвращает приоритет системы
func (pus *PhysicsUpdateSystem) GetPriority() int {
	return pus.priority
}

// WebSocketBroadcaster интерфейс для отправки обновлений клиентам
type WebSocketBroadcaster interface {
	BroadcastGameState(gameState map[string]interface{}) error
}

// NetworkSyncSystem система синхронизации состояния с клиентами
type NetworkSyncSystem struct {
	name          string
	priority      int
	gameTicker    *GameTicker
	worldManager  *world.Manager
	logger        *log.Logger
	lastBroadcast time.Time

	// Буфер для оптимизации отправки
	broadcastInterval time.Duration

	// Ссылка на систему еды для получения данных
	foodSystem *FoodSystem

	// WebSocket сервер для отправки обновлений
	wsServer WebSocketBroadcaster
}

// NewNetworkSyncSystem создает новую систему сетевой синхронизации
func NewNetworkSyncSystem(gameTicker *GameTicker, worldManager *world.Manager, logger *log.Logger) *NetworkSyncSystem {
	return &NetworkSyncSystem{
		name:              "NetworkSyncSystem",
		priority:          100, // Самый низкий приоритет - отправляем в конце тика
		gameTicker:        gameTicker,
		worldManager:      worldManager,
		logger:            logger,
		broadcastInterval: 50 * time.Millisecond, // 20 FPS для клиентов
	}
}

// SetFoodSystem устанавливает ссылку на систему еды
func (nss *NetworkSyncSystem) SetFoodSystem(foodSystem *FoodSystem) {
	nss.foodSystem = foodSystem
}

// SetWebSocketServer устанавливает ссылку на WebSocket сервер
func (nss *NetworkSyncSystem) SetWebSocketServer(wsServer WebSocketBroadcaster) {
	nss.wsServer = wsServer
}

// Update отправляет обновления состояния клиентам
func (nss *NetworkSyncSystem) Update(deltaTime time.Duration) error {
	// Ограничиваем частоту отправки
	now := time.Now()
	if now.Sub(nss.lastBroadcast) < nss.broadcastInterval {
		return nil
	}
	nss.lastBroadcast = now

	// Получаем всех игроков
	players := nss.gameTicker.GetAllPlayers()

	// Получаем еду (если система еды доступна)
	var foodItems map[string]*FoodItem
	if nss.foodSystem != nil {
		foodItems = nss.foodSystem.GetFoodItems()
	}

	// Логируем периодически для отладки
	if nss.gameTicker.GetTickCount()%400 == 0 { // Каждые 20 секунд при 20 TPS
		foodCount := 0
		if foodItems != nil {
			foodCount = len(foodItems)
		}
		nss.logger.Printf("[NetworkSyncSystem] Синхронизация: игроков %d, еды %d", len(players), foodCount)
	}

	// Отправляем обновления через WebSocket (если сервер настроен)
	if nss.wsServer != nil && (len(players) > 0 || (foodItems != nil && len(foodItems) > 0)) {
		gameState := map[string]interface{}{
			"type":      "game_state_update",
			"players":   players,
			"food":      foodItems,
			"timestamp": now.UnixMilli(),
			"tickCount": nss.gameTicker.GetTickCount(),
		}

		if err := nss.wsServer.BroadcastGameState(gameState); err != nil {
			nss.logger.Printf("[NetworkSyncSystem] Ошибка отправки обновлений: %v", err)
		}
	}

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

// GameMetricsSystem система сбора игровых метрик
type GameMetricsSystem struct {
	name         string
	priority     int
	gameTicker   *GameTicker
	worldManager *world.Manager
	logger       *log.Logger

	// Счетчики для метрик
	lastMetricsLog  time.Time
	metricsInterval time.Duration
}

// NewGameMetricsSystem создает новую систему сбора метрик
func NewGameMetricsSystem(gameTicker *GameTicker, worldManager *world.Manager, logger *log.Logger) *GameMetricsSystem {
	return &GameMetricsSystem{
		name:            "GameMetricsSystem",
		priority:        200, // Очень низкий приоритет - метрики в самом конце
		gameTicker:      gameTicker,
		worldManager:    worldManager,
		logger:          logger,
		metricsInterval: 30 * time.Second, // Логируем метрики каждые 30 секунд
	}
}

// Update собирает и логирует игровые метрики
func (gms *GameMetricsSystem) Update(deltaTime time.Duration) error {
	now := time.Now()
	if now.Sub(gms.lastMetricsLog) < gms.metricsInterval {
		return nil
	}
	gms.lastMetricsLog = now

	// Собираем метрики
	stats := gms.gameTicker.GetStats()
	players := gms.gameTicker.GetAllPlayers()

	// Логируем основные метрики
	gms.logger.Printf("[GameMetrics] TPS: %.1f/%.0f, Игроков: %d, Тиков: %d, Время тика: %v",
		stats["actual_tps"], stats["target_tps"], len(players),
		stats["tick_count"], stats["average_tick_time"])

	// Проверяем производительность
	if actualTPS := stats["actual_tps"].(float64); actualTPS < float64(stats["target_tps"].(int))*0.9 {
		gms.logger.Printf("[GameMetrics] ПРЕДУПРЕЖДЕНИЕ: TPS снижен до %.1f", actualTPS)
	}

	return nil
}

// GetName возвращает имя системы
func (gms *GameMetricsSystem) GetName() string {
	return gms.name
}

// GetPriority возвращает приоритет системы
func (gms *GameMetricsSystem) GetPriority() int {
	return gms.priority
}
