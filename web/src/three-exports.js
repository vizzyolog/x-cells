// three-exports.js

// Проверка наличия дубликатов Three.js
if (typeof window.THREE !== 'undefined') {
    console.warn('[Three] ВНИМАНИЕ: Three.js уже определен в глобальном объекте!');
}

// Проверка, не существует ли уже глобальная инстанция
if (!window.__THREE_INSTANCE__) {
    console.log("[Three] Создан первичный экземпляр Three.js");
    
    try {
        // Предотвращаем дублирующиеся импорты
        const originalWarn = console.warn;
        console.warn = function(message) {
            if (message && typeof message === 'string' && message.includes('Multiple instances of Three.js')) {
                console.log('[Three] Предотвращено предупреждение о множественных импортах Three.js');
                return;
            }
            originalWarn.apply(console, arguments);
        };
        
        // Создаем единственный экземпляр Three.js
        window.__THREE_INSTANCE__ = require('three');
        
        // Восстанавливаем оригинальный console.warn
        console.warn = originalWarn;
        
        // Также установим глобальную переменную THREE для совместимости
        window.THREE = window.__THREE_INSTANCE__;
    } catch (error) {
        console.error("[Three] Ошибка при инициализации Three.js:", error);
        throw error;
    }
} else {
    console.log("[Three] Используется существующий экземпляр Three.js");
}

// Используем уже созданный экземпляр
const THREE = window.__THREE_INSTANCE__;

// Для надежности заменяем функцию предупреждения о дубликатах
if (THREE && THREE.warn) {
    const originalThreeWarn = THREE.warn;
    THREE.warn = function(message) {
        if (message && typeof message === 'string' && message.includes('Multiple instances')) {
            console.log('[Three] Блокировано предупреждение Three.js:', message);
            return;
        }
        originalThreeWarn.apply(THREE, arguments);
    };
}

export { THREE };

// Также экспортируем часто используемые классы для удобства
export const Vector3 = THREE.Vector3;
export const Vector2 = THREE.Vector2;
export const Quaternion = THREE.Quaternion;
export const Matrix4 = THREE.Matrix4;
export const Color = THREE.Color;
export const Scene = THREE.Scene;
export const PerspectiveCamera = THREE.PerspectiveCamera;
export const WebGLRenderer = THREE.WebGLRenderer;
export const Mesh = THREE.Mesh;
export const BoxGeometry = THREE.BoxGeometry;
export const SphereGeometry = THREE.SphereGeometry;
export const MeshStandardMaterial = THREE.MeshStandardMaterial;
export const AmbientLight = THREE.AmbientLight;
export const DirectionalLight = THREE.DirectionalLight;
export const Clock = THREE.Clock; 