//throttledlog.js

// Система логирования с ограничением частоты
const LOG_INTERVAL = 5000; // 1 секунда между логами
const logTimers = {};

export function throttledLog(category, message, data = null) {
    const now = Date.now();
    
    // Проверяем, прошло ли достаточно времени с последнего лога для этой категории
    if (!logTimers[category] || now - logTimers[category] >= LOG_INTERVAL) {
        // Обновляем таймер для этой категории
        logTimers[category] = now;
        
        // Форматируем и выводим сообщение
        if (data) {
            console.log(`[${category}] ${message}`, data);
        } else {
            console.log(`[${category}] ${message}`);
        }
        
        return true; // Лог был выведен
    }
    
    return false; // Лог был пропущен из-за ограничения частоты
}

// Функция для логирования данных о главном игроке
export function logMainPlayerInfo() {
    const mainPlayer = objects["mainPlayer1"];
    if (!mainPlayer || !mainPlayer.mesh) {
        return;
    }
    
    const pos = mainPlayer.mesh.position;
    
    // Получаем скорость, если доступна физика
    let vel = { x: 0, y: 0, z: 0 };
    if (mainPlayer.body) {
        const velocity = mainPlayer.body.getLinearVelocity();
        vel = { 
            x: velocity.x(),
            y: velocity.y(),
            z: velocity.z()
        };
        window.Ammo.destroy(velocity);
    }
    
    // Выводим в формате, напоминающем C++ вывод
    throttledLog("MainPlayer", 
        `Position: (${pos.x.toFixed(2)}, ${pos.y.toFixed(2)}, ${pos.z.toFixed(2)}), ` +
        `Velocity: (${vel.x.toFixed(2)}, ${vel.y.toFixed(2)}, ${vel.z.toFixed(2)})`
    );
}