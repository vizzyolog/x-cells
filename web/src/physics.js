// physics.js

import { objects } from './objects';
import { startPhysicsSimulation, sendData } from './network';
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

let world = null;
let tmpPos = null;

// Настройки физики, получаемые с сервера
let physicsConfig = {
    baseImpulse: 25.0,
    impulseMultiplier: 0.3,
    distanceMultiplier: 0.2,
    maxImpulse: 50.0,
    maxSpeed: 80.0
};

// Обновление конфигурации физики
export function updatePhysicsConfig(config) {
    console.log('Получена новая конфигурация физики:', config);
    if (config) {
        physicsConfig = {
            ...physicsConfig,
            ...config
        };
        console.log('Обновлена конфигурация физики:', physicsConfig);
        
        // Обновляем константу максимальной скорости
        MAX_SPEED = physicsConfig.maxSpeed;
    }
}

// Получение текущей конфигурации физики
export function getPhysicsConfig() {
    return physicsConfig;
}

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

// Функция для ограничения скорости объектов
function applySpeedLimits(obj) {
    if (!obj || !obj.body || !window.Ammo) return;
    
    try {
        // Получаем текущую скорость объекта
        const velocity = obj.body.getLinearVelocity();
        const speedSquared = velocity.x() * velocity.x() + velocity.y() * velocity.y() + velocity.z() * velocity.z();
        const speed = Math.sqrt(speedSquared);
        
        // Если скорость превышает максимальную, масштабируем её
        if (speed > MAX_SPEED) {
            console.log(`[Physics] Ограничение скорости объекта. Текущая: ${speed.toFixed(2)}, максимальная: ${MAX_SPEED}`);
            
            // Вычисляем коэффициент масштабирования
            const scaleFactor = MAX_SPEED / speed;
            
            // Применяем новую скорость
            const newVelocity = new window.Ammo.btVector3(
                velocity.x() * scaleFactor,
                velocity.y() * scaleFactor,
                velocity.z() * scaleFactor
            );
            
            // Устанавливаем новую скорость
            obj.body.setLinearVelocity(newVelocity);
            
            // Освобождаем ресурсы
            window.Ammo.destroy(newVelocity);
        }
    } catch (error) {
        console.error('Ошибка при применении ограничения скорости:', error);
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
export function applyImpulseToSphere(objectId, direction, distance) {
    const object = objects[objectId];
    if (!object || !object.physicsBody) {
        console.warn('Объект не найден или не имеет физического тела:', objectId);
        return;
    }

    // Вычисление силы импульса на основе конфигурации физики
    const baseForce = physicsConfig.baseImpulse;
    const distanceMultiplier = physicsConfig.distanceMultiplier;
    const maxImpulse = physicsConfig.maxImpulse;
    
    // Расчёт силы с учётом дистанции (для клика мыши)
    let force = baseForce;
    if (distance > 0) {
        force += distance * distanceMultiplier;
        // Ограничиваем максимальную силу
        force = Math.min(force, maxImpulse);
    }
    
    // Нормализуем направление
    const normalizedDir = new Ammo.btVector3(direction.x, direction.y, direction.z);
    normalizedDir.normalize();
    
    // Применяем множитель к направлению
    normalizedDir.op_mul(force);
    
    // Устанавливаем активацию тела
    object.physicsBody.activate(true);
    
    // Применяем импульс
    object.physicsBody.applyCentralImpulse(normalizedDir);
    
    // Уничтожаем временные объекты Ammo.js
    Ammo.destroy(normalizedDir);
}

// Добавляем функцию для отправки запроса на применение импульса на сервере
export function requestServerImpulse(objectId, direction, force) {
    const data = {
        type: 'apply_impulse',
        object_id: objectId,
        direction: direction, // { x, y, z }
        force: force
    };
    sendData(data);
    console.log(`Отправлен запрос на импульс для объекта ${objectId}, сила: ${force}`);
}

/**
 * Функция для безопасной обработки потенциально NaN значений
 * @param {number} value - Проверяемое значение
 * @param {number} fallback - Значение по умолчанию, если value является NaN, null или undefined
 * @return {number} - Безопасное значение
 */
function safeValue(value, fallback = 0) {
    if (value === undefined || value === null || isNaN(value)) {
        return fallback;
    }
    return value;
}

// Функция для обработки обновления объекта от сервера
function receiveObjectUpdate(data) {
    const id = data.id;
    const obj = objects[id];

    if (!obj) {
        console.warn(`[Physics] Получено обновление для несуществующего объекта: ${id}`);
        return;
    }

    // Проверка на NaN значения во входных данных
    const position = data.position || {};
    const velocity = data.velocity || {};
    
    // Проверка на полностью недопустимые объекты данных
    if (!position || !velocity || 
        (typeof position !== 'object') || 
        (typeof velocity !== 'object')) {
        console.error(`[Physics] Получены некорректные данные позиции/скорости для объекта ${id}:`, data);
        return; // Пропускаем обновление полностью при серьезной ошибке в данных
    }
    
    // Проверяем, все ли компоненты позиции валидны
    const positionValid = !isNaN(position.x) && !isNaN(position.y) && !isNaN(position.z) &&
                          position.x !== undefined && position.y !== undefined && position.z !== undefined;
    
    // Проверяем, все ли компоненты скорости валидны
    const velocityValid = !isNaN(velocity.x) && !isNaN(velocity.y) && !isNaN(velocity.z) &&
                          velocity.x !== undefined && velocity.y !== undefined && velocity.z !== undefined;
    
    // Защита от NaN значений
    const safePos = {
        x: isNaN(position.x) ? (obj.lastSafePosition ? obj.lastSafePosition.x : 0) : position.x,
        y: isNaN(position.y) ? (obj.lastSafePosition ? obj.lastSafePosition.y : 0) : position.y,
        z: isNaN(position.z) ? (obj.lastSafePosition ? obj.lastSafePosition.z : 0) : position.z
    };
    
    const safeVel = {
        x: isNaN(velocity.x) ? 0 : velocity.x,
        y: isNaN(velocity.y) ? 0 : velocity.y,
        z: isNaN(velocity.z) ? 0 : velocity.z
    };
    
    // Сохраняем последнюю безопасную позицию только если текущая валидна
    if (positionValid) {
        obj.lastSafePosition = { ...position };
    } else if (!obj.lastSafePosition) {
        // Если у нас еще нет безопасной позиции, используем текущую исправленную
        obj.lastSafePosition = { ...safePos };
    }
    
    // Логируем только при создании нового объекта
    if (isNew(id)) {
        const now = performance.now();
        objectCreationTimes.set(id, now);
        console.log(`[Physics] Новый объект ${id} создан в позиции:`, positionValid ? position : safePos);
    }

    // Проверка и обновление физического тела
    if (obj.body) {
        // Обновление дополнительных данных
        if (data.active !== undefined) {
            obj.active = data.active;
        }
        
        if (data.serverFrame !== undefined) {
            obj.lastServerFrame = data.serverFrame;
        }
        
        if (data.serverTime !== undefined) {
            obj.lastServerTime = data.serverTime;
        }
        
        const body = obj.body;
        
        // Применяем позицию только если она не содержит NaN
        if (positionValid) {
            body.position.set(position.x, position.y, position.z);
            obj.serverPosition.copy(body.position);
            obj.previousPosition.copy(body.position);
        } else {
            // Если позиция содержит NaN, логируем это и используем безопасное значение
            console.warn(`[Physics] Обнаружены NaN значения в позиции объекта ${id}:`, 
                {original: position, corrected: safePos});
                
            // Используем последнюю безопасную позицию
            if (obj.lastSafePosition) {
                body.position.set(safePos.x, safePos.y, safePos.z);
                obj.serverPosition.copy(body.position);
            }
        }
        
        // Применяем скорость только если она не содержит NaN
        if (velocityValid) {
            body.velocity.set(velocity.x, velocity.y, velocity.z);
            obj.serverVelocity.copy(body.velocity);
        } else {
            // Если скорость содержит NaN, логируем это и используем безопасное значение
            console.warn(`[Physics] Обнаружены NaN значения в скорости объекта ${id}:`, 
                {original: velocity, corrected: safeVel});
                
            // Устанавливаем безопасную скорость
            body.velocity.set(safeVel.x, safeVel.y, safeVel.z);
            obj.serverVelocity.copy(body.velocity);
        }
    }
}

// Функция интерполяции для обновления позиций объектов
export function updateObjectPositions(deltaTime) {
    const currentTime = Date.now();
    
    // Коэффициент интерполяции - как быстро объект будет стремиться к серверной позиции
    const lerpFactor = 0.1;
    
    for (const [id, obj] of Object.entries(objects)) {
        if (!obj.mesh || !obj.serverPos) continue;
        
        // Проверка на NaN значения в текущей позиции меша
        if (Number.isNaN(obj.mesh.position.x) || Number.isNaN(obj.mesh.position.y) || Number.isNaN(obj.mesh.position.z)) {
            console.warn(`[ИСПРАВЛЕНИЕ] NaN в позиции объекта ${id}, сброс в (0,0,0)`);
            obj.mesh.position.set(0, 0, 0);
        }
        
        // Проверка на NaN значения в серверной позиции
        const targetX = safeValue(obj.serverPos.x);
        const targetY = safeValue(obj.serverPos.y);
        const targetZ = safeValue(obj.serverPos.z);
        
        // Рассчитываем следующую позицию через интерполяцию
        const nextX = obj.mesh.position.x + (targetX - obj.mesh.position.x) * lerpFactor;
        const nextY = obj.mesh.position.y + (targetY - obj.mesh.position.y) * lerpFactor;
        const nextZ = obj.mesh.position.z + (targetZ - obj.mesh.position.z) * lerpFactor;
        
        // Итоговая проверка позиции на NaN перед применением
        obj.mesh.position.set(
            safeValue(nextX),
            safeValue(nextY),
            safeValue(nextZ)
        );
        
        // Обновляем индикатор направления для игрока
        if (id === 'mainPlayer1' && playerDirectionIndicator) {
            updatePlayerDirection();
        }
    }
}
