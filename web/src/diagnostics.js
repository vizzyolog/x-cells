// Система диагностики движения
export class MovementDiagnostics {
    constructor() {
        this.enabled = false;
        this.logs = [];
        this.maxLogs = 50; // Храним последние 50 записей
        this.stats = {
            clientCommands: 0,
            serverUpdates: 0,
            localImpulses: 0,
            corrections: 0,
            teleports: 0
        };
        this.lastPrintTime = 0;
        this.printInterval = 2000; // Печатаем статистику каждые 2 секунды
    }

    enable() {
        this.enabled = true;
        console.log('[Diagnostics] 🔍 Диагностика движения включена');
    }

    disable() {
        this.enabled = false;
        console.log('[Diagnostics] Диагностика движения выключена');
    }

    log(category, data) {
        if (!this.enabled) return;

        const timestamp = Date.now();
        const entry = {
            timestamp,
            category,
            data: { ...data }
        };

        this.logs.push(entry);
        
        // Удаляем старые записи
        if (this.logs.length > this.maxLogs) {
            this.logs.shift();
        }

        // Обновляем статистику
        this.stats[category] = (this.stats[category] || 0) + 1;

        // Печатаем сводку периодически
        if (timestamp - this.lastPrintTime > this.printInterval) {
            this.printSummary();
            this.lastPrintTime = timestamp;
        }
    }

    // Отправка команды на сервер
    logClientCommand(direction, distance, playerObjectID) {
        this.log('clientCommands', {
            direction: {
                x: direction.x.toFixed(3),
                y: direction.y.toFixed(3),
                z: direction.z.toFixed(3)
            },
            distance: distance.toFixed(2),
            playerObjectID,
            timestamp: Date.now()
        });
    }

    // Получение обновления с сервера
    logServerUpdate(objectId, position, velocity, timestamp) {
        this.log('serverUpdates', {
            objectId,
            position: {
                x: position.x.toFixed(3),
                y: position.y.toFixed(3),
                z: position.z.toFixed(3)
            },
            velocity: velocity ? {
                x: velocity.x.toFixed(3),
                y: velocity.y.toFixed(3),
                z: velocity.z.toFixed(3),
                magnitude: Math.sqrt(velocity.x**2 + velocity.y**2 + velocity.z**2).toFixed(3)
            } : null,
            serverTimestamp: timestamp,
            clientTime: Date.now()
        });
    }

    // Локальный импульс
    logLocalImpulse(playerObjectID, force, distance) {
        this.log('localImpulses', {
            playerObjectID,
            force: {
                x: force.x.toFixed(4),
                y: force.y.toFixed(4),
                z: force.z.toFixed(4),
                magnitude: Math.sqrt(force.x**2 + force.y**2 + force.z**2).toFixed(4)
            },
            distance: distance.toFixed(2),
            timestamp: Date.now()
        });
    }

    // Коррекция позиции
    logCorrection(objectId, currentPos, targetPos, distance, type) {
        this.log('corrections', {
            objectId,
            currentPos: {
                x: currentPos.x.toFixed(3),
                y: currentPos.y.toFixed(3),
                z: currentPos.z.toFixed(3)
            },
            targetPos: {
                x: targetPos.x.toFixed(3),
                y: targetPos.y.toFixed(3),
                z: targetPos.z.toFixed(3)
            },
            distance: distance.toFixed(3),
            type, // 'smooth', 'hard', 'teleport'
            timestamp: Date.now()
        });
    }

    // Телепортация
    logTeleport(objectId, fromPos, toPos, reason) {
        this.log('teleports', {
            objectId,
            fromPos: {
                x: fromPos.x.toFixed(3),
                y: fromPos.y.toFixed(3),
                z: fromPos.z.toFixed(3)
            },
            toPos: {
                x: toPos.x.toFixed(3),
                y: toPos.y.toFixed(3),
                z: toPos.z.toFixed(3)
            },
            distance: Math.sqrt(
                (toPos.x - fromPos.x)**2 + 
                (toPos.y - fromPos.y)**2 + 
                (toPos.z - fromPos.z)**2
            ).toFixed(3),
            reason,
            timestamp: Date.now()
        });
    }

    printSummary() {
        if (!this.enabled) return;

        console.log('📊 [Diagnostics] Сводка за последние 2 секунды:');
        console.log(`   📤 Команд клиента: ${this.stats.clientCommands || 0}`);
        console.log(`   📥 Обновлений сервера: ${this.stats.serverUpdates || 0}`);
        console.log(`   ⚡ Локальных импульсов: ${this.stats.localImpulses || 0}`);
        console.log(`   🔧 Коррекций: ${this.stats.corrections || 0}`);
        console.log(`   🎯 Телепортаций: ${this.stats.teleports || 0}`);

        // Подробная информация о последних событиях
        this.printDetailedInfo();

        // Сбрасываем статистику
        this.stats = {
            clientCommands: 0,
            serverUpdates: 0,
            localImpulses: 0,
            corrections: 0,
            teleports: 0
        };
    }

    printDetailedInfo() {
        const now = Date.now();
        const recentTime = now - this.printInterval;

        // Последние коррекции (если есть)
        const recentCorrections = this.logs.filter(log => 
            log.category === 'corrections' && log.timestamp > recentTime
        );
        if (recentCorrections.length > 0) {
            console.log('🔧 [Diagnostics] Последние коррекции:');
            recentCorrections.slice(-3).forEach(log => {
                const d = log.data;
                console.log(`   ${d.type.toUpperCase()}: Объект ${d.objectId}, расстояние ${d.distance}, 
   от (${d.currentPos.x}, ${d.currentPos.y}, ${d.currentPos.z}) 
   к  (${d.targetPos.x}, ${d.targetPos.y}, ${d.targetPos.z})`);
            });
        }

        // Последние команды клиента (образцы)
        const recentCommands = this.logs.filter(log => 
            log.category === 'clientCommands' && log.timestamp > recentTime
        );
        if (recentCommands.length > 0) {
            const sample = recentCommands[recentCommands.length - 1].data;
            console.log(`📤 [Diagnostics] Пример команды клиента: направление (${sample.direction.x}, ${sample.direction.y}, ${sample.direction.z}), сила ${sample.distance}`);
        }

        // Последние серверные обновления (образцы)
        const recentUpdates = this.logs.filter(log => 
            log.category === 'serverUpdates' && log.timestamp > recentTime
        );
        if (recentUpdates.length > 0) {
            const sample = recentUpdates[recentUpdates.length - 1].data;
            console.log(`📥 [Diagnostics] Пример обновления сервера: позиция (${sample.position.x}, ${sample.position.y}, ${sample.position.z}), скорость ${sample.velocity?.magnitude || 'н/д'}`);
        }

        // Локальные импульсы (если есть)
        const recentImpulses = this.logs.filter(log => 
            log.category === 'localImpulses' && log.timestamp > recentTime
        );
        if (recentImpulses.length > 0) {
            const sample = recentImpulses[recentImpulses.length - 1].data;
            console.log(`⚡ [Diagnostics] Пример локального импульса: сила ${sample.force.magnitude}, расстояние ${sample.distance}`);
        }

        // Телепортации (если есть)
        const recentTeleports = this.logs.filter(log => 
            log.category === 'teleports' && log.timestamp > recentTime
        );
        if (recentTeleports.length > 0) {
            console.log('🎯 [Diagnostics] Телепортации:');
            recentTeleports.forEach(log => {
                const d = log.data;
                console.log(`   Объект ${d.objectId}: прыжок на ${d.distance} единиц, причина: ${d.reason}`);
            });
        }

        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    }

    // Получить последние записи для отладки
    getRecentLogs(category = null, count = 10) {
        let filtered = this.logs;
        if (category) {
            filtered = this.logs.filter(log => log.category === category);
        }
        return filtered.slice(-count);
    }

    // Экспорт логов для анализа
    exportLogs() {
        return {
            logs: this.logs,
            timestamp: Date.now(),
            stats: { ...this.stats }
        };
    }
}

// Глобальный экземпляр диагностики
export const diagnostics = new MovementDiagnostics();

// Включаем диагностику по умолчанию для тестирования
diagnostics.enable();

// Добавляем в window для доступа из консоли
if (typeof window !== 'undefined') {
    window.diagnostics = diagnostics;
    window.enableDiag = () => diagnostics.enable();
    window.disableDiag = () => diagnostics.disable();
    window.diagLogs = (category, count) => diagnostics.getRecentLogs(category, count);
} 