cmake_minimum_required(VERSION 3.10)

# Установка переменных для MacOS
set(CMAKE_OSX_ARCHITECTURES "arm64")
set(CMAKE_OSX_DEPLOYMENT_TARGET "14.0")
set(CMAKE_OSX_SYSROOT "/Applications/Xcode.app/Contents/Developer/Platforms/MacOSX.platform/Developer/SDKs/MacOSX.sdk")

project(bullet-server)

# Включаем поддержку C++
enable_language(CXX)
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Находим необходимые пакеты
find_package(Protobuf REQUIRED)
find_package(gRPC REQUIRED)
find_package(Bullet REQUIRED)

# Добавляем сгенерированные proto файлы
set(PROTO_SOURCES
    ${CMAKE_CURRENT_SOURCE_DIR}/generated/physics.pb.cc
    ${CMAKE_CURRENT_SOURCE_DIR}/generated/physics.grpc.pb.cc
)

# Добавляем исходные файлы из src
set(SOURCES
    ${CMAKE_CURRENT_SOURCE_DIR}/src/main.cpp  # Полный путь к main.cpp
    ${PROTO_SOURCES}
)

# Создаем исполняемый файл
add_executable(${PROJECT_NAME} ${SOURCES})

# Добавляем пути для включаемых файлов
target_include_directories(${PROJECT_NAME} PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}    # Корневая директория проекта
    ${Protobuf_INCLUDE_DIRS}
    ${gRPC_INCLUDE_DIRS}
    ${BULLET_INCLUDE_DIRS}  # Это должно включать все необходимые директории Bullet
)

# Линкуем необходимые библиотеки
target_link_libraries(${PROJECT_NAME}
    ${Protobuf_LIBRARIES}
    gRPC::grpc++
    ${BULLET_LIBRARIES}
)