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
    if (localPhysicsWorld) {
        // Проверяем, что deltaTime имеет разумное значение
        if (deltaTime <= 0 || deltaTime > 1) {
            console.warn("[Physics] Подозрительное значение deltaTime:", deltaTime);
            deltaTime = 1/60; // используем фиксированный шаг если что-то не так
        }
        
        // Добавляем периодическую диагностику (каждую секунду)
        if (Math.random() < 0.016) { // примерно раз в секунду при 60 FPS
            console.log("[Physics] Шаг симуляции:", {
                deltaTime: deltaTime,
                активныхОбъектов: localPhysicsWorld.getNumCollisionObjects()
            });
        }
        
        localPhysicsWorld.stepSimulation(deltaTime, 10);
    } else {
        console.warn("[Physics] Физический мир не инициализирован");
    }
}

export function updatePhysicsObjects(objects) {
    for (let id in objects) {
        const obj = objects[id];
        if (!obj.body || !obj.mesh) continue;

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

        if (obj.serverPos) {
            const dx = obj.serverPos.x - locX;
            const dy = obj.serverPos.y - locY;
            const dz = obj.serverPos.z - locZ;

            if (dx * dx + dy * dy + dz * dz > 0.01) {
                const alpha = 0.1;
                const newX = locX + dx * alpha;
                const newY = locY + dy * alpha;
                const newZ = locZ + dz * alpha;

                const correction = new window.Ammo.btTransform();
                correction.setIdentity();
                correction.setOrigin(new window.Ammo.btVector3(newX, newY, newZ));
                correction.setRotation(trans.getRotation());

                obj.body.activate(true);
                obj.body.getMotionState().setWorldTransform(correction);
                obj.body.setCenterOfMassTransform(correction);

                obj.mesh.position.set(newX, newY, newZ);
            }
        }
    }
}

export function applyImpulseToSphere(cmd, objects) {
    // Проверяем, что objects передан и является объектом
    if (!objects || typeof objects !== 'object') {
        console.warn("[Physics] Некорректные объекты переданы в applyImpulseToSphere");
        return;
    }

    let targetSphere = null;
    // Используем переданный параметр objects вместо глобальной переменной
    for (let id in objects) {
        const obj = objects[id];
        if (
            obj &&
            obj.mesh &&
            obj.mesh.geometry &&
            obj.mesh.geometry.type === "SphereGeometry"
        ) {
            targetSphere = obj;
            break;
        }
    }
    if (!targetSphere || !targetSphere.body) {
        console.warn("[Physics] Шар не найден или не имеет физического тела");
        return;
    }

    const impulse = new window.Ammo.btVector3(0, 0, 0);
    if (cmd === "LEFT") impulse.setValue(-2, 0, 0);
    if (cmd === "RIGHT") impulse.setValue(2, 0, 0);
    if (cmd === "UP") impulse.setValue(0, 0, -2);
    if (cmd === "DOWN") impulse.setValue(0, 0, 2);
    if (cmd === "SPACE") impulse.setValue(0, 5, 0);

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