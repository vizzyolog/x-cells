cmake_minimum_required(VERSION 3.10)
project(bullet_server CXX)

set(CMAKE_CXX_STANDARD 17)

# Включаем подробную информацию для отладки
set(CMAKE_VERBOSE_MAKEFILE ON)

# 1. Bullet Physics
find_package(Bullet REQUIRED)

# Проверяем пути, если Bullet не находится автоматически
if(NOT BULLET_FOUND)
    message(FATAL_ERROR "Bullet not found! Please install or provide paths.")
endif()

# 2. Protobuf
# Указываем путь к конфигурации Protobuf
set(Protobuf_DIR /usr/local/lib/cmake/protobuf)
find_package(Protobuf REQUIRED)

# Проверка наличия Protobuf
if(NOT Protobuf_FOUND)
    message(FATAL_ERROR "Protobuf not found! Ensure it is installed correctly.")
endif()

# 3. gRPC
# Указываем путь к конфигурации gRPC
set(gRPC_DIR /usr/local/lib/cmake/grpc)
find_package(gRPC CONFIG REQUIRED)

# Проверка наличия gRPC
if(NOT gRPC_FOUND)
    message(FATAL_ERROR "gRPC not found! Ensure it is installed correctly.")
endif()

# 4. Указываем сгенерированные файлы из protobuf
set(PROTO_SRCS
    "${CMAKE_CURRENT_SOURCE_DIR}/physics.pb.cc"
    "${CMAKE_CURRENT_SOURCE_DIR}/physics.grpc.pb.cc"
)

# Основной файл программы
set(SOURCE_FILES
    main.cpp
    ${PROTO_SRCS}
)

# Создаём исполняемый файл "bullet_server"
add_executable(bullet_server ${SOURCE_FILES})

# Подключаем заголовки для всех зависимостей
target_include_directories(bullet_server
    PRIVATE
        ${Protobuf_INCLUDE_DIRS}  # Protobuf
        ${BULLET_INCLUDE_DIRS}    # Bullet
)

# Линкуем библиотеки
target_link_libraries(bullet_server
    PRIVATE
        ${BULLET_LIBRARIES}        # Bullet
        protobuf::libprotobuf      # Protobuf
        gRPC::grpc++               # gRPC C++
        gRPC::grpc                 # gRPC C code
)

# Выводим отладочную информацию
message(STATUS "Protobuf_DIR: ${Protobuf_DIR}")
message(STATUS "gRPC_DIR: ${gRPC_DIR}")
message(STATUS "Bullet_INCLUDE_DIRS: ${BULLET_INCLUDE_DIRS}")
message(STATUS "Bullet_LIBRARIES: ${BULLET_LIBRARIES}")