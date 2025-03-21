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
        
        // if (Math.random() < 0.016) { // примерно раз в секунду при 60 FPS
        //     console.log("[Physics] Шаг симуляции:", {
        //         deltaTime: deltaTime,
        //     });
        // }
        
        localPhysicsWorld.stepSimulation(deltaTime, 10);
    } else {
        console.warn("[Physics] Физический мир не инициализирован");
    }
}

export function updatePhysicsObjects(objects) {
    for (let id in objects) {
        const obj = objects[id];
        if (!obj.mesh) continue;

        console.log(`[Physics] Обновление объекта ${id} с physicsBy: ${obj.physicsBy}`); 

        switch (obj.physicsBy) {
            case "ammo":
                // Обновление только по физике Ammo.js
                if (obj.body && obj.object_type !== "terrain") {
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
                break;

            case "bullet":
                // Обновление только по серверным данным
                if (obj.serverPos && obj.object_type !== "terrain") {
                    obj.mesh.position.set(obj.serverPos.x, obj.serverPos.y, obj.serverPos.z);
                }
                break;

            case "both":
                // Обновление по обоим источникам
                if (obj.object_type !== "terrain") {
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

                    if (obj.serverPos) {
                        const dx = obj.serverPos.x - obj.mesh.position.x;
                        const dy = obj.serverPos.y - obj.mesh.position.y;
                        const dz = obj.serverPos.z - obj.mesh.position.z;

                        if (dx * dx + dy * dy + dz * dz > 0.01) {
                            const alpha = 0.1;
                            const newX = obj.mesh.position.x + dx * alpha;
                            const newY = obj.mesh.position.y + dy * alpha;
                            const newZ = obj.mesh.position.z + dz * alpha;

                            obj.mesh.position.set(newX, newY, newZ);
                        }
                    }
                }
                break;

            default:
                console.warn(`[Physics] Неизвестный тип physicsBy для объекта ${id}: ${obj.physicsBy}`);
                break;
        }
    }
}

export function applyImpulseToSphere(cmd, objects) {
    console.log("[Debug] Переданные объекты в applyImpulseToSphere:", objects);
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