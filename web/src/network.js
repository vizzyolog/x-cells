// network.js
import { objects, createMeshAndBodyForObject } from './objects';
import { createPhysicsObject, applyImpulseToSphere } from './physics';

let socket = null;
let connected = false;

export function initNetwork() {
    console.log("[Network] Инициализация сети");
    
    // WebSocket URL
    // const wsURL = "ws://" + window.location.host + "/ws";
    const wsURL = "ws://localhost:8080/ws";
    
    // Создание WebSocket соединения
    try {
        socket = new WebSocket(wsURL);
        console.log("[Network] Создано соединение WebSocket:", wsURL);
        
        // Обработчик открытия соединения
        socket.onopen = function() {
            console.log("[Network] WebSocket соединение установлено");
            connected = true;
            
            // Запрашиваем у сервера создание mainPlayer
            sendCommand("CREATE_PLAYER", "");
            console.log("[Network] Отправлен запрос на создание mainPlayer");
        };
        
        // Обработчик сообщений от сервера
        socket.onmessage = function(event) {
            try {
                const message = JSON.parse(event.data);
                console.log("[Network] Получено сообщение от сервера:", message);
                
                // Используем функцию handleWebSocketMessage для обработки сообщений
                handleWebSocketMessage(message);
            } catch (error) {
                console.error("[Network] Ошибка обработки сообщения:", error);
            }
        };
        
        // Обработчик закрытия соединения
        socket.onclose = function() {
            console.log("[Network] WebSocket соединение закрыто");
            connected = false;
        };
        
        // Обработчик ошибок
        socket.onerror = function(error) {
            console.error("[Network] Ошибка WebSocket:", error);
        };
    } catch (error) {
        console.error("[Network] Ошибка при создании WebSocket:", error);
    }
}

// Функция отправки команды на сервер
export function sendCommand(cmd, data) {
    if (socket && socket.readyState === WebSocket.OPEN) {
        const message = {
            cmd: cmd,
            data: data
        };
        
        try {
            socket.send(JSON.stringify(message));
            console.log("[Network] Отправлена команда:", cmd, data);
        } catch (error) {
            console.error("[Network] Ошибка отправки команды:", error);
        }
    } else {
        console.warn("[Network] WebSocket не готов для отправки команды:", cmd);
    }
}

// Обработчик сообщений от сервера
function handleWebSocketMessage(message) {
    console.log("[Network] Обработка сообщения:", message);
    console.log(`[Network] Текущее состояние objects: ${Object.keys(objects).length} объектов, ключи: ${Object.keys(objects).join(', ')}`);
    
    if (message.type === "create") {
        if (objects[message.id]) {
            console.log(`[Network] Объект ${message.id} уже существует:`, objects[message.id]);
            return;
        }
        
        console.log(`[Network] Создание объекта ${message.id} типа ${message.object_type}`);
        
        const obj = {
            id: message.id,
            object_type: message.object_type,
            x: message.x || 0,
            y: message.y || 1,
            z: message.z || 0,
            mass: message.mass || 1,
            radius: message.radius || 1,
            color: message.color || "#ff0000",
            height_data: message.height_data,
            heightmap_w: message.heightmap_w,
            heightmap_h: message.heightmap_h,
            scale_x: message.scale_x,
            scale_y: message.scale_y,
            scale_z: message.scale_z
        };
        
        console.log(`[Network] Создан объект для добавления:`, obj);
        
        // Важно! Сначала добавляем в objects, затем создаем меш и физическое тело
        objects[message.id] = obj; // Добавляем в objects напрямую
        console.log(`[Network] Объект ${message.id} добавлен в objects. Текущий список: ${Object.keys(objects).join(', ')}`);
        
        createMeshAndBodyForObject(obj);
        console.log(`[Network] Объект ${message.id} создан и добавлен в сцену`);
        console.log(`[Network] Обновленное состояние objects после создания: ${Object.keys(objects).length} объектов, ключи: ${Object.keys(objects).join(', ')}`);
    }
    else if (message.type === "update") {
        const obj = objects[message.id];
        
        if (!obj) {
            console.warn(`[Network] Не найден объект ${message.id} для обновления`);
            return;
        }
        
        if (obj.mesh) {
            if (message.position) {
                obj.mesh.position.set(
                    message.position.x || obj.mesh.position.x,
                    message.position.y || obj.mesh.position.y,
                    message.position.z || obj.mesh.position.z
                );
            }
            
            if (message.rotation) {
                obj.mesh.rotation.set(
                    message.rotation.x || obj.mesh.rotation.x,
                    message.rotation.y || obj.mesh.rotation.y,
                    message.rotation.z || obj.mesh.rotation.z
                );
            }
        }
    }
    else if (message.type === "command") {
        console.log("[Network] Получена команда от сервера:", message.cmd);
        
        if (message.cmd === "create" && message.data) {
            try {
                const playerData = JSON.parse(message.data);
                
                if (!objects["mainPlayer"]) {
                    const playerObj = {
                        id: "mainPlayer",
                        object_type: "sphere",
                        x: playerData.x || 0,
                        y: playerData.y || 1,
                        z: playerData.z || 0,
                        mass: playerData.mass || 1,
                        radius: playerData.radius || 1,
                        color: playerData.color || "#ff0000"
                    };
                    
                    objects["mainPlayer"] = playerObj;
                    createMeshAndBodyForObject(playerObj);
                    console.log("[Network] Создан игрок по команде сервера:", playerObj);
                }
            } catch (error) {
                console.error("[Network] Ошибка создания игрока по команде:", error);
            }
        } 
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

    if (cmd && socket && socket.readyState === WebSocket.OPEN) {
        console.log("[Network] Отправка команды:", cmd);
        sendCommand(cmd, "");
        
        applyImpulseToSphere(cmd);
    } else if (cmd) {
        console.warn("[Network] Не удалось отправить команду: WebSocket не готов");
        
        // Если нет соединения с сервером, всё равно применяем импульс
        applyImpulseToSphere(cmd);
    }
}

document.addEventListener("keydown", handleKeyPress);