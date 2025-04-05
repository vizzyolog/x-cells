// camera.js
import * as THREE from 'three';
import { objects } from './objects';
import { getArrowDirection } from './gamepad';

// Объявляем камеру
export let camera;

// Настройки камеры
const CAMERA_HEIGHT = 100; // Высота камеры над объектом
const CAMERA_DISTANCE = 100; // Расстояние камеры от объекта
const SMOOTH_FACTOR = 0.05; // Фактор плавности движения
const ROTATION_SMOOTH_FACTOR = 0.03; // Фактор плавности поворота
const DEAD_ZONE_ANGLE = 0.3; // Мертвая зона в радианах (примерно 17 градусов)
const MIN_Y_ANGLE = -0.5; // Минимальный угол по вертикали (в радианах)
const MAX_Y_ANGLE = 0.5; // Максимальный угол по вертикали (в радианах)

const PLAYER_ID = "mainPlayer1"; // Жестко закрепляем ID игрока

// Сохраняем последнюю известную позицию и направление игрока
let lastKnownPosition = new THREE.Vector3(0, 0, 0);
let lastCameraPosition = new THREE.Vector3(0, CAMERA_HEIGHT, CAMERA_DISTANCE);
let lastCameraDirection = new THREE.Vector3(0, 0, -1); // Начальное направление камеры
let targetCameraDirection = new THREE.Vector3(0, 0, -1);
let cameraTarget = new THREE.Vector3(); // Промежуточная точка для сглаживания
let lastArrowDirection = new THREE.Vector3(0, 0, 1); // Последнее направление стрелки

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

export function updateCamera() {
    if (!camera) return;
    
    // Ищем основного игрока
    const player = objects[PLAYER_ID];
    
    // Если игрок найден и имеет позицию, обновляем камеру
    if (player && player.mesh) {
        // Получаем текущую позицию игрока
        const currentPlayerPosition = player.mesh.position.clone();
        
        // Получаем направление arrowHelper (теперь включает Y компоненту)
        const arrowDirection = getArrowDirection();
        
        if (arrowDirection.length() > 0) {
            // Вычисляем угол между текущим направлением стрелки и последним сохраненным
            const angle = angleBetweenDirections(arrowDirection, lastArrowDirection);
            
            // Если угол больше мертвой зоны, обновляем целевое направление камеры
            if (angle > DEAD_ZONE_ANGLE) {
                // Создаем инвертированное направление для камеры (смотрим с противоположной стороны)
                // Сохраняем вертикальную составляющую, но с ограничениями
                const yComponent = Math.max(MIN_Y_ANGLE, Math.min(MAX_Y_ANGLE, -arrowDirection.y));
                
                // Устанавливаем новое целевое направление
                targetCameraDirection.set(-arrowDirection.x, yComponent, -arrowDirection.z).normalize();
                
                // Обновляем последнее известное направление стрелки
                lastArrowDirection.copy(arrowDirection);
                
                console.log(`[Camera] Изменение направления на ${angle.toFixed(2)} радиан, больше мертвой зоны ${DEAD_ZONE_ANGLE.toFixed(2)}`);
            }
        }
        
        // Плавно интерполируем направление камеры
        lastCameraDirection.lerp(targetCameraDirection, ROTATION_SMOOTH_FACTOR);
        lastCameraDirection.normalize();
        
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

// Debug-функция для вывода информации о камере
export function logCameraStatus() {
    if (!camera) return;
    
    console.log(`[Camera] Position: (${camera.position.x.toFixed(2)}, ${camera.position.y.toFixed(2)}, ${camera.position.z.toFixed(2)})`);
    console.log(`[Camera] Direction: (${lastCameraDirection.x.toFixed(2)}, ${lastCameraDirection.y.toFixed(2)}, ${lastCameraDirection.z.toFixed(2)})`);
    console.log(`[Camera] Arrow Direction: (${lastArrowDirection.x.toFixed(2)}, ${lastArrowDirection.y.toFixed(2)}, ${lastArrowDirection.z.toFixed(2)})`);
    console.log(`[Camera] Looking at: (${lastKnownPosition.x.toFixed(2)}, ${lastKnownPosition.y.toFixed(2)}, ${lastKnownPosition.z.toFixed(2)})`);
    
    // Проверяем наличие игрока
    const player = objects[PLAYER_ID];
    if (player && player.mesh) {
        console.log(`[Camera] Player found at: (${player.mesh.position.x.toFixed(2)}, ${player.mesh.position.y.toFixed(2)}, ${player.mesh.position.z.toFixed(2)})`);
    } else {
        console.log(`[Camera] Player with ID "${PLAYER_ID}" not found!`);
    }
} 