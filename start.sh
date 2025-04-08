#!/bin/bash

# Скрипт для запуска всего проекта X-Cells

echo "X-Cells - Запуск серверов..."

# Проверяем, существуют ли директории
if [ ! -d "backend" ]; then
    echo "Ошибка: директория 'backend' не найдена!"
    exit 1
fi

if [ ! -d "bullet-server" ]; then
    echo "Ошибка: директория 'bullet-server' не найдена!"
    exit 1
fi

# Определяем порт Go-сервера
GO_PORT=8080
GO_SERVER="localhost:$GO_PORT"

# Запускаем Bullet Physics сервер в фоне
echo "Запуск Bullet Physics сервера..."
cd bullet-server && ./build.sh --go-server "$GO_SERVER" &

# Сохраняем PID Bullet-сервера
BULLET_PID=$!
echo "Bullet Physics сервер запущен с PID: $BULLET_PID"

# Даем время на инициализацию Bullet-сервера
echo "Ожидаем 5 секунд для инициализации Bullet-сервера..."
sleep 5

# Запускаем Go-сервер 
echo "Запуск Go-сервера на порту $GO_PORT..."
cd ../backend && go run cmd/server/main.go

# Обработка завершения
cleanup() {
    echo "Завершение работы серверов..."
    kill $BULLET_PID 2>/dev/null
    exit 0
}

# Перехват сигналов завершения
trap cleanup SIGINT SIGTERM

# Ожидаем завершения Go сервера
wait

# На всякий случай убиваем Bullet-сервер при выходе
cleanup 