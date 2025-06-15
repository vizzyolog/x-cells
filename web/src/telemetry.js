// Профессиональная клиентская телеметрия
export class ClientTelemetry {
    constructor() {
        this.enabled = true;
        this.verboseMode = false; // Подробный режим по умолчанию выключен
        this.data = [];
        this.maxEntries = 200; // Храним последние 200 записей
        this.counters = {};
        this.lastPrint = Date.now();
        this.printInterval = 5000; // Выводим статистику каждые 5 секунд (было 2)
        
        // Кэш для отслеживания изменений
        this.lastStates = new Map();
        
        // console.log('🔬 [ClientTelemetry] Клиентская телеметрия инициализирована (тихий режим)');
        // console.log('💡 Команды: enableVerboseTelemetry() / disableVerboseTelemetry()');
    }

    // Логирование состояния объекта
    logObjectState(objectId, objectType, physicsType, position, velocity, mass, radius, source = 'client') {
        if (!this.enabled) return;

        const speed = this.calculateSpeed(velocity);
        
        const entry = {
            timestamp: Date.now(),
            objectId,
            objectType,
            physicsType,
            position: { ...position },
            velocity: { ...velocity },
            mass,
            radius,
            speed,
            source
        };

        this.data.push(entry);
        
        // Ограничиваем размер буфера
        if (this.data.length > this.maxEntries) {
            this.data.shift();
        }

        // Обновляем счетчики
        const key = `${objectType}_${physicsType}`;
        this.counters[key] = (this.counters[key] || 0) + 1;

        // Проверяем нужно ли печатать сводку
        this.checkPrintSummary();
    }

    // Логирование применения импульса
    logImpulse(objectId, objectType, physicsType, position, velocity, mass, radius, impulse, source = 'client') {
        if (!this.enabled) return;

        const speed = this.calculateSpeed(velocity);
        
        const entry = {
            timestamp: Date.now(),
            objectId,
            objectType,
            physicsType,
            position: { ...position },
            velocity: { ...velocity },
            mass,
            radius,
            speed,
            appliedImpulse: { ...impulse },
            source
        };

        this.data.push(entry);
        
        // Ограничиваем размер буфера
        if (this.data.length > this.maxEntries) {
            this.data.shift();
        }

        // Обновляем счетчики
        this.counters[`impulse_${objectType}`] = (this.counters[`impulse_${objectType}`] || 0) + 1;

        // Проверяем нужно ли печатать сводку
        this.checkPrintSummary();
    }

    // Логирование коррекции позиции
    logCorrection(objectId, currentPos, targetPos, correctionType, distance) {
        if (!this.enabled) return;

        const entry = {
            timestamp: Date.now(),
            objectId,
            objectType: 'player', // Коррекции обычно для игроков
            eventType: 'correction',
            currentPos: { ...currentPos },
            targetPos: { ...targetPos },
            correctionType, // 'smooth', 'hard', 'teleport'
            distance,
            source: 'client'
        };

        this.data.push(entry);
        
        if (this.data.length > this.maxEntries) {
            this.data.shift();
        }

        this.counters[`correction_${correctionType}`] = (this.counters[`correction_${correctionType}`] || 0) + 1;
        this.checkPrintSummary();
    }

    // Логирование команды клиента
    logClientCommand(direction, distance, force) {
        if (!this.enabled) return;

        const entry = {
            timestamp: Date.now(),
            eventType: 'client_command',
            direction: { ...direction },
            distance,
            force: force ? { ...force } : null,
            source: 'client'
        };

        this.data.push(entry);
        
        if (this.data.length > this.maxEntries) {
            this.data.shift();
        }

        this.counters['client_commands'] = (this.counters['client_commands'] || 0) + 1;
        this.checkPrintSummary();
    }

    // Логирование обновления с сервера
    logServerUpdate(objectId, position, velocity, hasGarbageData = false) {
        if (!this.enabled) return;

        const entry = {
            timestamp: Date.now(),
            objectId,
            eventType: 'server_update',
            position: position ? { ...position } : null,
            velocity: velocity ? { ...velocity } : null,
            hasGarbageData,
            source: 'server'
        };

        this.data.push(entry);
        
        if (this.data.length > this.maxEntries) {
            this.data.shift();
        }

        const key = hasGarbageData ? 'server_updates_garbage' : 'server_updates_valid';
        this.counters[key] = (this.counters[key] || 0) + 1;
        this.checkPrintSummary();
    }

    // Проверка нужно ли печатать сводку
    checkPrintSummary() {
        const now = Date.now();
        if (now - this.lastPrint >= this.printInterval) {
            this.printSummary();
            this.lastPrint = now;
        }
    }

    // Печать сводки телеметрии
    printSummary() {
        if (!this.enabled) return;

        if (this.verboseMode) {
            // Подробный режим
            // console.log('🔬 [ClientTelemetry] ===== КЛИЕНТСКАЯ ТЕЛЕМЕТРИЯ =====');
            // console.log(`📊 [ClientTelemetry] Всего записей: ${this.data.length}`);

            // Статистика по счетчикам
            // for (const [key, count] of Object.entries(this.counters)) {
            //     console.log(`📈 [ClientTelemetry] ${key}: ${count}`);
            // }

            // Последние данные по игрокам
            this.printRecentPlayerData();

            // Анализ проблем
            this.analyzeIssues();
            
            // console.log('🔬 [ClientTelemetry] ===================================');
        } else {
            // Краткий режим - только проблемы
            this.printCompactSummary();
        }

        // Сброс счетчиков
        this.counters = {};
    }

    // Краткая сводка (только проблемы)
    printCompactSummary() {
        const recentTime = Date.now() - this.printInterval;
        const recentData = this.data.filter(entry => entry.timestamp > recentTime);
        
        // Считаем только основные метрики
        const corrections = recentData.filter(entry => entry.eventType === 'correction').length;
        const garbageUpdates = recentData.filter(entry => 
            entry.eventType === 'server_update' && entry.hasGarbageData
        ).length;
        
        // Показываем только если есть проблемы
        if (corrections > 10 || garbageUpdates > 0) {
            // console.warn(`🔬 [ClientTelemetry] Проблемы: коррекций ${corrections}, мусорных данных ${garbageUpdates}`);
            
            // Анализ только серьезных проблем
            this.analyzeIssues();
        } else {
            // Просто тихий индикатор что телеметрия работает
            // console.log(`🔬 [ClientTelemetry] ОК (записей: ${this.data.length})`);
        }
    }

    // Печать данных о последних состояниях игроков
    printRecentPlayerData() {
        // Собираем последние данные по каждому игроку
        const playerData = new Map();
        
        for (let i = this.data.length - 1; i >= 0; i--) {
            const entry = this.data[i];
            if (entry.objectType === 'player' && entry.position && !playerData.has(entry.objectId)) {
                playerData.set(entry.objectId, entry);
            }
        }

        for (const [playerId, data] of playerData) {
            // Конвертируем timestamp в читаемое время
            const timestamp = new Date(data.timestamp);
            const timeStr = timestamp.toLocaleTimeString('ru-RU', { 
                hour12: false, 
                hour: '2-digit', 
                minute: '2-digit', 
                second: '2-digit',
                fractionalSecondDigits: 3 
            });
            
            // console.log(`🎮 [ClientTelemetry] Игрок ${playerId} [${timeStr}]:`);
            // console.log(`   📍 Позиция: (${data.position.x.toFixed(2)}, ${data.position.y.toFixed(2)}, ${data.position.z.toFixed(2)})`);
            
            if (data.velocity) {
                // console.log(`   🏃 Скорость: (${data.velocity.x.toFixed(2)}, ${data.velocity.y.toFixed(2)}, ${data.velocity.z.toFixed(2)}) |${data.speed.toFixed(2)}|`);
            }
            
            if (data.mass !== undefined) {
                // console.log(`   ⚖️  Масса: ${data.mass.toFixed(2)} кг, Радиус: ${data.radius.toFixed(2)}`);
            }
            
            // console.log(`   🔧 Физика: ${data.physicsType}, Источник: ${data.source}`);
            // console.log(`   ⏰ Временная метка: ${data.timestamp}`);
            
            if (data.appliedImpulse) {
                // console.log(`   💥 Импульс: (${data.appliedImpulse.x.toFixed(2)}, ${data.appliedImpulse.y.toFixed(2)}, ${data.appliedImpulse.z.toFixed(2)})`);
            }
        }
    }

    // Анализ проблем
    analyzeIssues() {
        const recentTime = Date.now() - this.printInterval;
        const recentData = this.data.filter(entry => entry.timestamp > recentTime);

        // Анализ мусорных данных с сервера
        const garbageUpdates = recentData.filter(entry => 
            entry.eventType === 'server_update' && entry.hasGarbageData
        );
        
        if (garbageUpdates.length > 0) {
            // console.warn(`⚠️  [ClientTelemetry] Обнаружено ${garbageUpdates.length} мусорных обновлений с сервера`);
        }

        // Анализ коррекций
        const corrections = recentData.filter(entry => entry.eventType === 'correction');
        if (corrections.length > 0) {
            const avgDistance = corrections.reduce((sum, c) => sum + c.distance, 0) / corrections.length;
            // console.warn(`🔧 [ClientTelemetry] ${corrections.length} коррекций, средняя дистанция: ${avgDistance.toFixed(2)}`);
            
            // Показываем самые большие коррекции
            const bigCorrections = corrections.filter(c => c.distance > 5.0);
            if (bigCorrections.length > 0) {
                // console.warn(`🚨 [ClientTelemetry] ${bigCorrections.length} больших коррекций (>5.0 единиц)`);
            }
        }

        // Анализ скорости обновлений
        const serverUpdates = recentData.filter(entry => entry.eventType === 'server_update');
        const clientCommands = recentData.filter(entry => entry.eventType === 'client_command');
        
        if (serverUpdates.length > 100) {
            // console.warn(`📈 [ClientTelemetry] Высокая частота серверных обновлений: ${serverUpdates.length}/2сек`);
        }
        
        if (clientCommands.length > 50) {
            // console.warn(`📈 [ClientTelemetry] Высокая частота клиентских команд: ${clientCommands.length}/2сек`);
        }

        // Анализ временных расхождений
        this.analyzeTimeDiscrepancies(recentData);
    }

    // Анализ временных расхождений между клиентом и сервером
    analyzeTimeDiscrepancies(recentData) {
        const clientStates = recentData.filter(entry => 
            entry.objectType === 'player' && entry.source === 'client'
        );
        const serverStates = recentData.filter(entry => 
            entry.objectType === 'player' && entry.source === 'server'
        );

        if (clientStates.length > 0 && serverStates.length > 0) {
            // Сравниваем времена последних состояний
            const latestClient = clientStates[clientStates.length - 1];
            const latestServer = serverStates[serverStates.length - 1];
            
            const timeDiff = Math.abs(latestClient.timestamp - latestServer.timestamp);
            
            if (timeDiff > 1000) { // Больше 1 секунды расхождение
                // console.warn(`⏰ [ClientTelemetry] Большое временное расхождение: ${timeDiff}мс`);
            }

            // Анализ расхождений позиций
            if (latestClient.position && latestServer.position) {
                const posDiff = Math.sqrt(
                    Math.pow(latestClient.position.x - latestServer.position.x, 2) +
                    Math.pow(latestClient.position.y - latestServer.position.y, 2) +
                    Math.pow(latestClient.position.z - latestServer.position.z, 2)
                );
                
                if (posDiff > 2.0) {
                    // console.warn(`📍 [ClientTelemetry] Расхождение позиций клиент-сервер: ${posDiff.toFixed(2)} единиц`);
                    // console.log(`   Клиент: (${latestClient.position.x.toFixed(2)}, ${latestClient.position.y.toFixed(2)}, ${latestClient.position.z.toFixed(2)})`);
                    // console.log(`   Сервер: (${latestServer.position.x.toFixed(2)}, ${latestServer.position.y.toFixed(2)}, ${latestServer.position.z.toFixed(2)})`);
                }
            }
        }
    }

    // Вычисление модуля скорости
    calculateSpeed(velocity) {
        if (!velocity) return 0;
        return Math.sqrt(velocity.x * velocity.x + velocity.y * velocity.y + velocity.z * velocity.z);
    }

    // Включение/выключение телеметрии
    setEnabled(enabled) {
        this.enabled = enabled;
        // console.log(`🔬 [ClientTelemetry] Телеметрия ${enabled ? 'включена' : 'выключена'}`);
    }

    // Включение/выключение подробного режима
    setVerboseMode(verbose) {
        this.verboseMode = verbose;
        // console.log(`🔬 [ClientTelemetry] ${verbose ? 'Подробный' : 'Тихий'} режим включен`);
    }

    // Очистка данных
    clear() {
        this.data = [];
        this.counters = {};
        this.lastStates.clear();
        // console.log('🔬 [ClientTelemetry] Данные телеметрии очищены');
    }

    // Экспорт данных в JSON
    exportJSON() {
        return JSON.stringify(this.data, null, 2);
    }

    // Экспорт данных в формате совместимом с серверной телеметрией
    exportForComparison() {
        const compatibleData = this.data.map(entry => ({
            timestamp: entry.timestamp,
            object_id: entry.objectId,
            object_type: entry.objectType,
            physics_type: entry.physicsType,
            position: entry.position,
            velocity: entry.velocity,
            mass: entry.mass,
            radius: entry.radius,
            speed: entry.speed,
            applied_impulse: entry.appliedImpulse,
            source: entry.source,
            event_type: entry.eventType,
            correction_type: entry.correctionType,
            distance: entry.distance
        }));
        
        return JSON.stringify(compatibleData, null, 2);
    }

    // Получение статистики
    getStats() {
        const now = Date.now();
        const last5sec = this.data.filter(entry => now - entry.timestamp < 5000);
        
        return {
            totalEntries: this.data.length,
            entriesLast5sec: last5sec.length,
            counters: { ...this.counters },
            enabled: this.enabled
        };
    }
}

// Глобальный экземпляр телеметрии
export const clientTelemetry = new ClientTelemetry();

// Интеграция с визуальным интерфейсом
let telemetryUI = null;

// Добавляем интеграцию с UI, если он доступен
function integrateWithUI() {
    if (window.telemetryUI && !telemetryUI) {
        telemetryUI = window.telemetryUI;
        // console.log('🖥️ [ClientTelemetry] Интеграция с визуальным интерфейсом включена');
    }
}

// Переопределяем методы логирования для интеграции с UI
const originalLogCorrection = clientTelemetry.logCorrection.bind(clientTelemetry);
clientTelemetry.logCorrection = function(objectId, currentPos, targetPos, correctionType, distance) {
    originalLogCorrection(objectId, currentPos, targetPos, correctionType, distance);
    
    if (telemetryUI) {
        telemetryUI.logCorrection(objectId, currentPos, targetPos, correctionType, distance);
    }
};

const originalLogServerUpdate = clientTelemetry.logServerUpdate.bind(clientTelemetry);
clientTelemetry.logServerUpdate = function(objectId, position, velocity, hasGarbageData = false) {
    originalLogServerUpdate(objectId, position, velocity, hasGarbageData);
    
    if (telemetryUI) {
        telemetryUI.logServerUpdate(objectId, position, velocity, hasGarbageData);
    }
};

const originalLogClientCommand = clientTelemetry.logClientCommand.bind(clientTelemetry);
clientTelemetry.logClientCommand = function(direction, distance, force) {
    originalLogClientCommand(direction, distance, force);
    
    if (telemetryUI) {
        telemetryUI.logClientCommand(direction, distance, force);
    }
};

const originalLogObjectState = clientTelemetry.logObjectState.bind(clientTelemetry);
clientTelemetry.logObjectState = function(objectId, objectType, physicsType, position, velocity, mass, radius, source = 'client') {
    originalLogObjectState(objectId, objectType, physicsType, position, velocity, mass, radius, source);
    
    if (telemetryUI) {
        const speed = this.calculateSpeed(velocity);
        telemetryUI.addDetailedEntry('object-state', {
            objectId,
            objectType,
            physicsType,
            position,
            velocity,
            mass,
            radius,
            speed,
            source
        });
    }
};

const originalLogImpulse = clientTelemetry.logImpulse.bind(clientTelemetry);
clientTelemetry.logImpulse = function(objectId, objectType, physicsType, position, velocity, mass, radius, impulse, source = 'client') {
    originalLogImpulse(objectId, objectType, physicsType, position, velocity, mass, radius, impulse, source);
    
    if (telemetryUI) {
        telemetryUI.addDetailedEntry('object-state', {
            objectId,
            objectType,
            physicsType,
            position,
            velocity,
            mass,
            radius,
            speed: this.calculateSpeed(velocity),
            appliedImpulse: impulse,
            source
        });
    }
};

const originalPrintSummary = clientTelemetry.printSummary.bind(clientTelemetry);
clientTelemetry.printSummary = function() {
    originalPrintSummary();
    
    if (telemetryUI) {
        const stats = clientTelemetry.getStats();
        telemetryUI.logSummary(stats);
    }
};

// Пытаемся интегрироваться с UI при загрузке и через таймер
setTimeout(integrateWithUI, 100);
setInterval(() => {
    if (!telemetryUI) integrateWithUI();
}, 1000);

// Консольные команды для удобства
window.enableClientTelemetry = () => clientTelemetry.setEnabled(true);
window.disableClientTelemetry = () => clientTelemetry.setEnabled(false);
window.enableVerboseTelemetry = () => clientTelemetry.setVerboseMode(true);
window.disableVerboseTelemetry = () => clientTelemetry.setVerboseMode(false);
window.clearClientTelemetry = () => clientTelemetry.clear();
window.exportClientTelemetry = () => {
    // console.log(clientTelemetry.exportJSON());
    return clientTelemetry.exportJSON();
};
window.clientTelemetryStats = () => {
    // console.log(clientTelemetry.getStats());
    return clientTelemetry.getStats();
};
window.exportClientTelemetryForComparison = () => {
    // console.log(clientTelemetry.exportForComparison());
    return clientTelemetry.exportForComparison();
}; 