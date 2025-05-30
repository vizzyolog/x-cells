package ws

import (
	"fmt"
	"log"
	"math/rand/v2"
	"time"

	"x-cells/backend/internal/world"
)

// PlayerConnection представляет подключенного игрока
type PlayerConnection struct {
	ID       string      // Уникальный ID подключения
	ObjectID string      // ID объекта игрока в мире
	Conn     *SafeWriter // WebSocket соединение
	JoinTime time.Time   // Время подключения
}

// PlayerCreationRequest представляет запрос на создание игрока
type PlayerCreationRequest struct {
	Conn     *SafeWriter
	Response chan *PlayerCreationResponse
}

// PlayerCreationResponse представляет ответ на создание игрока
type PlayerCreationResponse struct {
	Player *PlayerConnection
	Error  error
}

// generatePlayerID генерирует уникальный ID для игрока
func (s *WSServer) generatePlayerID() string {
	return fmt.Sprintf("player_%d_%d", time.Now().UnixNano(), rand.IntN(10000))
}

// generatePlayerObjectID генерирует уникальный ID для объекта игрока
func (s *WSServer) generatePlayerObjectID(playerID string) string {
	// Все игроки получают уникальные ID на основе их playerID
	return fmt.Sprintf("player_obj_%s", playerID)
}

// createPlayerObject создает объект игрока в мире
func (s *WSServer) createPlayerObject(playerID, objectID string) error {
	if s.factory == nil {
		return fmt.Errorf("factory не инициализирован")
	}

	// Получаем максимальную высоту террейна для размещения игрока
	terrainMaxHeight := float32(30.0) // Используем константу из test_objects.go

	// Все игроки появляются в случайных позициях
	spawnX := float32(rand.IntN(200) - 100) // от -100 до 100
	spawnZ := float32(rand.IntN(200) - 100) // от -100 до 100
	spawnY := terrainMaxHeight + 50

	// Генерируем случайный радиус (2.0 - 20.0)
	radius := float32(2.0 + rand.Float64()*18.0)

	// Простая линейная зависимость: масса = радиус * коэффициент
	// При радиусе 100 → масса 100 кг, значит коэффициент = 1.0
	massCoeff := float32(1.0)
	mass := radius * massCoeff

	// Генерируем случайный уровень прыгучести как скилл (от 0.0 до 0.8)
	bounceSkill := float32(rand.Float64() * 0.8) // 0.0 = нет отскока, 0.8 = очень прыгучий

	log.Printf("[WSServer] Расчет массы игрока: радиус=%.2f, коэффициент=%.2f, масса=%.2f кг",
		radius, massCoeff, mass)

	// Генерируем случайный цвет для игрока
	colors := []string{"#ff0000", "#00ff00", "#0000ff", "#ffff00", "#ff00ff", "#00ffff", "#ffa500", "#800080"}
	color := colors[rand.IntN(len(colors))]

	// Создаем сферу игрока с индивидуальным скиллом прыгучести
	playerSphere := world.NewPlayerWithBounceSkill(
		objectID,
		world.Vector3{X: spawnX, Y: spawnY, Z: spawnZ},
		radius, // Случайный радиус
		mass,   // Масса
		color,
		world.PhysicsTypeBoth, // Физика и на клиенте, и на сервере
		bounceSkill,           // индивидуальный скилл прыгучести
	)

	// Создаем объект в клиентской физике (Ammo)
	if err := s.factory.CreateObjectInAmmo(playerSphere); err != nil {
		log.Printf("[WSServer] Ошибка при создании объекта игрока %s в Ammo: %v", objectID, err)
		return err
	}

	// Создаем объект в серверной физике (Bullet)
	if err := s.factory.CreateObjectBullet(playerSphere); err != nil {
		log.Printf("[WSServer] Ошибка при создании объекта игрока %s в Bullet: %v", objectID, err)
		return err
	}

	log.Printf("[WSServer] Создан объект игрока %s для игрока %s в позиции (%.2f, %.2f, %.2f) с радиусом %.2f, массой %.2f и скиллом прыгучести %.2f",
		objectID, playerID, spawnX, spawnY, spawnZ, radius, mass, bounceSkill)

	return nil
}

// removePlayerObject удаляет объект игрока из мира
func (s *WSServer) removePlayerObject(objectID string) error {
	// Удаляем объект из менеджера мира
	s.objectManager.RemoveObject(objectID)

	// TODO: Добавить удаление из Bullet Physics когда будет доступен соответствующий метод

	log.Printf("[WSServer] Удален объект игрока %s", objectID)
	return nil
}

// addPlayer добавляет нового игрока при подключении
func (s *WSServer) addPlayer(conn *SafeWriter) (*PlayerConnection, error) {
	playerID := s.generatePlayerID()
	objectID := s.generatePlayerObjectID(playerID)

	// Создаем объект игрока в мире
	if err := s.createPlayerObject(playerID, objectID); err != nil {
		return nil, fmt.Errorf("ошибка создания объекта игрока: %v", err)
	}

	// Создаем структуру игрока
	player := &PlayerConnection{
		ID:       playerID,
		ObjectID: objectID,
		Conn:     conn,
		JoinTime: time.Now(),
	}

	log.Printf("[WSServer] Создан игрок %s с объектом %s", playerID, objectID)

	// Отправляем клиенту информацию о его объекте
	infoMsg := NewInfoMessage(fmt.Sprintf("Вы подключены как игрок %s, ваш объект: %s", playerID, objectID))
	if err := conn.WriteJSON(infoMsg); err != nil {
		log.Printf("[WSServer] Ошибка отправки информации игроку %s: %v", playerID, err)
	}

	// Отправляем клиенту его player ID для использования в командах
	playerIDMsg := map[string]interface{}{
		"type":      "player_id",
		"player_id": playerID,
		"object_id": objectID,
	}
	if err := conn.WriteJSON(playerIDMsg); err != nil {
		log.Printf("[WSServer] Ошибка отправки player_id игроку %s: %v", playerID, err)
	}

	return player, nil
}

// removePlayer удаляет игрока при отключении
func (s *WSServer) removePlayer(conn *SafeWriter) {
	s.playersMu.Lock()
	defer s.playersMu.Unlock()

	// Ищем игрока по соединению
	var playerToRemove *PlayerConnection
	var playerIDToRemove string

	for playerID, player := range s.players {
		if player.Conn == conn {
			playerToRemove = player
			playerIDToRemove = playerID
			break
		}
	}

	if playerToRemove == nil {
		log.Printf("[WSServer] Игрок для удаления не найден")
		return
	}

	// Удаляем объект игрока из мира
	if err := s.removePlayerObject(playerToRemove.ObjectID); err != nil {
		log.Printf("[WSServer] Ошибка удаления объекта игрока %s: %v", playerToRemove.ObjectID, err)
	}

	// Удаляем игрока из карты
	delete(s.players, playerIDToRemove)

	log.Printf("[WSServer] Удален игрок %s с объектом %s", playerIDToRemove, playerToRemove.ObjectID)
}

// getPlayerByConnection возвращает игрока по соединению
func (s *WSServer) getPlayerByConnection(conn *SafeWriter) *PlayerConnection {
	s.playersMu.RLock()
	defer s.playersMu.RUnlock()

	for _, player := range s.players {
		if player.Conn == conn {
			return player
		}
	}
	return nil
}

// playerCreationWorker обрабатывает очередь создания игроков последовательно
func (s *WSServer) playerCreationWorker() {
	log.Printf("[WSServer] Запущен worker для создания игроков")

	for request := range s.playerQueue {
		s.queueWorkerMu.Lock()

		// Создаем игрока последовательно, используя существующий метод
		player, err := s.addPlayer(request.Conn)

		// Отправляем ответ
		response := &PlayerCreationResponse{
			Player: player,
			Error:  err,
		}

		select {
		case request.Response <- response:
		case <-time.After(5 * time.Second):
			log.Printf("[WSServer] Таймаут отправки ответа на создание игрока")
		}

		s.queueWorkerMu.Unlock()

		// Небольшая задержка между созданиями для стабильности
		time.Sleep(100 * time.Millisecond)
	}
}
