package service

import (
	"context"
	"fmt"
	"log"
	"math"
	"math/rand/v2"

	"x-cells/backend/internal/core/domain/entity"
	"x-cells/backend/internal/core/port/out/physics"
)

// WorldService реализует бизнес-логику для управления миром
type WorldService struct {
	world       *entity.World
	physicsPort physics.PhysicsPort
}

// NewWorldService создает новый экземпляр сервиса для работы с миром
func NewWorldService(physicsPort physics.PhysicsPort) *WorldService {
	return &WorldService{
		world:       entity.NewWorld(),
		physicsPort: physicsPort,
	}
}

// GetAllObjects возвращает все объекты в мире
func (s *WorldService) GetAllObjects() map[string]*entity.GameObject {
	return s.world.GetAllObjects()
}

// GetObject возвращает объект по его ID
func (s *WorldService) GetObject(id string) *entity.GameObject {
	return s.world.GetObject(id)
}

// CreateObject создает новый объект в мире и в физической симуляции
func (s *WorldService) CreateObject(ctx context.Context, object *entity.GameObject) error {
	// Добавляем объект в мир
	s.world.AddObject(object)

	// Если физический клиент доступен, создаем объект в физической симуляции
	if s.physicsPort != nil {
		req := &physics.CreateObjectRequest{
			ID:         object.ID,
			ObjectType: string(object.ObjectType),
			Position:   physics.Vector3{X: object.Position.X, Y: object.Position.Y, Z: object.Position.Z},
			Size:       object.Radius,
			Mass:       object.Mass,
			Color:      object.Color,
			Properties: object.Properties,
		}

		_, err := s.physicsPort.CreateObject(ctx, req)
		if err != nil {
			// Логируем ошибку, но не удаляем объект из мира
			log.Printf("Ошибка при создании физического объекта %s: %v", object.ID, err)
			return fmt.Errorf("ошибка при создании физического объекта: %w", err)
		}
	}

	log.Printf("Создан объект %s типа %s", object.ID, object.ObjectType)
	return nil
}

// RemoveObject удаляет объект из мира
func (s *WorldService) RemoveObject(id string) error {
	// Удаляем объект из мира
	s.world.RemoveObject(id)

	// TODO: Добавить удаление из физической симуляции, когда это будет поддерживаться

	log.Printf("Удален объект %s", id)
	return nil
}

// ApplyImpulse применяет импульс к объекту через физический движок
func (s *WorldService) ApplyImpulse(ctx context.Context, id string, direction entity.Vector3, strength float64) error {
	// Проверяем, существует ли объект
	obj := s.world.GetObject(id)
	if obj == nil {
		return fmt.Errorf("объект с ID %s не найден", id)
	}

	// Применяем импульс через физический клиент
	if s.physicsPort != nil {
		req := &physics.ApplyImpulseRequest{
			ID:        id,
			Direction: physics.Vector3{X: direction.X, Y: direction.Y, Z: direction.Z},
			Strength:  strength,
		}

		_, err := s.physicsPort.ApplyImpulse(ctx, req)
		if err != nil {
			log.Printf("Ошибка при применении импульса к объекту %s: %v", id, err)
			return fmt.Errorf("ошибка при применении импульса: %w", err)
		}
	}

	log.Printf("Применен импульс к объекту %s с силой %f", id, strength)
	return nil
}

// UpdateObjectPosition обновляет позицию объекта
func (s *WorldService) UpdateObjectPosition(id string, position entity.Vector3) error {
	if !s.world.UpdateObjectPosition(id, position) {
		return fmt.Errorf("объект с ID %s не найден", id)
	}

	// Здесь можно добавить дополнительную логику, например, проверку коллизий

	return nil
}

// UpdateObjectVelocity обновляет скорость объекта
func (s *WorldService) UpdateObjectVelocity(id string, velocity entity.Vector3) error {
	if !s.world.UpdateObjectVelocity(id, velocity) {
		return fmt.Errorf("объект с ID %s не найден", id)
	}

	return nil
}

// CreateObjectInBothPhysics создает объект в обоих физических движках
func (s *WorldService) CreateObjectInBothPhysics(obj *entity.GameObject) error {
	// Просто используем существующий метод
	ctx := context.Background()
	return s.CreateObject(ctx, obj)
}

// SyncObjectStates синхронизирует состояния объектов с физическим движком
func (s *WorldService) SyncObjectStates(ctx context.Context) {
	if s.physicsPort == nil {
		return
	}

	// Получаем все объекты из мира
	objects := s.world.GetAllObjects()

	for id, obj := range objects {
		// Пропускаем объекты типа террейн
		if obj.ObjectType == entity.TypeTerrain {
			continue
		}

		// Получаем актуальное состояние объекта из физического движка
		req := &physics.GetObjectStateRequest{ID: id}
		resp, err := s.physicsPort.GetObjectState(ctx, req)

		if err != nil {
			log.Printf("Ошибка при получении состояния объекта %s: %v", id, err)
			continue
		}

		// Обновляем позицию и скорость объекта
		s.world.UpdateObjectPosition(id, entity.Vector3{
			X: resp.Position.X,
			Y: resp.Position.Y,
			Z: resp.Position.Z,
		})

		s.world.UpdateObjectVelocity(id, entity.Vector3{
			X: resp.Velocity.X,
			Y: resp.Velocity.Y,
			Z: resp.Velocity.Z,
		})
	}
}

func (s *WorldService) CreateTerrain(ctx context.Context) (*entity.GameObject, error) {
	// Константы для террейна
	const (
		terrainGridSize  = 256
		terrainMinHeight = -30.0
		terrainMaxHeight = 30.0
	)

	// Генерируем данные о высоте для террейна
	heightData := generateTerrainData(terrainGridSize, terrainGridSize, terrainMinHeight, terrainMaxHeight)

	// Создаем террейн с использованием нового API
	terrain := entity.NewTerrain("terrain_1", map[string]interface{}{
		"position":     entity.Vector3{X: 0, Y: 0, Z: 0},
		"height_data":  heightData,
		"grid_width":   terrainGridSize,
		"grid_height":  terrainGridSize,
		"scale_x":      3.0,
		"scale_y":      3.0,
		"scale_z":      3.0,
		"min_height":   float32(terrainMinHeight),
		"max_height":   float32(terrainMaxHeight),
		"physics_type": "both", // Важно для двустороннего физического симулирования
		"mass":         0.0,    // Важно для статичности
	})

	// Создаём объект в обоих физических мирах
	if err := s.createObjectInPhysicsWorlds(ctx, terrain); err != nil {
		return nil, err
	}

	return terrain, nil
}

// Генерация данных террейна с шумом Перлина для гор
func generateTerrainData(w, h int, minHeight, maxHeight float64) []float32 {
	data := make([]float32, w*h)

	// Параметры шума
	scales := []float64{1.0, 0.5, 0.25, 0.125, 0.0625}         // Разные масштабы для фрактального шума
	amplitudes := []float64{0.5, 0.25, 0.125, 0.0625, 0.03125} // Амплитуды для каждого масштаба

	// Расширяем диапазон высот для более драматичного рельефа
	heightRange := maxHeight - minHeight

	// Добавляем кратеры и горы
	// centerX := float64(w) / 2.0
	// centerZ := float64(h) / 2.0

	// maxRadius := math.Min(centerX, centerZ) * 0.8 // Радиус основного ландшафта

	// Создаем несколько гор в случайных местах
	numMountains := 20
	mountains := make([]struct{ x, z, height, radius float64 }, numMountains)

	for i := 0; i < numMountains; i++ {
		mountains[i].x = rand.Float64() * float64(w)
		mountains[i].z = rand.Float64() * float64(h)
		mountains[i].height = 0.1 + 1*math.Abs(noise2D(float64(i)*0.1, 0.5))
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
			// distanceFromCenter := math.Sqrt(math.Pow(float64(i)-centerX, 2) + math.Pow(float64(j)-centerZ, 2))
			// if distanceFromCenter > maxRadius {
			// 	// За пределами основного радиуса создаем понижение
			// 	edgeFactor := (distanceFromCenter - maxRadius) / (math.Max(centerX, centerZ) - maxRadius)
			// 	edgeFactor = math.Min(1.0, edgeFactor) // Ограничиваем множитель до 1
			// 	elevation -= edgeFactor * 0.5          // Понижаем высоту к краям
			// }

			// Масштабируем в нужный диапазон высот
			height := elevation*heightRange + minHeight

			// Сохраняем данные
			data[j*w+i] = float32(height)
		}
	}

	return data
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

// Реализуйте метод createObjectInPhysicsWorlds
func (s *WorldService) createObjectInPhysicsWorlds(ctx context.Context, obj *entity.GameObject) error {
	// Создаем объект через physicsPort
	req := &physics.CreateObjectRequest{
		ID:         obj.ID,
		ObjectType: string(obj.ObjectType),
		Position:   physics.Vector3{X: obj.Position.X, Y: obj.Position.Y, Z: obj.Position.Z},
		Size:       obj.Radius,
		Mass:       obj.Mass,
		Properties: obj.Properties,
	}

	_, err := s.physicsPort.CreateObject(ctx, req)
	return err
}
