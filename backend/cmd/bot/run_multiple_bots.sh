#!/bin/bash

# Скрипт для запуска нескольких ботов одновременно
# Использование: ./run_multiple_bots.sh [количество_ботов] [задержка_между_запусками_в_секундах]

# Количество ботов (по умолчанию 5)
NUM_BOTS=${1:-10}

# Задержка между запусками в секундах (по умолчанию 0.5 секунды)
DELAY=${2:-0.5}

# URL сервера
SERVER_URL="ws://localhost:8080/ws"

# Длительность работы каждого бота
DURATION="60s"

# Частота отправки команд
RATE="100ms"

# Паттерны движения
PATTERNS=("random" "circle" "linear")

echo "Запуск $NUM_BOTS ботов с задержкой $DELAY секунд между запусками..."
echo "Сервер: $SERVER_URL"
echo "Длительность: $DURATION"
echo "Частота команд: $RATE"
echo "================================"

# Массив для хранения PID процессов
PIDS=()

# Функция для завершения всех ботов
cleanup() {
    echo ""
    echo "Завершение всех ботов..."
    for pid in "${PIDS[@]}"; do
        if kill -0 "$pid" 2>/dev/null; then
            kill "$pid"
        fi
    done
    wait
    echo "Все боты завершены."
    exit 0
}

# Обработка сигнала прерывания
trap cleanup SIGINT SIGTERM

# Запуск ботов
for i in $(seq 1 $NUM_BOTS); do
    # Выбираем паттерн движения циклически
    pattern_index=$((($i - 1) % ${#PATTERNS[@]}))
    pattern=${PATTERNS[$pattern_index]}
    
    echo "Запуск бота $i с паттерном $pattern..."
    
    # Запускаем бота в фоне
    go run main.go \
        -id="bot$i" \
        -url="$SERVER_URL" \
        -pattern="$pattern" \
        -duration="$DURATION" \
        -rate="$RATE" &
    
    # Сохраняем PID процесса
    PIDS+=($!)
    
    # Задержка перед запуском следующего бота (кроме последнего)
    if [ $i -lt $NUM_BOTS ]; then
        sleep $DELAY
    fi
done

echo "================================"
echo "Все $NUM_BOTS ботов запущены!"
echo "Нажмите Ctrl+C для завершения всех ботов"
echo "================================"

# Ждем завершения всех процессов
wait 