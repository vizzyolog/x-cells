// physics.js
import { objects } from './objects';
import gameStateManager from './gamestatemanager.js';
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
        DEAD_ZONE: 12.0, // УВЕЛИЧЕНО: с 5.0 до 12.0 для крупных сфер (радиус 20+ = диаметр 40+, 12/40 = 30%)
        
        // Базовая сила коррекции (множитель силы)
        // Влияет на: скорость притягивания к серверной позиции
        // Рекомендации: 3.0-15.0 (8.0 агрессивно, но эффективно для крупных объектов)
        // Меньше = мягче, плавнее; Больше = быстрее коррекция, может вызвать осцилляции
        CORRECTION_STRENGTH: 3.0, // УМЕНЬШЕНО: с 8.0 до 3.0 для более мягкой коррекции
        
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
        POSITION_ALPHA: 0.15, // УМЕНЬШЕНО: с 0.3 до 0.15 для более плавного движения
        
        // Альфа для экспоненциального сглаживания скорости (0.0-1.0)
        // Влияет на: скорость адаптации физической скорости
        // Рекомендации: 0.3-0.6 (0.4 хороший отклик для скорости 80м/с)
        // Меньше = инерционнее; Больше = отзывчивее
        VELOCITY_ALPHA: 0.25, // УМЕНЬШЕНО: с 0.4 до 0.25 для плавности
        
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
            console.warn("[Physics] Физический мир не инициализирован");
            return;
        }

        // Проверяем состояние соединения
        const useServerPhysics = checkConnectionState();

        // Шаг симуляции физики
        localPhysicsWorld.stepSimulation(deltaTime);
        
        // Обновляем положение объектов
        updatePhysicsObjects(useServerPhysics);
        
        // Принудительно обновляем приборы каждые 60 кадров (~1 секунда при 60 FPS)
        if (Date.now() % 1000 < 50) { // Примерно раз в секунду
            forceUpdateInstruments();
        }
    } catch (error) {
        console.error("[Physics] Ошибка в цикле физики:", error);
    }
}

// Функция для обновления отображения скорости игрока
function updatePlayerSpeedDisplay(speed, mass, radius) {
    const speedDisplay = document.getElementById('player-speed');
    const massDisplay = document.getElementById('player-mass');
    const radiusDisplay = document.getElementById('player-radius');
    const statusDisplay = document.getElementById('player-status');
    const objectsDisplay = document.getElementById('world-objects');
    
    if (!speedDisplay || !massDisplay) {
        console.error('[Physics] Элементы интерфейса не найдены');
        return;
    }

    // Форматируем значения до 2 знаков после запятой
    const formattedSpeed = speed.toFixed(2);
    const formattedMass = mass.toFixed(2);
    const formattedRadius = radius ? radius.toFixed(1) : '--';
    
    // Обновляем текст
    speedDisplay.textContent = `⚡ ${formattedSpeed} м/с`;
    massDisplay.textContent = `⚖️ ${formattedMass} кг`;
    
    // Обновляем радиус
    if (radiusDisplay) {
        radiusDisplay.textContent = `🟢 ${formattedRadius}м`;
        
        // Цветовая индикация радиуса
        if (radius < 5) {
            radiusDisplay.style.backgroundColor = 'rgba(0, 255, 0, 0.5)'; // Зеленый - маленький
        } else if (radius < 10) {
            radiusDisplay.style.backgroundColor = 'rgba(0, 128, 255, 0.5)'; // Синий - средний
        } else if (radius < 15) {
            radiusDisplay.style.backgroundColor = 'rgba(255, 165, 0, 0.5)'; // Оранжевый - большой
        } else {
            radiusDisplay.style.backgroundColor = 'rgba(255, 0, 255, 0.5)'; // Фиолетовый - огромный
        }
    }
    
    // Обновляем статус игрока
    if (statusDisplay) {
        const playerObjectID = gameStateManager.getPlayerObjectID();
        if (playerObjectID) {
            statusDisplay.textContent = `🎮 ID:${playerObjectID}`;
            statusDisplay.style.backgroundColor = 'rgba(0, 128, 0, 0.3)';
        } else {
            statusDisplay.textContent = '🎮 Поиск...';
            statusDisplay.style.backgroundColor = 'rgba(128, 0, 0, 0.3)';
        }
    }
    
    // Обновляем количество объектов
    if (objectsDisplay) {
        const objectCount = Object.keys(objects).length;
        objectsDisplay.textContent = `🌍 ${objectCount}`;
    }
    
    // Обновляем цвет скорости в зависимости от значения
    if (speed < 20) {
        speedDisplay.style.backgroundColor = 'rgba(0, 128, 0, 0.5)'; // Зеленый - низкая скорость
    } else if (speed < 50) {
        speedDisplay.style.backgroundColor = 'rgba(255, 165, 0, 0.5)'; // Оранжевый - средняя скорость
    } else {
        speedDisplay.style.backgroundColor = 'rgba(255, 0, 0, 0.5)'; // Красный - высокая скорость
    }
    
    // Обновляем цвет массы в зависимости от значения
    if (mass < 10) {
        massDisplay.style.backgroundColor = 'rgba(0, 255, 255, 0.5)'; // Голубой - легкая
    } else if (mass < 20) {
        massDisplay.style.backgroundColor = 'rgba(128, 128, 0, 0.5)'; // Желтый - средняя
    } else {
        massDisplay.style.backgroundColor = 'rgba(255, 0, 255, 0.5)'; // Фиолетовый - тяжелая
    }
}

// Обновляем функцию updatePhysicsObjects для отображения скорости
export function updatePhysicsObjects(useServerPhysics) {
    if (!localPhysicsWorld) return;

    let playerFound = false;
    let debugInfo = {};

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
        const playerObjectID = gameStateManager.getPlayerObjectID();
        
        // Отладочная информация
        if (!playerFound) {
            debugInfo = {
                playerObjectID: playerObjectID,
                currentId: id,
                hasBody: !!obj.body,
                objectType: obj.object_type,
                totalObjects: Object.keys(objects).length
            };
        }

        if (playerObjectID && id === playerObjectID && obj.body) {
            playerFound = true;
            const velocity = obj.body.getLinearVelocity();
            const speed = Math.sqrt(
                velocity.x() * velocity.x() +
                velocity.y() * velocity.y() +
                velocity.z() * velocity.z()
            );

            // Проверяем наличие массы и логируем ошибку если её нет
            if (obj.mass === undefined || obj.mass === null) {
                console.error(`[Physics] Масса объекта игрока ${id} не определена! obj.mass:`, obj.mass);
                window.Ammo.destroy(velocity);
                return;
            }

            // Обновляем отображение скорости
            updatePlayerSpeedDisplay(speed, obj.mass, obj.radius);

            // Обновляем индикатор физики
            updatePhysicsModeDisplay(useServerPhysics);

            window.Ammo.destroy(velocity);
        }
    }

    // Если игрока не найдено, но есть объекты - попробуем найти первый объект типа "sphere"
    if (!playerFound && Object.keys(objects).length > 0) {
        for (const id in objects) {
            const obj = objects[id];
            if (obj.object_type === "sphere" && obj.body) {
                const velocity = obj.body.getLinearVelocity();
                const speed = Math.sqrt(
                    velocity.x() * velocity.x() +
                    velocity.y() * velocity.y() +
                    velocity.z() * velocity.z()
                );

                // Проверяем наличие массы
                if (obj.mass === undefined || obj.mass === null) {
                    console.error(`[Physics] Масса резервной сферы ${id} не определена! obj.mass:`, obj.mass);
                    window.Ammo.destroy(velocity);
                    continue; // Попробуем следующую сферу
                }

                updatePlayerSpeedDisplay(speed, obj.mass, obj.radius);
                updatePhysicsModeDisplay(useServerPhysics);
                window.Ammo.destroy(velocity);
                foundPlayer = true;
                break;
            }
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
    
    // УСКОРЕННАЯ адаптация: измеряем джиттер каждые 200мс вместо 500мс
    if (currentTime - networkMonitor.lastPingMeasurement > 200) {
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
    
    // УСКОРЕННАЯ адаптация параметров: плавно переходим к новым параметрам
    let adaptationSpeed;
    if (networkMonitor.adaptationState.fastConvergenceMode) {
        adaptationSpeed = 0.8; // Очень быстрая адаптация в первые секунды
    } else if (networkMonitor.adaptationState.isAdapting) {
        adaptationSpeed = 0.6; // УСКОРЕНО: с 0.4 до 0.6 - быстрая адаптация
    } else {
        adaptationSpeed = 0.3; // УСКОРЕНО: с 0.1 до 0.3 - отзывчивый стабильный режим
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

    // АДАПТИВНАЯ мертвая зона на основе размера объекта
    const objectRadius = obj.radius || 3.0; // Используем радиус объекта или значение по умолчанию
    
    // УВЕЛИЧЕННАЯ Базовая мертвая зона: 200% радиуса (100% диаметра) для крупных объектов
    let adaptiveDeadZone = Math.max(
        PHYSICS_SETTINGS.INTERPOLATION.DEAD_ZONE * 0.1, // Минимум 1.2 единицы
        objectRadius * 2.0 // УВЕЛИЧЕНО: с 1.5 до 2.0 (100% от диаметра вместо 75%)
    );
    
    // КРИТИЧЕСКАЯ ДИАГНОСТИКА: Выводим базовые значения
    if (Math.random() < 0.1) { // 10% вероятность для отладки
        console.log(`[ДИАГНОСТИКА] Базовые значения: radius=${objectRadius.toFixed(1)}, baseDeadZone=${adaptiveDeadZone.toFixed(2)}, distance=${distance.toFixed(2)}`);
    }
    
    // СПЕЦИАЛЬНАЯ ОБРАБОТКА для свободного падения и вертикального движения
    const verticalDistance = Math.abs(currentPos.y - serverPos.y);
    const horizontalDistance = Math.sqrt(
        Math.pow(currentPos.x - serverPos.x, 2) + 
        Math.pow(currentPos.z - serverPos.z, 2)
    );
    
    // Если вертикальная составляющая большая (падение/прыжок), увеличиваем мертвую зону
    if (verticalDistance > objectRadius * 1.0) { // Если Y-расхождение больше радиуса
        const verticalBonus = verticalDistance * 0.5; // Добавляем 50% от вертикального расхождения
        adaptiveDeadZone += verticalBonus;
        
        if (Math.random() < 0.05) { // 5% вероятность для диагностики падения
            console.log(`[ДИАГНОСТИКА] Свободное падение: verticalDist=${verticalDistance.toFixed(2)}, bonus=+${verticalBonus.toFixed(2)}, newDeadZone=${adaptiveDeadZone.toFixed(2)}`);
        }
    }
    
    // УСИЛЕННЫЙ БОНУС при плохой сети: увеличиваем мертвую зону еще на 100%
    const jitter = getSmoothedJitter();
    if (jitter > PHYSICS_SETTINGS.NETWORK.JITTER_THRESHOLD) {
        const oldZone = adaptiveDeadZone;
        adaptiveDeadZone *= 2.0; // УВЕЛИЧЕНО: с 1.5 до 2.0 при джиттере >50мс
        
        if (Math.random() < 0.05) { // 5% вероятность для диагностики джиттера
            console.log(`[ДИАГНОСТИКА] Джиттер-бонус: jitter=${jitter.toFixed(1)}ms, oldZone=${oldZone.toFixed(2)} → newZone=${adaptiveDeadZone.toFixed(2)}`);
        }
    }
    
    // СКОРОСТНОЙ БОНУС: быстрые объекты могут иметь большие расхождения из-за экстраполяции
    const currentVel = obj.body.getLinearVelocity();
    const speed = Math.sqrt(currentVel.x() * currentVel.x() + currentVel.y() * currentVel.y() + currentVel.z() * currentVel.z());
    window.Ammo.destroy(currentVel);
    
    // При скорости >30м/с добавляем бонус: скорость/8 единиц к мертвой зоне (было /10)
    // Например: 40м/с → +5 единиц, 80м/с → +10 единиц
    if (speed > 30) {
        const speedBonus = (speed - 30) / 8; // УЛУЧШЕНО: порог с 50 до 30, делитель с 10 до 8
        adaptiveDeadZone += speedBonus;
    }

    // ОСОБАЯ ЛОГИКА для объектов с недавним изменением размера
    const timeSinceLastUpdate = obj.lastServerUpdate ? currentTime - obj.lastServerUpdate : 0;
    if (timeSinceLastUpdate < 1000) { // Если размер менялся в последнюю секунду
        adaptiveDeadZone *= 1.5; // Увеличиваем зону на 50% для стабилизации
    }

    // СПЕЦИАЛЬНАЯ ЛОГИКА ДЛЯ ВЗАИМОДЕЙСТВИЯ С ТЕРРЕЙНОМ
    // Если в мире есть объекты террейна и сфера движется быстро по Y - увеличиваем зону
    const hasTerrainNearby = Object.values(objects).some(o => o.object_type === "terrain");
    
    // ИСПРАВЛЯЕМ: Получаем вертикальную скорость из правильного источника  
    const verticalSpeed = Math.abs(obj.serverVelocity ? obj.serverVelocity.y : 0);
    
    if (hasTerrainNearby && (verticalSpeed > 10 || verticalDistance > objectRadius * 0.5)) {
        const terrainBonus = Math.max(objectRadius * 0.5, verticalSpeed * 0.3);
        adaptiveDeadZone += terrainBonus;
        
        if (Math.random() < 0.03) { // 3% вероятность для диагностики террейна
            console.log(`[ДИАГНОСТИКА] Террейн-бонус: verticalSpeed=${verticalSpeed.toFixed(1)}м/с, terrainBonus=+${terrainBonus.toFixed(2)}, finalDeadZone=${adaptiveDeadZone.toFixed(2)}`);
        }
    }

    // ФИНАЛЬНАЯ ДИАГНОСТИКА: выводим итоговую мертвую зону для крупных объектов
    if (objectRadius > 10) {
        console.log(`[ДИАГНОСТИКА] ИТОГО для radius=${objectRadius.toFixed(1)}: distance=${distance.toFixed(2)} vs deadZone=${adaptiveDeadZone.toFixed(2)} (было 18.10)`);
    }

    // Обновляем статистику стабильности
    updateStabilityStats(distance);

    // Применяем серверную скорость с сглаживанием
    const smoothVelocityFromBuffer = getSmoothVelocityFromBuffer(obj.id) || obj.serverVelocity;
    if (smoothVelocityFromBuffer) {
        // Экспоненциальное сглаживание скорости для уменьшения рывков
        const currentVel = obj.body.getLinearVelocity();
        const currentVelObj = {
            x: currentVel.x(),
            y: currentVel.y(),
            z: currentVel.z()
        };
        
        const smoothedVel = exponentialSmoothing(currentVelObj, smoothVelocityFromBuffer, adaptiveParams.velocityAlpha);
        
        const velocity = new window.Ammo.btVector3(smoothedVel.x, smoothedVel.y, smoothedVel.z);
        obj.body.setLinearVelocity(velocity);
        obj.body.activate(true);
        window.Ammo.destroy(velocity);
        window.Ammo.destroy(currentVel);
    }

    // КРИТИЧЕСКИЙ ФИКС: Понижаем пороги телепортации для больших расхождений
    // Получаем пороги телепортации
    const baseTeleportThreshold = Math.min(adaptiveParams.teleportThreshold, objectRadius * 5.0);
    const emergencyTeleportThreshold = objectRadius * 10.0; // Экстренная телепортация при 10 диаметрах
    
    // ПРИНУДИТЕЛЬНАЯ ДИАГНОСТИКА телепортации для критических случаев
    if (distance > 50) {
        console.log(`[КРИТИЧНО] Огромное расхождение: distance=${distance.toFixed(2)}, baseTeleport=${baseTeleportThreshold.toFixed(2)}, emergencyTeleport=${emergencyTeleportThreshold.toFixed(2)}, objectRadius=${objectRadius.toFixed(1)}`);
    }

    // Агрессивная телепортация при больших расхождениях или в режиме быстрой сходимости
    if (distance > baseTeleportThreshold || 
        distance > emergencyTeleportThreshold ||
        (networkMonitor.adaptationState.fastConvergenceMode && distance > PHYSICS_SETTINGS.ADAPTATION.RESET_THRESHOLD)) {
        
        // ВСЕГДА логируем телепортации при больших расхождениях
        console.log(`[ТЕЛЕПОРТАЦИЯ] Объект ${obj.id}: distance=${distance.toFixed(2)}, threshold=${baseTeleportThreshold.toFixed(2)}, emergency=${emergencyTeleportThreshold.toFixed(2)}`);
        
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
        
        // Обнуляем счетчики после телепортации
        obj.lastCorrectionTime = currentTime;
        return; // Выходим после телепортации
    }
    // Мертвая зона - минимальные корректировки
    else if (distance < adaptiveDeadZone) {
        // УСИЛЕННАЯ ДИАГНОСТИКА: Всегда логируем для крупных объектов
        if (objectRadius > 10 || Math.random() < 0.01) { // Всегда для радиуса >10 или 1% для остальных
            console.log(`[ДИАГНОСТИКА] Мертвая зона: distance=${distance.toFixed(2)}, adaptiveDeadZone=${adaptiveDeadZone.toFixed(2)} (radius=${objectRadius.toFixed(1)}, speed=${speed.toFixed(1)}м/с, vertical=${verticalDistance ? verticalDistance.toFixed(2) : '?'})`);
        }
        
        // МЯГКАЯ коррекция в мертвой зоне
        const timeSinceLastCorrection = currentTime - (obj.lastCorrectionTime || 0);
        const shouldCorrect = timeSinceLastCorrection > 500; // Редкая мягкая коррекция раз в 500мс
        
        if (shouldCorrect) {
            // Очень мягкая коррекция
            const smoothingFactor = 0.05;
            const smoothedPos = exponentialSmoothing(currentPos, serverPos, smoothingFactor);
            
            obj.mesh.position.set(smoothedPos.x, smoothedPos.y, smoothedPos.z);
            
            // Очень мягкая коррекция физического тела
            const newTransform = new window.Ammo.btTransform();
            obj.body.getMotionState().getWorldTransform(newTransform);
            newTransform.setOrigin(new window.Ammo.btVector3(smoothedPos.x, smoothedPos.y, smoothedPos.z));
            obj.body.getMotionState().setWorldTransform(newTransform);
            window.Ammo.destroy(newTransform);
            
            obj.lastCorrectionTime = currentTime;
        } else {
            // Просто показываем локальную позицию
            obj.mesh.position.set(currentPos.x, currentPos.y, currentPos.z);
        }
    }
    // Основная интерполяция с адаптивными алгоритмами
    else {
        // ДИАГНОСТИКА: Логируем попадание в зону агрессивной коррекции
        if (Math.random() < 0.01) { // 1% вероятность
            console.log(`[ДИАГНОСТИКА] Зона коррекции: distance=${distance.toFixed(2)}, adaptiveDeadZone=${adaptiveDeadZone.toFixed(2)}, teleportThreshold=${adaptiveParams.teleportThreshold.toFixed(2)}`);
        }
        
        // АДАПТИВНЫЙ интервал коррекции на основе скорости объекта
        // Используем уже вычисленную скорость из адаптивной мертвой зоны
        
        // Быстрые объекты корректируются чаще: 100мс при 100м/с, 300мс при 20м/с  
        let adaptiveCorrectionInterval = Math.max(100, Math.min(300, 400 - speed * 2));
        
        // АДАПТИВНОЕ увеличение интервала при стабильно больших расхождениях
        // Если расхождение больше 1.5 радиуса и близко к границе телепортации - делаем коррекцию реже
        if (distance > objectRadius * 1.5 && distance < adaptiveParams.teleportThreshold * 0.8) {
            adaptiveCorrectionInterval *= 1.5; // Увеличиваем интервал в 1.5 раза (450мс вместо 300мс)
        }
        
        // АГРЕССИВНАЯ КОРРЕКЦИЯ: Когда расхождение больше мертвой зоны
        // Проверяем, не было ли недавней коррекции
        const timeSinceLastCorrection = currentTime - (obj.lastCorrectionTime || 0);
        const shouldCorrect = timeSinceLastCorrection > adaptiveCorrectionInterval;
        
        if (shouldCorrect) {
            // ПЛАВНАЯ коррекция вместо агрессивной телепортации
            const timestamp = new Date().toLocaleTimeString() + '.' + String(Date.now() % 1000).padStart(3, '0');
            console.log(`[Physics] ${timestamp} Плавная коррекция объекта ${obj.id}: distance=${distance.toFixed(2)}, interval=${adaptiveCorrectionInterval}ms, speed=${speed.toFixed(1)}м/с, radius=${objectRadius.toFixed(1)}`);
            
            // Плавное движение к серверной позиции
            const smoothingFactor = 0.2; // Более плавное сглаживание для крупных объектов
            const smoothedPos = exponentialSmoothing(currentPos, serverPos, smoothingFactor);
            
            // Обновляем визуальную позицию
            obj.mesh.position.set(smoothedPos.x, smoothedPos.y, smoothedPos.z);
            
            // Мягкая коррекция физического тела
            const newTransform = new window.Ammo.btTransform();
            obj.body.getMotionState().getWorldTransform(newTransform);
            newTransform.setOrigin(new window.Ammo.btVector3(smoothedPos.x, smoothedPos.y, smoothedPos.z));
            obj.body.getMotionState().setWorldTransform(newTransform);
            window.Ammo.destroy(newTransform);
            
            // Применяем сглаженную скорость
            if (smoothVelocityFromBuffer) {
                const velocity = new window.Ammo.btVector3(smoothVelocityFromBuffer.x, smoothVelocityFromBuffer.y, smoothVelocityFromBuffer.z);
                obj.body.setLinearVelocity(velocity);
                window.Ammo.destroy(velocity);
            }
            
            obj.lastCorrectionTime = currentTime;
        } else {
            // ДИАГНОСТИКА: Логируем пропуск коррекции
            if (Math.random() < 0.01) { // 1% вероятность  
                console.log(`[ДИАГНОСТИКА] Пропуск коррекции: timeSinceLastCorrection=${timeSinceLastCorrection}ms < ${adaptiveCorrectionInterval}ms`);
            }
            // Пропускаем коррекцию, используем локальную физику
            obj.mesh.position.set(currentPos.x, currentPos.y, currentPos.z);
        }
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
            
            // Если коррекция критично важна (очень большое расхождение) - используем телепортацию
            // ДИНАМИЧЕСКИЙ порог телепортации: больше для крупных объектов
            const baseTeleportThreshold = PHYSICS_SETTINGS.INTERPOLATION.TELEPORT_THRESHOLD;
            const objectRadius = obj.radius || 3.0;
            const teleportThreshold = Math.max(
                baseTeleportThreshold, 
                objectRadius * 3.0 // УВЕЛИЧЕНО: телепорт при расстоянии больше 3 диаметров
            );
            
            if (distance > teleportThreshold) {
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

    // Обновляем размер объекта, если он изменился на сервере
    if (data.radius !== undefined && Math.abs(data.radius - obj.radius) > 0.1) {
        console.log(`[Physics] Обновляем размер объекта ${obj.id}: ${obj.radius} → ${data.radius}`);
        obj.radius = data.radius;
        obj.lastServerUpdate = currentTime; // ОТМЕЧАЕМ время обновления размера
        
        // Обновляем физическую форму если необходимо
        // (в данном случае сфера остается сферой, только с новым радиусом)
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
                // Проверяем, что масса определена, иначе выкидываем ошибку
                if (obj.mass === undefined || obj.mass === null) {
                    throw new Error(`[Physics] Масса объекта ${id} не определена! obj.mass: ${obj.mass}`);
                }
                
                const mass = obj.mass;

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
    
    // УСКОРЕННАЯ адаптация: уменьшаем буфер истории с 10 до 5 измерений
    if (networkMonitor.pingHistory.length > 5) {
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
    
    // УСКОРЕННАЯ адаптация: уменьшаем буфер с 5 до 3 измерений
    if (networkMonitor.jitterHistory.length > 3) {
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
    
    // ЗАЩИТА: Минимальное время между детекциями изменений (дебаунс)
    const timeSinceLastChange = currentTime - networkMonitor.adaptationState.lastStrategyChange;
    if (timeSinceLastChange < 300) { // Быстрее реагируем на изменения
        return false;
    }
    
    // Получаем предыдущие значения
    const prevPing = networkMonitor.pingHistory[networkMonitor.pingHistory.length - 2].value;
    const pingChange = Math.abs(ping - prevPing);
    
    // Детектируем резкие изменения (более чувствительно)
    const significantPingChange = pingChange > 30; // Уменьшаем порог с 50 до 30мс
    const highJitter = jitter > PHYSICS_SETTINGS.NETWORK.JITTER_THRESHOLD;
    const veryHighJitter = jitter > 25; // Дополнительный порог для джиттера
    
    // ДИАГНОСТИКА: Логируем условия для анализа дрожания
    if (significantPingChange || highJitter || veryHighJitter) {
        console.log(`[ДИАГНОСТИКА] Сетевое изменение: ping=${ping}→${prevPing} (Δ${pingChange.toFixed(1)}), jitter=${jitter.toFixed(1)}, причины: ${significantPingChange ? 'pingChange' : ''}${highJitter ? ' highJitter' : ''}${veryHighJitter ? ' veryHighJitter' : ''}`);
    }
    
    // Если обнаружено значительное изменение
    if (significantPingChange || highJitter || veryHighJitter) {
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
        
        // УСКОРЕННАЯ адаптация: завершаем адаптацию если система стабильна или прошло достаточно времени
        if ((networkMonitor.stabilityStats.isStable && timeSinceStart > 500) || 
            timeSinceChange > 1500) { // УСКОРЕНО: с 3000мс до 1500мс
            networkMonitor.adaptationState.isAdapting = false;
            networkMonitor.adaptationState.fastConvergenceMode = false;
        }
    }
    
    return false;
}

// Функция для сброса состояния объекта при резких изменениях
function resetObjectState(obj) {
    if (!obj || !obj.body) return;
    
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

// Функция для принудительного обновления приборов
function forceUpdateInstruments() {
    const playerObjectID = gameStateManager.getPlayerObjectID();
    let foundPlayer = false;
    
    // Пытаемся найти игрока
    if (playerObjectID && objects[playerObjectID] && objects[playerObjectID].body) {
        const obj = objects[playerObjectID];
        const velocity = obj.body.getLinearVelocity();
        const speed = Math.sqrt(
            velocity.x() * velocity.x() +
            velocity.y() * velocity.y() +
            velocity.z() * velocity.z()
        );
        
        // Проверяем наличие массы
        if (obj.mass === undefined || obj.mass === null) {
            console.error(`[Physics] Масса объекта игрока ${playerObjectID} не определена в forceUpdateInstruments! obj.mass:`, obj.mass);
            window.Ammo.destroy(velocity);
            // Не устанавливаем foundPlayer = true, чтобы попробовать найти другую сферу
        } else {
            updatePlayerSpeedDisplay(speed, obj.mass, obj.radius);
            window.Ammo.destroy(velocity);
            foundPlayer = true;
        }
    }
    
    // Если игрока не найдено, ищем любую сферу
    if (!foundPlayer) {
        for (const id in objects) {
            const obj = objects[id];
            if (obj.object_type === "sphere" && obj.body) {
                const velocity = obj.body.getLinearVelocity();
                const speed = Math.sqrt(
                    velocity.x() * velocity.x() +
                    velocity.y() * velocity.y() +
                    velocity.z() * velocity.z()
                );
                
                // Проверяем наличие массы
                if (obj.mass === undefined || obj.mass === null) {
                    console.error(`[Physics] Масса резервной сферы ${id} не определена в forceUpdateInstruments! obj.mass:`, obj.mass);
                    window.Ammo.destroy(velocity);
                    continue; // Попробуем следующую сферу
                }
                
                updatePlayerSpeedDisplay(speed, obj.mass, obj.radius);
                window.Ammo.destroy(velocity);
                foundPlayer = true;
                break;
            }
        }
    }
    
    // Если ничего не найдено, показываем базовую информацию
    if (!foundPlayer) {
        const statusDisplay = document.getElementById('player-status');
        const objectsDisplay = document.getElementById('world-objects');
        
        if (statusDisplay) {
            statusDisplay.textContent = '🎮 Статус: Нет объектов';
            statusDisplay.style.backgroundColor = 'rgba(128, 0, 0, 0.3)';
        }
        
        if (objectsDisplay) {
            const objectCount = Object.keys(objects).length;
            objectsDisplay.textContent = `🌍 ${objectCount}`;
        }
    }
}

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
- Уменьшить JITTER_THRESHOLD до 30-40мс (раньше детектировать проблемы)
- Улучшить алгоритм детекции изменений сети

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