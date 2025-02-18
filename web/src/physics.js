// physics.js

export let localPhysicsWorld = null;
let ammoPromise = null;

export async function initAmmo() {
    if (ammoPromise) {
        return ammoPromise;
    }

    ammoPromise = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = '/ammo/ammo.wasm.js'; // путь от корня веб-сервера
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
                // Дождемся первого шага симуляции для проверки
                try {
                    localPhysicsWorld.stepSimulation(1/60, 1);
                    resolve(AmmoLib);
                } catch (e) {
                    reject(new Error("Ошибка инициализации физического мира"));
                }
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
    if (localPhysicsWorld) {
        // Используем фиксированный шаг времени для стабильности
        const fixedTimeStep = 1/60;
        
        localPhysicsWorld.stepSimulation(fixedTimeStep, 1);
    } else {
        console.warn("[Physics] Физический мир не инициализирован");
    }
}

export function updatePhysicsObjects(objects) {
    for (let id in objects) {
        const obj = objects[id];
        if (!obj.mesh) continue;

        // Сначала обновляем локальную физику
        if (obj.body) {
            const trans = new window.Ammo.btTransform();
            obj.body.getMotionState().getWorldTransform(trans);

            const locX = trans.getOrigin().x();
            const locY = trans.getOrigin().y();
            const locZ = trans.getOrigin().z();

            const qx = trans.getRotation().x();
            const qy = trans.getRotation().y();
            const qz = trans.getRotation().z();
            const qw = trans.getRotation().w();

            obj.mesh.position.set(locX, locY, locZ);
            obj.mesh.quaternion.set(qx, qy, qz, qw);
        }

        // Затем корректируем по данным сервера если есть расхождение
        if (obj.serverPos) {
            const dx = obj.serverPos.x - obj.mesh.position.x;
            const dy = obj.serverPos.y - obj.mesh.position.y;
            const dz = obj.serverPos.z - obj.mesh.position.z;

            // Если расхождение существенное, корректируем физическое тело
            if (dx * dx + dy * dy + dz * dz > 0.1) {
                const alpha = 0.1; // Коэффициент коррекции
                const newX = obj.mesh.position.x + dx * alpha;
                const newY = obj.mesh.position.y + dy * alpha;
                const newZ = obj.mesh.position.z + dz * alpha;

                // Корректируем физическое тело если оно есть
                if (obj.body) {
                    const correction = new window.Ammo.btTransform();
                    correction.setIdentity();
                    correction.setOrigin(new window.Ammo.btVector3(newX, newY, newZ));
                    
                    if (obj.serverRot) {
                        correction.setRotation(new window.Ammo.btQuaternion(
                            obj.serverRot.x,
                            obj.serverRot.y,
                            obj.serverRot.z,
                            obj.serverRot.w
                        ));
                    } else {
                        correction.setRotation(trans.getRotation());
                    }

                    obj.body.activate(true);
                    obj.body.getMotionState().setWorldTransform(correction);
                    obj.body.setCenterOfMassTransform(correction);
                } else {
                    // Если физического тела нет, просто интерполируем меш
                    obj.mesh.position.lerp(obj.serverPos, alpha);
                    if (obj.serverRot) {
                        obj.mesh.quaternion.slerp(obj.serverRot, alpha);
                    }
                }
            }
        }
    }
}

export function applyImpulseToSphere(cmd, objects) {
    const IMPULSE_STRENGTH = 10; // Уменьшаем силу импульса

    if (!objects || typeof objects !== 'object') {
        console.warn("[Physics] Некорректные объекты переданы в applyImpulseToSphere");
        return;
    }

    let targetSphere = null;
    for (let id in objects) {
        const obj = objects[id];
        if (obj && obj.mesh && obj.object_type === "sphere") {
            targetSphere = obj;
            break;
        }
    }

    if (!targetSphere || !targetSphere.body) {
        console.warn("[Physics] Шар не найден или не имеет физического тела");
        return;
    }

    const impulse = new window.Ammo.btVector3(0, 0, 0);
    if (cmd === "LEFT") impulse.setValue(-IMPULSE_STRENGTH, 0, 0);
    if (cmd === "RIGHT") impulse.setValue(IMPULSE_STRENGTH, 0, 0);
    if (cmd === "UP") impulse.setValue(0, 0, -IMPULSE_STRENGTH);
    if (cmd === "DOWN") impulse.setValue(0, 0, IMPULSE_STRENGTH);
    if (cmd === "SPACE") impulse.setValue(0, IMPULSE_STRENGTH * 1.5, 0);

    targetSphere.body.activate(true);
    targetSphere.body.applyCentralImpulse(impulse);
    
    // Добавляем диагностику
    const velocity = targetSphere.body.getLinearVelocity();
    console.log("[Physics] Состояние шара:", {
        команда: cmd,
        позиция: targetSphere.mesh.position,
        скорость: {
            x: velocity.x(),
            y: velocity.y(),
            z: velocity.z()
        }
    });
}

export function createPhysicsObject(obj) {
    if (!localPhysicsWorld) {
        console.warn("[Physics] Физический мир не инициализирован");
        return;
    }

    // Пропускаем создание физики для деревьев
    if (obj.object_type === "tree") {
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
            
            // Смещаем террейн на половину размера, чтобы центр был в правильном месте
            transform.setOrigin(new window.Ammo.btVector3(
                obj.x - (scaleX * obj.heightmap_w) / 2,
                obj.y,
                obj.z - (scaleZ * obj.heightmap_h) / 2
            ));
            
            obj.mass = 0;
            console.log("[Physics] Создание физики для террейна:", obj.id);
            break;
        default:
            console.warn("[Physics] Пропуск создания физики для типа:", obj.object_type);
            return;
    }

    // Создаем rigid body
    const mass = obj.mass;
    const localInertia = new window.Ammo.btVector3(0, 0, 0);
    
    if (mass > 0) {
        shape.calculateLocalInertia(mass, localInertia);
    }

    motionState = new window.Ammo.btDefaultMotionState(transform);
    const rbInfo = new window.Ammo.btRigidBodyConstructionInfo(mass, motionState, shape, localInertia);
    body = new window.Ammo.btRigidBody(rbInfo);

    // Устанавливаем параметры физики
    if (obj.object_type === "terrain") {
        // Устанавливаем как статическое тело
        body.setCollisionFlags(1); // CF_STATIC_OBJECT
        
        // Добавляем тело в мир с правильными параметрами коллизии
        localPhysicsWorld.addRigidBody(body);
        
        console.log("[Physics] Параметры физического тела террейна:", {
            restitution: body.getRestitution(),
            friction: body.getFriction(),
            rollingFriction: body.getRollingFriction()
        });
    } else if (obj.object_type === "sphere") {
        // Настройки для динамического тела
        body.setCollisionFlags(0); // CF_DYNAMIC_OBJECT
        body.setRestitution(0.7);
        body.setFriction(0.5);
        body.setRollingFriction(0.1);
        
        // Добавляем тело в мир
        localPhysicsWorld.addRigidBody(body);
        
        // Активируем для физической симуляции
        body.activate(true);
        
        console.log("[Physics] Параметры физического тела сферы:", {
            mass: mass,
            restitution: body.getRestitution(),
            friction: body.getFriction()
        });
    }

    obj.body = body;
}