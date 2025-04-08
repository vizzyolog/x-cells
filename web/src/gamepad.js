import * as THREE from 'three';
import { physicsConfig } from './physics';
import { sendData } from './network';
import { applyImpulseToSphere, applySpeedLimits, getPhysicsConfig } from './physics.js';

// Константы для настройки поведения
const DEBUG_MODE = true; // Включает/выключает отладочные элементы (arrowHelper)
const MIN_ARROW_LENGTH = 10;
const MAX_ARROW_LENGTH = 50;
const SEND_INTERVAL = 40; // Интервал отправки данных в мс
const ARROW_HEIGHT_OFFSET = 2; // Высота смещения стрелки
const RAY_UPDATE_INTERVAL = 50; // Интервал обновления луча при движении камеры (мс)

let arrowHelper;
let lastSentPosition = new THREE.Vector3();
let lastSendTime = 0;
let raycaster = new THREE.Raycaster();
let mouse = new THREE.Vector2();
let cameraLastPosition = new THREE.Vector3();
let lastRayUpdateTime = 0;
let lastIntersectPoint = new THREE.Vector3();
let isMouseActive = false; // Флаг активности мыши над игровой областью

// Состояние клавиш
let keyStates = {
    forward: false,
    backward: false,
    left: false,
    right: false,
    jump: false
};

// Переменные для хранения направления
let currentDirection = new THREE.Vector3();
let directionNeedsUpdate = false;
let terrainMeshRef = null;
let playerMeshRef = null;
let cameraRef = null;
let socketRef = null;

export function getArrowDirection() {
    return lastSentPosition.clone();
}

function initGamepad(camera, terrainMesh, playerMesh, socket, scene) {
    // Сохраняем ссылки на объекты для использования в других функциях
    terrainMeshRef = terrainMesh;
    playerMeshRef = playerMesh;
    cameraRef = camera;
    socketRef = socket;
    cameraLastPosition.copy(camera.position);
    
    // Создаем и добавляем arrowHelper в сцену
    arrowHelper = new THREE.ArrowHelper(
        new THREE.Vector3(0, 0, 1), // Начальное направление
        playerMesh.position,        // Начальная позиция
        MIN_ARROW_LENGTH,          // Длина стрелки (начальная)
        0xffff00                    // Цвет стрелки
    );
    
    // Добавляем arrowHelper в сцену только если DEBUG_MODE включен
    if (DEBUG_MODE) {
        scene.add(arrowHelper);
        console.log("ArrowHelper initialized and added to scene");
    } else {
        console.log("ArrowHelper initialized but hidden (DEBUG_MODE is off)");
    }

    // Добавляем обработчики событий мыши и клавиатуры
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    
    // Запускаем анимацию для обновления стрелки и обработки клавиатурного ввода
    animate();

    function animate() {
        requestAnimationFrame(animate);
        
        // Обновляем стрелку если нужно и если она видима
        if (directionNeedsUpdate && DEBUG_MODE) {
            updateArrowHelper(playerMesh);
            directionNeedsUpdate = false;
        }
        
        // Проверяем, двигалась ли камера и нужно ли обновить луч
        const now = Date.now();
        if (isMouseActive && cameraRef && now - lastRayUpdateTime > RAY_UPDATE_INTERVAL) {
            // Если камера движется и мышь активна над игровой областью
            if (!cameraRef.position.equals(cameraLastPosition)) {
                // Обновляем луч с последних координат мыши
                updateRayFromLastMouse();
                cameraLastPosition.copy(cameraRef.position);
                lastRayUpdateTime = now;
            }
        }
        
        // Обрабатываем клавиатурное управление
        processKeyboardInput();
    }
    
    function processKeyboardInput() {
        // Проверяем, нажаты ли какие-либо клавиши
        const isAnyKeyPressed = Object.values(keyStates).some(state => state);
        
        // Текущее время
        const currentTime = Date.now();
        
        // Если какая-либо клавиша нажата И прошло достаточно времени с последней отправки
        if (isAnyKeyPressed && currentTime - lastSendTime > SEND_INTERVAL) {
            // Направление движения
            let dirX = 0, dirY = 0, dirZ = 0;
            
            // Рассчитываем направление на основе нажатых клавиш
            if (keyStates.forward) dirZ = -1;
            if (keyStates.backward) dirZ = 1;
            if (keyStates.left) dirX = -1;
            if (keyStates.right) dirX = 1;
            if (keyStates.jump) dirY = 1;
            
            // Нормализуем вектор направления (если не нулевой)
            const length = Math.sqrt(dirX * dirX + dirY * dirY + dirZ * dirZ);
            if (length > 0) {
                dirX /= length;
                dirY /= length;
                dirZ /= length;
                
                // Отправляем направление на сервер
                sendDirectionToServer(dirX, dirY, dirZ);
                
                // Обновляем время последней отправки
                lastSendTime = currentTime;
            }
        }
        
        // Продолжаем обработку в следующем кадре
        requestAnimationFrame(processKeyboardInput);
    }
    
    function onKeyDown(event) {
        updateKeyState(event.key, true);
    }
    
    function onKeyUp(event) {
        updateKeyState(event.key, false);
    }

    function onMouseMove(event) {
        // Обновляем координаты мыши
        mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
        
        // Устанавливаем флаг активности мыши
        isMouseActive = true;
        
        // Вызываем функцию обновления направления
        castRayAndUpdateDirection();
    }
    
    function updateRayFromLastMouse() {
        // Обновляем луч с текущими координатами мыши и новой позицией камеры
        castRayAndUpdateDirection();
    }
    
    function castRayAndUpdateDirection() {
        if (!cameraRef || !terrainMeshRef || !playerMeshRef || !socketRef) return;
        
        // Устанавливаем луч от камеры через координаты мыши
        raycaster.setFromCamera(mouse, cameraRef);
        
        // Находим пересечения с террейном
        const intersects = raycaster.intersectObjects([terrainMeshRef]);
    
        if (intersects.length > 0) {
            const targetPosition = intersects[0].point;
            lastIntersectPoint.copy(targetPosition);
            
            // Вычисляем направление в 3D пространстве (с учетом оси Y)
            currentDirection.set(
                targetPosition.x - playerMeshRef.position.x,
                targetPosition.y - playerMeshRef.position.y, // Учитываем высоту
                targetPosition.z - playerMeshRef.position.z
            );
            
            // Сохраняем длину до нормализации (расстояние от игрока до точки пересечения)
            const distance = currentDirection.length();
            
            // Нормализуем для получения направления
            currentDirection.normalize();
            
            // Запоминаем направление и расстояние
            lastSentPosition.copy(currentDirection);
            
            // Сохраняем исходное расстояние для использования в updateArrowHelper
            lastSentPosition.userData = { distance: distance };
            
            // Помечаем, что направление нужно обновить
            directionNeedsUpdate = true;
            
            // Проверяем, нужно ли отправлять данные на сервер
            if (Date.now() - lastSendTime > SEND_INTERVAL) {
                sendDirectionToServer(currentDirection.x, currentDirection.y, currentDirection.z);
                lastSendTime = Date.now();
            }
        }
    }

    function sendDirectionToServer(dirX, dirY, dirZ) {
        // Используем базовый импульс из конфигурации
        const physicsConfig = getPhysicsConfig();
        const keyForce = physicsConfig.baseImpulse * 1.5; // Увеличиваем базовый импульс для клавиатуры
        
        // Подготавливаем данные для отправки
        const data = {
            type: 'direction',
            direction: {
                x: dirX,
                y: dirY,
                z: dirZ
            },
            force: keyForce,
            distance: 0 // Для клавиатуры расстояние всегда 0
        };
        
        // Отправляем данные
        sendData(data);
    }

    // Обновление состояния клавиш
    function updateKeyState(key, isPressed) {
        switch(key.toLowerCase()) {
            case 'w': keyStates.forward = isPressed; break;
            case 's': keyStates.backward = isPressed; break;
            case 'a': keyStates.left = isPressed; break;
            case 'd': keyStates.right = isPressed; break;
            case ' ': keyStates.jump = isPressed; break;
        }
    }
}

// Функция для включения/выключения отображения arrowHelper
export function setDebugMode(enabled) {
    if (arrowHelper) {
        arrowHelper.visible = enabled;
        console.log(`ArrowHelper visibility set to ${enabled}`);
    }
}

// Функция для получения текущего статуса отладочного режима
export function getDebugMode() {
    return DEBUG_MODE;
}

// Обновляем позицию и направление arrowHelper
function updateArrowHelper(playerMesh) {
    if (arrowHelper) {
        // Позиция стрелки с учетом смещения по высоте
        const arrowPosition = new THREE.Vector3(
            playerMesh.position.x,
            playerMesh.position.y + ARROW_HEIGHT_OFFSET, // Поднимаем стрелку над игроком
            playerMesh.position.z
        );
        
        // Обновляем позицию стрелки
        arrowHelper.position.copy(arrowPosition);
        
        // Устанавливаем направление стрелки (теперь с учетом оси Y)
        arrowHelper.setDirection(lastSentPosition);
        
        // Используем сохраненное расстояние до точки пересечения
        const distance = lastSentPosition.userData ? lastSentPosition.userData.distance : MIN_ARROW_LENGTH;
        
        // Ограничиваем длину стрелки, чтобы она не была слишком большой или маленькой
        const arrowLength = Math.min(MAX_ARROW_LENGTH, Math.max(MIN_ARROW_LENGTH, distance));
        
        // Устанавливаем длину стрелки пропорционально расстоянию
        arrowHelper.setLength(arrowLength);
    } else {
        console.error("arrowHelper не инициализирован");
    }
}

// Экспортируем функции для использования в других модулях
export { initGamepad, updateArrowHelper };