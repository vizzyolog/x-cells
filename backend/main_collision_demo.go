package main

import (
	"flag"
	"fmt"
)

func main() {
	// Флаги командной строки
	demo := flag.Bool("demo", false, "Запустить демонстрацию системы коллизий")
	bench := flag.Bool("bench", false, "Запустить тест производительности")
	gametick := flag.Bool("gametick", false, "Запустить демонстрацию игрового тика")
	stress := flag.Bool("stress", false, "Запустить стресс-тест производительности игрового тика")
	pause := flag.Bool("pause", false, "Демонстрация паузы/возобновления игрового цикла")
	monitor := flag.Bool("monitor", true, "Демонстрация мониторинга производительности")
	help := flag.Bool("help", false, "Показать справку")

	flag.Parse()

	if *help {
		showHelp()
		return
	}

	if *demo {
		RunCollisionDemo()
		return
	}

	if *bench {
		BenchmarkCollisions()
		return
	}

	if *gametick {
		RunGameTickDemo()
		return
	}

	if *stress {
		RunPerformanceStressTest()
		return
	}

	if *pause {
		RunGameTickPauseDemo()
		return
	}

	if *monitor {
		RunMonitoringDemo()
		return
	}

	// Если никаких флагов не передано, запускаем демонстрацию игрового тика
	fmt.Println("Запуск демонстрации игрового тика (используйте -help для просмотра всех опций)...\n")
	RunGameTickDemo()
}

func showHelp() {
	fmt.Println("=== СИСТЕМА ИГРОВОГО ЦИКЛА И КОЛЛИЗИЙ ===")
	fmt.Println()
	fmt.Println("Комплексная система для игрового сервера с управлением жизненным циклом,")
	fmt.Println("мониторингом производительности и обработкой коллизий.")
	fmt.Println()
	fmt.Println("НОВЫЕ ВОЗМОЖНОСТИ:")
	fmt.Println("• GameTicker - управление игровым циклом с фиксированной частотой")
	fmt.Println("• PerformanceMonitor - детальный мониторинг производительности каждой системы")
	fmt.Println("• TickSystem интерфейс - модульная архитектура игровых систем")
	fmt.Println("• Автоматические предупреждения при проблемах с производительностью")
	fmt.Println("• Приоритизация систем и их упорядоченное выполнение")
	fmt.Println("• Возможность паузы/возобновления для отладки")
	fmt.Println("• HTTP API для мониторинга и управления")
	fmt.Println()
	fmt.Println("СУЩЕСТВУЮЩИЕ ВОЗМОЖНОСТИ:")
	fmt.Println("• Spatial Grid для O(1) поиска близлежащих объектов")
	fmt.Println("• Математические коллизии сфер без физического движка")
	fmt.Println("• Thread-safe операции с мьютексами")
	fmt.Println("• Система еды с разными типами и весами")
	fmt.Println("• Автоматический респавн ресурсов")
	fmt.Println()
	fmt.Println("Использование:")
	fmt.Println("  go run *.go -gametick  # Демонстрация игрового тика (РЕКОМЕНДУЕТСЯ)")
	fmt.Println("  go run *.go -monitor   # Демонстрация мониторинга производительности (НОВОЕ!)")
	fmt.Println("  go run *.go -stress    # Стресс-тест производительности (50 игроков, 60 TPS)")
	fmt.Println("  go run *.go -pause     # Демонстрация паузы/возобновления")
	fmt.Println("  go run *.go -demo      # Старая демонстрация коллизий")
	fmt.Println("  go run *.go -bench     # Тест производительности коллизий")
	fmt.Println("  go run *.go -help      # Эта справка")
	fmt.Println("  go run *.go            # Запустить демонстрацию игрового тика")
	fmt.Println()
	fmt.Println("МОНИТОРИНГ ПРОИЗВОДИТЕЛЬНОСТИ:")
	fmt.Println("• Автоматическая проверка состояния сервера")
	fmt.Println("• Анализ узких мест с рекомендациями по оптимизации")
	fmt.Println("• HTTP API для интеграции с внешними системами")
	fmt.Println("• Экспорт метрик в формате Prometheus")
	fmt.Println("• Система алертов в реальном времени")
	fmt.Println("• Управление сервером через веб-интерфейс")
	fmt.Println()
	fmt.Println("АРХИТЕКТУРНЫЕ ПРЕИМУЩЕСТВА ИГРОВОГО ТИКА:")
	fmt.Println("• Фиксированная частота обновлений (TPS - Ticks Per Second)")
	fmt.Println("• Детальная статистика производительности каждой системы")
	fmt.Println("• Автоматическое обнаружение узких мест")
	fmt.Println("• Graceful shutdown и контроль жизненного цикла")
	fmt.Println("• Модульная архитектура - легко добавлять новые системы")
	fmt.Println("• Thread-safe выполнение в отдельной горутине")
	fmt.Println()
	fmt.Println("Система готова к интеграции с WebSocket и production использованию!")
}
