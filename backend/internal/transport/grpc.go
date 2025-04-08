package transport

import (
	"context"

	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"

	pb "x-cells/backend/internal/physics/generated"
)

// Реализация интерфейса IPhysicsClient через gRPC
type grpcPhysicsClient struct {
	client pb.PhysicsClient
	conn   *grpc.ClientConn
}

func NewPhysicsClient(ctx context.Context, addr string) (IPhysicsClient, error) {
	conn, err := grpc.DialContext(ctx, addr,
		grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		return nil, err
	}

	return &grpcPhysicsClient{
		client: pb.NewPhysicsClient(conn),
		conn:   conn,
	}, nil
}

func (c *grpcPhysicsClient) Close() error {
	return c.conn.Close()
}

func (c *grpcPhysicsClient) CreateObject(ctx context.Context, request *pb.CreateObjectRequest, opts ...grpc.CallOption) (*pb.CreateObjectResponse, error) {
	return c.client.CreateObject(ctx, request, opts...)
}

func (c *grpcPhysicsClient) GetObjectState(ctx context.Context, request *pb.GetObjectStateRequest, opts ...grpc.CallOption) (*pb.GetObjectStateResponse, error) {
	return c.client.GetObjectState(ctx, request, opts...)
}

func (c *grpcPhysicsClient) ApplyImpulse(ctx context.Context, req *pb.ApplyImpulseRequest, opts ...grpc.CallOption) (*pb.ApplyImpulseResponse, error) {
	return c.client.ApplyImpulse(ctx, req, opts...)
}

func (c *grpcPhysicsClient) ApplyTorque(ctx context.Context, req *pb.ApplyTorqueRequest, opts ...grpc.CallOption) (*pb.ApplyTorqueResponse, error) {
	return c.client.ApplyTorque(ctx, req, opts...)
}

// UpdateObjectMass обновляет массу объекта
func (c *grpcPhysicsClient) UpdateObjectMass(ctx context.Context, req *pb.UpdateObjectMassRequest, opts ...grpc.CallOption) (*pb.UpdateObjectMassResponse, error) {
	return c.client.UpdateObjectMass(ctx, req, opts...)
}
