// gamepad.js
import * as THREE from 'three';

let lastDirection = new THREE.Vector3(); // Последнее отправленное направление

// Функция для инициализации модуля
function initGamepad(camera, terrainMesh, playerMesh, socket) {
    console.warn("playerMesh in gamepad.js", playerMesh);

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
            console.warn("playerMesh.position", playerMesh.position)
            const direction = new THREE.Vector3().subVectors(intersectPoint, playerMesh.position).normalize();

            // Проверяем, изменилось ли направление
            if (!direction.equals(lastDirection)) {
                lastDirection.copy(direction);

                // Отправляем направление на сервер
                sendDirectionToServer(direction, socket);
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
                client_time: Date.now() // Добавляем временную метку клиента
            }));
        } else {
            console.error('WebSocket не подключен');
        }
    }

    // Добавляем обработчик события mousemove
    window.addEventListener('mousemove', onMouseMove);
}

// Экспортируем функцию initGamepad
export { initGamepad };