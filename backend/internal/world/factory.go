package world

import (
	"context"
	"log"

	pb "x-cells/backend/internal/physics/generated"
)

// Factory интерфейс для создания объектов
type Factory struct {
	manager       *Manager
	physicsClient pb.PhysicsClient
}

// NewFactory создает новый экземпляр Factory
func NewFactory(manager *Manager, physicsClient pb.PhysicsClient) *Factory {
	return &Factory{
		manager:       manager,
		physicsClient: physicsClient,
	}
}

// CreateObjectInGameWorld добавляет объект только в игровой мир (без создания в Bullet)
func (f *Factory) CreateObjectInGameWorld(obj *WorldObject) {
	// Добавляем объект в менеджер
	f.manager.AddWorldObject(obj)

	log.Printf("[World] Создан объект %s в координатах (%.2f, %.2f, %.2f)",
		obj.ID, obj.Position.X, obj.Position.Y, obj.Position.Z)
}

// CreateObjectInBullet отправляет запрос на создание объекта в Bullet Physics
func (f *Factory) CreateObjectInBullet(obj *WorldObject) error {
	ctx := context.Background()

	// Получаем конфигурации
	physicsConfig := GetPhysicsConfig()

	// Создаем базовый запрос
	request := &pb.CreateObjectRequest{
		Id: obj.ID,
		Position: &pb.Vector3{
			X: obj.Position.X,
			Y: obj.Position.Y,
			Z: obj.Position.Z,
		},
		Rotation: &pb.Quaternion{
			X: obj.Rotation.X,
			Y: obj.Rotation.Y,
			Z: obj.Rotation.Z,
			W: obj.Rotation.W,
		},
		PhysicsConfig: &pb.PhysicsConfig{
			World: &pb.WorldPhysicsConfig{
				GravityX:        physicsConfig.World.GravityX,
				GravityY:        physicsConfig.World.GravityY,
				GravityZ:        physicsConfig.World.GravityZ,
				LinearDamping:   physicsConfig.World.LinearDamping,
				AngularDamping:  physicsConfig.World.AngularDamping,
				Friction:        physicsConfig.World.Friction,
				RollingFriction: physicsConfig.World.RollingFriction,
			},
			Player: &pb.PlayerConfig{
				PlayerMass:  physicsConfig.Player.PlayerMass,
				Restitution: physicsConfig.Player.Restitution,
			},
			Control: &pb.ControlConfig{
				BaseImpulse:        physicsConfig.Control.BaseImpulse,
				MaxImpulse:         physicsConfig.Control.MaxImpulse,
				DistanceMultiplier: physicsConfig.Control.DistanceMultiplier,
				ImpulseMultiplier:  physicsConfig.Control.ImpulseMultiplier,
			},
		},
	}

	// Создаем ShapeDescriptor в зависимости от типа объекта
	shapeDesc := &pb.ShapeDescriptor{}

	// Заполняем параметры формы объекта в зависимости от его типа
	switch obj.Shape.Type {
	case SPHERE:
		shapeDesc.Type = pb.ShapeDescriptor_SPHERE
		shapeDesc.Shape = &pb.ShapeDescriptor_Sphere{
			Sphere: &pb.SphereData{
				Radius:          obj.Shape.Sphere.Radius,
				Mass:            obj.Shape.Sphere.Mass,
				Color:           obj.Shape.Sphere.Color,
				Restitution:     obj.Shape.Sphere.Restitution,
				Friction:        obj.Shape.Sphere.Friction,
				RollingFriction: obj.Shape.Sphere.RollingFriction,
				LinearDamping:   obj.Shape.Sphere.LinearDamping,
				AngularDamping:  obj.Shape.Sphere.AngularDamping,
			},
		}
	case BOX:
		shapeDesc.Type = pb.ShapeDescriptor_BOX
		shapeDesc.Shape = &pb.ShapeDescriptor_Box{
			Box: &pb.BoxData{
				Width:           obj.Shape.Box.Width,
				Height:          obj.Shape.Box.Height,
				Depth:           obj.Shape.Box.Depth,
				Mass:            obj.Shape.Box.Mass,
				Color:           obj.Shape.Box.Color,
				Restitution:     obj.Shape.Box.Restitution,
				Friction:        obj.Shape.Box.Friction,
				RollingFriction: obj.Shape.Box.RollingFriction,
				LinearDamping:   obj.Shape.Box.LinearDamping,
				AngularDamping:  obj.Shape.Box.AngularDamping,
			},
		}
	case TERRAIN:
		shapeDesc.Type = pb.ShapeDescriptor_TERRAIN
		shapeDesc.Shape = &pb.ShapeDescriptor_Terrain{
			Terrain: &pb.TerrainData{
				Width:     obj.Shape.Terrain.Width,
				Depth:     obj.Shape.Terrain.Depth,
				Heightmap: obj.Shape.Terrain.HeightData,
				ScaleX:    obj.Shape.Terrain.ScaleX,
				ScaleY:    obj.Shape.Terrain.ScaleY,
				ScaleZ:    obj.Shape.Terrain.ScaleZ,
				MinHeight: obj.MinHeight,
				MaxHeight: obj.MaxHeight,
			},
		}
	default:
		log.Printf("[World] Неизвестный тип объекта: %d", obj.Shape.Type)
		return nil
	}

	request.Shape = shapeDesc

	// Отправляем запрос на создание объекта в Bullet Physics
	resp, err := f.physicsClient.CreateObject(ctx, request)
	if err != nil {
		log.Printf("[World] Ошибка при создании объекта %s в Bullet: %v", obj.ID, err)
		return err
	}

	log.Printf("[World] Объект %s успешно создан в Bullet Physics. Статус: %s",
		obj.ID, resp.Status)

	return nil
}

// CreateObjectInAmmo создает объект только в игровом мире (физика на клиенте)
func (f *Factory) CreateObjectInAmmo(obj *WorldObject) error {
	// Создаем объект только в игровом мире, без создания в Bullet
	f.CreateObjectInGameWorld(obj)

	log.Printf("[World] Объект %s создан для обработки физики на клиенте (ammo)", obj.ID)

	return nil
}

// CreateObjectBullet создает объект в игровом мире и в Bullet (физика на сервере)
func (f *Factory) CreateObjectBullet(obj *WorldObject) error {
	// Создаем объект в игровом мире
	f.CreateObjectInGameWorld(obj)

	// Создаем объект в Bullet
	err := f.CreateObjectInBullet(obj)

	log.Printf("[World] Объект %s создан для обработки физики на сервере (bullet)", obj.ID)

	return err
}

// NewSphere создает новый сферический объект
func NewSphere(id string, position Vector3, radius, mass float32, color string, physicsType PhysicsType) *WorldObject {
	// Получаем глобальные настройки мира и игрока
	worldConfig := GetWorldConfig()
	playerConfig := GetPlayerConfig()

	return &WorldObject{
		Object: &Object{
			ID:       id,
			Position: position,
			Rotation: Quaternion{X: 0, Y: 0, Z: 0, W: 1},
			Shape: &ShapeDescriptor{
				Type: SPHERE,
				Sphere: &SphereData{
					Radius:          radius,
					Mass:            mass,
					Color:           color,
					Restitution:     playerConfig.Restitution,    // из настроек игрока
					Friction:        worldConfig.Friction,        // из глобальных настроек
					RollingFriction: worldConfig.RollingFriction, // из глобальных настроек
					LinearDamping:   worldConfig.LinearDamping,   // из глобальных настроек
					AngularDamping:  worldConfig.AngularDamping,  // из глобальных настроек
				},
			},
		},
		PhysicsType: physicsType,
		Mass:        mass,
		Color:       color,
	}
}

// NewBox создает новый коробчатый объект
func NewBox(id string, position Vector3, width, height, depth, mass float32, color string, physicsType PhysicsType) *WorldObject {
	// Получаем глобальные настройки мира и игрока
	worldConfig := GetWorldConfig()
	playerConfig := GetPlayerConfig()

	return &WorldObject{
		Object: &Object{
			ID:       id,
			Position: position,
			Rotation: Quaternion{X: 0, Y: 0, Z: 0, W: 1},
			Shape: &ShapeDescriptor{
				Type: BOX,
				Box: &BoxData{
					Width:           width,
					Height:          height,
					Depth:           depth,
					Mass:            mass,
					Color:           color,
					Restitution:     playerConfig.Restitution,    // из настроек игрока
					Friction:        worldConfig.Friction,        // из глобальных настроек
					RollingFriction: worldConfig.RollingFriction, // из глобальных настроек
					LinearDamping:   worldConfig.LinearDamping,   // из глобальных настроек
					AngularDamping:  worldConfig.AngularDamping,  // из глобальных настроек
				},
			},
		},
		PhysicsType: physicsType,
		Mass:        mass,
		Color:       color,
	}
}

// NewTerrain создает новый объект террейна
func NewTerrain(id string, position Vector3, heightData []float32, width, depth int32,
	scaleX, scaleY, scaleZ, minHeight, maxHeight float32) *WorldObject {

	return &WorldObject{
		Object: &Object{
			ID:       id,
			Position: position,
			Rotation: Quaternion{X: 0, Y: 0, Z: 0, W: 1},
			Shape: &ShapeDescriptor{
				Type: TERRAIN,
				Terrain: &TerrainData{
					HeightData: heightData,
					Width:      width,
					Depth:      depth,
					ScaleX:     scaleX,
					ScaleY:     scaleY,
					ScaleZ:     scaleZ,
				},
			},
		},
		PhysicsType: PhysicsTypeBullet,
		MinHeight:   minHeight,
		MaxHeight:   maxHeight,
		Color:       "#007700",
	}
}

// NewSphereWithPhysics создает новый сферический объект с кастомными физическими свойствами
func NewSphereWithPhysics(id string, position Vector3, radius, mass float32, color string, physicsType PhysicsType,
	restitution, friction, rollingFriction, linearDamping, angularDamping float32) *WorldObject {

	return &WorldObject{
		Object: &Object{
			ID:       id,
			Position: position,
			Rotation: Quaternion{X: 0, Y: 0, Z: 0, W: 1},
			Shape: &ShapeDescriptor{
				Type: SPHERE,
				Sphere: &SphereData{
					Radius:          radius,
					Mass:            mass,
					Color:           color,
					Restitution:     restitution,
					Friction:        friction,
					RollingFriction: rollingFriction,
					LinearDamping:   linearDamping,
					AngularDamping:  angularDamping,
				},
			},
		},
		PhysicsType: physicsType,
		Mass:        mass,
		Color:       color,
	}
}

// NewBouncySphere создает прыгучую сферу с высоким restitution
func NewBouncySphere(id string, position Vector3, radius, mass float32, color string, physicsType PhysicsType) *WorldObject {
	return NewSphereWithPhysics(id, position, radius, mass, color, physicsType,
		0.8, 0.5, 0.1, 0.1, 0.2) // высокий отскок, низкое трение
}

// NewDeadSphere создает "мертвую" сферу без отскока
func NewDeadSphere(id string, position Vector3, radius, mass float32, color string, physicsType PhysicsType) *WorldObject {
	return NewSphereWithPhysics(id, position, radius, mass, color, physicsType,
		0.0, 1.0, 0.3, 0.3, 0.4) // без отскока, высокое трение и затухание
}

// NewSlippySphere создает скользкую сферу с низким трением
func NewSlippySphere(id string, position Vector3, radius, mass float32, color string, physicsType PhysicsType) *WorldObject {
	return NewSphereWithPhysics(id, position, radius, mass, color, physicsType,
		0.2, 0.1, 0.05, 0.1, 0.1) // слабый отскок, очень низкое трение
}

// NewPlayerWithBounceSkill создает игрока с определенным уровнем прыгучести как скилл
func NewPlayerWithBounceSkill(id string, position Vector3, radius, mass float32, color string, physicsType PhysicsType, bounceSkill float32) *WorldObject {
	// Получаем глобальные настройки мира
	worldConfig := GetWorldConfig()

	return &WorldObject{
		Object: &Object{
			ID:       id,
			Position: position,
			Rotation: Quaternion{X: 0, Y: 0, Z: 0, W: 1},
			Shape: &ShapeDescriptor{
				Type: SPHERE,
				Sphere: &SphereData{
					Radius:          radius,
					Mass:            mass,
					Color:           color,
					Restitution:     bounceSkill,                 // индивидуальный скилл прыгучести
					Friction:        worldConfig.Friction,        // из глобальных настроек
					RollingFriction: worldConfig.RollingFriction, // из глобальных настроек
					LinearDamping:   worldConfig.LinearDamping,   // из глобальных настроек
					AngularDamping:  worldConfig.AngularDamping,  // из глобальных настроек
				},
			},
		},
		PhysicsType: physicsType,
		Mass:        mass,
		Color:       color,
	}
}
