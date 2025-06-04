package game

import (
	"fmt"
	"log"
	"math"
	"math/rand"
	"sync"
	"time"
)

// FoodSystem система управления едой в игре
type FoodSystem struct {
	name       string
	priority   int
	gameTicker *GameTicker
	logger     *log.Logger

	// Еда в мире
	foodItems  map[string]*FoodItem
	foodMutex  sync.RWMutex
	nextFoodID uint64

	// Система коллизий для эффективной обработки
	collider *ColliderDispatcher

	// Настройки спавна
	maxFood       int           // Максимальное количество еды
	spawnInterval time.Duration // Интервал спавна новой еды
	lastSpawn     time.Time

	// Зона спавна
	spawnRadius float64 // Радиус зоны спавна
	spawnHeight float64 // Высота спавна (еда падает сверху)
	groundLevel float64 // Уровень земли

	// Физика еды
	gravity    float64 // Гравитация для падающей еды
	foodRadius float64 // Радиус еды по умолчанию
}

// FoodItem представляет объект еды
type FoodItem struct {
	ID         string
	Position   Vector3
	Velocity   Vector3
	Radius     float64
	Mass       float64
	Color      string
	Type       FoodType
	SpawnTime  time.Time
	IsOnGround bool
}

// FoodType тип еды
type FoodType int

const (
	FoodBasic  FoodType = iota // Обычная еда (70%)
	FoodMedium                 // Средняя еда (20%)
	FoodLarge                  // Большая еда (8%)
	FoodRare                   // Редкая еда (2%)
)

// NewFoodSystem создает новую систему еды
func NewFoodSystem(gameTicker *GameTicker, logger *log.Logger) *FoodSystem {
	return &FoodSystem{
		name:       "FoodSystem",
		priority:   20, // После физики, но до сети
		gameTicker: gameTicker,
		logger:     logger,
		foodItems:  make(map[string]*FoodItem),
		nextFoodID: 1,
		// collider будет установлен через CollisionManagerSystem

		// Настройки спавна
		maxFood:       100,
		spawnInterval: 500 * time.Millisecond, // Новая еда каждые 500мс

		// Зона спавна
		spawnRadius: 500.0, // Радиус 50 единиц
		spawnHeight: 20.0,  // Спавн на высоте 20
		groundLevel: 1.0,   // Земля на уровне 1

		// Физика
		gravity:    9.8, // м/с²
		foodRadius: 0.5, // Радиус еды
	}
}

// Update обновляет систему еды
func (fs *FoodSystem) Update(deltaTime time.Duration) error {
	deltaSeconds := deltaTime.Seconds()

	// Спавним новую еду при необходимости
	fs.spawnFood()

	// Обновляем физику еды
	fs.updateFoodPhysics(deltaSeconds)

	// НЕ проверяем поедание еды - это делает CollisionManagerSystem

	// Убираем старую еду
	fs.cleanupOldFood()

	// Логируем состояние каждые 10 секунд
	if fs.gameTicker.GetTickCount()%200 == 0 { // 10 секунд при 20 TPS
		fs.logFoodStats()
	}

	return nil
}

// spawnFood создает новую еду
func (fs *FoodSystem) spawnFood() {
	now := time.Now()

	// Проверяем, нужно ли спавнить еду
	if now.Sub(fs.lastSpawn) < fs.spawnInterval {
		return
	}

	fs.foodMutex.Lock()
	defer fs.foodMutex.Unlock()

	// Проверяем лимит еды
	if len(fs.foodItems) >= fs.maxFood {
		return
	}

	fs.lastSpawn = now

	// Создаем новую еду
	food := fs.createRandomFood()
	fs.foodItems[food.ID] = food

	fs.logger.Printf("[FoodSystem] Создана еда %s типа %s в позиции (%.1f, %.1f, %.1f)",
		food.ID, fs.getFoodTypeName(food.Type), food.Position.X, food.Position.Y, food.Position.Z)
}

// createRandomFood создает случайную еду
func (fs *FoodSystem) createRandomFood() *FoodItem {
	// Случайная позиция в радиусе спавна
	angle := rand.Float64() * 2 * math.Pi
	distance := rand.Float64() * fs.spawnRadius

	x := math.Cos(angle) * distance
	z := math.Sin(angle) * distance
	y := fs.spawnHeight

	// Определяем тип еды по вероятности
	foodType := fs.getRandomFoodType()

	food := &FoodItem{
		ID:         fmt.Sprintf("food_%d", fs.nextFoodID),
		Position:   Vector3{X: x, Y: y, Z: z},
		Velocity:   Vector3{X: 0, Y: 0, Z: 0}, // Начинает падать
		Type:       foodType,
		SpawnTime:  time.Now(),
		IsOnGround: false,
	}

	fs.nextFoodID++

	// Настраиваем свойства в зависимости от типа
	switch foodType {
	case FoodBasic:
		food.Radius = 0.3
		food.Mass = 1.0
		food.Color = "#90EE90" // Светло-зеленый
	case FoodMedium:
		food.Radius = 0.5
		food.Mass = 3.0
		food.Color = "#FFD700" // Золотой
	case FoodLarge:
		food.Radius = 0.8
		food.Mass = 8.0
		food.Color = "#FF6347" // Томатный
	case FoodRare:
		food.Radius = 1.0
		food.Mass = 20.0
		food.Color = "#9370DB" // Фиолетовый
	}

	// Добавляем еду в систему коллизий (если доступна)
	if fs.collider != nil {
		collisionObj := &CollidableObject{
			ID:       food.ID,
			Position: food.Position,
			Radius:   food.Radius,
			Type:     "food",
			Mass:     food.Mass,
			IsStatic: false, // Еда движется (падает)
		}
		fs.collider.AddObject(collisionObj)
	}

	return food
}

// getRandomFoodType возвращает случайный тип еды по вероятности
func (fs *FoodSystem) getRandomFoodType() FoodType {
	roll := rand.Float64() * 100

	if roll < 70 {
		return FoodBasic // 70%
	} else if roll < 90 {
		return FoodMedium // 20%
	} else if roll < 98 {
		return FoodLarge // 8%
	} else {
		return FoodRare // 2%
	}
}

// updateFoodPhysics обновляет физику падающей еды
func (fs *FoodSystem) updateFoodPhysics(deltaTime float64) {
	fs.foodMutex.Lock()
	defer fs.foodMutex.Unlock()

	for _, food := range fs.foodItems {
		if food.IsOnGround {
			continue // Еда уже на земле
		}

		oldPos := food.Position

		// Применяем гравитацию
		food.Velocity.Y -= fs.gravity * deltaTime

		// Обновляем позицию
		food.Position.X += food.Velocity.X * deltaTime
		food.Position.Y += food.Velocity.Y * deltaTime
		food.Position.Z += food.Velocity.Z * deltaTime

		// Проверяем столкновение с землей
		if food.Position.Y <= fs.groundLevel+food.Radius {
			food.Position.Y = fs.groundLevel + food.Radius
			food.Velocity.Y = 0
			food.IsOnGround = true
		}

		// Обновляем позицию в системе коллизий, если она изменилась
		if oldPos != food.Position && fs.collider != nil {
			fs.collider.UpdateObjectPosition(food.ID, food.Position)
		}
	}
}

// logFoodStats логирует статистику еды
func (fs *FoodSystem) logFoodStats() {
	fs.foodMutex.RLock()
	defer fs.foodMutex.RUnlock()

	stats := make(map[FoodType]int)
	onGround := 0
	falling := 0

	for _, food := range fs.foodItems {
		stats[food.Type]++
		if food.IsOnGround {
			onGround++
		} else {
			falling++
		}
	}

	var colliderStats int
	if fs.collider != nil {
		colliderStats = fs.collider.GetObjectCount()
	}

	fs.logger.Printf("[FoodSystem] Статистика еды: всего %d, падает %d, на земле %d, в коллайдере %d. Типы: обычная %d, средняя %d, большая %d, редкая %d",
		len(fs.foodItems), falling, onGround, colliderStats,
		stats[FoodBasic], stats[FoodMedium], stats[FoodLarge], stats[FoodRare])
}

// cleanupOldFood удаляет старую еду
func (fs *FoodSystem) cleanupOldFood() {
	fs.foodMutex.Lock()
	defer fs.foodMutex.Unlock()

	now := time.Now()
	maxAge := 60 * time.Second // Еда исчезает через 60 секунд

	var toRemove []string
	for foodID, food := range fs.foodItems {
		if now.Sub(food.SpawnTime) > maxAge {
			toRemove = append(toRemove, foodID)
		}
	}

	for _, foodID := range toRemove {
		delete(fs.foodItems, foodID)
		if fs.collider != nil {
			fs.collider.RemoveObject(foodID) // Удаляем из spatial grid
		}
	}

	if len(toRemove) > 0 {
		fs.logger.Printf("[FoodSystem] Удалена старая еда: %d объектов", len(toRemove))
	}
}

// GetFoodItems возвращает копию всей еды (для сети)
func (fs *FoodSystem) GetFoodItems() map[string]*FoodItem {
	fs.foodMutex.RLock()
	defer fs.foodMutex.RUnlock()

	result := make(map[string]*FoodItem)
	for id, food := range fs.foodItems {
		// Создаем копию для безопасности
		result[id] = &FoodItem{
			ID:         food.ID,
			Position:   food.Position,
			Velocity:   food.Velocity,
			Radius:     food.Radius,
			Mass:       food.Mass,
			Color:      food.Color,
			Type:       food.Type,
			SpawnTime:  food.SpawnTime,
			IsOnGround: food.IsOnGround,
		}
	}

	return result
}

// getFoodTypeName возвращает название типа еды
func (fs *FoodSystem) getFoodTypeName(foodType FoodType) string {
	switch foodType {
	case FoodBasic:
		return "обычная"
	case FoodMedium:
		return "средняя"
	case FoodLarge:
		return "большая"
	case FoodRare:
		return "редкая"
	default:
		return "неизвестная"
	}
}

// GetName возвращает имя системы
func (fs *FoodSystem) GetName() string {
	return fs.name
}

// GetPriority возвращает приоритет системы
func (fs *FoodSystem) GetPriority() int {
	return fs.priority
}

// consumeFood обрабатывает поедание еды игроком
func (fs *FoodSystem) consumeFood(playerID string, player *Player, food *FoodItem) {
	// Увеличиваем массу игрока
	oldRadius := player.Radius
	player.Score += int64(food.Mass)

	// Формула роста: новый радиус = sqrt(старая_площадь + съеденная_масса)
	newArea := math.Pi*oldRadius*oldRadius + food.Mass
	newRadius := math.Sqrt(newArea / math.Pi)

	player.Radius = newRadius
	player.LastSeen = time.Now()

	fs.logger.Printf("[FoodSystem] Игрок %s съел %s (тип %s): радиус %.2f -> %.2f, очки +%.0f (всего %d)",
		playerID, food.ID, fs.getFoodTypeName(food.Type),
		oldRadius, newRadius, food.Mass, player.Score)
}
