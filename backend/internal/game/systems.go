package game

import (
	"context"
	"log"
	"time"

	pb "x-cells/backend/internal/physics/generated"
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

// PhysicsPositionSyncSystem система синхронизации позиций игроков из физического движка с GameTicker
type PhysicsPositionSyncSystem struct {
	name          string
	priority      int
	physicsClient transport.IPhysicsClient
	gameTicker    *GameTicker
	objectManager ObjectManager
	logger        *log.Logger
	lastSync      time.Time
	syncInterval  time.Duration
}

// ObjectManager интерфейс для получения объектов игроков
type ObjectManager interface {
	GetAllWorldObjects() []*world.WorldObject
}

// NewPhysicsPositionSyncSystem создает новую систему синхронизации позиций
func NewPhysicsPositionSyncSystem(physicsClient transport.IPhysicsClient, gameTicker *GameTicker, objectManager ObjectManager, logger *log.Logger) *PhysicsPositionSyncSystem {
	return &PhysicsPositionSyncSystem{
		name:          "PhysicsPositionSyncSystem",
		priority:      10, // Высокий приоритет - синхронизируем позиции рано
		physicsClient: physicsClient,
		gameTicker:    gameTicker,
		objectManager: objectManager,
		logger:        logger,
		lastSync:      time.Now(),
		syncInterval:  100 * time.Millisecond, // Синхронизируем каждые 100мс (10 FPS)
	}
}

// Update синхронизирует позиции игроков
func (ppss *PhysicsPositionSyncSystem) Update(deltaTime time.Duration) error {
	// Ограничиваем частоту синхронизации
	now := time.Now()
	if now.Sub(ppss.lastSync) < ppss.syncInterval {
		return nil
	}
	ppss.lastSync = now

	// Получаем всех игроков из GameTicker
	players := ppss.gameTicker.GetAllPlayers()
	if len(players) == 0 {
		return nil
	}

	// Получаем все объекты мира
	worldObjects := ppss.objectManager.GetAllWorldObjects()

	// Создаем карту objectID -> playerID для поиска
	objectToPlayer := make(map[string]string)
	for _, obj := range worldObjects {
		// Объекты игроков обычно содержат "player" в ID
		if len(obj.ID) > 0 && obj.PhysicsType != world.PhysicsTypeAmmo {
			// Ищем игрока, которому принадлежит этот объект
			for playerID := range players {
				// Простая эвристика: если objectID содержит playerID
				if len(playerID) > 10 && len(obj.ID) > 10 {
					// Объекты игроков имеют формат вроде "player_timestamp_objectnum"
					// playerID имеет формат вроде "player_timestamp"
					objectToPlayer[obj.ID] = playerID
					break
				}
			}
		}
	}

	// Логируем периодически для отладки
	if ppss.gameTicker.GetTickCount()%200 == 0 { // Каждые 10 секунд при 20 TPS
		ppss.logger.Printf("[PhysicsPositionSync] Синхронизация: игроков %d, объектов %d, связей %d",
			len(players), len(worldObjects), len(objectToPlayer))
	}

	// Синхронизируем позиции из физического движка
	for objectID, playerID := range objectToPlayer {
		// Получаем состояние объекта из физического движка
		resp, err := ppss.physicsClient.GetObjectState(context.Background(), &pb.GetObjectStateRequest{
			Id: objectID,
		})

		if err != nil {
			// Логируем ошибки только периодически, чтобы не спамить
			if ppss.gameTicker.GetTickCount()%400 == 0 {
				ppss.logger.Printf("[PhysicsPositionSync] Ошибка получения состояния объекта %s: %v", objectID, err)
			}
			continue
		}

		if resp.Status != "OK" || resp.State == nil || resp.State.Position == nil {
			continue
		}

		// Обновляем позицию игрока в GameTicker
		newPos := Vector3{
			X: float64(resp.State.Position.X),
			Y: float64(resp.State.Position.Y),
			Z: float64(resp.State.Position.Z),
		}

		ppss.gameTicker.UpdatePlayerPosition(playerID, newPos)
	}

	return nil
}

// GetName возвращает имя системы
func (ppss *PhysicsPositionSyncSystem) GetName() string {
	return ppss.name
}

// GetPriority возвращает приоритет системы
func (ppss *PhysicsPositionSyncSystem) GetPriority() int {
	return ppss.priority
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
