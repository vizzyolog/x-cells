// index.js
import * as THREE from 'three';
import { initScene, scene, camera, renderer } from './scene.js';
import { initAmmo, stepPhysics, updatePhysicsObjects, applyImpulseToSphere, physicsSettings } from './physics.js';
import { initNetwork } from './network.js';
import { objects, createVisualObject, createPhysicsObject } from './objects.js';

// Создаем часы для отслеживания времени
const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);

    if (!scene || !camera || !renderer) {
        console.warn("[Render] Сцена не инициализирована полностью");
        return;
    }

    // Обновляем физику
    const deltaTime = clock.getDelta();
    stepPhysics(deltaTime);

    // Обновляем позиции объектов
    updatePhysicsObjects(objects);

    // Отладочный вывод состояния объектов
    if (physicsSettings.debugMode) {
        console.log("[Debug] Объекты в сцене:", Object.keys(objects));
        for (let id in objects) {
            const obj = objects[id];
            if (obj.mesh) {
                console.log(`[Debug] Позиция ${id}:`, obj.mesh.position);
            }
        }
    }

    // Пример обновления камеры: следим за первым найденным шаром
    let targetObject = null;
    for (let id in objects) {
        let obj = objects[id];
        if (obj && obj.mesh && obj.mesh.geometry && obj.mesh.geometry.type === "SphereGeometry") {
            targetObject = obj;
            break;
        }
    }

    if (targetObject) {
        const targetPos = targetObject.mesh.position;
        const offset = new THREE.Vector3(0, 50, 100);
        const cameraTarget = targetPos.clone().add(offset);

        camera.position.lerp(cameraTarget, 0.1);
        camera.lookAt(targetPos);
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
start().catch(error => {
    console.error('[Fatal Error] Критическая ошибка при запуске:', error);
});