// index.js
import { initScene, scene, renderer, updateShadowCamera } from './scene';
import { initAmmo, stepPhysics, updatePhysicsObjects } from './physics';
import { initNetwork } from './network';
import { objects, playerMesh} from './objects';
import { initCamera, camera, updateCamera, logCameraStatus } from './camera';
import { initGameStateManager, gameStateManager } from './gamestatemanager';
import { initGamepad, updateArrowHelper } from './gamepad'; 
import Stats from 'stats.js';


const stats = new Stats();
stats.showPanel(0); // 0: FPS, 1: ms, 2: memory
document.body.appendChild(stats.dom);


function animate() {
    stats.begin(); 
    

    stepPhysics(1 / 60);
    updatePhysicsObjects(objects);

    // Обновляем камеру из нового модуля
    updateCamera();
    
    // Обновляем положение источника света относительно камеры, как солнце
    updateShadowCamera(camera);

      // Обновляем ArrowHelper
    if (gameStateManager.playerMesh) {
       updateArrowHelper(gameStateManager.playerMesh);
    }

    renderer.render(scene, camera);

    stats.end(); // Завершаем замер
    
    requestAnimationFrame(animate);
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
            
        initGameStateManager(ws, scene);

        gameStateManager.on('gameInitialized', () => {
            console.warn('game initialized')
            animate();
        }); 

    } catch (error) {
        console.error("Ошибка при инициализации Ammo.js:", error);
    }
}


start();