// gamepad.js
import * as THREE from 'three';

// Функция для инициализации модуля
function initGamepad(camera, terrainMesh, playerMesh, socket) {
    let lastDirection = new THREE.Vector3(); // Последнее отправленное направление

    // Функция для обработки события mousemove
    function onMouseMove(event) {

        console.warn("event.clientX",event.clientX)
        const mouseX = (event.clientX / window.innerWidth) * 2 - 1;
        const mouseY = -(event.clientY / window.innerHeight) * 2 + 1;
    
        const mouseVector = new THREE.Vector3(mouseX, mouseY, 0.5);
        mouseVector.unproject(camera);
     
        const raycaster = new THREE.Raycaster(); // Создаем raycaster без параметров.
        raycaster.setFromCamera(new THREE.Vector2(mouseX, mouseY), camera); // Устанавливаем параметры raycaster из позиции курсора и камеры.
        
        const intersects = raycaster.intersectObject(terrainMesh);
        console.log("intersects:", intersects);

        if (intersects.length > 0) {
            const intersectPoint = intersects[0].point;
            const direction = new THREE.Vector3().subVectors(intersectPoint, playerMesh.position).normalize();

            // Проверяем, изменилось ли направление
            if (!direction.equals(lastDirection)) {
                lastDirection.copy(direction);

                // Отправляем направление на сервер
                sendDirectionToServer(direction, socket);
                console.warn("direction", direction)
            }
        }
        window.addEventListener('mousemove', onMouseMove.bind({ camera, terrainMesh, playerMesh, socket }));
    }

    // Функция для отправки направления на сервер
    function sendDirectionToServer(direction, socket) {
        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({
                type: 'move',
                direction: {
                    x: direction.x,
                    y: direction.y,
                    z: direction.z
                }
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