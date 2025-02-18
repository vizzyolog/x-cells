#include <iostream>
#include <thread>
#include <atomic>
#include <unordered_map>

#include <grpcpp/grpcpp.h>
#include <btBulletDynamicsCommon.h>
#include <BulletCollision/CollisionShapes/btHeightfieldTerrainShape.h>

#include "generated/physics.pb.h"
#include "generated/physics.grpc.pb.h"

using grpc::Server;
using grpc::ServerBuilder;
using grpc::ServerContext;
using grpc::Status;

using namespace physics;

btDiscreteDynamicsWorld* gWorld = nullptr;
std::atomic<bool> gRunning(true);

// Словарь ID → RigidBody
std::unordered_map<std::string, btRigidBody*> gBodies;

// Фоновая функция: шаги симуляции
void simulateWorld() {
    while (gRunning) {
        if (gWorld) {
            gWorld->stepSimulation(1.f/60.f, 10);
        }
        std::this_thread::sleep_for(std::chrono::milliseconds(16));
    }
}

// Инициализация Bullet (пока без террейна)
void initBullet() {
    auto config = new btDefaultCollisionConfiguration();
    auto dispatcher = new btCollisionDispatcher(config);
    auto broadphase = new btDbvtBroadphase();
    auto solver = new btSequentialImpulseConstraintSolver();

    gWorld = new btDiscreteDynamicsWorld(dispatcher, broadphase, solver, config);
    gWorld->setGravity(btVector3(0, -9.81f, 0));

    std::cout << "[C++] Bullet init done\n";
}

class PhysicsServiceImpl final : public Physics::Service {
public:
    // Универсальное создание объекта
    Status CreateObject(ServerContext* ctx, const CreateObjectRequest* req, CreateObjectResponse* resp) override {
        std::string id = req->id();
        std::string type = req->object_type();
        float px = req->x(), py = req->y(), pz = req->z();
        float mass = req->mass();
        std::string color = req->color(); // для логов
        std::cout << "[CreateObject] id=" << id << " type=" << type
                  << " mass=" << mass << " color=" << color << std::endl;

        if (type == "sphere") {
            float radius = req->radius() > 0 ? req->radius() : 1.f;
            auto shape = new btSphereShape(radius);
            btTransform startTrans;
            startTrans.setIdentity();
            startTrans.setOrigin(btVector3(px, py, pz));

            btVector3 inertia(0,0,0);
            shape->calculateLocalInertia(mass, inertia);

            auto motion = new btDefaultMotionState(startTrans);
            btRigidBody::btRigidBodyConstructionInfo ci(mass, motion, shape, inertia);
            auto body = new btRigidBody(ci);

            gWorld->addRigidBody(body);
            gBodies[id] = body;
            resp->set_status("Sphere created: " + id);
        }
        else if (type == "terrain") {
            int w = req->heightmap_width();
            int h = req->heightmap_height();
            if (w <= 0 || h <= 0) {
                resp->set_status("Terrain dimension invalid");
                return Status::OK;
            }

            const float* data = req->height_data().data();

            // Читаем масштаб и диапазон высот из запроса
            float scaleX = req->scale_x() > 0 ? req->scale_x() : 1.0f;
            float scaleY = req->scale_y() > 0 ? req->scale_y() : 1.0f;
            float scaleZ = req->scale_z() > 0 ? req->scale_z() : 1.0f;
            float minHeight = req->min_height();
            float maxHeight = req->max_height();

            auto hfShape = new btHeightfieldTerrainShape(
                w, h,
                data,
                1.0f,
                minHeight, maxHeight,
                1,
                PHY_FLOAT,
                false
            );

            hfShape->setLocalScaling(btVector3(scaleX, scaleY, scaleZ));

            btTransform tr;
            tr.setIdentity();
            auto motion = new btDefaultMotionState(tr);

            btRigidBody::btRigidBodyConstructionInfo ci(0.f, motion, hfShape);
            auto body = new btRigidBody(ci);
            gWorld->addRigidBody(body);
            gBodies[id] = body;

            resp->set_status("Terrain created: " + id);
        }
        else if (type == "box") {
            float w = req->width() > 0 ? req->width() : 1.f;
            float h = req->height() > 0 ? req->height() : 1.f;
            float d = req->depth() > 0 ? req->depth() : 1.f;
            auto shape = new btBoxShape(btVector3(w/2, h/2, d/2));
            btTransform startTrans;
            startTrans.setIdentity();
            startTrans.setOrigin(btVector3(px, py, pz));

            btVector3 inertia(0,0,0);
            shape->calculateLocalInertia(mass, inertia);

            auto motion = new btDefaultMotionState(startTrans);
            btRigidBody::btRigidBodyConstructionInfo ci(mass, motion, shape, inertia);
            auto body = new btRigidBody(ci);

            gWorld->addRigidBody(body);
            gBodies[id] = body;
            resp->set_status("Box created: " + id);
        }
        else {
            resp->set_status("Unknown object type: " + type);
        }
        return Status::OK;
    }

    Status ApplyImpulse(ServerContext* ctx, const ApplyImpulseRequest* req, ApplyImpulseResponse* resp) override {
        auto it = gBodies.find(req->id());
        if (it == gBodies.end()) {
            resp->set_status("No such object: " + req->id());
            return Status::OK;
        }
        auto body = it->second;
        body->activate(true);
        body->applyCentralImpulse(btVector3(req->impulse_x(), req->impulse_y(), req->impulse_z()));

        std::cout << "[ApplyImpulse] id=" << req->id()
                  << " impulse=(" << req->impulse_x()
                  << "," << req->impulse_y()
                  << "," << req->impulse_z() << ")\n";

        resp->set_status("Impulse applied");
        return Status::OK;
    }

    Status GetState(ServerContext* ctx, const GetStateRequest* req, GetStateResponse* resp) override {
        auto it = gBodies.find(req->id());
        if (it == gBodies.end()) {
            return Status::OK;
        }
        auto body = it->second;
        btTransform trans;
        body->getMotionState()->getWorldTransform(trans);
        auto ori = trans.getOrigin();
        auto rot = trans.getRotation();

        resp->set_x(ori.x());
        resp->set_y(ori.y());
        resp->set_z(ori.z());
        resp->set_qx(rot.x());
        resp->set_qy(rot.y());
        resp->set_qz(rot.z());
        resp->set_qw(rot.w());
        return Status::OK;
    }

    Status Step(ServerContext* ctx, const StepRequest* req, StepResponse* resp) override {
        gWorld->stepSimulation(req->dt(), req->substeps(), req->dt()/req->substeps());
        resp->set_status("Stepped");
        return Status::OK;
    }
};

int main() {
    initBullet();
    std::thread physicsThread(simulateWorld);

    PhysicsServiceImpl service;
    grpc::ServerBuilder builder;
    builder.AddListeningPort("0.0.0.0:50051", grpc::InsecureServerCredentials());
    builder.RegisterService(&service);

    auto server = builder.BuildAndStart();
    std::cout << "[C++] Listening on 0.0.0.0:50051\n";

    server->Wait();
    gRunning = false;
    physicsThread.join();
    return 0;
}