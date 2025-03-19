// objects.js
import * as THREE from 'three';
import { scene } from './scene';
import { localPhysicsWorld, createPhysicsObject } from './physics';

export let objects = {}; // Словарь объектов: id -> { mesh, body, serverPos, ... }

export function createMeshAndBodyForObject(obj) {
    console.log("[Objects] Создание объекта:", obj.object_type, obj.id);

    // Создаем меш в зависимости от типа объекта
    let mesh;
    switch (obj.object_type) {
        case "terrain":
            mesh = createTerrainMesh(obj);
            break;
        case "sphere":
            mesh = createSphereMesh(obj);
            break;
        case "tree":
            mesh = createTreeMesh(obj);
            break;
        default:
            console.warn(`Неизвестный тип объекта: ${obj.object_type}`);
            mesh = createDefaultMesh(obj);
            break;
    }

    if (mesh) {
        // Позиционируем и добавляем меш в сцену
        mesh.position.set(obj.x || 0, obj.y || 0, obj.z || 0);
        scene.add(mesh);
        obj.mesh = mesh;
        
        // Создаем физическое тело только для объектов с физикой
        if (obj.object_type === "sphere" || obj.object_type === "terrain") {
            createPhysicsObject(obj);
        }
    }

    // Сохраняем объект в общий список
    objects[obj.id] = obj;
    return obj;
}

function createTerrainMesh(obj) {
    console.log("[Objects] Создание визуальной модели террейна", obj);
    
    // Проверяем наличие необходимых данных
    if (!obj.height_data || !obj.heightmap_w || !obj.heightmap_h) {
        console.error("[Objects] Отсутствуют данные для создания террейна:", obj);
        return new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({color: 0xff0000}));
    }
    
    // Получаем параметры террейна с сервера
    const terrainWidth = obj.heightmap_w;
    const terrainDepth = obj.heightmap_h;
    const scaleX = obj.scale_x || 1;
    const scaleY = obj.scale_y || 1;
    const scaleZ = obj.scale_z || 1;
    
    // Определяем диапазон высот
    const heightData = obj.height_data;
    const minHeight = obj.min_height !== undefined ? obj.min_height : Math.min(...heightData);
    const maxHeight = obj.max_height !== undefined ? obj.max_height : Math.max(...heightData);
    
    console.log("[Objects] Параметры террейна:", {
        ширина: terrainWidth,
        глубина: terrainDepth,
        минВысота: minHeight,
        максВысота: maxHeight,
        масштаб: { x: scaleX, y: scaleY, z: scaleZ }
    });
    
    try {
        // Создаем геометрию плоскости с нужным количеством сегментов
        const geometry = new THREE.PlaneGeometry(
            terrainWidth * scaleX,
            terrainDepth * scaleZ,
            terrainWidth - 1,
            terrainDepth - 1
        );
        
        // Поворачиваем для соответствия координатам в физическом мире
        geometry.rotateX(-Math.PI / 2);
        
        // Применяем данные высот к вершинам
        const positions = geometry.attributes.position.array;
        
        // Для каждой вершины применяем соответствующую высоту
        for (let i = 0, j = 0; i < positions.length; i += 3, j++) {
            const x = Math.floor(j % (terrainWidth));
            const z = Math.floor(j / (terrainWidth));
            
            if (x < terrainWidth && z < terrainDepth) {
                const index = z * terrainWidth + x;
                if (index < heightData.length) {
                    // В повернутой геометрии Y-координата отвечает за высоту
                    positions[i + 1] = heightData[index] * scaleY;
                }
            }
        }
        
        // Обновляем нормали для правильного освещения
        geometry.computeVertexNormals();
        
        // Смещаем геометрию по Y для выравнивания с физическим телом
        geometry.translate(0, (maxHeight + minHeight) / 2 * scaleY, 0);
        
        // Создаем материал
        const material = new THREE.MeshStandardMaterial({
            color: obj.color ? parseColor(obj.color) : 0x5c8a50,
            roughness: 0.8,
            metalness: 0.1,
            flatShading: false,
            side: THREE.DoubleSide
        });
        
        // Создаем меш
        const mesh = new THREE.Mesh(geometry, material);
        mesh.receiveShadow = true;
        mesh.castShadow = true;
        
        console.log("[Objects] Террейн успешно создан");
        return mesh;
    } catch (error) {
        console.error("[Objects] Ошибка при создании террейна:", error);
        // Возвращаем простой меш для отладки
        return new THREE.Mesh(new THREE.PlaneGeometry(10, 10), new THREE.MeshBasicMaterial({color: 0xff0000, wireframe: true}));
    }
}

export function createSphereMesh(data) {
    // Создаем геометрию и материал сферы
    const geometry = new THREE.SphereGeometry(data.radius || 1, 32, 32);
    const material = new THREE.MeshPhongMaterial({ 
        color: parseColor(data.color || "#ff0000"),
        shininess: 30,
        specular: 0x444444
    });
    
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    
    return mesh;
}

function createTreeMesh(data) {
    const group = new THREE.Group();

    // Создаем ветки, если они заданы
    if (data.branches && Array.isArray(data.branches)) {
        data.branches.forEach(branch => {
            // Проверяем наличие необходимых координат
            if (!branch.startX || !branch.startY || !branch.startZ || 
                !branch.endX || !branch.endY || !branch.endZ) {
                return;
            }

            // Создаем геометрию и материал для ветки
            const branchGeo = new THREE.CylinderGeometry(
                branch.radiusTop || branch.radius || 0.1,
                branch.radiusBottom || branch.radius || 0.2,
                1,
                8
            );
            
            const branchMat = new THREE.MeshStandardMaterial({
                color: parseColor(branch.color || "#654321"),
            });
            
            const branchMesh = new THREE.Mesh(branchGeo, branchMat);

            // Позиционируем и ориентируем ветку
            const midX = (branch.startX + branch.endX) / 2;
            const midY = (branch.startY + branch.endY) / 2;
            const midZ = (branch.startZ + branch.endZ) / 2;

            branchMesh.position.set(midX, midY, midZ);
            branchMesh.lookAt(new THREE.Vector3(branch.endX, branch.endY, branch.endZ));

            // Масштабируем ветку по длине
            const length = new THREE.Vector3(
                branch.endX - branch.startX,
                branch.endY - branch.startY,
                branch.endZ - branch.startZ
            ).length();

            branchMesh.scale.set(1, length, 1);
            group.add(branchMesh);
        });
    }

    return group;
}

function createDefaultMesh(data) {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mesh = new THREE.Mesh(
        geo,
        new THREE.MeshLambertMaterial({ color: parseColor(data.color || "#888888") })
    );
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
}

function parseColor(colorStr) {
    if (!colorStr) return 0x888888;
    if (typeof colorStr === 'number') return colorStr;
    if (colorStr.startsWith("#")) {
        return parseInt(colorStr.slice(1), 16);
    }
    return 0x888888;
}