// scene.js
import * as THREE from 'three';
import { initAmmo, stepPhysics, updatePhysicsObjects, objects, physicsSettings, localPhysicsWorld, applyImpulseToSphere } from './physics.js';

export let scene, camera, renderer;

export async function initScene() {
    console.log("[Scene] Инициализация сцены...");
    
    // Создаем сцену
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x88ccff);
    
    // Добавляем камеру с улучшенными параметрами
    camera = new THREE.PerspectiveCamera(
        45,  // Уменьшенный угол обзора для лучшей перспективы
        window.innerWidth / window.innerHeight,
        0.1,
        1000
    );
    
    // Устанавливаем начальную позицию камеры выше и дальше
    camera.position.set(0, 30, 50);
    camera.lookAt(0, 0, 0);
    
    // Создаем рендерер с улучшенными настройками
    renderer = new THREE.WebGLRenderer({ 
        antialias: true,
        powerPreference: "high-performance"
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap; // Мягкие тени
    document.body.appendChild(renderer.domElement);
    
    // Добавляем обработчик изменения размера окна
    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });
    
    // Улучшенное освещение
    const ambientLight = new THREE.AmbientLight(0x404040, 2);
    scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.5);
    directionalLight.position.set(50, 50, 50);
    directionalLight.castShadow = true;
    
    // Улучшенные настройки теней
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = 500;
    directionalLight.shadow.camera.left = -100;
    directionalLight.shadow.camera.right = 100;
    directionalLight.shadow.camera.top = 100;
    directionalLight.shadow.camera.bottom = -100;
    
    scene.add(directionalLight);
    
    // Инициализируем физику, если Ammo доступен
    if (window.Ammo || window.AmmoLib) {
        try {
            await initAmmo();
            console.log("[Scene] Физика инициализирована");
            initKeyboardControls();
        } catch (error) {
            console.error("[Scene] Ошибка инициализации физики:", error);
        }
    } else {
        console.log("[Scene] Ammo.js не найден, запуск без физики");
    }
    
    // Запускаем цикл анимации
    animate();
}

let previousTime = 0;

function animate() {
    requestAnimationFrame(animate);
    
    const currentTime = performance.now();
    let deltaTime = (currentTime - previousTime) / 1000;
    previousTime = currentTime;
    
    if (deltaTime > 0.1) deltaTime = 0.1;
    
    // Проверяем доступность физики перед обновлением
    if (window.Ammo && !physicsSettings.useServerPhysics && localPhysicsWorld) {
        try {
            stepPhysics(deltaTime);
            updatePhysicsObjects(objects);
        } catch (error) {
            console.error("[Scene] Ошибка обновления физики:", error);
        }
    }
    
    renderer.render(scene, camera);
}

function initKeyboardControls() {
    const keyState = {
        ArrowUp: false,
        ArrowDown: false,
        ArrowLeft: false,
        ArrowRight: false,
        KeyW: false,
        KeyA: false,
        KeyS: false,
        KeyD: false,
        Space: false
    };
    
    window.addEventListener('keydown', (e) => {
        if (keyState.hasOwnProperty(e.code)) {
            keyState[e.code] = true;
        }
    });
    
    window.addEventListener('keyup', (e) => {
        if (keyState.hasOwnProperty(e.code)) {
            keyState[e.code] = false;
        }
    });
    
    setInterval(() => {
        if (!window.Ammo) return;
        
        if (keyState.ArrowUp || keyState.KeyW) applyImpulseToSphere('UP', objects);
        if (keyState.ArrowDown || keyState.KeyS) applyImpulseToSphere('DOWN', objects);
        if (keyState.ArrowLeft || keyState.KeyA) applyImpulseToSphere('LEFT', objects);
        if (keyState.ArrowRight || keyState.KeyD) applyImpulseToSphere('RIGHT', objects);
        if (keyState.Space) applyImpulseToSphere('SPACE', objects);
    }, 50);
}