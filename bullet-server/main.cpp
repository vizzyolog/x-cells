#include <iostream>
#include <thread>
#include <atomic>
#include <grpcpp/grpcpp.h>

// Заголовки Bullet
#include <btBulletDynamicsCommon.h>
#include <BulletCollision/CollisionShapes/btHeightfieldTerrainShape.h>

// Сгенерированные заголовки из protobuf
#include "physics.pb.h"
#include "physics.grpc.pb.h"

static const int TERRAIN_WIDTH = 64;
static const int TERRAIN_HEIGHT = 64;

using grpc::Server;
using grpc::ServerBuilder;
using grpc::ServerContext;
using grpc::Status;

using namespace physics; // Пространство имён protobuf

btDiscreteDynamicsWorld* gWorld = nullptr;
btRigidBody* gSphereBody = nullptr;
std::atomic<bool> gRunning(true);

float gHeightData[TERRAIN_WIDTH * TERRAIN_HEIGHT];

// Заполним высотный массив
void fillHeightData() {
    for (int z = 0; z < TERRAIN_HEIGHT; ++z) {
        for (int x = 0; x < TERRAIN_WIDTH; ++x) {
            float fx = x - TERRAIN_WIDTH / 2;
            float fz = z - TERRAIN_HEIGHT / 2;
            float h = 2.0f * sinf(fx * 0.1f) * cosf(fz * 0.1f);
            gHeightData[z * TERRAIN_WIDTH + x] = h;
        }
    }
}

// Создаём физический мир Bullet
void initBullet() {
    fillHeightData();

    auto config = new btDefaultCollisionConfiguration();
    auto dispatcher = new btCollisionDispatcher(config);
    auto broadphase = new btDbvtBroadphase();
    auto solver = new btSequentialImpulseConstraintSolver();

    gWorld = new btDiscreteDynamicsWorld(dispatcher, broadphase, solver, config);
    gWorld->setGravity(btVector3(0, -9.81f, 0));

    // Террейн
    auto terrainShape = new btHeightfieldTerrainShape(
        TERRAIN_WIDTH, TERRAIN_HEIGHT,
        gHeightData,
        1.0f,
        -10.0f,
        10.0f,
        1,
        PHY_FLOAT,
        false
    );
    terrainShape->setLocalScaling(btVector3(1.0f, 1.0f, 1.0f));

    btTransform tr;
    tr.setIdentity();
    tr.setOrigin(btVector3(0, 0, 0));
    auto motion = new btDefaultMotionState(tr);

    btRigidBody::btRigidBodyConstructionInfo ci(0.0f, motion, terrainShape);
    auto body = new btRigidBody(ci);
    gWorld->addRigidBody(body);

    // Сфера
    auto sphereShape = new btSphereShape(1.0f);
    btTransform startTrans;
    startTrans.setIdentity();
    startTrans.setOrigin(btVector3(0, 10, 0));

    float mass = 1.0f;
    btVector3 inertia(0, 0, 0);
    sphereShape->calculateLocalInertia(mass, inertia);

    auto motionSphere = new btDefaultMotionState(startTrans);
    btRigidBody::btRigidBodyConstructionInfo sphereCI(mass, motionSphere, sphereShape, inertia);
    gSphereBody = new btRigidBody(sphereCI);
    gSphereBody->setRestitution(0.2f);
    gWorld->addRigidBody(gSphereBody);

    std::cout << "[C++ Bullet] init done\n";
}

// gRPC сервис
class PhysicsServiceImpl final : public physics::Physics::Service {
public:
    Status ApplyImpulse(ServerContext* context, const ApplyImpulseRequest* request, ApplyImpulseResponse* response) override {
        if (!gSphereBody) {
            response->set_status("Sphere body not initialized");
            return Status::OK;
        }

        btVector3 impulse(request->impulse_x(), request->impulse_y(), request->impulse_z());
        gSphereBody->applyCentralImpulse(impulse);

        response->set_status("Impulse applied");
        return Status::OK;
    }

    Status GetState(ServerContext* context, const GetStateRequest* request, GetStateResponse* response) override {
        if (!gSphereBody) {
            return Status::OK;
        }

        btTransform trans;
        gSphereBody->getMotionState()->getWorldTransform(trans);
        auto origin = trans.getOrigin();
        auto rotation = trans.getRotation();

        response->set_x(origin.x());
        response->set_y(origin.y());
        response->set_z(origin.z());
        response->set_qx(rotation.x());
        response->set_qy(rotation.y());
        response->set_qz(rotation.z());
        response->set_qw(rotation.w());

        return Status::OK;
    }
};

int main() {
    initBullet();

    // gRPC сервер
    std::string serverAddress("0.0.0.0:50051");
    PhysicsServiceImpl service;

    grpc::ServerBuilder builder;
    builder.AddListeningPort(serverAddress, grpc::InsecureServerCredentials());
    builder.RegisterService(&service);

    std::unique_ptr<Server> server(builder.BuildAndStart());
    std::cout << "[C++-Server] Listening on " << serverAddress << std::endl;

    server->Wait();
    return 0;
}