#!/bin/bash

# Скрипт для тестирования имитации сетевых условий
# Использование: ./test_network_sim.sh

SERVER_URL="http://localhost:8080"

echo "🌐 Тестирование имитации сетевых условий"
echo "========================================"

# Функция для проверки статуса
check_status() {
    echo "📊 Текущий статус:"
    curl -s "$SERVER_URL/api/network-sim/status" | jq '.' 2>/dev/null || curl -s "$SERVER_URL/api/network-sim/status"
    echo ""
}

# Функция для включения профиля
enable_profile() {
    local profile=$1
    echo "🔧 Включаем профиль: $profile"
    curl -s -X POST "$SERVER_URL/api/network-sim/enable?profile=$profile" | jq '.' 2>/dev/null || curl -s -X POST "$SERVER_URL/api/network-sim/enable?profile=$profile"
    echo ""
    sleep 1
    check_status
}

# Функция для отключения
disable_sim() {
    echo "🔴 Отключаем имитацию"
    curl -s -X POST "$SERVER_URL/api/network-sim/disable" | jq '.' 2>/dev/null || curl -s -X POST "$SERVER_URL/api/network-sim/disable"
    echo ""
    sleep 1
    check_status
}

# Проверяем начальный статус
echo "🚀 Начальное состояние:"
check_status

# Тестируем различные профили
echo "🧪 Тестируем профили сети:"
echo ""

echo "1️⃣  WiFi Хороший (20ms ±10ms, 0.5% потери)"
enable_profile "wifi_good"
sleep 3

echo "2️⃣  WiFi Плохой (80ms ±40ms, 3% потери)"
enable_profile "wifi_poor"
sleep 3

echo "3️⃣  Мобильный 4G (50ms ±20ms, 1% потери)"
enable_profile "mobile_4g"
sleep 3

echo "4️⃣  Мобильный 3G (100ms ±50ms, 2% потери)"
enable_profile "mobile_3g"
sleep 3

echo "5️⃣  Высокая задержка (200ms ±100ms, 5% потери)"
enable_profile "high_latency"
sleep 3

echo "6️⃣  Нестабильная сеть (60ms ±80ms, 4% потери)"
enable_profile "unstable"
sleep 3

echo "7️⃣  Отключение имитации"
disable_sim

echo "✅ Тестирование завершено!"
echo ""
echo "💡 Советы по использованию:"
echo "   - Откройте игру в браузере: $SERVER_URL"
echo "   - Используйте панель справа для переключения профилей"
echo "   - Следите за изменениями пинга и плавности игры"
echo "   - Проверьте работу механизмов предсказания и сглаживания" 