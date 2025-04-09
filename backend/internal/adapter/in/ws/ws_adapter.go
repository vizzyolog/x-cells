package ws

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"math"
	"net/http"
	"sync"
	"time"

	"github.com/gorilla/websocket"

	"x-cells/backend/internal/core/domain/entity"
)

// Определяем типы объектов
type ObjectType string

const (
	TypeSphere  ObjectType = "sphere"
	TypeBox     ObjectType = "box"
	TypeTerrain ObjectType = "terrain"
)

// GameObject представляет игровой объект
type GameObject struct {
	ID         string
	Position   entity.Vector3
	ObjectType ObjectType
	Mass       float64
	Color      string
	// Дополнительные параметры в зависимости от типа
	Radius float64 // для сферы
	Width  float64 // для ящика
	Height float64 // для ящика
	Depth  float64 // для ящика
}

// GetType возвращает тип объекта
func (g *GameObject) GetType() ObjectType {
	return g.ObjectType
}

// NewSphere создает новый объект-сферу
func NewSphere(id string, position entity.Vector3, radius, mass float64, color string) *GameObject {
	return &GameObject{
		ID:         id,
		Position:   position,
		ObjectType: TypeSphere,
		Mass:       mass,
		Color:      color,
		Radius:     radius,
	}
}

// NewBox создает новый объект-ящик
func NewBox(id string, position entity.Vector3, width, height, depth, mass float64, color string) *GameObject {
	return &GameObject{
		ID:         id,
		Position:   position,
		ObjectType: TypeBox,
		Mass:       mass,
		Color:      color,
		Width:      width,
		Height:     height,
		Depth:      depth,
	}
}

// WSAdapter адаптер для WebSocket соединений
type WSAdapter struct {
	upgrader  websocket.Upgrader
	handlers  map[string]func(*SafeWriter, map[string]interface{}) error
	worldPort WorldPort
	clients   map[*SafeWriter]bool // Для хранения активных клиентов
	clientsMu sync.Mutex           // Мьютекс для безопасного доступа к списку клиентов
}

// World Port интерфейс
type WorldPort interface {
	// GetObject возвращает объект по его ID
	GetObject(id string) *GameObject

	// CreateObject создает новый объект
	CreateObject(ctx context.Context, obj *GameObject) error

	// UpdateObjectPosition обновляет позицию объекта
	UpdateObjectPosition(ctx context.Context, id string, position entity.Vector3) error

	// DeleteObject удаляет объект
	DeleteObject(ctx context.Context, id string) error

	// GetAllObjects возвращает все объекты
	GetAllObjects() map[string]*GameObject

	// ApplyImpulse применяет импульс к объекту
	ApplyImpulse(ctx context.Context, id string, direction entity.Vector3, strength float64) error
}

// NewWSAdapter создает новый экземпляр WSAdapter
func NewWSAdapter(worldPort WorldPort) *WSAdapter {
	return &WSAdapter{
		worldPort: worldPort,
		upgrader: websocket.Upgrader{
			CheckOrigin: func(r *http.Request) bool {
				return true
			},
		},
		handlers: make(map[string]func(*SafeWriter, map[string]interface{}) error),
		clients:  make(map[*SafeWriter]bool),
	}
}

// SafeWriter обеспечивает потокобезопасную запись в WebSocket
type SafeWriter struct {
	conn  *websocket.Conn
	mutex sync.Mutex
}

// NewSafeWriter создает новый экземпляр SafeWriter
func NewSafeWriter(conn *websocket.Conn) *SafeWriter {
	return &SafeWriter{
		conn: conn,
	}
}

// WriteJSON потокобезопасно отправляет JSON данные через WebSocket
func (w *SafeWriter) WriteJSON(v interface{}) error {
	w.mutex.Lock()
	defer w.mutex.Unlock()

	// Преобразуем JSON данные в строку с обработкой NaN значений
	jsonData, err := json.Marshal(v)
	if err != nil {
		// Если возникла ошибка сериализации из-за NaN значений,
		// попробуем глубоко обойти структуру и заменить NaN на 0
		if mapData, ok := v.(map[string]interface{}); ok {
			sanitizeMapValues(mapData)
			jsonData, err = json.Marshal(mapData)
			if err != nil {
				return err
			}
		} else {
			return err
		}
	}

	// Отправляем JSON данные
	return w.conn.WriteMessage(websocket.TextMessage, jsonData)
}

// sanitizeMapValues рекурсивно обходит map и заменяет NaN значения на 0
func sanitizeMapValues(data map[string]interface{}) {
	for k, v := range data {
		switch val := v.(type) {
		case float64:
			if math.IsNaN(val) {
				data[k] = 0.0
			}
		case float32:
			if math.IsNaN(float64(val)) {
				data[k] = float32(0.0)
			}
		case map[string]interface{}:
			sanitizeMapValues(val)
		case []interface{}:
			for i, item := range val {
				if itemMap, ok := item.(map[string]interface{}); ok {
					sanitizeMapValues(itemMap)
				} else if itemFloat, ok := item.(float64); ok && math.IsNaN(itemFloat) {
					val[i] = 0.0
				} else if itemFloat32, ok := item.(float32); ok && math.IsNaN(float64(itemFloat32)) {
					val[i] = float32(0.0)
				}
			}
		}
	}
}

// Close закрывает соединение WebSocket
func (w *SafeWriter) Close() error {
	return w.conn.Close()
}

// SendJSON отправляет JSON данные через WebSocket (алиас для WriteJSON)
func (w *SafeWriter) SendJSON(v interface{}) error {
	return w.WriteJSON(v)
}

// RegisterHandlers регистрирует обработчики сообщений
func (a *WSAdapter) RegisterHandlers() {
	// Обработчик команд
	a.handlers["COMMAND"] = func(conn *SafeWriter, message map[string]interface{}) error {
		log.Printf("Получена команда: %v", message)

		command, ok := message["command"].(string)
		if !ok {
			return fmt.Errorf("неверный формат команды")
		}

		clientTime, ok := message["clientTime"].(float64)
		if !ok {
			return fmt.Errorf("неверный формат времени клиента")
		}

		// Определение направления и силы импульса
		var impulseDir entity.Vector3
		var strength float64 = 100.0 // Увеличено с 40.0 - базовая сила импульса

		switch command {
		case "LEFT":
			impulseDir = entity.Vector3{X: -1, Y: 0, Z: 0}
		case "RIGHT":
			impulseDir = entity.Vector3{X: 1, Y: 0, Z: 0}
		case "UP":
			impulseDir = entity.Vector3{X: 0, Y: 1, Z: 0}
		case "DOWN":
			impulseDir = entity.Vector3{X: 0, Y: 0, Z: -1}
		case "SPACE":
			impulseDir = entity.Vector3{X: 0, Y: 1, Z: 0}
			strength = 150.0 // Увеличено с 60.0 - увеличенная сила для прыжка
		case "MOUSE_VECTOR":
			// Получение вектора направления мыши
			data, ok := message["data"].(map[string]interface{})
			if !ok {
				return fmt.Errorf("неверный формат данных команды")
			}

			x, ok1 := data["x"].(float64)
			y, ok2 := data["y"].(float64)
			z, ok3 := data["z"].(float64)

			if !ok1 || !ok2 || !ok3 {
				return fmt.Errorf("неверный формат вектора мыши")
			}

			// Нормализация вектора
			length := math.Sqrt(x*x + y*y + z*z)
			if length > 0 {
				x /= length
				y /= length
				z /= length
			}

			impulseDir = entity.Vector3{X: x, Y: y, Z: z}
			strength = 120.0 // Увеличено с 50.0 - сила для импульса от мыши
		default:
			return fmt.Errorf("неизвестная команда: %s", command)
		}

		// Получаем все объекты и применяем импульс
		objects := a.worldPort.GetAllObjects()
		for id, obj := range objects {
			// Не применяем импульс к terrain объектам
			if obj.GetType() == TypeTerrain {
				continue
			}

			if err := a.worldPort.ApplyImpulse(context.Background(), id, impulseDir, strength); err != nil {
				log.Printf("Ошибка при применении импульса к объекту %s: %v", id, err)
			} else {
				log.Printf("Применен импульс к объекту %s: направление=%v, сила=%f", id, impulseDir, strength)
			}
		}

		// Отправляем подтверждение обработки команды
		response := map[string]interface{}{
			"type":       "COMMAND_ACK",
			"clientTime": clientTime,
			"serverTime": float64(time.Now().UnixNano()) / 1e9,
		}

		return conn.SendJSON(response)
	}

	// Обработчик ping-сообщений
	a.handlers["ping"] = func(conn *SafeWriter, message map[string]interface{}) error {
		// Получаем время клиента для возврата в ответе pong
		var clientTime float64

		// Проверяем разные возможные форматы времени клиента
		if ct, ok := message["clientTime"].(float64); ok {
			clientTime = ct
		} else if ct, ok := message["client_time"].(float64); ok {
			clientTime = ct
		} else {
			// Если время клиента не найдено, используем текущее время сервера
			clientTime = float64(time.Now().UnixNano()) / 1e9
		}

		// Высчитываем серверное время в миллисекундах
		serverTimeMs := float64(time.Now().UnixMilli())

		// Отправляем pong в ответ с полями, которые ожидает фронтенд
		return conn.SendJSON(map[string]interface{}{
			"type":        "pong",
			"client_time": clientTime,          // Исходный формат клиента
			"clientTime":  clientTime,          // Альтернативный формат
			"server_time": serverTimeMs,        // Время сервера в миллисекундах
			"serverTime":  serverTimeMs / 1000, // Время сервера в секундах
		})
	}

	// Обработчик запроса на создание объекта
	a.handlers["create_object"] = func(conn *SafeWriter, message map[string]interface{}) error {
		// Реализация обработчика для создания объекта
		objectType, _ := message["object_type"].(string)
		id, _ := message["id"].(string)

		// Получаем позицию из сообщения
		position := entity.Vector3{X: 0, Y: 0, Z: 0}
		if pos, ok := message["position"].(map[string]interface{}); ok {
			if x, ok := pos["x"].(float64); ok {
				position.X = x
			}
			if y, ok := pos["y"].(float64); ok {
				position.Y = y
			}
			if z, ok := pos["z"].(float64); ok {
				position.Z = z
			}
		}

		// Создаем объект на основе типа
		var gameObject *GameObject
		switch objectType {
		case "sphere":
			radius, _ := message["radius"].(float64)
			mass, _ := message["mass"].(float64)
			color, _ := message["color"].(string)
			gameObject = NewSphere(id, position, radius, mass, color)
		case "box":
			width, _ := message["width"].(float64)
			height, _ := message["height"].(float64)
			depth, _ := message["depth"].(float64)
			mass, _ := message["mass"].(float64)
			color, _ := message["color"].(string)
			gameObject = NewBox(id, position, width, height, depth, mass, color)
		default:
			return fmt.Errorf("неподдерживаемый тип объекта: %s", objectType)
		}

		// Создаем объект в мире
		if err := a.worldPort.CreateObject(context.Background(), gameObject); err != nil {
			return fmt.Errorf("ошибка создания объекта: %w", err)
		}

		// Отправляем ответ о создании объекта
		return conn.SendJSON(map[string]interface{}{
			"type":   "create_ack",
			"id":     id,
			"status": "created",
		})
	}
}

// HandleWS обрабатывает WebSocket соединения
func (a *WSAdapter) HandleWS(w http.ResponseWriter, r *http.Request) {
	conn, err := a.upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("Ошибка при установке WebSocket соединения: %v", err)
		return
	}

	safeWriter := NewSafeWriter(conn)

	// Добавляем клиента в список
	a.clientsMu.Lock()
	a.clients[safeWriter] = true
	a.clientsMu.Unlock()

	log.Printf("Отправка начлаьных объектов клиенту! ")
	// Отправляем клиенту все начальные объекты
	a.BroadcastInitialObjects(safeWriter)

	defer func() {
		// Удаляем клиента из списка при закрытии соединения
		a.clientsMu.Lock()
		delete(a.clients, safeWriter)
		a.clientsMu.Unlock()
		conn.Close()
	}()

	// Регистрируем обработчики, если еще не зарегистрированы
	if len(a.handlers) == 0 {
		a.RegisterHandlers()
	}

	// Обрабатываем входящие сообщения
	for {
		var message map[string]interface{}
		if err := conn.ReadJSON(&message); err != nil {
			log.Printf("Ошибка при чтении сообщения: %v", err)
			break
		}

		// Получаем тип сообщения
		messageType, ok := message["type"].(string)
		if !ok {
			log.Printf("Получено сообщение без типа: %v", message)
			continue
		}

		// Находим и выполняем обработчик для данного типа сообщения
		handler, ok := a.handlers[messageType]
		if !ok {
			log.Printf("Нет обработчика для типа сообщения: %s", messageType)
			continue
		}

		if err := handler(safeWriter, message); err != nil {
			log.Printf("Ошибка обработки сообщения типа %s: %v", messageType, err)
		}
	}
}

// safeValue проверяет значения на NaN и заменяет их на defaultValue
func safeValue(value float64, defaultValue float64) float64 {
	if math.IsNaN(value) {
		return defaultValue
	}
	return value
}

// BroadcastUpdate отправляет обновления всем подключенным клиентам
func (a *WSAdapter) BroadcastUpdate() {
	objects := a.worldPort.GetAllObjects()
	if len(objects) == 0 {
		return
	}

	// Выводим информацию о всех объектах при отправке
	log.Printf("Отправка обновления для %d объектов", len(objects))
	for id, obj := range objects {
		log.Printf("  Объект %s: тип=%s, позиция=[%.2f, %.2f, %.2f], масса=%.2f",
			id, obj.ObjectType, obj.Position.X, obj.Position.Y, obj.Position.Z, obj.Mass)
	}

	// Создаем безопасное сообщение с обновлением, заменяя NaN значения
	safeObjects := make(map[string]interface{})
	for id, obj := range objects {
		safeObj := map[string]interface{}{
			"id":    id,
			"type":  string(obj.ObjectType),
			"color": obj.Color,
			"mass":  obj.Mass,
			"x":     safeValue(obj.Position.X, 0.0),
			"y":     safeValue(obj.Position.Y, 0.0),
			"z":     safeValue(obj.Position.Z, 0.0),
		}

		// Добавляем специфичные поля в зависимости от типа объекта
		switch obj.ObjectType {
		case TypeSphere:
			safeObj["radius"] = safeValue(obj.Radius, 1.0)
		case TypeBox:
			safeObj["width"] = safeValue(obj.Width, 1.0)
			safeObj["height"] = safeValue(obj.Height, 1.0)
			safeObj["depth"] = safeValue(obj.Depth, 1.0)
		}

		safeObjects[id] = safeObj
	}

	updateMsg := map[string]interface{}{
		"type":       "update",
		"serverTime": float64(time.Now().UnixNano()) / 1e9,
		"objects":    safeObjects,
	}

	// Отправляем сообщение всем подключенным клиентам
	a.clientsMu.Lock()
	for client := range a.clients {
		err := client.SendJSON(updateMsg)
		if err != nil {
			log.Printf("Ошибка при отправке обновления клиенту: %v", err)
		}
	}
	a.clientsMu.Unlock()
}

func (a *WSAdapter) BroadcastInitialObjects(client *SafeWriter) {
	objects := a.worldPort.GetAllObjects()

	log.Printf("Отправка начальных объектов клиенту (%d объектов)", len(objects))

	// Группируем объекты по типу для логирования
	spheres := 0
	boxes := 0
	terrains := 0

	for id, obj := range objects {
		// Создаем сообщение о создании объекта
		objData := map[string]interface{}{
			"type":        "create",
			"id":          id,
			"object_type": string(obj.ObjectType),
			"x":           safeValue(obj.Position.X, 0.0),
			"y":           safeValue(obj.Position.Y, 0.0),
			"z":           safeValue(obj.Position.Z, 0.0),
			"color":       obj.Color,
			"server_time": float64(time.Now().UnixNano()) / 1e9,
		}

		// Добавляем дополнительные параметры в зависимости от типа объекта
		switch obj.ObjectType {
		case TypeSphere:
			objData["radius"] = safeValue(obj.Radius, 1.0)
			objData["mass"] = safeValue(obj.Mass, 1.0)
			spheres++
		case TypeBox:
			objData["width"] = safeValue(obj.Width, 1.0)
			objData["height"] = safeValue(obj.Height, 1.0)
			objData["depth"] = safeValue(obj.Depth, 1.0)
			objData["mass"] = safeValue(obj.Mass, 1.0)
			boxes++
		case TypeTerrain:
			terrains++
			// Дополнительные параметры для террейна, если необходимо
		}

		// Отправляем сообщение о создании объекта
		if err := client.SendJSON(objData); err != nil {
			log.Printf("Ошибка при отправке начального объекта %s: %v", id, err)
		} else {
			log.Printf("Отправлен начальный объект %s типа %s", id, obj.ObjectType)
		}
	}

	// Логируем статистику отправленных объектов
	log.Printf("Отправлена статистика начальных объектов: сфер=%d, ящиков=%d, террейнов=%d",
		spheres, boxes, terrains)
}
