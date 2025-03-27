package world

// PhysicsType определяет, где обрабатывается физика объекта
type PhysicsType string

const (
	PhysicsTypeAmmo   PhysicsType = "ammo"   // Физика только на клиенте (ammo.js)
	PhysicsTypeBullet PhysicsType = "bullet" // Физика только на сервере (Bullet Physics)
	PhysicsTypeBoth   PhysicsType = "both"   // Физика и на клиенте, и на сервере
)

// WorldObject расширяет базовый Object дополнительными полями для игрового мира
type WorldObject struct {
	*Object
	PhysicsType PhysicsType
	Mass        float32
	Color       string
	MinHeight   float32
	MaxHeight   float32
}

type Object struct {
	ID       string
	Position Vector3
	Rotation Quaternion
	Shape    *ShapeDescriptor
}

type Vector3 struct {
	X, Y, Z float32
}

type Quaternion struct {
	X, Y, Z, W float32
}

type ShapeDescriptor struct {
	Type    ShapeType
	Sphere  *SphereData
	Box     *BoxData
	Terrain *TerrainData
	Tree    *TreeData
}

type ShapeType int

const (
	SPHERE ShapeType = iota
	BOX
	TERRAIN
	TREE
)

type SphereData struct {
	Radius float32
	Mass   float32
	Color  string
}

type BoxData struct {
	Width  float32
	Height float32
	Depth  float32
	Mass   float32
	Color  string
}

type TerrainData struct {
	HeightData []float32
	Width      int32
	Depth      int32
	ScaleX     float32
	ScaleY     float32
	ScaleZ     float32
}

type TreeData struct {
	Branches []TreeBranch
	Color    string
}

type TreeBranch struct {
	Start  Vector3
	End    Vector3
	Radius float32
	Color  string
}
