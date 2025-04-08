package physics

import "sync"

// PhysicsConfig содержит настройки для физики
type PhysicsConfig struct {
	// BaseImpulse - базовая сила импульса, применяемая к объектам
	BaseImpulse float64

	// MaxImpulse - максимальная сила импульса
	MaxImpulse float64

	// DistanceMultiplier - множитель для расчета импульса в зависимости от расстояния
	DistanceMultiplier float64

	// ImpulseMultiplier - общий множитель импульса
	ImpulseMultiplier float64

	// MaxSpeed - максимальная скорость объекта
	MaxSpeed float64

	// Restitution - коэффициент восстановления (отскока)
	Restitution float64

	// MaxImpulseMagnitude - максимальная абсолютная величина импульса для безопасности
	MaxImpulseMagnitude float64

	// TerrainRestitution - коэффициент упругости для террейна
	TerrainRestitution float64

	// ObjectRestitution - коэффициент упругости для динамических объектов
	ObjectRestitution float64

	// Friction - трение для объектов
	Friction float64

	// RollingFriction - сопротивление качению
	RollingFriction float64

	// LinearDamping - затухание линейного движения
	LinearDamping float64

	// AngularDamping - затухание углового движения
	AngularDamping float64

	// CcdMotionThresholdFactor - множитель порога непрерывного обнаружения столкновений
	CcdMotionThresholdFactor float64

	// CcdSweptSphereRadiusFactor - множитель радиуса для непрерывного обнаружения столкновений
	CcdSweptSphereRadiusFactor float64

	// MinSpeedFactor - минимальный фактор скорости при применении импульса
	MinSpeedFactor float64

	// StepSimulationRate - частота шага симуляции
	StepSimulationRate int
}

// GlobalPhysicsConfig - глобальная конфигурация физики
var GlobalPhysicsConfig *PhysicsConfig
var configMutex sync.RWMutex

// DefaultPhysicsConfig возвращает конфигурацию по умолчанию
func DefaultPhysicsConfig() *PhysicsConfig {
	return &PhysicsConfig{
		BaseImpulse:                50.0,   // Увеличено с 5.0
		MaxImpulse:                 120.0,  // Увеличено с 80.0
		MaxSpeed:                   150.0,  // Увеличено с 80.0
		DistanceMultiplier:         0.5,    // Увеличено с 0.2
		ImpulseMultiplier:          0.8,    // Увеличено с 0.3
		MaxImpulseMagnitude:        2000.0, // Увеличено с 1000.0
		LinearDamping:              0.0,
		AngularDamping:             0.0,
		Restitution:                0.7,
		Friction:                   0.2,
		RollingFriction:            0.05,
		TerrainRestitution:         0.6,
		ObjectRestitution:          0.98,
		StepSimulationRate:         120,
		CcdMotionThresholdFactor:   0.7,
		CcdSweptSphereRadiusFactor: 0.6,
		MinSpeedFactor:             0.3,
	}
}

// GetPhysicsConfig возвращает текущую конфигурацию физики
func GetPhysicsConfig() *PhysicsConfig {
	configMutex.RLock()
	defer configMutex.RUnlock()

	if GlobalPhysicsConfig == nil {
		// Создаем копию, чтобы избежать гонок данных
		config := DefaultPhysicsConfig()
		return config
	}

	// Создаем копию, чтобы избежать гонок данных
	config := *GlobalPhysicsConfig
	return &config
}

// SetPhysicsConfig устанавливает новую конфигурацию физики
func SetPhysicsConfig(config *PhysicsConfig) {
	configMutex.Lock()
	defer configMutex.Unlock()

	// Создаем копию для предотвращения гонок данных
	newConfig := *config
	GlobalPhysicsConfig = &newConfig
}

// Initialize инициализирует глобальную конфигурацию физики
func Initialize() {
	if GlobalPhysicsConfig == nil {
		SetPhysicsConfig(DefaultPhysicsConfig())
	}
}

func init() {
	Initialize()
}
