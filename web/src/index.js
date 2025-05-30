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
            playerInfoDiv.style.bottom = '10px';
            playerInfoDiv.style.right = '10px';
            playerInfoDiv.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
            playerInfoDiv.style.color = 'white';
            playerInfoDiv.style.padding = '8px 12px';
            playerInfoDiv.style.borderRadius = '6px';
            playerInfoDiv.style.fontFamily = 'monospace';
            playerInfoDiv.style.fontSize = '12px';
            playerInfoDiv.style.zIndex = '1000';
            playerInfoDiv.style.display = 'flex';
            playerInfoDiv.style.flexDirection = 'column';
            playerInfoDiv.style.gap = '4px';
            playerInfoDiv.style.minWidth = '160px';
            playerInfoDiv.style.border = '1px solid #00ff00';
            playerInfoDiv.style.opacity = '0.85';
            document.body.appendChild(playerInfoDiv);
        }
        
        const playerInfoElement = document.getElementById('player-info') || playerInfo;
        
        // Заголовок приборной панели
        const titleDiv = document.createElement('div');
        titleDiv.id = 'instruments-title';
        titleDiv.textContent = '🚀 ПРИБОРЫ';
        titleDiv.style.fontWeight = 'bold';
        titleDiv.style.textAlign = 'center';
        titleDiv.style.color = '#00ff00';
        titleDiv.style.marginBottom = '3px';
        titleDiv.style.fontSize = '11px';
        playerInfoElement.appendChild(titleDiv);
        
        // Скорость
        const speedDiv = document.createElement('div');
        speedDiv.id = 'player-speed';
        speedDiv.textContent = '⚡ --';
        speedDiv.style.padding = '3px';
        speedDiv.style.backgroundColor = 'rgba(0, 128, 0, 0.3)';
        speedDiv.style.borderRadius = '3px';
        speedDiv.style.fontSize = '11px';
        playerInfoElement.appendChild(speedDiv);
        
        // Масса
        const massDiv = document.createElement('div');
        massDiv.id = 'player-mass';
        massDiv.textContent = '⚖️ --';
        massDiv.style.padding = '3px';
        massDiv.style.backgroundColor = 'rgba(128, 128, 0, 0.3)';
        massDiv.style.borderRadius = '3px';
        massDiv.style.fontSize = '11px';
        playerInfoElement.appendChild(massDiv);
        
        // Статус игрока
        const statusDiv = document.createElement('div');
        statusDiv.id = 'player-status';
        statusDiv.textContent = '🎮 Поиск...';
        statusDiv.style.padding = '3px';
        statusDiv.style.backgroundColor = 'rgba(128, 0, 128, 0.3)';
        statusDiv.style.borderRadius = '3px';
        statusDiv.style.fontSize = '11px';
        playerInfoElement.appendChild(statusDiv);
        
        // Объекты в мире
        const objectsDiv = document.createElement('div');
        objectsDiv.id = 'world-objects';
        objectsDiv.textContent = '🌍 0';
        objectsDiv.style.padding = '3px';
        objectsDiv.style.backgroundColor = 'rgba(0, 128, 128, 0.3)';
        objectsDiv.style.borderRadius = '3px';
        objectsDiv.style.fontSize = '11px';
        playerInfoElement.appendChild(objectsDiv);

        console.log("Улучшенные элементы интерфейса игрока созданы");
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