// physics.js
import { objects } from './objects';
import { startPhysicsSimulation, checkConnectionState, getCurrentPing } from './network';

// Обновляем константы для настройки физики
const PHYSICS_SETTINGS = {
    PREDICTION: {
        // Максимальная допустимая ошибка предсказания (в единицах мира)
        // Влияет на: точность предсказания траектории при отскоках
        // Рекомендации: 6.0-30.0 (для сферы радиусом 3.0: 12.0-24.0 = 2-4 диаметра оптимально)
        // Меньше = точнее, но больше телепортаций; Больше = плавнее, но менее точно
        MAX_ERROR: 18.0,
        
        // Фактор сглаживания для предсказания (0.0-1.0)
        // Влияет на: плавность перехода между предсказанной и серверной позицией
        // Рекомендации: 0.1-0.4 (0.2 оптимально для большинства случаев)
        // Меньше = резче коррекция; Больше = плавнее, но медленнее
        SMOOTH_FACTOR: 0.2,
        
        // Порог для телепортации (в единицах мира)
        // Влияет на: когда объект "прыгает" к серверной позиции вместо плавного движения
        // Рекомендации: 18.0-48.0 (для сферы радиусом 3.0: 24.0-36.0 = 4-6 диаметров)
        // Меньше = частые телепортации, быстрая синхронизация; Больше = плавнее, но медленнее
        TELEPORT_THRESHOLD: 30.0,
        
        // Время экстраполяции в миллисекундах
        // Влияет на: как далеко в будущее предсказываем позицию при плохой сети
        // Рекомендации: 50-200мс (100мс = 2 серверных обновления при 50мс интервале)
        // При скорости 80м/с за 100мс объект пролетает 8 единиц (1.3 диаметра)
        EXTRAPOLATION_TIME: 100
    },
    INTERPOLATION: {
        // Зона нечувствительности (в единицах мира)
        // Влияет на: минимальное расстояние для применения коррекции
        // Рекомендации: 0.3-1.2 (для сферы радиусом 3.0: 0.6 = 10% от диаметра, незаметно)
        // Меньше = более чувствительно к мелким отклонениям; Больше = игнорирует микро-дребезг
        DEAD_ZONE: 0.6,
        
        // Базовая сила коррекции (множитель силы)
        // Влияет на: скорость притягивания к серверной позиции
        // Рекомендации: 3.0-15.0 (8.0 агрессивно, но эффективно для крупных объектов)
        // Меньше = мягче, плавнее; Больше = быстрее коррекция, может вызвать осцилляции
        CORRECTION_STRENGTH: 8.0,
        
        // Базовый фактор смешивания позиций (0.0-1.0)
        // Влияет на: насколько быстро визуальная позиция следует к целевой
        // Рекомендации: 0.2-0.6 (0.4 хороший баланс для быстрых объектов)
        // Меньше = плавнее, медленнее; Больше = резче, быстрее
        BLEND_FACTOR: 0.4,
        BASE_BLEND_FACTOR: 0.4,
        
        // Минимальный фактор смешивания при плохой сети (0.0-1.0)
        // Влияет на: минимальная скорость коррекции при высоком пинге
        // Рекомендации: 0.1-0.3 (0.2 предотвращает "заморозку" быстрых объектов)
        // Меньше = очень плавно при плохой сети; Больше = быстрее, но может дергаться
        MIN_BLEND_FACTOR: 0.2,
        
        // Параметры Hermite интерполяции (-1.0 до 1.0)
        // Влияют на: форму кривой сглаживания при средней сети
        // Рекомендации: обычно 0.0 (нейтрально), экспериментировать ±0.5
        HERMITE_TENSION: 0.0,     // 0 = плавно, +1 = острее, -1 = более округло
        HERMITE_BIAS: 0.0         // 0 = симметрично, +1 = к концу, -1 = к началу
    },
    NETWORK: {
        // Таймаут для переключения на локальную физику (мс)
        // Влияет на: когда клиент перестает доверять серверу
        // Рекомендации: 100-300мс (150мс = 3 пропущенных обновления)
        // При скорости 80м/с за 150мс объект пролетает 12 единиц (2 диаметра)
        TIMEOUT: 150,
        
        // Интервал обновлений сервера (мс) - должен совпадать с сервером
        // Влияет на: расчет времени интерполяции
        // Рекомендации: синхронизировать с сервером (обычно 16-50мс)
        // При 50мс и скорости 80м/с объект перемещается на 4 единицы за обновление
        UPDATE_INTERVAL: 50,
        
        // Окно доверия серверу (мс)
        // Влияет на: как долго доверяем серверным данным после получения
        // Рекомендации: 300-1000мс (500мс = 10 обновлений)
        SERVER_TRUST_WINDOW: 500,
        
        // Максимальный пинг для нормальной работы (мс)
        // Влияет на: переключение алгоритмов интерполяции
        // Рекомендации: 200-500мс (300мс разумный предел для быстрых игр)
        MAX_PING: 300,
        
        // Порог джиттера для переключения алгоритмов (мс)
        // Влияет на: детекцию нестабильной сети
        // Рекомендации: 30-100мс (50мс = заметная нестабильность для быстрых объектов)
        JITTER_THRESHOLD: 50
    },
    BUFFER: {
        // Размер буфера серверных обновлений
        // Влияет на: качество сглаживания и потребление памяти
        // Рекомендации: 3-10 (5 хороший баланс для быстрых объектов)
        // Меньше = меньше памяти, хуже сглаживание; Больше = лучше сглаживание, больше памяти
        SIZE: 5,
        
        // Минимум обновлений для начала интерполяции
        // Влияет на: когда начинаем применять сглаживание
        // Рекомендации: 2-3 (2 минимум для вычисления скорости)
        MIN_UPDATES: 2,
        
        // Фактор сглаживания скорости (0.0-1.0)
        // Влияет на: плавность изменения скорости
        // Рекомендации: 0.2-0.5 (0.3 хороший баланс для скорости 80м/с)
        VELOCITY_SMOOTHING: 0.3
    },
    SMOOTHING: {
        // Альфа для экспоненциального сглаживания позиции (0.0-1.0)
        // Влияет на: скорость адаптации визуальной позиции
        // Рекомендации: 0.2-0.5 (0.3 быстро, но стабильно для крупных быстрых объектов)
        // Меньше = плавнее, медленнее; Больше = быстрее, может дергаться
        POSITION_ALPHA: 0.3,
        
        // Альфа для экспоненциального сглаживания скорости (0.0-1.0)
        // Влияет на: скорость адаптации физической скорости
        // Рекомендации: 0.3-0.6 (0.4 хороший отклик для скорости 80м/с)
        // Меньше = инерционнее; Больше = отзывчивее
        VELOCITY_ALPHA: 0.4,
        
        // Максимальное ускорение для фильтрации выбросов (единиц/с²)
        // Влияет на: фильтрацию нереалистичных ускорений
        // Рекомендации: 200-500 (300 для скорости 80м/с, учитывая отскоки крупных объектов)
        ACCELERATION_LIMIT: 300.0
    },
    ADAPTATION: {
        // Время агрессивной коррекции после изменения сети (мс)
        // Влияет на: как долго применяем максимально агрессивные параметры
        // Рекомендации: 200-1000мс (500мс быстро устраняет дребезг крупных объектов)
        // Меньше = короткий всплеск агрессии; Больше = долгая агрессивная коррекция
        FAST_CONVERGENCE_TIME: 500,
        
        // Агрессивный альфа для быстрой адаптации (0.0-1.0)
        // Влияет на: скорость коррекции в режиме быстрой сходимости
        // Рекомендации: 0.5-0.9 (0.7 очень быстро, но контролируемо для крупных объектов)
        // Меньше = умеренно быстро; Больше = максимально быстро, риск осцилляций
        AGGRESSIVE_ALPHA: 0.7,
        
        // Порог стабилизации - расстояние для определения стабильности (единицы мира)
        // Влияет на: когда считаем систему стабилизированной
        // Рекомендации: 1.2-6.0 (3.0 = половина диаметра сферы, хорошая точность)
        // Меньше = строже критерий стабильности; Больше = мягче критерий
        STABILIZATION_THRESHOLD: 3.0,
        
        // Порог для полного сброса состояния (единицы мира)
        // Влияет на: когда полностью сбрасываем буферы и телепортируем
        // Рекомендации: 48.0-120.0 (60.0 = 10 диаметров сферы, критическое расхождение)
        // Меньше = частые сбросы; Больше = редкие сбросы, может накапливаться ошибка
        RESET_THRESHOLD: 60.0
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

// Система адаптивного мониторинга сетевых условий
const networkMonitor = {
    pingHistory: [],
    jitterHistory: [],
    lastPingMeasurement: 0,
    adaptationState: {
        currentStrategy: 'linear',
        lastStrategyChange: 0,
        stabilizationTime: 3000, // 3 секунды для стабилизации
        isAdapting: false,
        fastConvergenceMode: false, // Режим быстрой сходимости
        adaptationStartTime: 0      // Время начала адаптации
    },
    // Буфер для сглаживания параметров
    smoothedParams: {
        positionAlpha: PHYSICS_SETTINGS.SMOOTHING.POSITION_ALPHA,
        velocityAlpha: PHYSICS_SETTINGS.SMOOTHING.VELOCITY_ALPHA,
        correctionStrength: PHYSICS_SETTINGS.INTERPOLATION.CORRECTION_STRENGTH,
        teleportThreshold: PHYSICS_SETTINGS.PREDICTION.TELEPORT_THRESHOLD
    },
    // Статистика для отслеживания стабильности
    stabilityStats: {
        lastPositionErrors: [],
        averageError: 0,
        isStable: false
    }
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

        // Для всех объектов с гибридной физикой, применяем кинематический контроль
        // при использовании серверной физики
        if (useServerPhysics) {
            for (const id in objects) {
                const obj = objects[id];
                if (!obj || !obj.body || obj.physicsBy !== "both") continue;
                
                // Если у объекта есть серверная позиция, устанавливаем для него серверную позицию
                if (obj.serverPos) {
                    // Продвигаем объект к серверной позиции с учетом прошедшего времени
                    // Чем больше времени прошло с последнего обновления, тем ближе к серверной позиции
                    const currentTime = Date.now();
                    const timeSinceUpdate = obj.lastServerUpdate ? currentTime - obj.lastServerUpdate : Infinity;
                    
                    // Если прошло слишком много времени, телепортируем объект
                    if (timeSinceUpdate > PHYSICS_SETTINGS.NETWORK.TIMEOUT) {
                        continue; // Пропускаем, будет обработано в updateHybridPhysics
                    }
                    
                    // Получаем текущую позицию
                    const trans = new window.Ammo.btTransform();
                    obj.body.getMotionState().getWorldTransform(trans);
                    
                    const currentPos = {
                        x: trans.getOrigin().x(),
                        y: trans.getOrigin().y(),
                        z: trans.getOrigin().z()
                    };
                    
                    // Обновляем позицию физического тела для более точного следования серверу
                    const updateInterval = PHYSICS_SETTINGS.NETWORK.UPDATE_INTERVAL;
                    const progress = Math.min(timeSinceUpdate / updateInterval, 1.0);
                    
                    const newPos = {
                        x: currentPos.x + (obj.serverPos.x - currentPos.x) * progress * 0.5,
                        y: currentPos.y + (obj.serverPos.y - currentPos.y) * progress * 0.5,
                        z: currentPos.z + (obj.serverPos.z - currentPos.z) * progress * 0.5
                    };
                    
                    // Применяем новую позицию
                    trans.setOrigin(new window.Ammo.btVector3(newPos.x, newPos.y, newPos.z));
                    obj.body.getMotionState().setWorldTransform(trans);
                    
                    window.Ammo.destroy(trans);
                }
            }
        }

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

    // Для авторитарного сервера всегда возвращаем последнюю позицию
    return positions[positions.length - 1];
}

// Функция для получения сглаженной скорости из буфера
function getSmoothVelocityFromBuffer(id) {
    const velocities = serverUpdateBuffer.velocities[id];
    if (!velocities || velocities.length < PHYSICS_SETTINGS.BUFFER.MIN_UPDATES) {
        return null;
    }

    // Для авторитарного сервера всегда возвращаем последнюю скорость
    return velocities[velocities.length - 1];
}

// Улучшенная система интерполяции с предсказанием и сглаживанием

// Hermite интерполяция для плавного движения
function hermiteInterpolate(p0, p1, v0, v1, t, tension = 0, bias = 0) {
    const t2 = t * t;
    const t3 = t2 * t;
    
    // Hermite базисные функции
    const h1 = 2 * t3 - 3 * t2 + 1;
    const h2 = -2 * t3 + 3 * t2;
    const h3 = t3 - 2 * t2 + t;
    const h4 = t3 - t2;
    
    // Применяем tension и bias к касательным векторам
    const m0 = (1 + bias) * (1 - tension) * 0.5;
    const m1 = (1 - bias) * (1 - tension) * 0.5;
    
    const tangent0 = {
        x: m0 * (p1.x - p0.x),
        y: m0 * (p1.y - p0.y),
        z: m0 * (p1.z - p0.z)
    };
    
    const tangent1 = {
        x: m1 * (p1.x - p0.x),
        y: m1 * (p1.y - p0.y),
        z: m1 * (p1.z - p0.z)
    };
    
    return {
        x: h1 * p0.x + h2 * p1.x + h3 * tangent0.x + h4 * tangent1.x,
        y: h1 * p0.y + h2 * p1.y + h3 * tangent0.y + h4 * tangent1.y,
        z: h1 * p0.z + h2 * p1.z + h3 * tangent0.z + h4 * tangent1.z
    };
}

// Экстраполяция позиции на основе скорости и ускорения
function extrapolatePosition(position, velocity, acceleration, deltaTime) {
    // Ограничиваем ускорение для предотвращения выбросов
    const accelMagnitude = Math.sqrt(
        acceleration.x * acceleration.x + 
        acceleration.y * acceleration.y + 
        acceleration.z * acceleration.z
    );
    
    let limitedAccel = acceleration;
    if (accelMagnitude > PHYSICS_SETTINGS.SMOOTHING.ACCELERATION_LIMIT) {
        const scale = PHYSICS_SETTINGS.SMOOTHING.ACCELERATION_LIMIT / accelMagnitude;
        limitedAccel = {
            x: acceleration.x * scale,
            y: acceleration.y * scale,
            z: acceleration.z * scale
        };
    }
    
    // Кинематическое уравнение: s = s0 + v*t + 0.5*a*t²
    const dt2 = deltaTime * deltaTime * 0.5;
    return {
        x: position.x + velocity.x * deltaTime + limitedAccel.x * dt2,
        y: position.y + velocity.y * deltaTime + limitedAccel.y * dt2,
        z: position.z + velocity.z * deltaTime + limitedAccel.z * dt2
    };
}

// Экспоненциальное сглаживание для уменьшения джиттера
function exponentialSmoothing(current, target, alpha) {
    return {
        x: current.x + alpha * (target.x - current.x),
        y: current.y + alpha * (target.y - current.y),
        z: current.z + alpha * (target.z - current.z)
    };
}

// Вычисление ускорения на основе изменения скорости
function calculateAcceleration(obj) {
    const velocities = serverUpdateBuffer.velocities[obj.id];
    if (!velocities || velocities.length < 2) {
        return { x: 0, y: 0, z: 0 };
    }
    
    const current = velocities[velocities.length - 1];
    const previous = velocities[velocities.length - 2];
    const deltaTime = (current.time - previous.time) / 1000.0; // в секундах
    
    if (deltaTime <= 0) {
        return { x: 0, y: 0, z: 0 };
    }
    
    return {
        x: (current.x - previous.x) / deltaTime,
        y: (current.y - previous.y) / deltaTime,
        z: (current.z - previous.z) / deltaTime
    };
}

// Адаптивный выбор алгоритма интерполяции на основе сетевых условий
function getInterpolationStrategy(ping, jitter) {
    // Используем реальный джиттер, если он не передан
    const actualJitter = jitter !== undefined ? jitter : getSmoothedJitter();
    
    // Определяем стратегию на основе сетевых условий
    let strategy;
    
    if (ping > PHYSICS_SETTINGS.NETWORK.MAX_PING || actualJitter > PHYSICS_SETTINGS.NETWORK.JITTER_THRESHOLD) {
        strategy = 'extrapolation'; // При плохой сети используем экстраполяцию
    } else if (ping > 100 || actualJitter > 25) {
        strategy = 'hermite'; // При среднем пинге используем Hermite
    } else {
        strategy = 'linear'; // При хорошей сети используем линейную интерполяцию
    }
    
    // Проверяем, изменилась ли стратегия
    if (strategy !== networkMonitor.adaptationState.currentStrategy) {
        console.log(`[NetworkMonitor] Смена стратегии: ${networkMonitor.adaptationState.currentStrategy} -> ${strategy} (ping=${ping}ms, jitter=${actualJitter.toFixed(1)}ms)`);
        networkMonitor.adaptationState.currentStrategy = strategy;
        networkMonitor.adaptationState.lastStrategyChange = Date.now();
        networkMonitor.adaptationState.isAdapting = true;
        
        // При смене стратегии сбрасываем состояние всех объектов для быстрой синхронизации
        for (const id in objects) {
            const obj = objects[id];
            if (obj && obj.physicsBy === "both") {
                resetObjectState(obj);
            }
        }
    }
    
    return strategy;
}

// Функция для адаптации параметров сглаживания в зависимости от пинга и джиттера
function getAdaptiveInterpolationParams() {
    const ping = getCurrentPing();
    const jitter = getSmoothedJitter();
    const currentTime = Date.now();
    
    // Измеряем джиттер каждые 500мс
    if (currentTime - networkMonitor.lastPingMeasurement > 500) {
        measureJitter();
        networkMonitor.lastPingMeasurement = currentTime;
    }
    
    // Детектируем изменения сети
    const networkChanged = detectNetworkChange();
    
    // Базовые параметры
    let targetParams = {
        blendFactor: PHYSICS_SETTINGS.INTERPOLATION.BASE_BLEND_FACTOR,
        correctionStrength: PHYSICS_SETTINGS.INTERPOLATION.CORRECTION_STRENGTH,
        teleportThreshold: PHYSICS_SETTINGS.PREDICTION.TELEPORT_THRESHOLD,
        positionAlpha: PHYSICS_SETTINGS.SMOOTHING.POSITION_ALPHA,
        velocityAlpha: PHYSICS_SETTINGS.SMOOTHING.VELOCITY_ALPHA
    };
    
    // В режиме быстрой сходимости используем агрессивные параметры
    if (networkMonitor.adaptationState.fastConvergenceMode) {
        targetParams.blendFactor = 0.8; // Очень высокий фактор смешивания
        targetParams.correctionStrength *= 2.0; // Удваиваем силу коррекции
        targetParams.teleportThreshold *= 0.5; // Уменьшаем порог телепортации
        targetParams.positionAlpha = PHYSICS_SETTINGS.ADAPTATION.AGGRESSIVE_ALPHA;
        targetParams.velocityAlpha = PHYSICS_SETTINGS.ADAPTATION.AGGRESSIVE_ALPHA;
        
        console.log(`[NetworkMonitor] Режим быстрой сходимости: агрессивные параметры активны`);
    }
    // Адаптируем параметры на основе пинга и джиттера
    else if (ping > PHYSICS_SETTINGS.NETWORK.MAX_PING || jitter > PHYSICS_SETTINGS.NETWORK.JITTER_THRESHOLD) {
        // Плохие сетевые условия - максимальное сглаживание
        targetParams.blendFactor = PHYSICS_SETTINGS.INTERPOLATION.MIN_BLEND_FACTOR;
        targetParams.correctionStrength *= 0.3;
        targetParams.teleportThreshold *= 2.5;
        targetParams.positionAlpha *= 0.4;
        targetParams.velocityAlpha *= 0.6;
    } else if (ping > 150 || jitter > 25) {
        // Средние условия - умеренное сглаживание
        const pingFactor = Math.min((ping - 50) / (PHYSICS_SETTINGS.NETWORK.MAX_PING - 50), 1.0);
        const jitterFactor = Math.min(jitter / PHYSICS_SETTINGS.NETWORK.JITTER_THRESHOLD, 1.0);
        const combinedFactor = Math.max(pingFactor, jitterFactor);
        
        targetParams.blendFactor = lerp(PHYSICS_SETTINGS.INTERPOLATION.BASE_BLEND_FACTOR, 
                                       PHYSICS_SETTINGS.INTERPOLATION.MIN_BLEND_FACTOR, combinedFactor);
        targetParams.correctionStrength *= (1 - combinedFactor * 0.7);
        targetParams.teleportThreshold *= (1 + combinedFactor * 1.5);
        targetParams.positionAlpha *= (1 - combinedFactor * 0.6);
        targetParams.velocityAlpha *= (1 - combinedFactor * 0.4);
    }
    
    // Если мы в процессе обычной адаптации (не быстрой), используем умеренно агрессивные параметры
    if (networkMonitor.adaptationState.isAdapting && !networkMonitor.adaptationState.fastConvergenceMode) {
        targetParams.correctionStrength *= 1.5; // Увеличиваем коррекцию
        targetParams.positionAlpha *= 1.3; // Ускоряем сглаживание
        targetParams.velocityAlpha *= 1.2;
        targetParams.teleportThreshold *= 0.8; // Более частые телепортации
    }
    
    // Плавно переходим к новым параметрам (экспоненциальное сглаживание параметров)
    let adaptationSpeed;
    if (networkMonitor.adaptationState.fastConvergenceMode) {
        adaptationSpeed = 0.8; // Очень быстрая адаптация в первые секунды
    } else if (networkMonitor.adaptationState.isAdapting) {
        adaptationSpeed = 0.4; // Быстрая адаптация
    } else {
        adaptationSpeed = 0.1; // Медленная адаптация в стабильном состоянии
    }
    
    networkMonitor.smoothedParams.positionAlpha = lerp(
        networkMonitor.smoothedParams.positionAlpha,
        targetParams.positionAlpha,
        adaptationSpeed
    );
    
    networkMonitor.smoothedParams.velocityAlpha = lerp(
        networkMonitor.smoothedParams.velocityAlpha,
        targetParams.velocityAlpha,
        adaptationSpeed
    );
    
    networkMonitor.smoothedParams.correctionStrength = lerp(
        networkMonitor.smoothedParams.correctionStrength,
        targetParams.correctionStrength,
        adaptationSpeed
    );
    
    networkMonitor.smoothedParams.teleportThreshold = lerp(
        networkMonitor.smoothedParams.teleportThreshold,
        targetParams.teleportThreshold,
        adaptationSpeed
    );
    
    // Возвращаем сглаженные параметры
    return {
        blendFactor: targetParams.blendFactor,
        correctionStrength: networkMonitor.smoothedParams.correctionStrength,
        teleportThreshold: networkMonitor.smoothedParams.teleportThreshold,
        positionAlpha: networkMonitor.smoothedParams.positionAlpha,
        velocityAlpha: networkMonitor.smoothedParams.velocityAlpha,
        // Дополнительные флаги для отладки
        isAdapting: networkMonitor.adaptationState.isAdapting,
        fastConvergenceMode: networkMonitor.adaptationState.fastConvergenceMode,
        ping: ping,
        jitter: jitter
    };
}

// Вспомогательная функция линейной интерполяции
function lerp(a, b, t) {
    return a + (b - a) * Math.max(0, Math.min(1, t));
}

// Полностью переработанная функция обновления гибридной физики
function updateHybridPhysics(obj) {
    if (!obj.body || obj.object_type === "terrain") return;

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

    // Если нет соединения или данные устарели, используем локальную физику
    if (!useServerPhysics || !obj.serverPos || timeSinceUpdate > PHYSICS_SETTINGS.NETWORK.TIMEOUT) {
        obj.mesh.position.set(currentPos.x, currentPos.y, currentPos.z);
        obj.body.activate(true);
        window.Ammo.destroy(trans);
        return;
    }

    const serverPos = obj.serverPos;
    const ping = getCurrentPing();
    const adaptiveParams = getAdaptiveInterpolationParams();
    
    // Вычисляем расстояние между позициями
    const distance = Math.sqrt(
        Math.pow(currentPos.x - serverPos.x, 2) +
        Math.pow(currentPos.y - serverPos.y, 2) +
        Math.pow(currentPos.z - serverPos.z, 2)
    );

    // Обновляем статистику стабильности
    updateStabilityStats(distance);

    // Применяем серверную скорость с сглаживанием
    const smoothVelocity = getSmoothVelocityFromBuffer(obj.id) || obj.serverVelocity;
    if (smoothVelocity) {
        // Экспоненциальное сглаживание скорости для уменьшения рывков
        const currentVel = obj.body.getLinearVelocity();
        const currentVelObj = {
            x: currentVel.x(),
            y: currentVel.y(),
            z: currentVel.z()
        };
        
        const smoothedVel = exponentialSmoothing(currentVelObj, smoothVelocity, adaptiveParams.velocityAlpha);
        
        const velocity = new window.Ammo.btVector3(smoothedVel.x, smoothedVel.y, smoothedVel.z);
        obj.body.setLinearVelocity(velocity);
        obj.body.activate(true);
        window.Ammo.destroy(velocity);
    }

    // Агрессивная телепортация при больших расхождениях или в режиме быстрой сходимости
    if (distance > adaptiveParams.teleportThreshold || 
        (networkMonitor.adaptationState.fastConvergenceMode && distance > PHYSICS_SETTINGS.ADAPTATION.RESET_THRESHOLD)) {
        
        console.log(`[Physics] Телепортация объекта ${obj.id}: distance=${distance.toFixed(2)}, threshold=${adaptiveParams.teleportThreshold.toFixed(2)}, fastMode=${networkMonitor.adaptationState.fastConvergenceMode}`);
        
        const newTransform = new window.Ammo.btTransform();
        newTransform.setIdentity();
        newTransform.setOrigin(new window.Ammo.btVector3(serverPos.x, serverPos.y, serverPos.z));
        obj.body.getMotionState().setWorldTransform(newTransform);
        obj.mesh.position.set(serverPos.x, serverPos.y, serverPos.z);
        
        // Сброс скорости при телепортации после долгого отсутствия обновлений
        if (timeSinceUpdate > PHYSICS_SETTINGS.NETWORK.UPDATE_INTERVAL * 2) {
            const zeroVelocity = new window.Ammo.btVector3(0, 0, 0);
            obj.body.setLinearVelocity(zeroVelocity);
            window.Ammo.destroy(zeroVelocity);
        }
        
        window.Ammo.destroy(newTransform);
    }
    // Мертвая зона - минимальные корректировки
    else if (distance < PHYSICS_SETTINGS.INTERPOLATION.DEAD_ZONE) {
        // В режиме быстрой сходимости применяем коррекцию даже в мертвой зоне
        const alphaMultiplier = networkMonitor.adaptationState.fastConvergenceMode ? 2.0 : 0.5;
        const smoothedPos = exponentialSmoothing(currentPos, serverPos, adaptiveParams.positionAlpha * alphaMultiplier);
        obj.mesh.position.set(smoothedPos.x, smoothedPos.y, smoothedPos.z);
        
        // Мягкая коррекция физического тела
        const correctionMultiplier = networkMonitor.adaptationState.fastConvergenceMode ? 1.5 : 0.3;
        const correction = {
            x: (serverPos.x - currentPos.x) * correctionMultiplier,
            y: (serverPos.y - currentPos.y) * correctionMultiplier,
            z: (serverPos.z - currentPos.z) * correctionMultiplier
        };

        const force = new window.Ammo.btVector3(correction.x, correction.y, correction.z);
        obj.body.applyCentralForce(force);
        window.Ammo.destroy(force);
    }
    // Основная интерполяция с адаптивными алгоритмами
    else {
        const updateInterval = PHYSICS_SETTINGS.NETWORK.UPDATE_INTERVAL;
        const progress = Math.min(timeSinceUpdate / updateInterval, 1.0);
        
        // Выбираем стратегию интерполяции на основе сетевых условий
        const strategy = getInterpolationStrategy(ping, getSmoothedJitter());
        let targetPos;

        switch (strategy) {
            case 'extrapolation':
                // Экстраполяция с предсказанием
                const acceleration = calculateAcceleration(obj);
                const extrapolationTime = Math.min(timeSinceUpdate, PHYSICS_SETTINGS.PREDICTION.EXTRAPOLATION_TIME) / 1000.0;
                targetPos = extrapolatePosition(serverPos, smoothVelocity || {x:0,y:0,z:0}, acceleration, extrapolationTime);
                break;
                
            case 'hermite':
                // Hermite интерполяция для плавного движения
                const positions = serverUpdateBuffer.positions[obj.id];
                if (positions && positions.length >= 2) {
                    const p0 = positions[positions.length - 2];
                    const p1 = positions[positions.length - 1];
                    const v0 = serverUpdateBuffer.velocities[obj.id]?.[positions.length - 2] || {x:0,y:0,z:0};
                    const v1 = smoothVelocity || {x:0,y:0,z:0};
                    
                    targetPos = hermiteInterpolate(p0, p1, v0, v1, progress, 
                        PHYSICS_SETTINGS.INTERPOLATION.HERMITE_TENSION,
                        PHYSICS_SETTINGS.INTERPOLATION.HERMITE_BIAS);
                } else {
                    // Fallback к линейной интерполяции
                    targetPos = {
                        x: currentPos.x + (serverPos.x - currentPos.x) * progress,
                        y: currentPos.y + (serverPos.y - currentPos.y) * progress,
                        z: currentPos.z + (serverPos.z - currentPos.z) * progress
                    };
                }
                break;
                
            default: // 'linear'
                // Стандартная линейная интерполяция
                targetPos = {
                    x: currentPos.x + (serverPos.x - currentPos.x) * progress,
                    y: currentPos.y + (serverPos.y - currentPos.y) * progress,
                    z: currentPos.z + (serverPos.z - currentPos.z) * progress
                };
                break;
        }

        // Применяем экспоненциальное сглаживание к целевой позиции
        const smoothedPos = exponentialSmoothing(currentPos, targetPos, adaptiveParams.positionAlpha);
        obj.mesh.position.set(smoothedPos.x, smoothedPos.y, smoothedPos.z);

        // Применяем адаптивную коррекцию к физическому телу
        let correctionMultiplier = adaptiveParams.correctionStrength;
        
        // В режиме быстрой сходимости увеличиваем силу коррекции
        if (networkMonitor.adaptationState.fastConvergenceMode) {
            correctionMultiplier *= 2.0;
            
            // Дополнительная прямая коррекция позиции физического тела
            const directCorrection = {
                x: (serverPos.x - currentPos.x) * 0.3,
                y: (serverPos.y - currentPos.y) * 0.3,
                z: (serverPos.z - currentPos.z) * 0.3
            };
            
            const newTransform = new window.Ammo.btTransform();
            obj.body.getMotionState().getWorldTransform(newTransform);
            const currentOrigin = newTransform.getOrigin();
            newTransform.setOrigin(new window.Ammo.btVector3(
                currentOrigin.x() + directCorrection.x,
                currentOrigin.y() + directCorrection.y,
                currentOrigin.z() + directCorrection.z
            ));
            obj.body.getMotionState().setWorldTransform(newTransform);
            window.Ammo.destroy(newTransform);
        }
        
        const correction = {
            x: (serverPos.x - currentPos.x) * correctionMultiplier,
            y: (serverPos.y - currentPos.y) * correctionMultiplier,
            z: (serverPos.z - currentPos.z) * correctionMultiplier
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
            return;
        }

        // Проверяем, есть ли какие-либо данные для обновления
        // Поддерживаем как старый формат (data.x), так и новый (data.position)
        const hasPosition = data.position !== undefined || data.x !== undefined;
        const hasVelocity = data.velocity !== undefined || data.vx !== undefined;

        if (!hasPosition && !hasVelocity) {
            return;
        }

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
    if (!data || !obj.id) {
        return;
    }

    const currentTime = Date.now();
    
    // Добавляем обновление в буфер для всех типов данных
    if (data.position || data.velocity) {
        addUpdateToBuffer(obj.id, data.position, data.velocity, currentTime);
    }

    // Обновляем серверную позицию
    if (data.position) {
        obj.serverPos = data.position;
        obj.lastServerUpdate = currentTime;
        
        // Для объектов с гибридной физикой применяем умную коррекцию
        if (obj.physicsBy === "both" && obj.body) {
            const trans = new window.Ammo.btTransform();
            obj.body.getMotionState().getWorldTransform(trans);
            
            const currentPos = {
                x: trans.getOrigin().x(),
                y: trans.getOrigin().y(),
                z: trans.getOrigin().z()
            };
            
            const distance = Math.sqrt(
                Math.pow(currentPos.x - data.position.x, 2) +
                Math.pow(currentPos.y - data.position.y, 2) +
                Math.pow(currentPos.z - data.position.z, 2)
            );
            
            // Получаем адаптивные параметры для коррекции
            const adaptiveParams = getAdaptiveInterpolationParams();
            
            // Применяем телепортацию только при критических расхождениях
            if (distance > adaptiveParams.teleportThreshold) {
                trans.setOrigin(new window.Ammo.btVector3(
                    data.position.x,
                    data.position.y,
                    data.position.z
                ));
                obj.body.getMotionState().setWorldTransform(trans);
                
                // Применяем экспоненциальное сглаживание даже при телепортации
                const smoothedPos = exponentialSmoothing(currentPos, data.position, 0.7);
                obj.mesh.position.set(smoothedPos.x, smoothedPos.y, smoothedPos.z);
            }
            // Для меньших расхождений используем мягкую коррекцию
            else if (distance > PHYSICS_SETTINGS.INTERPOLATION.DEAD_ZONE) {
                const smoothedPos = exponentialSmoothing(currentPos, data.position, adaptiveParams.positionAlpha);
                obj.mesh.position.set(smoothedPos.x, smoothedPos.y, smoothedPos.z);
            }
            
            window.Ammo.destroy(trans);
        }
        // Для объектов с серверной физикой используем прямое обновление с сглаживанием
        else if (obj.physicsBy === "bullet") {
            const currentMeshPos = {
                x: obj.mesh.position.x,
                y: obj.mesh.position.y,
                z: obj.mesh.position.z
            };
            
            // Применяем сглаживание даже для bullet объектов
            const smoothedPos = exponentialSmoothing(currentMeshPos, data.position, 
                PHYSICS_SETTINGS.SMOOTHING.POSITION_ALPHA);
            obj.mesh.position.set(smoothedPos.x, smoothedPos.y, smoothedPos.z);
        }
    }

    // Обновляем серверную скорость с сглаживанием
    if (data.velocity) {
        // Применяем экспоненциальное сглаживание к скорости
        if (obj.serverVelocity) {
            obj.serverVelocity = exponentialSmoothing(obj.serverVelocity, data.velocity, 
                PHYSICS_SETTINGS.SMOOTHING.VELOCITY_ALPHA);
        } else {
            obj.serverVelocity = data.velocity;
        }
        
        // Для гибридных объектов применяем сглаженную скорость к физическому телу
        if (obj.physicsBy === "both" && obj.body) {
            const currentVel = obj.body.getLinearVelocity();
            const currentVelObj = {
                x: currentVel.x(),
                y: currentVel.y(),
                z: currentVel.z()
            };
            
            const adaptiveParams = getAdaptiveInterpolationParams();
            const smoothedVel = exponentialSmoothing(currentVelObj, obj.serverVelocity, 
                adaptiveParams.velocityAlpha);
            
            const velocity = new window.Ammo.btVector3(smoothedVel.x, smoothedVel.y, smoothedVel.z);
            obj.body.setLinearVelocity(velocity);
            obj.body.activate(true);
            window.Ammo.destroy(velocity);
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

// Функция для измерения джиттера
function measureJitter() {
    const ping = getCurrentPing();
    const currentTime = Date.now();
    
    // Добавляем текущий пинг в историю
    networkMonitor.pingHistory.push({
        value: ping,
        timestamp: currentTime
    });
    
    // Ограничиваем размер истории (последние 10 измерений)
    if (networkMonitor.pingHistory.length > 10) {
        networkMonitor.pingHistory.shift();
    }
    
    // Вычисляем стандартное отклонение пинга (джиттер)
    const pings = networkMonitor.pingHistory.map(h => h.value);
    const avgPing = pings.reduce((sum, p) => sum + p, 0) / pings.length;
    const variance = pings.reduce((sum, p) => sum + Math.pow(p - avgPing, 2), 0) / pings.length;
    const jitter = Math.sqrt(variance);
    
    // Добавляем джиттер в историю
    networkMonitor.jitterHistory.push({
        value: jitter,
        timestamp: currentTime
    });
    
    if (networkMonitor.jitterHistory.length > 5) {
        networkMonitor.jitterHistory.shift();
    }
    
    return jitter;
}

// Функция для получения сглаженного джиттера
function getSmoothedJitter() {
    if (networkMonitor.jitterHistory.length === 0) {
        return 0;
    }
    
    const recentJitter = networkMonitor.jitterHistory.slice(-3); // Последние 3 измерения
    return recentJitter.reduce((sum, j) => sum + j.value, 0) / recentJitter.length;
}

// Функция для отслеживания стабильности позиции
function updateStabilityStats(positionError) {
    const stats = networkMonitor.stabilityStats;
    
    // Добавляем новую ошибку в историю
    stats.lastPositionErrors.push(positionError);
    
    // Ограничиваем размер истории
    if (stats.lastPositionErrors.length > 10) {
        stats.lastPositionErrors.shift();
    }
    
    // Вычисляем среднюю ошибку
    if (stats.lastPositionErrors.length > 0) {
        stats.averageError = stats.lastPositionErrors.reduce((sum, err) => sum + err, 0) / stats.lastPositionErrors.length;
        
        // Определяем стабильность
        stats.isStable = stats.averageError < PHYSICS_SETTINGS.ADAPTATION.STABILIZATION_THRESHOLD && 
                        stats.lastPositionErrors.length >= 5;
    }
}

// Функция для детекции резких изменений сетевых условий
function detectNetworkChange() {
    const ping = getCurrentPing();
    const jitter = getSmoothedJitter();
    const currentTime = Date.now();
    
    // Если это первое измерение
    if (networkMonitor.pingHistory.length < 2) {
        return false;
    }
    
    // Получаем предыдущие значения
    const prevPing = networkMonitor.pingHistory[networkMonitor.pingHistory.length - 2].value;
    const pingChange = Math.abs(ping - prevPing);
    
    // Детектируем резкие изменения (более чувствительно)
    const significantPingChange = pingChange > 30; // Уменьшаем порог с 50 до 30мс
    const highJitter = jitter > PHYSICS_SETTINGS.NETWORK.JITTER_THRESHOLD;
    const veryHighJitter = jitter > 25; // Дополнительный порог для джиттера
    
    // Если обнаружено значительное изменение
    if (significantPingChange || highJitter || veryHighJitter) {
        console.log(`[NetworkMonitor] Обнаружено изменение сети: ping change=${pingChange.toFixed(1)}ms, jitter=${jitter.toFixed(1)}ms`);
        
        // Помечаем, что мы в процессе адаптации
        networkMonitor.adaptationState.isAdapting = true;
        networkMonitor.adaptationState.fastConvergenceMode = true;
        networkMonitor.adaptationState.lastStrategyChange = currentTime;
        networkMonitor.adaptationState.adaptationStartTime = currentTime;
        
        // Сбрасываем статистику стабильности
        networkMonitor.stabilityStats.lastPositionErrors = [];
        networkMonitor.stabilityStats.averageError = 0;
        networkMonitor.stabilityStats.isStable = false;
        
        return true;
    }
    
    // Проверяем, завершилась ли адаптация
    if (networkMonitor.adaptationState.isAdapting) {
        const timeSinceChange = currentTime - networkMonitor.adaptationState.lastStrategyChange;
        const timeSinceStart = currentTime - networkMonitor.adaptationState.adaptationStartTime;
        
        // Выключаем режим быстрой сходимости через 2 секунды
        if (networkMonitor.adaptationState.fastConvergenceMode && 
            timeSinceStart > PHYSICS_SETTINGS.ADAPTATION.FAST_CONVERGENCE_TIME) {
            networkMonitor.adaptationState.fastConvergenceMode = false;
            console.log(`[NetworkMonitor] Режим быстрой сходимости завершен`);
        }
        
        // Завершаем адаптацию если система стабильна или прошло достаточно времени
        if ((networkMonitor.stabilityStats.isStable && timeSinceStart > 1000) || 
            timeSinceChange > networkMonitor.adaptationState.stabilizationTime) {
            networkMonitor.adaptationState.isAdapting = false;
            networkMonitor.adaptationState.fastConvergenceMode = false;
            console.log(`[NetworkMonitor] Адаптация завершена (стабильность: ${networkMonitor.stabilityStats.isStable})`);
        }
    }
    
    return false;
}

// Функция для сброса состояния объекта при резких изменениях
function resetObjectState(obj) {
    if (!obj || !obj.body) return;
    
    console.log(`[Physics] Сброс состояния объекта ${obj.id}`);
    
    // Очищаем буферы для этого объекта
    if (serverUpdateBuffer.positions[obj.id]) {
        serverUpdateBuffer.positions[obj.id] = [];
    }
    if (serverUpdateBuffer.velocities[obj.id]) {
        serverUpdateBuffer.velocities[obj.id] = [];
    }
    if (serverUpdateBuffer.timestamps[obj.id]) {
        serverUpdateBuffer.timestamps[obj.id] = [];
    }
    
    // Если есть серверная позиция, телепортируем к ней
    if (obj.serverPos) {
        const trans = new window.Ammo.btTransform();
        trans.setIdentity();
        trans.setOrigin(new window.Ammo.btVector3(
            obj.serverPos.x,
            obj.serverPos.y,
            obj.serverPos.z
        ));
        obj.body.getMotionState().setWorldTransform(trans);
        obj.mesh.position.set(obj.serverPos.x, obj.serverPos.y, obj.serverPos.z);
        window.Ammo.destroy(trans);
    }
    
    // Сбрасываем скорость
    const zeroVelocity = new window.Ammo.btVector3(0, 0, 0);
    obj.body.setLinearVelocity(zeroVelocity);
    obj.body.activate(true);
    window.Ammo.destroy(zeroVelocity);
}

// Экспортируем функции для использования в других модулях
window.getSmoothedJitter = getSmoothedJitter;
window.getInterpolationStrategy = getInterpolationStrategy;
window.networkMonitor = networkMonitor;

// РЕКОМЕНДАЦИИ ДЛЯ ЭКСПЕРИМЕНТОВ И НАСТРОЙКИ
// ==========================================

/* 
ЗАДАЧА 1: УБРАТЬ МИКРО-ДРЕБЕЗГ (для сферы радиусом 3.0, скорость 80м/с)
- Увеличить DEAD_ZONE до 0.9-1.2 (игнорировать мелкие колебания, 15-20% диаметра)
- Уменьшить POSITION_ALPHA до 0.2-0.25 (плавнее движение крупных объектов)
- Увеличить VELOCITY_SMOOTHING до 0.4-0.5 (сглаживание высокой скорости)
- Уменьшить CORRECTION_STRENGTH до 5.0-6.0 (мягче коррекция для крупных объектов)

ЗАДАЧА 2: СОКРАТИТЬ ВРЕМЯ АДАПТАЦИИ ПРИ ПЛОХОЙ СЕТИ
- Уменьшить FAST_CONVERGENCE_TIME до 300-400мс (быстрее переход)
- Увеличить AGGRESSIVE_ALPHA до 0.8-0.9 (агрессивнее коррекция)
- Уменьшить JITTER_THRESHOLD до 30-40мс (раньше детектировать проблемы)
- Уменьшить TELEPORT_THRESHOLD до 18.0-24.0 (чаще телепортировать, 3-4 диаметра)

ЗАДАЧА 3: ТОЧНОСТЬ ПРЕДСКАЗАНИЯ ОТСКОКОВ (скорость 80м/с)
- Уменьшить MAX_ERROR до 12.0-15.0 (точнее предсказание, 2-2.5 диаметра)
- Увеличить BUFFER.SIZE до 7-8 (больше данных для анализа быстрых объектов)
- Уменьшить EXTRAPOLATION_TIME до 75-80мс (консервативнее для высокой скорости)
- Увеличить ACCELERATION_LIMIT до 300-400 (учесть резкие отскоки при 80м/с)

ЗАДАЧА 4: ВИЗУАЛЬНАЯ ТОЧНОСТЬ ±3.0 ЕДИНИЦЫ (половина диаметра сферы)
- TELEPORT_THRESHOLD = 24.0-30.0 (4-5 диаметров = приемлемо)
- STABILIZATION_THRESHOLD = 1.8-2.4 (30-40% диаметра = хорошо)
- DEAD_ZONE = 0.3-0.6 (5-10% диаметра = незаметно)
- MAX_ERROR = 12.0-18.0 (2-3 диаметра = допустимо)

КРИТИЧЕСКИЕ КОМБИНАЦИИ (ИЗБЕГАТЬ):
- AGGRESSIVE_ALPHA > 0.9 + CORRECTION_STRENGTH > 10 = осцилляции крупных объектов
- DEAD_ZONE < 0.3 + высокий джиттер = постоянные микро-коррекции больших сфер
- FAST_CONVERGENCE_TIME < 200мс = слишком резкие переходы для скорости 80м/с
- TELEPORT_THRESHOLD < 12.0 = слишком частые телепортации (менее 2 диаметров)

ОПТИМАЛЬНЫЕ НАБОРЫ ДЛЯ РАЗНЫХ СЦЕНАРИЕВ:

НАБОР "ПЛАВНОСТЬ" (приоритет - отсутствие дребезга крупных быстрых объектов):
- DEAD_ZONE: 1.2, POSITION_ALPHA: 0.2, CORRECTION_STRENGTH: 5.0
- VELOCITY_SMOOTHING: 0.5, AGGRESSIVE_ALPHA: 0.6, ACCELERATION_LIMIT: 250

НАБОР "ОТЗЫВЧИВОСТЬ" (приоритет - быстрая реакция при скорости 80м/с):
- DEAD_ZONE: 0.3, POSITION_ALPHA: 0.4, CORRECTION_STRENGTH: 10.0
- FAST_CONVERGENCE_TIME: 300, AGGRESSIVE_ALPHA: 0.8, TELEPORT_THRESHOLD: 18.0

НАБОР "ТОЧНОСТЬ" (приоритет - предсказание отскоков при высокой скорости):
- MAX_ERROR: 12.0, BUFFER.SIZE: 8, EXTRAPOLATION_TIME: 75
- ACCELERATION_LIMIT: 350, TELEPORT_THRESHOLD: 24.0, STABILIZATION_THRESHOLD: 2.0

РЕКОМЕНДУЕМЫЕ ЗНАЧЕНИЯ ДЛЯ ТЕКУЩИХ ПАРАМЕТРОВ:
- MAX_ERROR: 18.0 (вместо 3.0) - 3 диаметра
- TELEPORT_THRESHOLD: 30.0 (вместо 5.0) - 5 диаметров  
- DEAD_ZONE: 0.6 (вместо 0.01) - 10% диаметра
- STABILIZATION_THRESHOLD: 3.0 (вместо 0.5) - половина диаметра
- RESET_THRESHOLD: 60.0 (вместо 10.0) - 10 диаметров
- ACCELERATION_LIMIT: 300.0 (вместо 50.0) - для скорости 80м/с
*/ 