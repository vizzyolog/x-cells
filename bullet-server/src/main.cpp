#include <iostream>
#include <memory>
#include <grpcpp/grpcpp.h>
#include "generated/physics.grpc.pb.h"
#include <btBulletDynamicsCommon.h>
#include <vector>
#include <thread>
#include <atomic>
#include <chrono>
#include <BulletCollision/CollisionShapes/btHeightfieldTerrainShape.h>
#include <csignal>  // Для signal()
#include <mutex>

using grpc::Server;
using grpc::ServerBuilder;
using grpc::ServerContext;
using grpc::Status;
using physics::Physics;
using physics::CreateObjectRequest;
using physics::CreateObjectResponse;
using physics::ShapeDescriptor;
using physics::ApplyTorqueRequest;
using physics::ApplyTorqueResponse;
using physics::GetObjectStateRequest;
using physics::GetObjectStateResponse;
using physics::ObjectState;
using physics::ApplyImpulseRequest;
using physics::ApplyImpulseResponse;
using physics::GetPhysicsConfigRequest;
using physics::GetPhysicsConfigResponse;
using physics::SetPhysicsConfigRequest;
using physics::SetPhysicsConfigResponse;
using physics::PhysicsConfigData;
using physics::UpdateObjectRequest;
using physics::UpdateObjectResponse;
using physics::StepSimulationRequest;
using physics::StepSimulationResponse;
using physics::Object;
using physics::Position;
using physics::Rotation;
using physics::Velocity;
using physics::ObjectRequest;
using physics::ObjectResponse;

// Структура для хранения конфигурации физики
struct PhysicsConfig {
    float baseImpulse;
    float maxImpulse;
    float distanceMultiplier;
    float impulseMultiplier;
    float maxSpeed;
    float restitution;
    float maxImpulseMagnitude;
    float terrainRestitution;
    float objectRestitution;
    float friction;
    float rollingFriction;
    float linearDamping;
    float angularDamping;
    float ccdMotionThresholdFactor;
    float ccdSweptSphereRadiusFactor;
    float minSpeedFactor;
    float stepSimulationRate;
    float ccdMotionThreshold;
    float ccdSweptSphereRadius;
};

class PhysicsServiceImpl final : public Physics::Service {
private:
    btDefaultCollisionConfiguration* collisionConfiguration;
    btCollisionDispatcher* dispatcher;
    btBroadphaseInterface* overlappingPairCache;
    btSequentialImpulseConstraintSolver* solver;
    btDiscreteDynamicsWorld* dynamicsWorld;
    
    // Хранилище для созданных объектов
    std::map<std::string, btRigidBody*> objects;
    // Хранилище для максимальных скоростей объектов
    std::map<std::string, float> maxSpeeds;
    // Хранилище для состояний движения
    std::map<std::string, btDefaultMotionState*> motionStates;
    // Хранилище для форм
    std::map<std::string, btCollisionShape*> collision_shapes;

    std::thread* simulationThread;
    std::thread* configUpdateThread; // Новый поток для обновления конфигурации
    std::atomic<bool> isRunning;
    const float timeStep = 1.0f/60.0f; // 60 Hz
    
    // Переменные для регулярного вывода позиции
    std::chrono::time_point<std::chrono::steady_clock> lastPositionLogTime;
    const std::chrono::milliseconds positionLogInterval{1000}; // Интервал 1 секунда

    // Конфигурация физики
    PhysicsConfig config;
    std::mutex configMutex; // Мьютекс для безопасного доступа к конфигурации
    
    // Адрес Go сервера
    std::string goServerAddress;

    // Инициализация конфигурации по умолчанию
    void initDefaultConfig() {
        std::cout << "Попытка получения настроек физики от Go-сервера (" << goServerAddress << ")..." << std::endl;
        
        // Пытаемся подключиться к Go-серверу и получить настройки
        bool configReceived = false;
        
        try {
            // Создаем клиентское соединение с Go-сервером
            auto channel = grpc::CreateChannel(goServerAddress, grpc::InsecureChannelCredentials());
            
            // Создаем клиентский стаб
            std::unique_ptr<physics::Physics::Stub> stub = physics::Physics::NewStub(channel);
            
            // Создаем запрос на получение конфигурации
            physics::GetPhysicsConfigRequest request;
            physics::GetPhysicsConfigResponse response;
            grpc::ClientContext context;
            
            // Устанавливаем таймаут 5 секунд
            auto deadline = std::chrono::system_clock::now() + std::chrono::seconds(5);
            context.set_deadline(deadline);
            
            // Отправляем запрос
            grpc::Status status = stub->GetPhysicsConfig(&context, request, &response);
            
            // Если запрос успешен, обновляем конфигурацию
            if (status.ok()) {
                updateConfigFromProto(response.config());
                configReceived = true;
                std::cout << "Получена конфигурация физики от Go-сервера:" << std::endl;
                std::cout << "BaseImpulse: " << config.baseImpulse << std::endl;
                std::cout << "MaxImpulse: " << config.maxImpulse << std::endl;
                std::cout << "MaxSpeed: " << config.maxSpeed << std::endl;
                // ... другие параметры
            }
        } catch (const std::exception& e) {
            std::cerr << "Ошибка при получении конфигурации от Go-сервера: " << e.what() << std::endl;
        }
        
        // Если не удалось получить конфигурацию, используем значения по умолчанию
        if (!configReceived) {
            std::cout << "Невозможно получить конфигурацию от Go-сервера, используем значения по умолчанию" << std::endl;
            config.baseImpulse = 20.0f;
            config.maxImpulse = 50.0f;
            config.distanceMultiplier = 0.3f;
            config.impulseMultiplier = 0.5f;
            config.maxSpeed = 80.0f;
            config.restitution = 0.7f;
            config.maxImpulseMagnitude = 1000.0f;
            config.terrainRestitution = 0.6f;
            config.objectRestitution = 0.98f;
            config.friction = 0.2f;
            config.rollingFriction = 0.05f;
            config.linearDamping = 0.0f;
            config.angularDamping = 0.0f;
            config.ccdMotionThresholdFactor = 0.7f;
            config.ccdSweptSphereRadiusFactor = 0.6f;
            config.minSpeedFactor = 0.3f;
            config.stepSimulationRate = 1.0f / 60.0f;
            config.ccdMotionThreshold = 0.0f;
            config.ccdSweptSphereRadius = 0.0f;
        }
    }

    // Преобразование proto конфигурации в локальную
    void updateConfigFromProto(const PhysicsConfigData& protoConfig) {
        config.baseImpulse = protoConfig.base_impulse();
        config.maxImpulse = protoConfig.max_impulse();
        config.distanceMultiplier = protoConfig.distance_multiplier();
        config.impulseMultiplier = protoConfig.impulse_multiplier();
        config.maxSpeed = protoConfig.max_speed();
        config.restitution = protoConfig.restitution();
        config.maxImpulseMagnitude = protoConfig.max_impulse_magnitude();
        config.terrainRestitution = protoConfig.terrain_restitution();
        config.objectRestitution = protoConfig.object_restitution();
        config.friction = protoConfig.friction();
        config.rollingFriction = protoConfig.rolling_friction();
        config.linearDamping = protoConfig.linear_damping();
        config.angularDamping = protoConfig.angular_damping();
        config.ccdMotionThresholdFactor = protoConfig.ccd_motion_threshold_factor();
        config.ccdSweptSphereRadiusFactor = protoConfig.ccd_swept_sphere_radius_factor();
        config.minSpeedFactor = protoConfig.min_speed_factor();
        config.stepSimulationRate = protoConfig.step_simulation_rate();
        config.ccdMotionThreshold = protoConfig.ccd_motion_threshold();
        config.ccdSweptSphereRadius = protoConfig.ccd_swept_sphere_radius();

        // Обновляем максимальные скорости для всех объектов
        for (auto& pair : maxSpeeds) {
            pair.second = config.maxSpeed;
        }

        std::cout << "Конфигурация физики обновлена. Максимальная скорость: " 
                  << config.maxSpeed << " м/с" << std::endl;
    }

    // Преобразование локальной конфигурации в proto
    void fillProtoConfig(PhysicsConfigData* protoConfig) {
        protoConfig->set_base_impulse(config.baseImpulse);
        protoConfig->set_max_impulse(config.maxImpulse);
        protoConfig->set_distance_multiplier(config.distanceMultiplier);
        protoConfig->set_impulse_multiplier(config.impulseMultiplier);
        protoConfig->set_max_speed(config.maxSpeed);
        protoConfig->set_restitution(config.restitution);
        protoConfig->set_max_impulse_magnitude(config.maxImpulseMagnitude);
        protoConfig->set_terrain_restitution(config.terrainRestitution);
        protoConfig->set_object_restitution(config.objectRestitution);
        protoConfig->set_friction(config.friction);
        protoConfig->set_rolling_friction(config.rollingFriction);
        protoConfig->set_linear_damping(config.linearDamping);
        protoConfig->set_angular_damping(config.angularDamping);
        protoConfig->set_ccd_motion_threshold_factor(config.ccdMotionThresholdFactor);
        protoConfig->set_ccd_swept_sphere_radius_factor(config.ccdSweptSphereRadiusFactor);
        protoConfig->set_min_speed_factor(config.minSpeedFactor);
        protoConfig->set_step_simulation_rate(config.stepSimulationRate);
        protoConfig->set_ccd_motion_threshold(config.ccdMotionThreshold);
        protoConfig->set_ccd_swept_sphere_radius(config.ccdSweptSphereRadius);
    }

    btCollisionShape* createTerrainShape(const physics::TerrainData& terrainData) {
        int width = terrainData.width();
        int depth = terrainData.depth();
        
        // Параметры масштабирования
        float scaleX = terrainData.scale_x();
        float scaleY = terrainData.scale_y();
        float scaleZ = terrainData.scale_z();
        
        // Параметры высоты
        float minHeight = terrainData.min_height();
        float maxHeight = terrainData.max_height();
        
        // Если значения не указаны, вычисляем их из данных
        if (minHeight == 0 && maxHeight == 0 && terrainData.heightmap_size() > 0) {
            minHeight = terrainData.heightmap(0);
            maxHeight = terrainData.heightmap(0);
            
            // Находим минимальную и максимальную высоту
            for (int i = 1; i < terrainData.heightmap_size(); i++) {
                float height = terrainData.heightmap(i);
                if (height < minHeight) minHeight = height;
                if (height > maxHeight) maxHeight = height;
            }
        }
        
        // Если масштаб не указан, используем значения по умолчанию
        if (scaleX == 0) scaleX = 1.0f;
        if (scaleY == 0) scaleY = 1.0f;
        if (scaleZ == 0) scaleZ = 1.0f;
        
        std::cout << "Creating terrain shape with:" << std::endl;
        std::cout << "  Width: " << width << ", Depth: " << depth << std::endl;
        std::cout << "  Scale: [" << scaleX << ", " << scaleY << ", " << scaleZ << "]" << std::endl;
        std::cout << "  Height range: [" << minHeight << ", " << maxHeight << "]" << std::endl;
        std::cout << "  Heightmap size: " << terrainData.heightmap_size() << std::endl;
        
        // Создаем форму террейна
        btHeightfieldTerrainShape* terrainShape = new btHeightfieldTerrainShape(
            width,                       // ширина
            depth,                       // глубина
            terrainData.heightmap().data(), // данные высот
            scaleY,                      // масштаб высоты
            minHeight,                   // минимальная высота
            maxHeight,                   // максимальная высота
            1,                           // вертикальная ось (Y = 1)
            PHY_FLOAT,                   // тип данных
            false                        // флип треугольников
        );
        
        // Устанавливаем локальное масштабирование
        terrainShape->setLocalScaling(btVector3(scaleX, scaleY, scaleZ));
        terrainShape->setMargin(0.5f);
        
        // Дополнительная диагностика
        std::cout << "Terrain shape created successfully" << std::endl;
        std::cout << "  Local scaling: [" << scaleX << ", " << scaleY << ", " << scaleZ << "]" << std::endl;
        std::cout << "  Margin: 0.5" << std::endl;
        
        return terrainShape;
    }

    // Вспомогательный метод для конвертации proto кватерниона в btQuaternion
    btQuaternion convertQuaternion(const physics::Quaternion& q) {
        return btQuaternion(q.x(), q.y(), q.z(), q.w());
    }

    // Вспомогательный метод для конвертации proto вектора в btVector3
    btVector3 convertVector3(const physics::Vector3& v) {
        return btVector3(v.x(), v.y(), v.z());
    }

    btRigidBody* createRigidBody(const ShapeDescriptor& desc, 
                                const physics::Vector3& position,
                                const physics::Quaternion& rotation) {
        btCollisionShape* shape = nullptr;
        btScalar mass = 0.0f;

        switch (desc.type()) {
            case ShapeDescriptor::SPHERE: {
                const auto& sphereData = desc.sphere();
                shape = new btSphereShape(sphereData.radius());
                mass = sphereData.mass();
                break;
            }
            case ShapeDescriptor::BOX: {
                const auto& boxData = desc.box();
                shape = new btBoxShape(btVector3(
                    boxData.width() / 2.0f,
                    boxData.height() / 2.0f,
                    boxData.depth() / 2.0f
                ));
                mass = boxData.mass();
                break;
            }
            case ShapeDescriptor::TERRAIN: {
                const auto& terrainData = desc.terrain();
                shape = createTerrainShape(terrainData);
                mass = 0.0f; // Terrain всегда статичен
                std::cout << "[C++] Создаем террейн" << std::endl;
                
                // Специальная обработка для террейна
                // Смещаем позицию вниз на половину высоты, чтобы верхняя точка была на уровне Y=0
                float terrainHeight = terrainData.max_height() * terrainData.scale_y();
                if (terrainHeight <= 0) terrainHeight = 1.0f; // Безопасное значение по умолчанию
                
                std::cout << "[C++] Террейн имеет высоту " << terrainHeight << std::endl;
                break;
            }
            default:
                std::cerr << "Неизвестный тип формы: " << desc.type() << std::endl;
                return nullptr;
        }

        // Проверяем, что shape был создан
        if (!shape) {
            std::cerr << "Не удалось создать физическую форму" << std::endl;
            return nullptr;
        }

        // Создаем трансформацию с учетом позиции И вращения
        btTransform transform;
        transform.setIdentity();
        transform.setOrigin(convertVector3(position));
        transform.setRotation(convertQuaternion(rotation));

        // Вычисляем инерцию для динамических объектов
        btVector3 localInertia(0, 0, 0);
        if (mass != 0.0f) {
            shape->calculateLocalInertia(mass, localInertia);
        }

        // Создаем motion state с полной трансформацией
        btDefaultMotionState* motionState = new btDefaultMotionState(transform);

        btRigidBody::btRigidBodyConstructionInfo rbInfo(
            mass, motionState, shape, localInertia);
        
        btRigidBody* body = new btRigidBody(rbInfo);

        // Дополнительные настройки для разных типов объектов
        if (desc.type() == ShapeDescriptor::TERRAIN) {
            body->setCollisionFlags(body->getCollisionFlags() | 
                                  btCollisionObject::CF_STATIC_OBJECT);
            body->setRestitution(config.terrainRestitution); // Используем значение из конфигурации
        } else if (mass != 0.0f) {
            // Для динамических объектов включаем угловое движение
            body->setAngularFactor(btVector3(1.0f, 1.0f, 1.0f));
            body->setDamping(config.linearDamping, config.angularDamping);  // Используем значения из конфигурации
            body->setActivationState(DISABLE_DEACTIVATION); // Отключаем деактивацию
            
            // Устанавливаем значения из конфигурации
            body->setRestitution(config.objectRestitution);
            body->setFriction(config.friction);
            body->setRollingFriction(config.rollingFriction);

            // Активируем обнаружение непрерывных столкновений для высоких скоростей
            if (desc.type() == ShapeDescriptor::SPHERE) {
                body->setCcdMotionThreshold(desc.sphere().radius() * config.ccdMotionThresholdFactor);
                body->setCcdSweptSphereRadius(desc.sphere().radius() * config.ccdSweptSphereRadiusFactor);
            }
        }

        dynamicsWorld->addRigidBody(body);
        return body;
    }

    // Конвертация btVector3 в proto Vector3
    physics::Vector3* convertToProtoVector3(const btVector3& v, physics::Vector3* proto_v) {
        proto_v->set_x(v.x());
        proto_v->set_y(v.y());
        proto_v->set_z(v.z());
        return proto_v;
    }

    // Конвертация btQuaternion в proto Quaternion
    physics::Quaternion* convertToProtoQuaternion(const btQuaternion& q, physics::Quaternion* proto_q) {
        proto_q->set_x(q.x());
        proto_q->set_y(q.y());
        proto_q->set_z(q.z());
        proto_q->set_w(q.w());
        return proto_q;
    }

    // Получение состояния объекта
    bool getObjectState(const std::string& id, ObjectState* state) {
        auto it = objects.find(id);
        if (it == objects.end()) {
            return false;
        }

        btRigidBody* body = it->second;
        btTransform transform;
        
        // Получаем текущую трансформацию
        if (body && body->getMotionState()) {
            body->getMotionState()->getWorldTransform(transform);
        } else {
            transform = body->getWorldTransform();
        }

        // Заполняем позицию
        convertToProtoVector3(transform.getOrigin(), state->mutable_position());
        
        // Заполняем вращение
        convertToProtoQuaternion(transform.getRotation(), state->mutable_rotation());
        
        // Заполняем линейную и угловую скорости
        convertToProtoVector3(body->getLinearVelocity(), state->mutable_linear_velocity());
        convertToProtoVector3(body->getAngularVelocity(), state->mutable_angular_velocity());

        return true;
    }

    // Функция для вывода позиции объекта mainPlayer1
    void logMainPlayerPosition() {
        auto now = std::chrono::steady_clock::now();
        
        // Проверяем, прошел ли заданный интервал времени
        if (now - lastPositionLogTime < positionLogInterval) {
            return;
        }
        
        // Обновляем время последнего вывода
        lastPositionLogTime = now;
        
        // Проверяем наличие объекта mainPlayer1
        auto it = objects.find("mainPlayer1");
        if (it == objects.end()) {
            return;
        }
        
        btRigidBody* body = it->second;
        btTransform transform;
        
        // Получаем текущую трансформацию
        if (body && body->getMotionState()) {
            body->getMotionState()->getWorldTransform(transform);
        } else {
            transform = body->getWorldTransform();
        }
        
        // Получаем позицию
        const btVector3& position = transform.getOrigin();
        
        // Получаем линейную скорость
        const btVector3& velocity = body->getLinearVelocity();
        
        // Выводим позицию и скорость
        std::cout << "[C++] Позиция mainPlayer1 в мире Bullet: "
                  << "X: " << position.x() << ", "
                  << "Y: " << position.y() << ", "
                  << "Z: " << position.z() << std::endl;
                  
        std::cout << "[C++] Скорость mainPlayer1 в мире Bullet: VX: " 
                  << velocity.x() << ", VY: " << velocity.y() << ", VZ: " << velocity.z() << std::endl;
    }

    // Функция, которая обрабатывает физическую симуляцию
    void simulationLoop() {
        using namespace std::chrono;
        
        auto lastFrameTime = steady_clock::now();
        auto lastPositionLogTime = steady_clock::now();
        const milliseconds positionLogInterval{1000}; // Логирование каждую секунду
        
        while (isRunning) {
            auto now = steady_clock::now();
            float deltaTime = duration_cast<duration<float>>(now - lastFrameTime).count();
            lastFrameTime = now;
            
            // Ограничиваем deltaTime для стабильности (не больше 1/30 секунды)
            if (deltaTime > 1.0f / 30.0f) {
                deltaTime = 1.0f / 30.0f;
            }
            
            // Защитная проверка от слишком маленького deltaTime
            if (deltaTime < 0.001f) {
                deltaTime = 0.001f;
            }
            
            // Выполняем шаг симуляции с фиксированным таймстепом
            dynamicsWorld->stepSimulation(deltaTime, 10);
            
            // Проверяем и ограничиваем скорости объектов
            for (auto& pair : objects) {
                btRigidBody* body = pair.second;
                std::string objectId = pair.first;
                
                // Пропускаем статические объекты
                if (body->isStaticObject()) {
                    continue;
                }
                
                // Получаем текущую скорость объекта
                btVector3 velocity = body->getLinearVelocity();
                float speed = velocity.length();
                
                // Получаем максимально допустимую скорость для объекта
                float maxSpeed = config.maxSpeed;
                auto it = maxSpeeds.find(objectId);
                if (it != maxSpeeds.end()) {
                    maxSpeed = it->second;
                }
                
                // Если скорость превышает максимальную, уменьшаем её
                if (speed > maxSpeed && speed > 0.1f) {
                    velocity *= (maxSpeed / speed);
                    body->setLinearVelocity(velocity);
                }
                
                // Проверяем позицию объекта на NaN или бесконечность
                btTransform transform;
                body->getMotionState()->getWorldTransform(transform);
                btVector3 position = transform.getOrigin();
                
                // Если позиция содержит NaN или бесконечность, сбрасываем её
                if (std::isnan(position.x()) || std::isnan(position.y()) || std::isnan(position.z()) ||
                    std::isinf(position.x()) || std::isinf(position.y()) || std::isinf(position.z())) {
                    std::cout << "[C++] Обнаружена некорректная позиция для " << objectId 
                              << ". Сброс позиции и скорости." << std::endl;
                    
                    // Сбрасываем позицию и скорость
                    transform.setOrigin(btVector3(0, 0, 0));
                    body->setWorldTransform(transform);
                    body->setLinearVelocity(btVector3(0, 0, 0));
                    body->setAngularVelocity(btVector3(0, 0, 0));
                    
                    // Обновляем motion state
                    body->getMotionState()->setWorldTransform(transform);
                }
            }
            
            // Логирование позиций и скоростей объектов
            if (now - lastPositionLogTime > positionLogInterval) {
                lastPositionLogTime = now;
                
                for (const auto& pair : objects) {
                    std::string objectId = pair.first;
                    btRigidBody* body = pair.second;
                    
                    btTransform transform;
                    body->getMotionState()->getWorldTransform(transform);
                    btVector3 position = transform.getOrigin();
                    btVector3 velocity = body->getLinearVelocity();
                    
                    std::cout << "[C++] Позиция " << objectId << " в мире Bullet: X: " 
                              << position.x() << ", Y: " << position.y() 
                              << ", Z: " << position.z() << std::endl;
                    
                    std::cout << "[C++] Скорость " << objectId << " в мире Bullet: VX: " 
                              << velocity.x() << ", VY: " << velocity.y() 
                              << ", VZ: " << velocity.z() << std::endl;
                }
            }
            
            // Короткая пауза для снижения нагрузки на процессор
            std::this_thread::sleep_for(milliseconds(5));
        }
    }

    // Ограничение скорости всех динамических объектов
    void applySpeedLimits() {
        // Захватываем мьютекс для чтения конфигурации
        std::lock_guard<std::mutex> lock(configMutex);
        
        for (auto& pair : objects) {
            std::string id = pair.first;
            btRigidBody* body = pair.second;
            
            if (!body || !body->isActive()) continue;
            
            // Получаем текущую скорость
            btVector3 velocity = body->getLinearVelocity();
            float speed = velocity.length();
            
            // Проверяем, есть ли для этого объекта максимальная скорость
            auto it = maxSpeeds.find(id);
            if (it != maxSpeeds.end()) {
                float maxSpeed = it->second;
                
                // Если скорость превышает максимальную, ограничиваем её
                if (speed > maxSpeed && speed > 0) {
                    // Логируем неожиданно высокую скорость
                    if (speed > maxSpeed * 2) {
                        std::cout << "ВНИМАНИЕ: Чрезмерная скорость у объекта " << id 
                                  << ": " << speed << " м/с, ограничиваем до " << maxSpeed << " м/с" << std::endl;
                    }
                    
                    // Жестко ограничиваем скорость, сохраняя направление
                    velocity *= (maxSpeed / speed);
                    body->setLinearVelocity(velocity);
                    
                    // Также сбрасываем угловую скорость, если она слишком велика
                    btVector3 angVel = body->getAngularVelocity();
                    float angSpeed = angVel.length();
                    if (angSpeed > 10.0f) {
                        angVel *= (10.0f / angSpeed);
                        body->setAngularVelocity(angVel);
                    }
                }
            }
        }
    }

    // Установка максимальной скорости объекта
    void setObjectMaxSpeed(const std::string& id, float maxSpeed) {
        maxSpeeds[id] = maxSpeed;
    }

    // Обновление массы существующего объекта
    bool updateObjectMass(const std::string& id, float mass) {
        auto it = objects.find(id);
        if (it == objects.end()) {
            std::cout << "Объект не найден: " << id << std::endl;
            return false;
        }

        btRigidBody* body = it->second;
        
        // Проверяем, что объект не статический
        if (body->getInvMass() == 0) {
            std::cout << "Невозможно изменить массу статического объекта: " << id << std::endl;
            return false;
        }
        
        // Получаем текущую форму
        btCollisionShape* shape = body->getCollisionShape();
        
        // Сохраняем текущую позицию и вращение
        btTransform transform = body->getWorldTransform();
        
        // Вычисляем новую инерцию для новой массы
        btVector3 localInertia(0, 0, 0);
        shape->calculateLocalInertia(mass, localInertia);
        
        // Устанавливаем новую массу и инерцию
        body->setMassProps(mass, localInertia);
        
        // Обновляем максимальную скорость (используем значение из конфигурации)
        maxSpeeds[id] = config.maxSpeed;
        
        // Пересчитываем центр масс
        body->updateInertiaTensor();
        
        // Устанавливаем трансформацию обратно, чтобы избежать рывков
        body->setWorldTransform(transform);
        
        std::cout << "Обновлена масса объекта " << id << " на " << mass 
                  << ", максимальная скорость: " << config.maxSpeed << std::endl;
        
        return true;
    }

    // Функция для периодического обновления конфигурации
    void configUpdateLoop() {
        std::chrono::seconds updateInterval(10); // Обновление каждые 10 секунд
        
        while (isRunning) {
            try {
                // Создаем клиентское соединение с Go-сервером
                auto channel = grpc::CreateChannel(goServerAddress, grpc::InsecureChannelCredentials());
                
                // Создаем клиентский стаб
                std::unique_ptr<physics::Physics::Stub> stub = physics::Physics::NewStub(channel);
                
                // Создаем запрос на получение конфигурации
                physics::GetPhysicsConfigRequest request;
                physics::GetPhysicsConfigResponse response;
                grpc::ClientContext context;
                
                // Устанавливаем таймаут 5 секунд
                auto deadline = std::chrono::system_clock::now() + std::chrono::seconds(5);
                context.set_deadline(deadline);
                
                // Отправляем запрос
                grpc::Status status = stub->GetPhysicsConfig(&context, request, &response);
                
                // Если запрос успешен, обновляем конфигурацию
                if (status.ok()) {
                    // Безопасно обновляем конфигурацию
                    std::lock_guard<std::mutex> lock(configMutex);
                    updateConfigFromProto(response.config());
                    
                    // Выводим лог только если значения изменились
                    static float lastMaxSpeed = 0.0f;
                    if (lastMaxSpeed != config.maxSpeed) {
                        std::cout << "Обновлена конфигурация физики от Go-сервера:" << std::endl;
                        std::cout << "MaxSpeed: " << config.maxSpeed << " м/с" << std::endl;
                        lastMaxSpeed = config.maxSpeed;
                        
                        // Обновляем максимальные скорости для всех объектов
                        for (auto& pair : maxSpeeds) {
                            pair.second = config.maxSpeed;
                        }
                    }
                }
            } catch (const std::exception& e) {
                std::cerr << "Ошибка при обновлении конфигурации: " << e.what() << std::endl;
            }
            
            // Ждем до следующего обновления
            std::this_thread::sleep_for(updateInterval);
        }
    }

    Status StepSimulation(ServerContext* context, 
                        const StepSimulationRequest* request,
                        StepSimulationResponse* response) override {
        
        // Получаем шаг времени из запроса
        float timeStep = config.stepSimulationRate; // Значение по умолчанию
        
        if (request->time_step() > 0) {
            timeStep = request->time_step();
        }
        
        // Ограничиваем timeStep максимальным значением, чтобы избежать нестабильной симуляции
        if (timeStep > 1.0f / 30.0f) {
            timeStep = 1.0f / 30.0f;
        }
        
        // Максимальное количество подшагов и минимальный шаг времени для подшагов
        int maxSubSteps = 10;
        float fixedTimeStep = 1.0f / 240.0f;
        
        // Шаг симуляции с фиксированным временным шагом
        dynamicsWorld->stepSimulation(timeStep, maxSubSteps, fixedTimeStep);
        
        // Ограничиваем скорость объектов после симуляции
        for (auto& pair : objects) {
            const std::string& id = pair.first;
            btRigidBody* body = pair.second;
            
            // Пропускаем статические объекты (масса = 0)
            if (body->getInvMass() == 0) continue;
            
            // Проверяем, есть ли для этого объекта ограничение скорости
            float maxSpeed = config.maxSpeed; // Значение по умолчанию
            
            // Если для объекта установлена индивидуальная максимальная скорость
            if (maxSpeeds.find(id) != maxSpeeds.end()) {
                maxSpeed = maxSpeeds[id];
            }
            
            // Получаем текущую линейную скорость
            btVector3 velocity = body->getLinearVelocity();
            float speed = velocity.length();
            
            // Если скорость превышает максимальную, снижаем ее
            if (speed > maxSpeed && speed > 0) {
                velocity *= (maxSpeed / speed);
                body->setLinearVelocity(velocity);
            }
        }
        
        // Добавляем все объекты в ответ
        for (auto& pair : objects) {
            const std::string& id = pair.first;
            btRigidBody* body = pair.second;
            
            // Получаем трансформацию объекта
            btTransform transform;
            body->getMotionState()->getWorldTransform(transform);
            
            // Создаем объект для ответа
            Object* obj = response->add_objects();
            obj->set_id(id);
            
            // Устанавливаем позицию
            Position* pos = obj->mutable_position();
            btVector3 position = transform.getOrigin();
            pos->set_x(position.x());
            pos->set_y(position.y());
            pos->set_z(position.z());
            
            // Устанавливаем вращение
            Rotation* rot = obj->mutable_rotation();
            btQuaternion rotation = transform.getRotation();
            rot->set_x(rotation.x());
            rot->set_y(rotation.y());
            rot->set_z(rotation.z());
            rot->set_w(rotation.w());
            
            // Устанавливаем линейную скорость
            Velocity* lin_vel = obj->mutable_linear_velocity();
            btVector3 linearVelocity = body->getLinearVelocity();
            lin_vel->set_x(linearVelocity.x());
            lin_vel->set_y(linearVelocity.y());
            lin_vel->set_z(linearVelocity.z());
            
            // Устанавливаем угловую скорость
            Velocity* ang_vel = obj->mutable_angular_velocity();
            btVector3 angularVelocity = body->getAngularVelocity();
            ang_vel->set_x(angularVelocity.x());
            ang_vel->set_y(angularVelocity.y());
            ang_vel->set_z(angularVelocity.z());
        }
        
        // Устанавливаем статус ответа
        response->set_status("OK");
        response->set_message("Симуляция выполнена успешно");
        
        return Status::OK;
    }

public:
    PhysicsServiceImpl(const std::string& goServerAddr = "localhost:8080") 
        : isRunning(false), goServerAddress(goServerAddr) {
        // Инициализация конфигурации
        initDefaultConfig();
        
        // Инициализация Bullet Physics
        collisionConfiguration = new btDefaultCollisionConfiguration();
        dispatcher = new btCollisionDispatcher(collisionConfiguration);
        overlappingPairCache = new btDbvtBroadphase();
        solver = new btSequentialImpulseConstraintSolver;
        dynamicsWorld = new btDiscreteDynamicsWorld(
            dispatcher, overlappingPairCache, solver, collisionConfiguration);
        
        // Устанавливаем гравитацию по оси Y (как в Three.js)
        dynamicsWorld->setGravity(btVector3(0, -10.0f, 0));
        
        // Настраиваем максимальный шаг симуляции для стабильности
        dynamicsWorld->getSolverInfo().m_numIterations = 20;
        dynamicsWorld->getSolverInfo().m_splitImpulse = true;
        dynamicsWorld->getSolverInfo().m_splitImpulsePenetrationThreshold = -0.02f;
        
        std::cout << "Физическая симуляция настроена с гравитацией (0, -10, 0)" << std::endl;
        
        // Запускаем поток симуляции
        isRunning = true;
        simulationThread = new std::thread(&PhysicsServiceImpl::simulationLoop, this);
        
        // Запускаем поток обновления конфигурации
        configUpdateThread = new std::thread(&PhysicsServiceImpl::configUpdateLoop, this);
        
        std::cout << "Физическая симуляция запущена с макс. скоростью: " 
                  << config.maxSpeed << " м/с" << std::endl;
        std::cout << "Запущен поток обновления конфигурации (интервал: 10 сек)" << std::endl;
    }

    Status CreateObject(ServerContext* context, 
                       const CreateObjectRequest* request,
                       CreateObjectResponse* response) override {
        
        std::string objectId = request->id();
        
        // Проверяем, существует ли уже объект с таким ID
        if (objects.find(objectId) != objects.end()) {
            response->set_status("Error");
            response->set_message("Объект с ID " + objectId + " уже существует");
            return Status::OK;
        }
        
        // Проверяем наличие данных о форме
        if (!request->has_shape()) {
            response->set_status("Error");
            response->set_message("Данные о форме не указаны в запросе");
            return Status::OK;
        }
        
        // Получаем массу объекта
        float mass = 1.0f;
        if (request->mass() > 0) {
            mass = request->mass();
        }
        
        // Создаем форму объекта
        btCollisionShape* shape = nullptr;
        const auto& shapeData = request->shape();
        
        // Создаем форму в зависимости от типа
        if (shapeData.has_box()) {
            const auto& box = shapeData.box();
            btVector3 halfExtents(1.0f, 1.0f, 1.0f);
            
            if (box.width() > 0) halfExtents.setX(box.width() / 2.0f);
            if (box.height() > 0) halfExtents.setY(box.height() / 2.0f);
            if (box.depth() > 0) halfExtents.setZ(box.depth() / 2.0f);
            
            shape = new btBoxShape(halfExtents);
        } 
        else if (shapeData.has_sphere()) {
            const auto& sphere = shapeData.sphere();
            float radius = 1.0f;
            
            if (sphere.radius() > 0) {
                radius = sphere.radius();
            }
            
            shape = new btSphereShape(radius);
        }
        // Удаляем проверку на capsule, так как его нет в proto-файле
        else {
            // Если тип формы не поддерживается, используем сферу по умолчанию
            shape = new btSphereShape(1.0f);
        }
        
        // Сохраняем форму для последующего удаления
        collision_shapes[objectId] = shape;
        
        // Создаем начальную трансформацию
        btTransform transform;
        transform.setIdentity();
        
        // Устанавливаем начальную позицию
        if (request->has_position()) {
            const auto& pos = request->position();
            btVector3 position(0, 0, 0);
            
            position.setX(pos.x());
            position.setY(pos.y());
            position.setZ(pos.z());
            
            transform.setOrigin(position);
        }
        
        // Устанавливаем начальное вращение
        if (request->has_rotation()) {
            const auto& rot = request->rotation();
            btQuaternion rotation(0, 0, 0, 1); // Значение по умолчанию: без вращения
            
            rotation = btQuaternion(rot.x(), rot.y(), rot.z(), rot.w());
            
            transform.setRotation(rotation);
        }
        
        // Создаем состояние движения
        btDefaultMotionState* motionState = new btDefaultMotionState(transform);
        motionStates[objectId] = motionState;
        
        // Вычисляем локальную инерцию
        btVector3 localInertia(0, 0, 0);
        if (mass > 0) {
            shape->calculateLocalInertia(mass, localInertia);
        }
        
        // Создаем тело
        btRigidBody::btRigidBodyConstructionInfo rbInfo(mass, motionState, shape, localInertia);
        
        // Настраиваем параметры физики
        rbInfo.m_linearDamping = config.linearDamping;
        rbInfo.m_angularDamping = config.angularDamping;
        rbInfo.m_restitution = config.restitution;
        rbInfo.m_friction = config.friction;
        rbInfo.m_rollingFriction = config.rollingFriction;
        
        // Создаем и настраиваем тело
        btRigidBody* body = new btRigidBody(rbInfo);
        
        // Если это террейн или другой статический объект с нулевой массой
        if (mass == 0.0f) {
            // Устанавливаем флаг статического объекта
            body->setCollisionFlags(body->getCollisionFlags() | btCollisionObject::CF_STATIC_OBJECT);
            
            // Отключаем влияние гравитации
            body->setGravity(btVector3(0, 0, 0));
            
            // Устанавливаем нулевую скорость и блокируем её изменение
            body->setLinearVelocity(btVector3(0, 0, 0));
            body->setAngularVelocity(btVector3(0, 0, 0));
            
            // Дополнительно можно заблокировать все степени свободы
            body->setLinearFactor(btVector3(0, 0, 0));
            body->setAngularFactor(btVector3(0, 0, 0));
            
            std::cout << "[C++] Создан статический объект с ID: " << objectId << std::endl;
        }
        
        // Устанавливаем начальную линейную скорость
        if (request->has_linear_velocity() && mass > 0.0f) {
            const auto& vel = request->linear_velocity();
            btVector3 linearVel(0, 0, 0);
            
            linearVel.setX(vel.x());
            linearVel.setY(vel.y());
            linearVel.setZ(vel.z());
            
            body->setLinearVelocity(linearVel);
        }
        
        // Устанавливаем начальную угловую скорость
        if (request->has_angular_velocity() && mass > 0.0f) {
            const auto& vel = request->angular_velocity();
            btVector3 angularVel(0, 0, 0);
            
            angularVel.setX(vel.x());
            angularVel.setY(vel.y());
            angularVel.setZ(vel.z());
            
            body->setAngularVelocity(angularVel);
        }
        
        // Добавляем тело в мир с правильными группами коллизий
        if (mass == 0.0f) {
            // Статические объекты: группа 1, взаимодействуют со всеми
            dynamicsWorld->addRigidBody(body, 1, -1);
        } else {
            // Динамические объекты: группа 2, взаимодействуют со статическими (группа 1)
            dynamicsWorld->addRigidBody(body, 2, 1);
        }
        
        // Сохраняем тело в карте объектов
        objects[objectId] = body;
        
        // Устанавливаем максимальную скорость по умолчанию
        maxSpeeds[objectId] = config.maxSpeed;
        
        // Устанавливаем успешный статус в ответе
        response->set_status("OK");
        response->set_message("Объект успешно создан");
        
        return Status::OK;
    }

    Status ApplyTorque(ServerContext* context,
                      const ApplyTorqueRequest* request,
                      ApplyTorqueResponse* response) override {
        auto it = objects.find(request->id());
        if (it == objects.end()) {
            response->set_status("Объект не найден");
            return Status::OK;
        }

        btRigidBody* body = it->second;
        const auto& torque = request->torque();
        
        // Применяем крутящий момент
        body->applyTorque(btVector3(torque.x(), torque.y(), torque.z()));
        
        std::cout << "Применен крутящий момент к объекту " << request->id() 
                  << ": (" << torque.x() << ", " << torque.y() 
                  << ", " << torque.z() << ")" << std::endl;

        response->set_status("OK");
        return Status::OK;
    }

    Status GetObjectState(ServerContext* context,
                         const GetObjectStateRequest* request,
                         GetObjectStateResponse* response) override {
        if (getObjectState(request->id(), response->mutable_state())) {
            response->set_status("OK");
        } else {
            response->set_status("Объект не найден");
        }
        return Status::OK;
    }

    Status ApplyImpulse(ServerContext* context, 
                      const ApplyImpulseRequest* request,
                      ApplyImpulseResponse* response) override {
        std::string objectId = request->id();
        
        // Проверяем существование объекта
        if (objects.find(objectId) == objects.end()) {
            response->set_status("Error");
            response->set_message("Объект с ID " + objectId + " не найден");
            return Status::OK;
        }
        
        btRigidBody* body = objects[objectId];
        
        // Получаем импульс из запроса - всегда должен быть в запросе
        const auto& impulseData = request->impulse();
        btVector3 impulse(0, 0, 0);
        
        // Устанавливаем все компоненты
        impulse.setX(impulseData.x());
        impulse.setY(impulseData.y());
        impulse.setZ(impulseData.z());
        
        // Проверяем величину импульса
        float impulseMagnitude = impulse.length();
        float maxImpulseMagnitude = config.maxImpulseMagnitude;
        
        // Если импульс превышает максимально допустимый, масштабируем его
        if (impulseMagnitude > maxImpulseMagnitude) {
            std::cout << "[C++] Импульс превышает максимум: " << impulseMagnitude 
                      << " > " << maxImpulseMagnitude << ", масштабирование..." << std::endl;
            impulse *= (maxImpulseMagnitude / impulseMagnitude);
        }
        
        // Получаем точку приложения импульса
        btVector3 relativePos(0, 0, 0);
        if (request->has_relative_position()) {
            const auto& pos = request->relative_position();
            relativePos.setX(pos.x());
            relativePos.setY(pos.y());
            relativePos.setZ(pos.z());
        }
        
        // Применяем импульс
        if (relativePos.length() > 0.001f) {
            // Применяем импульс в определенной точке
            body->applyImpulse(impulse, relativePos);
        } else {
            // Применяем импульс к центру масс
            body->applyCentralImpulse(impulse);
        }
        
        // Активируем тело, если оно было деактивировано
        body->activate(true);
        
        // Настраиваем ответ
        response->set_status("OK");
        response->set_message("Импульс успешно применен");
        
        return Status::OK;
    }

    // Метод для получения текущей конфигурации физики
    Status GetPhysicsConfig(ServerContext* context,
                           const GetPhysicsConfigRequest* request,
                           GetPhysicsConfigResponse* response) override {
        fillProtoConfig(response->mutable_config());
        response->set_status("OK");
        return Status::OK;
    }

    // Метод для установки новой конфигурации физики
    Status SetPhysicsConfig(ServerContext* context, 
                       const SetPhysicsConfigRequest* request,
                       SetPhysicsConfigResponse* response) override {
        if (request->has_config()) {
            const PhysicsConfigData& configData = request->config();
            
            // Обновляем все параметры конфигурации одновременно
            config.baseImpulse = configData.base_impulse();
            std::cout << "Установлен baseImpulse: " << config.baseImpulse << std::endl;
            
            config.maxImpulse = configData.max_impulse();
            std::cout << "Установлен maxImpulse: " << config.maxImpulse << std::endl;
            
            config.maxSpeed = configData.max_speed();
            std::cout << "Установлен maxSpeed: " << config.maxSpeed << std::endl;
            
            config.linearDamping = configData.linear_damping();
            std::cout << "Установлен linearDamping: " << config.linearDamping << std::endl;
            
            // Обновляем параметр для всех существующих объектов
            for (auto& pair : objects) {
                btRigidBody* body = pair.second;
                body->setDamping(config.linearDamping, body->getAngularDamping());
            }
            
            config.angularDamping = configData.angular_damping();
            std::cout << "Установлен angularDamping: " << config.angularDamping << std::endl;
            
            // Обновляем параметр для всех существующих объектов
            for (auto& pair : objects) {
                btRigidBody* body = pair.second;
                body->setDamping(body->getLinearDamping(), config.angularDamping);
            }
            
            config.restitution = configData.restitution();
            std::cout << "Установлен restitution: " << config.restitution << std::endl;
            
            // Обновляем параметр для всех существующих объектов
            for (auto& pair : objects) {
                if (pair.first != "terrain") { // не для террейна
                    btRigidBody* body = pair.second;
                    body->setRestitution(config.restitution);
                }
            }
            
            config.friction = configData.friction();
            std::cout << "Установлен friction: " << config.friction << std::endl;
            
            // Обновляем параметр для всех существующих объектов
            for (auto& pair : objects) {
                btRigidBody* body = pair.second;
                body->setFriction(config.friction);
            }
            
            config.rollingFriction = configData.rolling_friction();
            std::cout << "Установлен rollingFriction: " << config.rollingFriction << std::endl;
            
            // Обновляем параметр для всех существующих объектов
            for (auto& pair : objects) {
                btRigidBody* body = pair.second;
                body->setRollingFriction(config.rollingFriction);
            }
            
            config.distanceMultiplier = configData.distance_multiplier();
            std::cout << "Установлен distanceMultiplier: " << config.distanceMultiplier << std::endl;
            
            config.impulseMultiplier = configData.impulse_multiplier();
            std::cout << "Установлен impulseMultiplier: " << config.impulseMultiplier << std::endl;
            
            config.maxImpulseMagnitude = configData.max_impulse_magnitude();
            std::cout << "Установлен maxImpulseMagnitude: " << config.maxImpulseMagnitude << std::endl;
            
            config.stepSimulationRate = configData.step_simulation_rate();
            std::cout << "Установлен stepSimulationRate: " << config.stepSimulationRate << std::endl;
            
            config.ccdMotionThreshold = configData.ccd_motion_threshold();
            std::cout << "Установлен ccdMotionThreshold: " << config.ccdMotionThreshold << std::endl;
            
            // Обновляем параметр для всех существующих объектов
            for (auto& pair : objects) {
                btRigidBody* body = pair.second;
                body->setCcdMotionThreshold(config.ccdMotionThreshold);
            }
            
            config.ccdSweptSphereRadius = configData.ccd_swept_sphere_radius();
            std::cout << "Установлен ccdSweptSphereRadius: " << config.ccdSweptSphereRadius << std::endl;
            
            // Обновляем параметр для всех существующих объектов
            for (auto& pair : objects) {
                btRigidBody* body = pair.second;
                body->setCcdSweptSphereRadius(config.ccdSweptSphereRadius);
            }
            
            config.minSpeedFactor = configData.min_speed_factor();
            std::cout << "Установлен minSpeedFactor: " << config.minSpeedFactor << std::endl;
            
            config.terrainRestitution = configData.terrain_restitution();
            std::cout << "Установлен terrainRestitution: " << config.terrainRestitution << std::endl;
            
            // Обновляем параметр только для террейна
            auto it = objects.find("terrain");
            if (it != objects.end()) {
                btRigidBody* terrain = it->second;
                terrain->setRestitution(config.terrainRestitution);
            }
            
            config.objectRestitution = configData.object_restitution();
            std::cout << "Установлен objectRestitution: " << config.objectRestitution << std::endl;
            
            // Обновляем параметр для всех объектов кроме террейна
            for (auto& pair : objects) {
                if (pair.first != "terrain") {
                    btRigidBody* body = pair.second;
                    body->setRestitution(config.objectRestitution);
                }
            }
            
            // Обновляем максимальные скорости для всех объектов
            for (auto& pair : maxSpeeds) {
                pair.second = config.maxSpeed;
            }
            
            response->set_status("OK");
            response->set_message("Конфигурация физики успешно обновлена");
        } else {
            response->set_status("Error");
            response->set_message("Данные конфигурации отсутствуют в запросе");
        }
        
        return Status::OK;
    }

    // Метод для проверки состояния симуляции
    bool isSimulationRunning() const {
        return isRunning;
    }

    ~PhysicsServiceImpl() {
        // Останавливаем потоки
        isRunning = false;
        
        if (simulationThread) {
            simulationThread->join();
            delete simulationThread;
        }
        
        if (configUpdateThread) {
            configUpdateThread->join();
            delete configUpdateThread;
        }

        // Очистка ресурсов
        for (auto& pair : objects) {
            dynamicsWorld->removeRigidBody(pair.second);
            delete pair.second->getMotionState();
            delete pair.second->getCollisionShape();
            delete pair.second;
        }
        
        delete dynamicsWorld;
        delete solver;
        delete overlappingPairCache;
        delete dispatcher;
        delete collisionConfiguration;
        
        std::cout << "Физическая симуляция остановлена" << std::endl;
    }

    Status GetObject(ServerContext* context, 
                   const physics::ObjectRequest* request,
                   physics::ObjectResponse* response) override {
        std::string id = request->id();
        auto it = objects.find(id);
        if (it == objects.end()) {
            response->set_status("ERROR: Object not found");
            return Status::OK;
        }

        btRigidBody* body = it->second;
        btTransform transform;
        body->getMotionState()->getWorldTransform(transform);
        btVector3 position = transform.getOrigin();
        btVector3 velocity = body->getLinearVelocity();
        
        // Проверяем NaN в координатах и заменяем их на нули
        float x = std::isnan(position.x()) ? 0.0f : position.x();
        float y = std::isnan(position.y()) ? 0.0f : position.y();
        float z = std::isnan(position.z()) ? 0.0f : position.z();
        
        // Создаем корректную позицию
        btVector3 safePosition(x, y, z);
        
        // Если обнаружен NaN, исправляем позицию объекта
        if (std::isnan(position.x()) || std::isnan(position.y()) || std::isnan(position.z())) {
            std::cout << "[C++] Исправление позиции NaN для объекта " << id << std::endl;
            transform.setOrigin(safePosition);
            body->getMotionState()->setWorldTransform(transform);
            body->setCenterOfMassTransform(transform);
            
            // Сбрасываем скорость, если позиция некорректна
            body->setLinearVelocity(btVector3(0, 0, 0));
            body->setAngularVelocity(btVector3(0, 0, 0));
            body->clearForces();
            
            // Устанавливаем значения в ответе из исправленной позиции
            response->set_x(0.0f);
            response->set_y(0.0f);
            response->set_z(0.0f);
        } else {
            // Если позиция корректна, используем её
            response->set_x(position.x());
            response->set_y(position.y());
            response->set_z(position.z());
        }
        
        // Остальные поля заполняем как обычно
        response->set_vx(velocity.x());
        response->set_vy(velocity.y());
        response->set_vz(velocity.z());
        
        btQuaternion rotation = transform.getRotation();
        response->set_qx(rotation.x());
        response->set_qy(rotation.y());
        response->set_qz(rotation.z());
        response->set_qw(rotation.w());

        response->set_status("OK");
        return Status::OK;
    }

    Status UpdateObject(ServerContext* context, 
                      const UpdateObjectRequest* request,
                      UpdateObjectResponse* response) override {
        std::string objectId = request->id();
        
        // Проверяем существование объекта
        if (objects.find(objectId) == objects.end()) {
            response->set_status("Error");
            response->set_message("Объект с ID " + objectId + " не найден");
            return Status::OK;
        }
        
        btRigidBody* body = objects[objectId];
        
        // Обновляем позицию, если она указана в запросе
        if (request->has_position()) {
            const auto& pos = request->position();
            btTransform transform = body->getWorldTransform();
            btVector3 currentPos = transform.getOrigin();
            
            // Обновляем все компоненты
            currentPos.setX(pos.x());
            currentPos.setY(pos.y());
            currentPos.setZ(pos.z());
            
            transform.setOrigin(currentPos);
            
            // Устанавливаем новую трансформацию и обновляем motion state
            body->setWorldTransform(transform);
            if (body->getMotionState()) {
                body->getMotionState()->setWorldTransform(transform);
            }
        }
        
        // Обновляем вращение, если оно указано в запросе
        if (request->has_rotation()) {
            const auto& rot = request->rotation();
            btTransform transform = body->getWorldTransform();
            
            // Используем кватернион напрямую
            transform.setRotation(btQuaternion(rot.x(), rot.y(), rot.z(), rot.w()));
            
            // Устанавливаем новую трансформацию и обновляем motion state
            body->setWorldTransform(transform);
            if (body->getMotionState()) {
                body->getMotionState()->setWorldTransform(transform);
            }
        }
        
        // Обновляем линейную скорость, если она указана в запросе
        if (request->has_linear_velocity()) {
            const auto& vel = request->linear_velocity();
            btVector3 currentVel = body->getLinearVelocity();
            
            // Обновляем все компоненты
            currentVel.setX(vel.x());
            currentVel.setY(vel.y());
            currentVel.setZ(vel.z());
            
            body->setLinearVelocity(currentVel);
        }
        
        // Обновляем угловую скорость, если она указана в запросе
        if (request->has_angular_velocity()) {
            const auto& vel = request->angular_velocity();
            btVector3 currentVel = body->getAngularVelocity();
            
            // Обновляем все компоненты
            currentVel.setX(vel.x());
            currentVel.setY(vel.y());
            currentVel.setZ(vel.z());
            
            body->setAngularVelocity(currentVel);
        }
        
        // Активируем тело, если оно было деактивировано
        body->activate(true);
        
        // Настраиваем ответ
        response->set_status("OK");
        response->set_message("Объект успешно обновлен");
        
        return Status::OK;
    }
};

void RunServer(const std::string& goServerAddress) {
    std::string server_address("0.0.0.0:50051");
    PhysicsServiceImpl service(goServerAddress);

    std::cout << "Bullet Physics Server v1.0.19" << std::endl;
    std::cout << "==========================" << std::endl;
    std::cout << "Сервер запущен на " << server_address << std::endl;
    std::cout << "Подключение к Go-серверу на " << goServerAddress << std::endl;

    ServerBuilder builder;
    builder.AddListeningPort(server_address, grpc::InsecureServerCredentials());
    builder.RegisterService(&service);

    std::unique_ptr<Server> server(builder.BuildAndStart());

    // Добавляем обработку сигналов для graceful shutdown
    signal(SIGINT, [](int) {
        std::cout << "\nПолучен сигнал завершения. Останавливаем сервер..." << std::endl;
        exit(0);
    });

    server->Wait();
}

int main(int argc, char** argv) {
    std::string goServerAddress = "localhost:8080"; // Вернули значение по умолчанию
    
    // Разбор аргументов командной строки
    if (argc > 1) {
        for (int i = 1; i < argc; i++) {
            std::string arg = argv[i];
            
            if (arg == "--go-server" && i + 1 < argc) {
                goServerAddress = argv[i + 1];
                i++; // Пропускаем следующий аргумент
            }
        }
    }
    
    RunServer(goServerAddress);
    return 0;
}