// scene.js
import * as THREE from 'three';
import { stepPhysics, updatePhysicsObjects, objects, physicsSettings, initAmmo, initDebugSpheres } from './physics.js';

export let scene, camera, renderer;

export async function initScene() {
    console.log("[Scene] Начало инициализации сцены");
    
    // Создаем сцену
    scene = new THREE.Scene();
    console.log("[Scene] Сцена создана");

    // Создаем камеру
    camera = new THREE.PerspectiveCamera(
        60,
        window.innerWidth / window.innerHeight,
        0.2,
        2000
    );
    camera.position.set(0, 50, 100);
    camera.lookAt(0, 0, 0);
    console.log("[Scene] Камера инициализирована");

    // Создаем рендерер
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);
    console.log("[Scene] Рендерер создан и добавлен в DOM");

    // Добавляем обработчик изменения размера окна
    window.addEventListener('resize', onWindowResize);

    // Настраиваем освещение
    const ambient = new THREE.AmbientLight(0xffffff, 1.0);
    scene.add(ambient);
    console.log("[Scene] Добавлен ambient свет");

    const directional = new THREE.DirectionalLight(0xffffff, 1.5);
    directional.position.set(50, 200, 100);
    directional.castShadow = true;
    
    directional.shadow.mapSize.width = 2048;
    directional.shadow.mapSize.height = 2048;
    directional.shadow.camera.near = 0.5;
    directional.shadow.camera.far = 500;
    directional.shadow.camera.left = -100;
    directional.shadow.camera.right = 100;
    directional.shadow.camera.top = 100;
    directional.shadow.camera.bottom = -100;
    
    scene.add(directional);
    console.log("[Scene] Добавлен directional свет");

    // Настройка теней
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    console.log("[Scene] Тени включены");

    // Устанавливаем цвет фона
    scene.background = new THREE.Color(0x87ceeb);
    console.log("[Scene] Установлен цвет фона");

    // Включаем режим отладки физики
    physicsSettings.debugMode = true;

    // Инициализируем физику
    console.log("[Scene] Начало инициализации физики");
    try {
        await initAmmo();
        console.log("[Scene] Физика успешно инициализирована");
    } catch (error) {
        console.error("[Scene] Ошибка при инициализации физики:", error);
        throw error;
    }

    // Создаем отладочные сферы
    console.log("[Scene] Создание отладочных сфер");
    try {
        const debugSpheres = initDebugSpheres(scene);
        console.log("[Scene] Отладочные сферы созданы:", debugSpheres);
        
        // Проверяем, что сферы добавлены в сцену
        const sphereIds = Object.keys(objects).filter(id => 
            objects[id].object_type === "sphere");
        console.log("[Scene] Сферы в сцене:", sphereIds);
        
        // Проверяем, что у синей сферы есть физическое тело
        const localSphere = objects["local_sphere"];
        if (localSphere) {
            console.log("[Scene] Локальная сфера:", {
                id: localSphere.id,
                position: localSphere.mesh.position,
                hasBody: !!localSphere.body
            });
        } else {
            console.warn("[Scene] Локальная сфера не создана!");
        }
    } catch (error) {
        console.error("[Scene] Ошибка при создании отладочных сфер:", error);
        throw error;
    }

    console.log("[Scene] Инициализация сцены завершена");
    return scene;
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

export { onWindowResize };

function createTerrainMaterial() {
    const material = new THREE.MeshStandardMaterial({
        color: 0x3b7d3b,      // Зеленоватый цвет
        roughness: 0.8,       // Высокая шероховатость
        metalness: 0.1,       // Низкая металличность
        flatShading: false,   // Плавное затенение
        wireframe: false,     // Отключаем режим wireframe
        side: THREE.DoubleSide // Отображаем обе стороны полигонов
    });

    return material;
}

function createTerrainMesh(obj) {
    const geometry = new THREE.PlaneGeometry(
        obj.width || 100,
        obj.height || 100,
        obj.heightmap_w - 1,
        obj.heightmap_h - 1
    );

    // Применяем данные высот к геометрии
    for (let i = 0; i < geometry.vertices.length; i++) {
        geometry.vertices[i].z = obj.height_data[i];
    }

    geometry.computeVertexNormals(); // Важно для правильного освещения
    geometry.computeFaceNormals();   // Важно для правильного освещения

    const mesh = new THREE.Mesh(geometry, createTerrainMaterial());
    mesh.receiveShadow = true;
    mesh.castShadow = true;

    return mesh;
}