package game

import (
	"fmt"
	"io"
	"log"
	"os"
	"testing"

	"x-cells/backend/internal/world"
)

// MockBroadcaster для тестирования
type MockBroadcaster struct {
	ConsumedEvents []ConsumedEvent
	SpawnedEvents  []interface{}
	StateEvents    []interface{}
}

type ConsumedEvent struct {
	PlayerID string
	FoodID   string
	MassGain float64
}

func (mb *MockBroadcaster) BroadcastFoodConsumed(playerID, foodID string, massGain float64) {
	mb.ConsumedEvents = append(mb.ConsumedEvents, ConsumedEvent{
		PlayerID: playerID,
		FoodID:   foodID,
		MassGain: massGain,
	})
}

func (mb *MockBroadcaster) BroadcastFoodSpawned(food interface{}) {
	mb.SpawnedEvents = append(mb.SpawnedEvents, food)
}

func (mb *MockBroadcaster) BroadcastFoodState(foodItems interface{}) {
	mb.StateEvents = append(mb.StateEvents, foodItems)
}

func (mb *MockBroadcaster) BroadcastPlayerSizeUpdate(playerID string, newRadius float64, newMass float64) {
	// Mock implementation - can be extended if needed for testing
}

// Создаем тестовый GameTicker с игроками
func createTestGameTicker() *GameTicker {
	logger := log.New(os.Stdout, "[TEST] ", log.LstdFlags)
	worldManager := world.NewManager()
	ticker := NewGameTicker(20, worldManager, logger)

	return ticker
}

func TestSimpleFoodSystem_Collisions(t *testing.T) {
	// Создаем тестовые компоненты
	gameTicker := createTestGameTicker()
	logger := log.New(os.Stdout, "[TEST] ", log.LstdFlags)

	// Создаем систему еды
	foodSystem := NewSimpleFoodSystem(gameTicker, logger)

	// Создаем mock broadcaster
	mockBroadcaster := &MockBroadcaster{}
	foodSystem.SetBroadcaster(mockBroadcaster)

	// === Тест 1: Добавляем игрока далеко от еды ===
	playerID1 := "test_player_1"
	farPosition := Vector3{X: 100.0, Y: 80.0, Z: 100.0} // Далеко от центра
	gameTicker.AddPlayer(playerID1, farPosition)

	// Создаем еду в центре
	food1 := &SimpleFood{
		ID:     "test_food_1",
		X:      0.0,
		Y:      1.0,
		Z:      0.0,
		Radius: 0.5,
		Mass:   1.0,
		Color:  "#90EE90",
	}
	foodSystem.foodItems[food1.ID] = food1

	// Проверяем коллизии - НЕ должно быть столкновения
	foodSystem.checkCollisions()

	if len(mockBroadcaster.ConsumedEvents) != 0 {
		t.Errorf("Ожидали 0 событий поглощения, получили %d", len(mockBroadcaster.ConsumedEvents))
	}

	if len(foodSystem.foodItems) != 1 {
		t.Errorf("Еда не должна исчезнуть, осталось %d", len(foodSystem.foodItems))
	}

	// === Тест 2: Добавляем игрока ТОЧНО на еду ===
	playerID2 := "test_player_2"
	exactPosition := Vector3{X: 0.0, Y: 1.0, Z: 0.0} // Точно на еде
	gameTicker.AddPlayer(playerID2, exactPosition)

	// Проверяем коллизии - ДОЛЖНО быть столкновение
	foodSystem.checkCollisions()

	if len(mockBroadcaster.ConsumedEvents) != 1 {
		t.Errorf("Ожидали 1 событие поглощения, получили %d", len(mockBroadcaster.ConsumedEvents))
	}

	if len(foodSystem.foodItems) != 0 {
		t.Errorf("Еда должна исчезнуть, осталось %d", len(foodSystem.foodItems))
	}

	// Проверяем детали события
	if len(mockBroadcaster.ConsumedEvents) > 0 {
		event := mockBroadcaster.ConsumedEvents[0]
		if event.PlayerID != playerID2 {
			t.Errorf("Неверный playerID: ожидали %s, получили %s", playerID2, event.PlayerID)
		}
		if event.FoodID != food1.ID {
			t.Errorf("Неверный foodID: ожидали %s, получили %s", food1.ID, event.FoodID)
		}
		if event.MassGain != 1.0 {
			t.Errorf("Неверная масса: ожидали 1.0, получили %.1f", event.MassGain)
		}
	}
}

func TestSimpleFoodSystem_CollisionBoundary(t *testing.T) {
	// Тест граничных случаев коллизий
	gameTicker := createTestGameTicker()
	logger := log.New(os.Stdout, "[TEST] ", log.LstdFlags)

	foodSystem := NewSimpleFoodSystem(gameTicker, logger)
	mockBroadcaster := &MockBroadcaster{}
	foodSystem.SetBroadcaster(mockBroadcaster)

	// Создаем еду в центре
	food := &SimpleFood{
		ID:     "boundary_food",
		X:      0.0,
		Y:      1.0,
		Z:      0.0,
		Radius: 0.5, // радиус еды
		Mass:   1.0,
		Color:  "#90EE90",
	}
	foodSystem.foodItems[food.ID] = food

	// Тест: игрок на ТОЧНОЙ границе коллизии
	// collisionDistance = playerRadius(1.0) + foodRadius(0.5) = 1.5
	playerID := "boundary_player"
	boundaryPosition := Vector3{X: 1.5, Y: 1.0, Z: 0.0} // Точно на границе
	gameTicker.AddPlayer(playerID, boundaryPosition)

	foodSystem.checkCollisions()

	// На границе ДОЛЖНА быть коллизия (distance <= collisionDistance)
	if len(mockBroadcaster.ConsumedEvents) != 1 {
		t.Errorf("На границе должна быть коллизия, получили %d событий", len(mockBroadcaster.ConsumedEvents))
	}

	// Тест: игрок ЧУТЬ за границей
	food2 := &SimpleFood{
		ID:     "boundary_food_2",
		X:      0.0,
		Y:      1.0,
		Z:      0.0,
		Radius: 0.5,
		Mass:   1.0,
		Color:  "#90EE90",
	}
	foodSystem.foodItems[food2.ID] = food2

	// Очищаем события
	mockBroadcaster.ConsumedEvents = []ConsumedEvent{}

	// Обновляем позицию игрока чуть за границу
	player := gameTicker.GetPlayer(playerID)
	player.Position.X = 1.51 // Чуть больше чем 1.5

	foodSystem.checkCollisions()

	// За границей НЕ должно быть коллизии
	if len(mockBroadcaster.ConsumedEvents) != 0 {
		t.Errorf("За границей не должно быть коллизии, получили %d событий", len(mockBroadcaster.ConsumedEvents))
	}
}

func TestSimpleFoodSystem_MultiplePlayersOneFood(t *testing.T) {
	// Тест: несколько игроков претендуют на одну еду
	gameTicker := createTestGameTicker()
	logger := log.New(os.Stdout, "[TEST] ", log.LstdFlags)

	foodSystem := NewSimpleFoodSystem(gameTicker, logger)
	mockBroadcaster := &MockBroadcaster{}
	foodSystem.SetBroadcaster(mockBroadcaster)

	// Создаем еду
	food := &SimpleFood{
		ID:     "contested_food",
		X:      0.0,
		Y:      1.0,
		Z:      0.0,
		Radius: 0.5,
		Mass:   1.0,
		Color:  "#90EE90",
	}
	foodSystem.foodItems[food.ID] = food

	// Добавляем двух игроков на одинаковом расстоянии от еды
	player1ID := "player1"
	player2ID := "player2"

	pos1 := Vector3{X: 0.5, Y: 1.0, Z: 0.0}  // В зоне коллизии
	pos2 := Vector3{X: -0.5, Y: 1.0, Z: 0.0} // Тоже в зоне коллизии

	gameTicker.AddPlayer(player1ID, pos1)
	gameTicker.AddPlayer(player2ID, pos2)

	foodSystem.checkCollisions()

	// Должно быть только 1 событие (один игрок съел еду)
	if len(mockBroadcaster.ConsumedEvents) != 1 {
		t.Errorf("Ожидали 1 событие, получили %d", len(mockBroadcaster.ConsumedEvents))
	}

	// Еда должна исчезнуть
	if len(foodSystem.foodItems) != 0 {
		t.Errorf("Еда должна исчезнуть, осталось %d", len(foodSystem.foodItems))
	}
}

func TestSimpleFoodSystem_MassUpdate(t *testing.T) {
	// Тест: проверка обновления массы игрока
	gameTicker := createTestGameTicker()
	logger := log.New(os.Stdout, "[TEST] ", log.LstdFlags)

	foodSystem := NewSimpleFoodSystem(gameTicker, logger)
	mockBroadcaster := &MockBroadcaster{}
	foodSystem.SetBroadcaster(mockBroadcaster)

	// Добавляем игрока
	playerID := "mass_player"
	position := Vector3{X: 0.0, Y: 1.0, Z: 0.0}
	gameTicker.AddPlayer(playerID, position)

	// Проверяем начальную массу
	player := gameTicker.GetPlayer(playerID)
	initialMass := player.Mass

	// Создаем еду с известной массой
	food := &SimpleFood{
		ID:     "mass_food",
		X:      0.0,
		Y:      1.0,
		Z:      0.0,
		Radius: 0.5,
		Mass:   2.5, // Особая масса
		Color:  "#90EE90",
	}
	foodSystem.foodItems[food.ID] = food

	foodSystem.checkCollisions()

	// Проверяем что масса увеличилась
	finalMass := player.Mass
	expectedMass := initialMass + 2.5

	if finalMass != expectedMass {
		t.Errorf("Масса игрока должна быть %.1f, получили %.1f", expectedMass, finalMass)
	}
}

// Бенчмарк для проверки производительности
func BenchmarkSimpleFoodSystem_Collisions(b *testing.B) {
	gameTicker := createTestGameTicker()
	logger := log.New(io.Discard, "", 0) // Отключаем логи для бенчмарка

	foodSystem := NewSimpleFoodSystem(gameTicker, logger)

	// Добавляем много игроков и еды
	for i := 0; i < 100; i++ {
		playerID := fmt.Sprintf("bench_player_%d", i)
		pos := Vector3{
			X: float64(i%10 - 5),
			Y: 1.0,
			Z: float64(i/10 - 5),
		}
		gameTicker.AddPlayer(playerID, pos)

		food := &SimpleFood{
			ID:     fmt.Sprintf("bench_food_%d", i),
			X:      float64(i%10-5) + 0.1,
			Y:      1.0,
			Z:      float64(i/10-5) + 0.1,
			Radius: 0.5,
			Mass:   1.0,
			Color:  "#90EE90",
		}
		foodSystem.foodItems[food.ID] = food
	}

	b.ResetTimer()

	for i := 0; i < b.N; i++ {
		foodSystem.checkCollisions()
	}
}
