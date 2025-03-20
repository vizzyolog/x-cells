// scene.js
import * as THREE from 'three';
import { initAmmo, stepPhysics, updatePhysicsObjects, objects, physicsSettings, localPhysicsWorld, applyImpulseToSphere } from './physics.js';

export let scene, camera, renderer;
export const clock = new THREE.Clock(); // Экспортируем часы для использования в index.js

// Активные клавиши
const activeKeys = {};

export async function initScene() {
    console.log("[Scene] Начало инициализации сцены");
    
    try {
        // Инициализируем физику в первую очередь
        console.log("[Scene] Вызов initAmmo()...");
        await initAmmo();
        
        // Проверяем, что физический мир создан
        if (!localPhysicsWorld) {
            console.error("[Scene] Критическая ошибка: localPhysicsWorld не инициализирован после вызова initAmmo()");
            throw new Error("Не удалось инициализировать физический мир");
        } else {
            console.log("[Scene] Физический мир успешно инициализирован:", !!localPhysicsWorld);
        }
        
        // Создаем сцену
        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x87ceeb); // Голубое небо
        
        // Настраиваем туман для добавления глубины
        scene.fog = new THREE.FogExp2(0xcccccc, 0.002);
        
        // Создаем камеру
        camera = new THREE.PerspectiveCamera(
            75, // поле зрения
            window.innerWidth / window.innerHeight, // соотношение сторон
            0.1, // ближняя плоскость отсечения
            1000 // дальняя плоскость отсечения
        );
        
        // Позиционируем камеру
        camera.position.set(0, 5, 10);
        camera.lookAt(0, 0, 0);
        
        // Создаем рендерер
        renderer = new THREE.WebGLRenderer({ 
            antialias: true,
            powerPreference: "high-performance"
        });
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(window.devicePixelRatio);
        
        // Включаем тени
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        
        // Добавляем рендерер в DOM
        document.body.appendChild(renderer.domElement);
        
        // Настраиваем обработчик изменения размера окна
        window.addEventListener('resize', () => {
            renderer.setSize(window.innerWidth, window.innerHeight);
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
        });
        
        // Добавляем основное освещение
        const ambientLight = new THREE.AmbientLight(0x404040, 1.5);
        scene.add(ambientLight);
        
        const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
        directionalLight.position.set(50, 100, 50);
        directionalLight.castShadow = true;
        
        // Настраиваем тени от направленного света
        directionalLight.shadow.mapSize.width = 2048;
        directionalLight.shadow.mapSize.height = 2048;
        directionalLight.shadow.camera.near = 0.5;
        directionalLight.shadow.camera.far = 500;
        
        const d = 100;
        directionalLight.shadow.camera.left = -d;
        directionalLight.shadow.camera.right = d;
        directionalLight.shadow.camera.top = d;
        directionalLight.shadow.camera.bottom = -d;
        
        scene.add(directionalLight);
        
        // Добавляем вспомогательные объекты для отладки (оси, сетку)
        if (physicsSettings.debugMode) {
            const axesHelper = new THREE.AxesHelper(10);
            scene.add(axesHelper);
            
            const gridHelper = new THREE.GridHelper(100, 100);
            scene.add(gridHelper);
        }
        
        // Настраиваем обработчики клавиш
        window.addEventListener('keydown', (event) => {
            console.log("[Scene] Нажата клавиша:", event.code);
            activeKeys[event.code] = true;
            
            // Проверяем наличие mainPlayer перед применением импульса
            if (objects["mainPlayer"]) {
                let cmd = null;
                switch (event.code) {
                    case "ArrowLeft":
                    case "KeyA":
                        cmd = "LEFT";
                        break;
                    case "ArrowRight":
                    case "KeyD":
                        cmd = "RIGHT";
                        break;
                    case "ArrowUp":
                    case "KeyW":
                        cmd = "UP";
                        break;
                    case "ArrowDown":
                    case "KeyS":
                        cmd = "DOWN";
                        break;
                    case "Space":
                        cmd = "SPACE";
                        break;
                }
                
                if (cmd) {
                    console.log("[Scene] Применение импульса к mainPlayer:", cmd);
                    applyImpulseToSphere(cmd, objects);
                }
            } else {
                console.warn("[Scene] mainPlayer не найден, импульс не может быть применен");
            }
        });
        
        window.addEventListener('keyup', (event) => {
            delete activeKeys[event.code];
        });
        
        // Вешаем таймер для проверки активных клавиш и непрерывного применения импульса при удержании
        setInterval(() => {
            // Проверяем наличие mainPlayer
            if (!objects["mainPlayer"]) {
                return;
            }
            
            for (const key in activeKeys) {
                if (activeKeys[key]) {
                    let cmd = null;
                    switch (key) {
                        case "ArrowLeft":
                        case "KeyA":
                            cmd = "LEFT";
                            break;
                        case "ArrowRight":
                        case "KeyD":
                            cmd = "RIGHT";
                            break;
                        case "ArrowUp":
                        case "KeyW":
                            cmd = "UP";
                            break;
                        case "ArrowDown":
                        case "KeyS":
                            cmd = "DOWN";
                            break;
                        case "Space":
                            cmd = "SPACE";
                            break;
                    }
                    
                    if (cmd) {
                        console.log("[Scene] Удержание клавиши, команда:", cmd);
                        applyImpulseToSphere(cmd, objects);
                    }
                }
            }
        }, 100); // Проверяем каждые 100 мс
        
        console.log("[Scene] Сцена успешно инициализирована");
        return Promise.resolve();
    } catch (error) {
        console.error("[Scene] Ошибка при инициализации сцены:", error);
        return Promise.reject(error);
    }
}