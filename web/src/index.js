// index.js
import { initScene, scene, renderer, updateShadowCamera } from './scene';
import { initAmmo, stepPhysics, updatePhysicsObjects } from './physics';
import { initNetwork } from './network';
import { objects } from './objects';
import { initCamera, camera, updateCamera, logCameraStatus } from './camera';

// Добавляем флаг для диагностического режима
let diagnosticMode = false;
// Счетчик кадров для логирования камеры (каждые 100 кадров)
let frameCounter = 0;
let previousTime = performance.now();

function animate() {
    requestAnimationFrame(animate);

    stepPhysics(1 / 60);
    updatePhysicsObjects(objects);

    // Обновляем камеру из нового модуля
    updateCamera();
    
    // Обновляем положение источника света относительно камеры, как солнце
    updateShadowCamera(camera);

    // Периодически выводим информацию о камере для отладки
    frameCounter++;
    if (frameCounter % 100 === 0) {
        logCameraStatus();
        frameCounter = 0;
    }

    renderer.render(scene, camera);
}

async function start() {
    console.log("Start");
    initScene();
    
    // Инициализируем камеру из нового модуля
    initCamera();
    
    try {
        // Добавляем небольшую задержку перед инициализацией
        await new Promise(resolve => setTimeout(resolve, 500));
        await initAmmo();
        
        // Инициализируем сетевое соединение
        initNetwork();
            
        animate();
    } catch (error) {
        console.error("Ошибка при инициализации Ammo.js:", error);
    }
}


start();