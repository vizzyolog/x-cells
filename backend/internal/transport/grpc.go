/*
Этот файл больше не используется после перехода на гексагональную архитектуру.
Функциональность перемещена в backend/internal/adapter/out/physics.

package transport

import (
	"context"
	"log"

	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"

	pb "x-cells/backend/internal/physics/generated"
)

// PhysicsClient - клиент для взаимодействия с физическим сервером
type PhysicsClient struct {
	connection *grpc.ClientConn
	client     pb.PhysicsServiceClient
}

// NewPhysicsClient создает новый экземпляр клиента физики
func NewPhysicsClient(ctx context.Context, serverAddr string) (*PhysicsClient, error) {
	conn, err := grpc.DialContext(
		ctx,
		serverAddr,
		grpc.WithTransportCredentials(insecure.NewCredentials()),
		grpc.WithBlock(),
	)
	if err != nil {
		return nil, err
	}

	client := pb.NewPhysicsServiceClient(conn)
	return &PhysicsClient{
		connection: conn,
		client:     client,
	}, nil
}

// Close закрывает соединение с сервером
func (p *PhysicsClient) Close() {
	if p.connection != nil {
		if err := p.connection.Close(); err != nil {
			log.Printf("Ошибка при закрытии соединения с физическим сервером: %v", err)
		}
	}
}

// GetClient возвращает клиент gRPC для взаимодействия с физикой
func (p *PhysicsClient) GetClient() pb.PhysicsServiceClient {
	return p.client
}
*/
