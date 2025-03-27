package world

import (
	"math"
)

// Константы для террейна
const (
	// Физические размеры террейна в мире
	TerrainPhysicalWidth = 1500.0
	TerrainPhysicalDepth = 15000.0

	// Размеры сетки террейна
	TerrainGridSize  = 128 // Одинаковая детализация для соответствия примеру three.js
	TerrainHalfWidth = TerrainGridSize / 2
	TerrainHalfDepth = TerrainGridSize / 2

	// Диапазон высот
	TerrainMinHeight = -50.0
	TerrainMaxHeight = 50.0 // Увеличиваем максимальную высоту для гор
)

// perlinNoise2D - утилита для шума Перлина
func perlinNoise2D(x, y float64) float64 {
	// Простая хеш-функция для псевдо-шума
	// В реальном приложении стоит использовать настоящую библиотеку шума Перлина
	h := x*12.9898 + y*78.233
	sinH := math.Sin(h)
	return math.Abs(sinH*43758.5453) - math.Floor(math.Abs(sinH*43758.5453))
}

// lerpValue - плавная интерполяция между a и b
func lerpValue(a, b, t float64) float64 {
	return a + t*(b-a)
}

// smoothstepValue - функция интерполяции для сглаживания
func smoothstepValue(t float64) float64 {
	return t * t * (3.0 - 2.0*t)
}

// getSmoothNoise - функция для получения сглаженного случайного шума
func getSmoothNoise(x, y float64) float64 {
	// Получаем целые координаты
	x0 := math.Floor(x)
	y0 := math.Floor(y)
	x1 := x0 + 1.0
	y1 := y0 + 1.0

	// Интерполяционные коэффициенты
	sx := smoothstepValue(x - x0)
	sy := smoothstepValue(y - y0)

	// Интерполяция между 4 углами
	n00 := perlinNoise2D(x0, y0)
	n10 := perlinNoise2D(x1, y0)
	n01 := perlinNoise2D(x0, y1)
	n11 := perlinNoise2D(x1, y1)

	// Билинейная интерполяция
	nx0 := lerpValue(n00, n10, sx)
	nx1 := lerpValue(n01, n11, sx)
	n := lerpValue(nx0, nx1, sy)

	return n
}

// GenerateTerrainData - Генерация данных террейна с шумом Перлина для гор
func GenerateTerrainData(w, h int) []float32 {
	data := make([]float32, w*h)

	// Параметры шума
	scales := []float64{1.0, 0.5, 0.25, 0.125, 0.0625}         // Разные масштабы для фрактального шума
	amplitudes := []float64{0.5, 0.25, 0.125, 0.0625, 0.03125} // Амплитуды для каждого масштаба

	// Расширяем диапазон высот для более драматичного рельефа
	heightRange := TerrainMaxHeight - TerrainMinHeight

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
		mountains[i].height = 0.5 + 0.5*math.Abs(perlinNoise2D(float64(i)*0.1, 0.5))  // Высота от 0.5 до 1.0
		mountains[i].radius = 5.0 + 15.0*math.Abs(perlinNoise2D(0.5, float64(i)*0.1)) // Радиус от 5 до 20
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
				noiseValue += getSmoothNoise(nx*scale*10.0, nz*scale*10.0) * amplitude
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
			height := elevation*heightRange + TerrainMinHeight

			// Сохраняем данные
			data[j*w+i] = float32(height)
		}
	}

	return data
}
