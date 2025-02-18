package world

import "sync"

type Manager struct {
	objects map[string]*Object
	mu      sync.RWMutex
}

func NewManager() *Manager {
	return &Manager{
		objects: make(map[string]*Object),
	}
}

func (m *Manager) AddObject(obj *Object) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.objects[obj.ID] = obj
}

func (m *Manager) GetObject(id string) (*Object, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	obj, exists := m.objects[id]
	return obj, exists
}
