#!/bin/bash

# Скрипт для запуска нескольких ботов одновременно
# Использование: ./run_multiple_bots.sh [количество_ботов] [длительность]

# Параметры по умолчанию
NUM_BOTS=${1:-3}
DURATION=${2:-"60s"}
SERVER_URL="ws://localhost:8080/ws"

echo "Запуск $NUM_BOTS ботов на $DURATION"
echo "Сервер: $SERVER_URL"
echo "================================"

# Массив паттернов движения
PATTERNS=("random" "circle" "linear")

# Функция для остановки всех ботов
cleanup() {
    echo ""
    echo "Остановка всех ботов..."
    jobs -p | xargs -r kill
    wait
    echo "Все боты остановлены"
    exit 0
}

# Обработка сигнала прерывания
trap cleanup SIGINT SIGTERM

# Проверяем, что бот собран
if [ ! -f "./bot" ]; then
    echo "Бот не найден. Собираем..."
    go build -o bot main.go
    if [ $? -ne 0 ]; then
        echo "Ошибка сборки бота"
        exit 1
    fi
fi

# Запускаем ботов
for i in $(seq 1 $NUM_BOTS); do
    # Выбираем паттерн движения циклически
    pattern_index=$(( (i - 1) % ${#PATTERNS[@]} ))
    pattern=${PATTERNS[$pattern_index]}
    
    # Генерируем уникальный object_id для каждого бота
    if [ $i -eq 1 ]; then
        object_id="mainPlayerBot"  # Первый бот управляет основным объектом
    else
        object_id="bot_object_$i"  # Остальные боты управляют виртуальными объектами
    fi
    
    bot_id="bot_$i"
    
    echo "Запуск бота $bot_id с паттерном $pattern (объект: $object_id)"
    
    # Запускаем бота в фоне
    ./bot \
        -server="$SERVER_URL" \
        -bot-id="$bot_id" \
        -object-id="$object_id" \
        -pattern="$pattern" \
        -speed="15" \
        -duration="$DURATION" &
    
    # Небольшая задержка между запусками
    sleep 0.5
done

echo ""
echo "Все боты запущены. Нажмите Ctrl+C для остановки всех ботов."
echo "Боты будут работать $DURATION, затем автоматически остановятся."

# Ждем завершения всех фоновых процессов
wait

echo ""
echo "Все боты завершили работу" 