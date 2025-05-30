package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"math"
	"math/rand/v2"
	"net/url"
	"os"
	"os/signal"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

// Структуры сообщений (копируем из backend/internal/transport/ws/types.go)
type CommandMessage struct {
	Type       string      `json:"type"`
	Cmd        string      `json:"cmd,omitempty"`
	ClientTime int64       `json:"client_time,omitempty"`
	Data       interface{} `json:"data"`
	ObjectID   string      `json:"object_id"`
}

type PingMessage struct {
	Type       string `json:"type"`
	ClientTime int64  `json:"client_time"`
}

type InfoMessage struct {
	Type    string `json:"type"`
	Message string `json:"message"`
}

// Структура для данных MOUSE_VECTOR команды
type MouseVectorData struct {
	X        float64 `json:"x"`
	Y        float64 `json:"y"`
	Z        float64 `json:"z"`
	Distance float64 `json:"distance"`
}

// Bot представляет собой бота, который подключается к серверу
type Bot struct {
	ID              string
	ServerURL       string
	Conn            *websocket.Conn
	Running         bool
	Stats           BotStats
	Pattern         string
	Duration        time.Duration
	CommandRate     time.Duration
	mu              sync.RWMutex
	writeMu         sync.Mutex // Мьютекс для синхронизации записи в WebSocket
	lastCommandTime time.Time
	playerID        string // ID игрока, полученный от сервера
	objectID        string // ID объекта игрока в мире
}

// BotStats содержит статистику работы бота
type BotStats struct {
	CommandsSent      int
	ResponsesReceived int
	Errors            int
	StartTime         time.Time
	mu                sync.RWMutex
}

// NewBot создает нового бота
func NewBot(id, serverURL, pattern string, duration, commandRate time.Duration) *Bot {
	return &Bot{
		ID:          id,
		ServerURL:   serverURL,
		Pattern:     pattern,
		Duration:    duration,
		CommandRate: commandRate,
		Stats: BotStats{
			StartTime: time.Now(),
		},
	}
}

// Connect подключается к серверу
func (b *Bot) Connect() error {
	u, err := url.Parse(b.ServerURL)
	if err != nil {
		return fmt.Errorf("неверный URL: %v", err)
	}

	log.Printf("[Bot %s] Подключение к %s", b.ID, u.String())

	// Настройки для уменьшения использования файловых дескрипторов
	dialer := websocket.Dialer{
		HandshakeTimeout: 10 * time.Second,
		ReadBufferSize:   1024,
		WriteBufferSize:  1024,
	}

	conn, _, err := dialer.Dial(u.String(), nil)
	if err != nil {
		return fmt.Errorf("ошибка подключения: %v", err)
	}

	b.Conn = conn
	b.Running = true

	log.Printf("[Bot %s] Успешно подключен", b.ID)
	return nil
}

// Disconnect отключается от сервера
func (b *Bot) Disconnect() {
	b.mu.Lock()
	defer b.mu.Unlock()

	if b.Conn != nil {
		b.Running = false
		b.Conn.Close()
		log.Printf("[Bot %s] Отключен", b.ID)
	}
}

// generateMouseVector генерирует случайный вектор мыши в зависимости от паттерна
func (b *Bot) generateMouseVector() MouseVectorData {
	switch b.Pattern {
	case "circle":
		return b.generateCircleVector()
	case "linear":
		return b.generateLinearVector()
	default: // "random"
		return b.generateRandomVector()
	}
}

// generateRandomVector генерирует случайный вектор
func (b *Bot) generateRandomVector() MouseVectorData {
	// Генерируем случайное направление в 3D пространстве
	x := rand.Float64()*2 - 1 // от -1 до 1
	y := rand.Float64() * 0.5 // от 0 до 0.5 (обычно вверх)
	z := rand.Float64()*2 - 1 // от -1 до 1

	// Нормализуем вектор
	length := math.Sqrt(x*x + y*y + z*z)
	if length > 0 {
		x /= length
		y /= length
		z /= length
	}

	// Генерируем случайное расстояние (как в gamepad.js)
	distance := 20 + rand.Float64()*60 // от 20 до 80

	return MouseVectorData{
		X:        x,
		Y:        y,
		Z:        z,
		Distance: distance,
	}
}

// generateCircleVector генерирует вектор для кругового движения
func (b *Bot) generateCircleVector() MouseVectorData {
	// Используем время для создания плавного кругового движения
	elapsed := time.Since(b.Stats.StartTime).Seconds()
	angle := elapsed * 0.5 // Скорость вращения

	x := math.Cos(angle)
	z := math.Sin(angle)
	y := 0.1 // Небольшое движение вверх

	distance := 40.0 // Постоянное расстояние для плавного движения

	return MouseVectorData{
		X:        x,
		Y:        y,
		Z:        z,
		Distance: distance,
	}
}

// generateLinearVector генерирует вектор для линейного движения
func (b *Bot) generateLinearVector() MouseVectorData {
	// Движение вперед-назад по оси Z
	elapsed := time.Since(b.Stats.StartTime).Seconds()
	direction := math.Sin(elapsed * 0.3) // Медленное колебание

	return MouseVectorData{
		X:        0,
		Y:        0.1,
		Z:        direction,
		Distance: 35.0,
	}
}

// sendMouseVectorCommand отправляет команду MOUSE_VECTOR
func (b *Bot) sendMouseVectorCommand() error {
	// Проверяем, получен ли object ID от сервера
	b.mu.RLock()
	objectID := b.objectID
	conn := b.Conn
	b.mu.RUnlock()

	if objectID == "" {
		// Если object ID еще не получен, пропускаем отправку команды
		return nil
	}

	if conn == nil {
		return fmt.Errorf("соединение не установлено")
	}

	vector := b.generateMouseVector()

	cmd := CommandMessage{
		Type:       "cmd",
		Cmd:        "MOUSE_VECTOR",
		ClientTime: time.Now().UnixMilli(),
		Data:       vector,
		ObjectID:   objectID, // Используем динамический object ID
	}

	b.writeMu.Lock()
	defer b.writeMu.Unlock()

	if err := conn.WriteJSON(cmd); err != nil {
		b.Stats.mu.Lock()
		b.Stats.Errors++
		b.Stats.mu.Unlock()
		return fmt.Errorf("ошибка отправки команды: %v", err)
	}

	b.Stats.mu.Lock()
	b.Stats.CommandsSent++
	b.Stats.mu.Unlock()

	log.Printf("[Bot %s] Отправлена команда MOUSE_VECTOR: направление (%.2f, %.2f, %.2f), расстояние %.2f",
		b.ID, vector.X, vector.Y, vector.Z, vector.Distance)

	b.lastCommandTime = time.Now()
	return nil
}

// sendPing отправляет ping сообщение
func (b *Bot) sendPing() error {
	ping := PingMessage{
		Type:       "ping",
		ClientTime: time.Now().UnixMilli(),
	}

	b.mu.RLock()
	conn := b.Conn
	b.mu.RUnlock()

	if conn == nil {
		return fmt.Errorf("соединение не установлено")
	}

	b.writeMu.Lock()
	defer b.writeMu.Unlock()

	return conn.WriteJSON(ping)
}

// handleMessage обрабатывает входящие сообщения
func (b *Bot) handleMessage(messageType int, data []byte) {
	if messageType != websocket.TextMessage {
		return
	}

	var msg map[string]interface{}
	if err := json.Unmarshal(data, &msg); err != nil {
		log.Printf("[Bot %s] Ошибка разбора сообщения: %v", b.ID, err)
		return
	}

	msgType, ok := msg["type"].(string)
	if !ok {
		log.Printf("[Bot %s] Сообщение без типа: %v", b.ID, msg)
		return
	}

	switch msgType {
	case "ack", "cmd_ack":
		b.Stats.mu.Lock()
		b.Stats.ResponsesReceived++
		b.Stats.mu.Unlock()
		log.Printf("[Bot %s] Получено подтверждение команды", b.ID)

	case "pong":
		log.Printf("[Bot %s] Получен pong", b.ID)

	case "info":
		if message, ok := msg["message"].(string); ok {
			log.Printf("[Bot %s] Информация: %s", b.ID, message)
		}

	case "player_id":
		if playerID, ok := msg["player_id"].(string); ok {
			if objectID, ok := msg["object_id"].(string); ok {
				b.mu.Lock()
				b.playerID = playerID
				b.objectID = objectID
				b.mu.Unlock()
				log.Printf("[Bot %s] Получен player ID: %s, object ID: %s", b.ID, playerID, objectID)
			}
		}

	case "create":
		if objID, ok := msg["id"].(string); ok {
			log.Printf("[Bot %s] Создан объект: %s", b.ID, objID)
		}

	case "update":
		// Обновления позиций объектов - обрабатываем молча
		break

	case "batch_update":
		// Пакетные обновления - обрабатываем молча
		break

	case "physics_config":
		log.Printf("[Bot %s] Получена конфигурация физики", b.ID)

	default:
		log.Printf("[Bot %s] Неизвестный тип сообщения: %s", b.ID, msgType)
	}
}

// Run запускает бота
func (b *Bot) Run() error {
	if err := b.Connect(); err != nil {
		return err
	}
	defer b.Disconnect()

	// Запускаем горутину для чтения сообщений
	go func() {
		for b.Running {
			messageType, data, err := b.Conn.ReadMessage()
			if err != nil {
				if b.Running {
					log.Printf("[Bot %s] Ошибка чтения сообщения: %v", b.ID, err)
					b.Stats.mu.Lock()
					b.Stats.Errors++
					b.Stats.mu.Unlock()
				}
				return
			}
			b.handleMessage(messageType, data)
		}
	}()

	// Запускаем горутину для отправки ping
	go func() {
		pingTicker := time.NewTicker(5 * time.Second)
		defer pingTicker.Stop()

		for b.Running {
			<-pingTicker.C
			if err := b.sendPing(); err != nil {
				log.Printf("[Bot %s] Ошибка отправки ping: %v", b.ID, err)
			}
		}
	}()

	// Основной цикл отправки команд
	commandTicker := time.NewTicker(b.CommandRate)
	defer commandTicker.Stop()

	endTime := time.Now().Add(b.Duration)

	for b.Running && time.Now().Before(endTime) {
		<-commandTicker.C
		if err := b.sendMouseVectorCommand(); err != nil {
			log.Printf("[Bot %s] Ошибка отправки команды: %v", b.ID, err)
			b.Stats.mu.Lock()
			b.Stats.Errors++
			b.Stats.mu.Unlock()
		}
	}

	log.Printf("[Bot %s] Завершение работы", b.ID)
	return nil
}

// PrintStats выводит статистику бота
func (b *Bot) PrintStats() {
	b.Stats.mu.RLock()
	defer b.Stats.mu.RUnlock()

	duration := time.Since(b.Stats.StartTime)
	log.Printf("[Bot %s] Статистика:", b.ID)
	log.Printf("  Время работы: %v", duration)
	log.Printf("  Команд отправлено: %d", b.Stats.CommandsSent)
	log.Printf("  Ответов получено: %d", b.Stats.ResponsesReceived)
	log.Printf("  Ошибок: %d", b.Stats.Errors)
	if b.Stats.CommandsSent > 0 {
		log.Printf("  Частота команд: %.2f команд/сек", float64(b.Stats.CommandsSent)/duration.Seconds())
	}
}

func main() {
	// Флаги командной строки
	var (
		serverURL   = flag.String("url", "ws://localhost:8080/ws", "URL WebSocket сервера")
		botID       = flag.String("id", "bot1", "ID бота")
		pattern     = flag.String("pattern", "random", "Паттерн движения (random, circle, linear)")
		duration    = flag.Duration("duration", 30*time.Second, "Длительность работы бота")
		commandRate = flag.Duration("rate", 100*time.Millisecond, "Частота отправки команд")
	)
	flag.Parse()

	// Создаем и запускаем бота
	bot := NewBot(*botID, *serverURL, *pattern, *duration, *commandRate)

	// Обработка сигналов для корректного завершения
	c := make(chan os.Signal, 1)
	signal.Notify(c, os.Interrupt)

	go func() {
		<-c
		log.Printf("[Bot %s] Получен сигнал прерывания, завершение работы...", bot.ID)
		bot.Disconnect()
		bot.PrintStats()
		os.Exit(0)
	}()

	// Запускаем бота
	if err := bot.Run(); err != nil {
		log.Printf("[Bot %s] Ошибка: %v", bot.ID, err)
		os.Exit(1)
	}

	// Выводим статистику
	bot.PrintStats()
}
