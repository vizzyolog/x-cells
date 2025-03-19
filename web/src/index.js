// index.js
import * as THREE from 'three';
import { initScene, scene, camera, renderer } from './scene.js';
import { stepPhysics, updatePhysicsObjects, applyImpulseToSphere, physicsSettings, objects } from './physics.js';
import { initNetwork } from './network.js';
import { createVisualObject, createPhysicsObject } from './objects.js';

// Создаем часы для отслеживания времени
const clock = new THREE.Clock();

// Настройки камеры
const cameraSettings = {
    height: 30,    // Высота камеры
    distance: 50,  // Расстояние от объекта
    smoothness: 0.05  // Плавность движения камеры (меньше = плавнее)
};

function animate() {
    requestAnimationFrame(animate);

    if (!scene || !camera || !renderer) {
        console.warn("[Render] Сцена не инициализирована полностью");
        return;
    }

    // Обновляем физику
    const deltaTime = clock.getDelta();
    if (deltaTime > 0) {  // Проверяем, что deltaTime валидный
        stepPhysics(deltaTime);
        updatePhysicsObjects(objects);
    }

    // Находим целевой объект для камеры
    let targetObject = null;
    for (let id in objects) {
        let obj = objects[id];
        if (obj && obj.mesh && obj.object_type === "sphere") {
            targetObject = obj;
            break;
        }
    }

    // Обновляем позицию камеры
    if (targetObject && targetObject.mesh) {
        const targetPos = targetObject.mesh.position;
        
        // Создаем желаемую позицию камеры
        const cameraTarget = new THREE.Vector3(
            targetPos.x,
            targetPos.y + cameraSettings.height,
            targetPos.z + cameraSettings.distance
        );

        // Плавно перемещаем камеру
        camera.position.lerp(cameraTarget, cameraSettings.smoothness);
        
        // Настраиваем точку, на которую смотрит камера
        const lookAtPoint = new THREE.Vector3(
            targetPos.x,
            targetPos.y,
            targetPos.z
        );
        camera.lookAt(lookAtPoint);
    } else {
        // Если нет целевого объекта, устанавливаем камеру в стандартную позицию
        camera.position.set(0, 30, 50);
        camera.lookAt(0, 0, 0);
    }

    // Рендеринг сцены
    renderer.render(scene, camera);
}

async function start() {
    console.log("[Start] Начало инициализации");
    try {
        // Инициализируем сцену (которая также инициализирует физику)
        await initScene();
        console.log("[Start] Сцена инициализирована");
        
        // Инициализируем сеть
        initNetwork();
        console.log("[Start] Сеть инициализирована");
        
        // Запускаем анимацию
        console.log("[Start] Запуск анимации");
        animate();
    } catch (error) {
        console.error("[Error] Ошибка при инициализации:", error);
    }
}

function handleWebSocketMessage(event) {
    const message = JSON.parse(event.data);

    if (message.type === "create") {
        const obj = {
            id: message.id,
            object_type: message.object_type,
            x: message.x,
            y: message.y,
            z: message.z,
            mass: message.mass,
            radius: message.radius,
            color: message.color,
            height_data: message.height_data,
            heightmap_w: message.heightmap_w,
            heightmap_h: message.heightmap_h,
            scale_x: message.scale_x,
            scale_y: message.scale_y,
            scale_z: message.scale_z,
        };

        createVisualObject(obj);
        // Создаем физическое тело для объекта
        createPhysicsObject(obj);
        objects[obj.id] = obj;
    }
}

// Добавляем обработчик клавиш
function handleKeyDown(event) {
    // Игнорируем повторные события при удержании клавиши
    if (event.repeat) return;

    switch (event.code) {
        case 'ArrowLeft':
            applyImpulseToSphere('LEFT', objects);
            break;
        case 'ArrowRight':
            applyImpulseToSphere('RIGHT', objects);
            break;
        case 'ArrowUp':
            applyImpulseToSphere('UP', objects);
            break;
        case 'ArrowDown':
            applyImpulseToSphere('DOWN', objects);
            break;
        case 'Space':
            applyImpulseToSphere('SPACE', objects);
            break;
    }
}

// Добавляем обработчик ошибок
window.addEventListener('error', function(event) {
    console.error('[Global Error]', event.error);
});

// Добавляем обработчик для необработанных промисов
window.addEventListener('unhandledrejection', function(event) {
    console.error('[Unhandled Promise Rejection]', event.reason);
});

// Добавляем обработчик клавиш
window.addEventListener('keydown', handleKeyDown);

console.log('[Init] Запуск приложения...');

// Приложение запускается из index-test.html после загрузки Ammo.js
start().catch(error => {
    console.error('[Fatal Error] Критическая ошибка при запуске:', error);
});