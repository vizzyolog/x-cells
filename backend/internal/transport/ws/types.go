package ws

// Константы для WebSocket сообщений
const (
	// Типы сообщений
	MessageTypeCreate  = "create"  // Создание объекта
	MessageTypeUpdate  = "update"  // Обновление объекта
	MessageTypePing    = "ping"    // Пинг для измерения задержки
	MessageTypePong    = "pong"    // Ответ на пинг
	MessageTypeCommand = "cmd"     // Команда от клиента
	MessageTypeAck     = "cmd_ack" // Подтверждение команды
	MessageTypeInfo    = "info"    // Информационное сообщение
)

// ObjectMessage представляет сообщение о создании или обновлении объекта
type ObjectMessage struct {
	Type       string    `json:"type"`
	ID         string    `json:"id"`
	ObjectType string    `json:"object_type,omitempty"`
	X          float32   `json:"x"`
	Y          float32   `json:"y"`
	Z          float32   `json:"z"`
	QX         float32   `json:"qx,omitempty"`
	QY         float32   `json:"qy,omitempty"`
	QZ         float32   `json:"qz,omitempty"`
	QW         float32   `json:"qw,omitempty"`
	Mass       float32   `json:"mass,omitempty"`
	Radius     float32   `json:"radius,omitempty"`
	Width      float32   `json:"width,omitempty"`
	Height     float32   `json:"height,omitempty"`
	Depth      float32   `json:"depth,omitempty"`
	Color      string    `json:"color,omitempty"`
	PhysicsBy  string    `json:"physics_by,omitempty"`
	ServerTime int64     `json:"server_time"`
	HeightData []float32 `json:"height_data,omitempty"`
	HeightmapW int32     `json:"heightmap_w,omitempty"`
	HeightmapH int32     `json:"heightmap_h,omitempty"`
	ScaleX     float32   `json:"scale_x,omitempty"`
	ScaleY     float32   `json:"scale_y,omitempty"`
	ScaleZ     float32   `json:"scale_z,omitempty"`
	MinHeight  float32   `json:"min_height,omitempty"`
	MaxHeight  float32   `json:"max_height,omitempty"`
}

// CommandMessage представляет команду от клиента
type CommandMessage struct {
	Type       string      `json:"type"`
	Cmd        string      `json:"cmd,omitempty"`
	ClientTime int64       `json:"client_time,omitempty"`
	Data       interface{} `json:"data"`
}

// AckMessage представляет подтверждение команды сервером
type AckMessage struct {
	Type       string `json:"type"`
	Cmd        string `json:"cmd"`
	ClientTime int64  `json:"client_time"`
	ServerTime int64  `json:"server_time"`
}

// PingMessage представляет пинг от клиента
type PingMessage struct {
	Type       string `json:"type"`
	ClientTime int64  `json:"client_time"`
}

// PongMessage представляет ответ на пинг от сервера
type PongMessage struct {
	Type       string `json:"type"`
	ClientTime int64  `json:"client_time"`
	ServerTime int64  `json:"server_time"`
}

// InfoMessage представляет информационное сообщение от сервера
type InfoMessage struct {
	Type    string `json:"type"`
	Message string `json:"message"`
}
