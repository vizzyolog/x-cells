package world

// PhysicsConfig содержит все настройки физики, используемые в разных компонентах
type PhysicsConfig struct {
	// Настройки импульсов и движения
	BaseImpulse        float32 `json:"base_impulse"`        // Базовый импульс для движения объектов
	MaxImpulse         float32 `json:"max_impulse"`         // Максимальная величина импульса
	DistanceMultiplier float32 `json:"distance_multiplier"` // Множитель дистанции для импульса

	// Массы объектов
	PlayerMass     float32 `json:"player_mass"`      // Масса игрока
	DefaultBoxMass float32 `json:"default_box_mass"` // Масса коробки по умолчанию

	// Физические свойства
	Restitution float32 `json:"restitution"` // Упругость объектов (отскок)
	Friction    float32 `json:"friction"`    // Трение объектов

	// Настройки гравитации
	GravityX float32 `json:"gravity_x"` // Гравитация по оси X
	GravityY float32 `json:"gravity_y"` // Гравитация по оси Y
	GravityZ float32 `json:"gravity_z"` // Гравитация по оси Z
}

// DefaultPhysicsConfig возвращает стандартные настройки физики
func DefaultPhysicsConfig() *PhysicsConfig {
	return &PhysicsConfig{
		// Настройки импульсов - увеличены для более отзывчивого управления
		BaseImpulse:        300.0, // было 30.0
		MaxImpulse:         800.0, // было 160.0
		DistanceMultiplier: 2,     // увеличиваем влияние расстояния

		// Массы объектов - уменьшены для лучшей отзывчивости
		PlayerMass:     35,  // было 35.0
		DefaultBoxMass: 3.0, // было 5.0

		// Физические свойства - настроены для более плавного движения
		Restitution: 0.2,  // увеличена упругость
		Friction:    0.02, // уменьшено трение

		// Настройки гравитации
		GravityX: 0.0,
		GravityY: -9.81,
		GravityZ: 0.0,
	}
}

// Глобальный экземпляр конфигурации физики
var GlobalPhysicsConfig = DefaultPhysicsConfig()

// GetPhysicsConfig возвращает текущую конфигурацию физики
func GetPhysicsConfig() *PhysicsConfig {
	return GlobalPhysicsConfig
}

// SetPhysicsConfig устанавливает новую конфигурацию физики
func SetPhysicsConfig(config *PhysicsConfig) {
	GlobalPhysicsConfig = config
}
