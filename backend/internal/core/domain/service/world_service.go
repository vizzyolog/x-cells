package service

import (
	"context"
	"fmt"
	"log"

	"x-cells/backend/internal/core/domain/entity"
	"x-cells/backend/internal/core/port/out/physics"
)

// WorldService реализует бизнес-логику для управления миром
type WorldService struct {
	world       *entity.World
	physicsPort physics.PhysicsPort
}

// NewWorldService создает новый экземпляр сервиса для работы с миром
func NewWorldService(physicsPort physics.PhysicsPort) *WorldService {
	return &WorldService{
		world:       entity.NewWorld(),
		physicsPort: physicsPort,
	}
}

// GetAllObjects возвращает все объекты в мире
func (s *WorldService) GetAllObjects() map[string]*entity.GameObject {
	return s.world.GetAllObjects()
}

// GetObject возвращает объект по его ID
func (s *WorldService) GetObject(id string) *entity.GameObject {
	return s.world.GetObject(id)
}

// CreateObject создает новый объект в мире и в физической симуляции
func (s *WorldService) CreateObject(ctx context.Context, object *entity.GameObject) error {
	// Добавляем объект в мир
	s.world.AddObject(object)

	// Если физический клиент доступен, создаем объект в физической симуляции
	if s.physicsPort != nil {
		req := &physics.CreateObjectRequest{
			ID:         object.ID,
			ObjectType: string(object.ObjectType),
			Position:   physics.Vector3{X: object.Position.X, Y: object.Position.Y, Z: object.Position.Z},
			Size:       object.Radius,
			Mass:       object.Mass,
			Color:      object.Color,
		}

		_, err := s.physicsPort.CreateObject(ctx, req)
		if err != nil {
			// Логируем ошибку, но не удаляем объект из мира
			log.Printf("Ошибка при создании физического объекта %s: %v", object.ID, err)
			return fmt.Errorf("ошибка при создании физического объекта: %w", err)
		}
	}

	log.Printf("Создан объект %s типа %s", object.ID, object.ObjectType)
	return nil
}

// RemoveObject удаляет объект из мира
func (s *WorldService) RemoveObject(id string) error {
	// Удаляем объект из мира
	s.world.RemoveObject(id)

	// TODO: Добавить удаление из физической симуляции, когда это будет поддерживаться

	log.Printf("Удален объект %s", id)
	return nil
}

// ApplyImpulse применяет импульс к объекту через физический движок
func (s *WorldService) ApplyImpulse(ctx context.Context, id string, direction entity.Vector3, strength float64) error {
	// Проверяем, существует ли объект
	obj := s.world.GetObject(id)
	if obj == nil {
		return fmt.Errorf("объект с ID %s не найден", id)
	}

	// Применяем импульс через физический клиент
	if s.physicsPort != nil {
		req := &physics.ApplyImpulseRequest{
			ID:        id,
			Direction: physics.Vector3{X: direction.X, Y: direction.Y, Z: direction.Z},
			Strength:  strength,
		}

		_, err := s.physicsPort.ApplyImpulse(ctx, req)
		if err != nil {
			log.Printf("Ошибка при применении импульса к объекту %s: %v", id, err)
			return fmt.Errorf("ошибка при применении импульса: %w", err)
		}
	}

	log.Printf("Применен импульс к объекту %s с силой %f", id, strength)
	return nil
}

// UpdateObjectPosition обновляет позицию объекта
func (s *WorldService) UpdateObjectPosition(id string, position entity.Vector3) error {
	if !s.world.UpdateObjectPosition(id, position) {
		return fmt.Errorf("объект с ID %s не найден", id)
	}

	// Здесь можно добавить дополнительную логику, например, проверку коллизий

	return nil
}

// UpdateObjectVelocity обновляет скорость объекта
func (s *WorldService) UpdateObjectVelocity(id string, velocity entity.Vector3) error {
	if !s.world.UpdateObjectVelocity(id, velocity) {
		return fmt.Errorf("объект с ID %s не найден", id)
	}

	return nil
}

// SyncObjectStates синхронизирует состояния объектов с физическим движком
func (s *WorldService) SyncObjectStates(ctx context.Context) {
	if s.physicsPort == nil {
		return
	}

	// Получаем все объекты из мира
	objects := s.world.GetAllObjects()

	for id, obj := range objects {
		// Пропускаем объекты типа террейн
		if obj.ObjectType == entity.TypeTerrain {
			continue
		}

		// Получаем актуальное состояние объекта из физического движка
		req := &physics.GetObjectStateRequest{ID: id}
		resp, err := s.physicsPort.GetObjectState(ctx, req)

		if err != nil {
			log.Printf("Ошибка при получении состояния объекта %s: %v", id, err)
			continue
		}

		// Обновляем позицию и скорость объекта
		s.world.UpdateObjectPosition(id, entity.Vector3{
			X: resp.Position.X,
			Y: resp.Position.Y,
			Z: resp.Position.Z,
		})

		s.world.UpdateObjectVelocity(id, entity.Vector3{
			X: resp.Velocity.X,
			Y: resp.Velocity.Y,
			Z: resp.Velocity.Z,
		})
	}
}
