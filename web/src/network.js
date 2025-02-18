// network.js
import { objects, createMeshAndBodyForObject } from './objects';
import { createPhysicsObject } from './physics';
import { applyImpulseToSphere } from './physics';

let ws = null;

function handleMessage(data) {      
    try {
        if (data.type === "create" && data.id) {
            console.log("[WS] Обработка create сообщения для id:", data.id);
            const obj = {
                id: data.id,
                object_type: data.object_type,
                x: data.x,
                y: data.y,
                z: data.z,
                mass: data.mass,
                radius: data.radius,
                color: data.color,
                height_data: data.height_data,
                heightmap_w: data.heightmap_w,
                heightmap_h: data.heightmap_h,
                scale_x: data.scale_x,
                scale_y: data.scale_y,
                scale_z: data.scale_z,
            };
            
            // Сначала добавляем объект в коллекцию
            objects[data.id] = obj;
            
            // Создаем визуальный объект и физическое тело
            createMeshAndBodyForObject(obj);
            createPhysicsObject(obj);
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

function handleKeyPress(event) {
    if (event.repeat) return; // Игнорируем повторные нажатия при удержании клавиши

    let cmd = null;
    switch (event.code) {
        case "ArrowLeft":
        case "KeyA":
            cmd = "LEFT";
            break;
        case "ArrowRight":
        case "KeyD":
            cmd = "RIGHT";
            break;
        case "ArrowUp":
        case "KeyW":
            cmd = "UP";
            break;
        case "ArrowDown":
        case "KeyS":
            cmd = "DOWN";
            break;
        case "Space":
            cmd = "SPACE";
            break;
    }

    if (cmd) {
        // Отправляем команду на сервер
        ws.send(JSON.stringify({
            type: "cmd",
            cmd: cmd
        }));

        // Применяем импульс локально
        applyImpulseToSphere(cmd, objects);
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

                // Дальнейшая обработка...
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

        document.addEventListener("keydown", handleKeyPress);
    } catch (error) {
        console.error("[WS] Ошибка при создании WebSocket:", error);
        console.error("[WS] Стек вызовов:", error.stack);
    }
}