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

// Добавим новую переменную для сглаживания точки, на которую смотрит камера
let smoothLookAtTarget = new THREE.Vector3();

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
    
    const player = objects[PLAYER_ID];
    
    if (player && player.mesh) {
        const currentPlayerPosition = player.mesh.position.clone();
        const arrowDirection = getArrowDirection();
        
        // Плавно обновляем точку, на которую смотрит камера
        smoothLookAtTarget.lerp(currentPlayerPosition, SMOOTH_FACTOR);
        
        if (arrowDirection.length() > 0) {
            const angle = angleBetweenDirections(arrowDirection, lastArrowDirection);
            
            if (angle > DEAD_ZONE_ANGLE) {
                const yComponent = Math.max(MIN_Y_ANGLE, Math.min(MAX_Y_ANGLE, -arrowDirection.y));
                targetCameraDirection.set(-arrowDirection.x, yComponent, -arrowDirection.z).normalize();
                lastArrowDirection.copy(arrowDirection);
                turningActive = true;
            }
        }
        
        const adaptiveRotationFactor = calculateAdaptiveRotationFactor(lastMeasuredAngle, lastMeasuredDistance);
        lastCameraDirection.lerp(targetCameraDirection, adaptiveRotationFactor);
        lastCameraDirection.normalize();
        
        const horizontalDistance = CAMERA_DISTANCE * Math.cos(lastCameraDirection.y);
        const cameraOffset = new THREE.Vector3(
            lastCameraDirection.x * horizontalDistance,
            CAMERA_HEIGHT + lastCameraDirection.y * CAMERA_DISTANCE,
            lastCameraDirection.z * horizontalDistance
        );
        
        const targetPosition = currentPlayerPosition.clone().add(cameraOffset);
        cameraTarget.lerp(targetPosition, SMOOTH_FACTOR);
        camera.position.copy(cameraTarget);
        
        // Камера теперь смотрит на сглаженную позицию
        camera.lookAt(smoothLookAtTarget);
        
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