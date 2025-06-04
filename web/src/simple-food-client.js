// Простая клиентская система еды для Фазы 1
import * as THREE from 'three';

export class SimpleFoodClient {
    constructor(scene, world) {
        this.scene = scene;
        this.world = world;
        this.foodMeshes = new Map(); // foodID -> mesh

        // console.log('[SimpleFoodClient] Инициализирован');
    }

    // Обработка события создания новой еды
    handleFoodSpawned(foodItem) {
        // console.log('[SimpleFoodClient] Создание еды:', foodItem);
        
        if (this.foodMeshes.has(foodItem.id)) {
            console.warn('[SimpleFoodClient] Еда уже существует:', foodItem.id);
            return;
        }

        // Создаем простую сферу для еды
        const geometry = new THREE.SphereGeometry(foodItem.radius * 2, 8, 6);
        const material = new THREE.MeshBasicMaterial({ 
            color: foodItem.color,
            transparent: true,
            opacity: 0.8
        });
        
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(foodItem.x, foodItem.y, foodItem.z);
        
        // Добавляем простую анимацию (пульсация)
        mesh.userData = {
            id: foodItem.id,
            originalScale: 1.0,
            animationTime: 0
        };

        this.scene.add(mesh);
        this.foodMeshes.set(foodItem.id, mesh);

        // console.log('[SimpleFoodClient] Еда создана:', foodItem.id, 'в позиции', foodItem.x, foodItem.y, foodItem.z);
    }

    // Обработка события поедания еды
    handleFoodConsumed(playerID, foodID, massGain) {
        // console.log('[SimpleFoodClient] Еда съедена:', { playerID, foodID, massGain });
        
        const mesh = this.foodMeshes.get(foodID);
        if (!mesh) {
            console.warn('[SimpleFoodClient] Не найдена еда для удаления:', foodID);
            return;
        }

        // Простая анимация исчезновения
        this.animateDisappear(mesh, () => {
            this.scene.remove(mesh);
            this.foodMeshes.delete(foodID);
            
            // Очищаем геометрию и материал
            mesh.geometry.dispose();
            mesh.material.dispose();
        });

        // console.log('[SimpleFoodClient] Еда удалена:', foodID);
    }

    // Обработка полного состояния еды (при подключении)
    handleFoodState(foodItems) {
        // console.log('[SimpleFoodClient] Получено состояние еды:', foodItems);
        
        // Удаляем всю старую еду
        this.clearAllFood();
        
        // Создаем новую еду
        for (const [foodID, foodItem] of Object.entries(foodItems)) {
            this.handleFoodSpawned(foodItem);
        }
    }

    // Очистка всей еды
    clearAllFood() {
        for (const [foodID, mesh] of this.foodMeshes) {
            this.scene.remove(mesh);
            mesh.geometry.dispose();
            mesh.material.dispose();
        }
        this.foodMeshes.clear();
        // console.log('[SimpleFoodClient] Вся еда очищена');
    }

    // Анимация исчезновения
    animateDisappear(mesh, onComplete) {
        const startScale = mesh.scale.x;
        const duration = 300; // 300мс
        const startTime = Date.now();

        const animate = () => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / duration, 1);
            
            // Уменьшаем размер и прозрачность
            const scale = startScale * (1 - progress);
            mesh.scale.set(scale, scale, scale);
            mesh.material.opacity = 0.8 * (1 - progress);

            if (progress < 1) {
                requestAnimationFrame(animate);
            } else {
                onComplete();
            }
        };

        animate();
    }

    // Обновление анимаций (вызывается каждый кадр)
    update(deltaTime) {
        const time = Date.now() * 0.001; // Время в секундах

        for (const [foodID, mesh] of this.foodMeshes) {
            // Простая пульсация
            const pulseSpeed = 2.0;
            const pulseAmount = 0.1;
            const scale = 1.0 + Math.sin(time * pulseSpeed) * pulseAmount;
            
            mesh.scale.set(scale, scale, scale);

            // Небольшое вращение
            mesh.rotation.y += deltaTime * 0.5;
        }
    }

    // Получить количество еды
    getFoodCount() {
        return this.foodMeshes.size;
    }

    // Проверка существования еды
    hasFoodItem(foodID) {
        return this.foodMeshes.has(foodID);
    }
} 