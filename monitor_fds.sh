#!/bin/bash
# Мониторинг файловых дескрипторов процесса
# Использование: ./monitor_fds.sh <PID>

if [ $# -eq 0 ]; then
    echo "Использование: $0 <PID>"
    exit 1
fi

PID=$1
echo "Мониторинг файловых дескрипторов для процесса $PID"
echo "Нажмите Ctrl+C для остановки"

while true; do
    if kill -0 $PID 2>/dev/null; then
        FD_COUNT=$(lsof -p $PID 2>/dev/null | wc -l)
        echo "$(date '+%H:%M:%S'): Открытых файлов: $FD_COUNT"
    else
        echo "Процесс $PID не найден или завершен"
        break
    fi
    sleep 2
done 