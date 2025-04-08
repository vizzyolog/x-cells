package entity

import (
	"sync"
)

// World представляет игровой мир с объектами
type World struct {
	objects map[string]*GameObject
	mutex   sync.RWMutex
}

// NewWorld создает новый экземпляр игрового мира
func NewWorld() *World {
	return &World{
		objects: make(map[string]*GameObject),
	}
}

// AddObject добавляет объект в мир
func (w *World) AddObject(obj *GameObject) {
	w.mutex.Lock()
	defer w.mutex.Unlock()
	w.objects[obj.ID] = obj
}

// GetObject возвращает объект по его ID
func (w *World) GetObject(id string) *GameObject {
	w.mutex.RLock()
	defer w.mutex.RUnlock()
	return w.objects[id]
}

// RemoveObject удаляет объект из мира
func (w *World) RemoveObject(id string) {
	w.mutex.Lock()
	defer w.mutex.Unlock()
	delete(w.objects, id)
}

// GetAllObjects возвращает все объекты в мире
func (w *World) GetAllObjects() map[string]*GameObject {
	w.mutex.RLock()
	defer w.mutex.RUnlock()

	// Создаем копию карты для безопасного доступа
	result := make(map[string]*GameObject, len(w.objects))
	for id, obj := range w.objects {
		result[id] = obj
	}

	return result
}

// UpdateObjectPosition обновляет позицию объекта
func (w *World) UpdateObjectPosition(id string, position Vector3) bool {
	w.mutex.Lock()
	defer w.mutex.Unlock()

	if obj, exists := w.objects[id]; exists {
		obj.Position = position
		return true
	}
	return false
}

// UpdateObjectVelocity обновляет скорость объекта
func (w *World) UpdateObjectVelocity(id string, velocity Vector3) bool {
	w.mutex.Lock()
	defer w.mutex.Unlock()

	if obj, exists := w.objects[id]; exists {
		obj.Velocity = velocity
		return true
	}
	return false
}
