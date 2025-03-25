// physics.js

import { objects } from './objects';
import * as THREE from 'three';

export let localPhysicsWorld = null;
let ammoPromise = null;

// Настройки для коррекции позиции
const DEAD_ZONE = 0.5; // Увеличиваем мертвую зону для уменьшения телепортаций
const CORRECTION_STRENGTH = 6.0; // Уменьшаем силу корректировки для более плавного движения
const TELEPORT_THRESHOLD = 2.0; // Увеличиваем порог телепортации

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
    
    // Визуализируем расхождения между двигателями физики
    visualizeDivergence(objects);
    
    // Выполняем шаг симуляции с заданными параметрами
    localPhysicsWorld.stepSimulation(effectiveStep, maxSubSteps, fixedStep);
    
    // Низкочастотный лог для отладки
    const now = Date.now();
    if (!window.lastPhysicsStepLog || now - window.lastPhysicsStepLog > 5000) {
        console.log(`[Physics] Шаг симуляции:`, {
            deltaTime: deltaTime.toFixed(5),
            effectiveStep: effectiveStep.toFixed(5),
            fixedStep: fixedStep,
            maxSubSteps,
            realSubSteps: Math.ceil(effectiveStep / fixedStep)
        });
        window.lastPhysicsStepLog = now;
    }
    
    // Обновляем физические объекты
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
                        console.log(`[Physics] Объект ${id}:`, {
                            расстояние: distance.toFixed(3),
                            скорость: Math.sqrt(speedSq).toFixed(3),
                            быстро: isMovingFast,
                            клиент: {x: currentX.toFixed(2), y: currentY.toFixed(2), z: currentZ.toFixed(2)},
                            сервер: {x: obj.serverPos.x.toFixed(2), y: obj.serverPos.y.toFixed(2), z: obj.serverPos.z.toFixed(2)}
                        });
                    }
                    
                    // Применяем гибридный подход
                    if (distance > DEAD_ZONE) {
                        if (distance > TELEPORT_THRESHOLD || (isMovingFast && distance > TELEPORT_THRESHOLD * 0.5)) {
                            // Телепортация для больших расхождений или при быстром движении
                            console.log(`[Physics] Телепортация объекта ${id}, расстояние: ${distance.toFixed(2)}`);
                            transform.setOrigin(new window.Ammo.btVector3(
                                obj.serverPos.x,
                                obj.serverPos.y,
                                obj.serverPos.z
                            ));
                            obj.body.getMotionState().setWorldTransform(transform);
                            
                            // Сбрасываем скорость только при существенных расхождениях
                            if (distance > TELEPORT_THRESHOLD * 1.5) {
                                const zero = new window.Ammo.btVector3(0, 0, 0);
                                obj.body.setLinearVelocity(zero);
                                obj.body.setAngularVelocity(zero);
                                window.Ammo.destroy(zero);
                            } else {
                                // Иначе уменьшаем скорость, но не обнуляем полностью
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
                        } else {
                            // Корректирующая сила для средних расхождений
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
                            
                            // Для очень медленной коррекции также немного двигаем меш напрямую
                            if (!isMovingFast && distance < TELEPORT_THRESHOLD * 0.3) {
                                obj.mesh.position.lerp(
                                    new THREE.Vector3(
                                        obj.serverPos.x, 
                                        correctY ? obj.serverPos.y : obj.mesh.position.y, 
                                        obj.serverPos.z
                                    ), 
                                    0.1
                                );
                            }
                        }
                    }
                    
                    window.Ammo.destroy(velocity);
                    window.Ammo.destroy(transform);
                }
                break;
                
            default:
                console.warn(`[Physics] Неизвестный тип physicsBy для объекта ${id}: ${obj.physicsBy}`);
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
            console.log("[Physics] Диагностика расхождений:", {
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
        console.log("[Physics] Расхождения между движками:");
        console.log(`  Основной шар (${mainSphere.physicsBy}): x=${mainPos.x.toFixed(2)}, y=${mainPos.y.toFixed(2)}, z=${mainPos.z.toFixed(2)}`);
        console.log(`  Тень Ammo: x=${ammoPos.x.toFixed(2)}, y=${ammoPos.y.toFixed(2)}, z=${ammoPos.z.toFixed(2)}`);
        console.log(`  Тень Bullet: x=${bulletPos.x.toFixed(2)}, y=${bulletPos.y.toFixed(2)}, z=${bulletPos.z.toFixed(2)}`);
        console.log(`  Расстояние Основной-Ammo: ${distMainToAmmo.toFixed(3)}`);
        console.log(`  Расстояние Основной-Bullet: ${distMainToBullet.toFixed(3)}`);
        console.log(`  Расстояние Ammo-Bullet: ${distAmmoBullet.toFixed(3)}`);
        
        // Визуальное отображение расхождений
        if (distMainToAmmo > DEAD_ZONE) {
            console.warn(`  [!] Основной шар расходится с Ammo на ${distMainToAmmo.toFixed(3)} (> ${DEAD_ZONE})`);
        }
        
        if (distMainToBullet > DEAD_ZONE) {
            console.warn(`  [!] Основной шар расходится с Bullet на ${distMainToBullet.toFixed(3)} (> ${DEAD_ZONE})`);
        }
        
        if (distAmmoBullet > DEAD_ZONE) {
            console.warn(`  [!] Ammo расходится с Bullet на ${distAmmoBullet.toFixed(3)} (> ${DEAD_ZONE})`);
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

export function applyImpulseToSphere(cmd, objects) {
    console.log("[Debug] Переданные объекты в applyImpulseToSphere:", objects);
    // Проверяем, что objects передан и является объектом
    if (!objects || typeof objects !== 'object') {
        console.warn("[Physics] Некорректные объекты переданы в applyImpulseToSphere");
        return;
    }

    // Базовые значения импульсов
    const baseImpulseHorizontal = 5.0;
    const baseImpulseVertical = 10.0;

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

            // Получаем текущую скорость
            const velocity = obj.body.getLinearVelocity();
            const speedSq = velocity.x() * velocity.x() + velocity.y() * velocity.y() + velocity.z() * velocity.z();
            const currentSpeed = Math.sqrt(speedSq);
            
            // Адаптивное значение импульса в зависимости от текущей скорости
            // Чем выше скорость, тем меньше дополнительный импульс
            const speedFactor = Math.max(0.5, 1.0 - currentSpeed / 20.0);
            
            // Проверка, находится ли объект на земле для прыжка
            const transform = new window.Ammo.btTransform();
            obj.body.getMotionState().getWorldTransform(transform);
            const pos = transform.getOrigin();
            const isGrounded = Math.abs(velocity.y()) < 0.2 && pos.y() < 5; // Примерное определение "на земле"
            
            // Создаем импульс с учетом адаптивности и состояния
            const impulse = new window.Ammo.btVector3(0, 0, 0);
            
            if (cmd === "LEFT") impulse.setValue(-baseImpulseHorizontal * speedFactor, 0, 0);
            if (cmd === "RIGHT") impulse.setValue(baseImpulseHorizontal * speedFactor, 0, 0);
            if (cmd === "UP") impulse.setValue(0, 0, -baseImpulseHorizontal * speedFactor);
            if (cmd === "DOWN") impulse.setValue(0, 0, baseImpulseHorizontal * speedFactor);
            
            // Для прыжка проверяем, находится ли объект на земле
            if (cmd === "SPACE" && isGrounded) {
                impulse.setValue(0, baseImpulseVertical, 0);
            } else if (cmd === "SPACE") {
                // Если в воздухе, даем меньший импульс для контроля
                impulse.setValue(0, baseImpulseVertical * 0.3, 0);
            }
            
            // Применяем импульс
            obj.body.applyCentralImpulse(impulse);
            
            // Добавляем диагностику для каждого шара
            console.log("[Physics] Применен импульс к шару:", {
                id: id,
                команда: cmd,
                скорость: currentSpeed.toFixed(2),
                множитель: speedFactor.toFixed(2),
                наЗемле: isGrounded,
                позиция: {
                    x: pos.x().toFixed(2),
                    y: pos.y().toFixed(2),
                    z: pos.z().toFixed(2)
                },
                импульс: {
                    x: impulse.x().toFixed(2),
                    y: impulse.y().toFixed(2),
                    z: impulse.z().toFixed(2)
                }
            });
            
            // Очистка памяти
            window.Ammo.destroy(impulse);
            window.Ammo.destroy(velocity);
            window.Ammo.destroy(transform);
        }
    }
    
    // Синхронизируем диагностические сферы если команда нажата (только при наличии команды)
    if (cmd && objects["mainPlayer1"] && objects["ammo_shadow"]) {
        syncDiagnosticSpheres(objects);
    }
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