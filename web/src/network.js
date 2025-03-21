// network.js
import { objects, createMeshAndBodyForObject } from './objects';
import { applyImpulseToSphere } from './physics';

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
        ws.send(JSON.stringify({ type: "cmd", cmd }));
        applyImpulseToSphere(cmd, objects);
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

                handleMessage(data);
            } catch (error) {
                console.error("[WS] Полная ошибка:", error);
                console.error("[WS] Стек вызовов:", error.stack);
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