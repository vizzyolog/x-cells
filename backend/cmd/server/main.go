package main

import (
	"context"
	"encoding/json"
	"log"
	"math"
	"net/http"
	"os"
	"sync"
	"time"

	"github.com/gorilla/websocket"

	pb "x-cells/backend/internal/physics/generated"
	"x-cells/backend/internal/serialize"
	"x-cells/backend/internal/transport"
	"x-cells/backend/internal/transport/ws"
	"x-cells/backend/internal/world"
)

// Константы для террейна
const (
	// Физические размеры террейна в мире
	terrainPhysicalWidth = 1500.0
	terrainPhysicalDepth = 15000.0

	// Размеры сетки террейна
	terrainGridSize  = 128 // Одинаковая детализация для соответствия примеру three.js
	terrainHalfWidth = terrainGridSize / 2
	terrainHalfDepth = terrainGridSize / 2

	// Диапазон высот
	terrainMinHeight = -50.0
	terrainMaxHeight = 50.0 // Увеличиваем максимальную высоту для гор
)

// Object - локальная структура хранения
type Object struct {
	ID         string    `json:"id"`
	ObjectType string    `json:"object_type"`
	X          float32   `json:"x"`
	Y          float32   `json:"y"`
	Z          float32   `json:"z"`
	Mass       float32   `json:"mass"`
	Radius     float32   `json:"radius"`
	Width      float32   `json:"width"`
	Height     float32   `json:"height"`
	Depth      float32   `json:"depth"`
	Color      string    `json:"color"`
	HeightData []float32 `json:"height_data,omitempty"`
	HeightmapW int32     `json:"heightmap_w,omitempty"`
	HeightmapH int32     `json:"heightmap_h,omitempty"`
	ScaleX     float32   `json:"scale_x,omitempty"`
	ScaleY     float32   `json:"scale_y,omitempty"`
	ScaleZ     float32   `json:"scale_z,omitempty"`
	MinHeight  float32   `json:"min_height,omitempty"`
	MaxHeight  float32   `json:"max_height,omitempty"`
	PhysicsBy  string    `json:"physics_by"`
}

var (
	objects      = make(map[string]*Object)
	objectsMutex sync.Mutex
	upgrader     = websocket.Upgrader{CheckOrigin: func(r *http.Request) bool { return true }}
)

// func generateTrees(count int) {
// 	for i := 0; i < count; i++ {
// 		x := float32(rand.Intn(200) - 100)
// 		z := float32(rand.Intn(200) - 100)
// 		tree := generateTree(x, z)
// 		createTreeInGo(tree)
// 	}
// }

// createObjectInGo - создаём объект в локальном maps и через gRPC
func createObjectInGo(obj *Object, client pb.PhysicsClient) {
	objectsMutex.Lock()
	objects[obj.ID] = obj
	objectsMutex.Unlock()

	// Создаем базовый запрос
	request := &pb.CreateObjectRequest{
		Id: obj.ID,
		Position: &pb.Vector3{
			X: obj.X,
			Y: obj.Y,
			Z: obj.Z,
		},
		Rotation: &pb.Quaternion{
			X: 0,
			Y: 0,
			Z: 0,
			W: 1, // Идентичное вращение
		},
	}

	// Создаем ShapeDescriptor в зависимости от типа объекта
	shapeDesc := &pb.ShapeDescriptor{}

	switch obj.ObjectType {
	case "sphere":
		shapeDesc.Type = pb.ShapeDescriptor_SPHERE
		shapeDesc.Shape = &pb.ShapeDescriptor_Sphere{
			Sphere: &pb.SphereData{
				Radius: obj.Radius,
				Mass:   obj.Mass,
				Color:  obj.Color,
			},
		}

	case "box":
		shapeDesc.Type = pb.ShapeDescriptor_BOX
		shapeDesc.Shape = &pb.ShapeDescriptor_Box{
			Box: &pb.BoxData{
				Width:  obj.Width,
				Height: obj.Height,
				Depth:  obj.Depth,
				Mass:   obj.Mass,
				Color:  obj.Color,
			},
		}

	case "terrain":
		shapeDesc.Type = pb.ShapeDescriptor_TERRAIN
		shapeDesc.Shape = &pb.ShapeDescriptor_Terrain{
			Terrain: &pb.TerrainData{
				Width:     obj.HeightmapW,
				Depth:     obj.HeightmapH,
				Heightmap: obj.HeightData,
				ScaleX:    obj.ScaleX,
				ScaleY:    obj.ScaleY,
				ScaleZ:    obj.ScaleZ,
			},
		}

	default:
		log.Printf("[Go] Неизвестный тип объекта: %s", obj.ObjectType)
		return
	}

	request.Shape = shapeDesc

	// Отправляем запрос в C++ сервер
	_, err := client.CreateObject(context.Background(), request)
	if err != nil {
		log.Printf("[Go] Ошибка создания объекта: %v", err)
		return
	}
}

// Utility функция для шума Перлина
func noise2D(x, y float64) float64 {
	// Простая хеш-функция для псевдо-шума
	// В реальном приложении стоит использовать настоящую библиотеку шума Перлина
	h := x*12.9898 + y*78.233
	sinH := math.Sin(h)
	return math.Abs(sinH*43758.5453) - math.Floor(math.Abs(sinH*43758.5453))
}

// Плавная интерполяция между a и b
func lerp(a, b, t float64) float64 {
	return a + t*(b-a)
}

// Функция интерполяции для сглаживания
func smoothstep(t float64) float64 {
	return t * t * (3.0 - 2.0*t)
}

// Функция для получения сглаженного случайного шума
func smoothNoise(x, y float64) float64 {
	// Получаем целые координаты
	x0 := math.Floor(x)
	y0 := math.Floor(y)
	x1 := x0 + 1.0
	y1 := y0 + 1.0

	// Интерполяционные коэффициенты
	sx := smoothstep(x - x0)
	sy := smoothstep(y - y0)

	// Интерполяция между 4 углами
	n00 := noise2D(x0, y0)
	n10 := noise2D(x1, y0)
	n01 := noise2D(x0, y1)
	n11 := noise2D(x1, y1)

	// Билинейная интерполяция
	nx0 := lerp(n00, n10, sx)
	nx1 := lerp(n01, n11, sx)
	n := lerp(nx0, nx1, sy)

	return n
}

// Генерация данных террейна с шумом Перлина для гор
func generateTerrainData(w, h int) []float32 {
	data := make([]float32, w*h)

	// Параметры шума
	scales := []float64{1.0, 0.5, 0.25, 0.125, 0.0625}         // Разные масштабы для фрактального шума
	amplitudes := []float64{0.5, 0.25, 0.125, 0.0625, 0.03125} // Амплитуды для каждого масштаба

	// Расширяем диапазон высот для более драматичного рельефа
	heightRange := terrainMaxHeight - terrainMinHeight

	// Добавляем кратеры и горы
	centerX := float64(w) / 2.0
	centerZ := float64(h) / 2.0

	maxRadius := math.Min(centerX, centerZ) * 0.8 // Радиус основного ландшафта

	// Создаем несколько гор в случайных местах
	numMountains := 5
	mountains := make([]struct{ x, z, height, radius float64 }, numMountains)

	// "Случайные" координаты для гор (для воспроизводимости используем фиксированные значения)
	mountainPositions := []struct{ x, z float64 }{
		{0.2, 0.3}, {0.7, 0.8}, {0.4, 0.7}, {0.8, 0.2}, {0.1, 0.9},
	}

	for i := 0; i < numMountains; i++ {
		mountains[i].x = mountainPositions[i].x * float64(w)
		mountains[i].z = mountainPositions[i].z * float64(h)
		mountains[i].height = 0.5 + 0.5*math.Abs(noise2D(float64(i)*0.1, 0.5))  // Высота от 0.5 до 1.0
		mountains[i].radius = 5.0 + 15.0*math.Abs(noise2D(0.5, float64(i)*0.1)) // Радиус от 5 до 20
	}

	// Вычисляем высоту для каждой точки
	for j := 0; j < h; j++ {
		for i := 0; i < w; i++ {
			// Нормализуем координаты в диапазоне [0..1]
			nx := float64(i) / float64(w-1)
			nz := float64(j) / float64(h-1)

			// Базовый шум Перлина для основного рельефа
			noiseValue := 0.0
			for layer := 0; layer < len(scales); layer++ {
				// Многослойный шум (октавы) для создания фрактального рельефа
				scale := scales[layer]
				amplitude := amplitudes[layer]
				noiseValue += smoothNoise(nx*scale*10.0, nz*scale*10.0) * amplitude
			}

			// Нормализуем в диапазон [0..1]
			noiseValue = (noiseValue + 0.5) * 0.5

			// Добавление гор
			elevation := noiseValue
			for _, mountain := range mountains {
				// Расстояние от точки до горы
				dx := float64(i) - mountain.x
				dz := float64(j) - mountain.z
				distance := math.Sqrt(dx*dx + dz*dz)

				// Если точка находится в радиусе горы
				if distance < mountain.radius {
					// Фактор затухания от центра горы (1 в центре, 0 на краю)
					falloff := 1.0 - distance/mountain.radius
					falloff = math.Pow(falloff, 2.0) // Квадратичное затухание для более крутых склонов

					// Добавляем высоту горы
					mountainHeight := mountain.height * falloff * 0.8 // 0.8 - коэффициент влияния горы
					elevation += mountainHeight
				}
			}

			// Создаем впадину по краям карты для естественного обрамления
			distanceFromCenter := math.Sqrt(math.Pow(float64(i)-centerX, 2) + math.Pow(float64(j)-centerZ, 2))
			if distanceFromCenter > maxRadius {
				// За пределами основного радиуса создаем понижение
				edgeFactor := (distanceFromCenter - maxRadius) / (math.Max(centerX, centerZ) - maxRadius)
				edgeFactor = math.Min(1.0, edgeFactor) // Ограничиваем множитель до 1
				elevation -= edgeFactor * 0.5          // Понижаем высоту к краям
			}

			// Масштабируем в нужный диапазон высот
			height := elevation*heightRange + terrainMinHeight

			// Сохраняем данные
			data[j*w+i] = float32(height)
		}
	}

	return data
}

// sendError отправляет сообщение об ошибке клиенту
func sendError(writer *ws.SafeWriter, errorMessage string) {
	message := map[string]interface{}{
		"type":    "error",
		"message": errorMessage,
	}
	if err := writer.WriteJSON(message); err != nil {
		log.Printf("[Go] Ошибка при отправке сообщения об ошибке: %v", err)
	}
}

// streamStates стримит состояние объектов
func streamStates(wsWriter *ws.SafeWriter, physicsClient pb.PhysicsClient, serializer *serialize.WorldSerializer, worldManager *world.Manager) {
	ticker := time.NewTicker(50 * time.Millisecond)
	defer ticker.Stop()

	for range ticker.C {
		// Получаем список всех объектов из мира
		worldObjects := worldManager.GetAllWorldObjects()

		// Для каждого объекта с физикой bullet или both получаем состояние
		for _, obj := range worldObjects {
			// Пропускаем объекты, которые обрабатываются только на клиенте
			if obj.PhysicsType == world.PhysicsTypeAmmo {
				continue
			}

			// Запрашиваем состояние объекта из физического движка
			resp, err := physicsClient.GetObjectState(context.Background(), &pb.GetObjectStateRequest{
				Id: obj.ID,
			})

			if err != nil {
				log.Printf("[Go] Ошибка получения состояния для %s: %v", obj.ID, err)
				continue
			}

			// Проверяем, что получен ответ с состоянием
			if resp.Status != "OK" || resp.State == nil {
				continue
			}

			// Создаем Vector3 и Quaternion из ответа сервера
			position := world.Vector3{
				X: resp.State.Position.X,
				Y: resp.State.Position.Y,
				Z: resp.State.Position.Z,
			}

			rotation := world.Quaternion{
				X: resp.State.Rotation.X,
				Y: resp.State.Rotation.Y,
				Z: resp.State.Rotation.Z,
				W: resp.State.Rotation.W,
			}

			// Отправляем обновление позиции и вращения
			if err := serializer.SendUpdateForObject(wsWriter, obj.ID, position, rotation); err != nil {
				log.Printf("[Go] Ошибка отправки обновления для %s: %v", obj.ID, err)
			}
		}
	}
}

// wsHandler обрабатывает WebSocket соединения
func wsHandler(w http.ResponseWriter, r *http.Request,
	physicsClient pb.PhysicsClient,
	worldManager *world.Manager,
	serializer *serialize.WorldSerializer) {

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println("[Go] Upgrade error:", err)
		return
	}

	// Создаем SafeWriter для безопасной работы с WebSocket
	wsWriter := ws.NewSafeWriter(conn)
	defer wsWriter.Close()

	// Отправляем существующие объекты клиенту
	if err := serializer.SendCreateForAllObjects(wsWriter); err != nil {
		log.Printf("[Go] Ошибка при отправке существующих объектов: %v", err)
		return
	}

	// Стримим состояние объектов
	go streamStates(wsWriter, physicsClient, serializer, worldManager)

	// Обрабатываем входящие сообщения
	for {
		_, message, err := conn.ReadMessage()
		if err != nil {
			log.Println("[Go] WS read error:", err)
			break
		}

		// Декодируем сообщение
		var input struct {
			Type       string `json:"type"`
			Cmd        string `json:"cmd,omitempty"`
			ClientTime int64  `json:"client_time,omitempty"`
			PlayerId   string `json:"player_id,omitempty"`
		}

		if err := json.Unmarshal(message, &input); err != nil {
			log.Printf("[Go] Ошибка декодирования сообщения: %v", err)
			continue
		}

		// Обрабатываем различные типы сообщений
		switch input.Type {
		case "ping":
			// Отправляем pong с временной меткой сервера и клиента
			serverTime := time.Now().UnixNano() / int64(time.Millisecond)
			pongMsg := map[string]interface{}{
				"type":        "pong",
				"client_time": input.ClientTime,
				"server_time": serverTime,
			}

			if err := wsWriter.WriteJSON(pongMsg); err != nil {
				log.Printf("[Go] Ошибка отправки pong: %v", err)
				continue
			}

			log.Printf("[Go] Отправлен pong, время сервера: %d, время клиента: %d",
				serverTime, input.ClientTime)

		case "cmd":
			// Обрабатываем команды управления
			var impulse pb.Vector3
			switch input.Cmd {
			case "LEFT":
				impulse.X = -5
			case "RIGHT":
				impulse.X = 5
			case "UP":
				impulse.Z = -5
			case "DOWN":
				impulse.Z = 5
			case "SPACE":
				impulse.Y = 10
			default:
				log.Printf("[Go] Неизвестная команда: %s", input.Cmd)
				continue
			}

			// Получаем все объекты из менеджера мира
			worldObjects := worldManager.GetAllWorldObjects()

			// Счетчик успешно обработанных объектов
			successCount := 0

			// Применяем импульс ко всем объектам, кроме типа ammo
			for _, obj := range worldObjects {
				// Пропускаем объекты, которые обрабатываются только на клиенте
				if obj.PhysicsType == world.PhysicsTypeAmmo {
					continue
				}

				// Применяем импульс к объекту через Bullet Physics
				_, err := physicsClient.ApplyImpulse(context.Background(), &pb.ApplyImpulseRequest{
					Id:      obj.ID,
					Impulse: &impulse,
				})

				if err != nil {
					log.Printf("[Go] Ошибка применения импульса к %s: %v", obj.ID, err)
					continue
				}

				successCount++
				log.Printf("[Go] Применен импульс к %s: (%f, %f, %f)",
					obj.ID, impulse.X, impulse.Y, impulse.Z)
			}

			log.Printf("[Go] Применен импульс к %d объектам с типами физики bullet и both", successCount)

			// Отправляем подтверждение обработки команды с временными метками
			serverTime := time.Now().UnixNano() / int64(time.Millisecond)
			ackMsg := map[string]interface{}{
				"type":        "cmd_ack",
				"cmd":         input.Cmd,
				"client_time": input.ClientTime,
				"server_time": serverTime,
				"player_id":   "ALL",
				"count":       successCount,
			}

			if err := wsWriter.WriteJSON(ackMsg); err != nil {
				log.Printf("[Go] Ошибка отправки подтверждения команды: %v", err)
			}

		default:
			log.Printf("[Go] Получен неизвестный тип сообщения: %s", input.Type)
		}
	}
}

// Основная функция
func main() {
	ctx := context.Background()

	// Инициализация физического клиента
	physicsClient, err := transport.NewPhysicsClient(ctx, "localhost:50051")
	if err != nil {
		log.Fatalf("Failed to create physics client: %v", err)
	}
	defer physicsClient.Close()

	// Создаем менеджер игрового мира
	worldManager := world.NewManager()

	// Создаем фабрику объектов
	factory := world.NewFactory(worldManager, physicsClient)

	// Создаем сериализатор
	serializer := serialize.NewWorldSerializer(worldManager)

	// Создаем тестовые объекты
	testObjectsCreator := world.NewTestObjectsCreator(factory)
	testObjectsCreator.CreateAll(50.0) // Используем максимальную высоту 50.0

	// Настройка HTTP маршрутов
	http.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
		wsHandler(w, r, physicsClient, worldManager, serializer)
	})

	// Специальный обработчик для файлов Ammo.js
	http.HandleFunc("/ammo/", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/javascript")
		w.Header().Set("Access-Control-Allow-Origin", "*")

		// Добавляем заголовки для кэширования
		w.Header().Set("Cache-Control", "public, max-age=31536000")
		w.Header().Set("Vary", "Accept-Encoding")

		// Путь к статическим файлам
		staticDir := "../../../dist"
		http.ServeFile(w, r, staticDir+r.URL.Path)
	})

	// Добавим проверку существования директории
	staticDir := "../../../dist"
	if _, err := os.Stat(staticDir); os.IsNotExist(err) {
		log.Printf("Warning: Directory %s does not exist", staticDir)
	}

	// Обработчик для остальных статических файлов
	fs := http.FileServer(http.Dir(staticDir))
	http.Handle("/", http.StripPrefix("/", fs))

	log.Printf("Serving static files from: %s\n", staticDir)
	log.Println("Server starting on :8080")
	if err := http.ListenAndServe(":8080", nil); err != nil {
		log.Fatal(err)
	}
}
