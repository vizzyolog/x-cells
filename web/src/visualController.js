// visualController.js - Контроллер визуальных эффектов и анимаций
import { updateEyePositions, globalEyeSystem } from './eyes.js';
import { getCurrentDirection, getLastIntersectPoint, isMouseActiveInCanvas } from './gamepad.js';
import gameStateManager from './gamestatemanager.js';
import * as THREE from 'three';

class VisualController {
    constructor() {
        this.isActive = true;
        this.updateCounter = 0;
        this.isMouseTracking = true;
    }

    // Основной метод обновления всех визуальных эффектов
    update() {
        if (!this.isActive) return;
        
        this.updateCounter++;
        
        // Обновляем позиции глаз (теперь они автоматически позиционируются как спутники)
        this.updateEyes();
        
        // Здесь можно добавить другие визуальные эффекты:
        // - Анимацию частиц
        // - Эффекты освещения
        // - Анимацию текстур
        // - UI анимации
    }
    
    updateEyes() {
        try {
            // Глаза теперь автоматически позиционируются как спутники вокруг сферы
            updateEyePositions();
        } catch (error) {
            console.error('[VisualController] Ошибка обновления глаз:', error);
        }
    }
    
    // Методы управления
    start() {
        this.isActive = true;
        console.log('[VisualController] Визуальный контроллер запущен');
    }
    
    stop() {
        this.isActive = false;
        console.log('[VisualController] Визуальный контроллер остановлен');
    }
    
    // Включить/выключить отслеживание мыши
    setMouseTracking(enabled) {
        this.isMouseTracking = enabled;
        console.log(`[VisualController] Отслеживание мыши: ${enabled ? 'включено' : 'выключено'}`);
    }
    
    // Дополнительные методы для будущих эффектов
    addEffect(effectName, effectFunction) {
        // Система для добавления новых эффектов
        this[`update${effectName}`] = effectFunction;
    }
    
    removeEffect(effectName) {
        delete this[`update${effectName}`];
    }
}

// Создаем глобальный экземпляр
let globalVisualController = null;

export function initVisualController() {
    if (!globalVisualController) {
        globalVisualController = new VisualController();
        console.log('[VisualController] Инициализирован');
    }
    return globalVisualController;
}

export function getVisualController() {
    if (!globalVisualController) {
        initVisualController();
    }
    return globalVisualController;
}

export function updateVisualEffects() {
    const controller = getVisualController();
    controller.update();
}

export { globalVisualController }; 