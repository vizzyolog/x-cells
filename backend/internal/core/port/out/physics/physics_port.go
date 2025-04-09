package physics

import (
	"context"
)

// PhysicsPort определяет интерфейс для взаимодействия с физическим движком
type PhysicsPort interface {
	// CreateObject создает физический объект в симуляции
	CreateObject(ctx context.Context, req *CreateObjectRequest) (*CreateObjectResponse, error)

	// ApplyImpulse применяет импульс к объекту
	ApplyImpulse(ctx context.Context, req *ApplyImpulseRequest) (*ApplyImpulseResponse, error)

	// ApplyTorque применяет крутящий момент к объекту
	ApplyTorque(ctx context.Context, req *ApplyTorqueRequest) (*ApplyTorqueResponse, error)

	// GetObjectState получает текущее состояние объекта
	GetObjectState(ctx context.Context, req *GetObjectStateRequest) (*GetObjectStateResponse, error)

	// UpdateObjectMass обновляет массу объекта
	UpdateObjectMass(ctx context.Context, req *UpdateObjectMassRequest) (*UpdateObjectMassResponse, error)

	// Close закрывает соединение с физическим движком
	Close() error
}

// Структуры запросов и ответов для порта физики
// Они могут ссылаться на доменные объекты или быть независимыми

// CreateObjectRequest представляет запрос на создание объекта
type CreateObjectRequest struct {
	ID         string
	ObjectType string
	Position   Vector3
	Size       float64
	Mass       float64
	Color      string
	Properties map[string]interface{}
}

// CreateObjectResponse представляет ответ на создание объекта
type CreateObjectResponse struct {
	ID     string
	Status string
}

// Vector3 представляет трехмерный вектор
type Vector3 struct {
	X, Y, Z float64
}

// ApplyImpulseRequest представляет запрос на применение импульса
type ApplyImpulseRequest struct {
	ID        string
	Direction Vector3
	Strength  float64
}

// ApplyImpulseResponse представляет ответ на применение импульса
type ApplyImpulseResponse struct {
	Status string
}

// ApplyTorqueRequest представляет запрос на применение крутящего момента
type ApplyTorqueRequest struct {
	ID        string
	Direction Vector3
	Strength  float64
}

// ApplyTorqueResponse представляет ответ на применение крутящего момента
type ApplyTorqueResponse struct {
	Status string
}

// GetObjectStateRequest представляет запрос на получение состояния объекта
type GetObjectStateRequest struct {
	ID string
}

// GetObjectStateResponse представляет ответ с состоянием объекта
type GetObjectStateResponse struct {
	ID       string
	Position Vector3
	Velocity Vector3
	Mass     float64
}

// UpdateObjectMassRequest представляет запрос на обновление массы объекта
type UpdateObjectMassRequest struct {
	ID   string
	Mass float64
}

// UpdateObjectMassResponse представляет ответ на обновление массы объекта
type UpdateObjectMassResponse struct {
	Status string
}
