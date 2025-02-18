#!/bin/bash

# Добавляем системный путь к библиотекам
export DYLD_LIBRARY_PATH="/usr/lib:/usr/local/lib:/usr/local/opt/zlib/lib:$DYLD_LIBRARY_PATH"

# Проверяем наличие необходимых компонентов
if ! command -v protoc &> /dev/null; then
    echo "Ошибка: protoc не установлен"
    echo "Установите его с помощью: brew install protobuf"
    exit 1
fi

if ! command -v grpc_cpp_plugin &> /dev/null; then
    echo "Ошибка: grpc_cpp_plugin не установлен"
    echo "Установите его с помощью: brew install grpc"
    exit 1
fi

# Создаем директории для генерируемых файлов
mkdir -p ../bullet-server/generated

# Запускаем генерацию
protoc --cpp_out=../bullet-server/generated \
       --grpc_out=../bullet-server/generated \
       --plugin=protoc-gen-grpc=$(which grpc_cpp_plugin) \
       physics.proto

# Проверяем результат
if [ $? -eq 0 ]; then
    echo "C++ протофайлы успешно сгенерированы"
else
    echo "Ошибка при генерации C++ протофайлов"
    exit 1
fi