package telemetry

import (
	"encoding/json"
	"log"
	"math"
	"sync"
	"time"
)

// Vector3 структура для 3D вектора
type Vector3 struct {
	X, Y, Z float64
}

// TelemetryData структура для сбора телеметрии объекта
type TelemetryData struct {
	Timestamp      int64    `json:"timestamp"`                 // Время в миллисекундах
	ObjectID       string   `json:"object_id"`                 // ID объекта
	ObjectType     string   `json:"object_type"`               // Тип объекта (player, food, etc.)
	PhysicsType    string   `json:"physics_type"`              // Тип физики (bullet, ammo, both)
	Position       Vector3  `json:"position"`                  // Позиция
	Velocity       Vector3  `json:"velocity"`                  // Скорость
	Mass           float64  `json:"mass"`                      // Масса
	Radius         float64  `json:"radius"`                    // Радиус
	Speed          float64  `json:"speed"`                     // Модуль скорости
	AppliedImpulse *Vector3 `json:"applied_impulse,omitempty"` // Примененный импульс (если есть)
	Source         string   `json:"source"`                    // Источник данных (server/client)
}

// TelemetryManager управляет сбором и выводом телеметрии
type TelemetryManager struct {
	enabled    bool
	data       []TelemetryData
	mutex      sync.RWMutex
	maxEntries int

	// Счетчики для статистики
	counters      map[string]int
	lastPrint     time.Time
	printInterval time.Duration
}

// NewTelemetryManager создает новый менеджер телеметрии
func NewTelemetryManager() *TelemetryManager {
	return &TelemetryManager{
		enabled:       true, // Включаем по умолчанию для отладки
		data:          make([]TelemetryData, 0),
		maxEntries:    200, // Храним последние 200 записей
		counters:      make(map[string]int),
		lastPrint:     time.Now(),
		printInterval: 2 * time.Second, // Выводим статистику каждые 2 секунды
	}
}

// LogObjectState записывает состояние объекта
func (tm *TelemetryManager) LogObjectState(objectID, objectType, physicsType string,
	position, velocity Vector3, mass, radius float64) {

	if !tm.enabled {
		return
	}

	tm.mutex.Lock()
	defer tm.mutex.Unlock()

	speed := calculateSpeed(velocity)

	entry := TelemetryData{
		Timestamp:   time.Now().UnixMilli(),
		ObjectID:    objectID,
		ObjectType:  objectType,
		PhysicsType: physicsType,
		Position:    position,
		Velocity:    velocity,
		Mass:        mass,
		Radius:      radius,
		Speed:       speed,
		Source:      "server",
	}

	tm.data = append(tm.data, entry)

	// Ограничиваем размер буфера
	if len(tm.data) > tm.maxEntries {
		tm.data = tm.data[1:]
	}

	// Обновляем счетчики
	key := objectType + "_" + physicsType
	tm.counters[key]++
}

// LogImpulse записывает примененный импульс
func (tm *TelemetryManager) LogImpulse(objectID, objectType, physicsType string,
	position, velocity Vector3, mass, radius float64, impulse Vector3) {

	if !tm.enabled {
		return
	}

	tm.mutex.Lock()
	defer tm.mutex.Unlock()

	speed := calculateSpeed(velocity)

	entry := TelemetryData{
		Timestamp:      time.Now().UnixMilli(),
		ObjectID:       objectID,
		ObjectType:     objectType,
		PhysicsType:    physicsType,
		Position:       position,
		Velocity:       velocity,
		Mass:           mass,
		Radius:         radius,
		Speed:          speed,
		AppliedImpulse: &impulse,
		Source:         "server",
	}

	tm.data = append(tm.data, entry)

	// Ограничиваем размер буфера
	if len(tm.data) > tm.maxEntries {
		tm.data = tm.data[1:]
	}

	// Обновляем счетчики
	tm.counters["impulse_"+objectType]++
}

// PrintSummary выводит сводку телеметрии
func (tm *TelemetryManager) PrintSummary() {
	if !tm.enabled {
		return
	}

	now := time.Now()
	if now.Sub(tm.lastPrint) < tm.printInterval {
		return
	}

	tm.mutex.RLock()
	defer tm.mutex.RUnlock()

	log.Println("🔬 [Telemetry] ===== СЕРВЕРНАЯ ТЕЛЕМЕТРИЯ =====")
	log.Printf("📊 [Telemetry] Всего записей: %d", len(tm.data))

	// Статистика по счетчикам
	for key, count := range tm.counters {
		log.Printf("📈 [Telemetry] %s: %d", key, count)
	}

	// Последние записи по игрокам
	tm.printRecentPlayerData()

	// Сброс счетчиков
	tm.counters = make(map[string]int)
	tm.lastPrint = now

	log.Println("🔬 [Telemetry] ===================================")
}

// printRecentPlayerData выводит данные о последних состояниях игроков
func (tm *TelemetryManager) printRecentPlayerData() {
	// Собираем последние данные по каждому игроку
	playerData := make(map[string]TelemetryData)

	for i := len(tm.data) - 1; i >= 0; i-- {
		entry := tm.data[i]
		if entry.ObjectType == "player" {
			if _, exists := playerData[entry.ObjectID]; !exists {
				playerData[entry.ObjectID] = entry
			}
		}
	}

	for playerID, data := range playerData {
		// Конвертируем timestamp в читаемое время
		timestamp := time.UnixMilli(data.Timestamp)

		log.Printf("🎮 [Telemetry] Игрок %s [%s]:", playerID, timestamp.Format("15:04:05.000"))
		log.Printf("   📍 Позиция: (%.2f, %.2f, %.2f)",
			data.Position.X, data.Position.Y, data.Position.Z)
		log.Printf("   🏃 Скорость: (%.2f, %.2f, %.2f) |%.2f|",
			data.Velocity.X, data.Velocity.Y, data.Velocity.Z, data.Speed)
		log.Printf("   ⚖️  Масса: %.2f кг, Радиус: %.2f", data.Mass, data.Radius)
		log.Printf("   🔧 Физика: %s, Источник: %s", data.PhysicsType, data.Source)
		log.Printf("   ⏰ Временная метка: %d", data.Timestamp)

		if data.AppliedImpulse != nil {
			log.Printf("   💥 Импульс: (%.2f, %.2f, %.2f)",
				data.AppliedImpulse.X, data.AppliedImpulse.Y, data.AppliedImpulse.Z)
		}
	}
}

// GetTelemetryJSON возвращает телеметрию в JSON формате
func (tm *TelemetryManager) GetTelemetryJSON() (string, error) {
	tm.mutex.RLock()
	defer tm.mutex.RUnlock()

	jsonData, err := json.MarshalIndent(tm.data, "", "  ")
	if err != nil {
		return "", err
	}

	return string(jsonData), nil
}

// SetEnabled включает/выключает телеметрию
func (tm *TelemetryManager) SetEnabled(enabled bool) {
	tm.mutex.Lock()
	defer tm.mutex.Unlock()

	tm.enabled = enabled
	log.Printf("🔬 [Telemetry] Телеметрия %s", map[bool]string{true: "включена", false: "выключена"}[enabled])
}

// Clear очищает все данные телеметрии
func (tm *TelemetryManager) Clear() {
	tm.mutex.Lock()
	defer tm.mutex.Unlock()

	tm.data = make([]TelemetryData, 0)
	tm.counters = make(map[string]int)
	log.Println("🔬 [Telemetry] Данные телеметрии очищены")
}

// calculateSpeed вычисляет модуль скорости
func calculateSpeed(velocity Vector3) float64 {
	return math.Sqrt(velocity.X*velocity.X + velocity.Y*velocity.Y + velocity.Z*velocity.Z)
}

// Глобальный экземпляр телеметрии
var GlobalTelemetry = NewTelemetryManager()
