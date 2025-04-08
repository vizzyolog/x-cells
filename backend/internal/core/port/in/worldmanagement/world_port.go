package worldmanagement

import (
	"context"
	"x-cells/backend/internal/core/domain/entity"
)

// WorldManagementPort определяет интерфейс для управления игровым миром
type WorldManagementPort interface {
	// GetAllObjects возвращает все объекты в мире
	GetAllObjects() map[string]*entity.GameObject

	// GetObject возвращает объект по его ID
	GetObject(id string) *entity.GameObject

	// CreateObject создает новый объект в мире
	CreateObject(ctx context.Context, object *entity.GameObject) error

	// RemoveObject удаляет объект из мира
	RemoveObject(id string) error

	// ApplyImpulse применяет импульс к объекту
	ApplyImpulse(ctx context.Context, id string, direction entity.Vector3, strength float64) error

	// UpdateObjectPosition обновляет позицию объекта
	UpdateObjectPosition(id string, position entity.Vector3) error

	// UpdateObjectVelocity обновляет скорость объекта
	UpdateObjectVelocity(id string, velocity entity.Vector3) error
}
