// physics.js
import { THREE } from './three-exports';

// Экспортируем явно с начальным значением null
export let localPhysicsWorld = null;
export const objects = {};  // Хранилище для всех объектов

// Добавляем глобальные настройки физики
export const physicsSettings = {
    useServerPhysics: false,  // false = локальная физика, true = серверная физика
    interpolationAlpha: 0.1,  // Коэффициент интерполяции для серверных данных
    debugMode: false,         // Выключаем режим отладки
    sphereOffset: 2.0         // Расстояние между сферами для дебага
};

// Функция для переключения режима физики
export function togglePhysicsMode() {
    physicsSettings.useServerPhysics = !physicsSettings.useServerPhysics;
    console.log(`[Physics] Переключение режима на: ${physicsSettings.useServerPhysics ? 'серверную' : 'локальную'} физику`);
}

// Функция для проверки доступности Ammo.js
function getAmmoLib() {
    return window.AmmoLib || window.Ammo;
}

// Инициализация Ammo.js
export async function initAmmo() {
    console.log("[Physics] Инициализация физики...");
    
    // Проверяем готовность Ammo.js
    if (!window.XCells?.isAmmoReady) {
        console.log("[Physics] Ожидание инициализации Ammo.js...");
        
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
    if (!localPhysicsWorld || physicsSettings.useServerPhysics) {
        return;
    }
    
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
export function updatePhysicsObjects(objects) {
    const AmmoLib = getAmmoLib();
    // Пропускаем, если физика не инициализирована
    if (!localPhysicsWorld || !AmmoLib) {
        return;
    }
    
    try {
        for (let id in objects) {
            const obj = objects[id];
            if (!obj.mesh) continue;

            // Обновляем по физике если есть физическое тело
            if (obj.body) {
                const trans = new AmmoLib.btTransform();
                obj.body.getMotionState().getWorldTransform(trans);

                const pos = trans.getOrigin();
                const rot = trans.getRotation();
                
                obj.mesh.position.set(pos.x(), pos.y(), pos.z());
                obj.mesh.quaternion.set(rot.x(), rot.y(), rot.z(), rot.w());
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
                        
                        const correction = new AmmoLib.btTransform();
                        correction.setIdentity();
                        correction.setOrigin(new AmmoLib.btVector3(newX, newY, newZ));
                        
                        if (obj.serverRot) {
                            correction.setRotation(new AmmoLib.btQuaternion(
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
        }
    } catch (error) {
        console.error("[Physics] Ошибка при обновлении объектов:", error);
    }
}

// Функция применения импульса к сфере
export function applyImpulseToSphere(cmd, objects) {
    // Пропускаем, если физика не инициализирована
    if (!localPhysicsWorld || !window.Ammo) {
        return;
    }
    
    try {
        const IMPULSE_STRENGTH = 10; // Сила импульса
        
        // Находим первый сферический объект
        let targetSphere = Object.values(objects).find(obj => 
            obj && obj.mesh && obj.body && obj.object_type === "sphere");
        
        if (!targetSphere) return;

        const impulse = new window.Ammo.btVector3(0, 0, 0);
        
        switch(cmd) {
            case "LEFT": impulse.setValue(-IMPULSE_STRENGTH, 0, 0); break;
            case "RIGHT": impulse.setValue(IMPULSE_STRENGTH, 0, 0); break;
            case "UP": impulse.setValue(0, 0, -IMPULSE_STRENGTH); break;
            case "DOWN": impulse.setValue(0, 0, IMPULSE_STRENGTH); break;
            case "SPACE": impulse.setValue(0, IMPULSE_STRENGTH * 2.0, 0); break;
            default: return;
        }

        targetSphere.body.activate(true);
        targetSphere.body.applyCentralImpulse(impulse);
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
                
                // Улучшенные параметры для более реалистичной физики
                obj.body.setRestitution(0.4);   // упругость - меньше отскок
                obj.body.setFriction(0.6);      // трение - лучше сцепление с поверхностью
                
                // Активируем тело
                obj.body.activate(true);
                obj.body.setCollisionFlags(0); // CF_DYNAMIC_OBJECT
                
                localPhysicsWorld.addRigidBody(obj.body);
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

// Создание отладочных сфер для тестирования физики
// export function createDebugSpheres(scene) {
//     try {
//         if (!window.Ammo || !localPhysicsWorld) {
//             console.warn("[Physics] Невозможно создать отладочные сферы: физика не инициализирована");
//             return [];
//         }
        
//         const localSphere = {
//             id: "local_sphere",
//             object_type: "sphere",
//             x: 0, // Центрируем сферу над террейном
//             y: 20, // Начальная высота над террейном
//             z: 0,
//             mass: 1.0,
//             radius: 1.0,
//             color: 0x0000ff,
//             isLocalControlled: true
//         };
        
//         // Создаем меш для сферы
//         const geometry = new THREE.SphereGeometry(localSphere.radius, 32, 32);
//         const material = new THREE.MeshPhongMaterial({ 
//             color: localSphere.color,
//             shininess: 30,
//             specular: 0x444444
//         });
        
//         localSphere.mesh = new THREE.Mesh(geometry, material);
//         localSphere.mesh.position.set(localSphere.x, localSphere.y, localSphere.z);
//         localSphere.mesh.castShadow = true;
//         localSphere.mesh.receiveShadow = true;
        
//         scene.add(localSphere.mesh);
        
//         // Создаем физику для сферы
//         createPhysicsObject(localSphere);
//         objects[localSphere.id] = localSphere;
        
//         return [localSphere];
//     } catch (error) {
//         if (physicsSettings.debugMode) {
//             console.error("[Physics] Ошибка при создании отладочной сферы:", error);
//         }
//         return [];
//     }
// }

// Добавляем кнопку для отладки физики
export function initDebugUI() {
    // Кнопка переключения режима физики
    const debugButton = document.createElement('button');
    debugButton.style.position = 'fixed';
    debugButton.style.top = '10px';
    debugButton.style.right = '10px';
    debugButton.style.zIndex = '1000';
    debugButton.style.padding = '10px';
    debugButton.style.backgroundColor = '#4CAF50';
    debugButton.style.color = 'white';
    debugButton.style.border = 'none';
    debugButton.style.borderRadius = '5px';
    debugButton.style.cursor = 'pointer';
    debugButton.textContent = 'Toggle Physics Mode';
    debugButton.onclick = togglePhysicsMode;
    document.body.appendChild(debugButton);
    
    // Кнопка прыжка
    const jumpButton = document.createElement('button');
    jumpButton.style.position = 'fixed';
    jumpButton.style.top = '60px';
    jumpButton.style.right = '10px';
    jumpButton.style.zIndex = '1000';
    jumpButton.style.padding = '10px';
    jumpButton.style.backgroundColor = '#2196F3';
    jumpButton.style.color = 'white';
    jumpButton.style.border = 'none';
    jumpButton.style.borderRadius = '5px';
    jumpButton.style.cursor = 'pointer';
    jumpButton.textContent = 'Jump';
    jumpButton.onclick = () => applyImpulseToSphere('SPACE', objects);
    document.body.appendChild(jumpButton);
}