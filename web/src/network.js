// network.js
import { objects, createMeshAndBodyForObject } from './objects';
import { 
    getPhysicsWorld,
    applyImpulseToSphere,
    applyPhysicsConfig,
    receiveObjectUpdate,
    stepPhysics,
    updatePhysicsObjects
} from './physics';
import gameStateManager from './gamestatemanager';
import { SimpleFoodClient } from './simple-food-client.js';

let ws = null;
let physicsStarted = false;
let pendingObjects = [];

// Добавляем переменные для работы с временными метками
let serverTimeOffset = 0;       // Разница между серверным и клиентским временем
let serverTimeOffsetSamples = []; // Хранение образцов для вычисления среднего значения
const MAX_OFFSET_SAMPLES = 10;  // Максимальное количество образцов
let pingHistory = [];           // История пингов для анализа
const MAX_PING_SAMPLES = 10;    // Максимальное количество образцов пинга

// Глобальная конфигурация физики
let physicsConfig = null;

// Добавляем переменную для текущего значения пинга
let currentPing = 0;

// Добавляем переменную для отслеживания времени последнего обновления
let lastUpdateTime = Date.now();
const UPDATE_TIMEOUT = 500; // Увеличиваем с 100 до 500мс - более разумный таймаут
const UPDATE_WARNING_TIMEOUT = 200; // Предупреждение при 200мс без обновлений

// Добавляем переменные для дебаунса
let lastKeyboardImpulseTime = 0;
const KEYBOARD_IMPULSE_INTERVAL = 50; // Синхронизируем с серверным интервалом

// Добавляем переменную для отслеживания состояния вкладки
let isTabActive = true;
let lastActiveTime = Date.now();

// === НОВОЕ: Система еды ===
let foodClient = null;

// === НОВОЕ: Система контроля соединения ===
let connectionStats = {
    lastBatchUpdate: Date.now(),
    lastPing: Date.now(),
    lastCommand: Date.now(),
    batchUpdateCount: 0,
    missedUpdatesThreshold: 3, // Пропускаем только после 3 подряд пропущенных обновлений
    avgUpdateInterval: 50, // Ожидаемый интервал обновлений от сервера
    lastWarningTime: 0 // Время последнего предупреждения (для предотвращения спама)
};

// Функция для получения текущей конфигурации физики
export function getPhysicsConfig() {
    return physicsConfig;
}

// Функция для получения текущего значения пинга
export function getCurrentPing() {
    return currentPing;
}

// Вычисляем текущее серверное время на основе смещения
function estimateServerTime() {
    return Date.now() + serverTimeOffset;
}

// Обновление смещения времени сервера
function updateServerTimeOffset(serverTime) {
    const now = Date.now();
    const currentOffset = serverTime - now;
    
    // Добавляем новый образец
    serverTimeOffsetSamples.push(currentOffset);
    
    // Ограничиваем количество образцов
    if (serverTimeOffsetSamples.length > MAX_OFFSET_SAMPLES) {
        serverTimeOffsetSamples.shift();
    }
    
    // Используем медиану вместо среднего для устойчивости к выбросам
    const sortedOffsets = [...serverTimeOffsetSamples].sort((a, b) => a - b);
    const medianOffset = sortedOffsets[Math.floor(sortedOffsets.length / 2)];
    
    serverTimeOffset = medianOffset;
    
    // Обновляем отображение времени
    updateTimeDisplay();
    
    //console.log(`[Time] Синхронизация времени: смещение = ${medianOffset} мс`);
}

// Добавляем функцию для обновления отображения пинга на экране
function updatePingDisplay(pingValue) {
    const pingElement = document.getElementById('ping-display');
    const jitterElement = document.getElementById('jitter-display');
    const strategyElement = document.getElementById('strategy-display');
    const adaptationElement = document.getElementById('adaptation-display');
    
    if (pingElement) {
        // Обновляем отображение пинга с цветовой индикацией
        if (pingValue < 50) {
            pingElement.style.color = '#4CAF50'; // Зеленый для хорошего пинга
        } else if (pingValue < 150) {
            pingElement.style.color = '#FF9800'; // Оранжевый для среднего пинга
        } else {
            pingElement.style.color = '#F44336'; // Красный для высокого пинга
            // Добавляем мигание для очень высокого пинга
            if (pingValue > 300) {
                pingElement.style.animation = 'blink 1s infinite';
            } else {
                pingElement.style.animation = 'none';
            }
        }
        pingElement.textContent = `Пинг: ${Math.round(pingValue)} мс`;
    }
    
    // Получаем информацию о джиттере и адаптации из физики
    if (typeof getSmoothedJitter === 'function') {
        const jitter = getSmoothedJitter();
        if (jitterElement) {
            if (jitter < 10) {
                jitterElement.style.color = '#4CAF50'; // Зеленый для низкого джиттера
            } else if (jitter < 30) {
                jitterElement.style.color = '#FF9800'; // Оранжевый для среднего джиттера
            } else {
                jitterElement.style.color = '#F44336'; // Красный для высокого джиттера
            }
            jitterElement.textContent = `Джиттер: ${jitter.toFixed(1)} мс`;
        }
    }
    
    // Получаем информацию о стратегии интерполяции
    if (typeof getInterpolationStrategy === 'function') {
        const strategy = getInterpolationStrategy(pingValue);
        if (strategyElement) {
            let strategyText = '';
            let strategyColor = '';
            
            switch (strategy) {
                case 'linear':
                    strategyText = 'Линейная';
                    strategyColor = '#4CAF50';
                    break;
                case 'hermite':
                    strategyText = 'Hermite';
                    strategyColor = '#FF9800';
                    break;
                case 'extrapolation':
                    strategyText = 'Экстраполяция';
                    strategyColor = '#F44336';
                    break;
                default:
                    strategyText = 'Неизвестно';
                    strategyColor = '#9E9E9E';
            }
            
            strategyElement.style.color = strategyColor;
            strategyElement.textContent = `Стратегия: ${strategyText}`;
        }
    }
    
    // Получаем информацию о состоянии адаптации
    if (typeof networkMonitor !== 'undefined' && adaptationElement) {
        const isAdapting = networkMonitor.adaptationState.isAdapting;
        if (isAdapting) {
            adaptationElement.style.color = '#FF9800';
            adaptationElement.textContent = 'Адаптация: ⚡ Активна';
            adaptationElement.style.animation = 'blink 0.5s infinite';
        } else {
            adaptationElement.style.color = '#4CAF50';
            adaptationElement.textContent = 'Адаптация: ✓ Стабильно';
            adaptationElement.style.animation = 'none';
        }
    }
}

// Функция для обновления серверного времени на экране
function updateTimeDisplay() {
    const serverTimeElem = document.getElementById('server-time');
    const timeOffsetElem = document.getElementById('time-offset');
    
    if (serverTimeElem && timeOffsetElem) {
        const estServerTime = estimateServerTime();
        const serverDate = new Date(estServerTime);
        serverTimeElem.textContent = `Время сервера: ${serverDate.toLocaleTimeString()}`;
        timeOffsetElem.textContent = `Смещение: ${serverTimeOffset.toFixed(0)} мс`;
    }
}

// Создаем интервал для периодического обновления времени
let timeDisplayInterval;
let serverDelay = 0;

function updateServerDelayDisplay(delay) {
    const delayDisplay = document.getElementById('server-delay-display');
    if (delayDisplay) {
        delayDisplay.textContent = `Задержка сервера: ${delay.toFixed(0)} мс`;
    }
}

// Функция для проверки состояния соединения
export function checkConnectionState() {
    const currentTime = Date.now();
    
    // Проверяем состояние WebSocket соединения
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        return false;
    }
    
    // Используем время последнего batch_update как основной индикатор
    const timeSinceLastBatch = currentTime - connectionStats.lastBatchUpdate;
    const timeSinceLastPing = currentTime - connectionStats.lastPing;
    
    // Считаем серверную активность по любому типу обновлений
    const timeSinceAnyActivity = Math.min(timeSinceLastBatch, timeSinceLastPing);
    
    // Предупреждение только при долгом отсутствии ЛЮБЫХ обновлений
    if (timeSinceAnyActivity > UPDATE_WARNING_TIMEOUT && timeSinceAnyActivity <= UPDATE_TIMEOUT) {
        // Логируем предупреждение только раз в 2 секунды, чтобы не спамить
        if (currentTime - connectionStats.lastWarningTime > 2000) {
            console.warn(`[WS] Долго нет активности сервера: ${timeSinceAnyActivity}мс (batch: ${timeSinceLastBatch}мс, ping: ${timeSinceLastPing}мс)`);
            connectionStats.lastWarningTime = currentTime;
        }
    }
    
    // Переключаемся на локальную физику только при критической задержке batch_update
    // И только если нет недавней активности от пинга тоже
    if (timeSinceLastBatch > UPDATE_TIMEOUT && timeSinceLastPing > UPDATE_TIMEOUT / 2) {
        // Логируем только если это не связано с неактивной вкладкой
        if (isTabActive && currentTime - connectionStats.lastWarningTime > 2000) {
            console.log(`[WS] Критическая задержка всех обновлений, переключаемся на локальную физику (batch: ${timeSinceLastBatch}мс, ping: ${timeSinceLastPing}мс)`);
            connectionStats.lastWarningTime = currentTime;
        }
        return false;
    }
    
    return true;
}

// Обработка сообщений с сервера
function handleMessage(data) {      
    try {
        // Если сообщение содержит временную метку сервера, обновляем смещение
        if (data.server_time) {
            updateServerTimeOffset(data.server_time);
        }

        // Обрабатываем конфигурацию физики
        if (data.type === "physics_config") {
            physicsConfig = data.config;
            applyPhysicsConfig(physicsConfig);
            return;
        }

        // === НОВОЕ: Обработка событий еды ===
        if (data.type === "food_spawned" && foodClient) {
            foodClient.handleFoodSpawned(data.food_item);
            return;
        }

        if (data.type === "food_consumed" && foodClient) {
            foodClient.handleFoodConsumed(data.player_id, data.food_id, data.mass_gain);
            
            // === ПРОСТОЕ: Только обновляем JS объект, физику обновит player_size_update ===
            const currentPlayerID = gameStateManager.getPlayerID();
            if (currentPlayerID === data.player_id) {
                const obj = objects[data.player_id];
                if (obj) {
                    const oldMass = obj.mass || 0;
                    obj.mass = oldMass + data.mass_gain;
                    console.log(`[Network] Масса текущего игрока обновлена: ${oldMass.toFixed(1)} → ${obj.mass.toFixed(1)} (+${data.mass_gain.toFixed(1)})`);
                } else {
                    console.warn(`[Network] Объект текущего игрока ${data.player_id} не найден для обновления массы`);
                }
            }
            
            return;
        }

        if (data.type === "food_state" && foodClient) {
            foodClient.handleFoodState(data.food);
            return;
        }

        // === НОВОЕ: Обработка обновления размера игрока ===
        if (data.type === "player_size_update") {
            console.log(`[Network] ПОЛУЧЕНО СОБЫТИЕ player_size_update для ${data.player_id}: радиус=${data.new_radius}, масса=${data.new_mass}`);
            handlePlayerSizeUpdate(data.player_id, data.new_radius, data.new_mass);
            return;
        }

        // Обрабатываем сообщение с player ID
        if (data.type === "player_id") {
            if (data.player_id && data.object_id) {
                gameStateManager.setPlayerID(data.player_id, data.object_id);
                console.log(`[Network] Получен player ID: ${data.player_id}, object ID: ${data.object_id}`);
                
                // Проверяем, есть ли уже созданный объект игрока и устанавливаем playerMesh
                const playerObject = objects[data.object_id];
                if (playerObject && playerObject.mesh) {
                    gameStateManager.setPlayerMesh(playerObject.mesh);
                    console.log(`[Network] Установлен playerMesh для существующего объекта ${data.object_id}`);
                }
            } else {
                console.error('[Network] Получено некорректное сообщение player_id:', data);
            }
            return;
        }

        // Обрабатываем pong-сообщения для синхронизации времени
        if (data.type === "pong") {
            const now = Date.now();
            const roundTripTime = now - data.client_time;
            
            // === НОВОЕ: Обновляем статистику соединения ===
            connectionStats.lastPing = now;
            
            pingHistory.push(roundTripTime);
            if (pingHistory.length > MAX_PING_SAMPLES) {
                pingHistory.shift();
            }
            
            const avgPing = pingHistory.reduce((sum, ping) => sum + ping, 0) / pingHistory.length;
            // Обновляем глобальное значение пинга
            currentPing = avgPing;
            updatePingDisplay(avgPing);
            updateServerTimeOffset(data.server_time + roundTripTime / 2);
            return;
        }

        // === ОБНОВЛЕННАЯ ЛОГИКА: Более умное обновление времени активности ===
        // Обновляем статистику для batch_update
        if (data.type === "batch_update") {
            connectionStats.lastBatchUpdate = Date.now();
            connectionStats.batchUpdateCount++;
        }
        
        // Обновляем общее время для других типов игровых обновлений  
        if (data.type === "batch_update" || data.type === "update" || 
            (data.id && data.position) || (data.id && data.velocity)) {
            lastUpdateTime = Date.now();
        }
        
        // Обрабатываем пакетные обновления
        if (data.type === "batch_update") {
            // Проверяем наличие обновлений
            if (!data.updates || typeof data.updates !== 'object') {
                console.warn('[WS] Получен пустой пакет обновлений');
                return;
            }

            // Обрабатываем каждое обновление в пакете
            for (const [id, update] of Object.entries(data.updates)) {
                if (!update || typeof update !== 'object') {
                    continue;
                }

                // Проверяем наличие необходимых данных
                if (!update.position && !update.velocity) {
                    continue;
                }

                // Добавляем id в обновление
                update.id = id;
                update.type = "update";
                
                // Передаем в функцию обработки обновлений
                receiveObjectUpdate(update);
            }
            return;
        }

        if (data.type === "update") {
            // Проверяем, содержит ли update сообщение данные объекта
            if (data.objects || data.id) {
                receiveObjectUpdate(data);
            }
        } 
        else if (data.type === "create" && data.id) {
            // Создаем объект и добавляем его в список объектов
            const obj = createMeshAndBodyForObject(data);
            
            // Проверяем, что объект был успешно создан
            if (obj) {
                obj.id = data.id; // Сохраняем id в объекте
                obj.physicsBy = data.physics_by || "both";
                obj.serverPos = {
                    x: data.x || 0,
                    y: data.y || 0,
                    z: data.z || 0
                };
                // Добавляем временную метку сервера
                obj.serverCreationTime = data.server_time;
                obj.clientCreationTime = Date.now();
                
                objects[data.id] = obj;
                
                // Запоминаем точное время создания объекта для дальнейшей синхронизации
                obj.createdAt = Date.now();
                obj.lastServerUpdate = Date.now(); // Инициализируем время последнего обновления
                
                // Если физический мир активен, активируем тело
                const physicsWorld = getPhysicsWorld();
                if (physicsWorld) {
                    if (!physicsStarted) {
                        // Добавляем в список ожидающих, если физика еще не запущена
                        pendingObjects.push(data.id);
                    } else {
                        // Активируем тело сразу
                        obj.body.activate(true);
                        // Устанавливаем начальную позицию точно по серверным координатам
                        if (obj.serverPos) {
                            try {
                                // Проверяем наличие Ammo
                                if (typeof window.Ammo === 'undefined') {
                                    console.error('[WS] window.Ammo не определен при попытке телепортации объекта');
                                    return;
                                }
                                
                                const transform = new window.Ammo.btTransform();
                                obj.body.getMotionState().getWorldTransform(transform);
                                transform.setOrigin(new window.Ammo.btVector3(
                                    obj.serverPos.x, 
                                    obj.serverPos.y, 
                                    obj.serverPos.z
                                ));
                                obj.body.getMotionState().setWorldTransform(transform);
                                obj.mesh.position.set(obj.serverPos.x, obj.serverPos.y, obj.serverPos.z);
                                
                                // Очищаем память
                                window.Ammo.destroy(transform);
                            } catch (error) {
                                console.error(`[WS] Ошибка при телепортации объекта ${data.id}:`, error);
                            }
                        }
                    }
                }
            } else {
                console.error(`[WS] Не удалось создать объект ${data.id}, тип: ${data.object_type}`);
            }
        } 
        else if (data.type === "cmd_ack") {
            // Обрабатываем подтверждение команды с временной меткой
            
            // === НОВОЕ: Обновляем статистику команд ===
            connectionStats.lastCommand = Date.now();
            
            if (data.client_time && data.server_time) {
                const roundTripTime = Date.now() - data.client_time;
                
                // Добавляем измерение пинга в историю
                pingHistory.push(roundTripTime);
                if (pingHistory.length > MAX_PING_SAMPLES) {
                    pingHistory.shift();
                }
                
                // Вычисляем средний пинг
                const avgPing = pingHistory.reduce((sum, ping) => sum + ping, 0) / pingHistory.length;
                
                // Обновляем отображение пинга на экране
                updatePingDisplay(avgPing);
                currentPing = avgPing;
                
                // Обновляем смещение серверного времени с учетом RTT/2 (предполагаем симметричную задержку)
                updateServerTimeOffset(data.server_time + roundTripTime / 2);
            }
        }
    } catch (error) {
        console.error('[WS] Ошибка обработки сообщения:', error);
    }
}

function handleKeyDown(e) {
    // Проверяем состояние соединения перед обработкой команды
    const useServerPhysics = checkConnectionState();
    
    let cmd = "";
    let forceX = 0, forceY = 0, forceZ = 0;
    
    // Получаем текущую конфигурацию физики
    const physicsConfig = getPhysicsConfig();
    if (!physicsConfig) {
        console.error("[WS] Конфигурация физики не инициализирована");
        return;
    }

    if (typeof physicsConfig.base_impulse !== 'number') {
        console.error("[WS] base_impulse не определен в конфигурации физики");
        return;
    }
    
    const baseForce = physicsConfig.base_impulse;
    
    switch (e.key) {
        case "ArrowLeft": 
            cmd = "LEFT"; 
            forceX = -baseForce;
            break;
        case "ArrowRight": 
            cmd = "RIGHT"; 
            forceX = baseForce;
            break;
        case "ArrowUp": 
            cmd = "UP"; 
            forceZ = -baseForce;
            break;
        case "ArrowDown": 
            cmd = "DOWN"; 
            forceZ = baseForce;
            break;
        case " ": 
            cmd = "SPACE"; 
            forceY = baseForce * 2; // Увеличиваем вертикальный импульс
            break;
        default: return;
    }

    try {
        // Отправляем команду на сервер, если соединение активно
        if (useServerPhysics) {
            const clientTime = Date.now();
            const commandObj = { 
                type: "cmd", 
                cmd,
                client_time: clientTime,
                data: { x: forceX, y: forceY, z: forceZ }
            };
            
            ws.send(JSON.stringify(commandObj));
        }
        
        // Применяем импульс локально если не используем серверную физику
        if (!useServerPhysics) {
            const currentTime = Date.now();
            const timeSinceLastImpulse = currentTime - lastKeyboardImpulseTime;
            
            // Применяем импульс только если прошло достаточно времени с последнего применения
            if (timeSinceLastImpulse >= KEYBOARD_IMPULSE_INTERVAL) {
                const physicsWorld = getPhysicsWorld();
                if (!physicsWorld) {
                    console.error("[WS] Физический мир не инициализирован");
                    return;
                }

                for (let id in objects) {
                    const obj = objects[id];
                    if (obj && obj.body && obj.mesh && obj.mesh.geometry && 
                        obj.mesh.geometry.type === "SphereGeometry") {
                        
                        try {
                            // Применяем импульс с точно такой же силой, как на сервере
                            applyImpulseToSphere(id, { x: forceX, y: forceY, z: forceZ });
                        } catch (error) {
                            console.error(`[WS] Ошибка при применении импульса к объекту ${id}:`, error);
                        }
                    }
                }
                
                // Обновляем время последнего применения импульса
                lastKeyboardImpulseTime = currentTime;
            }
        }
    } catch (error) {
        console.error("[WS] Ошибка отправки:", error);
    }
}

// Обработка видимости страницы
function handleVisibilityChange() {
    if (document.hidden) {
        isTabActive = false;
        console.log("[WS] Вкладка неактивна, запоминаем время");
        lastActiveTime = Date.now();
    } else {
        const wasInactive = !isTabActive;
        isTabActive = true;
        
        if (wasInactive) {
            const inactiveTime = Date.now() - lastActiveTime;
            console.log(`[WS] Вкладка снова активна после ${inactiveTime}мс бездействия`);
            
            // Если вкладка была неактивна долгое время, запрашиваем обновления с сервера
            if (inactiveTime > 1000) {
                console.log("[WS] Принудительно запрашиваем обновления с сервера");
                sendPing(); // Отправляем ping для обновления
                
                // Сбрасываем время последнего обновления для принудительного использования
                // локальной физики до получения свежих данных
                lastUpdateTime = 0;
            }
        }
    }
}

export async function initNetwork() {
    try {
        console.log("[WS] Начало инициализации WebSocket");
        ws = new WebSocket("ws://localhost:8080/ws");
        
        ws.onopen = () => {
            console.log("[WS] connected");
            // Инициализируем индикатор пинга
            updatePingDisplay(0);
            // Обновляем информацию о времени
            updateTimeDisplay();
            // Запускаем интервал обновления времени
            if (timeDisplayInterval) clearInterval(timeDisplayInterval);
            timeDisplayInterval = setInterval(updateTimeDisplay, 1000);
            // Отправим тестовое сообщение для синхронизации времени
            sendPing();
        };

        ws.onmessage = (evt) => {
            try {
                const data = JSON.parse(evt.data);
                
                if (!data || typeof data !== 'object') {
                    throw new Error('Неверный формат данных');
                }

                // Обрабатываем пакетные обновления
                if (data.type === "batch_update" && data.updates) {
                    handleMessage(data);
                    return;
                }

                // Обрабатываем остальные сообщения
                if (data.type === "update" && data.id) {
                    receiveObjectUpdate(data);
                } 
                else if (data.type === "create" && data.id) {
                    handleMessage(data);
                }
                else if (data.type === "pong") {
                    handleMessage(data);
                }
                else {
                    handleMessage(data);
                }
            } catch (error) {
                console.error("[WS] Ошибка при обработке сообщения:", error);
            }
        };

        ws.onerror = (error) => {
            console.error("[WS] WebSocket error:", error);
            console.error("[WS] Детали ошибки:", {
                message: error.message,
                type: error.type,
                eventPhase: error.eventPhase
            });
        };

        ws.onclose = (event) => {
            console.log("[WS] Соединение закрыто:", {
                code: event.code,
                reason: event.reason,
                wasClean: event.wasClean
            });
            
            // Останавливаем обновление времени при закрытии соединения
            if (timeDisplayInterval) {
                clearInterval(timeDisplayInterval);
                timeDisplayInterval = null;
            }
        };

        document.addEventListener("keydown", handleKeyDown);
        
        // Добавляем обработчик видимости страницы
        document.addEventListener("visibilitychange", handleVisibilityChange);
        
        // Запускаем периодическую синхронизацию времени
        setInterval(sendPing, 10000); // Каждые 10 секунд

        return ws;
    } catch (error) {
        console.error("[WS] Ошибка при создании WebSocket:", error);
        console.error("[WS] Стек вызовов:", error.stack);
    }
}

// Функция для отправки ping-сообщения с временной меткой клиента
function sendPing() {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    
    const clientTime = Date.now();
    const pingObj = { 
        type: "ping", 
        client_time: clientTime 
    };
    
    try {
        ws.send(JSON.stringify(pingObj));
        //console.log(`[WS] Отправлен ping для синхронизации времени, время клиента: ${clientTime}`);
    } catch (error) {
        console.error("[WS] Ошибка отправки ping:", error);
    }
}

// Новая функция для запуска физики с задержкой
export function startPhysicsSimulation() {
    physicsStarted = true;
    
    // Активируем все ожидающие объекты
    const physicsWorld = getPhysicsWorld();
    if (physicsWorld) {
        for (const id of pendingObjects) {
            const obj = objects[id];
            if (obj && obj.body) {
                // Активируем тело
                obj.body.activate(true);
                
                // Телепортируем к последним известным серверным координатам
                if (obj.serverPos) {
                    const transform = new Ammo.btTransform();
                    obj.body.getMotionState().getWorldTransform(transform);
                    transform.setOrigin(new Ammo.btVector3(
                        obj.serverPos.x, 
                        obj.serverPos.y, 
                        obj.serverPos.z
                    ));
                    obj.body.getMotionState().setWorldTransform(transform);
                    obj.mesh.position.set(obj.serverPos.x, obj.serverPos.y, obj.serverPos.z);
                    
                    console.log(`[Physics] Объект ${id} активирован и телепортирован в координаты:`, 
                        { x: obj.serverPos.x, y: obj.serverPos.y, z: obj.serverPos.z });
                }
            }
        }
    }
    
    // Очищаем список ожидающих
    pendingObjects = [];
    console.log("[Physics] Физика активирована, все ожидающие объекты обработаны");
}

// Экспортируем функции для доступа из других модулей
export { estimateServerTime };

// === НОВЫЕ ФУНКЦИИ ДЛЯ СИСТЕМЫ ЕДЫ ===

// Функция для инициализации системы еды (вызывается из main.js после создания scene)
export function initFoodSystem(scene, world) {
    foodClient = new SimpleFoodClient(scene, world);
    console.log('[Network] Система еды инициализирована');
}

// Функция для обновления системы еды (вызывается из render loop)
export function updateFoodSystem(deltaTime) {
    if (foodClient) {
        foodClient.update(deltaTime);
    }
}

// Функция для получения количества еды (для UI)
export function getFoodCount() {
    return foodClient ? foodClient.getFoodCount() : 0;
}

// === НОВОЕ: Обработка обновления размера игрока ===
function handlePlayerSizeUpdate(playerID, newRadius, newMass) {
    console.log(`[Network] Получено обновление размера игрока ${playerID}: радиус=${newRadius.toFixed(1)}, масса=${newMass.toFixed(1)}`);
    
    const obj = objects[playerID];
    if (!obj) {
        console.warn(`[Network] Объект игрока ${playerID} не найден для обновления размера`);
        return;
    }
    
    // Обновляем только данные объекта, без физики пока
    obj.radius = newRadius;
    obj.mass = newMass;
    
    // Обновляем визуальный mesh
    if (obj.mesh && obj.mesh.geometry) {
        const originalRadius = obj.mesh.geometry.parameters?.radius || 1;
        const scale = newRadius / originalRadius;
        obj.mesh.scale.setScalar(scale);
        console.log(`[Network] Размер игрока ${playerID} обновлен: радиус=${newRadius.toFixed(1)}, масса=${newMass.toFixed(1)}, scale=${scale.toFixed(2)}`);
    }

    // Простое обновление массы в физическом теле (без смены радиуса)
    if (obj.body && obj.physicsBy !== "bullet") {
        try {
            const currentVel = obj.body.getLinearVelocity();
            const shape = obj.body.getCollisionShape();
            const localInertia = new window.Ammo.btVector3(0, 0, 0);
            shape.calculateLocalInertia(newMass, localInertia);
            obj.body.setMassProps(newMass, localInertia);
            obj.body.setLinearVelocity(currentVel);
            obj.body.activate(true);
            
            // Очистка памяти
            window.Ammo.destroy(localInertia);
            window.Ammo.destroy(currentVel);
            
            console.log(`[Network] Физическая масса обновлена: ${newMass}кг`);
        } catch (error) {
            console.error(`[Network] Ошибка обновления массы:`, error);
        }
    }
}