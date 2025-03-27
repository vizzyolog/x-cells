package world

import "sync"

type Manager struct {
	objects map[string]*WorldObject
	mu      sync.RWMutex
}

func NewManager() *Manager {
	return &Manager{
		objects: make(map[string]*WorldObject),
	}
}

func (m *Manager) AddObject(obj *Object) {
	// Для обратной совместимости создаем WorldObject из Object
	worldObj := &WorldObject{
		Object: obj,
	}
	m.AddWorldObject(worldObj)
}

// AddWorldObject добавляет WorldObject в менеджер
func (m *Manager) AddWorldObject(obj *WorldObject) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.objects[obj.ID] = obj
}

func (m *Manager) GetObject(id string) (*Object, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	obj, exists := m.objects[id]
	if !exists {
		return nil, false
	}
	return obj.Object, exists
}

// GetWorldObject возвращает WorldObject по идентификатору
func (m *Manager) GetWorldObject(id string) (*WorldObject, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	obj, exists := m.objects[id]
	return obj, exists
}

// GetAllObjects возвращает все объекты из менеджера
func (m *Manager) GetAllObjects() []*Object {
	m.mu.RLock()
	defer m.mu.RUnlock()

	result := make([]*Object, 0, len(m.objects))
	for _, obj := range m.objects {
		result = append(result, obj.Object)
	}
	return result
}

// GetAllWorldObjects возвращает все WorldObject из менеджера
func (m *Manager) GetAllWorldObjects() []*WorldObject {
	m.mu.RLock()
	defer m.mu.RUnlock()

	result := make([]*WorldObject, 0, len(m.objects))
	for _, obj := range m.objects {
		result = append(result, obj)
	}
	return result
}

// UpdateObjectState обновляет позицию и вращение объекта
func (m *Manager) UpdateObjectState(id string, position Vector3, rotation Quaternion) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if obj, exists := m.objects[id]; exists {
		obj.Position = position
		obj.Rotation = rotation
	}
}
