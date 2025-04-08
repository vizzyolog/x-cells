// camera.js
import * as THREE from 'three';
import { objects } from './objects';
import { getArrowDirection } from './gamepad';

// Объявляем камеру
export let camera;

// Настройки камеры - оставляем оригинальные значения
const CAMERA_HEIGHT = 100;
const CAMERA_DISTANCE = 100;
const SMOOTH_FACTOR = 0.05;
const ROTATION_SMOOTH_FACTOR = 0.03;
const DEAD_ZONE_ANGLE = 0.3;
const MIN_Y_ANGLE = -0.5;
const MAX_Y_ANGLE = 0.5;

// Дополнительные настройки для адаптивного доворота
const MIN_ADAPTIVE_FACTOR = 0.01;   // Минимальный фактор доворота
const MAX_ADAPTIVE_FACTOR = 0.12;   // Максимальный фактор для быстрых поворотов
const QUADRATIC_FACTOR = 0.9;       // Коэффициент квадратичной зависимости (0-1)

// Внутренняя переменная для хранения текущего значения коэффициента
let currentQuadraticFactor = QUADRATIC_FACTOR;

const PLAYER_ID = "mainPlayer1"; // Жестко закрепляем ID игрока

// Сохраняем последнюю известную позицию и направление игрока
let lastKnownPosition = new THREE.Vector3(0, 0, 0);
let lastCameraPosition = new THREE.Vector3(0, CAMERA_HEIGHT, CAMERA_DISTANCE);
let lastCameraDirection = new THREE.Vector3(0, 0, -1); // Начальное направление камеры
let targetCameraDirection = new THREE.Vector3(0, 0, -1);
let cameraTarget = new THREE.Vector3(); // Промежуточная точка для сглаживания
let lastArrowDirection = new THREE.Vector3(0, 0, 1); // Последнее направление стрелки
let lastMeasuredAngle = 0; // Последний измеренный угол для логирования
let lastMeasuredDistance = 0; // Последнее измеренное расстояние для логирования
let turningActive = false; // Флаг активного поворота для логирования

export function initCamera() {
    // Создаем камеру
    camera = new THREE.PerspectiveCamera(
        60,
        window.innerWidth / window.innerHeight,
        0.2,
        2000
    );
    
    // Устанавливаем начальную позицию
    camera.position.set(0, CAMERA_HEIGHT, CAMERA_DISTANCE);
    camera.lookAt(0, 0, 0);
    
    // Добавляем обработчик изменения размера окна
    window.addEventListener('resize', onWindowResize);
    
    // Инициализируем значение currentQuadraticFactor
    currentQuadraticFactor = QUADRATIC_FACTOR;
    
    console.log("[Camera] Камера инициализирована");
    return camera;
}

function onWindowResize() {
    if (!camera) return;
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
}

// Функция для вычисления угла между двумя направлениями в 3D
function angleBetweenDirections(dir1, dir2) {
    // Нормализуем векторы для корректного вычисления угла
    const v1 = dir1.clone().normalize();
    const v2 = dir2.clone().normalize();
    
    // Вычисляем угол между векторами
    return Math.acos(Math.min(1, Math.max(-1, v1.dot(v2))));
}

// Функция для вычисления адаптивного фактора доворота с квадратичной зависимостью
function calculateAdaptiveRotationFactor(angle, distance) {
    // Нормализуем расстояние (предполагаем, что максимальное значимое расстояние - 100)
    const normalizedDistance = Math.min(distance, 100) / 100;
    
    // Вычисляем относительную скорость поворота с учетом угла
    const angleRatio = angle / DEAD_ZONE_ANGLE;
    
    // Применяем квадратичную зависимость от расстояния с настраиваемым коэффициентом
    // Когда currentQuadraticFactor = 0, зависимость линейная
    // Когда currentQuadraticFactor = 1, зависимость полностью квадратичная
    const distanceFactor = normalizedDistance * (1 - currentQuadraticFactor) + 
                          Math.pow(normalizedDistance, 2) * currentQuadraticFactor;
    
    // Комбинируем факторы угла и расстояния
    const combinedFactor = angleRatio * distanceFactor;
    
    // Интерполируем между минимальным и максимальным факторами доворота
    const adaptiveFactor = MIN_ADAPTIVE_FACTOR + 
        (MAX_ADAPTIVE_FACTOR - MIN_ADAPTIVE_FACTOR) * 
        Math.min(1.0, combinedFactor);
    
    return adaptiveFactor;
}

export function updateCamera() {
    if (!camera) return;
    
    // Ищем основного игрока
    const player = objects[PLAYER_ID];
    
    // Если игрок найден и имеет позицию, обновляем камеру
    if (player && player.mesh) {
        // Получаем текущую позицию игрока
        const currentPlayerPosition = player.mesh.position.clone();
        
        // Получаем направление arrowHelper и его свойства
        const arrowDirection = getArrowDirection();
        
        // Получаем расстояние из userData (если доступно)
        let distance = 0;
        if (arrowDirection.userData && arrowDirection.userData.distance) {
            distance = arrowDirection.userData.distance;
            lastMeasuredDistance = distance; // Сохраняем для логирования
        }
        
        if (arrowDirection.length() > 0) {
            // Вычисляем угол между текущим направлением стрелки и последним сохраненным
            const angle = angleBetweenDirections(arrowDirection, lastArrowDirection);
            lastMeasuredAngle = angle; // Сохраняем для логирования
            
            // Если угол больше мертвой зоны, обновляем целевое направление камеры
            if (angle > DEAD_ZONE_ANGLE) {
                // Создаем инвертированное направление для камеры (смотрим с противоположной стороны)
                // Сохраняем вертикальную составляющую, но с ограничениями
                const yComponent = Math.max(MIN_Y_ANGLE, Math.min(MAX_Y_ANGLE, -arrowDirection.y));
                
                // Устанавливаем новое целевое направление
                targetCameraDirection.set(-arrowDirection.x, yComponent, -arrowDirection.z).normalize();
                
                // Обновляем последнее известное направление стрелки
                lastArrowDirection.copy(arrowDirection);
                
                // Устанавливаем флаг активного поворота
                turningActive = true;
                
                // Логируем начало поворота
                console.log(`[Camera] Начало поворота: угол=${angle.toFixed(2)} рад (${(angle * 180 / Math.PI).toFixed(1)}°), расстояние=${distance.toFixed(1)}, превышение мертвой зоны ${(angle - DEAD_ZONE_ANGLE).toFixed(2)} рад`);
            }
        }
        
        // Вычисляем адаптивный фактор доворота с учетом квадратичной зависимости от расстояния
        const adaptiveRotationFactor = calculateAdaptiveRotationFactor(lastMeasuredAngle, lastMeasuredDistance);
        
        // Плавно интерполируем направление камеры с адаптивным фактором
        const oldDirection = lastCameraDirection.clone(); // Сохраняем старое направление для сравнения
        lastCameraDirection.lerp(targetCameraDirection, adaptiveRotationFactor);
        lastCameraDirection.normalize();
        
        // Вычисляем угол изменения направления камеры для логирования
        const directionChangeAngle = angleBetweenDirections(oldDirection, lastCameraDirection);
        
        // Логируем процесс доворота, если он активен
        if (turningActive && directionChangeAngle > 0.01) { // Порог для отсечения незначительных изменений
            console.log(`[Camera] Доворот: изменение=${directionChangeAngle.toFixed(3)} рад, адаптивный фактор=${adaptiveRotationFactor.toFixed(3)}, расстояние=${lastMeasuredDistance.toFixed(1)}, кв.фактор=${currentQuadraticFactor.toFixed(2)}`);
            
            // Если камера почти довернулась до целевого направления, завершаем поворот
            if (angleBetweenDirections(lastCameraDirection, targetCameraDirection) < 0.05) {
                console.log('[Camera] Поворот завершен');
                turningActive = false;
            }
        }
        
        // Учитываем вертикальную составляющую при расчете смещения камеры
        const horizontalDistance = CAMERA_DISTANCE * Math.cos(lastCameraDirection.y);
        
        // Вычисляем позицию камеры с учетом вертикальной составляющей направления
        const cameraOffset = new THREE.Vector3(
            lastCameraDirection.x * horizontalDistance,
            CAMERA_HEIGHT + lastCameraDirection.y * CAMERA_DISTANCE, // Добавляем вертикальное смещение
            lastCameraDirection.z * horizontalDistance
        );
        
        // Целевая позиция камеры - это позиция игрока + смещение камеры
        const targetPosition = currentPlayerPosition.clone().add(cameraOffset);
        
        // Интерполируем позицию камеры для плавности
        cameraTarget.lerp(targetPosition, SMOOTH_FACTOR);
        camera.position.copy(cameraTarget);
        
        // Направляем камеру на игрока
        camera.lookAt(currentPlayerPosition);
        
        // Сохраняем текущую позицию игрока для следующего кадра
        lastKnownPosition.copy(currentPlayerPosition);
    }
}

// Функция для изменения коэффициента квадратичной зависимости
export function setQuadraticFactor(value) {
    // Ограничиваем значение от 0 до 1
    const newValue = Math.max(0, Math.min(1, value));
    console.log(`[Camera] Изменение коэффициента квадратичной зависимости: ${currentQuadraticFactor.toFixed(2)} -> ${newValue.toFixed(2)}`);
    currentQuadraticFactor = newValue;
    return newValue;
}

// Функция для получения текущего коэффициента квадратичной зависимости
export function getQuadraticFactor() {
    return currentQuadraticFactor;
}

// Debug-функция для вывода расширенной информации о камере
export function logCameraStatus() {
    if (!camera) return;
    
    console.log(`[Camera] Position: (${camera.position.x.toFixed(2)}, ${camera.position.y.toFixed(2)}, ${camera.position.z.toFixed(2)})`);
    console.log(`[Camera] Direction: (${lastCameraDirection.x.toFixed(2)}, ${lastCameraDirection.y.toFixed(2)}, ${lastCameraDirection.z.toFixed(2)})`);
    console.log(`[Camera] Target Direction: (${targetCameraDirection.x.toFixed(2)}, ${targetCameraDirection.y.toFixed(2)}, ${targetCameraDirection.z.toFixed(2)})`);
    console.log(`[Camera] Arrow Direction: (${lastArrowDirection.x.toFixed(2)}, ${lastArrowDirection.y.toFixed(2)}, ${lastArrowDirection.z.toFixed(2)})`);
    console.log(`[Camera] Looking at: (${lastKnownPosition.x.toFixed(2)}, ${lastKnownPosition.y.toFixed(2)}, ${lastKnownPosition.z.toFixed(2)})`);
    console.log(`[Camera] Turning Active: ${turningActive}, Last Angle: ${lastMeasuredAngle.toFixed(3)} рад (${(lastMeasuredAngle * 180 / Math.PI).toFixed(1)}°)`);
    console.log(`[Camera] Last Distance: ${lastMeasuredDistance.toFixed(1)}, Quadratic Factor: ${currentQuadraticFactor.toFixed(2)}, Default: ${QUADRATIC_FACTOR.toFixed(2)}`);
    console.log(`[Camera] Adaptive Factor: ${calculateAdaptiveRotationFactor(lastMeasuredAngle, lastMeasuredDistance).toFixed(3)}`);
    
    // Проверяем наличие игрока
    const player = objects[PLAYER_ID];
    if (player && player.mesh) {
        console.log(`[Camera] Player found at: (${player.mesh.position.x.toFixed(2)}, ${player.mesh.position.y.toFixed(2)}, ${player.mesh.position.z.toFixed(2)})`);
    } else {
        console.log(`[Camera] Player with ID "${PLAYER_ID}" not found!`);
    }
} 