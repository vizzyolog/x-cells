// physics.js
import * as THREE from 'three';

export const objectsRef = {
    objects: {} // Будет обновлено из objects.js
};

// Экспортируем явно с начальным значением null
export let localPhysicsWorld = null;

// Добавляем глобальные настройки физики
export const physicsSettings = {
    interpolationAlpha: 0.1,  // Коэффициент интерполяции для серверных данных
};

// Флаг для отслеживания, была ли уже выполнена инициализация
let ammoInitialized = false;

// Функция для переключения режима физики
export function togglePhysicsMode() {
    physicsSettings.useServerPhysics = !physicsSettings.useServerPhysics;
    console.log(`[Physics] Переключение режима на: ${physicsSettings.useServerPhysics ? 'серверную' : 'локальную'} физику`);
}

// Функция для проверки доступности Ammo.js
function getAmmoLib() {
    const ammo = window.AmmoLib || window.Ammo;
    // if (ammo) {
    //     console.log("[Physics] Найдена библиотека Ammo.js:", ammo ? "присутствует" : "отсутствует");
    // }
    return ammo;
}

// Инициализация Ammo.js
export async function initAmmo() {
    console.log("[Physics] Начало инициализации физики...");
    
    // Если физика уже инициализирована, возвращаем существующий мир
    if (ammoInitialized && localPhysicsWorld) {
        console.log("[Physics] Физика уже инициализирована, повторная инициализация не требуется");
        return Promise.resolve();
    }
    
    // Проверяем готовность Ammo.js
    if (!window.XCells?.isAmmoReady) {
        console.log("[Physics] Ожидание инициализации Ammo.js...");
        
        // Проверяем, определен ли объект XCells
        if (!window.XCells) {
            console.warn("[Physics] window.XCells не определен, создаем его");
            window.XCells = {
                isAmmoReady: false,
                ammoCallbacks: []
            };
        }
        
        // Проверяем, определен ли метод регистрации колбэков
        if (!window.XCells.registerAmmoCallback) {
            console.warn("[Physics] window.XCells.registerAmmoCallback не определен, создаем его");
            window.XCells.registerAmmoCallback = function(callback) {
                if (!window.XCells.ammoCallbacks) {
                    window.XCells.ammoCallbacks = [];
                }
                window.XCells.ammoCallbacks.push(callback);
            };
        }
        
        // Ждем готовности Ammo.js
        await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error("Таймаут ожидания инициализации Ammo.js"));
            }, 5000);

            const checkAmmo = () => {
                const ammo = getAmmoLib();
                if (ammo) {
                    clearTimeout(timeout);
                    window.XCells.isAmmoReady = true;
                    resolve();
                    return true;
                }
                return false;
            };

            // Проверяем сразу
            if (checkAmmo()) return;

            // Если не нашли, регистрируем колбэк
            window.XCells.registerAmmoCallback(() => {
                if (checkAmmo()) {
                    console.log("[Physics] Ammo.js успешно инициализирован через колбэк");
                }
            });
        });
    }
    
    try {
        const AmmoLib = getAmmoLib();
        if (!AmmoLib) {
            throw new Error("Ammo.js не найден после ожидания инициализации");
        }
        
        console.log("[Physics] Ammo.js доступен, создаем физический мир");
        
        // Создаем физический мир
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
        
        const gravity = new AmmoLib.btVector3(0, -9.81, 0);
        localPhysicsWorld.setGravity(gravity);
        
        // Устанавливаем флаг, что инициализация выполнена
        ammoInitialized = true;
        
        console.log("[Physics] Физический мир успешно создан");
        return Promise.resolve();
    } catch (error) {
        console.error("[Physics] Ошибка при создании физического мира:", error);
        return Promise.reject(error);
    }
}

// Функция выполнения шага физической симуляции
export function stepPhysics(deltaTime) {
    // Пропускаем, если физика не инициализирована или используется серверная физика
    // if (!localPhysicsWorld || physicsSettings.useServerPhysics) {
    //     if (!localPhysicsWorld) {
    //         console.warn("[Physics] stepPhysics: localPhysicsWorld не инициализирован");
    //     }
    //     return;
    // }
    
    try {
        // Используем фиксированный шаг времени для стабильности
        const fixedTimeStep = 1/60;
        const maxSubSteps = 10;
        
        localPhysicsWorld.stepSimulation(deltaTime, maxSubSteps, fixedTimeStep);
    } catch (error) {
        console.error("[Physics] Ошибка при выполнении шага физики:", error);
    }
}

// Функция обновления объектов по физике
export function updatePhysicsObjects() {
    if (!localPhysicsWorld || !window.AmmoLib) {
        console.Error(`  !!!!! физика не инициализированна`)
        return; // Физика не инициализирована
    }

    // Используем objectsRef.objects вместо импортированного objects
    const objects = objectsRef.objects;

    // Выводим список объектов перед обновлением
    console.log("[Physics] Обновление объектов. Список всех объектов:", JSON.stringify(Object.keys(objects), null, 2));
    
    // Проверка на количество объектов
    const objectsCount = Object.keys(objects).length;
    console.log(`[Physics] Количество объектов для обновления: ${objectsCount}`);
    
    if (objectsCount === 0) {
        console.warn("[Physics] Список объектов пуст - нечего обновлять");
        return;
    }

    for (const id in objects) {
        try {
            const obj = objects[id];
            console.log(`[Physics] Обновление объекта ${id}, тип: ${obj.object_type}`);
            
            if (obj.body && obj.mesh) {
                const ms = obj.body.getMotionState();
                if (ms) {
                    const trans = new window.AmmoLib.btTransform();
                    ms.getWorldTransform(trans);

                    const pos = trans.getOrigin();
                    const rot = trans.getRotation();
                    
                    obj.mesh.position.set(pos.x(), pos.y(), pos.z());
                    obj.mesh.quaternion.set(rot.x(), rot.y(), rot.z(), rot.w());
                } else {
                    console.warn(`[Physics] Нет MotionState для объекта ${id}`);
                }
            } else {
                console.warn(`[Physics] У объекта ${id} отсутствует body или mesh:`, 
                            obj.body ? "body есть" : "body отсутствует", 
                            obj.mesh ? "mesh есть" : "mesh отсутствует");
            }

            // Корректируем по данным сервера если есть расхождение
            if (obj.serverPos) {
                const dx = obj.serverPos.x - obj.mesh.position.x;
                const dy = obj.serverPos.y - obj.mesh.position.y;
                const dz = obj.serverPos.z - obj.mesh.position.z;

                // Если расхождение существенное
                if (dx * dx + dy * dy + dz * dz > 0.1) {
                    const alpha = physicsSettings.interpolationAlpha;
                    
                    // Корректируем физическое тело если оно есть
                    if (obj.body) {
                        const newX = obj.mesh.position.x + dx * alpha;
                        const newY = obj.mesh.position.y + dy * alpha;
                        const newZ = obj.mesh.position.z + dz * alpha;
                        
                        const correction = new window.AmmoLib.btTransform();
                        correction.setIdentity();
                        correction.setOrigin(new window.AmmoLib.btVector3(newX, newY, newZ));
                        
                        if (obj.serverRot) {
                            correction.setRotation(new window.AmmoLib.btQuaternion(
                                obj.serverRot.x,
                                obj.serverRot.y,
                                obj.serverRot.z,
                                obj.serverRot.w
                            ));
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
        } catch (error) {
            console.error(`[Physics] Ошибка при обновлении объекта ${id}:`, error);
        }
    }
}

// Функция применения импульса к сфере
export function applyImpulseToSphere(cmd) {
    console.log("[Physics] Попытка применить импульс:", cmd);
    
    const AmmoLib = getAmmoLib();
    if (!AmmoLib) {
        console.warn("[Physics] AmmoLib не найден");
        return;
    }
    
    try {
        const IMPULSE_STRENGTH = 10; // Сила импульса
        
        // Используем objectsRef.objects вместо импортированного objects
        const objects = objectsRef.objects;
        
        // Получаем список всех объектов
        const objectIds = Object.keys(objects);
        console.log("[Physics] Доступные объекты:", objectIds);
        
        // Находим сферу mainPlayer (ранее server_sphere)
        let targetSphere = objects["mainPlayer"];
        
        if (!targetSphere) {
            console.warn("[Physics] Объект mainPlayer не найден. Импульс не может быть применен.");
            return;
        } else {
            console.log("[Physics] Найден объект mainPlayer:", targetSphere);
        }
        
        if (!targetSphere.body) {
            console.warn("[Physics] У объекта mainPlayer нет физического тела. Импульс не может быть применен.");
            return;
        }
        
        const impulse = new AmmoLib.btVector3(0, 0, 0);
        
        switch(cmd) {
            case "LEFT": impulse.setValue(-IMPULSE_STRENGTH, 0, 0); break;
            case "RIGHT": impulse.setValue(IMPULSE_STRENGTH, 0, 0); break;
            case "UP": impulse.setValue(0, 0, -IMPULSE_STRENGTH); break;
            case "DOWN": impulse.setValue(0, 0, IMPULSE_STRENGTH); break;
            case "SPACE": impulse.setValue(0, IMPULSE_STRENGTH * 2.0, 0); break;
            default: return;
        }
        
        console.log(`[Physics] Применение импульса к ${targetSphere.id}: ${cmd}`);
        
        targetSphere.body.activate(true);
        targetSphere.body.applyCentralImpulse(impulse);
        
        // Выводим текущую позицию после применения импульса
        const trans = new AmmoLib.btTransform();
        targetSphere.body.getMotionState().getWorldTransform(trans);
        const pos = trans.getOrigin();
        console.log(`[Physics] Позиция ${targetSphere.id} после импульса:`, 
            pos.x().toFixed(2), pos.y().toFixed(2), pos.z().toFixed(2));
            
    } catch (error) {
        console.error("[Physics] Ошибка при применении импульса:", error);
    }
}

// Создание физического объекта
export function createPhysicsObject(obj) {
    // Пропускаем, если физика не инициализирована или объект не поддерживает физику
    if (!localPhysicsWorld || !window.Ammo || obj.object_type === "tree") {
        return;
    }

    try {
        let shape;
        const transform = new window.Ammo.btTransform();
        transform.setIdentity();
        transform.setOrigin(new window.Ammo.btVector3(obj.x, obj.y, obj.z));

        // Создаем физическое тело по типу объекта
        switch (obj.object_type) {
            case "sphere":
                shape = new window.Ammo.btSphereShape(obj.radius);
                obj.mass = obj.mass || 1;
                
                // Устанавливаем margin для сферы
                shape.setMargin(0.05);
                
                // Создаем динамическое тело
                const localInertia = new window.Ammo.btVector3(0, 0, 0);
                shape.calculateLocalInertia(obj.mass, localInertia);
                
                const motionState = new window.Ammo.btDefaultMotionState(transform);
                const rbInfo = new window.Ammo.btRigidBodyConstructionInfo(
                    obj.mass, motionState, shape, localInertia);
                    
                obj.body = new window.Ammo.btRigidBody(rbInfo);
                    
                // Активируем тело
                obj.body.activate(true);
                obj.body.setCollisionFlags(0); // CF_DYNAMIC_OBJECT
                
                localPhysicsWorld.addRigidBody(obj.body);

                console.log(`Физическое тело для ${obj.id} успешно созданно`)
                break;
                
            case "terrain":
                // Используем данные высот, пришедшие с сервера
                if (!obj.height_data || obj.height_data.length === 0) {
                    return;
                }

                // Получаем параметры, предоставленные сервером
                const heightData = obj.height_data;
                const minHeight = obj.min_height !== undefined ? obj.min_height : Math.min(...heightData);
                const maxHeight = obj.max_height !== undefined ? obj.max_height : Math.max(...heightData);
                
                // Создаем форму террейна
                shape = new window.Ammo.btHeightfieldTerrainShape(
                    obj.heightmap_w,
                    obj.heightmap_h,
                    heightData,
                    1, // heightScale = 1, используем setLocalScaling
                    minHeight,
                    maxHeight,
                    1,    // upAxis = 1 для Y
                    false // flipQuadEdges = false
                );
                
                // Применяем масштабирование
                shape.setLocalScaling(new window.Ammo.btVector3(
                    obj.scale_x || 1,
                    obj.scale_y || 1,
                    obj.scale_z || 1
                ));
                
                // Устанавливаем margin
                shape.setMargin(0.05);
                
                // Смещаем террейн по Y для совпадения с визуальной моделью
                transform.setOrigin(new window.Ammo.btVector3(
                    obj.x,
                    obj.y + (maxHeight + minHeight) / 2,
                    obj.z
                ));
                
                // Создаем статическое тело с нулевой массой
                const terrainMotionState = new window.Ammo.btDefaultMotionState(transform);
                const terrainLocalInertia = new window.Ammo.btVector3(0, 0, 0);
                
                const terrainRbInfo = new window.Ammo.btRigidBodyConstructionInfo(
                    0, // масса = 0 для статики
                    terrainMotionState, 
                    shape, 
                    terrainLocalInertia
                );
                
                obj.body = new window.Ammo.btRigidBody(terrainRbInfo);
                
                // Устанавливаем статический тип и параметры трения
                obj.body.setCollisionFlags(1); // CF_STATIC_OBJECT
                obj.body.setFriction(0.5);     // Трение поверхности
                obj.body.setRestitution(0.2);  // Упругость отскока
                
                localPhysicsWorld.addRigidBody(obj.body);
                break;
                
            default:
                return;
        }
    } catch (error) {
        console.error("[Physics] Ошибка при создании физического объекта:", error);
    }
}

// // Обновляем список экспортов
// export { 
//     stepPhysics, 
//     updatePhysicsObjects, 
//     applyImpulseToSphere, 
//     physicsSettings, 
//     createPhysicsObject,
//     objects 
// };