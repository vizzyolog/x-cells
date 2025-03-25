// network.js
import { objects, createMeshAndBodyForObject } from './objects';
import { applyImpulseToSphere, receiveObjectUpdate } from './physics';

let ws = null;

function handleMessage(data) {      
    try {
        if (data.type === "create" && data.id) {
            console.log("[WS] Обработка create сообщения для id:", data.id);
            
            // Создаем объект и добавляем его в список объектов
            const obj = createMeshAndBodyForObject(data);
            obj.physicsBy = data.physics_by || "both"; // Убедитесь, что свойство устанавливается
            objects[data.id] = obj;

            console.log(`[WS] Объект ${data.id} создан с physicsBy: ${obj.physicsBy}`); // Логирование установленного свойства
        } 
        else if (data.type === "update" && data.id && objects[data.id]) {
            console.log("[WS] Обработка update сообщения для id:", data.id);
            const obj = objects[data.id];
            obj.serverPos = {
                x: data.x || 0,
                y: data.y || 0,
                z: data.z || 0
            };
        }
    } catch (error) {
        console.error("[WS] Ошибка при обработке сообщения:", error);
        console.error("[WS] Стек вызовов:", error.stack);
    }
}

function handleKeyDown(e) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    let cmd = "";
    switch (e.key) {
        case "ArrowLeft": cmd = "LEFT"; break;
        case "ArrowRight": cmd = "RIGHT"; break;
        case "ArrowUp": cmd = "UP"; break;
        case "ArrowDown": cmd = "DOWN"; break;
        case " ": cmd = "SPACE"; break;
        default: return;
    }

    try {
        console.log(`[WS] Отправка команды: ${cmd}`);
        ws.send(JSON.stringify({ type: "cmd", cmd }));
        
        // Применяем импульс локально для всех объектов, включая serverPlayer
        for (let id in objects) {
            const obj = objects[id];
            if (obj && obj.body && obj.mesh && obj.mesh.geometry && 
                obj.mesh.geometry.type === "SphereGeometry") {
                console.log(`[WS] Применяем импульс к сфере ${id} с physicsBy=${obj.physicsBy}`);
                
                // Создаем импульс
                const impulse = new window.Ammo.btVector3(0, 0, 0);
                if (cmd === "LEFT") impulse.setValue(-5, 0, 0);
                if (cmd === "RIGHT") impulse.setValue(5, 0, 0);
                if (cmd === "UP") impulse.setValue(0, 0, -5);
                if (cmd === "DOWN") impulse.setValue(0, 0, 5);
                if (cmd === "SPACE") impulse.setValue(0, 10, 0);
                
                // Активируем тело и применяем импульс
                obj.body.activate(true);
                obj.body.applyCentralImpulse(impulse);
                
                // Очищаем память
                window.Ammo.destroy(impulse);
            }
        }
    } catch (error) {
        console.error("[WS] Ошибка отправки:", error);
    }
}

export function initNetwork() {
    try {
        console.log("[WS] Начало инициализации WebSocket");
        ws = new WebSocket("ws://localhost:8080/ws");
        
        ws.onopen = () => {
            console.log("[WS] connected");
            // Отправим тестовое сообщение
            try {
                ws.send(JSON.stringify({ type: "ping" }));
                console.log("[WS] Отправлено тестовое сообщение");
            } catch (e) {
                console.error("[WS] Ошибка отправки тестового сообщения:", e);
            }
        };

        ws.onmessage = (evt) => {
            try {
                const data = JSON.parse(evt.data);
                
                if (!data || typeof data !== 'object') {
                    throw new Error('Неверный формат данных');
                }

                // Если приходит сообщение с id и object_type, но без type - это объект создания
                if (!data.type && data.id && data.object_type) {
                    console.log('[WS] Получен объект без type, считаем это create:', data);
                    // Добавляем тип для совместимости с существующим кодом
                    data.type = "create";
                    // Обрабатываем как create
                    handleMessage(data);
                }
                // Обрабатываем update сообщения через нашу новую функцию
                else if (data.type === "update" && data.id) {
                    console.log(`[WS] Получено обновление для ${data.id}:`, {
                        x: data.x,
                        y: data.y,
                        z: data.z
                    });
                    receiveObjectUpdate(data);
                } 
                else if (data.type === "create" && data.id) {
                    // Оставляем существующую логику создания объектов
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
        };

        document.addEventListener("keydown", handleKeyDown);
    } catch (error) {
        console.error("[WS] Ошибка при создании WebSocket:", error);
        console.error("[WS] Стек вызовов:", error.stack);
    }
}