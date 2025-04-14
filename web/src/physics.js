// physics.js

import { objects } from './objects';
import { startPhysicsSimulation } from './network';
import { throttledLog, logMainPlayerInfo} from './throttledlog';

export let localPhysicsWorld = null;
let ammoPromise = null;

// Настройки для коррекции позиции
const DEAD_ZONE = 10; 
const CORRECTION_STRENGTH = 50.0; 
const TELEPORT_THRESHOLD = 5.0; 

// Добавляем настройки для client-side prediction
const PREDICTION_SMOOTH_FACTOR = 10; 
const PREDICTION_MAX_ERROR = 10.0; 
const DISTANCE_BASED_SMOOTH_FACTOR = true; // Использовать динамический коэффициент сглаживания
const NEW_OBJECT_TIMEOUT = 2000; // 2 секунды для "новых" объектов

// История команд для предсказания
let inputHistory = []; 
let lastSequenceNumber = 0; // Счетчик последовательности для команд
let lastServerUpdateTime = 0; // Время последнего серверного обновления



// Добавляем маркер времени создания объектов
const objectCreationTimes = new Map();

// Функция для настройки физического мира
function setupPhysicsWorld() {
    if (!window.Ammo) {
        console.error("[Physics] Ammo.js не инициализирован");
        return;
    }
    
    // Создаем физический мир
    const collisionConfiguration = new window.Ammo.btDefaultCollisionConfiguration();
    const dispatcher = new window.Ammo.btCollisionDispatcher(collisionConfiguration);
    const broadphase = new window.Ammo.btDbvtBroadphase();
    const solver = new window.Ammo.btSequentialImpulseConstraintSolver();
    
    localPhysicsWorld = new window.Ammo.btDiscreteDynamicsWorld(
        dispatcher,
        broadphase,
        solver,
        collisionConfiguration
    );
    
    // Устанавливаем гравитацию
    localPhysicsWorld.setGravity(new window.Ammo.btVector3(0, -9.81, 0));
    
    console.log("[Physics] Физический мир успешно создан");
    
    // Добавляем эффект отскока после создания мира
    // TODO: Реализация отскока отложена на будущее
    // addCollisionBounceEffect();
}

export async function initAmmo() {
    return new Promise((resolve, reject) => {
        if (typeof Ammo !== 'undefined') {
            console.log('Ammo.js уже инициализирован');
            setupPhysicsWorld();
            resolve();
            return;
        }

        console.log('Инициализация Ammo.js...');
        const ammoScript = document.createElement('script');
        ammoScript.src = '/ammo/ammo.wasm.js';
        ammoScript.async = true;
        ammoScript.onload = () => {
            console.log('Скрипт Ammo.js загружен, инициализация...');
            
            window.Ammo().then((Ammo) => {
                window.Ammo = Ammo;
                console.log('Ammo.js инициализирован успешно');
                setupPhysicsWorld();
                
                // Запускаем физическую симуляцию с задержкой в 1 секунду,
                // чтобы гарантировать получение координат от сервера
                console.log("[Physics] Задерживаем запуск физики на 1 секунду для получения серверных координат...");
                setTimeout(() => {
                    startPhysicsSimulation();
                }, 1000);
                
                resolve();
            }).catch(err => {
                console.error('Ошибка инициализации Ammo.js:', err);
                reject(err);
            });
        };
        ammoScript.onerror = (err) => {
            console.error('Ошибка загрузки Ammo.js:', err);
            reject(err);
        };
        
        document.body.appendChild(ammoScript);
    });
}

// Обработка шага физики
export function stepPhysics(deltaTime) {
    if (!localPhysicsWorld) return;

    try {
        // Проверяем корректность deltaTime
        if (!deltaTime || isNaN(deltaTime) || deltaTime <= 0 || deltaTime > 1) {
            deltaTime = 1/60; // Значение по умолчанию
        }
        
        // Ограничиваем максимальный шаг для стабильности
        const maxStep = 1/60; // Не больше 30мс для одного шага
        const effectiveStep = Math.min(deltaTime, maxStep);
        
        // Используем фиксированный шаг и переменное количество подшагов для точности
        const fixedStep = 1/120; // 120 Гц внутренние шаги
        const maxSubSteps = Math.ceil(effectiveStep / fixedStep);
        
        // Выполняем шаг симуляции с заданными параметрами
        localPhysicsWorld.stepSimulation(effectiveStep, maxSubSteps, fixedStep);

        // Применяем ограничения скорости
        applySpeedLimits();

        // Обновляем физические объекты
        updatePhysicsObjects(objects, deltaTime);
    } catch (error) {
        console.error('Ошибка при обновлении физики:', error);
    }
}

// Функция для ограничения скорости в Ammo.js
export function applySpeedLimits() {
    try {
        if (!objects || !window.Ammo || !window.PHYSICS_CONFIG) return;
        
        // Используем максимальную скорость из конфигурации
        const MAX_SPEED = window.PHYSICS_CONFIG.MaxSpeed || 80.0;
        
        for (let id in objects) {
            const obj = objects[id];
            if (!obj || !obj.body) continue;
            
            // Пропускаем статические объекты или террейн
            if (obj.object_type === "terrain") continue;
            
            // Получаем текущую линейную скорость
            const velocity = obj.body.getLinearVelocity();
            const speedSq = velocity.x() * velocity.x() + velocity.y() * velocity.y() + velocity.z() * velocity.z();
            const speed = Math.sqrt(speedSq);
            
            // Если скорость превышает максимальную, ограничиваем её
            if (speed > MAX_SPEED) {
                console.warn("apply speed limit :", speed)
                const scale = MAX_SPEED / speed;
                const newVelocity = new window.Ammo.btVector3(
                    velocity.x() * scale,
                    velocity.y() * scale,
                    velocity.z() * scale
                );
                obj.body.setLinearVelocity(newVelocity);
                window.Ammo.destroy(newVelocity);
            }
            
            // Если это игрок, обновляем отображение скорости
            if (id.startsWith('mainPlayer1')) {
                const mass = obj.mass || 5.0;
                updatePlayerSpeedDisplay(speed, MAX_SPEED, mass);
            }
            
            window.Ammo.destroy(velocity);
        }
    } catch (e) {
        console.error("Ошибка при обработке скорости:", e);
    }
}

// Функция для обновления отображения скорости игрока
function updatePlayerSpeedDisplay(speed, maxSpeed, mass) {
    const speedDisplay = document.getElementById('player-speed');
    const maxSpeedDisplay = document.getElementById('player-max-speed');
    const massDisplay = document.getElementById('player-mass');
    
    if (speedDisplay) {
        // Форматируем до 2 знаков после запятой для большей точности при малых скоростях
        speedDisplay.textContent = `Скорость: ${speed.toFixed(2)} м/с`;
        
        // Меняем цвет в зависимости от скорости
        const speedRatio = speed / maxSpeed;
        if (speedRatio < 0.5) {
            speedDisplay.style.color = 'white'; // Обычная скорость
        } else if (speedRatio < 0.8) {
            speedDisplay.style.color = 'yellow'; // Высокая скорость
        } else {
            speedDisplay.style.color = 'orange'; // Приближение к максимуму
            if (speedRatio > 0.95) {
                speedDisplay.style.color = 'red'; // Почти максимальная
            }
        }
    }
    
    if (maxSpeedDisplay) {
        maxSpeedDisplay.textContent = `Макс. скорость: ${maxSpeed.toFixed(1)} м/с`;
    }
    
    if (massDisplay) {
        massDisplay.textContent = `Масса: ${mass.toFixed(1)} кг`;
    }
    
    // Добавляем отладку для отслеживания значений
    console.log(`[Speed] Current: ${speed.toFixed(2)} m/s, Max: ${maxSpeed} m/s, Mass: ${mass} kg`);
}

export function updatePhysicsObjects(objects, deltaTime) {
    // Переменные для диагностики
    let mainSpherePos = null;
    let ammoShadowPos = null;
    let bulletShadowPos = null;

    // Обновляем все объекты
    for (let id in objects) {
        const obj = objects[id];
        if (!obj.mesh) continue;
        
        // Проверяем, новый ли это объект
        const isNewObject = objectCreationTimes.has(id) && 
                          (Date.now() - objectCreationTimes.get(id) < NEW_OBJECT_TIMEOUT);
        
        // Пропускаем обработку террейна (он статичен)
        if (obj.object_type === "terrain") continue;
        
        const currentTime = Date.now();

        // Пропускаем обработку, если данные слишком старые
        if (!obj.hasNewServerData && (!obj.lastServerUpdate || currentTime - obj.lastServerUpdate > 1000)) {
            continue; // Переходим к следующему объекту
        }

        // Если серверная позиция не изменилась с прошлого обновления, пропускаем коррекцию
        if (obj.prevServerPos && obj.serverPos &&
            Math.abs(obj.prevServerPos.x - obj.serverPos.x) < 0.001 &&
            Math.abs(obj.prevServerPos.y - obj.serverPos.y) < 0.001 &&
            Math.abs(obj.prevServerPos.z - obj.serverPos.z) < 0.001) {
            // console.log(`Серверная позиция не изменилась для ${id}, пропускаем коррекцию`);
            continue;
        }

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
                    
                    // Сохраняем для диагностики
                    if (id === "ammo_shadow") {
                        ammoShadowPos = { x: locX, y: locY, z: locZ };
                    }
                }
                break;
                
            case "bullet":
                // Обновление по серверным данным без интерполяции
                if (obj.serverPos && obj.object_type !== "terrain") {
                    // Устанавливаем точную позицию меша из серверных данных
                    obj.mesh.position.set(
                        obj.serverPos.x,
                        obj.serverPos.y,
                        obj.serverPos.z
                    );
                    
                    // Обновляем физическое тело
                    if (obj.body) {
                        const transform = new window.Ammo.btTransform();
                        transform.setIdentity();
                        transform.setOrigin(new window.Ammo.btVector3(
                            obj.serverPos.x,
                            obj.serverPos.y,
                            obj.serverPos.z
                        ));
                        
                        // Применяем трансформацию к физическому телу
                        obj.body.getMotionState().setWorldTransform(transform);
                        
                        // Если есть серверная скорость, применяем её
                        if (obj.serverVelocity) {
                            const velocity = new window.Ammo.btVector3(
                                obj.serverVelocity.x,
                                obj.serverVelocity.y,
                                obj.serverVelocity.z
                            );
                            obj.body.setLinearVelocity(velocity);
                            window.Ammo.destroy(velocity);
                        }
                        
                        window.Ammo.destroy(transform);
                    }
                    
                    // Сохраняем для диагностики
                    if (id === "bullet_shadow") {
                        bulletShadowPos = {
                            x: obj.serverPos.x,
                            y: obj.serverPos.y,
                            z: obj.serverPos.z
                        };
                    }
                }
                break;
                
            case "both":
                // Гибридный подход для объектов, управляемых обоими источниками
                if (obj.serverPos && obj.object_type !== "terrain" && obj.body) {
                    
                    // Сохраняем позицию основной сферы для диагностики
                    if (id === "mainPlayer1") {
                        mainSpherePos = {
                            x: obj.mesh.position.x,
                            y: obj.mesh.position.y,
                            z: obj.mesh.position.z,
                            serverX: obj.serverPos.x,
                            serverY: obj.serverPos.y,
                            serverZ: obj.serverPos.z
                        };
                    }
                    
                    // Получаем текущую позицию из физического тела
                    const transform = new window.Ammo.btTransform();
                    obj.body.getMotionState().getWorldTransform(transform);
                    
                    // Вычисляем разницу между серверной и текущей позицией физического тела
                    const currentX = transform.getOrigin().x();
                    const currentY = transform.getOrigin().y();
                    const currentZ = transform.getOrigin().z();
                    
                    // Нам важно знать скорость объекта для выбора оптимальной стратегии коррекции
                    const velocity = obj.body.getLinearVelocity();
                    const speedSq = velocity.x() * velocity.x() + velocity.y() * velocity.y() + velocity.z() * velocity.z();
                    const speed = Math.sqrt(speedSq);
                    const isMovingFast = speedSq > 4.0; // Если скорость больше 2 м/с
                    
                    let targetX = obj.serverPos.x;
                    let targetY = obj.serverPos.y;
                    let targetZ = obj.serverPos.z;

                    if (obj.serverVelocity) {
                        // Вычисляем прогнозируемую позицию на основе серверной скорости
                        const predictedX = obj.serverPos.x + obj.serverVelocity.x * deltaTime;
                        const predictedY = obj.serverPos.y + obj.serverVelocity.y * deltaTime;
                        const predictedZ = obj.serverPos.z + obj.serverVelocity.z * deltaTime;

                        // Вычисляем разницу между прогнозируемой и текущей позициями
                        const dxPredicted = predictedX - currentX;
                        const dyPredicted = predictedY - currentY;
                        const dzPredicted = predictedZ - currentZ;

                        // Вычисляем расстояние
                        const distancePredicted = Math.sqrt(dxPredicted*dxPredicted + dyPredicted*dyPredicted + dzPredicted*dzPredicted);

                        // Используем прогнозируемую позицию, если она ближе к текущей
                        if (distancePredicted < distance) {
                            targetX = predictedX;
                            targetY = predictedY;
                            targetZ = predictedZ;
                        }
                    }

                    // Теперь разницу считаем от целевой позиции, а не от серверной
                    const dx = targetX - currentX;
                    const dy = targetY - currentY;
                    const dz = targetZ - currentZ;

                    // Вычисляем расстояние
                    const distance = Math.sqrt(dx*dx + dy*dy + dz*dz);
                    
                    // Логируем только при значительных расхождениях
                    if (distance > DEAD_ZONE || isMovingFast) {
                        throttledLog("Physics", 
                            `Объект ${id}: Расстояние: ${distance.toFixed(3)}, Скорость: ${speed.toFixed(3)}, Быстро: ${isMovingFast}, Клиент: {x: ${currentX.toFixed(2)}, y: ${currentY.toFixed(2)}, z: ${currentZ.toFixed(2)}}, Сервер: {x: ${obj.serverPos.x.toFixed(2)}, y: ${obj.serverPos.y.toFixed(2)}, z: ${obj.serverPos.z.toFixed(2)}}`
                        );
                    }
                    
                    // Применяем client-side prediction
                    if (distance > Math.max(PREDICTION_MAX_ERROR, speed * 0.1) || isNewObject && distance > 5.0) {
                        // Добавляем учет скорости при определении необходимости сброса
                        const speedBasedError = Math.max(PREDICTION_MAX_ERROR, speed * 0.2); // Допускаем большую ошибку при высокой скорости
                        
                        // Определяем коэффициент сглаживания на основе состояния объекта
                        let smoothFactor = PREDICTION_SMOOTH_FACTOR;
                        
                        // Для новых объектов используем более жесткую коррекцию
                        if (isNewObject) {
                            smoothFactor = 0.8; // 80% серверной позиции
                            // throttledLog("Physics", 
                            //     `Новый объект ${id}, применяем жесткую коррекцию (${smoothFactor})`
                            // );
                        } else if (DISTANCE_BASED_SMOOTH_FACTOR) {
                            // Чем больше расхождение, тем больше коэффициент
                            smoothFactor = Math.min(distance / 20.0, 0.5); // Максимум 0.5
                        }
                        
                        // Для больших расхождений или новых объектов применяем телепортацию
                        if (distance > speedBasedError || isNewObject && distance > 5.0) {
                            console.warn("apply teleportation :", distance)
                            
                            // Телепортируем объект
                            transform.setOrigin(new window.Ammo.btVector3(
                                obj.serverPos.x,
                                obj.serverPos.y,
                                obj.serverPos.z
                            ));
                            obj.body.getMotionState().setWorldTransform(transform);
                            
                            // Проверим, была ли применена телепортация
                            const afterTeleport = new window.Ammo.btTransform();
                            obj.body.getMotionState().getWorldTransform(afterTeleport);
                            const teleportX = afterTeleport.getOrigin().x();
                            const teleportY = afterTeleport.getOrigin().y();
                            const teleportZ = afterTeleport.getOrigin().z();

                            // Проверим, насколько телепортация была успешной
                            const teleportSuccess = 
                                Math.abs(teleportX - obj.serverPos.x) < 0.1 &&
                                Math.abs(teleportY - obj.serverPos.y) < 0.1 &&
                                Math.abs(teleportZ - obj.serverPos.z) < 0.1;

                            console.log(`[Physics] Телепортация ${teleportSuccess ? 'успешна' : 'неудачна'} - Цель: {x: ${obj.serverPos.x.toFixed(2)}, y: ${obj.serverPos.y.toFixed(2)}, z: ${obj.serverPos.z.toFixed(2)}}, Фактически: {x: ${teleportX.toFixed(2)}, y: ${teleportY.toFixed(2)}, z: ${teleportZ.toFixed(2)}}`);

                            window.Ammo.destroy(afterTeleport);
                            
                            // Сбрасываем скорость только при существенных расхождениях
                            if (distance > speedBasedError * 1.5) {
                                const timeSinceLastUpdate = Date.now() - obj.lastServerUpdate;
                                console.warn(`[Reset Velocity] Объект ${id}: distance=${distance.toFixed(2)}, threshold=${speedBasedError.toFixed(2)}, timeSinceUpdate=${timeSinceLastUpdate}ms`);
                                
                                // При очень больших расхождениях полностью сбрасываем скорость
                                const zero = new window.Ammo.btVector3(0, 0, 0);
                                obj.body.setLinearVelocity(zero);
                                obj.body.setAngularVelocity(zero);
                                window.Ammo.destroy(zero);
                            } else if (obj.serverVelocity) {
                                // Если есть рассчитанная серверная скорость, применяем её
                                console.warn("apply server velocity :", obj.serverVelocity)
                                const serverVel = new window.Ammo.btVector3(
                                    obj.serverVelocity.x,
                                    obj.serverVelocity.y,
                                    obj.serverVelocity.z
                                );
                                obj.body.setLinearVelocity(serverVel);
                                window.Ammo.destroy(serverVel);
                            } else {
                                // Иначе уменьшаем текущую скорость
                                console.warn("apply damped velocity :", velocity)
                                const dampedVelocity = new window.Ammo.btVector3(
                                    velocity.x() * 0.5,
                                    velocity.y() * 0.5,
                                    velocity.z() * 0.5
                                );
                                obj.body.setLinearVelocity(dampedVelocity);
                                window.Ammo.destroy(dampedVelocity);
                            }
                            
                            // Немедленно синхронизируем меш с физическим телом
                            const updatedTransform = new window.Ammo.btTransform();
                            obj.body.getMotionState().getWorldTransform(updatedTransform);
                            const px = updatedTransform.getOrigin().x();
                            const py = updatedTransform.getOrigin().y();
                            const pz = updatedTransform.getOrigin().z();
                            obj.mesh.position.set(px, py, pz);
                            window.Ammo.destroy(updatedTransform);
                        } else if (distance > TELEPORT_THRESHOLD) {
                            // Мягкая коррекция для средних расхождений
                            // Смешиваем текущую позицию с серверной
                            
                            const correctionX = obj.serverPos.x * smoothFactor + currentX * (1 - smoothFactor);
                            const correctionY = obj.serverPos.y * smoothFactor + currentY * (1 - smoothFactor);
                            const correctionZ = obj.serverPos.z * smoothFactor + currentZ * (1 - smoothFactor);
                            const correctionVector = new window.Ammo.btVector3(correctionX, correctionY, correctionZ);
                            console.warn("smooth correction", correctionVector)
                            
                            transform.setOrigin(new window.Ammo.btVector3(correctionX, correctionY, correctionZ));
                            obj.body.getMotionState().setWorldTransform(transform);
                            
                            // Если мы перемещаем объект, обновляем mesh непосредственно для большей плавности
                            obj.mesh.position.set(correctionX, correctionY, correctionZ);
                            
                            // Обновляем скорость, чтобы она учитывала направление серверного движения
                            if (obj.serverVelocity) {
                                const blendedVelocity = new window.Ammo.btVector3(
                                    velocity.x() * (1 - smoothFactor) + obj.serverVelocity.x * smoothFactor,
                                    velocity.y() * (1 - smoothFactor) + obj.serverVelocity.y * smoothFactor,
                                    velocity.z() * (1 - smoothFactor) + obj.serverVelocity.z * smoothFactor
                                );
                                obj.body.setLinearVelocity(blendedVelocity);
                                window.Ammo.destroy(blendedVelocity);
                            }
                        } else {
                            // Для небольших расхождений - корректирующая сила
                            // Более плавная коррекция для медленно движущихся объектов
                            const adaptiveStrength = isMovingFast ? CORRECTION_STRENGTH : CORRECTION_STRENGTH * 0.7;
                            const magnitude = distance * adaptiveStrength;
                            
                            // Для объектов на земле не применяем вертикальную коррекцию,
                            // если они находятся на поверхности с небольшой разницей по высоте
                            let correctY = true;
                            if (Math.abs(dy) < DEAD_ZONE && Math.abs(velocity.y()) < 0.5) {
                                correctY = false;
                            }
                            
                            const force = new window.Ammo.btVector3(
                                dx * magnitude,
                                correctY ? dy * magnitude : 0,
                                dz * magnitude
                            );
                            
                            // Активируем тело и применяем силу
                            obj.body.activate(true);
                            obj.body.applyCentralForce(force);
                            
                            window.Ammo.destroy(force);
                        }
                    }
                    
                    // Добавляем подробную диагностику для основного игрока
                    if (id === "mainPlayer1") {
                        console.debug(`[Physics Debug] ${id}: distance=${distance.toFixed(2)}, speed=${speed.toFixed(2)}, threshold=${Math.max(PREDICTION_MAX_ERROR, speed * 0.1).toFixed(2)}, isNewObject=${isNewObject}`);
                    }
                    
                    window.Ammo.destroy(velocity);
                    window.Ammo.destroy(transform);
                }
                break;
                
            default:
                //throttledLog("Error", `Неизвестный тип physicsBy для объекта ${id}: ${obj.physicsBy}`);
                break;
        }

        // В конце обработки объекта
        obj.hasNewServerData = false; // Сбрасываем флаг, показывая что мы обработали новые данные
    }
    
    // Выводим диагностическую информацию о расхождениях
    if (mainSpherePos && ammoShadowPos && bulletShadowPos) {
        // Вычисляем расхождения между диагностическими сферами
        const mainToAmmoDistance = Math.sqrt(
            Math.pow(mainSpherePos.x - ammoShadowPos.x, 2) +
            Math.pow(mainSpherePos.y - ammoShadowPos.y, 2) +
            Math.pow(mainSpherePos.z - ammoShadowPos.z, 2)
        );
        
        const mainToBulletDistance = Math.sqrt(
            Math.pow(mainSpherePos.x - bulletShadowPos.x, 2) +
            Math.pow(mainSpherePos.y - bulletShadowPos.y, 2) +
            Math.pow(mainSpherePos.z - bulletShadowPos.z, 2)
        );
        
        const serverToMainDistance = Math.sqrt(
            Math.pow(mainSpherePos.serverX - mainSpherePos.x, 2) +
            Math.pow(mainSpherePos.serverY - mainSpherePos.y, 2) +
            Math.pow(mainSpherePos.serverZ - mainSpherePos.z, 2)
        );
        
        // Выводим статистику только примерно раз в секунду (чтобы не спамить консоль)
        if (Math.random() < 0.016) { // примерно при 60 FPS будет выводить раз в секунду
            throttledLog("Physics", "Диагностика расхождений:", {
                "Основная сфера -> Ammo-тень": mainToAmmoDistance.toFixed(3),
                "Основная сфера -> Bullet-тень": mainToBulletDistance.toFixed(3),
                "Серверная позиция -> Основная сфера": serverToMainDistance.toFixed(3)
            });
        }
    }
    
 }


// Функция для применения импульса
export function applyImpulseToSphere(id, direction, strength) {
    const object = objects[id];
    if (!object || !object.body) return;
    
    try {
        if (typeof Ammo === 'undefined') {
            console.error('Ammo.js не инициализирован');
            return;
        }
        
        // Нормализуем направление и применяем силу
        const impulseVec = new Ammo.btVector3(
            direction.x * strength,
            direction.y * strength, 
            direction.z * strength
        );
        
        // Применяем импульс к телу
        object.body.applyCentralImpulse(impulseVec);
        
        // Выводим информацию о примененном импульсе
        console.log(`[Physics] Импульс применен к ${id}: 
            Направление: (${direction.x.toFixed(2)}, ${direction.y.toFixed(2)}, ${direction.z.toFixed(2)})
            Сила: ${strength.toFixed(2)}`);
        
        // Освобождаем память
        Ammo.destroy(impulseVec);
    } catch (error) {
        console.error('Ошибка при применении импульса:', error);
    }
}

// Функция для получения обновлений с сервера
export function receiveObjectUpdate(data) {
    try {
        // Проверяем, в каком формате пришли данные
        if (data.objects) {
            // Стандартный формат с полем objects
            const objectIds = Object.keys(data.objects);
            if (objectIds.length === 0) {
                console.warn("[Physics] Получен пустой список объектов");
                return;
            }
            
            // Обрабатываем каждый объект
            for (const id of objectIds) {
                const objectData = data.objects[id];
                updateSingleObject(id, objectData);
            }
        } else if (data.id) {
            // Альтернативный формат, где данные напрямую в корне объекта
            // Создаем временную структуру для совместимости
            const id = data.id;
            
            console.log(`[Physics] Исходные данные с сервера для ${id}:`, {
                id: data.id,
                position: data.x !== undefined ? { x: data.x, y: data.y, z: data.z } : "не указана",
                velocity: data.vx !== undefined ? { vx: data.vx, vy: data.vy, vz: data.vz } : "не указана",
                raw: { ...data } // Копируем все поля объекта для диагностики
            });
            
            // Преобразуем данные в формат, ожидаемый функцией updateSingleObject
            const objectData = {
                velocity: data.vx !== undefined ? { 
                    x: data.vx, 
                    y: data.vy, 
                    z: data.vz 
                } : undefined,
                position: data.x !== undefined ? { 
                    x: data.x, 
                    y: data.y, 
                    z: data.z 
                } : undefined
            };
            
            // Добавляем отладочную информацию
            console.log(`[Physics] Обработка данных в альтернативном формате для ${id}:`, data);
            
            // Обрабатываем объект
            updateSingleObject(id, objectData);
        } else {
            console.warn("[Physics] Получены данные в неизвестном формате:", data);
        }
    } catch (e) {
        console.error("[Physics] Ошибка при обработке обновления объектов:", e);
    }
}

// Вспомогательная функция для обновления одного объекта
function updateSingleObject(id, objectData) {
    const obj = objects[id];
    
    // Если объект еще не создан, пропускаем его
    if (!obj) {
        console.warn(`[Physics] Получено обновление для несуществующего объекта: ${id}`);
        return;
    }
    
    // Проверяем наличие данных о скорости
    if (objectData.velocity) {
        const vel = objectData.velocity;
        
        // Выводим подробную информацию о полученной скорости
        console.log(`[Physics] Получена скорость для ${id}: ` + 
            `x=${vel.x.toFixed(2)}, y=${vel.y.toFixed(2)}, z=${vel.z.toFixed(2)}`);
        
        // Вычисляем величину скорости
        const speed = Math.sqrt(vel.x*vel.x + vel.y*vel.y + vel.z*vel.z);
        console.log(`[Physics] Текущая скорость ${id}: ${speed.toFixed(2)} м/с`);
        
        // Сохраняем скорость в объекте
        obj.serverVelocity = {
            x: vel.x,
            y: vel.y,
            z: vel.z
        };
        
        // Обновляем отображение скорости, если это игрок
        if (id.startsWith('mainPlayer1')) {
            // Используем значение массы из объекта
            const maxDisplaySpeed = 1000.0; // Большое значение для снятия ограничений
            const mass = obj.mass || 5.0; // Используем массу из объекта или стандартное значение
            
            // Обновляем отображение
            //updatePlayerSpeedDisplay(speed, maxDisplaySpeed, mass);
            
            // Логируем очень высокие скорости, но не ограничиваем
            if (speed > 500) {
                console.log(`[Physics] Высокая скорость ${id}: ${speed.toFixed(2)} м/с`);
            }
        }
    }
    
    // Обрабатываем данные о позиции
    if (objectData.position) {
        // Сохраняем предыдущую серверную позицию для сравнения
        if (obj.serverPos) {
            obj.prevServerPos = {
                x: obj.serverPos.x,
                y: obj.serverPos.y,
                z: obj.serverPos.z
            };
        }
        
        obj.serverPos = {
            x: objectData.position.x,
            y: objectData.position.y,
            z: objectData.position.z
        };
        obj.lastServerUpdate = Date.now();
        obj.hasNewServerData = true; // Флаг, указывающий на новые данные
    }

    // Добавить после обработки position
    if (objectData.quaternion) {
        // Сохраняем ориентацию
        obj.serverQuaternion = {
            w: objectData.quaternion.w,
            x: objectData.quaternion.x,
            y: objectData.quaternion.y,
            z: objectData.quaternion.z
        };
        
        // Применяем к меше, если она существует
        if (obj.mesh) {
            obj.mesh.quaternion.set(
                objectData.quaternion.x,
                objectData.quaternion.y,
                objectData.quaternion.z,
                objectData.quaternion.w
            );
        }
        
        // Применяем к физическому телу, если оно существует
        if (obj.body) {
            const transform = new window.Ammo.btTransform();
            obj.body.getMotionState().getWorldTransform(transform);
            
            const quaternion = new window.Ammo.btQuaternion(
                objectData.quaternion.x,
                objectData.quaternion.y,
                objectData.quaternion.z,
                objectData.quaternion.w
            );
            
            transform.setRotation(quaternion);
            obj.body.getMotionState().setWorldTransform(transform);
            
            window.Ammo.destroy(quaternion);
            window.Ammo.destroy(transform);
        }
    }

    // Получаем текущую позицию объекта
    if (obj.body) {
        const transform = new window.Ammo.btTransform();
        obj.body.getMotionState().getWorldTransform(transform);
        
        const posX = transform.getOrigin().x();
        const posY = transform.getOrigin().y();
        const posZ = transform.getOrigin().z();
        
        console.log(`[Physics] Позиция сравнение - Клиент: {x: ${posX.toFixed(2)}, y: ${posY.toFixed(2)}, z: ${posZ.toFixed(2)}}, Сервер: {x: ${objectData.position?.x.toFixed(2) || "н/д"}, y: ${objectData.position?.y.toFixed(2) || "н/д"}, z: ${objectData.position?.z.toFixed(2) || "н/д"}}`);
        
        // Если позиционные данные существуют, проверим расхождение
        if (objectData.position) {
            const dx = objectData.position.x - posX;
            const dy = objectData.position.y - posY;
            const dz = objectData.position.z - posZ;
            
            const distance = Math.sqrt(dx*dx + dy*dy + dz*dz);
            console.log(`[Physics] Расхождение между клиентом и сервером: ${distance.toFixed(2)} единиц`);
        }
        
        window.Ammo.destroy(transform);
    }

    // Если мы обновляем позицию
    if (objectData.position && obj.body) {
        // Запомним исходную позицию перед обновлением
        const oldTransform = new window.Ammo.btTransform();
        obj.body.getMotionState().getWorldTransform(oldTransform);
        const oldX = oldTransform.getOrigin().x();
        const oldY = oldTransform.getOrigin().y();
        const oldZ = oldTransform.getOrigin().z();
        
        // Применяем новую позицию
        const newTransform = new window.Ammo.btTransform();
        newTransform.setIdentity();
        newTransform.setOrigin(new window.Ammo.btVector3(
            objectData.position.x,
            objectData.position.y,
            objectData.position.z
        ));
        obj.body.getMotionState().setWorldTransform(newTransform);
        
        // Проверяем, изменилась ли позиция
        const checkTransform = new window.Ammo.btTransform();
        obj.body.getMotionState().getWorldTransform(checkTransform);
        const newX = checkTransform.getOrigin().x();
        const newY = checkTransform.getOrigin().y();
        const newZ = checkTransform.getOrigin().z();
        
        console.log(`[Physics] Телепортация - До: {x: ${oldX.toFixed(2)}, y: ${oldY.toFixed(2)}, z: ${oldZ.toFixed(2)}}, После: {x: ${newX.toFixed(2)}, y: ${newY.toFixed(2)}, z: ${newZ.toFixed(2)}}, Цель: {x: ${objectData.position.x.toFixed(2)}, y: ${objectData.position.y.toFixed(2)}, z: ${objectData.position.z.toFixed(2)}}`);
        
        // Проверяем успешность
        const success = 
            Math.abs(newX - objectData.position.x) < 0.1 &&
            Math.abs(newY - objectData.position.y) < 0.1 &&
            Math.abs(newZ - objectData.position.z) < 0.1;
        
        console.log(`[Physics] Телепортация ${success ? 'успешна' : 'неудачна'}`);
        
        // Очищаем ресурсы
        window.Ammo.destroy(oldTransform);
        window.Ammo.destroy(newTransform);
        window.Ammo.destroy(checkTransform);
    }
}

// В файле physics.js добавляем функцию для создания случайной силы при столкновении
// TODO: Реализация отложена на будущее
/*
export function addCollisionBounceEffect() {
    try {
        if (typeof Ammo === 'undefined') return;
        
        // Добавляем обработчик столкновений, который будет добавлять случайную силу
        // Эта функция может быть вызвана в начале симуляции
        window.addEventListener('collisions', (e) => {
            const { body1, body2 } = e.detail;
            
            // Добавляем случайный импульс при столкновении
            if (body1 && body1.getType() === Ammo.btRigidBody) {
                const randomImpulse = new Ammo.btVector3(
                    (Math.random() - 0.5) * 15, // Увеличиваем с 10 до 15
                    Math.random() * 8,          // Увеличиваем с 5 до 8
                    (Math.random() - 0.5) * 15  // Увеличиваем с 10 до 15
                );
                body1.applyCentralImpulse(randomImpulse);
                Ammo.destroy(randomImpulse);
            }
            
            if (body2 && body2.getType() === Ammo.btRigidBody) {
                const randomImpulse = new Ammo.btVector3(
                    (Math.random() - 0.5) * 15, // Увеличиваем с 10 до 15
                    Math.random() * 8,          // Увеличиваем с 5 до 8
                    (Math.random() - 0.5) * 15  // Увеличиваем с 10 до 15
                );
                body2.applyCentralImpulse(randomImpulse);
                Ammo.destroy(randomImpulse);
            }
        });
        
        console.log("Добавлен эффект отскока при столкновениях");
    } catch (error) {
        console.error('Ошибка при добавлении эффекта отскока:', error);
    }
}
*/

// Функция для применения конфигурации физики
export function applyPhysicsConfig(config) {
    if (!config) {
        console.warn("[Physics] Получена пустая конфигурация физики");
        return;
    }

    console.log("[Physics] Применяем конфигурацию физики:", config);

    // Применяем настройки ко всем объектам
    for (let id in objects) {
        const obj = objects[id];
        if (!obj || !obj.body) continue;
        
        try {
            // Обновляем массу объекта
            if (id.startsWith('mainPlayer')) {
                // Игроки получают массу из конфигурации
                const mass = config.player_mass || 15.0;
                obj.mass = mass;
                
                if (obj.body) {
                    // Сохраняем текущее состояние движения
                    // const velocity = obj.body.getLinearVelocity();
                    
                    // // Создаем новую информацию о инерции
                    // const shape = obj.body.getCollisionShape();
                    // const localInertia = new Ammo.btVector3(0, 0, 0);
                    // shape.calculateLocalInertia(mass, localInertia);
                    
                    // // Устанавливаем новую массу
                    // obj.body.setMassProps(mass, localInertia);
                    
                    // // Восстанавливаем скорость
                    // obj.body.setLinearVelocity(velocity);
                    
                    // Активируем объект для обновления физики
                    obj.body.activate(true);
                    
                    console.log(`[Physics] Установлена масса ${id}: ${mass} кг`);
                    
                    // Освобождаем ресурсы
                    Ammo.destroy(localInertia);
                    Ammo.destroy(velocity);
                }
            } else if (id.includes('box')) {
                // Боксы получают свою массу из конфигурации
                const mass = config.default_box_mass || 5.0;
                obj.mass = mass;
                
                if (obj.body) {
                    // Аналогично для коробок
                    const velocity = obj.body.getLinearVelocity();
                    const shape = obj.body.getCollisionShape();
                    const localInertia = new Ammo.btVector3(0, 0, 0);
                    shape.calculateLocalInertia(mass, localInertia);
                    
                    obj.body.setMassProps(mass, localInertia);
                    obj.body.setLinearVelocity(velocity);
                    obj.body.activate(true);
                    
                    console.log(`[Physics] Установлена масса ${id}: ${mass} кг`);
                    
                    Ammo.destroy(localInertia);
                    Ammo.destroy(velocity);
                }
            }
            
            // Можно также обновить другие свойства (трение, отскок и т.д.)
            if (obj.body) {
                // Устанавливаем отскок (restitution)
                obj.body.setRestitution(config.restitution || 0.9);
                
                // Устанавливаем трение (friction)
                obj.body.setFriction(config.friction || 0.5);
            }
        } catch (e) {
            console.error(`[Physics] Ошибка при применении конфигурации к ${id}:`, e);
        }
    }
    
    // Сохраняем глобальные параметры для использования при создании новых объектов
    window.PHYSICS_CONFIG = config;
    
    console.log("[Physics] Конфигурация физики успешно применена");
}