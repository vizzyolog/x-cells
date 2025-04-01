import * as THREE from 'three';

let arrowHelper;
let lastSentPosition = new THREE.Vector3();
let sendInterval = 200; // Интервал отправки в миллисекундах
let lastSendTime = 0;

function initGamepad(camera, terrainMesh, playerMesh, socket, scene) {
    arrowHelper = new THREE.ArrowHelper(new THREE.Vector3(), playerMesh.position, 5, 0xffff00);
    scene.add(arrowHelper);

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

            const currentTime = Date.now();
            if (currentTime - lastSendTime >= sendInterval) {
                if (!intersectPoint.equals(lastSentPosition)) {
                    sendPositionToServer(intersectPoint, socket);
                    lastSentPosition.copy(intersectPoint);
                }
                lastSendTime = currentTime;
            }

            const direction = new THREE.Vector3().subVectors(intersectPoint, playerMesh.position);
            const length = direction.length();
            arrowHelper.setDirection(direction.clone().normalize());
            arrowHelper.setLength(length);
            arrowHelper.position.copy(playerMesh.position);
        }
    }

    function sendPositionToServer(position, socket) {
        console.warn("Отправляю позицию на сервер:", position);
        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({
                type: 'cmd',
                cmd: 'MOVE',
                data: {
                    x: position.x,
                    y: position.y,
                    z: position.z
                },
                client_time: Date.now(),
                object_id: 'mainPlayer1'
            }));
        } else {
            console.error('WebSocket не подключен');
        }
    }

    window.addEventListener('mousemove', onMouseMove);
}

function updateArrowHelper(playerMesh) {
    if (arrowHelper) {
        arrowHelper.position.copy(playerMesh.position);
        arrowHelper.setDirection(new THREE.Vector3().subVectors(lastSentPosition, playerMesh.position).normalize());
        arrowHelper.setLength(new THREE.Vector3().subVectors(lastSentPosition, playerMesh.position).length());
    }
}

export { initGamepad, updateArrowHelper };