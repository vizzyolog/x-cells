#!/bin/bash

# Добавляем системные пути к библиотекам
export DYLD_LIBRARY_PATH="/usr/lib:/usr/local/lib:/usr/local/opt/zlib/lib:$DYLD_LIBRARY_PATH"

# Добавляем GOPATH/bin в PATH
export PATH="$HOME/go/bin:$PATH"

# Проверяем наличие необходимых компонентов
if ! command -v protoc &> /dev/null; then
    echo "Ошибка: protoc не установлен"
    echo "Установите его с помощью: brew install protobuf"
    exit 1
fi

if ! command -v protoc-gen-go &> /dev/null; then
    echo "Ошибка: protoc-gen-go не установлен"
    echo "Установите его с помощью: go install google.golang.org/protobuf/cmd/protoc-gen-go@latest"
    exit 1
fi

if ! command -v protoc-gen-go-grpc &> /dev/null; then
    echo "Ошибка: protoc-gen-go-grpc не установлен"
    echo "Установите его с помощью: go install google.golang.org/grpc/cmd/protoc-gen-go-grpc@latest"
    exit 1
fi

# Сначала удалим старые сгенерированные файлы
rm -rf ../backend/internal/physics/generated/*

# Создаем директорию
mkdir -p ../backend/internal/physics/generated

# Генерируем с правильными путями
protoc --go_out=../backend/internal/physics/generated \
       --go-grpc_out=../backend/internal/physics/generated \
       --go_opt=paths=source_relative \
       --go-grpc_opt=paths=source_relative \
       physics.proto

# Проверяем результат
if [ $? -eq 0 ]; then
    echo "Go протофайлы успешно сгенерированы"
else
    echo "Ошибка при генерации Go протофайлов"
    exit 1
fi
