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
const PREDICTION_SMOOTH_FACTOR = 5; 
const PREDICTION_MAX_ERROR = 5.0; 
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
    const collisionConfiguration = new Ammo.btDefaultCollisionConfiguration();
    const dispatcher = new Ammo.btCollisionDispatcher(collisionConfiguration);
    const broadphase = new Ammo.btDbvtBroadphase();
    const solver = new Ammo.btSequentialImpulseConstraintSolver();
    
    localPhysicsWorld = new Ammo.btDiscreteDynamicsWorld(
        dispatcher,
        broadphase,
        solver,
        collisionConfiguration
    );
    
    // Устанавливаем гравитацию
    localPhysicsWorld.setGravity(new Ammo.btVector3(0, -9.81, 0));
    
    console.log("[Physics] Физический мир успешно создан");
    
    // Добавляем эффект отскока после создания мира
    addCollisionBounceEffect();
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
        if (!objects || !window.Ammo) return;
        
        // Максимальная скорость для объектов
        const MAX_SPEED = 25.0; // Увеличено с 20.0 до 25.0
        
        for (let id in objects) {
            const obj = objects[id];
            if (!obj || !obj.body) continue;
            
            // Пропускаем статические объекты или террейн
            if (obj.object_type === "terrain") continue;
            
            // Получаем текущую линейную скорость
            const velocity = obj.body.getLinearVelocity();
            const speed = velocity.length();
            
            // Если скорость превышает максимальную, уменьшаем её
            if (speed > MAX_SPEED && speed > 0) {
                velocity.op_mul(MAX_SPEED / speed);
                obj.body.setLinearVelocity(velocity);
                
                // Добавляем небольшой случайный импульс при достижении максимальной скорости
                // для более интересного поведения при столкновениях
                if (Math.random() < 0.1) { // 10% шанс
                    const randomImpulse = new window.Ammo.btVector3(
                        (Math.random() - 0.5) * 5,
                        Math.random() * 2,
                        (Math.random() - 0.5) * 5
                    );
                    obj.body.applyCentralImpulse(randomImpulse);
                    window.Ammo.destroy(randomImpulse);
                }
            }
            
            window.Ammo.destroy(velocity);
        }
    } catch (error) {
        console.error('Ошибка при применении ограничений скорости:', error);
    }
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
                    const isMovingFast = speedSq > 4.0; // Если скорость больше 2 м/с
                    
                    const dx = obj.serverPos.x - currentX;
                    const dy = obj.serverPos.y - currentY;
                    const dz = obj.serverPos.z - currentZ;
                    
                    // Вычисляем расстояние
                    const distance = Math.sqrt(dx*dx + dy*dy + dz*dz);
                    
                      // Экстраполяция
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
                            obj.serverPos.x = predictedX;
                            obj.serverPos.y = predictedY;
                            obj.serverPos.z = predictedZ;
                        }
                    }
                    // Логируем только при значительных расхождениях
                    if (distance > DEAD_ZONE || isMovingFast) {
                        // throttledLog("Physics", 
                        //     `Объект ${id}: Расстояние: ${distance.toFixed(3)}, Скорость: ${Math.sqrt(speedSq).toFixed(3)}, Быстро: ${isMovingFast}, Клиент: {x: ${currentX.toFixed(2)}, y: ${currentY.toFixed(2)}, z: ${currentZ.toFixed(2)}}, Сервер: {x: ${obj.serverPos.x.toFixed(2)}, y: ${obj.serverPos.y.toFixed(2)}, z: ${obj.serverPos.z.toFixed(2)}}`
                        // );
                    }
                    
                    // Применяем client-side prediction
                    if (distance > DEAD_ZONE) {
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
                        if (distance > PREDICTION_MAX_ERROR || isNewObject && distance > 5.0) {
                            // При экстремальных расхождениях - телепортация
                            // throttledLog("Physics", 
                            //     `Экстремальное расхождение объекта ${id}, расстояние: ${distance.toFixed(2)}, новый: ${isNewObject}`
                            // );
                            
                            // Телепортируем объект
                            transform.setOrigin(new window.Ammo.btVector3(
                                obj.serverPos.x,
                                obj.serverPos.y,
                                obj.serverPos.z
                            ));
                            obj.body.getMotionState().setWorldTransform(transform);
                            
                            // Сбрасываем скорость только при существенных расхождениях
                            if (distance > PREDICTION_MAX_ERROR * 1.5) {
                                // При очень больших расхождениях полностью сбрасываем скорость
                                const zero = new window.Ammo.btVector3(0, 0, 0);
                                obj.body.setLinearVelocity(zero);
                                obj.body.setAngularVelocity(zero);
                                window.Ammo.destroy(zero);
                            } else if (obj.serverVelocity) {
                                // Если есть рассчитанная серверная скорость, применяем её
                                const serverVel = new window.Ammo.btVector3(
                                    obj.serverVelocity.x,
                                    obj.serverVelocity.y,
                                    obj.serverVelocity.z
                                );
                                obj.body.setLinearVelocity(serverVel);
                                window.Ammo.destroy(serverVel);
                            } else {
                                // Иначе уменьшаем текущую скорость
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
                    
                    window.Ammo.destroy(velocity);
                    window.Ammo.destroy(transform);
                }
                break;
                
            default:
                //throttledLog("Error", `Неизвестный тип physicsBy для объекта ${id}: ${obj.physicsBy}`);
                break;
        }
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


// Функция для применения импульса с сохранением в истории
export function applyImpulseToSphere(id, direction, strength) {
    const object = objects[id];
    if (!object || !object.body) return;
    
    try {
        if (typeof Ammo === 'undefined') {
            console.error('Ammo.js не инициализирован');
            return;
        }
        
        // Увеличиваем базовый импульс для лучшего движения
        const baseImpulse = 25.0; // Увеличиваем с 20.0 до 25.0
        const impulseStrength = strength || baseImpulse;
        
        // Нормализуем направление и применяем силу
        const impulseVec = new Ammo.btVector3(
            direction.x * impulseStrength,
            direction.y * impulseStrength, 
            direction.z * impulseStrength
        );
        
        // Применяем импульс к телу
        object.body.applyCentralImpulse(impulseVec);
        
        // Выводим информацию о примененном импульсе
        console.log(`Импульс применен к ${id}: 
            Направление: (${direction.x.toFixed(2)}, ${direction.y.toFixed(2)}, ${direction.z.toFixed(2)})
            Сила: ${impulseStrength.toFixed(2)}`);
        
        // Освобождаем память
        Ammo.destroy(impulseVec);
    } catch (error) {
        console.error('Ошибка при применении импульса:', error);
    }
}

export function receiveObjectUpdate(data) {
    const id = data.id;
    
    const obj = objects[id];
    if (!obj) {
        // throttledLog("Error", `Получено обновление для несуществующего объекта: ${id}`);
        return;
    }
    
    // Логируем информацию о полученном обновлении
    // throttledLog("Physics", 
    //     `Получено обновление для объекта ${id} (${obj.physicsBy}): ` +
    //     `x=${data.x?.toFixed(2)}, y=${data.y?.toFixed(2)}, z=${data.z?.toFixed(2)}, ` +
    //     `server_time=${data.server_time}`
    // );
    
    // Проверяем, является ли объект новым
    if (!objectCreationTimes.has(id)) {
        objectCreationTimes.set(id, Date.now());
        console.log(`[Physics] Установлен таймер для нового объекта ${id}`);
    }
    
    // Получаем временную метку сервера
    const serverTime = data.server_time;
    if (!serverTime) {
      //  throttledLog("Warning", `Получено обновление без временной метки сервера для ${id}`);
    }
    
    // Обновляем время последнего обновления
    const now = Date.now();
    const timeSinceLastUpdate = now - lastServerUpdateTime;
    lastServerUpdateTime = now;
    
    // Обновляем серверную позицию
    const oldServerPos = obj.serverPos ? { ...obj.serverPos } : null;
    obj.serverPos = {
        x: data.x || 0,
        y: data.y || 0,
        z: data.z || 0
    };
    
    // Сохраняем временную метку сервера для этого обновления
    obj.lastServerUpdate = {
        time: serverTime,
        clientTime: now,
        position: { ...obj.serverPos }
    };
    
    // Если это первое обновление, просто принимаем серверную позицию
    if (!oldServerPos) {
       // throttledLog("Physics", `Первое обновление для объекта ${id}, принимаем серверную позицию`);
        return;
    }
    
    // Рассчитываем скорость сервера, учитывая временные метки
    if (obj.previousServerUpdate && serverTime && obj.previousServerUpdate.time) {
        const timeDelta = (serverTime - obj.previousServerUpdate.time) / 1000; // в секундах
        
        if (timeDelta > 0) {
            obj.serverVelocity = {
                x: (obj.serverPos.x - obj.previousServerUpdate.position.x) / timeDelta,
                y: (obj.serverPos.y - obj.previousServerUpdate.position.y) / timeDelta,
                z: (obj.serverPos.z - obj.previousServerUpdate.position.z) / timeDelta
            };
            
            // Логируем информацию о скорости для всех объектов с bullet-физикой
            if (obj.physicsBy === "bullet" || obj.physicsBy === "both") {
                // throttledLog("Physics", 
                //     `Вычислена скорость сервера для ${id} (${obj.physicsBy}): ` +
                //     `vx=${obj.serverVelocity.x.toFixed(2)}, ` +
                //     `vy=${obj.serverVelocity.y.toFixed(2)}, ` +
                //     `vz=${obj.serverVelocity.z.toFixed(2)}, ` +
                //     `delta=${timeDelta.toFixed(3)}с`
                // );
            }
        }
    }
    
    // Сохраняем текущее обновление как предыдущее для следующего расчета
    obj.previousServerUpdate = {
        time: serverTime,
        clientTime: now,
        position: { ...obj.serverPos }
    };
    
    // Анализируем расхождение между прогнозируемым и фактическим состоянием
    if (obj.lastImpulse && serverTime) {
        // Вычисляем, сколько времени прошло с момента применения последнего импульса
        const timeSinceLastImpulse = now - obj.lastImpulse.clientTime;
        
        // Проверяем, учтен ли наш последний импульс в обновлении с сервера
        // (обычно требуется RTT для получения реакции сервера)
        if (timeSinceLastImpulse > 50) { // Предполагаем минимальную задержку сети
            // Теперь мы можем сравнить наше предсказанное положение с фактическим
            // и скорректировать нашу модель предсказания
            
            // Текущее состояние объекта в клиентской физике
            const transform = new window.Ammo.btTransform();
            if (obj.body) {
                obj.body.getMotionState().getWorldTransform(transform);
                const currentX = transform.getOrigin().x();
                const currentY = transform.getOrigin().y();
                const currentZ = transform.getOrigin().z();
                
                // Вычисляем расхождение между нашим предсказанием и обновлением сервера
                const dx = obj.serverPos.x - currentX;
                const dy = obj.serverPos.y - currentY;
                const dz = obj.serverPos.z - currentZ;
                const distance = Math.sqrt(dx*dx + dy*dy + dz*dz);
                
                if (id === "mainPlayer1" && distance > 1.0) {
                    // throttledLog("Physics", 
                    //     `Анализ расхождения для ${id}: расстояние=${distance.toFixed(2)}, ` +
                    //     `время с последнего импульса=${timeSinceLastImpulse}мс, ` +
                    //     `команда=${obj.lastImpulse.cmd}`
                    // );
                }
                
                window.Ammo.destroy(transform);
            }
        }
    }

    // Применяем импульс от сервера к объектам с типами физики bullet или both
    if ((obj.physicsBy === "bullet" || obj.physicsBy === "both") && obj.serverVelocity) {
        // Создаем импульс на основе серверной скорости
        const impulse = new window.Ammo.btVector3(
            obj.serverVelocity.x,
            obj.serverVelocity.y,
            obj.serverVelocity.z
        );
        
        // Применяем импульс к физическому телу
        if (obj.body) {
            obj.body.activate(true);
            obj.body.applyCentralImpulse(impulse);
            
            // throttledLog("Physics", 
            //     `Применен серверный импульс к ${id} (${obj.physicsBy}): ` +
            //     `vx=${obj.serverVelocity.x.toFixed(2)}, ` +
            //     `vy=${obj.serverVelocity.y.toFixed(2)}, ` +
            //     `vz=${obj.serverVelocity.z.toFixed(2)}`
            // );
        } else {
            // Если нет физического тела, просто обновляем позицию меша
            obj.mesh.position.set(
                obj.serverPos.x,
                obj.serverPos.y,
                obj.serverPos.z
            );
            
            // throttledLog("Physics", 
            //     `Обновлена позиция меша для ${id} (${obj.physicsBy}): ` +
            //     `x=${obj.serverPos.x.toFixed(2)}, ` +
            //     `y=${obj.serverPos.y.toFixed(2)}, ` +
            //     `z=${obj.serverPos.z.toFixed(2)}`
            // );
        }
        
        window.Ammo.destroy(impulse);
    }
}

// В файле physics.js добавляем функцию для создания случайной силы при столкновении
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
                    (Math.random() - 0.5) * 10,
                    Math.random() * 5,
                    (Math.random() - 0.5) * 10
                );
                body1.applyCentralImpulse(randomImpulse);
                Ammo.destroy(randomImpulse);
            }
            
            if (body2 && body2.getType() === Ammo.btRigidBody) {
                const randomImpulse = new Ammo.btVector3(
                    (Math.random() - 0.5) * 10,
                    Math.random() * 5,
                    (Math.random() - 0.5) * 10
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