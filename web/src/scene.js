// scene.js
import * as THREE from 'three';

export let scene, renderer;
export let directionalLight; // Экспортируем свет для доступности в других модулях

export function initScene() {
    console.log("try to initScene")
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x88ccff); 

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    // Включаем поддержку теней
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.body.appendChild(renderer.domElement);

    window.addEventListener('resize', onWindowResize);

    // Настраиваем освещение
    const ambient = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambient);

    // Основной направленный свет с тенями
    directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(50, 100, 50);
    directionalLight.castShadow = true;
    
    // Настраиваем параметры теней для охвата большой области
    directionalLight.shadow.camera.near = 0.1;
    directionalLight.shadow.camera.far = 2000; // Увеличиваем максимальную дальность теней
    directionalLight.shadow.camera.left = -1000; // Значительно увеличиваем размер области теней
    directionalLight.shadow.camera.right = 1000;
    directionalLight.shadow.camera.top = 1000;
    directionalLight.shadow.camera.bottom = -1000;
    directionalLight.shadow.mapSize.width = 2048; // Большее разрешение для лучшего качества
    directionalLight.shadow.mapSize.height = 2048;
    directionalLight.shadow.bias = -0.0001; // Уменьшаем артефакты тени
    scene.add(directionalLight);

    // Добавляем вспомогательный свет для подсветки теней
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.3);
    fillLight.position.set(-50, 50, -50);
    scene.add(fillLight);
    
    // Можно добавить помощник для отладки теней (раскомментируйте при необходимости)
    // const helper = new THREE.CameraHelper(directionalLight.shadow.camera);
    // scene.add(helper);
}

function onWindowResize() {
    // Обработка изменения размера окна только для рендерера
    // (камера обрабатывается в camera.js)
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// Добавляем функцию для обновления положения источника света относительно камеры, как солнце
export function updateShadowCamera(camera) {
    if (!directionalLight || !camera) return;
    
    // Получаем направление взгляда камеры
    const cameraDirection = new THREE.Vector3();
    camera.getWorldDirection(cameraDirection);
    
    // Создаем позицию "солнца" относительно камеры
    // Поднимаем "солнце" на 200 единиц вверх от позиции камеры и смещаем немного в сторону и назад
    const sunOffset = new THREE.Vector3(100, 200, -50);
    const sunPosition = camera.position.clone().add(sunOffset);
    
    // Обновляем позицию света
    directionalLight.position.copy(sunPosition);
    
    // Определяем точку, куда направлен свет - перед камерой на расстоянии 100 единиц
    const targetOffset = cameraDirection.clone().multiplyScalar(100);
    const targetPosition = camera.position.clone().add(targetOffset);
    directionalLight.target.position.copy(targetPosition);
    
    // Обновляем матрицу трансформации цели света
    directionalLight.target.updateMatrixWorld();
    
    // Обновляем матрицу камеры теней
    directionalLight.shadow.camera.updateProjectionMatrix();
}

export { onWindowResize };