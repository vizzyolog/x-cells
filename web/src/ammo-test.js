// ammo-test.js
// Простой тест для проверки загрузки Ammo.js

console.log("[AmmoTest] Начало теста Ammo.js");

// Функция для проверки Ammo.js
async function testAmmo() {
    try {
        console.log("[AmmoTest] Проверка наличия AmmoLib в глобальном объекте:", typeof window.AmmoLib);
        
        // Используем AmmoLib, который был загружен в index.html
        if (typeof window.AmmoLib === 'undefined') {
            console.error("[AmmoTest] AmmoLib не найден в глобальном объекте");
            return false;
        }
        
        const AmmoLib = window.AmmoLib;
        console.log("[AmmoTest] AmmoLib успешно получен:", typeof AmmoLib);
        
        // Проверяем, создан ли уже физический мир
        if (window.physicsWorld) {
            console.log("[AmmoTest] Физический мир уже создан в index.html");
            const physicsWorld = window.physicsWorld;
            
            // Создаем сферу для теста
            console.log("[AmmoTest] Создание тестовой сферы...");
            const radius = 1;
            const sphereShape = new AmmoLib.btSphereShape(radius);
            
            // Создаем transform
            const transform = new AmmoLib.btTransform();
            transform.setIdentity();
            transform.setOrigin(new AmmoLib.btVector3(0, 10, 0));
            
            // Создаем rigid body
            const mass = 1;
            const localInertia = new AmmoLib.btVector3(0, 0, 0);
            sphereShape.calculateLocalInertia(mass, localInertia);
            
            const motionState = new AmmoLib.btDefaultMotionState(transform);
            const rbInfo = new AmmoLib.btRigidBodyConstructionInfo(mass, motionState, sphereShape, localInertia);
            const body = new AmmoLib.btRigidBody(rbInfo);
            
            // Добавляем тело в мир
            physicsWorld.addRigidBody(body);
            
            console.log("[AmmoTest] Сфера добавлена в мир");
            
            // Симулируем несколько шагов
            for (let i = 0; i < 5; i++) {
                physicsWorld.stepSimulation(1/60, 1);
                
                const trans = new AmmoLib.btTransform();
                body.getMotionState().getWorldTransform(trans);
                const pos = trans.getOrigin();
                
                console.log(`[AmmoTest] Шаг ${i}: позиция сферы: y = ${pos.y().toFixed(2)}`);
            }
            
            // Удаляем тестовую сферу из мира
            physicsWorld.removeRigidBody(body);
            AmmoLib.destroy(body);
            AmmoLib.destroy(motionState);
            AmmoLib.destroy(rbInfo);
            AmmoLib.destroy(localInertia);
            AmmoLib.destroy(sphereShape);
            AmmoLib.destroy(transform);
            
            console.log("[AmmoTest] Тестовая сфера удалена");
            console.log("[AmmoTest] Тест успешно завершен");
            return true;
        } else {
            console.log("[AmmoTest] Физический мир не найден, создаем новый для теста");
            
            // Создаем простой физический мир для теста
            console.log("[AmmoTest] Создание физического мира...");
            const collisionConfiguration = new AmmoLib.btDefaultCollisionConfiguration();
            const dispatcher = new AmmoLib.btCollisionDispatcher(collisionConfiguration);
            const broadphase = new AmmoLib.btDbvtBroadphase();
            const solver = new AmmoLib.btSequentialImpulseConstraintSolver();
            const physicsWorld = new AmmoLib.btDiscreteDynamicsWorld(
                dispatcher,
                broadphase,
                solver,
                collisionConfiguration
            );
            
            console.log("[AmmoTest] Физический мир создан успешно");
            
            // Устанавливаем гравитацию
            physicsWorld.setGravity(new AmmoLib.btVector3(0, -9.81, 0));
            
            // Создаем сферу
            const radius = 1;
            const sphereShape = new AmmoLib.btSphereShape(radius);
            
            // Создаем transform
            const transform = new AmmoLib.btTransform();
            transform.setIdentity();
            transform.setOrigin(new AmmoLib.btVector3(0, 10, 0));
            
            // Создаем rigid body
            const mass = 1;
            const localInertia = new AmmoLib.btVector3(0, 0, 0);
            sphereShape.calculateLocalInertia(mass, localInertia);
            
            const motionState = new AmmoLib.btDefaultMotionState(transform);
            const rbInfo = new AmmoLib.btRigidBodyConstructionInfo(mass, motionState, sphereShape, localInertia);
            const body = new AmmoLib.btRigidBody(rbInfo);
            
            // Добавляем тело в мир
            physicsWorld.addRigidBody(body);
            
            console.log("[AmmoTest] Сфера добавлена в мир");
            
            // Симулируем несколько шагов
            for (let i = 0; i < 5; i++) {
                physicsWorld.stepSimulation(1/60, 1);
                
                const trans = new AmmoLib.btTransform();
                body.getMotionState().getWorldTransform(trans);
                const pos = trans.getOrigin();
                
                console.log(`[AmmoTest] Шаг ${i}: позиция сферы: y = ${pos.y().toFixed(2)}`);
            }
            
            // Очищаем ресурсы
            physicsWorld.removeRigidBody(body);
            AmmoLib.destroy(body);
            AmmoLib.destroy(motionState);
            AmmoLib.destroy(rbInfo);
            AmmoLib.destroy(localInertia);
            AmmoLib.destroy(sphereShape);
            AmmoLib.destroy(transform);
            AmmoLib.destroy(physicsWorld);
            AmmoLib.destroy(solver);
            AmmoLib.destroy(broadphase);
            AmmoLib.destroy(dispatcher);
            AmmoLib.destroy(collisionConfiguration);
            
            console.log("[AmmoTest] Тест успешно завершен");
            return true;
        }
    } catch (error) {
        console.error("[AmmoTest] Ошибка при тестировании Ammo.js:", error);
        return false;
    }
}

// Запускаем тест
window.addEventListener('load', () => {
    console.log("[AmmoTest] Страница загружена, запускаем тест Ammo.js");
    testAmmo().then(success => {
        console.log("[AmmoTest] Результат теста:", success ? "УСПЕХ" : "ОШИБКА");
    });
});

export { testAmmo }; 