// objects.js
import * as THREE from 'three';
import { scene } from './scene';
import { localPhysicsWorld } from './physics';

export let objects = {}; // Словарь объектов: id -> { mesh, body, serverPos, ... }

export function createMeshAndBodyForObject(data) {
    console.log("[Objects] Вызов createMeshAndBodyForObject с данными:", data);
    
    if (!data || !data.object_type) {
        console.error("[Objects] Invalid data received for object creation:", data);
        return null;
    }

    const type = data.object_type;
    let mesh, body = null;

    try {
        switch (type) {
            case "terrain":
                console.log("[Objects] Создание terrainMesh");
                mesh = createTerrainMesh(data);
                body = createPhysicsBodyForTerrain(data);
                break;
            case "sphere":
                console.log("[Objects] Создание sphereMesh с параметрами:", {
                    id: data.id,
                    radius: data.radius,
                    position: { x: data.x, y: data.y, z: data.z },
                    color: data.color
                });
                mesh = createSphereMesh(data);
                body = createPhysicsBodyForSphere(data);
                break;
            case "tree":
                console.log("[Objects] Создание treeMesh");
                mesh = createTreeMesh(data);
                break;
            default:
                console.warn(`[Objects] Unknown object type: ${type}`);
                mesh = createDefaultMesh(data);
                break;
        }

        if (!mesh) {
            console.error(`[Objects] Не удалось создать меш для ${type}`);
            return null;
        }
        
        // Устанавливаем позицию для меша
        if (data.x !== undefined || data.y !== undefined || data.z !== undefined) {
            mesh.position.set(
                data.x !== undefined ? data.x : 0,
                data.y !== undefined ? data.y : 0,
                data.z !== undefined ? data.z : 0
            );
            console.log(`[Objects] Установлена позиция для ${type}:`, mesh.position);
        }
        
        // Убедимся, что сцена доступна
        if (!scene) {
            console.error("[Objects] Сцена не инициализирована!");
            return { mesh, body }; // Возвращаем объект без добавления в сцену
        }

        scene.add(mesh);
        console.log(`[Objects] ${type} добавлен на сцену`);
        
        return { mesh, body };
    } catch (error) {
        console.error(`[Objects] Ошибка при создании объекта ${type}:`, error);
        return null;
    }
}

function createPhysicsBodyForTerrain(data) {
    if (typeof Ammo === 'undefined') {
        console.error('Ammo.js не инициализирован');
        return null;
    }

    if (!localPhysicsWorld) {
        console.error('Физический мир не инициализирован');
        return null;
    }

    const w = data.heightmap_w;
    const h = data.heightmap_h;
    const scaleX = data.scale_x;
    const scaleZ = data.scale_z;

    // Создаем буфер в памяти Ammo для данных высот
    const ammoHeightData = Ammo._malloc(4 * w * h);
    
    // Копируем данные высот в память Ammo
    let p = 0;
    let p2 = 0;
    for (let j = 0; j < h; j++) {
        for (let i = 0; i < w; i++) {
            Ammo.HEAPF32[ammoHeightData + p2 >> 2] = data.height_data[p];
            p++;
            p2 += 4;
        }
    }

    // Создаем форму террейна
    const shape = new Ammo.btHeightfieldTerrainShape(
        w,
        h,
        ammoHeightData,
        1,  // heightScale
        data.min_height,
        data.max_height,
        1,  // up axis = 1 для Y
        Ammo.PHY_FLOAT,
        false  // flipQuadEdges
    );

    // Устанавливаем масштабирование
    shape.setLocalScaling(new Ammo.btVector3(scaleX, data.scale_y, scaleZ));
    shape.setMargin(0.5);

    // Создаем трансформацию
    const transform = new Ammo.btTransform();
    transform.setIdentity();
    
    // Важно! Смещаем террейн, так как Bullet центрирует его по ограничивающему боксу
    transform.setOrigin(new Ammo.btVector3(
        data.x || 0,
        (data.min_height + data.max_height) / 2,
        data.z || 0
    ));

    const mass = 0; // Статическое тело
    const localInertia = new Ammo.btVector3(0, 0, 0);
    const motionState = new Ammo.btDefaultMotionState(transform);
    const rbInfo = new Ammo.btRigidBodyConstructionInfo(mass, motionState, shape, localInertia);
    const body = new Ammo.btRigidBody(rbInfo);

    // Добавляем тело в физический мир
    const TERRAIN_GROUP = 1;
    localPhysicsWorld.addRigidBody(body, TERRAIN_GROUP, -1); // Террейн сталкивается со всеми

    // Очистка памяти
    Ammo.destroy(rbInfo);
    Ammo.destroy(localInertia);

    console.log("[Terrain] Физическое тело создано:", {
        размеры: { w, h },
        масштаб: { x: scaleX, y: data.scale_y, z: scaleZ },
        позиция: { 
            x: data.x || 0, 
            y: (data.min_height + data.max_height) / 2,
            z: data.z || 0 
        },
        минВысота: data.min_height,
        максВысота: data.max_height
    });

    return body;
}

function createTerrainMesh(data) {
    const w = data.heightmap_w || 64;
    const h = data.heightmap_h || 64;
    const geo = new THREE.PlaneGeometry(
        w * data.scale_x,
        h * data.scale_z,
        w - 1,
        h - 1
    );
    geo.rotateX(-Math.PI / 2);

    if (data.height_data) {
        const verts = geo.attributes.position.array;
        for (let i = 0; i < verts.length; i += 3) {
            const ix = (i / 3) % w;
            const iz = Math.floor(i / 3 / w);
            verts[i + 1] = data.height_data[iz * w + ix] * data.scale_y;
        }
        geo.computeVertexNormals();
    }

    const mesh = new THREE.Mesh(
        geo,
        new THREE.MeshPhongMaterial({
            color: parseColor(data.color || "#888888"),
            wireframe: false,
            flatShading: true
        })
    );
    
    // Включаем тени для террейна
    mesh.receiveShadow = true;
    
    return mesh;
}

export function createSphereMesh(data) {
    const geo = new THREE.SphereGeometry(data.radius || 1, 32, 32);
    const mesh = new THREE.Mesh(
        geo,
        new THREE.MeshPhongMaterial({ 
            color: parseColor(data.color || "#888888"),
            shininess: 30
        })
    );
    
    // Включаем тени для сфер
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    
    return mesh;
}

function createTreeMesh(data) {
    const group = new THREE.Group();

    if (data.branches && Array.isArray(data.branches)) {
        data.branches.forEach((branch, index) => {
            if (
                branch.startX === undefined ||
                branch.startY === undefined ||
                branch.startZ === undefined ||
                branch.endX === undefined ||
                branch.endY === undefined ||
                branch.endZ === undefined
            ) {
                console.warn(
                    `Branch coordinates are missing or invalid at index ${index}:`,
                    branch
                );
                return;
            }

            const branchGeo = new THREE.CylinderGeometry(
                branch.radiusTop || branch.radius || 0.1,    // верхний радиус
                branch.radiusBottom || branch.radius || 0.2, // нижний радиус
                1,
                8
            );
            const branchMat = new THREE.MeshPhongMaterial({
                color: parseColor(branch.color || "#654321"),
                shininess: 10
            });
            const branchMesh = new THREE.Mesh(branchGeo, branchMat);
            
            // Включаем тени для веток
            branchMesh.castShadow = true;
            branchMesh.receiveShadow = true;

            const midX = (branch.startX + branch.endX) / 2;
            const midY = (branch.startY + branch.endY) / 2;
            const midZ = (branch.startZ + branch.endZ) / 2;

            branchMesh.position.set(midX, midY, midZ);
            branchMesh.lookAt(new THREE.Vector3(branch.endX, branch.endY, branch.endZ));

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
    return new THREE.Mesh(
        geo,
        new THREE.MeshLambertMaterial({ color: parseColor(data.color || "#888888") })
    );
}

function createPhysicsBodyForSphere(data) {
    try {
        if (typeof Ammo === 'undefined') {
            console.error('Ammo.js не инициализирован');
            return null;
        }

        if (!localPhysicsWorld) {
            console.error('Физический мир не инициализирован');
            return null;
        }

        const radius = data.radius || 1;
        const mass = data.mass || 1;

        // Создаем все Ammo объекты через window.Ammo
        const shape = new window.Ammo.btSphereShape(radius);
        const transform = new window.Ammo.btTransform();
        transform.setIdentity();
        transform.setOrigin(new window.Ammo.btVector3(data.x || 0, data.y || 0, data.z || 0));

        const localInertia = new window.Ammo.btVector3(0, 0, 0);
        shape.calculateLocalInertia(mass, localInertia);

        const motionState = new window.Ammo.btDefaultMotionState(transform);
        const rbInfo = new window.Ammo.btRigidBodyConstructionInfo(
            mass,
            motionState,
            shape,
            localInertia
        );
        const body = new window.Ammo.btRigidBody(rbInfo);

        // Добавляем тело в физический мир
        const SPHERE_GROUP = 2;
        localPhysicsWorld.addRigidBody(body, SPHERE_GROUP, -1); // Сферы сталкиваются со всеми

        // Очистка памяти
        window.Ammo.destroy(rbInfo);
        window.Ammo.destroy(localInertia);

        return body;
    } catch (error) {
        console.error('Ошибка при создании физического тела:', error);
        return null;
    }
}

function parseColor(colorStr) {
    if (!colorStr) return 0x888888;
    if (colorStr.startsWith("#")) {
        return parseInt(colorStr.slice(1), 16);
    }
    return 0x888888;
}

export function createTestSphere() {
    console.log("[Objects] Начинаю создание тестовой сферы...");
    try {
        // Создаем визуальную сферу
        const radius = 1;
        const geometry = new THREE.SphereGeometry(radius, 32, 32);
        const material = new THREE.MeshPhongMaterial({ 
            color: 0xff00ff,
            shininess: 30
        });
        const mesh = new THREE.Mesh(geometry, material);
        
        console.log("[Objects] Созданы геометрия и материал для сферы");
        
        // Включаем тени для тестовой сферы
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        
        // Позиционируем сферу высоко над террейном
        const startY = 58; // Высота над террейном
        mesh.position.set(0, startY, 0);
        console.log("[Objects] Установлена позиция сферы:", mesh.position);
        
        if (!scene) {
            console.error("[Objects] Сцена не инициализирована!");
            return null;
        }
        
        scene.add(mesh);
        console.log("[Objects] Сфера добавлена на сцену");
        
        // Проверяем, инициализирован ли Ammo
        if (typeof Ammo === 'undefined' || !Ammo) {
            console.error("[Objects] Ammo.js не инициализирован!");
            
            // Возвращаем объект без физического тела в крайнем случае
            const testSphereObj = {
                mesh,
                body: null,
                object_type: "test_sphere",
                physicsBy: "none" // Без физики
            };
            objects["test_sphere"] = testSphereObj;
            console.log("[Objects] Создан объект сферы без физики:", testSphereObj);
            return testSphereObj;
        }
        
        console.log("[Objects] Создаем физическое тело для сферы...");
        // Создаем физическое тело
        const shape = new Ammo.btSphereShape(radius);
        const mass = 1;
        
        const transform = new Ammo.btTransform();
        transform.setIdentity();
        transform.setOrigin(new Ammo.btVector3(0, startY, 0));

        const localInertia = new Ammo.btVector3(0, 0, 0);
        shape.calculateLocalInertia(mass, localInertia);

        const motionState = new Ammo.btDefaultMotionState(transform);
        const rbInfo = new Ammo.btRigidBodyConstructionInfo(mass, motionState, shape, localInertia);
        const body = new Ammo.btRigidBody(rbInfo);

        // Важные настройки для физического тела
        body.setActivationState(4); // DISABLE_DEACTIVATION
        body.setFriction(0.5);
        body.setRollingFriction(0.1);
        body.setRestitution(0.5); // Упругость
        
        console.log("[Objects] Физическое тело создано и настроено");

        // Проверяем, инициализирован ли физический мир
        if (!localPhysicsWorld) {
            console.error("[Objects] Физический мир не инициализирован!");
            
            // Очистка памяти
            Ammo.destroy(rbInfo);
            Ammo.destroy(localInertia);
            
            const testSphereObj = {
                mesh,
                body: null,
                object_type: "test_sphere",
                physicsBy: "none" // Без физики
            };
            objects["test_sphere"] = testSphereObj;
            console.log("[Objects] Создан объект сферы без физики (нет мира):", testSphereObj);
            return testSphereObj;
        }

        // Добавляем тело в физический мир
        const SPHERE_GROUP = 2;
        localPhysicsWorld.addRigidBody(body, SPHERE_GROUP, -1); // Тестовая сфера сталкивается со всеми
        console.log("[Objects] Тело добавлено в физический мир");

        // Очистка памяти
        Ammo.destroy(rbInfo);
        Ammo.destroy(localInertia);

        // Добавляем объект в наш список объектов
        const testSphereObj = {
            mesh,
            body,
            object_type: "test_sphere",
            physicsBy: "ammo" // Изменено с "both" на "ammo", чтобы управлялось только локальной физикой
        };
        objects["test_sphere"] = testSphereObj;
        console.log("[Objects] Тестовая сфера успешно создана и добавлена в список объектов:", testSphereObj);

        return testSphereObj;
    } catch (error) {
        console.error("[Objects] Ошибка при создании тестовой сферы:", error);
        return null;
    }
}

export function createDebugObjects() {
    console.log("[Debug] Создание отладочных объектов...");
    
    try {
        // Создаем сетку координат для визуализации
        const gridHelper = new THREE.GridHelper(100, 10);
        scene.add(gridHelper);
        console.log("[Debug] Добавлена координатная сетка");
        
        // Создаем отладочную сферу красного цвета
        const debugSphere = new THREE.Mesh(
            new THREE.SphereGeometry(1, 16, 16),
            new THREE.MeshBasicMaterial({ color: 0xff0000, wireframe: true })
        );
        debugSphere.position.set(0, 10, 0); // Позиционируем ее в удобном месте
        scene.add(debugSphere);
        console.log("[Debug] Добавлена отладочная сфера, позиция:", debugSphere.position);
        
        // Создаем направляющую для камеры
        const cameraHelper = new THREE.CameraHelper(camera);
        scene.add(cameraHelper);
        console.log("[Debug] Добавлен помощник камеры");
        
        // Сохраняем отладочные объекты
        window.debugObjects = {
            gridHelper,
            debugSphere,
            cameraHelper
        };
        
        return window.debugObjects;
    } catch (error) {
        console.error("[Debug] Ошибка при создании отладочных объектов:", error);
        return null;
    }
}