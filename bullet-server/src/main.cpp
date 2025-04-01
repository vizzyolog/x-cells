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

class PhysicsServiceImpl final : public Physics::Service {
private:
    btDefaultCollisionConfiguration* collisionConfiguration;
    btCollisionDispatcher* dispatcher;
    btBroadphaseInterface* overlappingPairCache;
    btSequentialImpulseConstraintSolver* solver;
    btDiscreteDynamicsWorld* dynamicsWorld;
    
    // Хранилище для созданных объектов
    std::map<std::string, btRigidBody*> objects;

    std::thread* simulationThread;
    std::atomic<bool> isRunning;
    const float timeStep = 1.0f/60.0f; // 60 Hz
    
    // Переменные для регулярного вывода позиции
    std::chrono::time_point<std::chrono::steady_clock> lastPositionLogTime;
    const std::chrono::milliseconds positionLogInterval{1000}; // Интервал 1 секунда

    btCollisionShape* createTerrainShape(const physics::TerrainData& terrainData) {
        int width = terrainData.width();
        int depth = terrainData.depth();
        
        // Используем только существующие поля из proto
        float scaleX = terrainData.scale_x();
        float scaleY = terrainData.scale_y();
        float scaleZ = terrainData.scale_z();
        
        // Получаем или вычисляем min_height и max_height
        float minHeight = terrainData.min_height();
        float maxHeight = terrainData.max_height();
        
        // Если min и max не заданы (равны 0), вычисляем их из heightmap
        if (minHeight == 0 && maxHeight == 0 && terrainData.heightmap_size() > 0) {
            minHeight = terrainData.heightmap(0);
            maxHeight = terrainData.heightmap(0);
            
            // Находим минимум и максимум высоты в данных
            for (int i = 1; i < terrainData.heightmap_size(); i++) {
                float height = terrainData.heightmap(i);
                if (height < minHeight) minHeight = height;
                if (height > maxHeight) maxHeight = height;
            }
            
            // Добавляем небольшой запас для безопасности
            minHeight -= 1.0f;
            maxHeight += 1.0f;
        } else if (minHeight == 0 && maxHeight == 0) {
            // Если данных нет, используем разумные значения по умолчанию
            // minHeight = -10.0f;
            // maxHeight = 10.0f;
        }
        
        std::cout << "Creating terrain shape with:" << std::endl;
        std::cout << "Width: " << width << ", Depth: " << depth << std::endl;
        std::cout << "Scale: (" << scaleX << ", " 
                  << scaleY << ", " << scaleZ << ")" << std::endl;
        std::cout << "Height range: " << minHeight 
                  << " to " << maxHeight << std::endl;
        
        btHeightfieldTerrainShape* terrainShape = new btHeightfieldTerrainShape(
            width,                          // ширина
            depth,                          // глубина
            terrainData.heightmap().data(), // данные высот
            scaleY,                         // масштаб высоты
            minHeight,                      // используем вычисленные или заданные значения
            maxHeight,                      // вместо хардкода
            1,                              // up axis (1 = y)
            PHY_FLOAT,                      // тип данных высот
            false                           // flip quad edges
        );

        // Применяем масштаб
        terrainShape->setLocalScaling(btVector3(scaleX, scaleY, scaleZ));
        terrainShape->setMargin(0.5f);

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
        } else if (mass != 0.0f) {
            // Для динамических объектов включаем угловое движение
            body->setAngularFactor(btVector3(1.0f, 1.0f, 1.0f));
            body->setDamping(0.0f, 0.1f);  // Линейное и угловое затухание
            body->setActivationState(DISABLE_DEACTIVATION); // Отключаем деактивацию
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
                  
        std::cout << "[C++] Скорость mainPlayer1 в мире Bullet: "
                  << "VX: " << velocity.x() << ", "
                  << "VY: " << velocity.y() << ", "
                  << "VZ: " << velocity.z() << std::endl;
    }

    void simulationLoop() {
        auto lastTime = std::chrono::high_resolution_clock::now();
        
        // Инициализируем время последнего вывода позиции
        lastPositionLogTime = std::chrono::steady_clock::now();
        
        while (isRunning) {
            auto currentTime = std::chrono::high_resolution_clock::now();
            float deltaTime = std::chrono::duration<float>(currentTime - lastTime).count();
            
            // Обновляем физику
            dynamicsWorld->stepSimulation(deltaTime, 10);
            
            // Выводим позицию mainPlayer1
            logMainPlayerPosition();
            
            // Ждем, чтобы поддерживать стабильные 60 FPS
            auto frameTime = std::chrono::high_resolution_clock::now() - currentTime;
            auto sleepTime = std::chrono::duration<float>(timeStep) - frameTime;
            
            if (sleepTime > std::chrono::duration<float>(0)) {
                std::this_thread::sleep_for(std::chrono::duration_cast<std::chrono::milliseconds>(sleepTime));
            }
            
            lastTime = currentTime;
        }
    }

public:
    PhysicsServiceImpl() 
        : isRunning(false) {
        // Инициализация Bullet Physics
        collisionConfiguration = new btDefaultCollisionConfiguration();
        dispatcher = new btCollisionDispatcher(collisionConfiguration);
        overlappingPairCache = new btDbvtBroadphase();
        solver = new btSequentialImpulseConstraintSolver;
        dynamicsWorld = new btDiscreteDynamicsWorld(
            dispatcher, overlappingPairCache, solver, collisionConfiguration);
        
        // Устанавливаем гравитацию по оси Y (как в Three.js)
        dynamicsWorld->setGravity(btVector3(0, -9.81f, 0));
        
        // Запускаем поток симуляции
        isRunning = true;
        simulationThread = new std::thread(&PhysicsServiceImpl::simulationLoop, this);
        
        std::cout << "Физическая симуляция запущена" << std::endl;
    }

    Status CreateObject(ServerContext* context, 
                       const CreateObjectRequest* request,
                       CreateObjectResponse* response) override {
        std::cout << "Получен запрос на создание объекта: " << request->id() << std::endl;
        
        // Создаем физический объект
        btRigidBody* body = createRigidBody(
            request->shape(), 
            request->position(),
            request->rotation()
        );
        
        if (body == nullptr) {
            response->set_status("ERROR");
            return Status::OK;
        }

        // Сохраняем объект
        objects[request->id()] = body;
        response->set_status("OK");
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
        std::cout << "Applying impulse to object: " << request->id() << std::endl;
        
        auto it = objects.find(request->id());
        if (it == objects.end()) {
            response->set_status("ERROR: Object not found");
            return Status::OK;
        }

        btRigidBody* body = it->second;
        const auto& impulse = request->impulse();
        body->applyCentralImpulse(btVector3(impulse.x(), impulse.y(), impulse.z()));
        
        response->set_status("OK");
        return Status::OK;
    }

    // Метод для проверки состояния симуляции
    bool isSimulationRunning() const {
        return isRunning;
    }

    ~PhysicsServiceImpl() {
        // Останавливаем поток симуляции
        isRunning = false;
        if (simulationThread) {
            simulationThread->join();
            delete simulationThread;
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
};

void RunServer() {
    std::string server_address("0.0.0.0:50051");
    PhysicsServiceImpl service;

    std::cout << "Bullet Physics Server v1.0.19" << std::endl;
    std::cout << "==========================" << std::endl;
    std::cout << "Сервер запущен на " << server_address << std::endl;

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
    RunServer();
    return 0;
}