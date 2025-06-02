package main

import (
	"fmt"
	"math"
	"math/rand"
	"time"
)

// FoodManager управляет системой еды/ресурсов
type FoodManager struct {
	collider     *ColliderDispatcher
	worldSize    float64             // Размер игрового мира
	foodCount    int                 // Текущее количество еды
	maxFoodCount int                 // Максимальное количество еды в мире
	minFoodSize  float64             // Минимальный размер еды
	maxFoodSize  float64             // Максимальный размер еды
	respawnTimer time.Duration       // Интервал респавна еды
	lastRespawn  time.Time           // Время последнего респавна
	foodTypes    map[string]FoodType // Типы еды
	rng          *rand.Rand          // Генератор случайных чисел
}

// FoodType определяет тип еды
type FoodType struct {
	Name          string  // Название типа еды
	MinSize       float64 // Минимальный размер
	MaxSize       float64 // Максимальный размер
	NutrientValue float64 // Питательная ценность (множитель массы)
	SpawnWeight   int     // Вес при генерации (больше = чаще появляется)
	Color         string  // Цвет для клиента
}

// NewFoodManager создает новый менеджер еды
func NewFoodManager(collider *ColliderDispatcher, worldSize float64) *FoodManager {
	fm := &FoodManager{
		collider:     collider,
		worldSize:    worldSize,
		maxFoodCount: 1000, // Много еды в мире
		minFoodSize:  0.1,
		maxFoodSize:  0.8,
		respawnTimer: 100 * time.Millisecond, // Быстрый респавн
		lastRespawn:  time.Now(),
		foodTypes:    make(map[string]FoodType),
		rng:          rand.New(rand.NewSource(time.Now().UnixNano())),
	}

	// Инициализируем типы еды
	fm.initFoodTypes()

	// Генерируем начальную еду
	fm.spawnInitialFood()

	return fm
}

// initFoodTypes инициализирует различные типы еды
func (fm *FoodManager) initFoodTypes() {
	fm.foodTypes["basic"] = FoodType{
		Name:          "basic",
		MinSize:       0.1,
		MaxSize:       0.3,
		NutrientValue: 1.0,
		SpawnWeight:   70,        // 70% от всей еды
		Color:         "#00FF00", // Зеленый
	}

	fm.foodTypes["medium"] = FoodType{
		Name:          "medium",
		MinSize:       0.3,
		MaxSize:       0.5,
		NutrientValue: 2.0,
		SpawnWeight:   20,        // 20% от всей еды
		Color:         "#FFFF00", // Желтый
	}

	fm.foodTypes["large"] = FoodType{
		Name:          "large",
		MinSize:       0.5,
		MaxSize:       0.8,
		NutrientValue: 4.0,
		SpawnWeight:   8,         // 8% от всей еды
		Color:         "#FF8000", // Оранжевый
	}

	fm.foodTypes["rare"] = FoodType{
		Name:          "rare",
		MinSize:       0.4,
		MaxSize:       0.6,
		NutrientValue: 10.0,      // Очень питательная
		SpawnWeight:   2,         // 2% от всей еды - редкая
		Color:         "#FF00FF", // Пурпурный
	}
}

// getRandomFoodType возвращает случайный тип еды с учетом весов
func (fm *FoodManager) getRandomFoodType() FoodType {
	totalWeight := 0
	for _, foodType := range fm.foodTypes {
		totalWeight += foodType.SpawnWeight
	}

	randomWeight := fm.rng.Intn(totalWeight)
	currentWeight := 0

	for _, foodType := range fm.foodTypes {
		currentWeight += foodType.SpawnWeight
		if randomWeight < currentWeight {
			return foodType
		}
	}

	// Fallback на basic
	return fm.foodTypes["basic"]
}

// spawnInitialFood генерирует начальную еду в мире
func (fm *FoodManager) spawnInitialFood() {
	for i := 0; i < fm.maxFoodCount; i++ {
		fm.spawnFood()
	}
	fmt.Printf("[FoodSystem] Создано %d единиц еды в мире\n", fm.maxFoodCount)
}

// spawnFood создает новую еду в случайном месте
func (fm *FoodManager) spawnFood() *CollidableObject {
	foodType := fm.getRandomFoodType()

	// Случайная позиция в мире
	pos := Vector3{
		X: (fm.rng.Float64() - 0.5) * fm.worldSize,
		Y: (fm.rng.Float64() - 0.5) * fm.worldSize,
		Z: (fm.rng.Float64() - 0.5) * fm.worldSize,
	}

	// Случайный размер в пределах типа еды
	sizeRange := foodType.MaxSize - foodType.MinSize
	size := foodType.MinSize + fm.rng.Float64()*sizeRange

	// Создаем объект еды
	food := &CollidableObject{
		ID:       fmt.Sprintf("food_%d_%d", time.Now().UnixNano(), fm.rng.Intn(10000)),
		Position: pos,
		Radius:   size,
		Type:     "food",
		Mass:     size * size * foodType.NutrientValue, // Масса зависит от размера и питательности
		IsStatic: true,                                 // Еда не двигается
	}

	// Добавляем в коллайдер систему
	fm.collider.AddObject(food)
	fm.foodCount++

	return food
}

// Update обновляет систему еды (вызывается каждый тик)
func (fm *FoodManager) Update() {
	// Проверяем нужен ли респавн еды
	if time.Since(fm.lastRespawn) >= fm.respawnTimer {
		fm.respawnFood()
		fm.lastRespawn = time.Now()
	}
}

// respawnFood пополняет количество еды до максимума
func (fm *FoodManager) respawnFood() {
	currentFoodCount := len(fm.collider.GetObjectsByType("food"))

	if currentFoodCount < fm.maxFoodCount {
		foodToSpawn := fm.maxFoodCount - currentFoodCount
		// Спавним только часть недостающей еды за раз для плавности
		spawnNow := int(math.Min(float64(foodToSpawn), 10))

		for i := 0; i < spawnNow; i++ {
			fm.spawnFood()
		}

		if spawnNow > 0 {
			fmt.Printf("[FoodSystem] Создано %d новых единиц еды (всего: %d)\n",
				spawnNow, currentFoodCount+spawnNow)
		}
	}
}

// ConsumeFood обрабатывает поедание еды игроком
func (fm *FoodManager) ConsumeFood(playerID string, foodID string) (float64, bool) {
	// Получаем объекты игрока и еды
	playerObj := fm.collider.spatialGrid.Objects[playerID]
	foodObj := fm.collider.spatialGrid.Objects[foodID]

	if playerObj == nil || foodObj == nil {
		return 0, false
	}

	// Проверяем что это еда
	if foodObj.Type != "food" {
		return 0, false
	}

	// Проверяем коллизию
	if !CheckSphereCollision(playerObj, foodObj) {
		return 0, false
	}

	// Проверяем что игрок больше еды (может съесть)
	if playerObj.Radius <= foodObj.Radius {
		return 0, false
	}

	// Получаем питательную ценность
	massGain := foodObj.Mass

	// Удаляем еду из мира
	fm.collider.RemoveObject(foodID)
	fm.foodCount--

	fmt.Printf("[FoodSystem] Игрок %s съел еду %s, прирост массы: %.2f\n",
		playerID, foodID, massGain)

	return massGain, true
}

// ProcessAllFoodCollisions обрабатывает все коллизии еды с игроками
func (fm *FoodManager) ProcessAllFoodCollisions() map[string]float64 {
	massGains := make(map[string]float64)

	// Получаем всех игроков
	players := fm.collider.GetObjectsByType("player")

	for _, player := range players {
		// Получаем коллизии для этого игрока
		collisions := fm.collider.GetCollisionsForObject(player.ID)

		for _, collision := range collisions {
			var food *CollidableObject

			// Определяем какой объект - еда
			if collision.Object1.Type == "food" {
				food = collision.Object1
			} else if collision.Object2.Type == "food" {
				food = collision.Object2
			} else {
				continue // Не еда
			}

			// Проверяем может ли игрок съесть эту еду
			if player.Radius > food.Radius {
				massGain, consumed := fm.ConsumeFood(player.ID, food.ID)
				if consumed {
					massGains[player.ID] += massGain
				}
			}
		}
	}

	return massGains
}

// GetFoodInArea возвращает всю еду в определенной области
func (fm *FoodManager) GetFoodInArea(center Vector3, radius float64) []*CollidableObject {
	nearbyObjects := fm.collider.spatialGrid.GetNearbyObjects(center, radius)

	var food []*CollidableObject
	for _, obj := range nearbyObjects {
		if obj.Type == "food" {
			// Проверяем что еда действительно в радиусе
			if center.Distance(obj.Position) <= radius {
				food = append(food, obj)
			}
		}
	}

	return food
}

// GetStats возвращает статистику системы еды
func (fm *FoodManager) GetStats() map[string]interface{} {
	foodObjects := fm.collider.GetObjectsByType("food")

	stats := map[string]interface{}{
		"total_food":    len(foodObjects),
		"max_food":      fm.maxFoodCount,
		"respawn_timer": fm.respawnTimer.Milliseconds(),
		"world_size":    fm.worldSize,
	}

	// Статистика по типам еды
	typeStats := make(map[string]int)
	for _, food := range foodObjects {
		// Определяем тип еды по размеру (примерно)
		if food.Radius <= 0.3 {
			typeStats["basic"]++
		} else if food.Radius <= 0.5 {
			typeStats["medium"]++
		} else {
			typeStats["large"]++
		}
	}
	stats["food_types"] = typeStats

	return stats
}

// ClearAllFood удаляет всю еду из мира
func (fm *FoodManager) ClearAllFood() {
	foodObjects := fm.collider.GetObjectsByType("food")

	for _, food := range foodObjects {
		fm.collider.RemoveObject(food.ID)
	}

	fm.foodCount = 0
	fmt.Printf("[FoodSystem] Вся еда удалена из мира\n")
}
