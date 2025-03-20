// index.js
import * as THREE from 'three';
import { initScene, scene, camera, renderer, clock } from './scene.js';
import { stepPhysics, updatePhysicsObjects, applyImpulseToSphere, physicsSettings, createPhysicsObject } from './physics.js';
import { initNetwork } from './network.js';
import { objects, createMeshAndBodyForObject } from './objects.js';

// Настройки камеры
const cameraSettings = {
    height: 80,     // Высота камеры
    distance: 80,   // Расстояние от объекта
    smoothness: 0.1 // Плавность движения камеры
};

// Флаг для отслеживания работы анимации
let animationRunning = false;

function animate() {
    console.log("[Animate] Кадр анимации");
    
    // Запрашиваем следующий кадр
    requestAnimationFrame(animate);
    
    // Проверяем, инициализирована ли сцена
    if (!scene || !camera || !renderer) {
        console.warn("[Animate] Сцена не инициализирована полностью");
        return;
    }
    

    
    // Обновляем физику
    const deltaTime = clock.getDelta();
    if (deltaTime > 0) {
        console.log("stepPhysics in index.js")
        stepPhysics(deltaTime);
        
        // Обновляем объекты на основе физики
        updatePhysicsObjects();
        
        // Выводим информацию о положении объектов (только для отладки)
        if (Math.random() < 0.01) { // Примерно раз в 100 кадров
            for (let id in objects) {
                const obj = objects[id];
                if (obj && obj.mesh && obj.object_type === "sphere") {
                    console.log(`[Debug] Позиция ${id}:`, obj.mesh.position);
                }
            }
        }
    }
    
    // Находим целевой объект для камеры - теперь это mainPlayer
    let targetObject = objects["mainPlayer"];
    if (targetObject) {
        checkObjectActive(targetObject);
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
        camera.position.set(0, cameraSettings.height, cameraSettings.distance);
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
        
        // Инициализируем сеть - теперь сервер будет отвечать за создание mainPlayer
        initNetwork();
        console.log("[Start] Сеть инициализирована");
        
        // Выводим список всех объектов перед запуском анимации
        console.log("[Start] Список объектов перед запуском анимации:", Object.keys(objects));
        
        // Помечаем, что анимация запущена
        animationRunning = true;
        
        // Запускаем анимацию
        console.log("[Start] Запуск анимации");
        animate();
    } catch (error) {
        console.error("[Error] Ошибка при инициализации:", error);
    }
}

// Функция для создания базовых элементов сцены
// function createBasicSceneElements() {
//     // Создаем плоскость для пола, если её ещё нет
//     if (!objects["floor"]) {
//         console.log("[Index] Создание пола");
        
//         // Создаем визуальную плоскость
//         const floorGeometry = new THREE.PlaneGeometry(100, 100);
//         const floorMaterial = new THREE.MeshStandardMaterial({ 
//             color: 0x888888,
//             roughness: 0.8,
//             metalness: 0.2
//         });
        
//         const floorMesh = new THREE.Mesh(floorGeometry, floorMaterial);
//         floorMesh.rotation.x = -Math.PI / 2; // Поворачиваем горизонтально
//         floorMesh.position.y = 0;
//         floorMesh.receiveShadow = true;
        
//         // Добавляем в сцену
//         scene.add(floorMesh);
        
//         // Создаем объект пола
//         const floor = {
//             id: "floor",
//             object_type: "box",
//             x: 0,
//             y: -0.5, // Чуть ниже нуля, чтобы сфера не проваливалась
//             z: 0,
//             mass: 0,  // Масса 0 = статический объект
//             width: 100,
//             height: 1,
//             depth: 100
//         };
        
//         floor.mesh = floorMesh;
//         objects["floor"] = floor;
        
//         // Создаем физическое тело для пола
//         if (window.Ammo) {
//             try {
//                 const transform = new window.Ammo.btTransform();
//                 transform.setIdentity();
//                 transform.setOrigin(new window.Ammo.btVector3(0, -0.5, 0));
                
//                 const shape = new window.Ammo.btBoxShape(new window.Ammo.btVector3(50, 0.5, 50));
                
//                 const motionState = new window.Ammo.btDefaultMotionState(transform);
//                 const rbInfo = new window.Ammo.btRigidBodyConstructionInfo(
//                     0, // Масса 0 для статики
//                     motionState, 
//                     shape, 
//                     new window.Ammo.btVector3(0, 0, 0)
//                 );
                
//                 floor.body = new window.Ammo.btRigidBody(rbInfo);
//                 floor.body.setFriction(0.5);
//                 floor.body.setRestitution(0.2);
//                 floor.body.setCollisionFlags(1); // CF_STATIC_OBJECT
                
//                 // Добавляем в физический мир
//                 window.physicsWorld.addRigidBody(floor.body);
//             } catch(e) {
//                 console.error("[Index] Ошибка при создании физического тела пола:", e);
//             }
//         }
//     }
// }

// Добавляем обработчик клавиш
function handleKeyDown(event) {
    // Игнорируем повторные события при удержании клавиши
    if (event.repeat) return;

    switch (event.code) {
        case 'ArrowLeft':
            applyImpulseToSphere('LEFT');
            break;
        case 'ArrowRight':
            applyImpulseToSphere('RIGHT');
            break;
        case 'ArrowUp':
            applyImpulseToSphere('UP');
            break;
        case 'ArrowDown':
            applyImpulseToSphere('DOWN');
            break;
        case 'Space':
            applyImpulseToSphere('SPACE');
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

// Запускаем приложение
console.log('[Init] Запуск приложения...');
start().catch(error => {
    console.error('[Fatal Error] Критическая ошибка при запуске:', error);
});

export function checkObjectActive(obj) {
    if (obj.body) {
        const isActive = obj.body.isActive();
        console.log(`[Physics] Объект ${obj.id} активен: ${isActive}`);
        return isActive;
    } else {
        console.warn(`[Physics] У объекта ${obj.id} нет физического тела`);
        return false;
    }
}