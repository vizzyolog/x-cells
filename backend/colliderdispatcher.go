package main

import (
	"fmt"
	"math"
	"sync"
)

// Vector3 представляет 3D вектор/позицию
type Vector3 struct {
	X, Y, Z float64
}

// Distance возвращает расстояние между двумя точками
func (v Vector3) Distance(other Vector3) float64 {
	dx := v.X - other.X
	dy := v.Y - other.Y
	dz := v.Z - other.Z
	return math.Sqrt(dx*dx + dy*dy + dz*dz)
}

// CollidableObject представляет объект, который может участвовать в коллизиях
type CollidableObject struct {
	ID       string  // Уникальный идентификатор
	Position Vector3 // Позиция в мире
	Radius   float64 // Радиус для сферической коллизии
	Type     string  // Тип объекта (player, food, powerup и т.д.)
	Mass     float64 // Масса объекта (для игровой логики)
	IsStatic bool    // Статичный объект (еда) или динамичный (игрок)
	GridX    int     // Координаты в сетке для spatial partitioning
	GridY    int
	GridZ    int
}

// Collision представляет коллизию между двумя объектами
type Collision struct {
	Object1  *CollidableObject
	Object2  *CollidableObject
	Distance float64 // Расстояние между центрами
}

// SpatialGrid представляет пространственную сетку для оптимизации коллизий
type SpatialGrid struct {
	CellSize float64                        // Размер ячейки сетки
	Cells    map[string][]*CollidableObject // Ячейки сетки
	Objects  map[string]*CollidableObject   // Все объекты по ID
	mutex    sync.RWMutex                   // Мьютекс для thread-safety
}

// NewSpatialGrid создает новую пространственную сетку
func NewSpatialGrid(cellSize float64) *SpatialGrid {
	return &SpatialGrid{
		CellSize: cellSize,
		Cells:    make(map[string][]*CollidableObject),
		Objects:  make(map[string]*CollidableObject),
	}
}

// getCellKey возвращает ключ ячейки для позиции
func (sg *SpatialGrid) getCellKey(x, y, z int) string {
	return fmt.Sprintf("%d_%d_%d", x, y, z)
}

// getGridCoords возвращает координаты ячейки для позиции
func (sg *SpatialGrid) getGridCoords(pos Vector3) (int, int, int) {
	return int(math.Floor(pos.X / sg.CellSize)),
		int(math.Floor(pos.Y / sg.CellSize)),
		int(math.Floor(pos.Z / sg.CellSize))
}

// AddObject добавляет объект в сетку
func (sg *SpatialGrid) AddObject(obj *CollidableObject) {
	sg.mutex.Lock()
	defer sg.mutex.Unlock()

	// Удаляем объект из старой позиции, если он уже существует
	sg.removeObjectFromGrid(obj.ID)

	// Вычисляем новые координаты сетки
	gridX, gridY, gridZ := sg.getGridCoords(obj.Position)
	obj.GridX = gridX
	obj.GridY = gridY
	obj.GridZ = gridZ

	// Добавляем в соответствующие ячейки
	// Объект может занимать несколько ячеек в зависимости от радиуса
	cellRadius := int(math.Ceil(obj.Radius / sg.CellSize))

	for dx := -cellRadius; dx <= cellRadius; dx++ {
		for dy := -cellRadius; dy <= cellRadius; dy++ {
			for dz := -cellRadius; dz <= cellRadius; dz++ {
				cellKey := sg.getCellKey(gridX+dx, gridY+dy, gridZ+dz)
				sg.Cells[cellKey] = append(sg.Cells[cellKey], obj)
			}
		}
	}

	// Сохраняем в общем списке объектов
	sg.Objects[obj.ID] = obj
}

// RemoveObject удаляет объект из сетки
func (sg *SpatialGrid) RemoveObject(objectID string) {
	sg.mutex.Lock()
	defer sg.mutex.Unlock()

	sg.removeObjectFromGrid(objectID)
	delete(sg.Objects, objectID)
}

// removeObjectFromGrid удаляет объект из всех ячеек сетки (без мьютекса)
func (sg *SpatialGrid) removeObjectFromGrid(objectID string) {
	obj, exists := sg.Objects[objectID]
	if !exists {
		return
	}

	// Удаляем из всех ячеек
	cellRadius := int(math.Ceil(obj.Radius / sg.CellSize))

	for dx := -cellRadius; dx <= cellRadius; dx++ {
		for dy := -cellRadius; dy <= cellRadius; dy++ {
			for dz := -cellRadius; dz <= cellRadius; dz++ {
				cellKey := sg.getCellKey(obj.GridX+dx, obj.GridY+dy, obj.GridZ+dz)
				if cell, exists := sg.Cells[cellKey]; exists {
					// Удаляем объект из ячейки
					for i, cellObj := range cell {
						if cellObj.ID == objectID {
							sg.Cells[cellKey] = append(cell[:i], cell[i+1:]...)
							break
						}
					}
					// Удаляем пустые ячейки
					if len(sg.Cells[cellKey]) == 0 {
						delete(sg.Cells, cellKey)
					}
				}
			}
		}
	}
}

// GetNearbyObjects возвращает объекты рядом с заданной позицией
func (sg *SpatialGrid) GetNearbyObjects(pos Vector3, radius float64) []*CollidableObject {
	sg.mutex.RLock()
	defer sg.mutex.RUnlock()

	gridX, gridY, gridZ := sg.getGridCoords(pos)
	cellRadius := int(math.Ceil(radius / sg.CellSize))

	nearbyObjects := make(map[string]*CollidableObject) // Используем map для исключения дубликатов

	for dx := -cellRadius; dx <= cellRadius; dx++ {
		for dy := -cellRadius; dy <= cellRadius; dy++ {
			for dz := -cellRadius; dz <= cellRadius; dz++ {
				cellKey := sg.getCellKey(gridX+dx, gridY+dy, gridZ+dz)
				if cell, exists := sg.Cells[cellKey]; exists {
					for _, obj := range cell {
						nearbyObjects[obj.ID] = obj
					}
				}
			}
		}
	}

	// Преобразуем map в slice
	result := make([]*CollidableObject, 0, len(nearbyObjects))
	for _, obj := range nearbyObjects {
		result = append(result, obj)
	}

	return result
}

// ColliderDispatcher основной диспетчер коллизий
type ColliderDispatcher struct {
	spatialGrid *SpatialGrid
	mutex       sync.RWMutex
}

// NewColliderDispatcher создает новый диспетчер коллизий
func NewColliderDispatcher(cellSize float64) *ColliderDispatcher {
	return &ColliderDispatcher{
		spatialGrid: NewSpatialGrid(cellSize),
	}
}

// CheckSphereCollision проверяет коллизию между двумя сферами
func CheckSphereCollision(obj1, obj2 *CollidableObject) bool {
	distance := obj1.Position.Distance(obj2.Position)
	return distance <= (obj1.Radius + obj2.Radius)
}

// AddObject добавляет объект для отслеживания коллизий
func (cd *ColliderDispatcher) AddObject(obj *CollidableObject) {
	cd.spatialGrid.AddObject(obj)
}

// RemoveObject удаляет объект из отслеживания
func (cd *ColliderDispatcher) RemoveObject(objectID string) {
	cd.spatialGrid.RemoveObject(objectID)
}

// UpdateObjectPosition обновляет позицию объекта
func (cd *ColliderDispatcher) UpdateObjectPosition(objectID string, newPos Vector3) {
	cd.mutex.Lock()
	defer cd.mutex.Unlock()

	if obj, exists := cd.spatialGrid.Objects[objectID]; exists {
		obj.Position = newPos
		// Пересоздаем объект в сетке с новой позицией
		cd.spatialGrid.AddObject(obj)
	}
}

// GetCollisionsForObject возвращает все коллизии для конкретного объекта
func (cd *ColliderDispatcher) GetCollisionsForObject(objectID string) []Collision {
	cd.mutex.RLock()
	obj, exists := cd.spatialGrid.Objects[objectID]
	cd.mutex.RUnlock()

	if !exists {
		return nil
	}

	// Получаем близлежащие объекты
	nearbyObjects := cd.spatialGrid.GetNearbyObjects(obj.Position, obj.Radius*2)

	var collisions []Collision

	for _, otherObj := range nearbyObjects {
		// Не проверяем коллизию с самим собой
		if otherObj.ID == objectID {
			continue
		}

		// Проверяем коллизию
		if CheckSphereCollision(obj, otherObj) {
			distance := obj.Position.Distance(otherObj.Position)
			collisions = append(collisions, Collision{
				Object1:  obj,
				Object2:  otherObj,
				Distance: distance,
			})
		}
	}

	return collisions
}

// GetAllCollisions возвращает все активные коллизии в системе
func (cd *ColliderDispatcher) GetAllCollisions() []Collision {
	cd.mutex.RLock()
	defer cd.mutex.RUnlock()

	var allCollisions []Collision
	processedPairs := make(map[string]bool)

	for _, obj1 := range cd.spatialGrid.Objects {
		nearbyObjects := cd.spatialGrid.GetNearbyObjects(obj1.Position, obj1.Radius*2)

		for _, obj2 := range nearbyObjects {
			if obj1.ID == obj2.ID {
				continue
			}

			// Избегаем дублирования пар (A-B и B-A)
			pairKey1 := obj1.ID + "_" + obj2.ID
			pairKey2 := obj2.ID + "_" + obj1.ID
			if processedPairs[pairKey1] || processedPairs[pairKey2] {
				continue
			}

			if CheckSphereCollision(obj1, obj2) {
				distance := obj1.Position.Distance(obj2.Position)
				allCollisions = append(allCollisions, Collision{
					Object1:  obj1,
					Object2:  obj2,
					Distance: distance,
				})
				processedPairs[pairKey1] = true
			}
		}
	}

	return allCollisions
}

// GetObjectCount возвращает количество объектов в системе
func (cd *ColliderDispatcher) GetObjectCount() int {
	cd.mutex.RLock()
	defer cd.mutex.RUnlock()
	return len(cd.spatialGrid.Objects)
}

// GetObjectsByType возвращает объекты определенного типа
func (cd *ColliderDispatcher) GetObjectsByType(objectType string) []*CollidableObject {
	cd.mutex.RLock()
	defer cd.mutex.RUnlock()

	var result []*CollidableObject
	for _, obj := range cd.spatialGrid.Objects {
		if obj.Type == objectType {
			result = append(result, obj)
		}
	}
	return result
}
