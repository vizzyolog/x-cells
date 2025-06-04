package game

import (
	"log"
	"time"
)

// CollisionManagerSystem система управления коллизиями для всех объектов
type CollisionManagerSystem struct {
	name       string
	priority   int
	gameTicker *GameTicker
	logger     *log.Logger
	collider   *ColliderDispatcher
	foodSystem *FoodSystem
}

// NewCollisionManagerSystem создает новую систему управления коллизиями
func NewCollisionManagerSystem(gameTicker *GameTicker, logger *log.Logger) *CollisionManagerSystem {
	return &CollisionManagerSystem{
		name:       "CollisionManagerSystem",
		priority:   12, // После PlayerManagementSystem но до физики
		gameTicker: gameTicker,
		logger:     logger,
		collider:   NewColliderDispatcher(5.0), // Размер ячейки 5.0 оптимален для объектов 0.3-2.0
	}
}

// SetFoodSystem привязывает систему еды
func (cms *CollisionManagerSystem) SetFoodSystem(foodSystem *FoodSystem) {
	cms.foodSystem = foodSystem
	// Передаем коллайдер в FoodSystem
	foodSystem.collider = cms.collider
}

// Update обновляет систему коллизий
func (cms *CollisionManagerSystem) Update(deltaTime time.Duration) error {
	// Синхронизируем игроков в коллайдере
	cms.syncPlayersToCollider()

	// Синхронизируем еду (если система еды доступна)
	if cms.foodSystem != nil {
		cms.syncFoodToCollider()
	}

	// Обрабатываем коллизии еды с игроками
	if cms.foodSystem != nil {
		cms.processFoodConsumption()
	}

	return nil
}

// syncPlayersToCollider синхронизирует игроков в spatial grid
func (cms *CollisionManagerSystem) syncPlayersToCollider() {
	players := cms.gameTicker.GetAllPlayers()

	// Логируем каждые 5 секунд
	if cms.gameTicker.GetTickCount()%100 == 0 { // 5 секунд при 20 TPS
		cms.logger.Printf("[CollisionManager] Синхронизация игроков: %d в GameTicker, %d в коллайдере",
			len(players), cms.collider.GetObjectCount())
	}

	for playerID, player := range players {
		// Отладочное логирование для первого игрока или периодически
		if playerID == "test_player_1" || cms.gameTicker.GetTickCount()%100 == 0 {
			cms.logger.Printf("[CollisionManager] Синхронизация игрока %s в позиции (%.1f, %.1f, %.1f)",
				playerID, player.Position.X, player.Position.Y, player.Position.Z)
		}

		// Создаем объект коллизии для игрока
		collisionObj := &CollidableObject{
			ID:       playerID,
			Position: player.Position,
			Radius:   player.Radius,
			Type:     "player",
			Mass:     float64(player.Score), // Масса = очки
			IsStatic: false,
		}

		// Обновляем или добавляем в коллайдер
		cms.collider.AddObject(collisionObj)
	}
}

// syncFoodToCollider синхронизирует еду в коллайдере (еда уже добавляется при создании)
func (cms *CollisionManagerSystem) syncFoodToCollider() {
	// Еда добавляется в коллайдер при создании в FoodSystem
	// Здесь мы можем проверить консистентность
	if cms.gameTicker.GetTickCount()%1000 == 0 { // Каждые 50 секунд при 20 TPS
		foodInCollider := len(cms.collider.GetObjectsByType("food"))
		foodInSystem := len(cms.foodSystem.GetFoodItems())

		if foodInCollider != foodInSystem {
			cms.logger.Printf("[CollisionManager] ПРЕДУПРЕЖДЕНИЕ: рассинхронизация еды - в коллайдере %d, в системе %d",
				foodInCollider, foodInSystem)
		}
	}
}

// processFoodConsumption обрабатывает поедание еды игроками
func (cms *CollisionManagerSystem) processFoodConsumption() {
	players := cms.gameTicker.GetAllPlayers()
	if len(players) == 0 {
		return
	}

	cms.foodSystem.foodMutex.Lock()
	defer cms.foodSystem.foodMutex.Unlock()

	var consumedFood []string
	consumedSet := make(map[string]bool) // Защита от дублирования

	// Отладочное логирование каждые 5 секунд
	if cms.gameTicker.GetTickCount()%100 == 0 { // 5 секунд при 20 TPS
		foodCount := len(cms.foodSystem.foodItems)
		colliderFoodCount := len(cms.collider.GetObjectsByType("food"))
		cms.logger.Printf("[CollisionManager] ОТЛАДКА: игроков %d, еды в системе %d, еды в коллайдере %d",
			len(players), foodCount, colliderFoodCount)
	}

	// Используем spatial hashing для эффективного поиска коллизий
	for playerID, player := range players {
		// Получаем только близлежащую еду из spatial grid
		nearbyObjects := cms.collider.GetNearbyObjects(player.Position, player.Radius*2)

		// Отладочное логирование для первого игрока
		if playerID == "test_player_1" || cms.gameTicker.GetTickCount()%100 == 0 {
			cms.logger.Printf("[CollisionManager] ОТЛАДКА: игрок %s (радиус %.2f) в позиции (%.1f,%.1f,%.1f), найдено объектов рядом: %d",
				playerID, player.Radius, player.Position.X, player.Position.Y, player.Position.Z, len(nearbyObjects))
		}

		for _, obj := range nearbyObjects {
			// Проверяем только объекты типа "food"
			if obj.Type != "food" {
				continue
			}

			// Проверяем, что еда не была уже съедена в этом тике
			if consumedSet[obj.ID] {
				continue
			}

			food, exists := cms.foodSystem.foodItems[obj.ID]
			if !exists {
				// Еда уже удалена, но объект еще в коллайдере - очищаем
				cms.collider.RemoveObject(obj.ID)
				cms.logger.Printf("[CollisionManager] ОТЛАДКА: еда %s удалена из коллайдера (рассинхронизация)", obj.ID)
				continue
			}

			// Точная проверка коллизии между сферами
			distance := player.Position.Distance(food.Position)

			// Проверяем коллизию (игрок может съесть еду, если она меньше его)
			minDistance := player.Radius + food.Radius

			// Отладочное логирование коллизий
			if distance < minDistance*2 { // Логируем если близко
				cms.logger.Printf("[CollisionManager] ОТЛАДКА: игрок %s (радиус %.2f) и еда %s (радиус %.2f): расстояние %.2f, мин. расстояние %.2f, может съесть: %t",
					playerID, player.Radius, obj.ID, food.Radius, distance, minDistance, player.Radius >= food.Radius)
			}

			if distance < minDistance && player.Radius >= food.Radius {
				// Игрок съел еду!
				cms.logger.Printf("[CollisionManager] ПОЕДАНИЕ: игрок %s съел еду %s!", playerID, obj.ID)
				cms.foodSystem.consumeFood(playerID, player, food)
				consumedFood = append(consumedFood, obj.ID)
				consumedSet[obj.ID] = true

				// Сразу удаляем из коллайдера
				cms.collider.RemoveObject(obj.ID)
				break // Игрок съел еду, переходим к следующему игроку
			}
		}
	}

	// Удаляем съеденную еду из foodItems
	for _, foodID := range consumedFood {
		delete(cms.foodSystem.foodItems, foodID)
	}

	if len(consumedFood) > 0 {
		cms.logger.Printf("[CollisionManager] Обработано поедание: %d объектов еды", len(consumedFood))
	}
}

// GetCollider возвращает коллайдер для других систем
func (cms *CollisionManagerSystem) GetCollider() *ColliderDispatcher {
	return cms.collider
}

// GetName возвращает имя системы
func (cms *CollisionManagerSystem) GetName() string {
	return cms.name
}

// GetPriority возвращает приоритет системы
func (cms *CollisionManagerSystem) GetPriority() int {
	return cms.priority
}
