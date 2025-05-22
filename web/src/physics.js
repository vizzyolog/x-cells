// physics.js
import { objects } from './objects';
import { startPhysicsSimulation, checkConnectionState, getCurrentPing } from './network';

// Обновляем константы для настройки физики
const PHYSICS_SETTINGS = {
    PREDICTION: {
        MAX_ERROR: 5.0,          // Уменьшаем допустимую ошибку
        SMOOTH_FACTOR: 0.3,      // Увеличиваем фактор сглаживания
        TELEPORT_THRESHOLD: 10.0  // Увеличиваем порог телепортации для стабильности
    },
    INTERPOLATION: {
        DEAD_ZONE: 0.05,          // Меньшая зона нечувствительности для малых корректировок
        CORRECTION_STRENGTH: 3.0, // Снижаем силу коррекции для уменьшения дрожания
        BLEND_FACTOR: 0.15,       // Уменьшаем фактор смешивания для более плавного движения
        BASE_BLEND_FACTOR: 0.15,   // Уменьшаем базовое значение для смешивания
        MIN_BLEND_FACTOR: 0.05     // Уменьшаем для более плавного движения при высоком пинге
    },
    NETWORK: {
        TIMEOUT: 150,           // Таймаут для переключения на локальную физику
        UPDATE_INTERVAL: 300,   // Интервал обновления серверный
        SERVER_TRUST_WINDOW: 500, // Окно доверия серверу
        MAX_PING: 300           // Максимальный пинг для адаптации параметров
    },
    BUFFER: {
        SIZE: 5,                // Увеличиваем размер буфера для лучшего сглаживания
        MIN_UPDATES: 2          // Требуем больше обновлений для применения сглаживания
    }
};

// Глобальные переменные
let localPhysicsWorld = null;
let lastServerUpdateTime = 0;

// Добавляем буфер для серверных обновлений
const serverUpdateBuffer = {
    positions: {},  // id -> массив последних позиций
    velocities: {}, // id -> массив последних скоростей
    timestamps: {}  // id -> массив временных меток
};

// Инициализация физического мира
function setupPhysicsWorld() {
    if (!window.Ammo) {
        console.error("[Physics] Ammo.js не инициализирован");
        return;
    }

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

    localPhysicsWorld.setGravity(new window.Ammo.btVector3(0, -9.81, 0));
    console.log("[Physics] Физический мир создан");
}

// Получение физического мира
export function getPhysicsWorld() {
    if (!localPhysicsWorld) {
        console.error("[Physics] Физический мир не инициализирован");
        return null;
    }
    return localPhysicsWorld;
}

// Инициализация Ammo.js
export async function initAmmo() {
    return new Promise((resolve, reject) => {
        if (window.Ammo) {
            console.log('[Physics] Ammo.js уже инициализирован');
            setupPhysicsWorld();
            resolve();
            return;
        }

        console.log('[Physics] Инициализация Ammo.js...');
        const ammoScript = document.createElement('script');
        ammoScript.src = '/ammo/ammo.wasm.js';
        ammoScript.async = true;
        
        ammoScript.onload = () => {
            console.log('[Physics] Скрипт Ammo.js загружен, инициализация...');
            
            window.Ammo().then((Ammo) => {
                window.Ammo = Ammo;
                console.log('[Physics] Ammo.js инициализирован успешно');
                setupPhysicsWorld();
                setTimeout(startPhysicsSimulation, 1000);
                resolve();
            }).catch(reject);
        };
        
        ammoScript.onerror = reject;
        document.body.appendChild(ammoScript);
    });
}

// Функция для обновления индикатора физики
function updatePhysicsModeDisplay(useServerPhysics) {
    const physicsModeDisplay = document.getElementById('physics-mode-display');
    if (!physicsModeDisplay) {
        return;
    }

    if (useServerPhysics) {
        physicsModeDisplay.textContent = 'Физика: Серверная';
        physicsModeDisplay.style.backgroundColor = 'rgba(0, 128, 0, 0.5)'; // Зеленый - серверная физика
    } else {
        physicsModeDisplay.textContent = 'Физика: Локальная';
        physicsModeDisplay.style.backgroundColor = 'rgba(255, 0, 0, 0.5)'; // Красный - локальная физика
    }
}

// Обновляем функцию stepPhysics для отображения режима физики
export function stepPhysics(deltaTime) {
    try {
        if (!localPhysicsWorld) {
            console.error("[Physics] Физический мир не инициализирован");
            return;
        }

        // Проверяем состояние соединения
        const useServerPhysics = checkConnectionState();
        
        // Обновляем индикатор режима физики
        updatePhysicsModeDisplay(useServerPhysics);

        // Симулируем физику с фиксированным шагом
        const fixedStep = 1/120; // 120 Hz
        const maxSubSteps = Math.ceil(Math.min(deltaTime, 1/60) / fixedStep);
        localPhysicsWorld.stepSimulation(deltaTime, maxSubSteps, fixedStep);
        
        // Обновляем положение объектов
        updatePhysicsObjects(useServerPhysics);
    } catch (error) {
        console.error("[Physics] Ошибка в цикле физики:", error);
    }
}

// Функция для обновления отображения скорости игрока
function updatePlayerSpeedDisplay(speed, maxSpeed, mass) {
    const speedDisplay = document.getElementById('player-speed');
    const maxSpeedDisplay = document.getElementById('player-max-speed');
    const massDisplay = document.getElementById('player-mass');
    
    if (!speedDisplay || !maxSpeedDisplay || !massDisplay) {
        console.error('[Physics] Элементы интерфейса не найдены');
        return;
    }

    // Форматируем значения до 2 знаков после запятой
    const formattedSpeed = speed.toFixed(2);
    const formattedMaxSpeed = maxSpeed.toFixed(2);
    const formattedMass = mass.toFixed(2);
    
    // Вычисляем процент от максимальной скорости
    const speedPercentage = Math.min((speed / maxSpeed) * 100, 100);
    
    // Обновляем текст
    speedDisplay.textContent = `Скорость: ${formattedSpeed} м/с`;
    maxSpeedDisplay.textContent = `Макс. скорость: ${formattedMaxSpeed} м/с`;
    massDisplay.textContent = `Масса: ${formattedMass} кг`;
    
    // Обновляем цвет в зависимости от скорости
    if (speedPercentage < 30) {
        speedDisplay.style.backgroundColor = 'rgba(0, 128, 0, 0.5)'; // Зеленый - низкая скорость
    } else if (speedPercentage < 70) {
        speedDisplay.style.backgroundColor = 'rgba(255, 165, 0, 0.5)'; // Оранжевый - средняя скорость
    } else {
        speedDisplay.style.backgroundColor = 'rgba(255, 0, 0, 0.5)'; // Красный - высокая скорость
    }
}

// Обновляем функцию updatePhysicsObjects для отображения скорости
export function updatePhysicsObjects(useServerPhysics) {
    if (!localPhysicsWorld) return;

    for (const id in objects) {
        const obj = objects[id];
        if (!obj.mesh) continue;

        switch (obj.physicsBy) {
            case "ammo":
                updateAmmoPhysics(obj);
                break;
            case "bullet":
                updateBulletPhysics(obj);
                break;
            case "both":
                updateHybridPhysics(obj);
                break;
        }

        // Обновляем отображение скорости для основного игрока
        if (id === 'mainPlayer1' && obj.body) {
            const velocity = obj.body.getLinearVelocity();
            const speed = Math.sqrt(
                velocity.x() * velocity.x() +
                velocity.y() * velocity.y() +
                velocity.z() * velocity.z()
            );

            // Получаем конфигурацию физики
            const physicsConfig = window.PHYSICS_CONFIG;
            if (!physicsConfig) {
                console.error('[Physics] Конфигурация физики не инициализирована');
                window.Ammo.destroy(velocity);
                return;
            }

            if (typeof physicsConfig.max_speed !== 'number') {
                console.error('[Physics] max_speed не определен в конфигурации физики');
                window.Ammo.destroy(velocity);
                return;
            }

            // Обновляем отображение скорости
            updatePlayerSpeedDisplay(speed, physicsConfig.max_speed, obj.mass);

            // Обновляем индикатор физики
            updatePhysicsModeDisplay(useServerPhysics);

            window.Ammo.destroy(velocity);
        }
    }
}

// Обновление объектов с чистой клиентской физикой
function updateAmmoPhysics(obj) {
    if (!obj.body || obj.object_type === "terrain") return;

    const trans = new window.Ammo.btTransform();
    obj.body.getMotionState().getWorldTransform(trans);

    obj.mesh.position.set(
        trans.getOrigin().x(),
        trans.getOrigin().y(),
        trans.getOrigin().z()
    );

    obj.mesh.quaternion.set(
        trans.getRotation().x(),
        trans.getRotation().y(),
        trans.getRotation().z(),
        trans.getRotation().w()
    );

    window.Ammo.destroy(trans);
}

// Обновление объектов с серверной физикой
function updateBulletPhysics(obj) {
    if (!obj.serverPos || obj.object_type === "terrain") return;

    obj.mesh.position.set(
        obj.serverPos.x,
        obj.serverPos.y,
        obj.serverPos.z
    );
}

// Функция для добавления обновления в буфер
function addUpdateToBuffer(id, position, velocity, timestamp) {
    // Инициализируем буферы для объекта, если их ещё нет
    if (!serverUpdateBuffer.positions[id]) {
        serverUpdateBuffer.positions[id] = [];
        serverUpdateBuffer.velocities[id] = [];
        serverUpdateBuffer.timestamps[id] = [];
    }

    // Добавляем новое обновление
    if (position) {
        serverUpdateBuffer.positions[id].push({...position, time: timestamp});
        // Ограничиваем размер буфера
        if (serverUpdateBuffer.positions[id].length > PHYSICS_SETTINGS.BUFFER.SIZE) {
            serverUpdateBuffer.positions[id].shift();
        }
    }

    if (velocity) {
        serverUpdateBuffer.velocities[id].push({...velocity, time: timestamp});
        // Ограничиваем размер буфера
        if (serverUpdateBuffer.velocities[id].length > PHYSICS_SETTINGS.BUFFER.SIZE) {
            serverUpdateBuffer.velocities[id].shift();
        }
    }

    serverUpdateBuffer.timestamps[id].push(timestamp);
    // Ограничиваем размер буфера
    if (serverUpdateBuffer.timestamps[id].length > PHYSICS_SETTINGS.BUFFER.SIZE) {
        serverUpdateBuffer.timestamps[id].shift();
    }
}

// Функция для получения сглаженной позиции из буфера
function getSmoothPositionFromBuffer(id) {
    const positions = serverUpdateBuffer.positions[id];
    if (!positions || positions.length < PHYSICS_SETTINGS.BUFFER.MIN_UPDATES) {
        return null;
    }

    // Если буфер содержит только одну позицию, вернем её
    if (positions.length === 1) {
        return positions[0];
    }

    // Вычисляем среднюю позицию с большим весом для более новых позиций
    // Используем квадратичную зависимость для весов, чтобы новые обновления имели ещё больший вес
    let totalWeight = 0;
    for (let i = 0; i < positions.length; i++) {
        totalWeight += Math.pow(i + 1, 2); // квадратичная зависимость
    }

    const smoothPosition = {x: 0, y: 0, z: 0};
    
    positions.forEach((pos, index) => {
        const weight = Math.pow(index + 1, 2) / totalWeight;
        smoothPosition.x += pos.x * weight;
        smoothPosition.y += pos.y * weight;
        smoothPosition.z += pos.z * weight;
    });

    return smoothPosition;
}

// Функция для получения сглаженной скорости из буфера
function getSmoothVelocityFromBuffer(id) {
    const velocities = serverUpdateBuffer.velocities[id];
    if (!velocities || velocities.length < PHYSICS_SETTINGS.BUFFER.MIN_UPDATES) {
        return null;
    }

    // Если буфер содержит только одну скорость, вернем её
    if (velocities.length === 1) {
        return velocities[0];
    }

    // Для скоростей используем менее агрессивное сглаживание
    // Новейшие значения имеют больший вес, но линейная зависимость
    const totalWeight = velocities.reduce((sum, _, index) => sum + (index + 1), 0);
    const smoothVelocity = {x: 0, y: 0, z: 0};
    
    velocities.forEach((vel, index) => {
        const weight = (index + 1) / totalWeight;
        smoothVelocity.x += vel.x * weight;
        smoothVelocity.y += vel.y * weight;
        smoothVelocity.z += vel.z * weight;
    });

    return smoothVelocity;
}

// Функция для адаптации параметров сглаживания в зависимости от пинга
function getAdaptiveInterpolationParams() {
    const ping = getCurrentPing();
    const params = {
        blendFactor: PHYSICS_SETTINGS.INTERPOLATION.BASE_BLEND_FACTOR,
        correctionStrength: PHYSICS_SETTINGS.INTERPOLATION.CORRECTION_STRENGTH,
        teleportThreshold: PHYSICS_SETTINGS.PREDICTION.TELEPORT_THRESHOLD
    };
    
    // Если пинг превышает максимальный, используем максимальные настройки
    if (ping > PHYSICS_SETTINGS.NETWORK.MAX_PING) {
        params.blendFactor = PHYSICS_SETTINGS.INTERPOLATION.MIN_BLEND_FACTOR;
        params.correctionStrength = params.correctionStrength * 0.5; // Уменьшаем коррекцию при высоком пинге
        params.teleportThreshold = params.teleportThreshold * 1.5; // Увеличиваем порог телепортации при высоком пинге
    } else if (ping > 50) { // Если пинг более 50мс, начинаем адаптировать
        // Нелинейная интерполяция параметров в зависимости от пинга для более плавного перехода
        const pingFactor = Math.pow((ping - 50) / (PHYSICS_SETTINGS.NETWORK.MAX_PING - 50), 0.75);
        params.blendFactor = PHYSICS_SETTINGS.INTERPOLATION.BASE_BLEND_FACTOR - 
            (PHYSICS_SETTINGS.INTERPOLATION.BASE_BLEND_FACTOR - PHYSICS_SETTINGS.INTERPOLATION.MIN_BLEND_FACTOR) * pingFactor;
        params.correctionStrength = params.correctionStrength * (1 - pingFactor * 0.5);
        params.teleportThreshold = params.teleportThreshold * (1 + pingFactor * 0.5);
    }
    
    return params;
}

// Обновление гибридных объектов
function updateHybridPhysics(obj) {
    if (!obj.body || obj.object_type === "terrain") return;

    // Проверяем состояние соединения - если используем серверную физику и есть серверные данные
    const useServerPhysics = checkConnectionState();
    const currentTime = Date.now();
    const timeSinceUpdate = obj.lastServerUpdate ? currentTime - obj.lastServerUpdate : Infinity;

    // Получаем текущую локальную позицию
    const trans = new window.Ammo.btTransform();
    obj.body.getMotionState().getWorldTransform(trans);

    const currentPos = {
        x: trans.getOrigin().x(),
        y: trans.getOrigin().y(),
        z: trans.getOrigin().z()
    };

    // Если нет соединения с сервером или данные сильно устарели, переключаемся на локальную физику
    if (!useServerPhysics || !obj.serverPos || timeSinceUpdate > PHYSICS_SETTINGS.NETWORK.TIMEOUT) {
        console.warn(`[Physics] Использую локальную физику для ${obj.id}, timeSinceUpdate=${timeSinceUpdate}ms`);
        
        // Обновляем меш из физики
        obj.mesh.position.set(currentPos.x, currentPos.y, currentPos.z);
        
        // Активируем тело, чтобы физика продолжала работать
        obj.body.activate(true);
        
        window.Ammo.destroy(trans);
        return;
    }

    // Если у нас есть серверные данные и мы используем серверную физику
    const serverPos = obj.serverPos;

    // Получаем сглаженную скорость из буфера
    const smoothVelocity = getSmoothVelocityFromBuffer(obj.id) || obj.serverVelocity;
    if (smoothVelocity) {
        // Всегда применяем серверную скорость
        const velocity = new window.Ammo.btVector3(
            smoothVelocity.x,
            smoothVelocity.y,
            smoothVelocity.z
        );
        obj.body.setLinearVelocity(velocity);
        obj.body.activate(true);
        window.Ammo.destroy(velocity);
    }

    // Рассчитываем расстояние между локальной и серверной позицией
    const distance = Math.sqrt(
        Math.pow(currentPos.x - serverPos.x, 2) +
        Math.pow(currentPos.y - serverPos.y, 2) +
        Math.pow(currentPos.z - serverPos.z, 2)
    );

    // Получаем адаптивные параметры в зависимости от пинга
    const adaptiveParams = getAdaptiveInterpolationParams();

    // Если расстояние слишком большое, немедленно телепортируем объект
    if (distance > adaptiveParams.teleportThreshold) {
        console.warn(`[Physics] Телепортация ${obj.id} из-за большого расхождения (${distance.toFixed(2)}): 
            Локальная (${currentPos.x.toFixed(2)}, ${currentPos.y.toFixed(2)}, ${currentPos.z.toFixed(2)}) → 
            Серверная (${serverPos.x.toFixed(2)}, ${serverPos.y.toFixed(2)}, ${serverPos.z.toFixed(2)})
            Пинг: ${getCurrentPing().toFixed(0)}мс`);
        
        // Телепортируем физическое тело
        const newTransform = new window.Ammo.btTransform();
        newTransform.setIdentity();
        newTransform.setOrigin(new window.Ammo.btVector3(
            serverPos.x,
            serverPos.y,
            serverPos.z
        ));
        obj.body.getMotionState().setWorldTransform(newTransform);
        
        // Телепортируем меш напрямую
        obj.mesh.position.set(serverPos.x, serverPos.y, serverPos.z);
        
        // Если только что вернулись из свернутого состояния, устанавливаем нулевую скорость
        if (timeSinceUpdate > PHYSICS_SETTINGS.NETWORK.UPDATE_INTERVAL * 2) {
            const zeroVelocity = new window.Ammo.btVector3(0, 0, 0);
            obj.body.setLinearVelocity(zeroVelocity);
            window.Ammo.destroy(zeroVelocity);
        }
        
        window.Ammo.destroy(newTransform);
    } 
    // Проверяем, находимся ли мы в "мертвой зоне" (очень малое расхождение)
    else if (distance < PHYSICS_SETTINGS.INTERPOLATION.DEAD_ZONE) {
        // Если расхождение минимальное, просто используем локальную позицию
        // Это предотвращает микро-дрожание
        obj.mesh.position.set(currentPos.x, currentPos.y, currentPos.z);
    }
    // Для промежуточных расхождений используем плавную коррекцию
    else {
        // Для плавности интерполируем между текущей и серверной позицией
        const lerpPos = {
            x: currentPos.x + (serverPos.x - currentPos.x) * adaptiveParams.blendFactor,
            y: currentPos.y + (serverPos.y - currentPos.y) * adaptiveParams.blendFactor,
            z: currentPos.z + (serverPos.z - currentPos.z) * adaptiveParams.blendFactor
        };
        
        // Устанавливаем интерполированную позицию для меша
        obj.mesh.position.set(lerpPos.x, lerpPos.y, lerpPos.z);
        
        // Применяем мягкую коррекцию физического тела - сильнее для больших расхождений, мягче для малых
        const correctionFactor = Math.min(1.0, distance / adaptiveParams.teleportThreshold);
        const adaptedCorrectionStrength = adaptiveParams.correctionStrength * correctionFactor;
        
        const correction = {
            x: (serverPos.x - currentPos.x) * adaptedCorrectionStrength,
            y: (serverPos.y - currentPos.y) * adaptedCorrectionStrength,
            z: (serverPos.z - currentPos.z) * adaptedCorrectionStrength
        };

        const force = new window.Ammo.btVector3(correction.x, correction.y, correction.z);
        obj.body.applyCentralForce(force);
        obj.body.activate(true);
        window.Ammo.destroy(force);
    }

    window.Ammo.destroy(trans);
}

// Обработка обновлений с сервера
export function receiveObjectUpdate(data) {
    try {
        if (!data.id) {
            console.error("[Physics] Получены данные без id:", data);
            return;
        }
            
        const obj = objects[data.id];
        if (!obj) {
            console.error(`[Physics] Объект ${data.id} не найден`);
            return;
        }

        // Пропускаем обработку серверных данных для объектов с physicsBy: "ammo"
        if (obj.physicsBy === "ammo") {
            console.log(`[Physics] Пропускаем серверное обновление для объекта ${data.id} (physicsBy: ammo)`);
            return;
        }

        // Проверяем, есть ли какие-либо данные для обновления
        // Поддерживаем как старый формат (data.x), так и новый (data.position)
        const hasPosition = data.position !== undefined || data.x !== undefined;
        const hasVelocity = data.velocity !== undefined || data.vx !== undefined;

        if (!hasPosition && !hasVelocity) {
            console.log(`[Physics] Пропускаем пустое обновление для объекта ${data.id}`);
            return;
        }

        console.log(`[Physics] Получено обновление для объекта ${data.id}:`, {
            position: data.position || (data.x !== undefined ? { x: data.x, y: data.y, z: data.z } : undefined),
            velocity: data.velocity || (data.vx !== undefined ? { x: data.vx, y: data.vy, z: data.vz } : undefined),
            physicsBy: obj.physicsBy
        });

        // Преобразуем данные в единый формат
        const objectData = {
            position: data.position || (data.x !== undefined ? {
                x: data.x,
                y: data.y,
                z: data.z
            } : undefined),
            velocity: data.velocity || (data.vx !== undefined ? { 
                x: data.vx, 
                y: data.vy, 
                z: data.vz 
            } : undefined)
        };
            
        updateObjectFromServer(obj, objectData);
    } catch (e) {
        console.error("[Physics] Ошибка при обработке обновления:", e);
    }
}

// Обновление объекта данными с сервера
function updateObjectFromServer(obj, data) {
    if (!data) {
        console.error("[Physics] Получены пустые данные для обновления");
        return;
    }

    if (!obj.id) {
        console.error("[Physics] Объект не имеет id");
        return;
    }

    const currentTime = Date.now();
    
    // Добавляем обновление в буфер, даже если не используем серверную физику
    // (это позволит иметь плавный переход, когда связь восстановится)
    if (data.position || data.velocity) {
        addUpdateToBuffer(obj.id, data.position, data.velocity, currentTime);
    }

    // Обновляем данные объекта
    if (data.position) {
        obj.serverPos = data.position;
        obj.lastServerUpdate = currentTime;
        
        console.log(`[Physics] Получено обновление позиции для ${obj.id}:`, {
            position: data.position,
            time: currentTime
        });
    }

    if (data.velocity && obj.body) {
        // Сохраняем серверную скорость
        obj.serverVelocity = data.velocity;
        
        // Применяем скорость только если у нас свежее обновление
        const timeSinceUpdate = obj.lastServerUpdate ? currentTime - obj.lastServerUpdate : Infinity;
        if (timeSinceUpdate <= PHYSICS_SETTINGS.NETWORK.SERVER_TRUST_WINDOW) {
            try {
                const velocity = new window.Ammo.btVector3(
                    data.velocity.x,
                    data.velocity.y,
                    data.velocity.z
                );
                obj.body.setLinearVelocity(velocity);
                obj.body.activate(true); // Активируем тело при получении новой скорости
                window.Ammo.destroy(velocity);
                
                console.log(`[Physics] Применена скорость к ${obj.id}:`, {
                    velocity: data.velocity,
                    time: currentTime
                });
            } catch (error) {
                console.error(`[Physics] Ошибка обновления скорости ${obj.id}:`, error);
            }
        }
    }
}

// Применение конфигурации физики
export function applyPhysicsConfig(config) {
    if (!config) {
        console.warn("[Physics] Получена пустая конфигурация");
        return;
    }

    for (const id in objects) {
        const obj = objects[id];
        if (!obj || !obj.body) continue;

        try {
            if (obj.physicsBy === "ammo" || obj.physicsBy === "both") {
                const mass = id.startsWith('mainPlayer') ? 
                    config.player_mass : 
                    (config.default_box_mass || 5.0);

                obj.mass = mass;

                const velocity = obj.body.getLinearVelocity();
                const shape = obj.body.getCollisionShape();
                const localInertia = new window.Ammo.btVector3(0, 0, 0);
                
                shape.calculateLocalInertia(mass, localInertia);
                obj.body.setMassProps(mass, localInertia);
                obj.body.setLinearVelocity(velocity);
                obj.body.activate(true);

                window.Ammo.destroy(localInertia);
                window.Ammo.destroy(velocity);
            }
        } catch (e) {
            console.error(`[Physics] Ошибка при применении конфигурации к ${id}:`, e);
        }
    }

    window.PHYSICS_CONFIG = config;
    console.log("[Physics] Конфигурация применена");
}

// Применение импульса к сфере
export function applyImpulseToSphere(id, direction) {
    try {
        const obj = objects[id];
        if (!obj || !obj.body) {
            throw new Error(`[Physics] Объект ${id} не найден или не имеет физического тела`);
        }

        if (!obj.mesh || !obj.mesh.geometry || obj.mesh.geometry.type !== "SphereGeometry") {
            throw new Error(`[Physics] Объект ${id} не является сферой`);
        }

        // Получаем текущую конфигурацию физики
        const physicsConfig = window.PHYSICS_CONFIG;
        if (!physicsConfig) {
            throw new Error("[Physics] Конфигурация физики не инициализирована");
        }

        if (typeof physicsConfig.base_impulse !== 'number') {
            throw new Error("[Physics] base_impulse не определен в конфигурации физики");
        }

        // Создаем вектор импульса с точно такой же силой, как на сервере
        const impulse = new window.Ammo.btVector3(
            direction.x,
            direction.y,
            direction.z
        );

        // Применяем импульс
        obj.body.applyCentralImpulse(impulse);
        
        // Активируем тело, чтобы оно не "заснуло"
        obj.body.activate(true);

        // Очищаем память
        window.Ammo.destroy(impulse);

        console.log(`[Physics] Применен импульс к ${id}:`, {
            direction: { x: direction.x, y: direction.y, z: direction.z },
            mass: obj.mass,
            config: {
                base_impulse: physicsConfig.base_impulse
            }
        });
    } catch (e) {
        console.error(`[Physics] Ошибка при применении импульса к ${id}:`, e);
        throw e; // Пробрасываем ошибку дальше
    }
} 