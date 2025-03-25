// physics.js

import { objects } from './objects';

export let localPhysicsWorld = null;
let ammoPromise = null;

// Настройки для коррекции позиции
const DEAD_ZONE = 0.01; // "Мертвая зона" в единицах мира - уменьшаем для более точной синхронизации
const CORRECTION_STRENGTH = 10.0; // Сила корректировки - увеличиваем для более быстрой коррекции
const TELEPORT_THRESHOLD = 0.5; // Порог для телепортации - уменьшаем для более частых телепортаций

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
                // Обновление по серверным данным с простой интерполяцией
                if (obj.serverPos && obj.object_type !== "terrain") {
                    // Простая линейная интерполяция
                    const interpolationFactor = 0.2; // Можно настроить под ваши нужды
                    
                    obj.mesh.position.x += (obj.serverPos.x - obj.mesh.position.x) * interpolationFactor;
                    obj.mesh.position.y += (obj.serverPos.y - obj.mesh.position.y) * interpolationFactor;
                    obj.mesh.position.z += (obj.serverPos.z - obj.mesh.position.z) * interpolationFactor;
                }
                break;
                
            case "both":
                // Гибридный подход для объектов, управляемых обоими источниками
                if (obj.serverPos && obj.object_type !== "terrain" && obj.body) {
                    // ЭКСПЕРИМЕНТАЛЬНО: Прямое обновление позиции меша для немедленной визуализации
                    // Это поможет увидеть изменения сразу, не дожидаясь физической синхронизации
                    console.log(`[Physics] Прямое обновление позиции меша для ${id}:`, {
                        старая: {
                            x: obj.mesh.position.x,
                            y: obj.mesh.position.y,
                            z: obj.mesh.position.z
                        },
                        серверная: {
                            x: obj.serverPos.x,
                            y: obj.serverPos.y,
                            z: obj.serverPos.z
                        }
                    });
                    
                    // Обновляем только если разница существенна
                    const dxMesh = obj.serverPos.x - obj.mesh.position.x;
                    const dyMesh = obj.serverPos.y - obj.mesh.position.y;
                    const dzMesh = obj.serverPos.z - obj.mesh.position.z;
                    const meshDistance = Math.sqrt(dxMesh*dxMesh + dyMesh*dyMesh + dzMesh*dzMesh);
                    
                    if (meshDistance > DEAD_ZONE * 10) {
                        obj.mesh.position.lerp(new THREE.Vector3(obj.serverPos.x, obj.serverPos.y, obj.serverPos.z), 0.3);
                        console.log(`[Physics] Обновлена позиция меша для ${id}:`, obj.mesh.position);
                    }
                    
                    // Получаем текущую позицию из физического тела
                    const transform = new window.Ammo.btTransform();
                    obj.body.getMotionState().getWorldTransform(transform);
                    
                    // Вычисляем разницу между серверной и текущей позицией физического тела
                    const currentX = transform.getOrigin().x();
                    const currentY = transform.getOrigin().y();
                    const currentZ = transform.getOrigin().z();
                    
                    const dx = obj.serverPos.x - currentX;
                    const dy = obj.serverPos.y - currentY;
                    const dz = obj.serverPos.z - currentZ;
                    
                    // Вычисляем расстояние
                    const distance = Math.sqrt(dx*dx + dy*dy + dz*dz);
                    
                    // Применяем гибридный подход
                    if (distance > DEAD_ZONE) {
                        if (distance > TELEPORT_THRESHOLD) {
                            // Телепортация для больших расхождений
                            console.log(`[Physics] Телепортация объекта ${id}, расстояние: ${distance}`);
                            transform.setOrigin(new window.Ammo.btVector3(
                                obj.serverPos.x,
                                obj.serverPos.y,
                                obj.serverPos.z
                            ));
                            obj.body.getMotionState().setWorldTransform(transform);
                            
                            // Сбрасываем скорость
                            const zero = new window.Ammo.btVector3(0, 0, 0);
                            obj.body.setLinearVelocity(zero);
                            obj.body.setAngularVelocity(zero);
                            window.Ammo.destroy(zero);
                            
                            // Немедленно синхронизируем меш с физическим телом
                            const updatedTransform = new window.Ammo.btTransform();
                            obj.body.getMotionState().getWorldTransform(updatedTransform);
                            const px = updatedTransform.getOrigin().x();
                            const py = updatedTransform.getOrigin().y();
                            const pz = updatedTransform.getOrigin().z();
                            obj.mesh.position.set(px, py, pz);
                            console.log(`[Physics] Синхронизация позиции меша ${id}:`, {
                                x: px,
                                y: py,
                                z: pz
                            });
                            window.Ammo.destroy(updatedTransform);
                        } else {
                            // Корректирующая сила для средних расхождений
                            console.log(`[Physics] Корректировка силой для объекта ${id}, расстояние: ${distance}`);
                            
                            // Нормализуем направление
                            const magnitude = distance * CORRECTION_STRENGTH;
                            const force = new window.Ammo.btVector3(
                                dx * magnitude,
                                dy * magnitude,
                                dz * magnitude
                            );
                            
                            // Активируем тело и применяем силу
                            obj.body.activate(true);
                            obj.body.applyCentralForce(force);
                            
                            window.Ammo.destroy(force);
                        }
                    }
                    
                    window.Ammo.destroy(transform);
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

export function receiveObjectUpdate(data) {
    // Извлекаем id из данных обновления
    const id = data.id;
    
    // Проверяем, существует ли объект
    const obj = objects[id];
    if (!obj) {
        console.warn(`[Physics] Получено обновление для несуществующего объекта: ${id}`);
        return;
    }
    
    console.log(`[Physics] Обработка обновления для объекта ${id}, тип: ${obj.physicsBy}`);
    
    // Обновляем серверную позицию
    obj.serverPos = {
        x: data.x !== undefined ? data.x : obj.mesh.position.x,
        y: data.y !== undefined ? data.y : obj.mesh.position.y,
        z: data.z !== undefined ? data.z : obj.mesh.position.z
    };
    
    // На этом этапе только сохраняем позицию, не применяем коррекцию
    // Коррекция будет применяться в updatePhysicsObjects
}