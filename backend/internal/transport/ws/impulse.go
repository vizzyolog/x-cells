package ws

import (
	"context"
	"log"
	"time"

	pb "x-cells/backend/internal/physics/generated"
)

// applyImpulses регулярно применяет импульсы к объектам на основе состояния контроллеров
func (s *WSServer) applyImpulses() {
	ticker := time.NewTicker(s.impulseInterval)
	defer ticker.Stop()

	for range ticker.C {
		s.mu.RLock()
		for id, state := range s.controllerStates {
			// Вычисляем силу импульса с учетом интервала
			impulseForce := float32(s.impulseInterval.Milliseconds()) / 1000.0 // конвертируем в секунды

			// Создаем запрос на применение импульса
			req := &pb.ApplyImpulseRequest{
				Id: id,
				Impulse: &pb.Vector3{
					X: state.Force.X * impulseForce,
					Y: state.Force.Y * impulseForce,
					Z: state.Force.Z * impulseForce,
				},
			}

			// Применяем импульс
			if _, err := s.physics.ApplyImpulse(context.Background(), req); err != nil {
				log.Printf("[Go] Ошибка применения импульса к объекту %s: %v", id, err)
			}
		}
		s.mu.RUnlock()
	}
}
