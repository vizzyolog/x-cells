import * as THREE from 'three';
import { getPhysicsConfig, checkConnectionState } from './network';
import { applyImpulseToSphere } from './physics';
import gameStateManager from './gamestatemanager';

// Константы для настройки поведения
const DEBUG_MODE = true; // Включает/выключает отладочные элементы (arrowHelper)
const MIN_ARROW_LENGTH = 10;
const MAX_ARROW_LENGTH = 50;
const SEND_INTERVAL = 50; // Синхронизируем с серверным интервалом
const ARROW_HEIGHT_OFFSET = 2; // Смещение стрелки по высоте над игроком
const RAY_UPDATE_INTERVAL = 50; // Синхронизируем с серверным интервалом
const KEY_FORCE = 2.0; // Значительно увеличиваем силу импульса для клавиатурного управления
const DEADZONE = 0.1; // Мертвая зона для аналоговых стиков

let arrowHelper;
let lastSentPosition = new THREE.Vector3();
let lastSendTime = 0;
let raycaster = new THREE.Raycaster();
let mouse = new THREE.Vector2();
let cameraLastPosition = new THREE.Vector3();
let lastRayUpdateTime = 0;
let lastIntersectPoint = new THREE.Vector3();
let isMouseActive = false; // Флаг активности мыши над игровой областью

// Флаги для клавиатурного управления
let keys = {
    w: false,
    a: false,
    s: false,
    d: false
};

// Переменные для хранения направления
let currentDirection = new THREE.Vector3();
let directionNeedsUpdate = false;
let terrainMeshRef = null;
let playerMeshRef = null;
let cameraRef = null;
let socketRef = null;

// Добавляем переменные для дебаунса
let lastLocalImpulseTime = 0;
const LOCAL_IMPULSE_INTERVAL = 50; // Синхронизируем с серверным интервалом

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
        if (!playerMeshRef || !socketRef) return;
        
        // Проверяем, если хотя бы одна клавиша нажата
        if (keys.w || keys.a || keys.s || keys.d) {
            // Создаем вектор направления на основе нажатых клавиш
            const direction = new THREE.Vector3(0, 0, 0);
            
            if (keys.w) direction.z -= 1;
            if (keys.s) direction.z += 1;
            if (keys.a) direction.x -= 1;
            if (keys.d) direction.x += 1;
            
            // Нормализуем направление, если оно не нулевое
            if (direction.length() > 0) {
                direction.normalize();
                
                // Отправляем направление на сервер
                if (Date.now() - lastSendTime > SEND_INTERVAL) {
                    // Получаем текущую конфигурацию физики
                    const physicsConfig = getPhysicsConfig();
                    
                    // Используем множитель импульса из конфигурации, если она доступна
                    let keyForce = KEY_FORCE;
                    if (physicsConfig && physicsConfig.impulse_multiplier) {
                        keyForce = (physicsConfig.base_impulse); // Увеличиваем в 8 раз базовый импульс
                    } else {
                        keyForce = KEY_FORCE; // Или увеличиваем в 4 раза значение по умолчанию
                    }
                    
                    // Логируем для отладки
                    //console.log(`[Gamepad] Отправка импульса с клавиатуры: направление (${direction.x.toFixed(2)}, ${direction.y.toFixed(2)}, ${direction.z.toFixed(2)}), сила ${keyForce}`);
                    
                    // Отправляем импульс на сервер
                    sendDirectionToServer(direction, keyForce, socketRef);
                    lastSendTime = Date.now();
                    
                    // Обновляем lastSentPosition для отображения стрелки
                    lastSentPosition.copy(direction);
                    lastSentPosition.userData = { distance: keyForce };
                    directionNeedsUpdate = true;
                }
            }
        }
    }
    
    function onKeyDown(event) {
        // Обновляем состояние клавиш
        switch(event.key.toLowerCase()) {
            case 'w': keys.w = true; break;
            case 'a': keys.a = true; break;
            case 's': keys.s = true; break;
            case 'd': keys.d = true; break;
        }
    }
    
    function onKeyUp(event) {
        // Обновляем состояние клавиш
        switch(event.key.toLowerCase()) {
            case 'w': keys.w = false; break;
            case 'a': keys.a = false; break;
            case 's': keys.s = false; break;
            case 'd': keys.d = false; break;
        }
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
                sendDirectionToServer(currentDirection, distance, socketRef);
                lastSendTime = Date.now();
            }
        }
    }

    function sendDirectionToServer(direction, distance, socket) {
        // Проверяем состояние соединения
        let useServerPhysics = checkConnectionState();
        
        // Получаем конфигурацию физики
        const physicsConfig = getPhysicsConfig();
        if (!physicsConfig) {
            console.error('[Gamepad] Конфигурация физики не инициализирована');
            return;
        }

        // Получаем ID объекта игрока
        const playerObjectID = gameStateManager.getPlayerObjectID();
        if (!playerObjectID) {
            console.warn('[Gamepad] Player ID еще не получен от сервера, команда не отправлена');
            return;
        }

        // Для мышиного управления увеличиваем дистанцию, которая используется как сила импульса
        const enhancedDistance = Math.min(distance * 1.5, 100); // Увеличиваем на 50%, но не больше 100
        
        // Вычисляем силу импульса
        const force = {
            x: direction.x * enhancedDistance,
            y: direction.y * enhancedDistance,
            z: direction.z * enhancedDistance
        };

        // Отправляем команду на сервер, если соединение активно
        if (useServerPhysics && socket && socket.readyState === WebSocket.OPEN) {
            try {
                socket.send(JSON.stringify({
                    type: 'cmd',
                    cmd: 'MOUSE_VECTOR',
                    data: {
                        x: direction.x,
                        y: direction.y,
                        z: direction.z,
                        distance: enhancedDistance
                    },
                    client_time: Date.now(),
                    object_id: playerObjectID // Используем динамический player ID
                }));
            } catch (error) {
                console.error('[Gamepad] Ошибка отправки команды на сервер:', error);
                useServerPhysics = false;
            }
        }
        
        // Если не используем серверную физику, применяем импульс локально
        if (!useServerPhysics) {
            const currentTime = Date.now();
            const timeSinceLastImpulse = currentTime - lastLocalImpulseTime;
            
            // Применяем импульс только если прошло достаточно времени с последнего применения
            if (timeSinceLastImpulse >= LOCAL_IMPULSE_INTERVAL) {
                try {
                    applyImpulseToSphere(playerObjectID, force); // Используем динамический player ID
                    console.log('[Gamepad] Применен локальный импульс:', {
                        direction: { x: direction.x, y: direction.y, z: direction.z },
                        force: force,
                        interval: timeSinceLastImpulse,
                        playerID: playerObjectID
                    });
                    
                    // Обновляем время последнего применения импульса
                    lastLocalImpulseTime = currentTime;
                } catch (error) {
                    console.error('[Gamepad] Ошибка применения локального импульса:', error);
                }
            }
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