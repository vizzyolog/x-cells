// network.js
import { objects, createMeshAndBodyForObject } from './objects';
import { applyImpulseToSphere, receiveObjectUpdate, localPhysicsWorld, updatePhysicsConfig } from './physics';

let ws = null;
let physicsStarted = false;
let pendingObjects = [];

// Добавляем переменные для работы с временными метками
let serverTimeOffset = 0;       // Разница между серверным и клиентским временем
let serverTimeOffsetSamples = []; // Хранение образцов для вычисления среднего значения
const MAX_OFFSET_SAMPLES = 10;  // Максимальное количество образцов
let pingHistory = [];           // История пингов для анализа
const MAX_PING_SAMPLES = 10;    // Максимальное количество образцов пинга

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
    
    console.log(`[Time] Синхронизация времени: смещение = ${medianOffset} мс`);
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

// Функция безопасной обработки числовых значений
function safeNumber(value, defaultValue = 0) {
    return (value !== undefined && value !== null && !isNaN(value)) ? value : defaultValue;
}

// Функция проверки и преобразования поступающих данных
function validateObjectData(data) {
    if (!data) return data;
    
    // Проверка и исправление позиции
    if (data.position) {
        data.position.x = safeNumber(data.position.x);
        data.position.y = safeNumber(data.position.y);
        data.position.z = safeNumber(data.position.z);
    }
    
    // Проверка и исправление скорости
    if (data.velocity) {
        data.velocity.x = safeNumber(data.velocity.x);
        data.velocity.y = safeNumber(data.velocity.y);
        data.velocity.z = safeNumber(data.velocity.z);
    }
    
    // Проверка и исправление отдельных координат
    if (data.x !== undefined) data.x = safeNumber(data.x);
    if (data.y !== undefined) data.y = safeNumber(data.y);
    if (data.z !== undefined) data.z = safeNumber(data.z);
    
    // Проверка и исправление отдельных компонентов скорости
    if (data.vx !== undefined) data.vx = safeNumber(data.vx);
    if (data.vy !== undefined) data.vy = safeNumber(data.vy);
    if (data.vz !== undefined) data.vz = safeNumber(data.vz);
    
    return data;
}

// Обработка входящих сообщений
function handleMessage(data) {
    try {
        // Применяем валидацию ко всем входящим данным
        data = validateObjectData(data);

        // Если сообщение содержит временную метку сервера, обновляем смещение
        if (data.serverTime || data.server_time) {
            const serverTime = data.serverTime || data.server_time;
            updateServerTimeOffset(serverTime);
        }

        // Обрабатываем pong-сообщения для синхронизации времени
        if (data.type === "pong") {
            const now = Date.now();
            const clientTime = data.clientTime || data.client_time || 0;
            const roundTripTime = now - clientTime;
            
            // Добавляем измерение пинга в историю
            pingHistory.push(roundTripTime);
            if (pingHistory.length > MAX_PING_SAMPLES) {
                pingHistory.shift();
            }
            
            // Вычисляем средний пинг
            const avgPing = pingHistory.reduce((sum, ping) => sum + ping, 0) / pingHistory.length;
            
            // Обновляем отображение пинга на экране
            updatePingDisplay(avgPing);
            
            console.log(`[WS] Получен pong, RTT: ${roundTripTime}ms, Средний RTT: ${avgPing.toFixed(2)}ms`);
            
            // Обновляем смещение серверного времени с учетом RTT/2 (предполагаем симметричную задержку)
            const serverTime = data.serverTime || data.server_time || 0;
            updateServerTimeOffset(serverTime + roundTripTime / 2);
            
            return; // Прекращаем обработку этого сообщения
        }

        if (data.type === "update") {
            // Вычисляем задержку
            if (data.server_send_time || data.serverSendTime) {
                const now = Date.now();
                serverDelay = now - (data.server_send_time || data.serverSendTime);
                updateServerDelayDisplay(serverDelay);
            }

            // Проверяем формат сообщения update
            if (data.objects && typeof data.objects === 'object') {
                // Формат с массивом объектов
                console.log("[WS] Получено сообщение update с массивом объектов:", Object.keys(data.objects).length);
                
                // Обрабатываем каждый объект в массиве
                for (const id in data.objects) {
                    const objData = data.objects[id];
                    // Добавляем id к данным объекта
                    objData.id = id;
                    // Обрабатываем обновление этого объекта
                    receiveObjectUpdate(objData);
                }
            } else if (data.id) {
                // Стандартный формат с обновлением одного объекта
                receiveObjectUpdate(data);
            } else {
                console.log("[WS] Некорректный формат сообщения update:", data);
            }
        }
        else if (data.type === 'cmd_ack' || data.type === 'COMMAND_ACK') {
            // Обрабатываем подтверждение команды с временной меткой
            const clientTime = data.clientTime || data.client_time;
            const serverTime = data.serverTime || data.server_time;
            
            if (clientTime && serverTime) {
                const roundTripTime = Date.now() - clientTime;
                
                // Добавляем измерение пинга в историю
                pingHistory.push(roundTripTime);
                if (pingHistory.length > MAX_PING_SAMPLES) {
                    pingHistory.shift();
                }
                
                // Вычисляем средний пинг
                const avgPing = pingHistory.reduce((sum, ping) => sum + ping, 0) / pingHistory.length;
                
                // Обновляем отображение пинга на экране
                updatePingDisplay(avgPing);
                
                console.log(`[WS] Подтверждение команды: ${data.cmd}, RTT: ${roundTripTime}ms, Средний RTT: ${avgPing.toFixed(2)}ms`);
                
                // Обновляем смещение серверного времени с учетом RTT/2 (предполагаем симметричную задержку)
                updateServerTimeOffset(serverTime + roundTripTime / 2);
            }
        }
        else if (data.type === 'objects') {
            receiveInitialObjects(data.objects);
        }
        else if (data.type === 'object_update') {
            receiveObjectUpdate(data);
        }
        else if (data.type === 'physics_config') {
            updatePhysicsConfig(data.config);
        }
        else if (data.type === 'create') {
            console.log("[WS] Получено сообщение о создании объекта:", data.id, "в координатах:", 
                { x: data.x || 0, y: data.y || 0, z: data.z || 0 },
                "время сервера:", data.server_time || data.serverTime);
            console.log("[WS] Полные данные объекта:", JSON.stringify(data));
            
            // Создаем объект и добавляем его в список объектов
            const obj = createMeshAndBodyForObject(data);
            
            // Проверяем, что объект был успешно создан
            if (obj) {
                console.log(`[WS] Объект ${data.id} успешно создан, mesh:`, obj.mesh !== undefined, "body:", obj.body !== undefined);
                obj.physicsBy = data.physics_by || "both";
                obj.serverPos = {
                    x: data.x || 0,
                    y: data.y || 0,
                    z: data.z || 0
                };
                // Добавляем временную метку сервера
                obj.serverCreationTime = data.server_time || data.serverTime;
                obj.clientCreationTime = Date.now();
                
                objects[data.id] = obj;
                
                // Запоминаем точное время создания объекта для дальнейшей синхронизации
                obj.createdAt = Date.now();
                
                console.log(`[WS] Объект ${data.id} создан с physicsBy: ${obj.physicsBy}`);
                
                // Если физический мир активен, активируем тело
                if (obj.body && localPhysicsWorld) {
                    if (!physicsStarted) {
                        // Добавляем в список ожидающих, если физика еще не запущена
                        pendingObjects.push(data.id);
                        console.log(`[WS] Объект ${data.id} добавлен в список ожидания - физика еще не активна`);
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
                                
                                console.log(`[WS] Объект ${data.id} телепортирован в исходные координаты:`, 
                                    { x: obj.serverPos.x, y: obj.serverPos.y, z: obj.serverPos.z });
                                
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
        else {
            console.log('Неизвестный тип сообщения:', data.type);
        }
    } catch (error) {
        console.error("[WS] Ошибка при обработке сообщения:", error);
        console.error("[WS] Стек вызовов:", error.stack);
    }
}

function handleKeyDown(e) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    let cmd = "";
    let forceX = 0, forceY = 0, forceZ = 0;
    
    switch (e.key) {
        case "ArrowLeft": 
            cmd = "LEFT"; 
            forceX = -5;
            break;
        case "ArrowRight": 
            cmd = "RIGHT"; 
            forceX = 5;
            break;
        case "ArrowUp": 
            cmd = "UP"; 
            forceZ = -5;
            break;
        case "ArrowDown": 
            cmd = "DOWN"; 
            forceZ = 5;
            break;
        case " ": 
            cmd = "SPACE"; 
            forceY = 10;
            break;
        default: return;
    }

    try {
        // Добавляем временную метку клиента к команде
        const clientTime = Date.now();
        const commandObj = { 
            type: "cmd", 
            cmd,
            client_time: clientTime // Добавляем временную метку клиента
        };
        
        console.log(`[WS] Отправка команды: ${cmd}, время клиента: ${clientTime}`);
        ws.send(JSON.stringify(commandObj));
        
        // Применяем импульс локально ко всем объектам сфер
        for (let id in objects) {
            const obj = objects[id];
            if (obj && obj.body && obj.mesh && obj.mesh.geometry && 
                obj.mesh.geometry.type === "SphereGeometry") {
                console.log(`[WS] Применяем импульс к сфере ${id} с physicsBy=${obj.physicsBy}`);
                
                // Вызываем функцию применения импульса с обновленными параметрами
                applyImpulseToSphere(cmd, forceX, forceY, forceZ, objects, clientTime);
            }
        }
    } catch (error) {
        console.error("[WS] Ошибка отправки:", error);
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
                // Проверка на пустые данные
                if (!evt.data || evt.data.trim() === '') {
                    console.warn('[WS] Получены пустые данные');
                    return;
                }
                
                console.log('[WS] Получено сообщение:', evt.data.substring(0, 200) + (evt.data.length > 200 ? '...' : ''));
                
                const data = JSON.parse(evt.data);
                
                if (!data || typeof data !== 'object') {
                    throw new Error('Неверный формат данных');
                }

                // Если приходит сообщение с id и object_type, но без type - это объект создания
                if (!data.type && data.id && data.object_type) {
                    console.log('[WS] Получен объект без type, считаем это create:', data);
                    // Добавляем тип для совместимости с существующим кодом
                    data.type = "create";
                }
                
                // Обрабатываем все сообщения через handleMessage
                handleMessage(data);
                
            } catch (error) {
                console.error("[WS] Ошибка при обработке сообщения:", error);
                console.error("[WS] Необработанные данные:", evt.data);
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
        console.log(`[WS] Отправлен ping для синхронизации времени, время клиента: ${clientTime}`);
    } catch (error) {
        console.error("[WS] Ошибка отправки ping:", error);
    }
}

// Новая функция для запуска физики с задержкой
export function startPhysicsSimulation() {
    physicsStarted = true;
    
    // Активируем все ожидающие объекты
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
    
    // Очищаем список ожидающих
    pendingObjects = [];
    console.log("[Physics] Физика активирована, все ожидающие объекты обработаны");
}

// Экспортируем функции для доступа из других модулей
export { estimateServerTime };

// Отправка данных на сервер
export function sendData(data) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        const message = {
            type: 'COMMAND',
            command: 'MOUSE_VECTOR',
            data: {
                x: data.direction.x,
                y: data.direction.y, 
                z: data.direction.z,
                distance: data.distance || 0,
                force: data.force
            },
            clientTime: Date.now(),
            objectId: 'mainPlayer1'
        };
        
        ws.send(JSON.stringify(message));
    } else {
        console.warn('WebSocket не подключен, невозможно отправить данные');
    }
}

// Запрос конфигурации физики от сервера
export function requestPhysicsConfig() {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: 'COMMAND',
            command: 'GET_PHYSICS_CONFIG',
            clientTime: Date.now()
        }));
    } else {
        console.warn('WebSocket не подключен, невозможно запросить конфигурацию физики');
    }
}