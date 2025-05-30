package world

import "sync"

// WorldPhysicsConfig содержит глобальные настройки физики мира
type WorldPhysicsConfig struct {
	// Настройки гравитации
	GravityX float32
	GravityY float32
	GravityZ float32

	// Глобальные параметры затухания
	LinearDamping  float32
	AngularDamping float32

	// Глобальные параметры трения
	Friction        float32
	RollingFriction float32
}

// PlayerConfig содержит настройки игрока
type PlayerConfig struct {
	// Физические характеристики игрока
	PlayerMass  float32 // Масса игрока
	Restitution float32 // Способность к отскоку (скилл прыгучести)
}

// ControlConfig содержит настройки управления
type ControlConfig struct {
	// Настройки импульсов и движения
	BaseImpulse        float32
	MaxImpulse         float32
	DistanceMultiplier float32
	ImpulseMultiplier  float32
}

// PhysicsConfig объединяет все конфигурации
type PhysicsConfig struct {
	World   WorldPhysicsConfig
	Player  PlayerConfig
	Control ControlConfig
}

var (
	physicsConfig PhysicsConfig
	configMutex   sync.RWMutex
)

// Инициализация конфигурации по умолчанию
func init() {
	physicsConfig = PhysicsConfig{
		World: WorldPhysicsConfig{
			// Настройки гравитации
			GravityX: 0.0,
			GravityY: -9.81,
			GravityZ: 0.0,

			// Глобальные параметры затухания
			LinearDamping:  0.2,
			AngularDamping: 0.3,

			// Глобальные параметры трения
			Friction:        1.0,
			RollingFriction: 0.3,
		},

		Player: PlayerConfig{
			// Физические характеристики игрока
			PlayerMass:  300.0, // базовая масса игрока
			Restitution: 0.1,   // низкая прыгучесть по умолчанию
		},

		Control: ControlConfig{
			// Настройки импульсов - увеличены для более отзывчивого управления
			BaseImpulse:        80.0,
			MaxImpulse:         400.0,
			DistanceMultiplier: 1.5,
			ImpulseMultiplier:  1.0,
		},
	}
}

// GetPhysicsConfig возвращает текущую конфигурацию физики
func GetPhysicsConfig() PhysicsConfig {
	configMutex.RLock()
	defer configMutex.RUnlock()
	return physicsConfig
}

// SetPhysicsConfig устанавливает новую конфигурацию физики
func SetPhysicsConfig(config PhysicsConfig) {
	configMutex.Lock()
	defer configMutex.Unlock()
	physicsConfig = config
}

// GetWorldConfig возвращает только конфигурацию мира
func GetWorldConfig() WorldPhysicsConfig {
	configMutex.RLock()
	defer configMutex.RUnlock()
	return physicsConfig.World
}

// GetPlayerConfig возвращает только конфигурацию игрока
func GetPlayerConfig() PlayerConfig {
	configMutex.RLock()
	defer configMutex.RUnlock()
	return physicsConfig.Player
}

// GetControlConfig возвращает только конфигурацию управления
func GetControlConfig() ControlConfig {
	configMutex.RLock()
	defer configMutex.RUnlock()
	return physicsConfig.Control
}
