// Визуальный интерфейс для телеметрии
class TelemetryUI {
    constructor() {
        this.panel = null;
        this.logContainer = null;
        this.isCollapsed = false;
        this.maxLogEntries = 100;
        this.logEntries = [];
        this.filters = {
            corrections: true,
            updates: true,
            commands: true,
            garbage: true
        };
        
        this.viewMode = 'summary'; // 'summary' или 'detailed'
        this.detailedData = []; // Детальные данные телеметрии
        
        this.isPaused = false;
        
        this.createUI();
        this.setupEventListeners();
    }
    
    createUI() {
        // Создаем основную панель
        this.panel = document.createElement('div');
        this.panel.id = 'telemetry-panel';
        this.panel.innerHTML = `
            <div class="telemetry-header">
                <div class="telemetry-title">
                    <span class="telemetry-icon">🔬</span>
                    <span>Телеметрия</span>
                    <span class="telemetry-status" id="telemetry-status">ОК</span>
                </div>
                <div class="telemetry-controls">
                    <button id="telemetry-mode" title="Переключить режим">📊</button>
                    <button id="telemetry-toggle" title="Свернуть/Развернуть">−</button>
                    <button id="telemetry-clear" title="Очистить">🗑️</button>
                    <button id="telemetry-export" title="Экспорт">💾</button>
                    <button id="telemetry-close" title="Закрыть">×</button>
                </div>
            </div>
            <div class="telemetry-body" id="telemetry-body">
                <div class="telemetry-filters">
                    <label><input type="checkbox" id="filter-corrections" checked> Коррекции</label>
                    <label><input type="checkbox" id="filter-updates" checked> Обновления</label>
                    <label><input type="checkbox" id="filter-commands" checked> Команды</label>
                    <label><input type="checkbox" id="filter-garbage" checked> Мусор</label>
                </div>
                <div class="telemetry-stats" id="telemetry-stats">
                    <div class="stat-item">
                        <span class="stat-label">Коррекций:</span>
                        <span class="stat-value" id="stat-corrections">0</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Обновлений:</span>
                        <span class="stat-value" id="stat-updates">0</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Мусорных:</span>
                        <span class="stat-value" id="stat-garbage">0</span>
                    </div>
                </div>
                <div class="telemetry-content">
                    <div class="telemetry-log" id="telemetry-log"></div>
                    <div class="telemetry-detailed" id="telemetry-detailed" style="display: none;"></div>
                </div>
            </div>
        `;
        
        // Добавляем стили
        this.addStyles();
        
        // Добавляем панель на страницу
        document.body.appendChild(this.panel);
        
        this.logContainer = document.getElementById('telemetry-log');
    }
    
    addStyles() {
        const style = document.createElement('style');
        style.textContent = `
            #telemetry-panel {
                position: fixed;
                top: 20px;
                right: 20px;
                width: 400px;
                max-height: 60vh;
                background: rgba(0, 0, 0, 0.9);
                border: 1px solid #444;
                border-radius: 8px;
                color: #fff;
                font-family: 'Courier New', monospace;
                font-size: 12px;
                z-index: 10000;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
            }
            
            .telemetry-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                background: #333;
                padding: 8px 12px;
                border-radius: 8px 8px 0 0;
                cursor: move;
            }
            
            .telemetry-title {
                display: flex;
                align-items: center;
                gap: 8px;
                font-weight: bold;
            }
            
            .telemetry-status {
                padding: 2px 6px;
                border-radius: 4px;
                font-size: 10px;
                background: #2d5a2d;
                color: #90ee90;
            }
            
            .telemetry-status.warning {
                background: #5a4d2d;
                color: #ffd700;
            }
            
            .telemetry-status.error {
                background: #5a2d2d;
                color: #ff6b6b;
            }
            
            .telemetry-controls {
                display: flex;
                gap: 4px;
            }
            
            .telemetry-controls button {
                background: #555;
                border: none;
                color: #fff;
                padding: 4px 8px;
                border-radius: 4px;
                cursor: pointer;
                font-size: 12px;
            }
            
            .telemetry-controls button:hover {
                background: #666;
            }
            
            .telemetry-body {
                padding: 12px;
                max-height: 50vh;
                overflow: hidden;
                display: flex;
                flex-direction: column;
                gap: 8px;
            }
            
            .telemetry-body.collapsed {
                display: none;
            }
            
            .telemetry-filters {
                display: flex;
                gap: 12px;
                flex-wrap: wrap;
                padding-bottom: 8px;
                border-bottom: 1px solid #444;
            }
            
            .telemetry-filters label {
                display: flex;
                align-items: center;
                gap: 4px;
                cursor: pointer;
                font-size: 11px;
            }
            
            .telemetry-filters input[type="checkbox"] {
                margin: 0;
            }
            
            .telemetry-stats {
                display: flex;
                justify-content: space-between;
                padding: 6px 0;
                background: #1a1a1a;
                border-radius: 4px;
                padding: 8px;
            }
            
            .stat-item {
                text-align: center;
            }
            
            .stat-label {
                display: block;
                font-size: 10px;
                color: #999;
            }
            
            .stat-value {
                display: block;
                font-weight: bold;
                font-size: 14px;
                color: #fff;
            }
            
            .telemetry-content {
                flex: 1;
                overflow: hidden;
                display: flex;
                flex-direction: column;
            }
            
            .telemetry-log, .telemetry-detailed {
                flex: 1;
                overflow-y: auto;
                max-height: 300px;
                padding: 4px;
                background: #111;
                border-radius: 4px;
                border: 1px solid #333;
            }
            
            .log-entry {
                padding: 2px 4px;
                margin: 1px 0;
                border-radius: 2px;
                font-size: 11px;
                line-height: 1.3;
            }
            
            .log-entry.correction {
                background: rgba(255, 107, 107, 0.1);
                border-left: 3px solid #ff6b6b;
            }
            
            .log-entry.update {
                background: rgba(135, 206, 235, 0.1);
                border-left: 3px solid #87ceeb;
            }
            
            .log-entry.command {
                background: rgba(144, 238, 144, 0.1);
                border-left: 3px solid #90ee90;
            }
            
            .log-entry.garbage {
                background: rgba(255, 165, 0, 0.1);
                border-left: 3px solid #ffa500;
            }
            
            .log-entry.summary {
                background: rgba(147, 112, 219, 0.1);
                border-left: 3px solid #9370db;
                font-weight: bold;
            }
            
            .log-timestamp {
                color: #666;
                font-size: 10px;
            }
            
            .log-message {
                color: #fff;
            }
            
            .detailed-entry {
                margin: 4px 0;
                padding: 6px;
                background: #1a1a1a;
                border-radius: 4px;
                border-left: 3px solid #555;
                font-size: 10px;
                line-height: 1.4;
            }
            
            .detailed-entry.object-state {
                border-left-color: #4CAF50;
            }
            
            .detailed-entry.correction {
                border-left-color: #ff6b6b;
            }
            
            .detailed-entry.server-update {
                border-left-color: #87ceeb;
            }
            
            .detailed-entry.client-command {
                border-left-color: #90ee90;
            }
            
            .detailed-header {
                color: #ccc;
                font-weight: bold;
                margin-bottom: 2px;
            }
            
            .detailed-data {
                color: #aaa;
                margin-left: 8px;
            }
            
            .detailed-position {
                color: #ffeb3b;
            }
            
            .detailed-velocity {
                color: #2196f3;
            }
            
            .detailed-timestamp {
                color: #666;
                font-size: 9px;
            }
        `;
        
        document.head.appendChild(style);
    }
    
    setupEventListeners() {
        // Кнопка переключения режима
        document.getElementById('telemetry-mode').addEventListener('click', () => {
            this.toggleViewMode();
        });
        
        // Кнопка сворачивания/разворачивания
        document.getElementById('telemetry-toggle').addEventListener('click', () => {
            this.toggleCollapse();
        });
        
        // Кнопка очистки
        document.getElementById('telemetry-clear').addEventListener('click', () => {
            this.clearLog();
        });
        
        // Кнопка экспорта
        document.getElementById('telemetry-export').addEventListener('click', () => {
            this.exportData();
        });
        
        // Кнопка закрытия
        document.getElementById('telemetry-close').addEventListener('click', () => {
            this.hide();
        });
        
        // Фильтры
        document.getElementById('filter-corrections').addEventListener('change', (e) => {
            this.filters.corrections = e.target.checked;
            this.applyFilters();
        });
        
        document.getElementById('filter-updates').addEventListener('change', (e) => {
            this.filters.updates = e.target.checked;
            this.applyFilters();
        });
        
        document.getElementById('filter-commands').addEventListener('change', (e) => {
            this.filters.commands = e.target.checked;
            this.applyFilters();
        });
        
        document.getElementById('filter-garbage').addEventListener('change', (e) => {
            this.filters.garbage = e.target.checked;
            this.applyFilters();
        });
        
        // Делаем панель перетаскиваемой
        this.makeDraggable();
    }
    
    makeDraggable() {
        const header = this.panel.querySelector('.telemetry-header');
        let isDragging = false;
        let currentX, currentY, initialX, initialY;
        
        header.addEventListener('mousedown', (e) => {
            isDragging = true;
            initialX = e.clientX - this.panel.offsetLeft;
            initialY = e.clientY - this.panel.offsetTop;
        });
        
        document.addEventListener('mousemove', (e) => {
            if (isDragging) {
                e.preventDefault();
                currentX = e.clientX - initialX;
                currentY = e.clientY - initialY;
                
                this.panel.style.left = currentX + 'px';
                this.panel.style.top = currentY + 'px';
                this.panel.style.right = 'auto';
            }
        });
        
        document.addEventListener('mouseup', () => {
            isDragging = false;
        });
    }
    
    toggleViewMode() {
        const logContainer = document.getElementById('telemetry-log');
        const detailedContainer = document.getElementById('telemetry-detailed');
        const modeButton = document.getElementById('telemetry-mode');
        
        this.viewMode = this.viewMode === 'summary' ? 'detailed' : 'summary';
        
        if (this.viewMode === 'detailed') {
            logContainer.style.display = 'none';
            detailedContainer.style.display = 'block';
            modeButton.textContent = '📈';
            modeButton.title = 'Сводный режим';
            this.renderDetailedView();
        } else {
            logContainer.style.display = 'block';
            detailedContainer.style.display = 'none';
            modeButton.textContent = '📊';
            modeButton.title = 'Детальный режим';
        }
    }
    
    toggleCollapse() {
        const body = document.getElementById('telemetry-body');
        const button = document.getElementById('telemetry-toggle');
        
        this.isCollapsed = !this.isCollapsed;
        
        if (this.isCollapsed) {
            body.classList.add('collapsed');
            button.textContent = '+';
        } else {
            body.classList.remove('collapsed');
            button.textContent = '−';
        }
    }
    
    togglePause() {
        this.isPaused = !this.isPaused;
        const pauseBtn = this.panel.querySelector('.telemetry-controls button:nth-child(2)');
        if (this.isPaused) {
            pauseBtn.innerHTML = '▶️';
            pauseBtn.title = 'Возобновить обновление телеметрии';
            this.addLogEntry('system', 'Телеметрия приостановлена');
        } else {
            pauseBtn.innerHTML = '⏸️';
            pauseBtn.title = 'Приостановить обновление телеметрии';
            this.addLogEntry('system', 'Телеметрия возобновлена');
        }
    }
    
    addLogEntry(type, message, timestamp = new Date()) {
        if (this.isPaused) return;
        const entry = {
            type,
            message,
            timestamp,
            visible: this.filters[type] !== false
        };
        
        this.logEntries.push(entry);
        
        // Ограничиваем количество записей
        if (this.logEntries.length > this.maxLogEntries) {
            this.logEntries.shift();
        }
        
        this.renderLogEntry(entry);
        this.updateStats();
        this.scrollToBottom();
    }
    
    renderLogEntry(entry) {
        if (!entry.visible) return;
        
        const logElement = document.createElement('div');
        logElement.className = `log-entry ${entry.type}`;
        
        const timeStr = entry.timestamp.toLocaleTimeString('ru-RU', {
            hour12: false,
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            fractionalSecondDigits: 3
        });
        
        logElement.innerHTML = `
            <span class="log-timestamp">[${timeStr}]</span>
            <span class="log-message">${entry.message}</span>
        `;
        
        this.logContainer.appendChild(logElement);
        
        // Удаляем старые записи из DOM
        while (this.logContainer.children.length > this.maxLogEntries) {
            this.logContainer.removeChild(this.logContainer.firstChild);
        }
    }
    
    updateStats() {
        const recentTime = Date.now() - 10000; // Последние 10 секунд
        const recentEntries = this.logEntries.filter(e => e.timestamp.getTime() > recentTime);
        
        const corrections = recentEntries.filter(e => e.type === 'correction').length;
        const updates = recentEntries.filter(e => e.type === 'update').length;
        const garbage = recentEntries.filter(e => e.type === 'garbage').length;
        
        document.getElementById('stat-corrections').textContent = corrections;
        document.getElementById('stat-updates').textContent = updates;
        document.getElementById('stat-garbage').textContent = garbage;
        
        // Обновляем статус
        const statusElement = document.getElementById('telemetry-status');
        if (corrections > 10 || garbage > 5) {
            statusElement.textContent = 'ПРОБЛЕМЫ';
            statusElement.className = 'telemetry-status error';
        } else if (corrections > 3 || garbage > 0) {
            statusElement.textContent = 'ПРЕДУПРЕЖДЕНИЕ';
            statusElement.className = 'telemetry-status warning';
        } else {
            statusElement.textContent = 'ОК';
            statusElement.className = 'telemetry-status';
        }
    }
    
    applyFilters() {
        this.logContainer.innerHTML = '';
        this.logEntries.forEach(entry => {
            entry.visible = this.filters[entry.type] !== false;
            if (entry.visible) {
                this.renderLogEntry(entry);
            }
        });
        this.scrollToBottom();
    }
    
    scrollToBottom() {
        this.logContainer.scrollTop = this.logContainer.scrollHeight;
    }
    
    clearLog() {
        this.logEntries = [];
        this.logContainer.innerHTML = '';
        this.updateStats();
        this.addLogEntry('summary', 'Лог очищен', new Date());
    }
    
    exportData() {
        const data = {
            timestamp: new Date().toISOString(),
            entries: this.logEntries.map(entry => ({
                type: entry.type,
                message: entry.message,
                timestamp: entry.timestamp.toISOString()
            }))
        };
        
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `telemetry_${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
        
        this.addLogEntry('summary', `Данные экспортированы (${this.logEntries.length} записей)`, new Date());
    }
    
    show() {
        this.panel.style.display = 'block';
    }
    
    hide() {
        this.panel.style.display = 'none';
    }
    
    renderDetailedView() {
        const container = document.getElementById('telemetry-detailed');
        if (!container) return;
        
        container.innerHTML = '';
        
        // Показываем последние 50 детальных записей
        const recentData = this.detailedData.slice(-50);
        
        recentData.forEach(entry => {
            const element = this.createDetailedEntry(entry);
            container.appendChild(element);
        });
        
        // Прокручиваем вниз
        container.scrollTop = container.scrollHeight;
    }
    
    createDetailedEntry(entry) {
        const element = document.createElement('div');
        element.className = `detailed-entry ${entry.type}`;
        
        const timeStr = new Date(entry.timestamp).toLocaleTimeString('ru-RU', {
            hour12: false,
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            fractionalSecondDigits: 3
        });
        
        let content = `<div class="detailed-timestamp">[${timeStr}]</div>`;
        
        switch (entry.type) {
            case 'object-state':
                content += this.formatObjectState(entry);
                break;
            case 'correction':
                content += this.formatCorrection(entry);
                break;
            case 'server-update':
                content += this.formatServerUpdate(entry);
                break;
            case 'client-command':
                content += this.formatClientCommand(entry);
                break;
            default:
                content += `<div class="detailed-header">${entry.type}</div>`;
                content += `<div class="detailed-data">${JSON.stringify(entry.data)}</div>`;
        }
        
        element.innerHTML = content;
        return element;
    }
    
    formatObjectState(entry) {
        const data = entry.data;
        return `
            <div class="detailed-header">Состояние объекта ${data.objectId}</div>
            <div class="detailed-data">
                <div>Тип: ${data.objectType} (${data.physicsType})</div>
                <div class="detailed-position">Позиция: x=${data.position.x.toFixed(3)}, y=${data.position.y.toFixed(3)}, z=${data.position.z.toFixed(3)}</div>
                <div class="detailed-velocity">Скорость: x=${data.velocity.x.toFixed(3)}, y=${data.velocity.y.toFixed(3)}, z=${data.velocity.z.toFixed(3)} (${data.speed.toFixed(3)} u/s)</div>
                <div>Масса: ${data.mass}, Радиус: ${data.radius}</div>
                ${data.appliedImpulse ? `<div>Импульс: x=${data.appliedImpulse.x.toFixed(3)}, y=${data.appliedImpulse.y.toFixed(3)}, z=${data.appliedImpulse.z.toFixed(3)}</div>` : ''}
            </div>
        `;
    }
    
    formatCorrection(entry) {
        const data = entry.data;
        return `
            <div class="detailed-header">Коррекция ${data.correctionType}: объект ${data.objectId}</div>
            <div class="detailed-data">
                <div class="detailed-position">От: x=${data.fromPos.x.toFixed(3)}, y=${data.fromPos.y.toFixed(3)}, z=${data.fromPos.z.toFixed(3)}</div>
                <div class="detailed-position">До: x=${data.toPos.x.toFixed(3)}, y=${data.toPos.y.toFixed(3)}, z=${data.toPos.z.toFixed(3)}</div>
                <div>Расстояние: ${data.distance.toFixed(3)} единиц</div>
            </div>
        `;
    }
    
    formatServerUpdate(entry) {
        const data = entry.data;
        return `
            <div class="detailed-header">Обновление сервера: объект ${data.objectId}</div>
            <div class="detailed-data">
                ${data.isGarbage ? '<div style="color: #ffa500;">⚠️ МУСОРНЫЕ ДАННЫЕ</div>' : ''}
                <div class="detailed-position">Позиция: x=${data.position.x.toFixed(3)}, y=${data.position.y.toFixed(3)}, z=${data.position.z.toFixed(3)}</div>
                <div class="detailed-velocity">Скорость: x=${data.velocity.x.toFixed(3)}, y=${data.velocity.y.toFixed(3)}, z=${data.velocity.z.toFixed(3)}</div>
            </div>
        `;
    }
    
    formatClientCommand(entry) {
        const data = entry.data;
        return `
            <div class="detailed-header">Команда клиента</div>
            <div class="detailed-data">
                <div>Направление: x=${data.direction.x.toFixed(3)}, y=${data.direction.y.toFixed(3)}, z=${data.direction.z.toFixed(3)}</div>
                <div>Расстояние: ${data.distance.toFixed(3)}</div>
                ${data.force ? `<div>Сила: x=${data.force.x.toFixed(3)}, y=${data.force.y.toFixed(3)}, z=${data.force.z.toFixed(3)}</div>` : ''}
            </div>
        `;
    }
    
    addDetailedEntry(type, data, timestamp = new Date()) {
        if (this.isPaused) return;
        const entry = {
            type,
            data,
            timestamp: timestamp.getTime ? timestamp.getTime() : timestamp
        };
        
        this.detailedData.push(entry);
        
        // Ограничиваем размер буфера
        if (this.detailedData.length > 200) {
            this.detailedData.shift();
        }
        
        // Обновляем детальный вид если он активен
        if (this.viewMode === 'detailed') {
            this.renderDetailedView();
        }
    }

    // Методы для интеграции с телеметрией
    logCorrection(objectId, fromPos, toPos, type, distance) {
        if (this.isPaused) return;
        const message = `Коррекция ${type}: объект ${objectId}, расстояние ${distance.toFixed(2)}`;
        this.addLogEntry('correction', message);
        
        // Добавляем детальные данные
        this.addDetailedEntry('correction', {
            objectId,
            fromPos,
            toPos,
            correctionType: type,
            distance
        });
    }
    
    logServerUpdate(objectId, position, velocity, isGarbage) {
        if (this.isPaused) return;
        if (isGarbage) {
            const message = `Мусорные данные от сервера: объект ${objectId}`;
            this.addLogEntry('garbage', message);
        } else {
            const message = `Обновление сервера: объект ${objectId}`;
            this.addLogEntry('update', message);
        }
        
        // Добавляем детальные данные
        this.addDetailedEntry('server-update', {
            objectId,
            position,
            velocity,
            isGarbage
        });
    }
    
    logClientCommand(direction, distance, force) {
        if (this.isPaused) return;
        const message = `Команда клиента: расстояние ${distance.toFixed(2)}`;
        this.addLogEntry('command', message);
        
        // Добавляем детальные данные
        this.addDetailedEntry('client-command', {
            direction,
            distance,
            force
        });
    }
    
    logSummary(stats) {
        if (this.isPaused) return;
        const message = `Сводка: коррекций ${stats.corrections || 0}, обновлений ${stats.updates || 0}, мусорных ${stats.garbage || 0}`;
        this.addLogEntry('summary', message);
    }

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
            
            console.log(`🎮 [ClientTelemetry] Игрок ${playerId} [${timeStr}]:`);
            console.log(`   📍 Позиция: (${data.position.x.toFixed(2)}, ${data.position.y.toFixed(2)}, ${data.position.z.toFixed(2)})`);
            
            if (data.velocity) {
                console.log(`   🏃 Скорость: (${data.velocity.x.toFixed(2)}, ${data.velocity.y.toFixed(2)}, ${data.velocity.z.toFixed(2)}) |${data.speed.toFixed(2)}|`);
            }
            
            if (data.mass !== undefined) {
                console.log(`   ⚖️  Масса: ${data.mass.toFixed(2)} кг, Радиус: ${data.radius.toFixed(2)}`);
            }
            
            console.log(`   🔧 Физика: ${data.physicsType}, Источник: ${data.source}`);
            console.log(`   ⏰ Временная метка: ${data.timestamp}`);
            
            if (data.appliedImpulse) {
                console.log(`   💥 Импульс: (${data.appliedImpulse.x.toFixed(2)}, ${data.appliedImpulse.y.toFixed(2)}, ${data.appliedImpulse.z.toFixed(2)})`);
            }
        }
    }
}

// Создаем глобальный экземпляр
window.telemetryUI = new TelemetryUI();

// Консольные команды
window.showTelemetryUI = () => window.telemetryUI.show();
window.hideTelemetryUI = () => window.telemetryUI.hide();
window.clearTelemetryUI = () => window.telemetryUI.clearLog();
window.telemetryDetailedMode = () => {
    if (window.telemetryUI.viewMode === 'summary') {
        window.telemetryUI.toggleViewMode();
    }
};
window.telemetrySummaryMode = () => {
    if (window.telemetryUI.viewMode === 'detailed') {
        window.telemetryUI.toggleViewMode();
    }
};
    window.telemetryPause = () => {
    if (!window.telemetryUI.isPaused) {
        window.telemetryUI.togglePause();
    }
};
window.telemetryResume = () => {
    if (window.telemetryUI.isPaused) {
        window.telemetryUI.togglePause();
    }
};

export { TelemetryUI }; 