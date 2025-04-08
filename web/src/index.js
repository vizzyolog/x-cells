// index.js
import { initScene, scene, renderer, updateShadowCamera } from './scene';
import { initAmmo, stepPhysics, updatePhysicsObjects } from './physics';
import { initNetwork } from './network';
import { objects, playerMesh} from './objects';
import { initCamera, camera, updateCamera, logCameraStatus, setQuadraticFactor } from './camera';
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
    
    // Инициализируем элементы интерфейса для отображения скорости и других параметров
    console.log("Инициализация элементов интерфейса...");
    // Проверяем, существуют ли уже элементы
    if (!document.getElementById('player-speed')) {
        console.log("Элементы интерфейса игрока не найдены, создаем...");
        const playerInfo = document.getElementById('player-info');
        
        if (!playerInfo) {
            console.error("Элемент player-info не найден! Создаем его...");
            const playerInfoDiv = document.createElement('div');
            playerInfoDiv.id = 'player-info';
            playerInfoDiv.style.position = 'absolute';
            playerInfoDiv.style.top = '0px';
            playerInfoDiv.style.left = '290px';
            playerInfoDiv.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
            playerInfoDiv.style.color = 'white';
            playerInfoDiv.style.padding = '5px 10px';
            playerInfoDiv.style.borderRadius = '5px';
            playerInfoDiv.style.fontFamily = 'Arial, sans-serif';
            playerInfoDiv.style.fontSize = '14px';
            playerInfoDiv.style.zIndex = '1000';
            playerInfoDiv.style.display = 'flex';
            playerInfoDiv.style.flexDirection = 'column';
            playerInfoDiv.style.gap = '5px';
            document.body.appendChild(playerInfoDiv);
        }
        
        const playerInfoElement = document.getElementById('player-info') || playerInfo;
        
        const speedDiv = document.createElement('div');
        speedDiv.id = 'player-speed';
        speedDiv.textContent = 'Скорость: -- м/с';
        playerInfoElement.appendChild(speedDiv);
        
        const maxSpeedDiv = document.createElement('div');
        maxSpeedDiv.id = 'player-max-speed';
        maxSpeedDiv.textContent = 'Макс. скорость: -- м/с';
        playerInfoElement.appendChild(maxSpeedDiv);
        
        const massDiv = document.createElement('div');
        massDiv.id = 'player-mass';
        massDiv.textContent = 'Масса: -- кг';
        playerInfoElement.appendChild(massDiv);
        
        console.log("Элементы интерфейса игрока созданы");
    } else {
        console.log("Элементы интерфейса игрока уже существуют");
    }
    
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