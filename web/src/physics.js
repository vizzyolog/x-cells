// physics.js
import * as THREE from 'three';

export let localPhysicsWorld = null;
let ammoPromise = null;
export const objects = {};  // Хранилище для всех объектов

// Добавляем глобальные настройки физики
export const physicsSettings = {
    useServerPhysics: false,  // false = локальная физика, true = серверная физика
    interpolationAlpha: 0.1,  // Коэффициент интерполяции для серверных данных
    debugMode: true,         // Включает вывод отладочной информации
    sphereOffset: 2.0        // Расстояние между сферами для дебага
};

// Функция для переключения режима физики
export function togglePhysicsMode() {
    physicsSettings.useServerPhysics = !physicsSettings.useServerPhysics;
    console.log(`[Physics] Переключение режима на: ${physicsSettings.useServerPhysics ? 'серверную' : 'локальную'} физику`);
}

export async function initAmmo() {
    if (ammoPromise) {
        return ammoPromise;
    }

    ammoPromise = new Promise((resolve, reject) => {
        // Проверяем, загружен ли уже Ammo.js через CDN
        if (typeof Ammo !== 'undefined') {
            console.log("[Ammo] Скрипт уже загружен через CDN, инициализация...");
            Ammo().then((AmmoLib) => {
                window.Ammo = AmmoLib;
                
                // Инициализируем физический мир после загрузки Ammo
                const collisionConfiguration = new AmmoLib.btDefaultCollisionConfiguration();
                const dispatcher = new AmmoLib.btCollisionDispatcher(collisionConfiguration);
                const broadphase = new AmmoLib.btDbvtBroadphase();
                const solver = new AmmoLib.btSequentialImpulseConstraintSolver();
                localPhysicsWorld = new AmmoLib.btDiscreteDynamicsWorld(
                    dispatcher,
                    broadphase,
                    solver,
                    collisionConfiguration
                );
                localPhysicsWorld.setGravity(new AmmoLib.btVector3(0, -9.81, 0));
                
                console.log("[Ammo] Инициализация успешна");
                resolve(AmmoLib);
            }).catch(reject);
            return;
        }

        // Если Ammo не загружен через CDN, загружаем его динамически
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/ammo.js@latest/builds/ammo.wasm.js';
        script.async = true;
        
        script.onload = () => {
            console.log("[Ammo] Скрипт загружен, инициализация...");
            Ammo().then((AmmoLib) => {
                window.Ammo = AmmoLib;
                
                // Инициализируем физический мир после загрузки Ammo
                const collisionConfiguration = new AmmoLib.btDefaultCollisionConfiguration();
                const dispatcher = new AmmoLib.btCollisionDispatcher(collisionConfiguration);
                const broadphase = new AmmoLib.btDbvtBroadphase();
                const solver = new AmmoLib.btSequentialImpulseConstraintSolver();
                localPhysicsWorld = new AmmoLib.btDiscreteDynamicsWorld(
                    dispatcher,
                    broadphase,
                    solver,
                    collisionConfiguration
                );
                localPhysicsWorld.setGravity(new AmmoLib.btVector3(0, -9.81, 0));
                
                console.log("[Ammo] Инициализация успешна");
                resolve(AmmoLib);
            }).catch(reject);
        };
        
        script.onerror = (error) => {
            console.error("[Ammo] Ошибка загрузки скрипта:", error);
            reject(error);
        };

        document.body.appendChild(script);
    });

    return ammoPromise;
}

export function stepPhysics(deltaTime) {
    if (!localPhysicsWorld) {
        console.warn("[Physics] Физический мир не инициализирован");
        return;
    }
    
    // Проверяем, есть ли объекты с физикой
    let hasPhysicsObjects = false;
    for (let id in objects) {
        if (objects[id].body) {
            hasPhysicsObjects = true;
            break;
        }
    }
    
    if (!hasPhysicsObjects) {
        console.warn("[Physics] Нет объектов с физикой для симуляции");
    }

    // Используем фиксированный шаг времени для стабильности
    const fixedTimeStep = 1/60;
    const maxSubSteps = 10;
    
    // Передаем реальное deltaTime и максимальное количество подшагов
    localPhysicsWorld.stepSimulation(deltaTime, maxSubSteps, fixedTimeStep);
    
    if (physicsSettings.debugMode) {
        console.log("[Physics] Шаг физической симуляции выполнен, deltaTime:", deltaTime);
        
        // Проверяем состояние синей сферы
        const localSphere = objects["local_sphere"];
        if (localSphere && localSphere.body) {
            const transform = new window.Ammo.btTransform();
            localSphere.body.getMotionState().getWorldTransform(transform);
            const pos = transform.getOrigin();
            const vel = localSphere.body.getLinearVelocity();
            console.log("[Physics] Состояние синей сферы:", {
                позиция: {
                    x: pos.x(),
                    y: pos.y(),
                    z: pos.z()
                },
                скорость: {
                    x: vel.x(),
                    y: vel.y(),
                    z: vel.z()
                },
                активна: localSphere.body.isActive()
            });
            
            // Если сфера не активна, активируем её
            if (!localSphere.body.isActive()) {
                console.log("[Physics] Активируем синюю сферу");
                localSphere.body.activate(true);
            }
        } else {
            console.warn("[Physics] Синяя сфера не найдена или не имеет физического тела");
        }
    }
}

export function updatePhysicsObjects(objects) {
    for (let id in objects) {
        const obj = objects[id];
        if (!obj.mesh) continue;

        // Для серверной (красной) сферы просто обновляем позицию из серверных данных
        if (obj.isServerControlled) {
            if (obj.serverPos) {
                // Если синей сферы еще нет, создаем её
                if (!objects["local_sphere"]) {
                    console.log("[Physics] Создаем синюю сферу рядом с красной");
                    const localSphere = {
                        id: "local_sphere",
                        object_type: "sphere",
                        x: obj.serverPos.x + physicsSettings.sphereOffset,
                        y: obj.serverPos.y,
                        z: obj.serverPos.z,
                        mass: 1.0,
                        radius: 1.0,
                        color: "#0000ff",
                        isLocalControlled: true
                    };

                    // Создаем THREE.js меш
                    const geometry = new THREE.SphereGeometry(localSphere.radius, 32, 32);
                    const material = new THREE.MeshPhongMaterial({ 
                        color: localSphere.color,
                        shininess: 30,
                        specular: 0x444444
                    });
                    
                    localSphere.mesh = new THREE.Mesh(geometry, material);
                    localSphere.mesh.position.set(localSphere.x, localSphere.y, localSphere.z);
                    
                    // Добавляем в сцену
                    obj.mesh.parent.add(localSphere.mesh);
                    
                    // Создаем физику для синей сферы
                    createPhysicsObject(localSphere);
                    
                    // Сохраняем в объекты
                    objects["local_sphere"] = localSphere;
                }

                // Обновляем позицию красной сферы
                obj.mesh.position.copy(obj.serverPos);
                if (obj.serverRot) {
                    obj.mesh.quaternion.copy(obj.serverRot);
                }
            }
            continue;
        }

        // Для локальной (синей) сферы используем только локальную физику
        if (obj.isLocalControlled && obj.body) {
            const trans = new window.Ammo.btTransform();
            obj.body.getMotionState().getWorldTransform(trans);
            const pos = trans.getOrigin();
            const rot = trans.getRotation();
            
            obj.mesh.position.set(pos.x(), pos.y(), pos.z());
            obj.mesh.quaternion.set(rot.x(), rot.y(), rot.z(), rot.w());

            if (physicsSettings.debugMode) {
                console.log("[Physics] Позиция синей сферы:", {
                    x: pos.x(),
                    y: pos.y(),
                    z: pos.z()
                });
            }
            continue;
        }
    }
}

export function createDebugSpheres() {
    console.log("[Physics] Создание параметров для отладочных сфер");
    
    const radius = 1.0;
    const mass = 1.0;
    const startHeight = 30.0;

    // Создаем синюю сферу рядом с позицией красной
    const localSphere = {
        id: "local_sphere",
        object_type: "sphere",
        x: physicsSettings.sphereOffset,  // Смещаем вправо от красной сферы
        y: startHeight,
        z: 0,
        mass: mass,
        radius: radius,
        color: "#0000ff",
        isLocalControlled: true
    };

    console.log("[Physics] Параметры отладочной сферы:", localSphere);
    return [localSphere];
}

export function createPhysicsObject(obj) {
    if (!localPhysicsWorld) {
        console.warn("[Physics] Физический мир не инициализирован");
        return;
    }

    // Пропускаем создание физики для серверной сферы и деревьев
    if (obj.isServerControlled || obj.object_type === "tree") {
        return;
    }

    let shape;
    let transform;
    let motionState;
    let body;

    transform = new window.Ammo.btTransform();
    transform.setIdentity();
    transform.setOrigin(new window.Ammo.btVector3(obj.x, obj.y, obj.z));

    // Создаем физическое тело в зависимости от типа объекта
    switch (obj.object_type) {
        case "sphere":
            shape = new window.Ammo.btSphereShape(obj.radius);
            // Для сферы устанавливаем параметры физики
            obj.mass = obj.mass || 1;
            console.log("[Physics] Создание физики для сферы:", obj.id);

            // Настраиваем параметры физики для более реалистичного поведения
            const restitution = 0.7;  // Коэффициент упругости
            const friction = 0.5;     // Коэффициент трения
            const rollingFriction = 0.1; // Коэффициент трения качения
            
            // Создаем rigid body с этими параметрами
            const localInertia = new window.Ammo.btVector3(0, 0, 0);
            shape.calculateLocalInertia(obj.mass, localInertia);
            
            const motionState = new window.Ammo.btDefaultMotionState(transform);
            const sphereRbInfo = new window.Ammo.btRigidBodyConstructionInfo(obj.mass, motionState, shape, localInertia);
            
            // Применяем параметры к rigid body
            body = new window.Ammo.btRigidBody(sphereRbInfo);
            body.setRestitution(restitution);
            body.setFriction(friction);
            body.setRollingFriction(rollingFriction);
            
            // Активируем тело и добавляем его в мир
            body.activate(true);
            localPhysicsWorld.addRigidBody(body);
            
            // Сохраняем тело в объект
            obj.body = body;
            
            // Очищаем память
            window.Ammo.destroy(sphereRbInfo);
            window.Ammo.destroy(localInertia);
            
            console.log("[Physics] Физические параметры сферы установлены:", {
                масса: obj.mass,
                упругость: restitution,
                трение: friction,
                трениеКачения: rollingFriction
            });
            
            return;
            break;
        case "terrain":
            const heightData = new Float32Array(obj.height_data);
            const minHeight = Math.min(...heightData);
            const maxHeight = Math.max(...heightData);
            
            console.log("[Physics] Параметры террейна:", {
                размеры: {
                    width: obj.heightmap_w,
                    height: obj.heightmap_h,
                    minHeight,
                    maxHeight
                },
                масштаб: {
                    x: obj.scale_x,
                    y: obj.scale_y,
                    z: obj.scale_z
                }
            });
            
            // Создаем новый массив с перевернутыми данными высот
            const flippedHeightData = new Float32Array(heightData.length);
            for (let i = 0; i < obj.heightmap_w; i++) {
                for (let j = 0; j < obj.heightmap_h; j++) {
                    flippedHeightData[j * obj.heightmap_w + i] = 
                        heightData[(obj.heightmap_h - 1 - j) * obj.heightmap_w + i];
                }
            }
            
            shape = new window.Ammo.btHeightfieldTerrainShape(
                obj.heightmap_w,
                obj.heightmap_h,
                flippedHeightData,
                1,
                minHeight,
                maxHeight,
                1,     // up axis = 1 for Y
                true   // flip quad edges
            );
            
            const scaleX = obj.scale_x || 1;
            const scaleY = obj.scale_y || 1;
            const scaleZ = obj.scale_z || 1;
            shape.setLocalScaling(new window.Ammo.btVector3(scaleX, scaleY, scaleZ));
            
            obj.mass = 0; // Террейн всегда статичный
            
            // Создаем rigid body для террейна
            motionState = new window.Ammo.btDefaultMotionState(transform);
            const terrainRbInfo = new window.Ammo.btRigidBodyConstructionInfo(obj.mass, motionState, shape, new window.Ammo.btVector3(0, 0, 0));
            body = new window.Ammo.btRigidBody(terrainRbInfo);
            
            // Устанавливаем как статическое тело
            body.setCollisionFlags(1); // CF_STATIC_OBJECT
            
            // Добавляем тело в мир с правильными параметрами коллизии
            localPhysicsWorld.addRigidBody(body);
            
            // Сохраняем тело в объект
            obj.body = body;
            
            console.log("[Physics] Физика для террейна создана успешно:", {
                restitution: body.getRestitution(),
                friction: body.getFriction(),
                rollingFriction: body.getRollingFriction()
            });
            
            return;
            break;
        default:
            console.warn("[Physics] Пропуск создания физики для типа:", obj.object_type);
            return;
    }
}

// Добавляем кнопку для отладки физики
const debugButton = document.createElement('button');
debugButton.style.position = 'fixed';
debugButton.style.top = '10px';
debugButton.style.right = '10px';
debugButton.style.zIndex = '1000';
debugButton.style.padding = '10px';
debugButton.style.backgroundColor = '#4CAF50';
debugButton.style.color = 'white';
debugButton.style.border = 'none';
debugButton.style.borderRadius = '5px';
debugButton.style.cursor = 'pointer';
debugButton.textContent = 'Toggle Physics Mode';
debugButton.onclick = () => {
    togglePhysicsMode();
    debugButton.textContent = `Physics: ${physicsSettings.useServerPhysics ? 'Server' : 'Local'}`;
};
document.body.appendChild(debugButton);

// Добавляем кнопку для применения импульса к сфере
const impulseButton = document.createElement('button');
impulseButton.style.position = 'fixed';
impulseButton.style.top = '60px';
impulseButton.style.right = '10px';
impulseButton.style.zIndex = '1000';
impulseButton.style.padding = '10px';
impulseButton.style.backgroundColor = '#2196F3';
impulseButton.style.color = 'white';
impulseButton.style.border = 'none';
impulseButton.style.borderRadius = '5px';
impulseButton.style.cursor = 'pointer';
impulseButton.textContent = 'Apply Impulse (Up)';
impulseButton.onclick = () => {
    console.log("[Physics] Применяем импульс вверх к синей сфере");
    applyImpulseToSphere('SPACE', objects);
};
document.body.appendChild(impulseButton);

// Добавляем кнопку для сброса позиции сферы
const resetButton = document.createElement('button');
resetButton.style.position = 'fixed';
resetButton.style.top = '110px';
resetButton.style.right = '10px';
resetButton.style.zIndex = '1000';
resetButton.style.padding = '10px';
resetButton.style.backgroundColor = '#f44336';
resetButton.style.color = 'white';
resetButton.style.border = 'none';
resetButton.style.borderRadius = '5px';
resetButton.style.cursor = 'pointer';
resetButton.textContent = 'Reset Sphere';
resetButton.onclick = () => {
    console.log("[Physics] Сбрасываем позицию синей сферы");
    const localSphere = objects["local_sphere"];
    if (localSphere && localSphere.body) {
        // Сбрасываем позицию и скорость
        const transform = new window.Ammo.btTransform();
        transform.setIdentity();
        transform.setOrigin(new window.Ammo.btVector3(physicsSettings.sphereOffset, 30, 0));
        
        localSphere.body.getMotionState().setWorldTransform(transform);
        localSphere.body.setCenterOfMassTransform(transform);
        
        // Сбрасываем скорость
        const zero = new window.Ammo.btVector3(0, 0, 0);
        localSphere.body.setLinearVelocity(zero);
        localSphere.body.setAngularVelocity(zero);
        
        // Активируем тело
        localSphere.body.activate(true);
        
        console.log("[Physics] Позиция синей сферы сброшена");
    } else {
        console.warn("[Physics] Локальная сфера не найдена");
    }
};
document.body.appendChild(resetButton);

// Обновляем функцию применения импульса
export function applyImpulseToSphere(cmd, objects) {
    const IMPULSE_STRENGTH = 10;

    // Получаем обе сферы
    const localSphere = objects["local_sphere"];
    const serverSphere = objects["server_sphere"];

    if (!localSphere || !localSphere.body) {
        console.warn("[Physics] Локальная сфера не найдена");
        return;
    }

    const impulse = new window.Ammo.btVector3(0, 0, 0);
    if (cmd === "LEFT") impulse.setValue(-IMPULSE_STRENGTH, 0, 0);
    if (cmd === "RIGHT") impulse.setValue(IMPULSE_STRENGTH, 0, 0);
    if (cmd === "UP") impulse.setValue(0, 0, -IMPULSE_STRENGTH);
    if (cmd === "DOWN") impulse.setValue(0, 0, IMPULSE_STRENGTH);
    if (cmd === "SPACE") impulse.setValue(0, IMPULSE_STRENGTH * 1.5, 0);

    // Применяем импульс к локальной сфере
    localSphere.body.activate(true);
    localSphere.body.applyCentralImpulse(impulse);

    if (physicsSettings.debugMode) {
        const velocity = localSphere.body.getLinearVelocity();
        console.log("[Physics] Состояние локальной сферы:", {
            команда: cmd,
            позиция: localSphere.mesh.position,
            скорость: {
                x: velocity.x(),
                y: velocity.y(),
                z: velocity.z()
            }
        });
    }
}

export function initDebugSpheres(scene) {
    console.log("[Physics] Начало создания отладочных сфер");
    
    if (!scene) {
        console.error("[Physics] Сцена не передана в initDebugSpheres");
        return [];
    }
    
    // Удаляем существующие сферы, если они есть
    if (objects["local_sphere"]) {
        console.log("[Physics] Удаляем существующую синюю сферу");
        if (objects["local_sphere"].mesh && objects["local_sphere"].mesh.parent) {
            objects["local_sphere"].mesh.parent.remove(objects["local_sphere"].mesh);
        }
        delete objects["local_sphere"];
    }
    
    const debugSpheres = createDebugSpheres();
    console.log("[Physics] Создано сфер:", debugSpheres.length);
    
    debugSpheres.forEach(sphere => {
        console.log("[Physics] Создание сферы:", sphere.id);
        
        const geometry = new THREE.SphereGeometry(sphere.radius, 32, 32);
        const material = new THREE.MeshPhongMaterial({ 
            color: sphere.color,
            shininess: 30,
            specular: 0x444444
        });
        
        sphere.mesh = new THREE.Mesh(geometry, material);
        sphere.mesh.position.set(sphere.x, sphere.y, sphere.z);
        sphere.mesh.castShadow = true;
        sphere.mesh.receiveShadow = true;
        
        // Добавляем сферу в объекты и на сцену
        objects[sphere.id] = sphere;
        scene.add(sphere.mesh);
        console.log("[Physics] Сфера добавлена в сцену:", sphere.id);
        
        // Создаем физику только для локальной (синей) сферы
        if (sphere.isLocalControlled) {
            try {
                createPhysicsObject(sphere);
                console.log("[Physics] Физика создана для сферы:", sphere.id, "body:", !!sphere.body);
                
                // Проверяем, что физика создана правильно
                if (!sphere.body) {
                    console.error("[Physics] Физическое тело не создано для сферы:", sphere.id);
                }
            } catch (error) {
                console.error("[Physics] Ошибка при создании физики для сферы:", sphere.id, error);
            }
        }
    });
    
    return debugSpheres;
}

// Функция для создания локальной синей сферы
export function createLocalSphere(scene) {
    if (!localPhysicsWorld) {
        console.error("[Physics] Физический мир не инициализирован. Сначала вызовите initAmmo()");
        return null;
    }

    console.log("[Physics] Создание локальной синей сферы...");
    
    // Создаем синюю сферу
    const sphere = {
        id: "local_sphere",
        object_type: "sphere",
        x: physicsSettings.sphereOffset/2,
        y: 30,
        z: 0,
        mass: 1.0,
        radius: 1.0,
        color: "#0000ff",
        isLocalControlled: true
    };

    // Создаем THREE.js меш
    const geometry = new THREE.SphereGeometry(sphere.radius, 32, 32);
    const material = new THREE.MeshPhongMaterial({ 
        color: sphere.color,
        shininess: 30,
        specular: 0x444444
    });
    
    sphere.mesh = new THREE.Mesh(geometry, material);
    sphere.mesh.position.set(sphere.x, sphere.y, sphere.z);
    sphere.mesh.castShadow = true;
    sphere.mesh.receiveShadow = true;
    
    // Добавляем в сцену
    scene.add(sphere.mesh);
    
    // Создаем физическое тело
    const shape = new window.Ammo.btSphereShape(sphere.radius);
    const transform = new window.Ammo.btTransform();
    transform.setIdentity();
    transform.setOrigin(new window.Ammo.btVector3(sphere.x, sphere.y, sphere.z));
    
    const mass = sphere.mass;
    const localInertia = new window.Ammo.btVector3(0, 0, 0);
    shape.calculateLocalInertia(mass, localInertia);
    
    const motionState = new window.Ammo.btDefaultMotionState(transform);
    const rbInfo = new window.Ammo.btRigidBodyConstructionInfo(mass, motionState, shape, localInertia);
    const body = new window.Ammo.btRigidBody(rbInfo);
    
    // Настройки физики
    body.setRestitution(0.7);
    body.setFriction(0.5);
    body.setRollingFriction(0.1);
    body.activate(true);
    
    // Добавляем тело в физический мир
    localPhysicsWorld.addRigidBody(body);
    sphere.body = body;
    
    // Сохраняем в объекты
    objects[sphere.id] = sphere;
    
    console.log("[Physics] Локальная синяя сфера создана успешно");
    return sphere;
}