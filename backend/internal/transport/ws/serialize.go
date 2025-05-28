package ws

import (
	"fmt"
	"log"
	"time"

	"x-cells/backend/internal/world"
)

// WorldSerializer отвечает за сериализацию объектов мира для отправки клиенту
type WorldSerializer struct {
	worldManager *world.Manager
}

// NewWorldSerializer создает новый экземпляр WorldSerializer
func NewWorldSerializer(worldManager *world.Manager) *WorldSerializer {
	return &WorldSerializer{
		worldManager: worldManager,
	}
}

// SendCreateForAllObjects отправляет информацию о всех объектах клиенту
func (s *WorldSerializer) SendCreateForAllObjects(wsWriter *SafeWriter) error {
	worldObjects := s.worldManager.GetAllWorldObjects()

	for _, obj := range worldObjects {
		// Получаем текущее время в миллисекундах для временной метки
		serverTime := time.Now().UnixNano() / int64(time.Millisecond)

		// Создаем базовый объект с общими полями
		msg := map[string]interface{}{
			"type":        "create",
			"id":          obj.ID,
			"x":           obj.Position.X,
			"y":           obj.Position.Y,
			"z":           obj.Position.Z,
			"color":       obj.Color,
			"physics_by":  string(obj.PhysicsType),
			"server_time": serverTime,
		}

		// Заполняем поля в зависимости от типа объекта
		switch obj.Shape.Type {
		case world.SPHERE:
			msg["object_type"] = "sphere"
			msg["radius"] = obj.Shape.Sphere.Radius
			msg["mass"] = obj.Shape.Sphere.Mass

		case world.BOX:
			msg["object_type"] = "box"
			msg["width"] = obj.Shape.Box.Width
			msg["height"] = obj.Shape.Box.Height
			msg["depth"] = obj.Shape.Box.Depth
			msg["mass"] = obj.Shape.Box.Mass

		case world.TERRAIN:
			msg["object_type"] = "terrain"
			msg["height_data"] = obj.Shape.Terrain.HeightData
			msg["heightmap_w"] = obj.Shape.Terrain.Width
			msg["heightmap_h"] = obj.Shape.Terrain.Depth
			msg["scale_x"] = obj.Shape.Terrain.ScaleX
			msg["scale_y"] = obj.Shape.Terrain.ScaleY
			msg["scale_z"] = obj.Shape.Terrain.ScaleZ
			msg["min_height"] = obj.MinHeight
			msg["max_height"] = obj.MaxHeight
		}

		// Отправляем сообщение
		if err := wsWriter.WriteJSON(msg); err != nil {
			log.Printf("[Serialize] Ошибка отправки объекта %s: %v", obj.ID, err)
			return err
		}
		if msg["object_type"] == "sphere" {
			log.Println("Отправлен объект", msg)
		}
	}

	return nil
}

// SendUpdateForObject отправляет обновление состояния объекта клиенту
func (s *WorldSerializer) SendUpdateForObject(wsWriter *SafeWriter, objectID string, position world.Vector3, rotation world.Quaternion) error {
	// Получаем текущее время в миллисекундах для временной метки
	serverTime := time.Now().UnixNano() / int64(time.Millisecond)

	// Создаем сообщение обновления
	msg := map[string]interface{}{
		"type":        "update",
		"id":          objectID,
		"x":           position.X,
		"y":           position.Y,
		"z":           position.Z,
		"qx":          rotation.X,
		"qy":          rotation.Y,
		"qz":          rotation.Z,
		"qw":          rotation.W,
		"server_time": serverTime,
	}

	// Отправляем сообщение
	if err := wsWriter.WriteJSON(msg); err != nil {
		log.Printf("[Serialize] Ошибка отправки обновления для объекта %s: %v", objectID, err)
		return err
	}

	return nil
}

// SendCreateForObject отправляет информацию о конкретном объекте клиенту
func (s *WorldSerializer) SendCreateForObject(wsWriter *SafeWriter, objectID string) error {
	// Получаем объект по ID
	obj, exists := s.worldManager.GetObject(objectID)
	if !exists {
		return fmt.Errorf("объект с ID %s не найден", objectID)
	}

	// Получаем текущее время в миллисекундах для временной метки
	serverTime := time.Now().UnixNano() / int64(time.Millisecond)

	// Создаем базовый объект с общими полями
	msg := map[string]interface{}{
		"type":        "create",
		"id":          obj.ID,
		"x":           obj.Position.X,
		"y":           obj.Position.Y,
		"z":           obj.Position.Z,
		"color":       obj.Color,
		"physics_by":  string(obj.PhysicsType),
		"server_time": serverTime,
	}

	// Заполняем поля в зависимости от типа объекта
	switch obj.Shape.Type {
	case world.SPHERE:
		msg["object_type"] = "sphere"
		msg["radius"] = obj.Shape.Sphere.Radius
		msg["mass"] = obj.Shape.Sphere.Mass

	case world.BOX:
		msg["object_type"] = "box"
		msg["width"] = obj.Shape.Box.Width
		msg["height"] = obj.Shape.Box.Height
		msg["depth"] = obj.Shape.Box.Depth
		msg["mass"] = obj.Shape.Box.Mass

	case world.TERRAIN:
		msg["object_type"] = "terrain"
		msg["height_data"] = obj.Shape.Terrain.HeightData
		msg["heightmap_w"] = obj.Shape.Terrain.Width
		msg["heightmap_h"] = obj.Shape.Terrain.Depth
		msg["scale_x"] = obj.Shape.Terrain.ScaleX
		msg["scale_y"] = obj.Shape.Terrain.ScaleY
		msg["scale_z"] = obj.Shape.Terrain.ScaleZ
		msg["min_height"] = obj.MinHeight
		msg["max_height"] = obj.MaxHeight
	}

	// Отправляем сообщение
	if err := wsWriter.WriteJSON(msg); err != nil {
		log.Printf("[Serialize] Ошибка отправки объекта %s: %v", obj.ID, err)
		return err
	}

	log.Printf("[Serialize] Отправлен объект %s типа %s", obj.ID, msg["object_type"])
	return nil
}
