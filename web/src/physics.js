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
                    if (obj.serverPos) {
                        // Обновляем физическое тело на основе серверной позиции
                        if (obj.body) {
                            const ms = obj.body.getMotionState();
                            if (ms) {
                                const transform = new window.Ammo.btTransform();
                                ms.getWorldTransform(transform);
                                transform.setOrigin(new window.Ammo.btVector3(
                                    obj.serverPos.x,
                                    obj.serverPos.y,
                                    obj.serverPos.z
                                ));
                                ms.setWorldTransform(transform);
                                
                                // Активируем тело, чтобы оно реагировало на физику
                                obj.body.activate(true);
                                
                                // Сбрасываем скорость, чтобы избежать накопления
                                const zero = new window.Ammo.btVector3(0, 0, 0);
                                obj.body.setLinearVelocity(zero);
                                obj.body.setAngularVelocity(zero);
                                window.Ammo.destroy(zero);
                                
                                window.Ammo.destroy(transform);
                            }
                        }
                        
                        // Обновляем меш
                        obj.mesh.position.set(obj.serverPos.x, obj.serverPos.y, obj.serverPos.z);
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

    // Создаем импульс заранее, чтобы не создавать его для каждого шара
    const impulse = new window.Ammo.btVector3(0, 0, 0);
    if (cmd === "LEFT") impulse.setValue(-5, 0, 0);
    if (cmd === "RIGHT") impulse.setValue(5, 0, 0);
    if (cmd === "UP") impulse.setValue(0, 0, -5);
    if (cmd === "DOWN") impulse.setValue(0, 0, 5);
    if (cmd === "SPACE") impulse.setValue(0, 10, 0);

    // Проходим по всем объектам и применяем импульс только к шарам с physicsBy: "ammo"
    for (let id in objects) {
        const obj = objects[id];
        if (
            obj &&
            obj.mesh &&
            obj.mesh.geometry &&
            obj.mesh.geometry.type === "SphereGeometry" &&
            obj.body &&
            obj.physicsBy === "ammo"  // Только для локально управляемых объектов
        ) {
            obj.body.activate(true);
            obj.body.applyCentralImpulse(impulse);
            
            // Добавляем диагностику для каждого шара
            const velocity = obj.body.getLinearVelocity();
            console.log("[Physics] Состояние шара:", {
                id: id,
                physicsBy: obj.physicsBy,
                команда: cmd,
                позиция: obj.mesh.position,
                скорость: {
                    x: velocity.x(),
                    y: velocity.y(),
                    z: velocity.z()
                }
            });
        }
    }

    // Очищаем память
    Ammo.destroy(impulse);
}