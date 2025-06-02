package game

import (
	"encoding/json"
	"fmt"
	"log"
	"math"
	"math/rand"
	"sync"
	"time"
)

// SimpleFoodSystem - упрощенная система еды для Фазы 1
type SimpleFoodSystem struct {
	name       string
	priority   int
	gameTicker *GameTicker
	logger     *log.Logger

	// Еда в мире
	foodItems  map[string]*SimpleFood
	foodMutex  sync.RWMutex
	nextFoodID uint64

	// Настройки спавна
	maxFood       int           // Максимальное количество еды (начинаем с малого)
	spawnInterval time.Duration // Интервал спавна
	lastSpawn     time.Time

	// Зона спавна (статичная еда на земле)
	spawnRadius float64 // Радиус зоны спавна
	groundLevel float64 // Уровень земли

	// Радиус коллизий
	foodRadius float64 // Радиус еды
	// playerRadius убран - будем брать реальный радиус каждого игрока

	// Интерфейс для отправки событий (будет установлен извне)
	broadcaster FoodEventBroadcaster
}

// FoodEventBroadcaster интерфейс для отправки событий еды
type FoodEventBroadcaster interface {
	BroadcastFoodConsumed(playerID, foodID string, massGain float64)
	BroadcastFoodSpawned(food interface{})
	BroadcastFoodState(foodItems interface{})
}

// SimpleFood - простой объект еды
type SimpleFood struct {
	ID        string    `json:"id"`
	X         float64   `json:"x"`
	Y         float64   `json:"y"`
	Z         float64   `json:"z"`
	Radius    float64   `json:"radius"`
	Mass      float64   `json:"mass"`
	Color     string    `json:"color"`
	SpawnTime time.Time `json:"-"`
}

// NewSimpleFoodSystem создает новую упрощенную систему еды
func NewSimpleFoodSystem(gameTicker *GameTicker, logger *log.Logger) *SimpleFoodSystem {
	return &SimpleFoodSystem{
		name:       "SimpleFoodSystem",
		priority:   25, // После физики
		gameTicker: gameTicker,
		logger:     logger,
		foodItems:  make(map[string]*SimpleFood),
		nextFoodID: 1,

		// Настройки (консервативные для начала)
		maxFood:       20,              // Только 20 единиц еды
		spawnInterval: 2 * time.Second, // Спавн каждые 2 секунды

		// Зона спавна
		spawnRadius: 150.0, // Увеличили с 50 до 150 единиц
		groundLevel: 1.0,   // Земля на уровне 1

		// Коллизии
		foodRadius: 5.0, // Увеличили с 2.0 до 5.0
	}
}

// Update обновляет систему еды
func (sfs *SimpleFoodSystem) Update(deltaTime time.Duration) error {
	// Спавним новую еду
	sfs.spawnFood()

	// Проверяем коллизии с игроками
	sfs.checkCollisions()

	// Логирование каждые 20 тиков (1 секунда)
	if sfs.gameTicker.GetTickCount()%20 == 0 {
		sfs.logStats()
	}

	return nil
}

// spawnFood создает новую еду
func (sfs *SimpleFoodSystem) spawnFood() {
	now := time.Now()

	// Проверяем интервал спавна
	if now.Sub(sfs.lastSpawn) < sfs.spawnInterval {
		return
	}

	sfs.foodMutex.Lock()
	defer sfs.foodMutex.Unlock()

	// Проверяем лимит
	if len(sfs.foodItems) >= sfs.maxFood {
		return
	}

	sfs.lastSpawn = now

	// Создаем еду
	food := sfs.createRandomFood()
	sfs.foodItems[food.ID] = food

	sfs.logger.Printf("[SimpleFoodSystem] Создана еда %s в (%.1f, %.1f, %.1f)",
		food.ID, food.X, food.Y, food.Z)

	// Уведомляем клиентов о новой еде
	if sfs.broadcaster != nil {
		sfs.broadcaster.BroadcastFoodSpawned(food)
	}
}

// createRandomFood создает случайную еду на земле
func (sfs *SimpleFoodSystem) createRandomFood() *SimpleFood {
	// Случайная позиция в кольце (не в центре)
	angle := rand.Float64() * 2 * math.Pi
	distance := 10.0 + rand.Float64()*(sfs.spawnRadius-10.0) // От 10 до spawnRadius

	x := math.Cos(angle) * distance
	z := math.Sin(angle) * distance
	y := sfs.groundLevel

	food := &SimpleFood{
		ID:        fmt.Sprintf("food_%d", sfs.nextFoodID),
		X:         x,
		Y:         y,
		Z:         z,
		Radius:    sfs.foodRadius,
		Mass:      1.0,       // Все еда дает +1 массу
		Color:     "#90EE90", // Светло-зеленый
		SpawnTime: time.Now(),
	}

	sfs.nextFoodID++
	return food
}

// checkCollisions проверяет коллизии игроков с едой
func (sfs *SimpleFoodSystem) checkCollisions() {
	// Получаем всех игроков напрямую из gameTicker
	players := sfs.gameTicker.GetAllPlayers()

	// === ОТЛАДКА: Логируем информацию о игроках ===
	if len(players) == 0 {
		// Логируем только каждые несколько секунд
		if sfs.gameTicker.GetTickCount()%200 == 0 { // Каждые 10 секунд при 20 TPS
			sfs.logger.Printf("[SimpleFoodSystem] Игроков: %d, Еды: %d/%d", len(players), len(sfs.foodItems), sfs.maxFood)
		}
		return
	}

	sfs.foodMutex.Lock()
	defer sfs.foodMutex.Unlock()

	// Логируем текущую ситуацию каждые 20 тиков
	if sfs.gameTicker.GetTickCount()%20 == 0 {
		sfs.logger.Printf("[SimpleFoodSystem] Игроков: %d, Еды: %d/%d", len(players), len(sfs.foodItems), sfs.maxFood)
		for playerID, player := range players {
			sfs.logger.Printf("[SimpleFoodSystem] Игрок %s в позиции (%.2f, %.2f, %.2f)",
				playerID, player.Position.X, player.Position.Y, player.Position.Z)
		}
	}

	toRemove := make([]string, 0)

	for _, food := range sfs.foodItems {
		for playerID, player := range players {
			// Простая проверка расстояния в 2D (игнорируем Y)
			dx := player.Position.X - food.X
			dz := player.Position.Z - food.Z
			distance := math.Sqrt(dx*dx + dz*dz)

			// Получаем реальный радиус игрока (пропускаем игроков с невалидным радиусом)
			playerRadius := player.Radius
			if playerRadius <= 0 {
				// Логируем предупреждение только периодически
				if sfs.gameTicker.GetTickCount()%200 == 0 {
					sfs.logger.Printf("[SimpleFoodSystem] ПРЕДУПРЕЖДЕНИЕ: Игрок %s имеет невалидный радиус %.2f, пропускаем",
						playerID, playerRadius)
				}
				continue // Пропускаем этого игрока
			}

			collisionDistance := playerRadius + food.Radius

			// Логируем коллизии только периодически для отладки
			if distance <= collisionDistance*1.5 && sfs.gameTicker.GetTickCount()%100 == 0 { // Каждые 5 секунд
				sfs.logger.Printf("[SimpleFoodSystem] ОТЛАДКА: Игрок %s (радиус=%.1f) рядом с едой %s: расстояние=%.2f, нужно<=%.2f",
					playerID, playerRadius, food.ID, distance, collisionDistance)
			}

			if distance <= collisionDistance {
				// КОЛЛИЗИЯ! Игрок съел еду
				sfs.logger.Printf("[SimpleFoodSystem] Игрок %s (радиус=%.1f) съел еду %s (расстояние: %.2f)",
					playerID, playerRadius, food.ID, distance)

				// Увеличиваем массу игрока через GameTicker
				sfs.gameTicker.UpdatePlayerMass(playerID, food.Mass)

				// Помечаем еду для удаления
				toRemove = append(toRemove, food.ID)

				// Уведомляем клиентов
				sfs.notifyFoodConsumed(playerID, food)
				break
			}
		}
	}

	// Удаляем съеденную еду
	for _, foodID := range toRemove {
		delete(sfs.foodItems, foodID)
	}
}

// notifyFoodConsumed уведомляет клиентов о съеденной еде
func (sfs *SimpleFoodSystem) notifyFoodConsumed(playerID string, food *SimpleFood) {
	// Отправляем событие через broadcaster
	if sfs.broadcaster != nil {
		sfs.broadcaster.BroadcastFoodConsumed(playerID, food.ID, food.Mass)
	} else {
		// Fallback - логируем событие
		event := map[string]interface{}{
			"type":      "food_consumed",
			"player_id": playerID,
			"food_id":   food.ID,
			"mass_gain": food.Mass,
		}

		eventData, _ := json.Marshal(event)
		sfs.logger.Printf("[SimpleFoodSystem] Событие: %s", string(eventData))
	}
}

// GetFoodItems возвращает копию всех объектов еды для синхронизации
func (sfs *SimpleFoodSystem) GetFoodItems() map[string]*SimpleFood {
	sfs.foodMutex.RLock()
	defer sfs.foodMutex.RUnlock()

	result := make(map[string]*SimpleFood)
	for id, food := range sfs.foodItems {
		// Создаем копию
		foodCopy := *food
		result[id] = &foodCopy
	}
	return result
}

// logStats выводит статистику системы
func (sfs *SimpleFoodSystem) logStats() {
	sfs.foodMutex.RLock()
	count := len(sfs.foodItems)
	sfs.foodMutex.RUnlock()

	sfs.logger.Printf("[SimpleFoodSystem] Еды в мире: %d/%d", count, sfs.maxFood)
}

// GetName возвращает имя системы
func (sfs *SimpleFoodSystem) GetName() string {
	return sfs.name
}

// GetPriority возвращает приоритет системы
func (sfs *SimpleFoodSystem) GetPriority() int {
	return sfs.priority
}

// SetBroadcaster устанавливает интерфейс для отправки событий
func (sfs *SimpleFoodSystem) SetBroadcaster(broadcaster FoodEventBroadcaster) {
	sfs.broadcaster = broadcaster
}
