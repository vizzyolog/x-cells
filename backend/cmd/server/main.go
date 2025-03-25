package main

import (
	"context"
	"log"
	"math"
	"net/http"
	"os"
	"sync"
	"time"

	"github.com/gorilla/websocket"

	pb "x-cells/backend/internal/physics/generated"
	"x-cells/backend/internal/transport"
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

// Стриминг состояния объектов
func streamStates(ws *websocket.Conn, client pb.PhysicsClient) {
	ticker := time.NewTicker(50 * time.Millisecond)
	defer ticker.Stop()

	for range ticker.C {
		objectsMutex.Lock()
		for _, obj := range objects {
			// Запрашиваем состояние у C++
			stateResp, err := client.GetObjectState(context.Background(), &pb.GetObjectStateRequest{
				Id: obj.ID,
			})
			if err != nil {
				log.Printf("[Go] Ошибка получения состояния: %v", err)
				continue
			}

			if stateResp.Status == "OK" && stateResp.State != nil {
				// Отправляем обновление клиенту
				msg := map[string]interface{}{
					"type": "update",
					"id":   obj.ID,
					"x":    stateResp.State.Position.X,
					"y":    stateResp.State.Position.Y,
					"z":    stateResp.State.Position.Z,
					"qx":   stateResp.State.Rotation.X,
					"qy":   stateResp.State.Rotation.Y,
					"qz":   stateResp.State.Rotation.Z,
					"qw":   stateResp.State.Rotation.W,
				}
				if err := ws.WriteJSON(msg); err != nil {
					log.Printf("[Go] Ошибка отправки JSON: %v", err)
					objectsMutex.Unlock()
					return
				}
			}
		}
		objectsMutex.Unlock()
	}
}

// Обработка WebSocket соединений
func wsHandler(w http.ResponseWriter, r *http.Request, client pb.PhysicsClient) {
	ws, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println("[Go] Upgrade error:", err)
		return
	}
	defer ws.Close()

	// Отправляем существующие объекты клиенту
	if err := sendCreateForAllObjects(ws); err != nil {
		log.Println("[Go] sendCreateForAllObjects error:", err)
		return
	}

	sphereObj1 := &Object{
		ID:         "mainPlayer1",
		ObjectType: "sphere",
		X:          0,
		Y:          terrainMaxHeight + 50, // Размещаем выше максимальной высоты террейна
		Z:          0,
		Mass:       float32(1.0),
		Radius:     float32(1.0),
		Color:      "#ff0000",
		PhysicsBy:  "both",
	}
	createObjectInGo(sphereObj1, client)

	if err := ws.WriteJSON(sphereObj1); err != nil {
		log.Println("[Go] Error sending sphere creation message:", err)
		return
	}

	// sphereObj2 := &Object{
	// 	ID:         "mainPlayer2",
	// 	ObjectType: "sphere",
	// 	X:          0,
	// 	Y:          terrainMaxHeight + 50, // Размещаем выше максимальной высоты террейна
	// 	Z:          0,
	// 	Mass:       float32(1.0),
	// 	Radius:     float32(1.0),
	// 	Color:      "#00ff00",
	// 	PhysicsBy:  "bullet",
	// }
	// createObjectInGo(sphereObj2, client)

	// if err := ws.WriteJSON(sphereObj2); err != nil {
	// 	log.Println("[Go] Error sending sphere creation message:", err)
	// 	return
	// }

	// sphereObj3 := &Object{
	// 	ID:         "mainPlayer3",
	// 	ObjectType: "sphere",
	// 	X:          0,
	// 	Y:          terrainMaxHeight + 50, // Размещаем выше максимальной высоты террейна
	// 	Z:          0,
	// 	Mass:       float32(1.0),
	// 	Radius:     float32(1.0),
	// 	Color:      "#0000ff",
	// 	PhysicsBy:  "ammo",
	// }
	// createObjectInGo(sphereObj3, client)

	// if err := ws.WriteJSON(sphereObj3); err != nil {
	// 	log.Println("[Go] Error sending sphere creation message:", err)
	// 	return
	// }

	// Стримим состояние объектов
	go streamStates(ws, client)

	// Обрабатываем входящие команды
	for {
		var input struct {
			Type string `json:"type"`
			Cmd  string `json:"cmd,omitempty"`
		}
		if err := ws.ReadJSON(&input); err != nil {
			log.Println("[Go] WS read error:", err)
			break
		}

		// Обработка команд
		if input.Type == "cmd" {
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
			}

			// Применяем импульс только к серверной сфере
			_, err := client.ApplyImpulse(context.Background(), &pb.ApplyImpulseRequest{
				Id:      "mainPlayer1",
				Impulse: &impulse,
			})
			if err != nil {
				log.Printf("[Go] Ошибка применения импульса: %v", err)
			} else {
				log.Printf("[Go] Применен импульс к mainPlayer1: (%f, %f, %f)",
					impulse.X, impulse.Y, impulse.Z)
			}

			_, err2 := client.ApplyImpulse(context.Background(), &pb.ApplyImpulseRequest{
				Id:      "mainPlayer2",
				Impulse: &impulse,
			})
			if err2 != nil {
				log.Printf("[Go] Ошибка применения импульса: %v", err2)
			} else {
				log.Printf("[Go] Применен импульс к mainPlayer2: (%f, %f, %f)",
					impulse.X, impulse.Y, impulse.Z)
			}

			_, err3 := client.ApplyImpulse(context.Background(), &pb.ApplyImpulseRequest{
				Id:      "mainPlayer3",
				Impulse: &impulse,
			})
			if err3 != nil {
				log.Printf("[Go] Ошибка применения импульса mainPlayer3: %v", err3)
			} else {
				log.Printf("[Go] Применен импульс к mainPlayer3: (%f, %f, %f)",
					impulse.X, impulse.Y, impulse.Z)
			}
		}
	}
}

func sendCreateForAllObjects(ws *websocket.Conn) error {
	objectsMutex.Lock()
	defer objectsMutex.Unlock()

	// for _, obj := range objects {
	// 	if obj.ObjectType == "tree" {
	// 		tree := generateTree(obj.X, obj.Z) // Генерируем дерево из текущего объекта
	// 		if err := sendCreateTree(ws, tree); err != nil {
	// 			return err
	// 		}
	// 	}
	// }

	for _, obj := range objects {
		msg := map[string]interface{}{
			"type":        "create",
			"id":          obj.ID,
			"object_type": obj.ObjectType,
			"x":           obj.X,
			"y":           obj.Y,
			"z":           obj.Z,
			"mass":        obj.Mass,
			"radius":      obj.Radius,
			"width":       obj.Width,
			"height":      obj.Height,
			"depth":       obj.Depth,
			"color":       obj.Color,
			"physics_by":  obj.PhysicsBy,
		}
		if obj.ObjectType == "terrain" {
			msg["height_data"] = obj.HeightData
			msg["heightmap_w"] = obj.HeightmapW
			msg["heightmap_h"] = obj.HeightmapH
			msg["scale_x"] = obj.ScaleX
			msg["scale_y"] = obj.ScaleY
			msg["scale_z"] = obj.ScaleZ
			msg["min_height"] = obj.MinHeight
			msg["max_height"] = obj.MaxHeight
		}

		if err := ws.WriteJSON(msg); err != nil {
			return err
		}
	}

	return nil
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

	// Создаем террейн
	terrainData := generateTerrainData(terrainGridSize, terrainGridSize)
	terrain := &Object{
		ID:         "terrain1",
		ObjectType: "terrain",
		X:          0,
		Y:          0,
		Z:          0,
		HeightData: terrainData,
		HeightmapW: terrainGridSize,
		HeightmapH: terrainGridSize,
		Color:      "#5c8a50",
		Mass:       0,
		ScaleX:     float32(terrainPhysicalWidth / float64(terrainGridSize-1)),
		ScaleY:     1.0,
		ScaleZ:     float32(terrainPhysicalDepth / float64(terrainGridSize-1)),
		MinHeight:  terrainMinHeight,
		MaxHeight:  terrainMaxHeight,
		PhysicsBy:  "both",
	}
	createObjectInGo(terrain, physicsClient)

	// Генерируем деревья
	//generateTrees(50)

	// Настройка HTTP маршрутов
	http.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
		wsHandler(w, r, physicsClient)
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
