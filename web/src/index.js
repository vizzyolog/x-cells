// index.js
import { initScene, scene, renderer, updateShadowCamera } from './scene';
import { initAmmo, stepPhysics, updatePhysicsObjects } from './physics';
import { initNetwork } from './network';
import { objects } from './objects';
import { initCamera, camera, updateCamera, logCameraStatus } from './camera';
import { initGamepad } from './gamepad';
import { initGameStateManager, gameStateManager } from './gamestatemanager';

function animate() {
    requestAnimationFrame(animate);

    stepPhysics(1 / 60);
    updatePhysicsObjects(objects);

    // Обновляем камеру из нового модуля
    updateCamera();
    
    // Обновляем положение источника света относительно камеры, как солнце
    updateShadowCamera(camera);

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
        const ws = await initNetwork()
            
        initGameStateManager(ws);

        gameStateManager.on('gameInitialized', () => {
            console.warn('game initialized')
            animate();
        }); 
               
    } catch (error) {
        console.error("Ошибка при инициализации Ammo.js:", error);
    }
}


start();