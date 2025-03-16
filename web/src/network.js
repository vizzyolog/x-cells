// network.js
import { objects, createMeshAndBodyForObject } from './objects';
import { createPhysicsObject } from './physics';
import { applyImpulseToSphere } from './physics';

let ws = null;

function handleMessage(data) {      
    try {
        if (data.type === "create" && data.id) {
            if (data.object_type !== 'terrain') {
                console.log("[WS] Создан объект:", data.object_type, data.id);
            }
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
            
            objects[data.id] = obj;
            createMeshAndBodyForObject(obj);
            createPhysicsObject(obj);
        } 
        else if (data.type === "update" && data.id && objects[data.id]) {
            const obj = objects[data.id];
            obj.serverPos = {
                x: data.x || 0,
                y: data.y || 0,
                z: data.z || 0
            };
        }
    } catch (error) {
        console.error("[WS] Ошибка при обработке сообщения:", error);
    }
}

function handleKeyPress(event) {
    if (event.repeat) return;

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
        ws.send(JSON.stringify({
            type: "cmd",
            cmd: cmd
        }));
        applyImpulseToSphere(cmd, objects);
    }
}

export function initNetwork() {
    try {
        ws = new WebSocket("ws://localhost:8080/ws");
        
        ws.onopen = () => {
            console.log("[WS] Подключено");
            ws.send(JSON.stringify({ type: "ping" }));
        };

        ws.onmessage = (evt) => {
            try {
                const data = JSON.parse(evt.data);
                if (!data || typeof data !== 'object') {
                    throw new Error('Неверный формат данных');
                }
                handleMessage(data);
            } catch (error) {
                console.error("[WS] Ошибка обработки сообщения:", error);
            }
        };

        ws.onerror = (error) => {
            console.error("[WS] Ошибка WebSocket:", error);
        };

        ws.onclose = (event) => {
            console.log("[WS] Соединение закрыто");
        };

        document.addEventListener("keydown", handleKeyPress);
    } catch (error) {
        console.error("[WS] Ошибка при создании WebSocket:", error);
    }
}