// camera.js
import * as THREE from 'three';
import { objects } from './objects';
import { scene } from './scene';

// Объявляем камеру
export let camera;

// Настройки камеры
const CAMERA_HEIGHT = 50; // Высота камеры над объектом
const CAMERA_DISTANCE = 100; // Расстояние камеры от объекта
const SMOOTH_FACTOR = 0.05; // Коэффициент интерполяции для плавного движения
const PLAYER_ID = "mainPlayer1"; // Жестко закрепляем ID игрока

// Сохраняем последнюю известную позицию игрока
let lastKnownPosition = new THREE.Vector3(0, 0, 0);
let cameraTarget = new THREE.Vector3(); // Промежуточная точка для сглаживания

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

export function updateCamera() {
    if (!camera) return;
    
    // Ищем основного игрока
    const player = objects[PLAYER_ID];
    
    // Если игрок найден и имеет позицию, обновляем камеру
    if (player && player.mesh) {
        // Сохраняем последнюю известную позицию
        lastKnownPosition.copy(player.mesh.position);
    }
    
    // Создаем вектор смещения для позиции камеры
    const offset = new THREE.Vector3(0, CAMERA_HEIGHT, CAMERA_DISTANCE);
    
    // Целевая позиция - это позиция игрока + смещение
    const targetPosition = lastKnownPosition.clone().add(offset);
    
    // Интерполируем промежуточную точку для сглаживания
    cameraTarget.lerp(targetPosition, SMOOTH_FACTOR);
    
    // Плавно перемещаем камеру в целевую позицию
    camera.position.lerp(cameraTarget, SMOOTH_FACTOR);
    
    // Камера всегда смотрит на позицию игрока
    camera.lookAt(lastKnownPosition);
}

// Debug-функция для вывода информации о камере
export function logCameraStatus() {
    if (!camera) return;
    
    console.log(`[Camera] Position: (${camera.position.x.toFixed(2)}, ${camera.position.y.toFixed(2)}, ${camera.position.z.toFixed(2)})`);
    console.log(`[Camera] Looking at: (${lastKnownPosition.x.toFixed(2)}, ${lastKnownPosition.y.toFixed(2)}, ${lastKnownPosition.z.toFixed(2)})`);
    
    // Проверяем наличие игрока
    const player = objects[PLAYER_ID];
    if (player && player.mesh) {
        console.log(`[Camera] Player found at: (${player.mesh.position.x.toFixed(2)}, ${player.mesh.position.y.toFixed(2)}, ${player.mesh.position.z.toFixed(2)})`);
    } else {
        console.log(`[Camera] Player with ID "${PLAYER_ID}" not found!`);
    }
} 