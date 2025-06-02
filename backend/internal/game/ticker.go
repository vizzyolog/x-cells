package game

import (
	"context"
	"log"
	"math"
	"sync"
	"time"

	"x-cells/backend/internal/world"
)

// GameTicker основной менеджер игрового цикла для x-cells проекта
type GameTicker struct {
	// Конфигурация
	targetTPS    int           // Целевая частота тиков в секунду
	tickDuration time.Duration // Длительность одного тика
	maxTickTime  time.Duration // Максимальное время на один тик

	// Состояние
	isRunning    bool
	isPaused     bool
	tickCount    uint64
	startTime    time.Time
	lastTickTime time.Time

	// Компоненты игры
	worldManager *world.Manager
	players      map[string]*Player // Карта активных игроков
	playersMutex sync.RWMutex

	// Системы
	systems      []TickSystem
	systemsMutex sync.RWMutex

	// Мониторинг производительности
	perfMonitor *PerformanceMonitor

	// Управление
	ctx       context.Context
	cancel    context.CancelFunc
	pauseChan chan bool

	// Метрики
	averageTickTime time.Duration
	maxObservedTick time.Duration
	skippedTicks    uint64

	// Логирование
	logger           *log.Logger
	warningThreshold time.Duration
}

// Player представляет игрока в системе
type Player struct {
	ID       string
	Position Vector3
	Radius   float64
	Health   float64
	Score    int64
	Mass     float64 // Новое поле для системы еды
	LastSeen time.Time
}

// Vector3 представляет 3D вектор
type Vector3 struct {
	X, Y, Z float64
}

// TickSystem интерфейс для всех игровых систем
type TickSystem interface {
	Update(deltaTime time.Duration) error
	GetName() string
	GetPriority() int // Приоритет выполнения (меньше = раньше)
}

// PerformanceMonitor отслеживает производительность каждой системы
type PerformanceMonitor struct {
	systemMetrics map[string]*SystemMetrics
	mutex         sync.RWMutex

	// Настройки мониторинга
	metricsWindow     int           // Количество последних тиков для усреднения
	warningThreshold  time.Duration // Порог предупреждения для системы
	criticalThreshold time.Duration // Критический порог
}

// SystemMetrics метрики производительности системы
type SystemMetrics struct {
	Name              string
	LastExecutionTime time.Duration
	AverageTime       time.Duration
	MaxTime           time.Duration
	TotalExecutions   uint64
	Errors            uint64

	// Скользящее окно для вычисления среднего
	recentTimes  []time.Duration
	recentIndex  int
	windowFilled bool
}

// NewGameTicker создает новый игровой тикер для x-cells
func NewGameTicker(targetTPS int, worldManager *world.Manager, logger *log.Logger) *GameTicker {
	if targetTPS <= 0 {
		targetTPS = 20 // По умолчанию 20 TPS для x-cells
	}

	if logger == nil {
		logger = log.Default()
	}

	tickDuration := time.Second / time.Duration(targetTPS)
	maxTickTime := tickDuration * 2 // Максимум в 2 раза больше целевого времени

	ctx, cancel := context.WithCancel(context.Background())

	ticker := &GameTicker{
		targetTPS:        targetTPS,
		tickDuration:     tickDuration,
		maxTickTime:      maxTickTime,
		worldManager:     worldManager,
		players:          make(map[string]*Player),
		systems:          make([]TickSystem, 0),
		perfMonitor:      NewPerformanceMonitor(50, tickDuration/4), // Предупреждение при 25% от тика
		ctx:              ctx,
		cancel:           cancel,
		pauseChan:        make(chan bool, 1),
		logger:           logger,
		warningThreshold: tickDuration / 2, // Предупреждение при 50% от времени тика
	}

	return ticker
}

// NewPerformanceMonitor создает новый монитор производительности
func NewPerformanceMonitor(windowSize int, warningThreshold time.Duration) *PerformanceMonitor {
	return &PerformanceMonitor{
		systemMetrics:     make(map[string]*SystemMetrics),
		metricsWindow:     windowSize,
		warningThreshold:  warningThreshold,
		criticalThreshold: warningThreshold * 2,
	}
}

// Start запускает игровой цикл
func (gt *GameTicker) Start() error {
	if gt.isRunning {
		return nil // Уже запущен
	}

	gt.isRunning = true
	gt.startTime = time.Now()
	gt.lastTickTime = gt.startTime

	gt.logger.Printf("[GameTicker] Запуск игрового цикла x-cells: %d TPS (тик каждые %v)",
		gt.targetTPS, gt.tickDuration)

	go gt.gameLoop()

	return nil
}

// Stop останавливает игровой цикл
func (gt *GameTicker) Stop() {
	if !gt.isRunning {
		return
	}

	gt.logger.Printf("[GameTicker] Остановка игрового цикла x-cells (выполнено тиков: %d)", gt.tickCount)

	gt.cancel()
	gt.isRunning = false
}

// RegisterSystem добавляет систему в игровой цикл
func (gt *GameTicker) RegisterSystem(system TickSystem) {
	gt.systemsMutex.Lock()
	defer gt.systemsMutex.Unlock()

	// Добавляем систему
	gt.systems = append(gt.systems, system)

	// Сортируем по приоритету (меньше = выше приоритет)
	for i := len(gt.systems) - 1; i > 0; i-- {
		if gt.systems[i].GetPriority() < gt.systems[i-1].GetPriority() {
			gt.systems[i], gt.systems[i-1] = gt.systems[i-1], gt.systems[i]
		} else {
			break
		}
	}

	// Инициализируем метрики для системы
	gt.perfMonitor.initSystemMetrics(system.GetName())

	gt.logger.Printf("[GameTicker] Зарегистрирована система: %s (приоритет: %d)",
		system.GetName(), system.GetPriority())
}

// gameLoop основной игровой цикл
func (gt *GameTicker) gameLoop() {
	ticker := time.NewTicker(gt.tickDuration)
	defer ticker.Stop()

	for {
		select {
		case <-gt.ctx.Done():
			return

		case pause := <-gt.pauseChan:
			if pause {
				// Ждем команды возобновления
				for pause {
					select {
					case <-gt.ctx.Done():
						return
					case pause = <-gt.pauseChan:
					}
				}
			}

		case tickTime := <-ticker.C:
			gt.executeTick(tickTime)
		}
	}
}

// executeTick выполняет один игровой тик
func (gt *GameTicker) executeTick(tickTime time.Time) {
	tickStart := time.Now()
	deltaTime := tickTime.Sub(gt.lastTickTime)

	// Проверяем, не слишком ли большая задержка между тиками
	if deltaTime > gt.tickDuration*2 {
		gt.logger.Printf("[GameTicker] ПРЕДУПРЕЖДЕНИЕ: Большая задержка между тиками: %v (ожидалось: %v)",
			deltaTime, gt.tickDuration)
		gt.skippedTicks++
	}

	gt.tickCount++
	gt.lastTickTime = tickTime

	// Выполняем все системы
	gt.executeAllSystems(deltaTime)

	// Измеряем общее время тика
	totalTickTime := time.Since(tickStart)
	gt.updateTickMetrics(totalTickTime)

	// Проверяем производительность
	gt.checkPerformance(totalTickTime)
}

// executeAllSystems выполняет все зарегистрированные системы
func (gt *GameTicker) executeAllSystems(deltaTime time.Duration) {
	gt.systemsMutex.RLock()
	systems := make([]TickSystem, len(gt.systems))
	copy(systems, gt.systems)
	gt.systemsMutex.RUnlock()

	for _, system := range systems {
		gt.executeSystem(system, deltaTime)
	}
}

// executeSystem выполняет одну систему с замером времени
func (gt *GameTicker) executeSystem(system TickSystem, deltaTime time.Duration) {
	systemStart := time.Now()
	systemName := system.GetName()

	defer func() {
		if r := recover(); r != nil {
			gt.logger.Printf("[GameTicker] КРИТИЧЕСКАЯ ОШИБКА в системе %s: %v", systemName, r)
			gt.perfMonitor.recordError(systemName)
		}
	}()

	// Выполняем систему
	err := system.Update(deltaTime)

	executionTime := time.Since(systemStart)

	// Записываем метрики
	gt.perfMonitor.recordExecution(systemName, executionTime)

	// Обрабатываем ошибки
	if err != nil {
		gt.logger.Printf("[GameTicker] Ошибка в системе %s: %v", systemName, err)
		gt.perfMonitor.recordError(systemName)
	}
}

// AddPlayer добавляет игрока с стандартным радиусом
func (gt *GameTicker) AddPlayer(playerID string, pos Vector3) {
	gt.AddPlayerWithRadius(playerID, pos, 1.0) // Стандартный радиус
}

// AddPlayerWithRadius добавляет игрока с указанным радиусом
func (gt *GameTicker) AddPlayerWithRadius(playerID string, pos Vector3, radius float64) {
	gt.playersMutex.Lock()
	defer gt.playersMutex.Unlock()

	gt.players[playerID] = &Player{
		ID:       playerID,
		Position: pos,
		Radius:   radius, // Используем переданный радиус
		Health:   100.0,
		Score:    0,
		LastSeen: time.Now(),
	}

	gt.logger.Printf("[GameTicker] Добавлен игрок %s в позиции (%.1f, %.1f, %.1f) с радиусом %.1f",
		playerID, pos.X, pos.Y, pos.Z, radius)
}

func (gt *GameTicker) RemovePlayer(playerID string) {
	gt.playersMutex.Lock()
	defer gt.playersMutex.Unlock()

	delete(gt.players, playerID)
	gt.logger.Printf("[GameTicker] Удален игрок %s", playerID)
}

func (gt *GameTicker) GetPlayer(playerID string) *Player {
	gt.playersMutex.RLock()
	defer gt.playersMutex.RUnlock()

	return gt.players[playerID]
}

// UpdatePlayerMass безопасно обновляет массу игрока
func (gt *GameTicker) UpdatePlayerMass(playerID string, massChange float64) {
	gt.playersMutex.Lock()
	defer gt.playersMutex.Unlock()

	if player, exists := gt.players[playerID]; exists {
		player.Mass += massChange
		gt.logger.Printf("[GameTicker] Масса игрока %s изменена на %.2f (новая масса: %.2f)",
			playerID, massChange, player.Mass)
	}
}

// UpdatePlayerPosition безопасно обновляет позицию игрока из физического движка
func (gt *GameTicker) UpdatePlayerPosition(playerID string, newPos Vector3) {
	gt.playersMutex.Lock()
	defer gt.playersMutex.Unlock()

	if player, exists := gt.players[playerID]; exists {
		player.Position = newPos
		player.LastSeen = time.Now()
		// Логируем только изменения значительных позиций (более 1 единицы)
		oldPos := player.Position
		distance := math.Sqrt(
			(newPos.X-oldPos.X)*(newPos.X-oldPos.X) +
				(newPos.Y-oldPos.Y)*(newPos.Y-oldPos.Y) +
				(newPos.Z-oldPos.Z)*(newPos.Z-oldPos.Z),
		)
		if distance > 1.0 && gt.GetTickCount()%60 == 0 { // Логируем раз в 3 секунды при 20 TPS
			gt.logger.Printf("[GameTicker] Позиция игрока %s обновлена: (%.1f, %.1f, %.1f)",
				playerID, newPos.X, newPos.Y, newPos.Z)
		}
	}
}

func (gt *GameTicker) GetAllPlayers() map[string]*Player {
	gt.playersMutex.RLock()
	defer gt.playersMutex.RUnlock()

	players := make(map[string]*Player)
	for id, player := range gt.players {
		// Создаем копию для безопасности
		players[id] = &Player{
			ID:       player.ID,
			Position: player.Position,
			Radius:   player.Radius,
			Health:   player.Health,
			Score:    player.Score,
			Mass:     player.Mass,
			LastSeen: player.LastSeen,
		}
	}

	return players
}

// GetStats возвращает статистику игрового цикла
func (gt *GameTicker) GetStats() map[string]interface{} {
	gt.playersMutex.RLock()
	defer gt.playersMutex.RUnlock()

	uptime := time.Since(gt.startTime)
	actualTPS := float64(gt.tickCount) / uptime.Seconds()

	return map[string]interface{}{
		"target_tps":        gt.targetTPS,
		"actual_tps":        actualTPS,
		"tick_count":        gt.tickCount,
		"uptime_seconds":    uptime.Seconds(),
		"average_tick_time": gt.averageTickTime,
		"max_observed_tick": gt.maxObservedTick,
		"skipped_ticks":     gt.skippedTicks,
		"is_running":        gt.isRunning,
		"is_paused":         gt.isPaused,
		"systems_count":     len(gt.systems),
		"players_count":     len(gt.players),
	}
}

// GetTickCount возвращает текущее количество тиков
func (gt *GameTicker) GetTickCount() uint64 {
	return gt.tickCount
}

// Вспомогательные методы для мониторинга производительности
func (pm *PerformanceMonitor) initSystemMetrics(systemName string) {
	pm.mutex.Lock()
	defer pm.mutex.Unlock()

	pm.systemMetrics[systemName] = &SystemMetrics{
		Name:        systemName,
		recentTimes: make([]time.Duration, pm.metricsWindow),
	}
}

func (pm *PerformanceMonitor) recordExecution(systemName string, executionTime time.Duration) {
	pm.mutex.Lock()
	defer pm.mutex.Unlock()

	metrics, exists := pm.systemMetrics[systemName]
	if !exists {
		return
	}

	metrics.LastExecutionTime = executionTime
	metrics.TotalExecutions++

	// Обновляем максимальное время
	if executionTime > metrics.MaxTime {
		metrics.MaxTime = executionTime
	}

	// Добавляем в скользящее окно
	metrics.recentTimes[metrics.recentIndex] = executionTime
	metrics.recentIndex = (metrics.recentIndex + 1) % pm.metricsWindow

	if !metrics.windowFilled && metrics.recentIndex == 0 {
		metrics.windowFilled = true
	}

	// Пересчитываем среднее время
	pm.recalculateAverage(metrics)
}

func (pm *PerformanceMonitor) recordError(systemName string) {
	pm.mutex.Lock()
	defer pm.mutex.Unlock()

	if metrics, exists := pm.systemMetrics[systemName]; exists {
		metrics.Errors++
	}
}

func (pm *PerformanceMonitor) recalculateAverage(metrics *SystemMetrics) {
	var total time.Duration
	var count int

	limit := pm.metricsWindow
	if !metrics.windowFilled {
		limit = metrics.recentIndex
	}

	for i := 0; i < limit; i++ {
		total += metrics.recentTimes[i]
		count++
	}

	if count > 0 {
		metrics.AverageTime = total / time.Duration(count)
	}
}

func (pm *PerformanceMonitor) GetSystemsStats() map[string]interface{} {
	pm.mutex.RLock()
	defer pm.mutex.RUnlock()

	systemsStats := make(map[string]interface{})

	for name, metrics := range pm.systemMetrics {
		systemsStats[name] = map[string]interface{}{
			"last_execution_time": metrics.LastExecutionTime,
			"average_time":        metrics.AverageTime,
			"max_time":            metrics.MaxTime,
			"total_executions":    metrics.TotalExecutions,
			"errors":              metrics.Errors,
		}
	}

	return systemsStats
}

func (gt *GameTicker) updateTickMetrics(tickTime time.Duration) {
	if tickTime > gt.maxObservedTick {
		gt.maxObservedTick = tickTime
	}

	// Простое скользящее среднее
	if gt.averageTickTime == 0 {
		gt.averageTickTime = tickTime
	} else {
		gt.averageTickTime = (gt.averageTickTime*9 + tickTime) / 10
	}
}

func (gt *GameTicker) checkPerformance(tickTime time.Duration) {
	if tickTime > gt.maxTickTime {
		gt.logger.Printf("[GameTicker] КРИТИЧЕСКОЕ ПРЕДУПРЕЖДЕНИЕ: Тик превысил максимальное время! %v > %v (цель: %v)",
			tickTime, gt.maxTickTime, gt.tickDuration)
	} else if tickTime > gt.warningThreshold {
		gt.logger.Printf("[GameTicker] ПРЕДУПРЕЖДЕНИЕ: Медленный тик: %v (цель: %v)",
			tickTime, gt.tickDuration)
	}
}
