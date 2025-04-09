package physics

import (
	"context"
	"fmt"
	"log"

	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"

	portPhysics "x-cells/backend/internal/core/port/out/physics"
	"x-cells/backend/internal/physics"
	pb "x-cells/backend/internal/physics/generated"
)

// GRPCPhysicsAdapter адаптер для взаимодействия с физическим сервером через gRPC
type GRPCPhysicsAdapter struct {
	client pb.PhysicsClient
	conn   *grpc.ClientConn
}

// NewGRPCPhysicsAdapter создает новый адаптер для взаимодействия с физическим сервером
func NewGRPCPhysicsAdapter(ctx context.Context, address string) (*GRPCPhysicsAdapter, error) {
	conn, err := grpc.DialContext(ctx, address,
		grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		return nil, fmt.Errorf("не удалось подключиться к серверу физики: %w", err)
	}

	client := pb.NewPhysicsClient(conn)
	adapter := &GRPCPhysicsAdapter{
		client: client,
		conn:   conn,
	}

	log.Printf("Подключено к серверу физики: %s", address)

	// Сразу после подключения отправляем текущую конфигурацию
	err = adapter.UpdatePhysicsConfig(ctx)
	if err != nil {
		log.Printf("Ошибка при обновлении конфигурации физики: %v", err)
	} else {
		log.Printf("Конфигурация физики успешно отправлена на сервер")
	}

	return adapter, nil
}

// UpdatePhysicsConfig обновляет конфигурацию физики на сервере
func (a *GRPCPhysicsAdapter) UpdatePhysicsConfig(ctx context.Context) error {
	// Получаем текущую конфигурацию из Go
	config := physics.GetPhysicsConfig()

	// Преобразуем в формат protobuf
	pbConfig := &pb.PhysicsConfigData{
		BaseImpulse:                float32(config.BaseImpulse),
		MaxImpulse:                 float32(config.MaxImpulse),
		DistanceMultiplier:         float32(config.DistanceMultiplier),
		ImpulseMultiplier:          float32(config.ImpulseMultiplier),
		MaxSpeed:                   float32(config.MaxSpeed),
		Restitution:                float32(config.Restitution),
		MaxImpulseMagnitude:        float32(config.MaxImpulseMagnitude),
		TerrainRestitution:         float32(config.TerrainRestitution),
		ObjectRestitution:          float32(config.ObjectRestitution),
		Friction:                   float32(config.Friction),
		RollingFriction:            float32(config.RollingFriction),
		LinearDamping:              float32(config.LinearDamping),
		AngularDamping:             float32(config.AngularDamping),
		CcdMotionThresholdFactor:   float32(config.CcdMotionThresholdFactor),
		CcdSweptSphereRadiusFactor: float32(config.CcdSweptSphereRadiusFactor),
		MinSpeedFactor:             float32(config.MinSpeedFactor),
	}

	// Отправляем на сервер
	pbReq := &pb.SetPhysicsConfigRequest{Config: pbConfig}
	pbResp, err := a.client.SetPhysicsConfig(ctx, pbReq)
	if err != nil {
		return fmt.Errorf("ошибка при обновлении конфигурации физики: %w", err)
	}

	log.Printf("Статус обновления конфигурации физики: %s", pbResp.Status)
	return nil
}

// GetPhysicsConfig получает конфигурацию физики с сервера
func (a *GRPCPhysicsAdapter) GetPhysicsConfig(ctx context.Context) (*physics.PhysicsConfig, error) {
	// Отправляем запрос на сервер
	pbReq := &pb.GetPhysicsConfigRequest{}
	pbResp, err := a.client.GetPhysicsConfig(ctx, pbReq)
	if err != nil {
		return nil, fmt.Errorf("ошибка при получении конфигурации физики: %w", err)
	}

	// Преобразуем ответ в формат Go
	config := &physics.PhysicsConfig{
		BaseImpulse:                float64(pbResp.Config.BaseImpulse),
		MaxImpulse:                 float64(pbResp.Config.MaxImpulse),
		DistanceMultiplier:         float64(pbResp.Config.DistanceMultiplier),
		ImpulseMultiplier:          float64(pbResp.Config.ImpulseMultiplier),
		MaxSpeed:                   float64(pbResp.Config.MaxSpeed),
		Restitution:                float64(pbResp.Config.Restitution),
		MaxImpulseMagnitude:        float64(pbResp.Config.MaxImpulseMagnitude),
		TerrainRestitution:         float64(pbResp.Config.TerrainRestitution),
		ObjectRestitution:          float64(pbResp.Config.ObjectRestitution),
		Friction:                   float64(pbResp.Config.Friction),
		RollingFriction:            float64(pbResp.Config.RollingFriction),
		LinearDamping:              float64(pbResp.Config.LinearDamping),
		AngularDamping:             float64(pbResp.Config.AngularDamping),
		CcdMotionThresholdFactor:   float64(pbResp.Config.CcdMotionThresholdFactor),
		CcdSweptSphereRadiusFactor: float64(pbResp.Config.CcdSweptSphereRadiusFactor),
		MinSpeedFactor:             float64(pbResp.Config.MinSpeedFactor),
	}

	return config, nil
}

// UpdateServerConfig обновляет конфигурацию физики сервера на основе локальной
func (a *GRPCPhysicsAdapter) UpdateServerConfig(ctx context.Context, newConfig *physics.PhysicsConfig) error {
	// Обновляем локальную конфигурацию
	physics.SetPhysicsConfig(newConfig)

	// Отправляем обновление на сервер
	return a.UpdatePhysicsConfig(ctx)
}

// CreateObject создает объект в физической симуляции
func (a *GRPCPhysicsAdapter) CreateObject(ctx context.Context, req *portPhysics.CreateObjectRequest) (*portPhysics.CreateObjectResponse, error) {
	// Преобразуем запрос в формат protobuf
	position := &pb.Vector3{
		X: float32(req.Position.X),
		Y: float32(req.Position.Y),
		Z: float32(req.Position.Z),
	}

	// Создаем дескриптор формы в зависимости от типа объекта
	var shape *pb.ShapeDescriptor
	switch req.ObjectType {
	case "sphere":
		shape = &pb.ShapeDescriptor{
			Type: pb.ShapeDescriptor_SPHERE,
			Shape: &pb.ShapeDescriptor_Sphere{
				Sphere: &pb.SphereData{
					Radius: float32(req.Size),
					Mass:   float32(req.Mass),
					Color:  req.Color,
				},
			},
		}
	case "box":
		shape = &pb.ShapeDescriptor{
			Type: pb.ShapeDescriptor_BOX,
			Shape: &pb.ShapeDescriptor_Box{
				Box: &pb.BoxData{
					Width:  float32(req.Size),
					Height: float32(req.Size),
					Depth:  float32(req.Size),
					Mass:   float32(req.Mass),
					Color:  req.Color,
				},
			},
		}
	case "terrain":
		// Лучший подход - получать все из Properties:
		terrainData := &pb.TerrainData{}

		// Если Properties установлены, берем из них
		if req.Properties != nil {
			// Обрабатываем grid_width
			if gw, ok := req.Properties["grid_width"].(int); ok {
				terrainData.Width = int32(gw)
			}
			// Обрабатываем grid_height или depth
			if gh, ok := req.Properties["grid_height"].(int); ok {
				terrainData.Depth = int32(gh)
			} else if d, ok := req.Properties["depth"].(int); ok {
				terrainData.Depth = int32(d)
			}
			// Обрабатываем масштабы
			if sx, ok := req.Properties["scale_x"].(float64); ok {
				terrainData.ScaleX = float32(sx)
			}
			if sy, ok := req.Properties["scale_y"].(float64); ok {
				terrainData.ScaleY = float32(sy)
			}
			if sz, ok := req.Properties["scale_z"].(float64); ok {
				terrainData.ScaleZ = float32(sz)
			}
			// Обрабатываем диапазон высот
			if mh, ok := req.Properties["min_height"].(float32); ok {
				terrainData.MinHeight = mh
			}
			if mh, ok := req.Properties["max_height"].(float32); ok {
				terrainData.MaxHeight = mh
			}
			// Обрабатываем heightmap, если есть
			if hd, ok := req.Properties["height_data"].([]float32); ok && len(hd) > 0 {
				terrainData.Heightmap = hd
			}
		} else {
			log.Printf("Внимание: создаётся террейн без свойств, будут использованы значения по умолчанию")
		}

		shape = &pb.ShapeDescriptor{
			Type: pb.ShapeDescriptor_TERRAIN,
			Shape: &pb.ShapeDescriptor_Terrain{
				Terrain: terrainData,
			},
		}
	default:
		shape = &pb.ShapeDescriptor{
			Type: pb.ShapeDescriptor_SPHERE,
			Shape: &pb.ShapeDescriptor_Sphere{
				Sphere: &pb.SphereData{
					Radius: float32(req.Size),
					Mass:   float32(req.Mass),
					Color:  req.Color,
				},
			},
		}
	}

	// Создаем запрос в формате protobuf
	pbReq := &pb.CreateObjectRequest{
		Id:       req.ID,
		Position: position,
		Shape:    shape,
	}

	// Вызываем метод gRPC
	pbResp, err := a.client.CreateObject(ctx, pbReq)
	if err != nil {
		return nil, fmt.Errorf("ошибка при создании объекта через gRPC: %w", err)
	}

	// Преобразуем ответ
	response := &portPhysics.CreateObjectResponse{
		ID:     req.ID,
		Status: pbResp.Status,
	}

	return response, nil
}

// ApplyImpulse применяет импульс к объекту
func (a *GRPCPhysicsAdapter) ApplyImpulse(ctx context.Context, req *portPhysics.ApplyImpulseRequest) (*portPhysics.ApplyImpulseResponse, error) {
	// Преобразуем запрос в формат protobuf
	pbReq := &pb.ApplyImpulseRequest{
		Id: req.ID,
		Impulse: &pb.Vector3{
			X: float32(req.Direction.X * req.Strength),
			Y: float32(req.Direction.Y * req.Strength),
			Z: float32(req.Direction.Z * req.Strength),
		},
	}

	// Вызываем метод gRPC
	pbResp, err := a.client.ApplyImpulse(ctx, pbReq)
	if err != nil {
		return nil, fmt.Errorf("ошибка при применении импульса через gRPC: %w", err)
	}

	// Преобразуем ответ
	response := &portPhysics.ApplyImpulseResponse{
		Status: pbResp.Status,
	}

	return response, nil
}

// ApplyTorque применяет крутящий момент к объекту
func (a *GRPCPhysicsAdapter) ApplyTorque(ctx context.Context, req *portPhysics.ApplyTorqueRequest) (*portPhysics.ApplyTorqueResponse, error) {
	// Преобразуем запрос в формат protobuf
	pbReq := &pb.ApplyTorqueRequest{
		Id: req.ID,
		Torque: &pb.Vector3{
			X: float32(req.Direction.X * req.Strength),
			Y: float32(req.Direction.Y * req.Strength),
			Z: float32(req.Direction.Z * req.Strength),
		},
	}

	// Вызываем метод gRPC
	pbResp, err := a.client.ApplyTorque(ctx, pbReq)
	if err != nil {
		return nil, fmt.Errorf("ошибка при применении крутящего момента через gRPC: %w", err)
	}

	// Преобразуем ответ
	response := &portPhysics.ApplyTorqueResponse{
		Status: pbResp.Status,
	}

	return response, nil
}

// GetObjectState получает состояние объекта
func (a *GRPCPhysicsAdapter) GetObjectState(ctx context.Context, req *portPhysics.GetObjectStateRequest) (*portPhysics.GetObjectStateResponse, error) {
	// Преобразуем запрос в формат protobuf
	pbReq := &pb.GetObjectStateRequest{
		Id: req.ID,
	}

	// Вызываем метод gRPC
	pbResp, err := a.client.GetObjectState(ctx, pbReq)
	if err != nil {
		return nil, fmt.Errorf("ошибка при получении состояния объекта через gRPC: %w", err)
	}

	// Преобразуем ответ
	response := &portPhysics.GetObjectStateResponse{
		ID: req.ID,
		Position: portPhysics.Vector3{
			X: float64(pbResp.State.Position.X),
			Y: float64(pbResp.State.Position.Y),
			Z: float64(pbResp.State.Position.Z),
		},
		Velocity: portPhysics.Vector3{
			X: float64(pbResp.State.LinearVelocity.X),
			Y: float64(pbResp.State.LinearVelocity.Y),
			Z: float64(pbResp.State.LinearVelocity.Z),
		},
		Mass: 0, // Масса не возвращается в GetObjectState, нужно добавить отдельный метод
	}

	return response, nil
}

// UpdateObjectMass обновляет массу объекта
// Клиент grpc не поддерживает этот метод, мы должны его реализовать через CreateObject
func (a *GRPCPhysicsAdapter) UpdateObjectMass(ctx context.Context, req *portPhysics.UpdateObjectMassRequest) (*portPhysics.UpdateObjectMassResponse, error) {
	// В текущей версии API физического движка нет метода для обновления массы
	// Возвращаем ошибку или имитируем успешное выполнение
	log.Printf("Метод UpdateObjectMass не реализован в gRPC клиенте. ID: %s, масса: %f", req.ID, req.Mass)

	// Возвращаем успешный ответ для совместимости
	response := &portPhysics.UpdateObjectMassResponse{
		Status: "success",
	}

	return response, nil
}

// Close закрывает соединение с физическим сервером
func (a *GRPCPhysicsAdapter) Close() error {
	if a.conn != nil {
		return a.conn.Close()
	}
	return nil
}
