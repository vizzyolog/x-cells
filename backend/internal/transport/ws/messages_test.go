package ws

import (
	"encoding/json"
	"testing"
	"time"
)

func TestGetCurrentServerTime(t *testing.T) {
	// Проверяем, что функция возвращает текущее время в миллисекундах
	now := time.Now().UnixNano() / int64(time.Millisecond)
	serverTime := GetCurrentServerTime()

	// Допускаем разницу в 100 мс (что более чем достаточно для локального выполнения)
	if serverTime < now-100 || serverTime > now+100 {
		t.Errorf("GetCurrentServerTime() returned time too far from current time. Got %d, expected around %d", serverTime, now)
	}
}

func TestNewObjectMessage(t *testing.T) {
	// Создаем сообщение
	msg := NewObjectMessage("sphere", "obj1", 1.0, 2.0, 3.0)

	// Проверяем все поля
	if msg.Type != MessageTypeCreate {
		t.Errorf("Expected message type %s, got %s", MessageTypeCreate, msg.Type)
	}
	if msg.ID != "obj1" {
		t.Errorf("Expected ID obj1, got %s", msg.ID)
	}
	if msg.ObjectType != "sphere" {
		t.Errorf("Expected ObjectType sphere, got %s", msg.ObjectType)
	}
	if msg.X != 1.0 || msg.Y != 2.0 || msg.Z != 3.0 {
		t.Errorf("Expected position (1.0, 2.0, 3.0), got (%f, %f, %f)", msg.X, msg.Y, msg.Z)
	}
	if msg.ServerTime == 0 {
		t.Error("Expected ServerTime to be set, got 0")
	}
}

func TestNewUpdateMessage(t *testing.T) {
	// Создаем сообщение
	msg := NewUpdateMessage("obj1", 1.0, 2.0, 3.0, 0.1, 0.2, 0.3, 0.4)

	// Проверяем все поля
	if msg.Type != MessageTypeUpdate {
		t.Errorf("Expected message type %s, got %s", MessageTypeUpdate, msg.Type)
	}
	if msg.ID != "obj1" {
		t.Errorf("Expected ID obj1, got %s", msg.ID)
	}
	if msg.X != 1.0 || msg.Y != 2.0 || msg.Z != 3.0 {
		t.Errorf("Expected position (1.0, 2.0, 3.0), got (%f, %f, %f)", msg.X, msg.Y, msg.Z)
	}
	if msg.QX != 0.1 || msg.QY != 0.2 || msg.QZ != 0.3 || msg.QW != 0.4 {
		t.Errorf("Expected rotation (0.1, 0.2, 0.3, 0.4), got (%f, %f, %f, %f)", msg.QX, msg.QY, msg.QZ, msg.QW)
	}
	if msg.ServerTime == 0 {
		t.Error("Expected ServerTime to be set, got 0")
	}
}

func TestParseMessage(t *testing.T) {
	tests := []struct {
		name     string
		json     string
		expected interface{}
		error    bool
	}{
		{
			name: "ObjectMessage - Create",
			json: `{"type":"create","id":"obj1","object_type":"sphere","x":1,"y":2,"z":3,"server_time":123456}`,
			expected: &ObjectMessage{
				Type:       MessageTypeCreate,
				ID:         "obj1",
				ObjectType: "sphere",
				X:          1.0,
				Y:          2.0,
				Z:          3.0,
				ServerTime: 123456,
			},
			error: false,
		},
		{
			name: "ObjectMessage - Update",
			json: `{"type":"update","id":"obj1","x":1,"y":2,"z":3,"qx":0.1,"qy":0.2,"qz":0.3,"qw":0.4,"server_time":123456}`,
			expected: &ObjectMessage{
				Type:       MessageTypeUpdate,
				ID:         "obj1",
				X:          1.0,
				Y:          2.0,
				Z:          3.0,
				QX:         0.1,
				QY:         0.2,
				QZ:         0.3,
				QW:         0.4,
				ServerTime: 123456,
			},
			error: false,
		},
		{
			name: "CommandMessage",
			json: `{"type":"cmd","cmd":"LEFT","client_time":123456}`,
			expected: &CommandMessage{
				Type:       MessageTypeCommand,
				Cmd:        "LEFT",
				ClientTime: 123456,
			},
			error: false,
		},
		{
			name: "PingMessage",
			json: `{"type":"ping","client_time":123456}`,
			expected: &PingMessage{
				Type:       MessageTypePing,
				ClientTime: 123456,
			},
			error: false,
		},
		{
			name: "InfoMessage",
			json: `{"type":"info","message":"Hello, world!"}`,
			expected: &InfoMessage{
				Type:    MessageTypeInfo,
				Message: "Hello, world!",
			},
			error: false,
		},
		{
			name:     "Invalid JSON",
			json:     `{"type":`,
			expected: nil,
			error:    true,
		},
		{
			name:     "Unknown message type",
			json:     `{"type":"unknown"}`,
			expected: nil,
			error:    true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result, err := ParseMessage([]byte(tt.json))
			if tt.error {
				if err == nil {
					t.Errorf("Expected error, got nil")
				}
				return
			}

			if err != nil {
				t.Errorf("Unexpected error: %v", err)
				return
			}

			// Сравниваем результат с ожидаемым
			expected, _ := json.Marshal(tt.expected)
			actual, _ := json.Marshal(result)

			if string(expected) != string(actual) {
				t.Errorf("Expected %s, got %s", string(expected), string(actual))
			}
		})
	}
}
