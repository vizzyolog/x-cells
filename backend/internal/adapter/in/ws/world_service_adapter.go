package ws

import (
	"context"
	"x-cells/backend/internal/core/domain/entity"
	"x-cells/backend/internal/core/domain/service"
)

// WorldServiceAdapter адаптирует WorldService для использования с интерфейсом WorldPort
type WorldServiceAdapter struct {
	worldService *service.WorldService
}

// NewWorldServiceAdapter создает новый адаптер для WorldService
func NewWorldServiceAdapter(worldService *service.WorldService) *WorldServiceAdapter {
	return &WorldServiceAdapter{
		worldService: worldService,
	}
}

// GetObject возвращает объект по его ID
func (a *WorldServiceAdapter) GetObject(id string) *GameObject {
	entityObj := a.worldService.GetObject(id)
	if entityObj == nil {
		return nil
	}

	// Преобразуем entity.GameObject в ws.GameObject
	return convertEntityObjectToWSObject(entityObj)
}

// CreateObject создает новый объект
func (a *WorldServiceAdapter) CreateObject(ctx context.Context, obj *GameObject) error {
	// Преобразуем ws.GameObject в entity.GameObject
	entityObj := convertWSObjectToEntityObject(obj)
	return a.worldService.CreateObject(ctx, entityObj)
}

// UpdateObjectPosition обновляет позицию объекта
func (a *WorldServiceAdapter) UpdateObjectPosition(ctx context.Context, id string, position entity.Vector3) error {
	return a.worldService.UpdateObjectPosition(id, position)
}

// DeleteObject удаляет объект
func (a *WorldServiceAdapter) DeleteObject(ctx context.Context, id string) error {
	return a.worldService.RemoveObject(id)
}

// GetAllObjects возвращает все объекты
func (a *WorldServiceAdapter) GetAllObjects() map[string]*GameObject {
	entityObjects := a.worldService.GetAllObjects()
	wsObjects := make(map[string]*GameObject)

	for id, entityObj := range entityObjects {
		wsObjects[id] = convertEntityObjectToWSObject(entityObj)
	}

	return wsObjects
}

// ApplyImpulse применяет импульс к объекту
func (a *WorldServiceAdapter) ApplyImpulse(ctx context.Context, id string, direction entity.Vector3, strength float64) error {
	return a.worldService.ApplyImpulse(ctx, id, direction, strength)
}

// Служебные функции для конвертации между типами

// convertWSObjectToEntityObject преобразует ws.GameObject в entity.GameObject
func convertWSObjectToEntityObject(wsObj *GameObject) *entity.GameObject {
	if wsObj == nil {
		return nil
	}

	// Определяем тип объекта
	var objectType entity.ObjectType
	switch wsObj.ObjectType {
	case TypeSphere:
		objectType = entity.TypeSphere
	case TypeBox:
		objectType = entity.TypeBox
	case TypeTerrain:
		objectType = entity.TypeTerrain
	default:
		objectType = entity.TypeSphere // По умолчанию
	}

	// Создаем новый entity.GameObject
	entityObj := entity.NewGameObject(wsObj.ID, objectType)
	entityObj.Position = wsObj.Position
	entityObj.Mass = wsObj.Mass
	entityObj.Color = wsObj.Color
	entityObj.Radius = wsObj.Radius

	// Дополнительные свойства для ящика
	if wsObj.ObjectType == TypeBox {
		entityObj.Properties["width"] = wsObj.Width
		entityObj.Properties["height"] = wsObj.Height
		entityObj.Properties["depth"] = wsObj.Depth
	}

	return entityObj
}

// convertEntityObjectToWSObject преобразует entity.GameObject в ws.GameObject
func convertEntityObjectToWSObject(entityObj *entity.GameObject) *GameObject {
	if entityObj == nil {
		return nil
	}

	// Определяем тип объекта
	var objectType ObjectType
	switch entityObj.ObjectType {
	case entity.TypeSphere:
		objectType = TypeSphere
	case entity.TypeBox:
		objectType = TypeBox
	case entity.TypeTerrain:
		objectType = TypeTerrain
	default:
		objectType = TypeSphere // По умолчанию
	}

	// Создаем новый ws.GameObject
	wsObj := &GameObject{
		ID:         entityObj.ID,
		Position:   entityObj.Position,
		ObjectType: objectType,
		Mass:       entityObj.Mass,
		Color:      entityObj.Color,
		Radius:     entityObj.Radius,
	}

	// Дополнительные свойства для ящика
	if objectType == TypeBox {
		if width, ok := entityObj.Properties["width"].(float64); ok {
			wsObj.Width = width
		}
		if height, ok := entityObj.Properties["height"].(float64); ok {
			wsObj.Height = height
		}
		if depth, ok := entityObj.Properties["depth"].(float64); ok {
			wsObj.Depth = depth
		}
	}

	return wsObj
}
