// physics.js

import { objects } from './objects';
import * as THREE from 'three';
import { startPhysicsSimulation } from './network';

export let localPhysicsWorld = null;
let ammoPromise = null;

// Настройки для коррекции позиции
const DEAD_ZONE = 0.1; // Мертвая зона, в пределах которой не применяется коррекция
const CORRECTION_STRENGTH = 10.0; // Уменьшаем силу корректировки для более плавного движения
const TELEPORT_THRESHOLD = 3.0; // Порог для начала плавной коррекции

// Добавляем настройки для client-side prediction
const PREDICTION_SMOOTH_FACTOR = 0.2; // Базовый коэффициент сглаживания
const PREDICTION_MAX_ERROR = 10.0; // Порог для жесткой телепортации
const DISTANCE_BASED_SMOOTH_FACTOR = true; // Использовать динамический коэффициент сглаживания
const NEW_OBJECT_TIMEOUT = 2000; // 2 секунды для "новых" объектов

// История команд для предсказания
let inputHistory = []; 
let lastSequenceNumber = 0; // Счетчик последовательности для команд
let lastServerUpdateTime = 0; // Время последнего серверного обновления

// Система логирования с ограничением частоты
const LOG_INTERVAL = 5000; // 1 секунда между логами
const logTimers = {};

// Добавляем маркер времени создания объектов
const objectCreationTimes = new Map();

// Централизованная функция логирования с ограничением частоты
function throttledLog(category, message, data = null) {
    const now = Date.now();
    
    // Проверяем, прошло ли достаточно времени с последнего лога для этой категории
    if (!logTimers[category] || now - logTimers[category] >= LOG_INTERVAL) {
        // Обновляем таймер для этой категории
        logTimers[category] = now;
        
        // Форматируем и выводим сообщение
        if (data) {
            console.log(`[${category}] ${message}`, data);
        } else {
            console.log(`[${category}] ${message}`);
        }
        
        return true; // Лог был выведен
    }
    
    return false; // Лог был пропущен из-за ограничения частоты
}

// Функция для логирования данных о главном игроке
function logMainPlayerInfo() {
    const mainPlayer = objects["mainPlayer1"];
    if (!mainPlayer || !mainPlayer.mesh) {
        return;
    }
    
    const pos = mainPlayer.mesh.position;
    
    // Получаем скорость, если доступна физика
    let vel = { x: 0, y: 0, z: 0 };
    if (mainPlayer.body) {
        const velocity = mainPlayer.body.getLinearVelocity();
        vel = { 
            x: velocity.x(),
            y: velocity.y(),
            z: velocity.z()
        };
        window.Ammo.destroy(velocity);
    }
    
    // Выводим в формате, напоминающем C++ вывод
    throttledLog("MainPlayer", 
        `Position: (${pos.x.toFixed(2)}, ${pos.y.toFixed(2)}, ${pos.z.toFixed(2)}), ` +
        `Velocity: (${vel.x.toFixed(2)}, ${vel.y.toFixed(2)}, ${vel.z.toFixed(2)})`
    );
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

export function stepPhysics(deltaTime) {
    // Проверяем корректность deltaTime
    if (!deltaTime || isNaN(deltaTime) || deltaTime <= 0 || deltaTime > 1) {
        deltaTime = 1/60; // Значение по умолчанию
    }
    
    // Ограничиваем максимальный шаг для стабильности
    const maxStep = 1/30; // Не больше 30мс для одного шага
    const effectiveStep = Math.min(deltaTime, maxStep);
    
    // Используем фиксированный шаг и переменное количество подшагов для точности
    const fixedStep = 1/120; // 120 Гц внутренние шаги
    const maxSubSteps = Math.ceil(effectiveStep / fixedStep);
    
    // Выполняем шаг симуляции с заданными параметрами
    localPhysicsWorld.stepSimulation(effectiveStep, maxSubSteps, fixedStep);
    
    // Выводим информацию о главном игроке
    logMainPlayerInfo();
    
    // Обновляем физические объекты (без лишних логов)
    updatePhysicsObjects(objects);
}

export function updatePhysicsObjects(objects) {
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
                // Обновление по серверным данным с простой интерполяцией
                if (obj.serverPos && obj.object_type !== "terrain") {
                    // Простая линейная интерполяция
                    const interpolationFactor = 0.2; // Можно настроить под ваши нужды
                    
                    obj.mesh.position.x += (obj.serverPos.x - obj.mesh.position.x) * interpolationFactor;
                    obj.mesh.position.y += (obj.serverPos.y - obj.mesh.position.y) * interpolationFactor;
                    obj.mesh.position.z += (obj.serverPos.z - obj.mesh.position.z) * interpolationFactor;
                    
                    // Сохраняем для диагностики
                    if (id === "bullet_shadow") {
                        bulletShadowPos = {
                            x: obj.mesh.position.x,
                            y: obj.mesh.position.y,
                            z: obj.mesh.position.z
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
                    
                    // Логируем только при значительных расхождениях
                    if (distance > DEAD_ZONE || isMovingFast) {
                        throttledLog("Physics", 
                            `Объект ${id}: Расстояние: ${distance.toFixed(3)}, Скорость: ${Math.sqrt(speedSq).toFixed(3)}, Быстро: ${isMovingFast}, Клиент: {x: ${currentX.toFixed(2)}, y: ${currentY.toFixed(2)}, z: ${currentZ.toFixed(2)}}, Сервер: {x: ${obj.serverPos.x.toFixed(2)}, y: ${obj.serverPos.y.toFixed(2)}, z: ${obj.serverPos.z.toFixed(2)}}`
                        );
                    }
                    
                    // Применяем client-side prediction
                    if (distance > DEAD_ZONE) {
                        // Определяем коэффициент сглаживания на основе состояния объекта
                        let smoothFactor = PREDICTION_SMOOTH_FACTOR;
                        
                        // Для новых объектов используем более жесткую коррекцию
                        if (isNewObject) {
                            smoothFactor = 0.8; // 80% серверной позиции
                            throttledLog("Physics", 
                                `Новый объект ${id}, применяем жесткую коррекцию (${smoothFactor})`
                            );
                        } else if (DISTANCE_BASED_SMOOTH_FACTOR) {
                            // Чем больше расхождение, тем больше коэффициент
                            smoothFactor = Math.min(distance / 20.0, 0.5); // Максимум 0.5
                        }
                        
                        // Для больших расхождений или новых объектов применяем телепортацию
                        if (distance > PREDICTION_MAX_ERROR || isNewObject && distance > 5.0) {
                            // При экстремальных расхождениях - телепортация
                            throttledLog("Physics", 
                                `Экстремальное расхождение объекта ${id}, расстояние: ${distance.toFixed(2)}, новый: ${isNewObject}`
                            );
                            
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
                throttledLog("Error", `Неизвестный тип physicsBy для объекта ${id}: ${obj.physicsBy}`);
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
    
    // Добавляем расчет и визуализацию расхождений между движками
    visualizeDivergence(objects);
}

// Функция для визуализации расхождений между движками
function visualizeDivergence(objects) {
    // Проверяем наличие всех необходимых объектов
    const mainSphere = objects["mainPlayer1"];
    const ammoShadow = objects["ammo_shadow"];
    const bulletShadow = objects["bullet_shadow"];
    
    if (!mainSphere || !ammoShadow || !bulletShadow) return;
    
    // Получаем позиции
    const mainPos = mainSphere.mesh.position;
    const ammoPos = ammoShadow.mesh.position;
    const bulletPos = bulletShadow.mesh.position;
    
    // Расчет расстояний
    const distMainToAmmo = Math.sqrt(
        Math.pow(mainPos.x - ammoPos.x, 2) +
        Math.pow(mainPos.y - ammoPos.y, 2) +
        Math.pow(mainPos.z - ammoPos.z, 2)
    );
    
    const distMainToBullet = Math.sqrt(
        Math.pow(mainPos.x - bulletPos.x, 2) +
        Math.pow(mainPos.y - bulletPos.y, 2) +
        Math.pow(mainPos.z - bulletPos.z, 2)
    );
    
    const distAmmoBullet = Math.sqrt(
        Math.pow(ammoPos.x - bulletPos.x, 2) +
        Math.pow(ammoPos.y - ammoPos.y, 2) +
        Math.pow(ammoPos.z - bulletPos.z, 2)
    );
    
    // Ограничим вывод лога, чтобы не спамить консоль (примерно раз в секунду)
    if (!window.lastDivergenceLog || Date.now() - window.lastDivergenceLog > 1000) {
        throttledLog("Physics", "Расхождения между движками:");
        throttledLog("Physics", `  Основной шар (${mainSphere.physicsBy}): x=${mainPos.x.toFixed(2)}, y=${mainPos.y.toFixed(2)}, z=${mainPos.z.toFixed(2)}`);
        throttledLog("Physics", `  Тень Ammo: x=${ammoPos.x.toFixed(2)}, y=${ammoPos.y.toFixed(2)}, z=${ammoPos.z.toFixed(2)}`);
        throttledLog("Physics", `  Тень Bullet: x=${bulletPos.x.toFixed(2)}, y=${bulletPos.y.toFixed(2)}, z=${bulletPos.z.toFixed(2)}`);
        throttledLog("Physics", `  Расстояние Основной-Ammo: ${distMainToAmmo.toFixed(3)}`);
        throttledLog("Physics", `  Расстояние Основной-Bullet: ${distMainToBullet.toFixed(3)}`);
        throttledLog("Physics", `  Расстояние Ammo-Bullet: ${distAmmoBullet.toFixed(3)}`);
        
        // Визуальное отображение расхождений
        if (distMainToAmmo > DEAD_ZONE) {
            throttledLog("Warning", `  [!] Основной шар расходится с Ammo на ${distMainToAmmo.toFixed(3)} (> ${DEAD_ZONE})`);
        }
        
        if (distMainToBullet > DEAD_ZONE) {
            throttledLog("Warning", `  [!] Основной шар расходится с Bullet на ${distMainToBullet.toFixed(3)} (> ${DEAD_ZONE})`);
        }
        
        if (distAmmoBullet > DEAD_ZONE) {
            throttledLog("Warning", `  [!] Ammo расходится с Bullet на ${distAmmoBullet.toFixed(3)} (> ${DEAD_ZONE})`);
        }
        
        // Обновляем время последнего лога
        window.lastDivergenceLog = Date.now();
    }
    
    // Рисуем линии между объектами для визуализации расхождений
    visualizeDivergenceLines(objects, mainPos, ammoPos, bulletPos);
}

// Функция для рисования линий, показывающих расхождения
function visualizeDivergenceLines(objects, mainPos, ammoPos, bulletPos) {
    // Проверяем наличие линий в объектах
    if (!objects.divergenceLines) {
        // Создаем материалы для линий
        const mainToAmmoMaterial = new THREE.LineBasicMaterial({ color: 0xff0000 }); // красный
        const mainToBulletMaterial = new THREE.LineBasicMaterial({ color: 0x00ff00 }); // зеленый
        const ammoBulletMaterial = new THREE.LineBasicMaterial({ color: 0x0000ff }); // синий
        
        // Создаем геометрии и линии
        const mainToAmmoGeometry = new THREE.BufferGeometry();
        const mainToBulletGeometry = new THREE.BufferGeometry();
        const ammoBulletGeometry = new THREE.BufferGeometry();
        
        const mainToAmmoLine = new THREE.Line(mainToAmmoGeometry, mainToAmmoMaterial);
        const mainToBulletLine = new THREE.Line(mainToBulletGeometry, mainToBulletMaterial);
        const ammoBulletLine = new THREE.Line(ammoBulletGeometry, ammoBulletMaterial);
        
        // Добавляем линии на сцену
        if (objects.mainPlayer1 && objects.mainPlayer1.mesh.parent) {
            const scene = objects.mainPlayer1.mesh.parent;
            scene.add(mainToAmmoLine);
            scene.add(mainToBulletLine);
            scene.add(ammoBulletLine);
        }
        
        // Сохраняем линии в объекты
        objects.divergenceLines = {
            mainToAmmo: {
                line: mainToAmmoLine,
                geometry: mainToAmmoGeometry
            },
            mainToBullet: {
                line: mainToBulletLine,
                geometry: mainToBulletGeometry
            },
            ammoBullet: {
                line: ammoBulletLine,
                geometry: ammoBulletGeometry
            }
        };
    }
    
    // Обновляем позиции линий
    if (objects.divergenceLines) {
        // Линия Основной-Ammo
        updateLine(
            objects.divergenceLines.mainToAmmo.geometry,
            mainPos,
            ammoPos
        );
        
        // Линия Основной-Bullet
        updateLine(
            objects.divergenceLines.mainToBullet.geometry,
            mainPos,
            bulletPos
        );
        
        // Линия Ammo-Bullet
        updateLine(
            objects.divergenceLines.ammoBullet.geometry,
            ammoPos,
            bulletPos
        );
    }
}

// Функция для обновления позиций линии
function updateLine(geometry, startPos, endPos) {
    const positions = new Float32Array([
        startPos.x, startPos.y, startPos.z,
        endPos.x, endPos.y, endPos.z
    ]);
    
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.attributes.position.needsUpdate = true;
}

// Функция для применения импульса с сохранением в истории
export function applyImpulseToSphere(cmd, forceX, forceY, forceZ, objectsList, clientTime) {
    console.log("[Debug] Переданные объекты в applyImpulseToSphere:", objectsList);
    // Проверяем, что objects передан и является объектом
    if (!objectsList || typeof objectsList !== 'object') {
        console.error("[Physics] Ошибка в applyImpulseToSphere: objects не определены или некорректны");
        return;
    }

    for (let id in objectsList) {
        const obj = objectsList[id];
        
        // Пропускаем объекты, которые не являются сферами или не имеют физики
        if (!obj || !obj.body || !obj.mesh || !obj.mesh.geometry || 
            obj.mesh.geometry.type !== "SphereGeometry") {
            continue;
        }
        
        // Активируем тело
        obj.body.activate(true);
        
        // Применяем импульс в зависимости от команды и текущей скорости
        // Получаем текущую скорость для сглаживания усилия
        const velocity = obj.body.getLinearVelocity();
        const vx = velocity.x();
        const vy = velocity.y();
        const vz = velocity.z();
        const currentSpeed = Math.sqrt(vx*vx + vy*vy + vz*vz);
        
        // Вычисляем множитель скорости - чем быстрее движется объект,
        // тем меньше дополнительный импульс, чтобы избежать чрезмерных скоростей
        const speedFactor = Math.max(0.5, 1.0 - currentSpeed * 0.05);
        
        // Проверяем, находится ли объект на земле (простая проверка по Y-скорости)
        const isGrounded = Math.abs(vy) < 0.1;
        
        // Базовые значения импульсов
        const baseImpulseHorizontal = 5.0;
        const baseImpulseVertical = 10.0;
        
        // Создаем импульс на основе переданных значений
        const impulse = new window.Ammo.btVector3(
            forceX * speedFactor, 
            forceY * (isGrounded ? 1.0 : 0.3) * speedFactor, 
            forceZ * speedFactor
        );
        
        // Активируем тело и применяем импульс
        obj.body.activate(true);
        obj.body.applyCentralImpulse(impulse);
        
        // Очищаем память
        window.Ammo.destroy(impulse);
        window.Ammo.destroy(velocity);
        
        console.log("[Physics] Применен импульс к шару:", {
            id: id,
            команда: cmd,
            скорость: currentSpeed.toFixed(2),
            множитель: speedFactor.toFixed(2),
            импульс: { x: forceX, y: forceY, z: forceZ },
            время_клиента: clientTime
        });
        
        // Сохраняем информацию о последней примененной команде
        obj.lastImpulse = {
            cmd: cmd,
            force: { x: forceX, y: forceY, z: forceZ },
            clientTime: clientTime
        };
    }
    
    // Синхронизируем диагностические сферы если команда нажата
    if (cmd && objectsList["mainPlayer1"] && objectsList["ammo_shadow"]) {
        syncDiagnosticSpheres(objectsList);
    }
    
    // Добавляем команду в историю для client-side prediction
    const sequenceNumber = ++lastSequenceNumber;
    const timestamp = Date.now();
    
    inputHistory.push({
        sequenceNumber,
        timestamp,
        clientTime,
        cmd,
        impulse: { x: forceX, y: forceY, z: forceZ }
    });
    
    // Очищаем историю старше 2 секунд
    const twoSecondsAgo = timestamp - 2000;
    inputHistory = inputHistory.filter(entry => entry.timestamp > twoSecondsAgo);
}

// Синхронизация диагностических сфер с основной сферой
function syncDiagnosticSpheres(objects) {
    // Получаем основную сферу
    const mainSphere = objects["mainPlayer1"];
    if (!mainSphere || !mainSphere.mesh) return;
    
    const mainPos = mainSphere.mesh.position;
    
    // Синхронизируем ammo-тень с основной сферой
    if (objects["ammo_shadow"] && objects["ammo_shadow"].body) {
        console.log("[Physics] Синхронизация ammo-тени с основной сферой");
        
        const ammoShadow = objects["ammo_shadow"];
        
        // Создаем трансформацию с позицией основной сферы
        const transform = new window.Ammo.btTransform();
        transform.setIdentity();
        transform.setOrigin(new window.Ammo.btVector3(mainPos.x, mainPos.y, mainPos.z));
        
        // Устанавливаем трансформацию
        ammoShadow.body.getMotionState().setWorldTransform(transform);
        
        // Также применяем такую же скорость
        if (mainSphere.body) {
            const mainVelocity = mainSphere.body.getLinearVelocity();
            const mainAngularVelocity = mainSphere.body.getAngularVelocity();
            
            ammoShadow.body.setLinearVelocity(mainVelocity);
            ammoShadow.body.setAngularVelocity(mainAngularVelocity);
        }
        
        // Активируем тело
        ammoShadow.body.activate(true);
        
        window.Ammo.destroy(transform);
    }
    
    // Синхронизируем bullet-тень с основной сферой (просто устанавливаем serverPos)
    if (objects["bullet_shadow"]) {
        console.log("[Physics] Синхронизация bullet-тени с основной сферой");
        
        const bulletShadow = objects["bullet_shadow"];
        bulletShadow.serverPos = {
            x: mainPos.x,
            y: mainPos.y,
            z: mainPos.z
        };
    }
}

export function receiveObjectUpdate(data) {
    const id = data.id;
    
    const obj = objects[id];
    if (!obj) {
        throttledLog("Error", `Получено обновление для несуществующего объекта: ${id}`);
        return;
    }
    
    // Проверяем, является ли объект новым
    if (!objectCreationTimes.has(id)) {
        objectCreationTimes.set(id, Date.now());
        console.log(`[Physics] Установлен таймер для нового объекта ${id}`);
    }
    
    // Получаем временную метку сервера
    const serverTime = data.server_time;
    if (!serverTime) {
        throttledLog("Warning", `Получено обновление без временной метки сервера для ${id}`);
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
            
            // Логируем информацию о скорости только для главного игрока
            if (id === "mainPlayer1") {
                throttledLog("Physics", 
                    `Вычислена скорость сервера для ${id}: ` +
                    `vx=${obj.serverVelocity.x.toFixed(2)}, ` +
                    `vy=${obj.serverVelocity.y.toFixed(2)}, ` +
                    `vz=${obj.serverVelocity.z.toFixed(2)}, ` +
                    `delta=${timeDelta.toFixed(3)}с`
                );
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
                    throttledLog("Physics", 
                        `Анализ расхождения для ${id}: расстояние=${distance.toFixed(2)}, ` +
                        `время с последнего импульса=${timeSinceLastImpulse}мс, ` +
                        `команда=${obj.lastImpulse.cmd}`
                    );
                }
                
                window.Ammo.destroy(transform);
            }
        }
    }
}

// Новая функция для создания диагностических сфер
export function createDiagnosticScene(scene) {
    console.log("[Physics] Создание диагностической сцены");

    // Создаем теневую сферу только с Ammo-физикой для сравнения с сервером
    createDiagnosticSphere(scene, "ammo_shadow", 0, 60, 0, 0x00ff00, "ammo");
    
    // Создаем теневую сферу с такими же начальными условиями как у серверной
    // но с другим менеджментом физики
    createDiagnosticSphere(scene, "bullet_shadow", 3, 60, 0, 0x0000ff, "bullet");
    
    console.log("[Physics] Диагностическая сцена создана");
}

// Вспомогательная функция для создания диагностической сферы
function createDiagnosticSphere(scene, id, x, y, z, color, physicsBy) {
    console.log(`[Physics] Создание диагностической сферы ${id}`);
    
    // Создаем сферу
    const radius = 1;
    const geometry = new THREE.SphereGeometry(radius, 32, 32);
    const material = new THREE.MeshPhongMaterial({ 
        color: color,
        shininess: 30,
        transparent: true,
        opacity: 0.8 // Делаем полупрозрачной для лучшей видимости
    });
    
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    
    // Включаем тени
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    
    scene.add(mesh);
    console.log(`[Physics] Диагностическая сфера ${id} добавлена на сцену`);
    
    // Создаем физическое тело
    let body = null;
    
    if (physicsBy === "ammo" && localPhysicsWorld) {
        // Создаем физическое тело для Ammo-физики
        const shape = new window.Ammo.btSphereShape(radius);
        const mass = 1;
        
        const transform = new window.Ammo.btTransform();
        transform.setIdentity();
        transform.setOrigin(new window.Ammo.btVector3(x, y, z));
        
        const localInertia = new window.Ammo.btVector3(0, 0, 0);
        shape.calculateLocalInertia(mass, localInertia);
        
        const motionState = new window.Ammo.btDefaultMotionState(transform);
        const rbInfo = new window.Ammo.btRigidBodyConstructionInfo(mass, motionState, shape, localInertia);
        body = new window.Ammo.btRigidBody(rbInfo);
        
        // Настраиваем физические свойства
        body.setActivationState(4); // DISABLE_DEACTIVATION
        body.setFriction(0.5);
        body.setRollingFriction(0.1);
        body.setRestitution(0.2); // Упругость (уменьшена для стабильности)
        body.setDamping(0.01, 0.01); // Небольшое затухание
        
        // Включаем CCD для предотвращения проваливания на меньшем масштабе
        body.setCcdMotionThreshold(radius * 0.8); 
        body.setCcdSweptSphereRadius(radius * 0.7);
        
        // Добавляем тело в физический мир
        localPhysicsWorld.addRigidBody(body);
        
        console.log(`[Physics] Физическое тело для диагностической сферы ${id} создано с CCD`);
        
        // Очистка памяти
        window.Ammo.destroy(rbInfo);
        window.Ammo.destroy(localInertia);
    }
    
    // Сохраняем объект
    const diagnosticObject = {
        id,
        mesh,
        body,
        object_type: "diagnostic_sphere",
        physicsBy: physicsBy,
        // Для сфер с bullet-физикой устанавливаем начальную серверную позицию
        serverPos: physicsBy === "bullet" ? { x, y, z } : null
    };
    
    // Добавляем в общий словарь объектов
    objects[id] = diagnosticObject;
    
    console.log(`[Physics] Диагностическая сфера ${id} создана с типом ${physicsBy}`);
    return diagnosticObject;
}