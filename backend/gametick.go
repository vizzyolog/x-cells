package main

import (
	"context"
	"fmt"
	"log"
	"sync"
	"time"
)

// TickSystem интерфейс для всех игровых систем, которые обновляются каждый тик
type TickSystem interface {
	Update(deltaTime time.Duration) error
	GetName() string
	GetPriority() int // Приоритет выполнения (меньше = раньше)
}

// GameTicker основной менеджер игрового цикла
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

// NewGameTicker создает новый игровой тикер
func NewGameTicker(targetTPS int, logger *log.Logger) *GameTicker {
	if targetTPS <= 0 {
		targetTPS = 20 // По умолчанию 20 TPS
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

// initSystemMetrics инициализирует метрики для системы
func (pm *PerformanceMonitor) initSystemMetrics(systemName string) {
	pm.mutex.Lock()
	defer pm.mutex.Unlock()

	pm.systemMetrics[systemName] = &SystemMetrics{
		Name:        systemName,
		recentTimes: make([]time.Duration, pm.metricsWindow),
	}
}

// Start запускает игровой цикл
func (gt *GameTicker) Start() error {
	if gt.isRunning {
		return fmt.Errorf("игровой тикер уже запущен")
	}

	gt.isRunning = true
	gt.startTime = time.Now()
	gt.lastTickTime = gt.startTime

	gt.logger.Printf("[GameTicker] Запуск игрового цикла: %d TPS (тик каждые %v)",
		gt.targetTPS, gt.tickDuration)

	go gt.gameLoop()

	return nil
}

// Stop останавливает игровой цикл
func (gt *GameTicker) Stop() {
	if !gt.isRunning {
		return
	}

	gt.logger.Printf("[GameTicker] Остановка игрового цикла (выполнено тиков: %d)", gt.tickCount)

	gt.cancel()
	gt.isRunning = false
}

// Pause приостанавливает игровой цикл
func (gt *GameTicker) Pause() {
	if gt.isPaused {
		return
	}

	gt.isPaused = true
	gt.pauseChan <- true
	gt.logger.Printf("[GameTicker] Игровой цикл приостановлен")
}

// Resume возобновляет игровой цикл
func (gt *GameTicker) Resume() {
	if !gt.isPaused {
		return
	}

	gt.isPaused = false
	gt.pauseChan <- false
	gt.logger.Printf("[GameTicker] Игровой цикл возобновлен")
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

	// Проверяем производительность системы
	gt.checkSystemPerformance(systemName, executionTime)
}

// recordExecution записывает время выполнения системы
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

// recordError записывает ошибку системы
func (pm *PerformanceMonitor) recordError(systemName string) {
	pm.mutex.Lock()
	defer pm.mutex.Unlock()

	if metrics, exists := pm.systemMetrics[systemName]; exists {
		metrics.Errors++
	}
}

// recalculateAverage пересчитывает среднее время выполнения
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

// updateTickMetrics обновляет общие метрики тика
func (gt *GameTicker) updateTickMetrics(tickTime time.Duration) {
	if tickTime > gt.maxObservedTick {
		gt.maxObservedTick = tickTime
	}

	// Простое скользящее среднее (можно улучшить)
	if gt.averageTickTime == 0 {
		gt.averageTickTime = tickTime
	} else {
		gt.averageTickTime = (gt.averageTickTime*9 + tickTime) / 10
	}
}

// checkPerformance проверяет общую производительность тика
func (gt *GameTicker) checkPerformance(tickTime time.Duration) {
	if tickTime > gt.maxTickTime {
		gt.logger.Printf("[GameTicker] КРИТИЧЕСКОЕ ПРЕДУПРЕЖДЕНИЕ: Тик превысил максимальное время! %v > %v (цель: %v)",
			tickTime, gt.maxTickTime, gt.tickDuration)
	} else if tickTime > gt.warningThreshold {
		gt.logger.Printf("[GameTicker] ПРЕДУПРЕЖДЕНИЕ: Медленный тик: %v (цель: %v)",
			tickTime, gt.tickDuration)
	}
}

// checkSystemPerformance проверяет производительность конкретной системы
func (gt *GameTicker) checkSystemPerformance(systemName string, executionTime time.Duration) {
	if executionTime > gt.perfMonitor.criticalThreshold {
		gt.logger.Printf("[GameTicker] КРИТИЧЕСКОЕ ПРЕДУПРЕЖДЕНИЕ: Система %s работает очень медленно: %v",
			systemName, executionTime)
	} else if executionTime > gt.perfMonitor.warningThreshold {
		gt.logger.Printf("[GameTicker] ПРЕДУПРЕЖДЕНИЕ: Система %s работает медленно: %v",
			systemName, executionTime)
	}
}

// GetStats возвращает статистику игрового цикла
func (gt *GameTicker) GetStats() map[string]interface{} {
	uptime := time.Since(gt.startTime)
	actualTPS := float64(gt.tickCount) / uptime.Seconds()

	stats := map[string]interface{}{
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
	}

	// Добавляем статистику систем
	systemStats := gt.perfMonitor.GetSystemsStats()
	stats["systems"] = systemStats

	return stats
}

// GetSystemsStats возвращает статистику всех систем
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

// PrintDetailedStats выводит подробную статистику в лог
func (gt *GameTicker) PrintDetailedStats() {
	stats := gt.GetStats()

	gt.logger.Printf("=== СТАТИСТИКА ИГРОВОГО ЦИКЛА ===")
	gt.logger.Printf("Целевой TPS: %d, Фактический TPS: %.2f",
		stats["target_tps"], stats["actual_tps"])
	gt.logger.Printf("Выполнено тиков: %d, Время работы: %.1f сек",
		stats["tick_count"], stats["uptime_seconds"])
	gt.logger.Printf("Среднее время тика: %v, Максимальное: %v",
		stats["average_tick_time"], stats["max_observed_tick"])
	gt.logger.Printf("Пропущенных тиков: %d", stats["skipped_ticks"])

	gt.logger.Printf("=== ПРОИЗВОДИТЕЛЬНОСТЬ СИСТЕМ ===")
	systemsStats := stats["systems"].(map[string]interface{})
	for systemName, sysStats := range systemsStats {
		s := sysStats.(map[string]interface{})
		gt.logger.Printf("Система %s: среднее %v, максимальное %v, выполнений %d, ошибок %d",
			systemName, s["average_time"], s["max_time"], s["total_executions"], s["errors"])
	}
}
