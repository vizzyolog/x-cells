// gamepad.js
import * as THREE from 'three';

let lastDirection = new THREE.Vector3(); // Последнее отправленное направление
let arrowHelper; // Объявляем arrowHelper вне функции initGamepad

// Функция для инициализации модуля
function initGamepad(camera, terrainMesh, playerMesh, socket, scene) {
    console.warn("playerMesh in gamepad.js", playerMesh);

    // Создаем ArrowHelper для визуализации вектора направления
    arrowHelper = new THREE.ArrowHelper(new THREE.Vector3(), playerMesh.position, 5, 0xffff00);
    scene.add(arrowHelper); // Добавляем ArrowHelper в сцену

    // Функция для обработки события mousemove
    function onMouseMove(event) {
        const mouseX = (event.clientX / window.innerWidth) * 2 - 1;
        const mouseY = -(event.clientY / window.innerHeight) * 2 + 1;

        const mouseVector = new THREE.Vector3(mouseX, mouseY, 0.5);
        mouseVector.unproject(camera);

        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(new THREE.Vector2(mouseX, mouseY), camera);

        const intersects = raycaster.intersectObject(terrainMesh);

        if (intersects.length > 0) {
            const intersectPoint = intersects[0].point;
            console.warn("playerMesh.position", playerMesh.position);
            const direction = new THREE.Vector3().subVectors(intersectPoint, playerMesh.position); // Не нормализуем вектор

            const length = direction.length(); // Вычисляем длину вектора

            // Обновляем ArrowHelper
            arrowHelper.setDirection(direction.clone().normalize()); // Нормализуем вектор для направления
            arrowHelper.setLength(length); // Устанавливаем длину стрелки
            arrowHelper.position.copy(playerMesh.position);

            // Проверяем, изменилось ли направление
            if (!direction.equals(lastDirection)) {
                lastDirection.copy(direction);

                // Отправляем направление на сервер
                sendDirectionToServer(direction.clone().normalize(), socket); // Нормализуем вектор для отправки
            }
        }
    }

    // Функция для отправки направления на сервер
    function sendDirectionToServer(direction, socket) {
        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({
                type: 'cmd',
                cmd: 'MOVE',
                data: {
                    x: direction.x,
                    y: direction.y,
                    z: direction.z
                },
                client_time: Date.now(),
                object_id: 'mainPlayer1'
            }));
        } else {
            console.error('WebSocket не подключен');
        }
    }

    // Добавляем обработчик события mousemove
    window.addEventListener('mousemove', onMouseMove);
}

// Функция для обновления ArrowHelper
function updateArrowHelper(playerMesh) {
    if (arrowHelper) {
        arrowHelper.position.copy(playerMesh.position);
        arrowHelper.setDirection(lastDirection.clone().normalize()); // Нормализуем вектор
        arrowHelper.setLength(lastDirection.length()); // Устанавливаем длину стрелки
    }
}

// Экспортируем функции
export { initGamepad, updateArrowHelper };