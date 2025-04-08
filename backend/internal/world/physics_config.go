package world

// PhysicsConfig содержит все настройки физики, используемые в разных компонентах
type PhysicsConfig struct {
	// Настройки импульсов и движения
	BaseImpulse        float32 `json:"base_impulse"`        // Базовый импульс для движения объектов
	MaxImpulse         float32 `json:"max_impulse"`         // Максимальная величина импульса
	DistanceMultiplier float32 `json:"distance_multiplier"` // Множитель дистанции для импульса
	ImpulseMultiplier  float32 `json:"impulse_multiplier"`  // Множитель импульса в физических движках

	// Ограничения скорости
	MaxSpeed float32 `json:"max_speed"` // Максимальная скорость объектов

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
		// Настройки импульсов
		BaseImpulse:        8.0, // Увеличено с 5.0 для более мощного движения
		MaxImpulse:         50.0,
		DistanceMultiplier: 0.7, // Увеличено с 0.5 для большего влияния дистанции
		ImpulseMultiplier:  0.5, // Увеличено с 0.3 для усиления импульса

		// Ограничения скорости
		MaxSpeed: 80.0,

		// Массы объектов
		PlayerMass:     15.0,
		DefaultBoxMass: 5.0,

		// Физические свойства
		Restitution: 0.9,
		Friction:    0.05,

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
