// objects.js
import * as THREE from 'three';
import { scene } from './scene';
import { localPhysicsWorld } from './physics';

export let objects = {}; // Словарь объектов: id -> { mesh, body, serverPos, ... }

export function createMeshAndBodyForObject(obj) {
    console.log("[Objects] Создание объекта:", obj.object_type, obj.id);

    let mesh;
    switch (obj.object_type) {
        case "terrain":
            mesh = createTerrainMesh(obj);
            break;
        case "sphere": {
            const geometry = new THREE.SphereGeometry(obj.radius || 1);
            const material = new THREE.MeshPhongMaterial({ color: obj.color || 0xff0000 });
            mesh = new THREE.Mesh(geometry, material);
            console.log("[Objects] Создан меш для сферы:", mesh);
            break;
        }
        case "tree":
            mesh = createTreeMesh(obj);
            break;
        default:
            console.warn(`Unknown object type: ${obj.object_type}`);
            mesh = createDefaultMesh(obj);
            break;
    }

    if (mesh) {
        mesh.position.set(obj.x || 0, obj.y || 0, obj.z || 0);
        scene.add(mesh);
        obj.mesh = mesh;
        console.log("[Objects] Добавлен меш к объекту:", obj.id, obj.mesh);
    }

    return obj;
}

function createTerrainMesh(obj) {
    const geometry = new THREE.PlaneGeometry(
        obj.scale_x * obj.heightmap_w,
        obj.scale_z * obj.heightmap_h,
        obj.heightmap_w - 1,
        obj.heightmap_h - 1
    );

    // Поворачиваем плоскость в горизонтальное положение
    geometry.rotateX(-Math.PI / 2);

    // Применяем данные высот напрямую
    const vertices = geometry.attributes.position.array;
    for (let i = 0; i < obj.heightmap_h; i++) {
        for (let j = 0; j < obj.heightmap_w; j++) {
            const index = (i * obj.heightmap_w + j);
            const vertex_index = index * 3;
            vertices[vertex_index + 1] = obj.height_data[index] * obj.scale_y;
        }
    }

    // Пересчитываем нормали для правильного освещения
    geometry.computeVertexNormals();

    // Создаем материал
    const material = new THREE.MeshPhongMaterial({
        color: obj.color || 0xC7C7C7,
        side: THREE.DoubleSide,
        wireframe: false,
        flatShading: true
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.receiveShadow = true;
    mesh.castShadow = true;

    return mesh;
}

export function createSphereMesh(data) {
    const geo = new THREE.SphereGeometry(data.radius || 1, 16, 16);
    return new THREE.Mesh(
        geo,
        new THREE.MeshLambertMaterial({ color: parseColor(data.color || "#888888") })
    );
}

function createTreeMesh(data) {
    const group = new THREE.Group();

    if (data.branches && Array.isArray(data.branches)) {
        data.branches.forEach((branch, index) => {
            if (
                branch.startX === undefined ||
                branch.startY === undefined ||
                branch.startZ === undefined ||
                branch.endX === undefined ||
                branch.endY === undefined ||
                branch.endZ === undefined
            ) {
                console.warn(
                    `Branch coordinates are missing or invalid at index ${index}:`,
                    branch
                );
                return;
            }

            const branchGeo = new THREE.CylinderGeometry(
                branch.radiusTop || branch.radius || 0.1,    // верхний радиус
                branch.radiusBottom || branch.radius || 0.2, // нижний радиус
                1,
                8
            );
            const branchMat = new THREE.MeshStandardMaterial({
                color: parseColor(branch.color || "#654321"),
            });
            const branchMesh = new THREE.Mesh(branchGeo, branchMat);

            const midX = (branch.startX + branch.endX) / 2;
            const midY = (branch.startY + branch.endY) / 2;
            const midZ = (branch.startZ + branch.endZ) / 2;

            branchMesh.position.set(midX, midY, midZ);
            branchMesh.lookAt(new THREE.Vector3(branch.endX, branch.endY, branch.endZ));

            const length = new THREE.Vector3(
                branch.endX - branch.startX,
                branch.endY - branch.startY,
                branch.endZ - branch.startZ
            ).length();

            branchMesh.scale.set(1, length, 1);

            group.add(branchMesh);
        });
    }

    return group;
}

function createDefaultMesh(data) {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    return new THREE.Mesh(
        geo,
        new THREE.MeshLambertMaterial({ color: parseColor(data.color || "#888888") })
    );
}

function createPhysicsBodyForSphere(data) {
    try {
        if (typeof Ammo === 'undefined') {
            console.error('Ammo.js не инициализирован');
            return null;
        }

        if (!localPhysicsWorld) {
            console.error('Физический мир не инициализирован');
            return null;
        }

        const radius = data.radius || 1;
        const mass = data.mass || 1;

        // Создаем все Ammo объекты через window.Ammo
        const shape = new window.Ammo.btSphereShape(radius);
        const transform = new window.Ammo.btTransform();
        transform.setIdentity();
        transform.setOrigin(new window.Ammo.btVector3(data.x || 0, data.y || 0, data.z || 0));

        const localInertia = new window.Ammo.btVector3(0, 0, 0);
        shape.calculateLocalInertia(mass, localInertia);

        const motionState = new window.Ammo.btDefaultMotionState(transform);
        const rbInfo = new window.Ammo.btRigidBodyConstructionInfo(
            mass,
            motionState,
            shape,
            localInertia
        );
        const body = new window.Ammo.btRigidBody(rbInfo);

        localPhysicsWorld.addRigidBody(body);

        // Очистка памяти
        window.Ammo.destroy(rbInfo);
        window.Ammo.destroy(localInertia);

        return body;
    } catch (error) {
        console.error('Ошибка при создании физического тела:', error);
        return null;
    }
}

function parseColor(colorStr) {
    if (!colorStr) return 0x888888;
    if (colorStr.startsWith("#")) {
        return parseInt(colorStr.slice(1), 16);
    }
    return 0x888888;
}