// index.js
import { initScene, scene, camera, renderer } from './scene';
import { initAmmo, stepPhysics, updatePhysicsObjects, applyImpulseToSphere } from './physics';
import { initNetwork } from './network';
import { objects, debugPhysicsWorld, createTestSphere } from './objects';
import * as THREE from 'three';

function animate() {
    requestAnimationFrame(animate);

    // Выполняем шаг физической симуляции (например, 1/60 секунды)
    stepPhysics(1 / 60);
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
        
        //createTestSphere();
        initNetwork();
        animate();
    } catch (error) {
        console.error("Ошибка при инициализации Ammo.js:", error);
    }
}

start();