// index.js
import { initScene, scene, renderer, updateShadowCamera } from './scene';
import { initAmmo, stepPhysics, updatePhysicsObjects, applyImpulseToSphere, receiveObjectUpdate, createDiagnosticScene } from './physics';
import { initNetwork } from './network';
import { objects } from './objects';
import { initCamera, camera, updateCamera, logCameraStatus } from './camera';
import * as THREE from 'three';

// Добавляем флаг для диагностического режима
let diagnosticMode = false;
// Счетчик кадров для логирования камеры (каждые 100 кадров)
let frameCounter = 0;

function animate() {
    requestAnimationFrame(animate);

    // Выполняем шаг физической симуляции (например, 1/60 секунды)
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
        
        // Добавляем интерфейс для управления диагностическим режимом
        // createDiagnosticUI();
        
        // Создаем диагностическую сцену если включен режим
        // if (diagnosticMode) {
        //    createDiagnosticScene(scene);
        // }
        
        animate();
    } catch (error) {
        console.error("Ошибка при инициализации Ammo.js:", error);
    }
}

// Функция для создания пользовательского интерфейса диагностики
function createDiagnosticUI() {
    // Создаем контейнер для элементов управления
    const container = document.createElement('div');
    container.style.position = 'absolute';
    container.style.top = '10px';
    container.style.left = '10px';
    container.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
    container.style.padding = '10px';
    container.style.borderRadius = '5px';
    container.style.color = 'white';
    container.style.fontFamily = 'Arial, sans-serif';
    
    // Создаем заголовок
    const title = document.createElement('div');
    title.textContent = 'Настройки диагностики';
    title.style.fontWeight = 'bold';
    title.style.marginBottom = '10px';
    container.appendChild(title);
    
    // Создаем чекбокс для включения/выключения диагностики
    const diagnosticCheckbox = document.createElement('input');
    diagnosticCheckbox.type = 'checkbox';
    diagnosticCheckbox.id = 'diagnostic-toggle';
    diagnosticCheckbox.checked = diagnosticMode;
    
    // Создаем лейбл для чекбокса
    const diagnosticLabel = document.createElement('label');
    diagnosticLabel.htmlFor = 'diagnostic-toggle';
    diagnosticLabel.textContent = 'Показать диагностические тени';
    
    // Добавляем обработчик событий для чекбокса
    diagnosticCheckbox.addEventListener('change', function() {
        diagnosticMode = this.checked;
        console.log('Диагностический режим:', diagnosticMode ? 'включен' : 'выключен');
        
        // Если режим включен, создаем диагностическую сцену
        if (diagnosticMode) {
            createDiagnosticScene(scene);
        } else {
            // Удаляем диагностические объекты если они есть
            if (objects["ammo_shadow"]) {
                scene.remove(objects["ammo_shadow"].mesh);
                delete objects["ammo_shadow"];
            }
            
            if (objects["bullet_shadow"]) {
                scene.remove(objects["bullet_shadow"].mesh);
                delete objects["bullet_shadow"];
            }
            
            // Удаляем линии визуализации
            if (objects.divergenceLines) {
                Object.values(objects.divergenceLines).forEach(item => {
                    if (item.line) {
                        scene.remove(item.line);
                    }
                });
                delete objects.divergenceLines;
            }
        }
    });
    
    // Создаем контейнер для чекбокса с лейблом
    const checkboxContainer = document.createElement('div');
    checkboxContainer.appendChild(diagnosticCheckbox);
    checkboxContainer.appendChild(diagnosticLabel);
    container.appendChild(checkboxContainer);
    
    // Добавляем информацию о расхождениях
    const divergenceInfo = document.createElement('div');
    divergenceInfo.id = 'divergence-info';
    divergenceInfo.textContent = 'Расхождения: нет данных';
    divergenceInfo.style.marginTop = '10px';
    divergenceInfo.style.fontSize = '12px';
    container.appendChild(divergenceInfo);
    
    // Добавляем контейнер на страницу
    document.body.appendChild(container);
    
    // Обновляем информацию о расхождениях периодически
    setInterval(updateDivergenceInfo, 1000);
}

// Функция для обновления информации о расхождениях
function updateDivergenceInfo() {
    if (!diagnosticMode) return;
    
    const mainSphere = objects["mainPlayer1"];
    const ammoShadow = objects["ammo_shadow"];
    const bulletShadow = objects["bullet_shadow"];
    
    if (!mainSphere || !ammoShadow || !bulletShadow) return;
    
    // Получаем позиции
    const mainPos = mainSphere.mesh.position;
    const ammoPos = ammoShadow.mesh.position;
    const bulletPos = bulletShadow.mesh.position;
    
    // Расчет расстояний
    const distMainToAmmo = Math.sqrt(
        Math.pow(mainPos.x - ammoPos.x, 2) +
        Math.pow(mainPos.y - ammoPos.y, 2) +
        Math.pow(mainPos.z - ammoPos.z, 2)
    );
    
    const distMainToBullet = Math.sqrt(
        Math.pow(mainPos.x - bulletPos.x, 2) +
        Math.pow(mainPos.y - bulletPos.y, 2) +
        Math.pow(mainPos.z - bulletPos.z, 2)
    );
    
    const distAmmoBullet = Math.sqrt(
        Math.pow(ammoPos.x - bulletPos.x, 2) +
        Math.pow(ammoPos.y - ammoPos.y, 2) +
        Math.pow(ammoPos.z - bulletPos.z, 2)
    );
    
    // Обновляем информацию на интерфейсе
    const divergenceInfo = document.getElementById('divergence-info');
    if (divergenceInfo) {
        divergenceInfo.innerHTML = `
            <div>Основной-Ammo: ${distMainToAmmo.toFixed(3)}</div>
            <div>Основной-Bullet: ${distMainToBullet.toFixed(3)}</div>
            <div>Ammo-Bullet: ${distAmmoBullet.toFixed(3)}</div>
        `;
    }
}

start();