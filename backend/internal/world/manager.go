package world

import "sync"

// Manager управляет объектами игрового мира
type Manager struct {
	objects      map[string]*Object
	worldObjects map[string]*WorldObject
	mu           sync.RWMutex
}

// NewManager создает новый экземпляр Manager
func NewManager() *Manager {
	return &Manager{
		objects:      make(map[string]*Object),
		worldObjects: make(map[string]*WorldObject),
	}
}

// AddObject добавляет базовый объект в карту объектов
func (m *Manager) AddObject(obj *Object) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.objects[obj.ID] = obj
}

// AddWorldObject добавляет игровой объект в карты объектов
func (m *Manager) AddWorldObject(obj *WorldObject) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.objects[obj.ID] = obj.Object
	m.worldObjects[obj.ID] = obj
}

// GetObject возвращает базовый объект по ID
func (m *Manager) GetObject(id string) (*Object, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	obj, exists := m.objects[id]
	return obj, exists
}

// GetWorldObject возвращает игровой объект по ID
func (m *Manager) GetWorldObject(id string) (*WorldObject, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	obj, exists := m.worldObjects[id]
	return obj, exists
}

// GetAllObjects возвращает все базовые объекты
func (m *Manager) GetAllObjects() []*Object {
	m.mu.RLock()
	defer m.mu.RUnlock()
	objects := make([]*Object, 0, len(m.objects))
	for _, obj := range m.objects {
		objects = append(objects, obj)
	}
	return objects
}

// GetAllWorldObjects возвращает все игровые объекты
func (m *Manager) GetAllWorldObjects() []*WorldObject {
	m.mu.RLock()
	defer m.mu.RUnlock()
	worldObjects := make([]*WorldObject, 0, len(m.worldObjects))
	for _, obj := range m.worldObjects {
		worldObjects = append(worldObjects, obj)
	}
	return worldObjects
}

// RemoveObject удаляет объект по ID
func (m *Manager) RemoveObject(id string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.objects, id)
	delete(m.worldObjects, id)
}

// Clear удаляет все объекты
func (m *Manager) Clear() {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.objects = make(map[string]*Object)
	m.worldObjects = make(map[string]*WorldObject)
}
