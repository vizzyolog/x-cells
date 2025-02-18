package transport

import (
	"context"

	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"

	pb "x-cells/backend/internal/physics/generated"
)

type PhysicsClient struct {
	client pb.PhysicsClient
	conn   *grpc.ClientConn
}

func NewPhysicsClient(ctx context.Context, addr string) (*PhysicsClient, error) {
	conn, err := grpc.DialContext(ctx, addr,
		grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		return nil, err
	}

	return &PhysicsClient{
		client: pb.NewPhysicsClient(conn),
		conn:   conn,
	}, nil
}

func (c *PhysicsClient) Close() error {
	return c.conn.Close()
}

func (c *PhysicsClient) CreateObject(ctx context.Context, request *pb.CreateObjectRequest, opts ...grpc.CallOption) (*pb.CreateObjectResponse, error) {
	return c.client.CreateObject(ctx, request, opts...)
}

func (c *PhysicsClient) GetObjectState(ctx context.Context, request *pb.GetObjectStateRequest, opts ...grpc.CallOption) (*pb.GetObjectStateResponse, error) {
	return c.client.GetObjectState(ctx, request, opts...)
}

func (c *PhysicsClient) ApplyImpulse(ctx context.Context, req *pb.ApplyImpulseRequest, opts ...grpc.CallOption) (*pb.ApplyImpulseResponse, error) {
	return c.client.ApplyImpulse(ctx, req, opts...)
}

func (c *PhysicsClient) ApplyTorque(ctx context.Context, req *pb.ApplyTorqueRequest, opts ...grpc.CallOption) (*pb.ApplyTorqueResponse, error) {
	return c.client.ApplyTorque(ctx, req, opts...)
}
