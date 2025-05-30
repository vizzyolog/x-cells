package world

import (
	"log"
	"math"
	"math/rand/v2"
)

// TestObjectsCreator создает тестовые объекты для демонстрации
type TestObjectsCreator struct {
	factory *Factory
}

// NewTestObjectsCreator создает новый экземпляр TestObjectsCreator
func NewTestObjectsCreator(factory *Factory) *TestObjectsCreator {
	return &TestObjectsCreator{
		factory: factory,
	}
}

// CreateAll создает все тестовые объекты
func (t *TestObjectsCreator) CreateAll(terrainMaxHeight float32) {
	t.CreateTerrain()
	t.CreateTestSpheres(terrainMaxHeight)
}

// CreateTerrain создает тестовый террейн
func (t *TestObjectsCreator) CreateTerrain() {
	// Константы для террейна
	const (
		// Размеры сетки террейна
		terrainGridSize = 256

		// Диапазон высот
		terrainMinHeight = -30.0
		terrainMaxHeight = 30.0
	)

	// Генерируем данные о высоте для террейна
	heightData := generateTerrainData(terrainGridSize, terrainGridSize, terrainMinHeight, terrainMaxHeight)

	// Создаем террейн
	terrain := NewTerrain(
		"terrain_1",
		Vector3{X: 0, Y: 0, Z: 0},
		heightData,
		terrainGridSize,
		terrainGridSize,
		3.0,
		3.0,
		3.0,
		float32(terrainMinHeight),
		float32(terrainMaxHeight),
	)

	// Явно устанавливаем тип физики для террейна (и на клиенте, и на сервере)
	terrain.PhysicsType = PhysicsTypeBoth

	// Создаем объект в клиентской физике (Ammo)
	if err := t.factory.CreateObjectInAmmo(terrain); err != nil {
		log.Printf("[World] Ошибка при создании террейна в Ammo: %v", err)
	}

	// Создаем объект в серверной физике (Bullet)
	if err := t.factory.CreateObjectBullet(terrain); err != nil {
		log.Printf("[World] Ошибка при создании террейна в Bullet: %v", err)
	}
}

// CreateTestSpheres создает тестовые сферы с разными типами физики
func (t *TestObjectsCreator) CreateTestSpheres(terrainMaxHeight float32) {
	// Все игроки теперь создаются динамически при подключении клиентов
	// Статические тестовые объекты больше не создаются

	log.Printf("[World] Тестовые сферы игроков не создаются - все игроки создаются динамически при подключении")
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
