package transport

import (
	"context"

	"google.golang.org/grpc"

	pb "x-cells/backend/internal/physics/generated"
)

// IPhysicsClient определяет интерфейс для взаимодействия с физическим сервером
type IPhysicsClient interface {
	CreateObject(ctx context.Context, req *pb.CreateObjectRequest, opts ...grpc.CallOption) (*pb.CreateObjectResponse, error)
	ApplyImpulse(ctx context.Context, req *pb.ApplyImpulseRequest, opts ...grpc.CallOption) (*pb.ApplyImpulseResponse, error)
	ApplyTorque(ctx context.Context, req *pb.ApplyTorqueRequest, opts ...grpc.CallOption) (*pb.ApplyTorqueResponse, error)
	GetObjectState(ctx context.Context, req *pb.GetObjectStateRequest, opts ...grpc.CallOption) (*pb.GetObjectStateResponse, error)
	UpdateObjectMass(ctx context.Context, req *pb.UpdateObjectMassRequest, opts ...grpc.CallOption) (*pb.UpdateObjectMassResponse, error)
	Close() error
}
