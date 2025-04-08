package entity

// ObjectType представляет тип игрового объекта
type ObjectType string

// Константы типов объектов
const (
	TypeTerrain ObjectType = "terrain"
	TypeSphere  ObjectType = "sphere"
	TypeBox     ObjectType = "box"
	TypePlayer  ObjectType = "player"
)

// Vector3 представляет трехмерный вектор
type Vector3 struct {
	X, Y, Z float64
}

// GameObject представляет игровой объект в мире
type GameObject struct {
	ID         string
	ObjectType ObjectType
	Position   Vector3
	Velocity   Vector3
	Mass       float64
	Radius     float64
	Color      string
	Properties map[string]interface{} // Дополнительные свойства объекта
}

// NewGameObject создает новый экземпляр игрового объекта
func NewGameObject(id string, objectType ObjectType) *GameObject {
	return &GameObject{
		ID:         id,
		ObjectType: objectType,
		Properties: make(map[string]interface{}),
		Position:   Vector3{0, 0, 0},
		Velocity:   Vector3{0, 0, 0},
		Mass:       1.0,
		Radius:     1.0,
		Color:      "#ffffff",
	}
}

// NewSphere создает новый игровой объект типа сфера
func NewSphere(id string, position Vector3, radius, mass float64, color string) *GameObject {
	obj := NewGameObject(id, TypeSphere)
	obj.Position = position
	obj.Radius = radius
	obj.Mass = mass
	obj.Color = color
	return obj
}

// NewBox создает новый игровой объект типа коробка
func NewBox(id string, position Vector3, size, mass float64, color string) *GameObject {
	obj := NewGameObject(id, TypeBox)
	obj.Position = position
	obj.Radius = size // Для упрощения используем размер как радиус
	obj.Mass = mass
	obj.Color = color
	return obj
}

// NewTerrain создает новый объект типа террейн
func NewTerrain(id string, properties map[string]interface{}) *GameObject {
	obj := NewGameObject(id, TypeTerrain)
	obj.Mass = 0 // Террейн имеет бесконечную массу (статичен)

	// Копируем свойства
	for k, v := range properties {
		obj.Properties[k] = v
	}

	return obj
}
