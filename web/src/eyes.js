import * as THREE from 'three';

// Системы глаз для сферы
class EyeSystem {
    constructor() {
        this.eyeTexture = null;
        this.leftEye = null;
        this.rightEye = null;
        this.sphereMesh = null;
        
        // Параметры глаз - ОГРОМНЫЕ, больше сферы!
        this.eyeSize = 8.0; // Увеличиваем до огромного размера!
        this.eyeDistance = 6.0; // Увеличиваем расстояние между глазами
        this.eyeOffset = 0.9; // расстояние от центра сферы
        
        // Карта эмоций и их координат в спрайт-карте (горизонтальная раскладка)
        this.emotions = {
            'normal': { u: 0, v: 0 },      
            'happy': { u: 0.166, v: 0 },    // 1/6
            'angry': { u: 0.333, v: 0 },    // 2/6
            'scared': { u: 0.5, v: 0 },     // 3/6
            'looking_left': { u: 0.666, v: 0 },  // 4/6
            'looking_right': { u: 0.833, v: 0 }  // 5/6
        };
        
        this.currentEmotion = 'normal';
        
        this.loadTexture();
    }
    
    async loadTexture() {
        console.log('[Eyes] Начинаю загрузку текстуры eyes.png...');
        try {
            const loader = new THREE.TextureLoader();
            this.eyeTexture = await new Promise((resolve, reject) => {
                loader.load(
                    './eyes.png',
                    (texture) => {
                        console.log('[Eyes] Текстура успешно загружена:', texture);
                        console.log('[Eyes] Размер текстуры:', texture.image.width, 'x', texture.image.height);
                        resolve(texture);
                    },
                    (progress) => {
                        console.log('[Eyes] Прогресс загрузки:', progress);
                    },
                    (error) => {
                        console.error('[Eyes] Ошибка загрузки текстуры:', error);
                        reject(error);
                    }
                );
            });
            
            // Настраиваем текстуру
            this.eyeTexture.magFilter = THREE.NearestFilter;
            this.eyeTexture.minFilter = THREE.NearestFilter;
            this.eyeTexture.wrapS = THREE.ClampToEdgeWrapping;
            this.eyeTexture.wrapT = THREE.ClampToEdgeWrapping;
            
            console.log('[Eyes] Текстура глаз настроена и готова к использованию');
        } catch (error) {
            console.error('[Eyes] Ошибка загрузки текстуры глаз:', error);
            
            // Создаем fallback текстуру
            this.createFallbackTexture();
        }
    }
    
    createFallbackTexture() {
        console.log('[Eyes] Создаю fallback текстуру...');
        // Создаем ОГРОМНЫЕ выразительные глаза больше самой сферы!
        const canvas = document.createElement('canvas');
        canvas.width = 600; // 6 эмоций по 100px
        canvas.height = 100;
        const ctx = canvas.getContext('2d');
        
        // Заполняем прозрачным
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Создаем ОГРОМНЫЕ глаза для каждой эмоции
        const emotions = [
            { name: 'normal', pupilX: 50, pupilY: 50, pupilSize: 25 },
            { name: 'happy', pupilX: 50, pupilY: 60, pupilSize: 30, eyeHeight: 50 }, // Прищуренные счастливые
            { name: 'angry', pupilX: 50, pupilY: 35, pupilSize: 35, eyeColor: '#FFE6E6' }, // Налитые кровью
            { name: 'scared', pupilX: 50, pupilY: 30, pupilSize: 40, eyeColor: '#E6F3FF' }, // Широко открытые
            { name: 'left', pupilX: 30, pupilY: 50, pupilSize: 25 },
            { name: 'right', pupilX: 70, pupilY: 50, pupilSize: 25 } // Добавляем "вправо"
        ];
        
        emotions.forEach((emotion, index) => {
            const x = index * 100;
            
            // Белок глаза (ОГРОМНЫЙ!)
            ctx.fillStyle = emotion.eyeColor || '#FFFFFF';
            const eyeHeight = emotion.eyeHeight || 70;
            ctx.beginPath();
            ctx.ellipse(x + 50, 50, 35, eyeHeight / 2, 0, 0, Math.PI * 2);
            ctx.fill();
            
            // Черная обводка
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 3;
            ctx.stroke();
            
            // ОГРОМНЫЙ зрачок
            ctx.fillStyle = '#000000';
            ctx.beginPath();
            ctx.ellipse(x + emotion.pupilX, emotion.pupilY, emotion.pupilSize / 2, emotion.pupilSize / 2, 0, 0, Math.PI * 2);
            ctx.fill();
            
            // Блик в глазу для живости
            ctx.fillStyle = '#FFFFFF';
            ctx.beginPath();
            ctx.ellipse(x + emotion.pupilX - 8, emotion.pupilY - 8, 6, 6, 0, 0, Math.PI * 2);
            ctx.fill();
        });
        
        this.eyeTexture = new THREE.CanvasTexture(canvas);
        this.eyeTexture.magFilter = THREE.NearestFilter;
        this.eyeTexture.minFilter = THREE.NearestFilter;
        
        console.log('[Eyes] Создана fallback текстура с ОГРОМНЫМИ глазами размером:', canvas.width, 'x', canvas.height);
    }
    
    createEyes(sphereMesh) {
        if (!this.eyeTexture) {
            console.warn('[Eyes] Текстура глаз еще не загружена');
            return;
        }
        
        console.log('[Eyes] Создаю глаза для сферы:', sphereMesh);
        
        this.sphereMesh = sphereMesh;
        const radius = sphereMesh.geometry.parameters.radius;
        
        console.log('[Eyes] Радиус сферы:', radius);
        
        // Создаем геометрию для глаз (плоские квадраты) - ОГРОМНЫЕ!
        const eyeGeometry = new THREE.PlaneGeometry(this.eyeSize, this.eyeSize);
        console.log('[Eyes] Размер ОГРОМНЫХ глаз:', this.eyeSize);
        
        // Создаем материал с текстурой
        const eyeMaterial = new THREE.MeshBasicMaterial({
            map: this.eyeTexture.clone(),
            transparent: true,
            alphaTest: 0.1,
            side: THREE.DoubleSide
        });
        
        console.log('[Eyes] Материал создан:', eyeMaterial);
        
        // Левый глаз - ОГРОМНЫЙ и НЕЗАВИСИМЫЙ!
        this.leftEye = new THREE.Mesh(eyeGeometry, eyeMaterial.clone());
        
        // Правый глаз - ОГРОМНЫЙ и НЕЗАВИСИМЫЙ!
        this.rightEye = new THREE.Mesh(eyeGeometry, eyeMaterial.clone());
        
        // НЕ добавляем глаза к сфере! Добавляем их в главную сцену
        const scene = sphereMesh.parent; // Получаем сцену
        if (scene) {
            scene.add(this.leftEye);
            scene.add(this.rightEye);
            console.log('[Eyes] ОГРОМНЫЕ глаза добавлены в сцену как независимые объекты');
        }
        
        // Обновляем позиции глаз
        this.updateEyePositions();
        
        this.updateEmotion(this.currentEmotion);
        
        console.log('[Eyes] ОГРОМНЫЕ глаза созданы и добавлены в сцену');
    }
    
    // Новый метод для обновления позиций глаз
    updateEyePositions() {
        if (!this.sphereMesh || !this.leftEye || !this.rightEye) {
            return;
        }
        
        const spherePos = this.sphereMesh.position;
        const radius = this.sphereMesh.geometry.parameters.radius;
        
        // Пытаемся получить направление вектора из глобальных переменных gamepad
        let direction = null;
        try {
            // Проверяем доступность функций gamepad через глобальные переменные
            if (window.gamepadDirection && window.gamepadDirection.length() > 0) {
                direction = window.gamepadDirection;
                this.positionEyesAroundSphere(spherePos, radius, direction);
                return;
            }
        } catch (error) {
            // Игнорируем ошибки
        }
        
        // Если направление не доступно, используем позицию по умолчанию
        this.positionEyesDefault(spherePos, radius);
    }
    
    // Позиционируем глаза вокруг сферы в направлении вектора
    positionEyesAroundSphere(spherePos, radius, direction) {
        // Нормализуем направление
        const normalizedDir = direction.clone().normalize();
        
        // ИНВЕРТИРУЕМ направление - глаза размещаются в противоположной стороне от вектора!
        const oppositeDir = normalizedDir.clone().negate();
        
        // Создаем векторы для позиционирования глаз как спутников
        // Глаза размещаются на противоположной стороне сферы от того, куда указывает вектор
        const eyeDistance = radius + 2.0; // Расстояние от центра сферы до глаз
        const eyeSeparation = 3.0; // Расстояние между глазами
        
        // Вычисляем базовую позицию в противоположном направлении от вектора
        const basePosition = new THREE.Vector3()
            .copy(oppositeDir)
            .multiplyScalar(eyeDistance)
            .add(spherePos);
        
        // Создаем перпендикулярный вектор для разделения глаз
        const up = new THREE.Vector3(0, 1, 0);
        const right = new THREE.Vector3().crossVectors(oppositeDir, up).normalize();
        
        // Если вектор направлен строго вверх или вниз, используем другой базовый вектор
        if (right.length() < 0.1) {
            right.set(1, 0, 0).cross(oppositeDir).normalize();
        }
        
        // Позиционируем левый и правый глаз
        this.leftEye.position.copy(basePosition)
            .add(right.clone().multiplyScalar(-eyeSeparation / 2));
            
        this.rightEye.position.copy(basePosition)
            .add(right.clone().multiplyScalar(eyeSeparation / 2));
        
        // Поворачиваем глаза к центру сферы (чтобы они "смотрели" на неё)
        this.leftEye.lookAt(spherePos);
        this.rightEye.lookAt(spherePos);
        
        console.log('[Eyes] ОГРОМНЫЕ глаза-спутники убегают от курсора:');
        console.log('  Направление вектора:', normalizedDir);
        console.log('  Противоположное направление:', oppositeDir);
        console.log('  Левый глаз:', this.leftEye.position);
        console.log('  Правый глаз:', this.rightEye.position);
    }
    
    // Позиция по умолчанию (спереди сферы)
    positionEyesDefault(spherePos, radius) {
        const eyeDistance = radius + 2.0;
        
        // Размещаем глаза спереди по умолчанию
        this.leftEye.position.set(
            spherePos.x - 3.0, 
            spherePos.y + 1.0, 
            spherePos.z + eyeDistance
        );
        
        this.rightEye.position.set(
            spherePos.x + 3.0, 
            spherePos.y + 1.0, 
            spherePos.z + eyeDistance
        );
        
        // Поворачиваем к центру сферы
        this.leftEye.lookAt(spherePos);
        this.rightEye.lookAt(spherePos);
    }
    
    updateEmotion(emotion) {
        if (!this.emotions[emotion]) {
            console.warn(`[Eyes] Неизвестная эмоция: ${emotion}`);
            return;
        }
        
        this.currentEmotion = emotion;
        
        if (!this.leftEye || !this.rightEye) {
            return;
        }
        
        const coords = this.emotions[emotion];
        
        // Обновляем UV координаты для отображения нужной части спрайт-карты
        // Горизонтальная раскладка 6 эмоций в ряд
        const uvOffsetX = coords.u;
        const uvOffsetY = coords.v;
        const uvScaleX = 0.166; // 1/6 для 6 эмоций в ряд
        const uvScaleY = 1.0; // вся высота
        
        // Обновляем UV для левого глаза
        if (this.leftEye.material.map) {
            this.leftEye.material.map.offset.set(uvOffsetX, uvOffsetY);
            this.leftEye.material.map.repeat.set(uvScaleX, uvScaleY);
            this.leftEye.material.needsUpdate = true;
        }
        
        // Обновляем UV для правого глаза
        if (this.rightEye.material.map) {
            this.rightEye.material.map.offset.set(uvOffsetX, uvOffsetY);
            this.rightEye.material.map.repeat.set(uvScaleX, uvScaleY);
            this.rightEye.material.needsUpdate = true;
        }
        
        console.log(`[Eyes] Эмоция изменена на: ${emotion}`);
    }
    
    // Показать направление движения
    showDirection(direction) {
        if (direction.x > 0.1) {
            this.updateEmotion('looking_right');
        } else if (direction.x < -0.1) {
            this.updateEmotion('looking_left');
        } else {
            this.updateEmotion('normal');
        }
    }
    
    // Показать агрессию
    showAggression() {
        this.updateEmotion('angry');
    }
    
    // Показать страх
    showFear() {
        this.updateEmotion('scared');
    }
    
    // Показать радость
    showHappiness() {
        this.updateEmotion('happy');
    }
    
    // Вернуться к нормальному состоянию
    showNormal() {
        this.updateEmotion('normal');
    }
    
    // Удалить глаза
    removeEyes() {
        if (this.leftEye) {
            // Удаляем из сцены, а не из сферы
            const scene = this.leftEye.parent;
            if (scene) {
                scene.remove(this.leftEye);
            }
            this.leftEye.geometry.dispose();
            this.leftEye.material.dispose();
            this.leftEye = null;
        }
        
        if (this.rightEye) {
            // Удаляем из сцены, а не из сферы  
            const scene = this.rightEye.parent;
            if (scene) {
                scene.remove(this.rightEye);
            }
            this.rightEye.geometry.dispose();
            this.rightEye.material.dispose();
            this.rightEye = null;
        }
        
        this.sphereMesh = null;
    }
}

// Глобальная система глаз
let globalEyeSystem = null;

export function initEyeSystem() {
    if (!globalEyeSystem) {
        globalEyeSystem = new EyeSystem();
    }
    return globalEyeSystem;
}

export function addEyesToSphere(sphereMesh) {
    console.log('[Eyes] addEyesToSphere вызвана для:', sphereMesh);
    
    if (!globalEyeSystem) {
        console.log('[Eyes] Инициализирую глобальную систему глаз');
        globalEyeSystem = initEyeSystem();
    }
    
    // Ждем загрузки текстуры
    const checkAndCreate = () => {
        if (globalEyeSystem.eyeTexture) {
            console.log('[Eyes] Текстура готова, создаю глаза');
            globalEyeSystem.createEyes(sphereMesh);
        } else {
            console.log('[Eyes] Ожидаю загрузки текстуры...');
            setTimeout(checkAndCreate, 100);
        }
    };
    
    checkAndCreate();
}

export function updateSphereEmotion(emotion) {
    if (globalEyeSystem) {
        globalEyeSystem.updateEmotion(emotion);
    }
}

export function showDirectionOnSphere(direction) {
    if (globalEyeSystem) {
        globalEyeSystem.showDirection(direction);
    }
}

export function showAggressionOnSphere() {
    if (globalEyeSystem) {
        globalEyeSystem.showAggression();
    }
}

export function showFearOnSphere() {
    if (globalEyeSystem) {
        globalEyeSystem.showFear();
    }
}

export function showHappinessOnSphere() {
    if (globalEyeSystem) {
        globalEyeSystem.showHappiness();
    }
}

export function showNormalOnSphere() {
    if (globalEyeSystem) {
        globalEyeSystem.showNormal();
    }
}

export function updateEyePositions() {
    if (globalEyeSystem) {
        globalEyeSystem.updateEyePositions();
    }
}

export { globalEyeSystem }; 