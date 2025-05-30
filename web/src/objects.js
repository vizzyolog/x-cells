// objects.js
import * as THREE from 'three';
import { scene } from './scene.js';
import { 
    getPhysicsWorld,
    applyPhysicsConfig,
    receiveObjectUpdate,
    stepPhysics,
    updatePhysicsObjects
} from './physics.js';
import gameStateManager from './gamestatemanager.js';
import { EventEmitter } from 'events';
import { addEyesToSphere } from './eyes.js'; // Импортируем систему глаз

export const terrainCreated = new EventEmitter();
export const playerCreated = new EventEmitter();

export let objects = {}; // Словарь объектов: id -> { mesh, body, serverPos, ... }
export let terrainMesh; // Экспортируем terrainMesh
export let playerMesh; // Экспортируем playerMesh

export function createMeshAndBodyForObject(data) {
    if (!data || !data.object_type) {
        console.error("Invalid data received for object creation:", data);
        return null;
    }

    const type = data.object_type;
    let mesh = null, body = null;

    try {
        // Создаем меш в любом случае
        switch (type) {
            case "terrain":
                mesh = createTerrainMesh(data);
                body = createPhysicsBodyForTerrain(data);
                break;
            case "sphere":
                mesh = createSphereMesh(data);
                body = createPhysicsBodyForSphere(data);
                break;
            case "tree":
                mesh = createTreeMesh(data);
                break;
            case "box":
                mesh = createBoxMesh(data);
                body = createPhysicsBodyForBox(data);
                break;
            default:
                console.warn(`Unknown object type: ${type}`);
                return null;
        }

        // Проверяем, что mesh был успешно создан
        if (!mesh) {
            console.error(`Failed to create mesh for object type: ${type}`);
            return null;
        }

        scene.add(mesh);
        
        // Сохраняем в объекте исходные данные, включая массу
        const result = { 
            mesh, 
            body, 
            object_type: type, 
            mass: data.mass || 0, // Сохраняем массу из данных сервера
            physicsBy: data.physics_by
        };
        
        console.warn("[Objects] Создан объект:", {
            id: data.id,
            type: data.object_type,
            physics_by: data.physics_by,
            mass: data.mass,
            position: { x: data.x, y: data.y, z: data.z },
            radius: data.radius,
            color: data.color,
            server_time: data.server_time,
            hasBody: !!body,
            hasMesh: !!mesh
        });
        
        return result;
    } catch (error) {
        console.error(`Ошибка при создании объекта типа ${type}:`, error);
        // Если mesh был создан, но произошла ошибка, удаляем его из сцены
        if (mesh) {
            scene.remove(mesh);
        }
        return null;
    }
}

function createPhysicsBodyForTerrain(data) {
    const physicsWorld = getPhysicsWorld();
    if (!physicsWorld) {
        console.error("[Objects] Физический мир не инициализирован");
        return null;
    }

    if (typeof Ammo === 'undefined') {
        console.error('Ammo.js не инициализирован');
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
    
    // Устанавливаем margin для террейна (0.5 вместо 2.0, так как террейн меньше)
    shape.setMargin(0.5);
    
    console.log("[Terrain] Установлен margin террейна:", 0.5);

    // Создаем трансформацию
    const transform = new Ammo.btTransform();
    transform.setIdentity();
    
    const mass = 0; // Статическое тело
    const localInertia = new Ammo.btVector3(0, 0, 0);
    const motionState = new Ammo.btDefaultMotionState(transform);
    const rbInfo = new Ammo.btRigidBodyConstructionInfo(mass, motionState, shape, localInertia);
    const body = new Ammo.btRigidBody(rbInfo);

    // Добавляем тело в физический мир
    const TERRAIN_GROUP = 1;
    physicsWorld.addRigidBody(body, TERRAIN_GROUP, -1); // Террейн сталкивается со всеми

    // Очистка памяти
    Ammo.destroy(rbInfo);
    Ammo.destroy(localInertia);

    console.log("[Terrain] Физическое тело создано:", {
        размеры: { w, h },
        масштаб: { x: data.scaleX, y: data.scale_y, z: data.scaleZ },
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

    terrainMesh = new THREE.Mesh( // Присваиваем mesh переменной terrainMesh
        geo,
        new THREE.MeshPhongMaterial({
            color: parseColor(data.color || "#0000ff"),
            wireframe: false,
            flatShading: true
        })
    );
    
    // Включаем тени для террейна
    terrainMesh.receiveShadow = true;

    gameStateManager.setTerrainMesh(terrainMesh);
    return terrainMesh;
}

export function createSphereMesh(data) {
    try {
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
        
        // Проверяем, является ли этот объект игроком текущего клиента
        const playerObjectID = gameStateManager.getPlayerObjectID();
        if (playerObjectID && data.id === playerObjectID) {
            playerMesh = mesh;
            gameStateManager.setPlayerMesh(playerMesh);
            
            // Добавляем глаза к сфере игрока
            addEyesToSphere(mesh);
            
            console.log(`[Objects] Установлен playerMesh для объекта ${data.id} с глазами`);
        } else {
            // Если player ID еще не получен, объект может быть установлен позже в network.js
            console.log(`[Objects] Создан объект ${data.id}, player ID: ${playerObjectID || 'не получен'}`);
        }

        return mesh;
    } catch (error) {
        console.error("Ошибка при создании меша сферы:", error);
        return null;
    }
}

function createBoxMesh(data) {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    return new THREE.Mesh(
        geo,
        new THREE.MeshLambertMaterial({ color: parseColor(data.color || "#888888") })
    );
}

function createPhysicsBodyForSphere(data) {
    const physicsWorld = getPhysicsWorld();
    if (!physicsWorld) {
        console.error("[Objects] Физический мир не инициализирован");
        return null;
    }

    try {
        if (typeof Ammo === 'undefined') {
            console.error('Ammo.js не инициализирован');
            return null;
        }

        if (!physicsWorld) {
            console.error('Физический мир не инициализирован');
            return null;
        }

        // Безопасная проверка window.Ammo
        if (typeof window.Ammo === 'undefined') {
            console.error('window.Ammo не инициализирован');
            return null;
        }

        const radius = data.radius;
       
        const mass = data.mass;

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
        
        // Проверяем, что тело имеет необходимые методы
        if (!body || typeof body.getMotionState !== 'function') {
            console.error('Ошибка: созданное физическое тело недействительно');
            window.Ammo.destroy(rbInfo);
            window.Ammo.destroy(localInertia);
            return null;
        }
        
        // Устанавливаем дополнительные свойства
        body.setFriction(1.0);          // Максимальное трение для контроля
        body.setRollingFriction(0.3);   // Увеличиваем сопротивление качению
        body.setRestitution(0.0);       // Полностью убираем отскок  
        body.setDamping(0.2, 0.3);      // Добавляем затухание для остановки
        
        // Отключаем деактивацию
        body.setActivationState(4); // DISABLE_DEACTIVATION
        
        // Для небольших сфер включаем CCD (continuous collision detection),
        // чтобы предотвратить проваливание сквозь поверхности при высокой скорости
        body.setCcdMotionThreshold(radius * 0.7);
        body.setCcdSweptSphereRadius(radius * 0.6);

        // Добавляем тело в физический мир
        const SPHERE_GROUP = 2;
        physicsWorld.addRigidBody(body, SPHERE_GROUP, -1); // Сферы сталкиваются со всеми
        
        console.log("[Sphere] Физическое тело создано:", {
            radius,
            mass,
            position: {
                x: data.x || 0,
                y: data.y || 0,
                z: data.z || 0
            },
            ccd: {
                motionThreshold: radius * 0.7,
                sweptSphereRadius: radius * 0.6
            },
            friction: 1.0,
            restitution: 0.0
        });

        // Очистка памяти
        window.Ammo.destroy(rbInfo);
        window.Ammo.destroy(localInertia);

        return body;
    } catch (error) {
        console.error('Ошибка при создании физического тела:', error);
        return null;
    }
}

function createPhysicsBodyForBox(data) {
    const physicsWorld = getPhysicsWorld();
    if (!physicsWorld) {
        console.error("[Objects] Физический мир не инициализирован");
        return null;
    }

    try {
        if (typeof Ammo === 'undefined') {
            console.error('Ammo.js не инициализирован');
            return null;
        }

        if (!physicsWorld) {
            console.error('Физический мир не инициализирован');
            return null;
        }

        const width = data.width || 1;
        const height = data.height || 1;
        const depth = data.depth || 1;
        const mass = data.mass || 1;

        // Создаем все Ammo объекты через window.Ammo
        const shape = new window.Ammo.btBoxShape(new window.Ammo.btVector3(width/2, height/2, depth/2));
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
        
        // Настраиваем физические свойства
        body.setFriction(0.5);
        body.setRollingFriction(0.1);
        body.setRestitution(0.2); // Немного уменьшаем упругость для стабильности
        body.setDamping(0.01, 0.01); // Небольшое линейное и угловое затухание
        
        // Включаем CCD для предотвращения проваливания сквозь террейн
        const maxDimension = Math.max(width, height, depth);
        body.setCcdMotionThreshold(maxDimension * 0.8); // Увеличиваем порог для активации CCD
        body.setCcdSweptSphereRadius(maxDimension * 0.7); // Радиус сферы для CCD
        
        // Отключаем деактивацию
        body.setActivationState(4); // DISABLE_DEACTIVATION

        // Добавляем тело в физический мир
        const BOX_GROUP = 3;
        physicsWorld.addRigidBody(body, BOX_GROUP, -1); // Коробки сталкиваются со всеми
        
        console.log("[Box] Физическое тело создано:", {
            dimensions: {
                width,
                height,
                depth
            },
            mass,
            position: {
                x: data.x || 0,
                y: data.y || 0,
                z: data.z || 0
            },
            ccd: {
                motionThreshold: maxDimension * 0.8,
                sweptSphereRadius: maxDimension * 0.7
            },
            friction: 0.5,
            restitution: 0.2
        });

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
    // Создаем визуальную сферу
    const radius = 1;
    const geometry = new THREE.SphereGeometry(radius, 32, 32);
    const material = new THREE.MeshPhongMaterial({ 
        color: 0xff00ff,
        shininess: 30
    });
    const mesh = new THREE.Mesh(geometry, material);
    
    // Включаем тени для тестовой сферы
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    
    // Позиционируем сферу высоко над террейном
    const startY = 58; // Высота над террейном
    mesh.position.set(0, startY, 0);
    scene.add(mesh);

    // Создаем физическое тело
    const shape = new Ammo.btSphereShape(radius);
    const mass = 5; // Увеличиваем массу с 3 до 5
    
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
    body.setFriction(1.0);          // Максимальное трение для контроля
    body.setRollingFriction(0.3);   // Увеличиваем сопротивление качению
    body.setRestitution(0.0);       // Полностью убираем отскок  
    body.setDamping(0.2, 0.3);      // Добавляем затухание для остановки

    // Включаем CCD для предотвращения проваливания сквозь объекты
    body.setCcdMotionThreshold(radius * 0.6);
    body.setCcdSweptSphereRadius(radius * 0.5);

    // Добавляем тело в физический мир
    const SPHERE_GROUP = 2;
    const physicsWorld = getPhysicsWorld();
    physicsWorld.addRigidBody(body, SPHERE_GROUP, -1); // Тестовая сфера сталкивается со всеми

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

    return testSphereObj;
}