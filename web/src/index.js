// index.js
import { initScene, scene, camera, renderer } from './scene';
import { initAmmo, stepPhysics, updatePhysicsObjects, applyImpulseToSphere } from './physics';
import { initNetwork } from './network';
import { objects } from './objects';
import * as THREE from 'three';

// Создаем часы для отслеживания времени
const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);

    // Обновляем физику
    const deltaTime = clock.getDelta();
    stepPhysics(deltaTime);

    // Обновляем позиции объектов
    updatePhysicsObjects(objects);

    // Пример обновления камеры: следим за первым найденным шаром
    let targetObject = null;
    for (let id in objects) {
        let obj = objects[id];
        if (
            obj &&
            obj.mesh &&
            obj.mesh.geometry &&
            obj.mesh.geometry.type === "SphereGeometry"
        ) {
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

    renderer.render(scene, camera);
}

async function start() {
    console.log("Start")
    initScene();
    try {
        // Добавляем небольшую задержку перед инициализацией
        await new Promise(resolve => setTimeout(resolve, 500));
        await initAmmo();
        initNetwork();
        animate();
    } catch (error) {
        console.error("Ошибка при инициализации Ammo.js:", error);
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

async function init() {
    // Инициализируем физику
    await initAmmo();

    // Создаем сцену
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x88ccff);
}

start();