package ws

import (
	"fmt"
	"log"
	"math"
	"math/rand"
	"reflect"
	"time"
)

// NetworkSimulation - настройки для имитации сетевых условий
type NetworkSimulation struct {
	Enabled         bool          // Включена ли имитация
	BaseLatency     time.Duration // Базовая задержка
	LatencyVariance time.Duration // Вариация задержки (jitter)
	PacketLoss      float64       // Процент потери пакетов (0.0 - 1.0)
	BandwidthLimit  int           // Ограничение пропускной способности (байт/сек)
}

// DelayedMessage - сообщение с задержкой
type DelayedMessage struct {
	conn    *SafeWriter
	message interface{}
	sendAt  time.Time
}

// SetNetworkSimulation устанавливает параметры имитации сети
func (s *WSServer) SetNetworkSimulation(sim NetworkSimulation) {
	s.simMu.Lock()
	defer s.simMu.Unlock()
	s.networkSim = sim
	log.Printf("[NetworkSim] Настройки обновлены: Enabled=%v, BaseLatency=%v, Variance=%v, PacketLoss=%.2f%%",
		sim.Enabled, sim.BaseLatency, sim.LatencyVariance, sim.PacketLoss*100)
}

// GetNetworkSimulation возвращает текущие настройки имитации
func (s *WSServer) GetNetworkSimulation() NetworkSimulation {
	s.simMu.RLock()
	defer s.simMu.RUnlock()
	return s.networkSim
}

// simulateNetworkConditions применяет имитацию сетевых условий к сообщению
func (s *WSServer) simulateNetworkConditions(conn *SafeWriter, message interface{}) error {
	// Проверяем входные параметры
	if conn == nil {
		return fmt.Errorf("connection is nil")
	}
	if message == nil {
		return fmt.Errorf("message is nil")
	}

	// Дополнительная валидация сообщения
	if !s.isValidMessage(message) {
		log.Printf("[NetworkSim] Попытка отправить невалидное сообщение: %T", message)
		return fmt.Errorf("invalid message format")
	}

	s.simMu.RLock()
	sim := s.networkSim
	s.simMu.RUnlock()

	// Если имитация выключена, отправляем сразу
	if !sim.Enabled {
		return conn.WriteJSON(message)
	}

	// Имитация потери пакетов
	if sim.PacketLoss > 0 && rand.Float64() < sim.PacketLoss {
		log.Printf("[NetworkSim] Пакет потерян (%.1f%% loss rate)", sim.PacketLoss*100)
		return nil // Пакет "потерян"
	}

	// Вычисляем задержку
	delay := sim.BaseLatency
	if sim.LatencyVariance > 0 {
		// Добавляем случайную вариацию (jitter)
		variance := time.Duration(rand.Float64() * float64(sim.LatencyVariance))
		if rand.Float64() < 0.5 {
			variance = -variance
		}
		delay += variance
	}

	// Если задержка нулевая или отрицательная, отправляем сразу
	if delay <= 0 {
		return conn.WriteJSON(message)
	}

	// Отправляем сообщение с задержкой
	delayedMsg := DelayedMessage{
		conn:    conn,
		message: message,
		sendAt:  time.Now().Add(delay),
	}

	select {
	case s.delayedMessages <- delayedMsg:
		return nil
	default:
		log.Printf("[NetworkSim] Буфер отложенных сообщений переполнен, отправляем сразу")
		return conn.WriteJSON(message)
	}
}

// processDelayedMessages обрабатывает отложенные сообщения
func (s *WSServer) processDelayedMessages() {
	for delayedMsg := range s.delayedMessages {
		// Проверяем, что соединение еще активно
		if delayedMsg.conn == nil {
			log.Printf("[NetworkSim] Пропускаем сообщение: соединение nil")
			continue
		}

		// Проверяем, что сообщение не nil
		if delayedMsg.message == nil {
			log.Printf("[NetworkSim] Пропускаем сообщение: message nil")
			continue
		}

		// Дополнительная валидация сообщения
		if !s.isValidMessage(delayedMsg.message) {
			log.Printf("[NetworkSim] Пропускаем невалидное сообщение: %T", delayedMsg.message)
			continue
		}

		// Ждем до времени отправки
		now := time.Now()
		if delayedMsg.sendAt.After(now) {
			time.Sleep(delayedMsg.sendAt.Sub(now))
		}

		// Отправляем сообщение с дополнительной проверкой
		if err := delayedMsg.conn.WriteJSON(delayedMsg.message); err != nil {
			log.Printf("[NetworkSim] Ошибка отправки отложенного сообщения: %v", err)
		}
	}
}

// isValidMessage проверяет, что сообщение может быть безопасно сериализовано в JSON
func (s *WSServer) isValidMessage(message interface{}) bool {
	if message == nil {
		return false
	}

	// Проверяем, что это map[string]interface{} (наш основной тип сообщений)
	if msgMap, ok := message.(map[string]interface{}); ok {
		// Проверяем каждое значение в map
		for _, value := range msgMap {
			if !s.isValidValue(value) {
				log.Printf("[NetworkSim] Невалидное значение для ключа %T", value)
				return false
			}
		}
		return true
	}

	// Для других типов сообщений просто проверяем, что они не nil
	return true
}

// isValidValue проверяет, что значение может быть сериализовано в JSON
func (s *WSServer) isValidValue(value interface{}) bool {
	if value == nil {
		return true // nil значения допустимы в JSON
	}

	// Проверяем на reflect.Value, который может вызвать панику
	if reflect.TypeOf(value).String() == "reflect.Value" {
		log.Printf("[NetworkSim] Обнаружен reflect.Value, пропускаем")
		return false
	}

	switch v := value.(type) {
	case map[string]interface{}:
		// Рекурсивно проверяем вложенные map
		for _, nestedValue := range v {
			if !s.isValidValue(nestedValue) {
				return false
			}
		}
		return true
	case []interface{}:
		// Проверяем элементы массива
		for _, item := range v {
			if !s.isValidValue(item) {
				return false
			}
		}
		return true
	case map[string]float32:
		// Специальная проверка для наших position/rotation/velocity map
		for _, val := range v {
			if math.IsNaN(float64(val)) || math.IsInf(float64(val), 0) {
				log.Printf("[NetworkSim] NaN или Inf значение: %f", val)
				return false
			}
		}
		return true
	case float32:
		return !math.IsNaN(float64(v)) && !math.IsInf(float64(v), 0)
	case float64:
		return !math.IsNaN(v) && !math.IsInf(v, 0)
	default:
		// Для всех остальных типов возвращаем true (разрешаем JSON encoder решать)
		return true
	}
}

// EnableNetworkSimulation включает имитацию с предустановленными профилями
func (s *WSServer) EnableNetworkSimulation(profile string) {
	var sim NetworkSimulation

	switch profile {
	case "mobile_3g":
		sim = NetworkSimulation{
			Enabled:         true,
			BaseLatency:     100 * time.Millisecond,
			LatencyVariance: 50 * time.Millisecond,
			PacketLoss:      0.02, // 2%
		}
	case "mobile_4g":
		sim = NetworkSimulation{
			Enabled:         true,
			BaseLatency:     50 * time.Millisecond,
			LatencyVariance: 20 * time.Millisecond,
			PacketLoss:      0.01, // 1%
		}
	case "wifi_poor":
		sim = NetworkSimulation{
			Enabled:         true,
			BaseLatency:     80 * time.Millisecond,
			LatencyVariance: 40 * time.Millisecond,
			PacketLoss:      0.03, // 3%
		}
	case "wifi_good":
		sim = NetworkSimulation{
			Enabled:         true,
			BaseLatency:     20 * time.Millisecond,
			LatencyVariance: 10 * time.Millisecond,
			PacketLoss:      0.005, // 0.5%
		}
	case "high_latency":
		sim = NetworkSimulation{
			Enabled:         true,
			BaseLatency:     200 * time.Millisecond,
			LatencyVariance: 100 * time.Millisecond,
			PacketLoss:      0.05, // 5%
		}
	case "unstable":
		sim = NetworkSimulation{
			Enabled:         true,
			BaseLatency:     60 * time.Millisecond,
			LatencyVariance: 80 * time.Millisecond,
			PacketLoss:      0.04, // 4%
		}
	default:
		sim = NetworkSimulation{Enabled: false}
	}

	s.SetNetworkSimulation(sim)
}
