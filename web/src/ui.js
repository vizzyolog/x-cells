// ui.js - Управление пользовательским интерфейсом игры

// === СОЗДАНИЕ И УПРАВЛЕНИЕ UI ПАНЕЛЯМИ ===

export function createGameUI() {
    // Проверяем, не создана ли уже панель
    if (document.getElementById('unifiedGameUI')) {
        console.log('[UI] Панели уже созданы');
        return;
    }

    // Основной контейнер
    const uiContainer = document.createElement('div');
    uiContainer.id = 'unifiedGameUI';
    uiContainer.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        z-index: 1000;
        pointer-events: none;
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    `;
    document.body.appendChild(uiContainer);
    
    // Создаем все панели
    createNetworkInfoPanel(uiContainer);
    createPlayerInfoPanel(uiContainer);
    createGameStatsPanel(uiContainer);
    createFoodStatsPanel(uiContainer);
    
    console.log('[UI] Единая игровая панель создана (4 панели)');
}

function createNetworkInfoPanel(container) {
    const panel = document.createElement('div');
    panel.style.cssText = `
        position: absolute;
        top: 120px;
        left: 10px;
        background: rgba(0, 0, 0, 0.9);
        color: white;
        padding: 12px;
        border-radius: 8px;
        border: 2px solid #9370DB;
        min-width: 250px;
        font-size: 12px;
        z-index: 999;
    `;
    
    panel.innerHTML = `
        <div style="font-weight: bold; margin-bottom: 8px; color: #9370DB;">📡 СЕТЬ</div>
        <div id="ping-display">Пинг: -- мс</div>
        <div id="jitter-display">Джиттер: -- мс</div>
        <div id="strategy-display">Стратегия: --</div>
        <div id="adaptation-display">Адаптация: --</div>
        <div id="server-time">Время сервера: --</div>
        <div id="time-offset">Смещение: -- мс</div>
        <div id="server-delay-display">Задержка сервера: -- мс</div>
    `;
    
    container.appendChild(panel);
    console.log('[UI] Сетевая панель создана');
}

function createPlayerInfoPanel(container) {
    const panel = document.createElement('div');
    panel.id = 'player-info-panel';
    panel.style.cssText = `
        position: absolute;
        bottom: 10px;
        left: 10px;
        background: rgba(0, 0, 0, 0.9);
        color: white;
        padding: 12px;
        border-radius: 8px;
        border: 2px solid #00ff00;
        min-width: 200px;
        font-size: 12px;
        z-index: 999;
    `;
    
    panel.innerHTML = `
        <div style="font-weight: bold; margin-bottom: 8px; color: #00ff00;">🚀 ИГРОК</div>
        <div>Скорость: <span id="player-speed">0.0 м/с</span></div>
        <div>Масса: <span id="player-mass">0.0 кг</span></div>
        <div>Позиция: <span id="player-position">(0, 0, 0)</span></div>
        <div>Статус: <span id="player-status">Поиск...</span></div>
        <div style="margin-top: 8px; font-size: 10px; opacity: 0.7;">
            ← ↑ ↓ → движение | SPACE прыжок
        </div>
    `;
    
    container.appendChild(panel);
    console.log('[UI] Панель игрока создана');
}

function createGameStatsPanel(container) {
    const panel = document.createElement('div');
    panel.style.cssText = `
        position: absolute;
        bottom: 10px;
        right: 10px;
        background: rgba(0, 0, 0, 0.9);
        color: white;
        padding: 12px;
        border-radius: 8px;
        border: 2px solid #00ffff;
        min-width: 200px;
        font-size: 12px;
        z-index: 999;
    `;
    
    panel.innerHTML = `
        <div style="font-weight: bold; margin-bottom: 8px; color: #00ffff;">🎮 СЕРВЕР</div>
        <div>Тиков: <span id="tickCount">0</span></div>
        <div>Игроков: <span id="playersCount">0</span></div>
        <div>Объектов: <span id="objectsCount">0</span></div>
        <div>Пинг: <span id="ping-display-server">-- мс</span></div>
    `;
    
    container.appendChild(panel);
    console.log('[UI] Панель сервера создана');
}

function createFoodStatsPanel(container) {
    const panel = document.createElement('div');
    panel.style.cssText = `
        position: absolute;
        top: 10px;
        right: 270px;
        background: rgba(0, 0, 0, 0.9);
        color: white;
        padding: 12px;
        border-radius: 8px;
        border: 2px solid #FFD700;
        min-width: 250px;
        font-size: 12px;
        z-index: 999;
    `;
    
    panel.innerHTML = `
        <div style="font-weight: bold; margin-bottom: 8px; color: #FFD700;">🍎 ЕДА В МИРЕ</div>
        <div>Всего: <span id="totalFood">0</span></div>
        <div style="margin-top: 8px;">
            <div style="display: flex; justify-content: space-between; margin: 3px 0;">
                <span style="color: #90EE90;">● Обычная:</span>
                <span id="basicFood">0</span>
            </div>
            <div style="display: flex; justify-content: space-between; margin: 3px 0;">
                <span style="color: #FFD700;">● Средняя:</span>
                <span id="mediumFood">0</span>
            </div>
            <div style="display: flex; justify-content: space-between; margin: 3px 0;">
                <span style="color: #FF6347;">● Большая:</span>
                <span id="largeFood">0</span>
            </div>
            <div style="display: flex; justify-content: space-between; margin: 3px 0;">
                <span style="color: #9370DB; text-shadow: 0 0 4px #9370DB;">● Редкая:</span>
                <span id="rareFood" style="font-weight: bold;">0</span>
            </div>
        </div>
    `;
    
    container.appendChild(panel);
    console.log('[UI] Панель еды создана');
}

// === ФУНКЦИИ ОБНОВЛЕНИЯ UI ===

// Обновление информации о игроке
export function updatePlayerInfo(playerData) {
    console.log('[UI] Обновление информации о игроке:', playerData);
    updatePlayerSpeed(playerData.speed || 0);
    updatePlayerMass(playerData.mass || 0);
    updatePlayerPosition(playerData.position || { x: 0, y: 0, z: 0 });
    updatePlayerStatus(playerData.status || 'В игре');
}

// Обновление скорости игрока
export function updatePlayerSpeed(speed) {
    const element = document.getElementById('player-speed');
    if (element) {
        element.textContent = `${speed.toFixed(1)} м/с`;
        
        // Цветовая индикация скорости
        if (speed < 5) {
            element.style.color = '#90EE90'; // Зеленый для низкой скорости
        } else if (speed < 15) {
            element.style.color = '#FFD700'; // Желтый для средней скорости
        } else {
            element.style.color = '#FF6347'; // Красный для высокой скорости
        }
        console.log(`[UI] Скорость обновлена: ${speed.toFixed(1)} м/с`);
    } else {
        console.warn('[UI] Элемент player-speed не найден');
    }
}

// Обновление массы игрока
export function updatePlayerMass(mass) {
    const element = document.getElementById('player-mass');
    if (element) {
        element.textContent = `${mass.toFixed(1)} кг`;
        
        // Цветовая индикация массы
        if (mass < 10) {
            element.style.color = '#90EE90'; // Зеленый для малой массы
        } else if (mass < 50) {
            element.style.color = '#FFD700'; // Желтый для средней массы
        } else {
            element.style.color = '#FF6347'; // Красный для большой массы
        }
        console.log(`[UI] Масса обновлена: ${mass.toFixed(1)} кг`);
    } else {
        console.warn('[UI] Элемент player-mass не найден');
    }
}

// Обновление позиции игрока
export function updatePlayerPosition(position) {
    const element = document.getElementById('player-position');
    if (element) {
        element.textContent = `(${position.x.toFixed(1)}, ${position.y.toFixed(1)}, ${position.z.toFixed(1)})`;
        console.log(`[UI] Позиция обновлена: (${position.x.toFixed(1)}, ${position.y.toFixed(1)}, ${position.z.toFixed(1)})`);
    } else {
        console.warn('[UI] Элемент player-position не найден');
    }
}

// Обновление статуса игрока
export function updatePlayerStatus(status) {
    const element = document.getElementById('player-status');
    if (element) {
        element.textContent = status;
        
        // Цветовая индикация статуса
        switch (status) {
            case 'В игре':
                element.style.color = '#00ff00';
                break;
            case 'Подключение...':
                element.style.color = '#FFD700';
                break;
            case 'Отключен':
                element.style.color = '#ff0000';
                break;
            default:
                element.style.color = '#ffffff';
        }
        console.log(`[UI] Статус обновлен: ${status}`);
    } else {
        console.warn('[UI] Элемент player-status не найден');
    }
}

// === ОБНОВЛЕНИЕ СЕТЕВОЙ ИНФОРМАЦИИ ===

export function updatePingDisplay(pingValue) {
    const pingElement = document.getElementById('ping-display');
    const pingServerElement = document.getElementById('ping-display-server');
    const jitterElement = document.getElementById('jitter-display');
    const strategyElement = document.getElementById('strategy-display');
    const adaptationElement = document.getElementById('adaptation-display');
    
    // Обновляем основной элемент пинга в сетевой панели
    if (pingElement) {
        // Обновляем отображение пинга с цветовой индикацией
        if (pingValue < 50) {
            pingElement.style.color = '#4CAF50'; // Зеленый для хорошего пинга
        } else if (pingValue < 150) {
            pingElement.style.color = '#FF9800'; // Оранжевый для среднего пинга
        } else {
            pingElement.style.color = '#F44336'; // Красный для высокого пинга
            // Добавляем мигание для очень высокого пинга
            if (pingValue > 300) {
                pingElement.style.animation = 'blink 1s infinite';
            } else {
                pingElement.style.animation = 'none';
            }
        }
        pingElement.textContent = `Пинг: ${Math.round(pingValue)} мс`;
    }
    
    // Обновляем элемент пинга в панели сервера
    if (pingServerElement) {
        pingServerElement.textContent = `${Math.round(pingValue)} мс`;
        pingServerElement.style.color = pingValue < 50 ? '#4CAF50' : 
                                       pingValue < 150 ? '#FF9800' : '#F44336';
    }
    
    // Получаем информацию о джиттере и адаптации из физики
    if (typeof getSmoothedJitter === 'function') {
        const jitter = getSmoothedJitter();
        if (jitterElement) {
            if (jitter < 10) {
                jitterElement.style.color = '#4CAF50';
            } else if (jitter < 30) {
                jitterElement.style.color = '#FF9800';
            } else {
                jitterElement.style.color = '#F44336';
            }
            jitterElement.textContent = `Джиттер: ${jitter.toFixed(1)} мс`;
        }
    }
    
    // Получаем информацию о стратегии интерполяции
    if (typeof getInterpolationStrategy === 'function') {
        const strategy = getInterpolationStrategy(pingValue);
        if (strategyElement) {
            let strategyText = '';
            let strategyColor = '';
            
            switch (strategy) {
                case 'linear':
                    strategyText = 'Линейная';
                    strategyColor = '#4CAF50';
                    break;
                case 'hermite':
                    strategyText = 'Hermite';
                    strategyColor = '#FF9800';
                    break;
                case 'extrapolation':
                    strategyText = 'Экстраполяция';
                    strategyColor = '#F44336';
                    break;
                default:
                    strategyText = 'Неизвестно';
                    strategyColor = '#9E9E9E';
            }
            
            strategyElement.style.color = strategyColor;
            strategyElement.textContent = `Стратегия: ${strategyText}`;
        }
    }
    
    // Получаем информацию о состоянии адаптации
    if (typeof networkMonitor !== 'undefined' && adaptationElement) {
        const isAdapting = networkMonitor.adaptationState.isAdapting;
        if (isAdapting) {
            adaptationElement.style.color = '#FF9800';
            adaptationElement.textContent = 'Адаптация: ⚡ Активна';
            adaptationElement.style.animation = 'blink 0.5s infinite';
        } else {
            adaptationElement.style.color = '#4CAF50';
            adaptationElement.textContent = 'Адаптация: ✓ Стабильно';
            adaptationElement.style.animation = 'none';
        }
    }
}

// Обновление времени сервера
export function updateTimeDisplay(serverTime, timeOffset) {
    const serverTimeElem = document.getElementById('server-time');
    const timeOffsetElem = document.getElementById('time-offset');
    
    if (serverTimeElem && timeOffsetElem) {
        const serverDate = new Date(serverTime);
        serverTimeElem.textContent = `Время сервера: ${serverDate.toLocaleTimeString()}`;
        timeOffsetElem.textContent = `Смещение: ${timeOffset.toFixed(0)} мс`;
    }
}

// Обновление задержки сервера
export function updateServerDelayDisplay(delay) {
    const delayDisplay = document.getElementById('server-delay-display');
    if (delayDisplay) {
        delayDisplay.textContent = `Задержка сервера: ${delay.toFixed(0)} мс`;
    }
}

// === ОБНОВЛЕНИЕ ИГРОВОЙ СТАТИСТИКИ ===

// Обновление статистики еды
export function updateFoodStatsDisplay(foodStats) {
    const elements = {
        totalFood: document.getElementById('totalFood'),
        basicFood: document.getElementById('basicFood'), 
        mediumFood: document.getElementById('mediumFood'),
        largeFood: document.getElementById('largeFood'),
        rareFood: document.getElementById('rareFood')
    };
    
    if (elements.totalFood) {
        elements.totalFood.textContent = foodStats.total || 0;
    }
    if (elements.basicFood) {
        elements.basicFood.textContent = foodStats.basic || 0;
    }
    if (elements.mediumFood) {
        elements.mediumFood.textContent = foodStats.medium || 0;
    }
    if (elements.largeFood) {
        elements.largeFood.textContent = foodStats.large || 0;
    }
    if (elements.rareFood) {
        elements.rareFood.textContent = foodStats.rare || 0;
    }
}

// Обновление количества объектов
export function updateObjectsCount(count) {
    const element = document.getElementById('objectsCount');
    if (element) {
        element.textContent = count;
    }
}

// Обновление счетчика тиков
export function updateTickCountDisplay(count) {
    const element = document.getElementById('tickCount');
    if (element) {
        element.textContent = count;
    }
}

// Обновление количества игроков
export function updatePlayersCountDisplay(count) {
    const element = document.getElementById('playersCount');
    if (element) {
        element.textContent = count;
    }
}

// === ПРОВЕРКА И ВОССТАНОВЛЕНИЕ UI ===

export function ensureUIExists() {
    const container = document.getElementById('unifiedGameUI');
    if (!container) {
        console.log('[UI] Контейнер не найден, создаем заново');
        createGameUI();
        return;
    }
    
    // Проверяем наличие ключевых элементов
    const checks = [
        { id: 'player-speed', panel: 'игрока' },
        { id: 'ping-display', panel: 'сети' },
        { id: 'totalFood', panel: 'еды' },
        { id: 'tickCount', panel: 'сервера' }
    ];
    
    let missingElements = [];
    checks.forEach(check => {
        if (!document.getElementById(check.id)) {
            missingElements.push(check.panel);
        }
    });
    
    if (missingElements.length > 0) {
        console.log(`[UI] Отсутствуют панели: ${missingElements.join(', ')}, пересоздаем UI`);
        container.remove();
        createGameUI();
    } else {
        console.log('[UI] Все панели на месте');
    }
} 