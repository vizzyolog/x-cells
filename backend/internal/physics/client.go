package physics

import (
	"context"
	"log"
	"time"

	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"

	pb "x-cells/backend/internal/physics/generated"
)

type PhysicsClient struct {
	client pb.PhysicsClient
	conn   *grpc.ClientConn
}

// NewPhysicsClient создает новый клиент для взаимодействия с физическим сервером
func NewPhysicsClient(address string) (*PhysicsClient, error) {
	// Устанавливаем соединение с gRPC сервером
	conn, err := grpc.Dial(address, grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		return nil, err
	}

	client := pb.NewPhysicsClient(conn)
	physicsClient := &PhysicsClient{
		client: client,
		conn:   conn,
	}

	// Применяем конфигурацию физики к серверу
	go physicsClient.ApplyPhysicsConfig()

	return physicsClient, nil
}

// Метод для применения конфигурации физики
func (c *PhysicsClient) ApplyPhysicsConfig() {
	// Даем серверу время на инициализацию
	time.Sleep(1 * time.Second)

	log.Printf("[PhysicsClient] Физический клиент инициализирован и готов к работе")

	// Все настройки физики теперь передаются при создании каждого объекта
	// через protobuf структуры в CreateObjectRequest, поэтому дополнительная
	// настройка сервера не требуется
}

// Close закрывает соединение с физическим сервером
func (c *PhysicsClient) Close() {
	if c.conn != nil {
		c.conn.Close()
	}
}

// Проброс вызовов к gRPC методам физического сервера

func (c *PhysicsClient) CreateObject(ctx context.Context, req *pb.CreateObjectRequest) (*pb.CreateObjectResponse, error) {
	return c.client.CreateObject(ctx, req)
}

func (c *PhysicsClient) ApplyImpulse(ctx context.Context, req *pb.ApplyImpulseRequest) (*pb.ApplyImpulseResponse, error) {
	return c.client.ApplyImpulse(ctx, req)
}

func (c *PhysicsClient) ApplyTorque(ctx context.Context, req *pb.ApplyTorqueRequest) (*pb.ApplyTorqueResponse, error) {
	return c.client.ApplyTorque(ctx, req)
}

func (c *PhysicsClient) GetObjectState(ctx context.Context, req *pb.GetObjectStateRequest) (*pb.GetObjectStateResponse, error) {
	return c.client.GetObjectState(ctx, req)
}

// Добавляем новый метод для обновления массы (необходимо также добавить в protobuf)
func (c *PhysicsClient) UpdateObjectMass(ctx context.Context, req *pb.UpdateObjectMassRequest) (*pb.UpdateObjectMassResponse, error) {
	return c.client.UpdateObjectMass(ctx, req)
}

// Добавляем метод для установки конфигурации физики
func (c *PhysicsClient) SetPhysicsConfig(ctx context.Context, req *pb.SetPhysicsConfigRequest) (*pb.SetPhysicsConfigResponse, error) {
	return c.client.SetPhysicsConfig(ctx, req)
}
