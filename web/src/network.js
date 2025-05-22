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
const UPDATE_TIMEOUT = 50; 

// Добавляем переменные для дебаунса
let lastKeyboardImpulseTime = 0;
const KEYBOARD_IMPULSE_INTERVAL = 10; // мс, должно соответствовать серверному интервалу

// Добавляем переменную для отслеживания состояния вкладки
let isTabActive = true;
let lastActiveTime = Date.now();

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
    const pingDisplay = document.getElementById('ping-display');
    if (pingDisplay) {
        pingDisplay.textContent = `Пинг: ${pingValue.toFixed(0)} мс`;
        
        // Меняем цвет в зависимости от качества соединения
        if (pingValue < 50) {
            pingDisplay.style.backgroundColor = 'rgba(0, 128, 0, 0.5)'; // Зеленый - хороший пинг
        } else if (pingValue < 100) {
            pingDisplay.style.backgroundColor = 'rgba(255, 165, 0, 0.5)'; // Оранжевый - средний пинг
        } else {
            pingDisplay.style.backgroundColor = 'rgba(255, 0, 0, 0.5)'; // Красный - плохой пинг
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
    const timeSinceLastUpdate = currentTime - lastUpdateTime;
    
    // Если прошло больше UPDATE_TIMEOUT мс с последнего обновления, переключаемся на локальную физику
    if (timeSinceLastUpdate > UPDATE_TIMEOUT) {
        // Логируем только если это не связано с неактивной вкладкой
        if (isTabActive) {
            console.log(`[WS] Нет обновлений ${timeSinceLastUpdate}мс, переключаемся на локальную физику`);
        }
        return false;
    }
    
    // Проверяем состояние WebSocket соединения
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        console.log("[WS] Соединение с сервером отсутствует, используем локальную физику");
        return false;
    }
    
    return true;
}

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

        // Обрабатываем pong-сообщения для синхронизации времени
        if (data.type === "pong") {
            const now = Date.now();
            const roundTripTime = now - data.client_time;
            
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

        // Обрабатываем пакетные обновления
        if (data.type === "batch_update") {
            // Обновляем время последнего обновления
            lastUpdateTime = Date.now();
            
            // Проверяем наличие обновлений
            if (!data.updates || typeof data.updates !== 'object') {
                console.warn('[WS] Получен пустой пакет обновлений');
                return;
            }

            // Обрабатываем каждое обновление в пакете
            for (const [id, update] of Object.entries(data.updates)) {
                if (!update || typeof update !== 'object') {
                    console.warn(`[WS] Пропускаем некорректное обновление для ${id}`);
                    continue;
                }

                // Проверяем наличие необходимых данных
                if (!update.position || !update.velocity) {
                    console.warn(`[WS] Пропускаем неполное обновление для ${id}`);
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
            // Обновляем время последнего обновления
            lastUpdateTime = Date.now();
            
            // Проверяем, содержит ли update сообщение данные объекта
            if (data.objects || data.id) {
                console.log('[WS] Получено update сообщение:', 
                   data.id ? `id: ${data.id}` : `Количество объектов: ${Object.keys(data.objects).length}`);
                receiveObjectUpdate(data);
            } else {
                console.warn('[WS] Получено update сообщение без объектов:', data);
            }
        } 
        else if (data.type === "create" && data.id) {
            //console.log("[WS] Получено сообщение о создании объекта:", data.id, "в координатах:", 
            //    { x: data.x || 0, y: data.y || 0, z: data.z || 0 },
            //    "время сервера:", data.server_time, "тип физики:", data.physics_by);
            
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
                
                console.log(`[WS] Объект ${data.id} создан с physicsBy: ${obj.physicsBy}`);
                
                // Если физический мир активен, активируем тело
                const physicsWorld = getPhysicsWorld();
                if (physicsWorld) {
                    if (!physicsStarted) {
                        // Добавляем в список ожидающих, если физика еще не запущена
                        pendingObjects.push(data.id);
                        //console.log(`[WS] Объект ${data.id} добавлен в список ожидания - физика еще не активна`);
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
                                
                                //console.log(`[WS] Объект ${data.id} телепортирован в исходные координаты:`, 
                                //    { x: obj.serverPos.x, y: obj.serverPos.y, z: obj.serverPos.z });
                                
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
                
                //console.log(`[WS] Подтверждение команды: ${data.cmd}, RTT: ${roundTripTime}ms, Средний RTT: ${avgPing.toFixed(2)}ms`);
                
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
            
            console.log('[WS] Отправка команды:', {
                cmd,
                force: { x: forceX, y: forceY, z: forceZ },
                client_time: clientTime
            });
            
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
                            
                            // Логируем текущую скорость после применения импульса
                            const velocity = obj.body.getLinearVelocity();
                            console.log(`[WS] Скорость объекта ${id} после импульса:`, {
                                x: velocity.x(),
                                y: velocity.y(),
                                z: velocity.z(),
                                interval: timeSinceLastImpulse
                            });
                            window.Ammo.destroy(velocity);
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
                    console.log('[WS] Получено пакетное обновление:', {
                        type: data.type,
                        time: data.time,
                        updatesCount: Object.keys(data.updates).length
                    });
                    handleMessage(data);
                    return;
                }

                // Для остальных сообщений логируем детали
                console.log('[WS] Получено сообщение:', {
                    type: data.type,
                    id: data.id,
                    hasPosition: data.position !== undefined,
                    hasVelocity: data.velocity !== undefined
                });

                // Если приходит сообщение с id и object_type, но без type - это объект создания
                if (!data.type && data.id && data.object_type) {
                    console.log('[WS] Получен объект без type, считаем это create:', data);
                    data.type = "create";
                    handleMessage(data);
                }
                // Обрабатываем update сообщения
                else if (data.type === "update" && data.id) {
                    console.log('[WS] Обработка update сообщения:', {
                        id: data.id,
                        position: data.position,
                        velocity: data.velocity
                    });
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