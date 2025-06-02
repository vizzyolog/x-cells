# Руководство по мониторингу производительности

## 🎯 Обзор

Система мониторинга GameTicker предоставляет комплексные инструменты для контроля производительности игрового сервера в реальном времени. Она помогает выявлять узкие места, получать алерты о проблемах и оптимизировать игровой процесс.

## 🚀 Быстрый старт

### Базовое использование

```go
// 1. Создаем игровой тикер
gameTicker := NewGameTicker(30, logger) // 30 TPS

// 2. Создаем менеджер мониторинга
monitor := NewMonitoringManager(gameTicker)

// 3. Запускаем HTTP API для мониторинга
monitor.SetupHTTPMonitoring(9090)

// 4. Запускаем автоматический мониторинг
monitor.StartContinuousMonitoring(2 * time.Second)

// 5. Запускаем игровой цикл
gameTicker.Start()
```

### Запуск демонстрации

```bash
# Запуск демонстрации мониторинга
cd backend && go run *.go -monitor

# После запуска доступны HTTP эндпоинты:
# http://localhost:9090/health
# http://localhost:9090/stats  
# http://localhost:9090/bottlenecks
# http://localhost:9090/alerts
```

## 📊 Основные возможности мониторинга

### 1. Проверка состояния сервера

**Что проверяется:**
- 🔄 **TPS (Ticks Per Second)**: Фактическая vs целевая частота
- ⏱️ **Время тика**: Среднее время выполнения одного тика
- ⚠️ **Пропущенные тики**: Количество тиков, которые не успели выполниться вовремя
- 🎮 **Состояние систем**: Работоспособность каждой игровой системы

**Пример использования:**
```go
health := monitor.CheckServerHealth()
status := health["status"].(string)

switch status {
case "healthy":
    log.Println("✅ Сервер работает нормально")
case "warning":  
    log.Println("⚠️ Обнаружены предупреждения")
case "degraded":
    log.Println("🔴 Производительность снижена")
case "critical":
    log.Println("🚨 Критические проблемы!")
}
```

### 2. Анализ узких мест

**Автоматическое обнаружение:**
- 🐌 Медленные системы
- 📈 Процент времени тика, занимаемый каждой системой  
- 🎯 Конкретные рекомендации по оптимизации
- 📊 Сравнение со временными пороги

**Пример кода:**
```go
bottlenecks := monitor.FindBottlenecks()

for _, bottleneck := range bottlenecks {
    fmt.Printf("🔍 Система: %s\n", bottleneck.System)
    fmt.Printf("   Серьезность: %s\n", bottleneck.Severity)
    fmt.Printf("   Среднее время: %v (%.1f%% тика)\n", 
        bottleneck.AverageTime, bottleneck.PercentOfTick)
    fmt.Printf("   💡 Рекомендация: %s\n", bottleneck.Recommendation)
}
```

### 3. Система алертов в реальном времени

**Типы алертов:**
- ⚠️ **Warning**: Превышение 25% времени тика
- 🚨 **Critical**: Превышение 50% времени тика  
- 🔴 **Server Issues**: Общие проблемы сервера

**Автоматический мониторинг:**
```go
// Запуск непрерывного мониторинга каждые 2 секунды
monitor.StartContinuousMonitoring(2 * time.Second)

// Алерты автоматически логируются:
// [MONITOR] АЛЕРТ [critical]: Система CollisionSystem работает очень медленно
// [MONITOR] КРИТИЧЕСКИЙ АЛЕРТ: Система CollisionSystem занимает 67.3% времени тика
```

## 🌐 HTTP API для мониторинга

### Эндпоинты мониторинга

| Эндпоинт | Метод | Описание |
|----------|-------|----------|
| `/health` | GET | Проверка состояния сервера |
| `/stats` | GET | Полная статистика игрового цикла |
| `/bottlenecks` | GET | Анализ узких мест |
| `/alerts` | GET | История алертов |
| `/control?action=X` | POST | Управление сервером |

### Примеры использования

```bash
# Проверка состояния сервера
curl http://localhost:9090/health

# Получение статистики
curl http://localhost:9090/stats | jq

# Анализ узких мест  
curl http://localhost:9090/bottlenecks | jq

# Получение алертов
curl http://localhost:9090/alerts | jq

# Управление сервером
curl -X POST "http://localhost:9090/control?action=pause"
curl -X POST "http://localhost:9090/control?action=resume"  
curl -X POST "http://localhost:9090/control?action=stats"
```

### Пример ответа `/health`:

```json
{
  "status": "warning",
  "issues": [
    "Медленные тики: 15.2ms (норма: <16.6ms)"
  ],
  "stats": {
    "actual_tps": 28.4,
    "target_tps": 30,
    "tick_count": 1247,
    "average_tick_time": "15.2ms"
  }
}
```

## 📈 Экспорт метрик

### Для интеграции с Prometheus/Grafana

```go
metrics := monitor.ExportMetrics()

// Основные метрики:
// game_tps_actual - фактический TPS
// game_tps_target - целевой TPS  
// game_tick_count - количество выполненных тиков
// game_average_tick_time_ms - среднее время тика
// system_CollisionSystem_avg_time_ms - среднее время системы коллизий
```

### Пример интеграции с Prometheus

```go
// Создаем Prometheus метрики
var (
    tpsGauge = prometheus.NewGaugeVec(
        prometheus.GaugeOpts{
            Name: "game_tps_actual",
            Help: "Actual TPS of the game server",
        },
        []string{"server"},
    )
)

// Обновляем метрики
func updatePrometheusMetrics(monitor *MonitoringManager) {
    metrics := monitor.ExportMetrics()
    tpsGauge.WithLabelValues("main").Set(metrics["game_tps_actual"])
}
```

## ⚡ Практические сценарии использования

### Сценарий 1: Мониторинг в production

```go
// Создаем продакшн мониторинг
func SetupProductionMonitoring(gameTicker *GameTicker) {
    monitor := NewMonitoringManager(gameTicker)
    
    // HTTP API на отдельном порту
    monitor.SetupHTTPMonitoring(9090)
    
    // Частый мониторинг (каждые 5 секунд)
    monitor.StartContinuousMonitoring(5 * time.Second)
    
    // Интеграция с внешней системой алертов
    go func() {
        ticker := time.NewTicker(30 * time.Second)
        for range ticker.C {
            health := monitor.CheckServerHealth()
            if health["status"] != "healthy" {
                sendToSlack("🚨 Game Server Alert", health)
            }
        }
    }()
}
```

### Сценарий 2: Отладка производительности

```go
// Временное включение детального мониторинга
func DebugPerformance(gameTicker *GameTicker) {
    monitor := NewMonitoringManager(gameTicker)
    
    // Очень частый мониторинг для отладки
    monitor.StartContinuousMonitoring(500 * time.Millisecond)
    
    // Через 1 минуту выводим детальный анализ
    time.AfterFunc(1*time.Minute, func() {
        bottlenecks := monitor.FindBottlenecks()
        
        fmt.Println("=== АНАЛИЗ ПРОИЗВОДИТЕЛЬНОСТИ ===")
        for _, b := range bottlenecks {
            fmt.Printf("Система %s: %v (%.1f%% тика)\n", 
                b.System, b.AverageTime, b.PercentOfTick)
            fmt.Printf("Рекомендация: %s\n\n", b.Recommendation)
        }
    })
}
```

### Сценарий 3: Автоматическое масштабирование

```go
// Автоматическая адаптация TPS под нагрузку
func AutoScaleTPS(gameTicker *GameTicker) {
    monitor := NewMonitoringManager(gameTicker)
    
    go func() {
        ticker := time.NewTicker(10 * time.Second)
        for range ticker.C {
            stats := gameTicker.GetStats()
            avgTickTime := stats["average_tick_time"].(time.Duration)
            targetTPS := stats["target_tps"].(int)
            
            targetTickTime := time.Second / time.Duration(targetTPS)
            
            // Если тики медленные - снижаем TPS
            if avgTickTime > targetTickTime*3/4 {
                newTPS := int(float64(targetTPS) * 0.9)
                log.Printf("Снижаем TPS: %d -> %d", targetTPS, newTPS)
                // Пересоздаем тикер с новым TPS
            }
            
            // Если тики быстрые - можно повысить TPS  
            if avgTickTime < targetTickTime/2 {
                newTPS := int(float64(targetTPS) * 1.1)
                log.Printf("Повышаем TPS: %d -> %d", targetTPS, newTPS)
            }
        }
    }()
}
```

## 🎛️ Пороговые значения и настройка

### Настройка порогов предупреждений

```go
// При создании GameTicker
ticker := NewGameTicker(30, logger)

// Пороги автоматически вычисляются:
// Предупреждение: > 25% от времени тика (8.33ms для 30 TPS)
// Критическое: > 50% от времени тика (16.67ms для 30 TPS)  
// Максимум тика: > 200% от времени тика (66.67ms для 30 TPS)
```

### Рекомендуемые настройки по типу игры

| Тип игры | TPS | Интервал мониторинга | Критический порог |
|----------|-----|---------------------|-------------------|
| Стратегия | 10-15 | 10 сек | > 50ms |
| MMO | 20-30 | 5 сек | > 25ms |
| Шутер | 60-128 | 1 сек | > 8ms |
| Agar.io | 20-40 | 2 сек | > 20ms |

## 🔧 Рекомендации по оптимизации

### По системам

**CollisionSystem:**
- ✅ Увеличить размер ячеек spatial grid
- ✅ Уменьшить количество объектов для проверки
- ✅ Использовать broadphase/narrowphase разделение
- ✅ Оптимизировать алгоритм поиска

**FoodRespawnSystem:**
- ✅ Увеличить интервал респавна
- ✅ Уменьшить количество одновременно создаваемой еды
- ✅ Использовать пулинг объектов

**NetworkSyncSystem:**
- ✅ Оптимизировать сериализацию
- ✅ Снизить частоту отправки обновлений
- ✅ Использовать delta compression
- ✅ Батчинг обновлений

### Общие рекомендации

1. **Профилирование**: Используйте `go tool pprof` для детального анализа
2. **Кэширование**: Кэшируйте часто вычисляемые значения
3. **Пулинг**: Используйте sync.Pool для объектов
4. **Батчинг**: Группируйте операции
5. **Асинхронность**: Выносите тяжелые операции в отдельные горутины

## 🛡️ Мониторинг в production

### Интеграция с внешними системами

```go
// Пример интеграции со Slack
func sendSlackAlert(monitor *MonitoringManager) {
    bottlenecks := monitor.FindBottlenecks()
    
    for _, b := range bottlenecks {
        if b.Severity == "critical" {
            message := fmt.Sprintf("🚨 Critical Performance Issue\n"+
                "System: %s\n"+
                "Time: %v (%.1f%% of tick)\n"+
                "Recommendation: %s",
                b.System, b.AverageTime, b.PercentOfTick, b.Recommendation)
                
            sendToSlack(message)
        }
    }
}

// Интеграция с логированием
func setupLogging(monitor *MonitoringManager) {
    go func() {
        ticker := time.NewTicker(1 * time.Minute)
        for range ticker.C {
            metrics := monitor.ExportMetrics()
            
            // Структурированное логирование
            log.Printf("METRICS: tps=%.1f tick_time=%.1fms systems=%d",
                metrics["game_tps_actual"],
                metrics["game_average_tick_time_ms"], 
                int(metrics["game_systems_count"]))
        }
    }()
}
```

## 📋 Чек-лист для production

- ✅ HTTP мониторинг настроен на отдельном порту
- ✅ Непрерывный мониторинг с подходящим интервалом
- ✅ Алерты интегрированы с системой уведомлений
- ✅ Метрики экспортируются в систему мониторинга
- ✅ Пороги настроены под специфику игры
- ✅ Логирование критических событий
- ✅ Возможность удаленного управления сервером
- ✅ Автоматическое профилирование при проблемах

Система мониторинга готова к использованию в production и поможет поддерживать стабильную работу игрового сервера! 🚀 