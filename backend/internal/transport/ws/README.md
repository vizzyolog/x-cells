# WebSocket Transport Layer

Пакет `ws` предоставляет компоненты для работы с WebSocket-соединениями в X-Cells.

## Компоненты

### SafeWriter

`SafeWriter` - потокобезопасная обертка для WebSocket соединения, которая позволяет безопасно писать 
в соединение из нескольких горутин, что устраняет проблему с concurrent writes.

Пример использования:

```go
// Создание потокобезопасного райтера
conn, _ := upgrader.Upgrade(w, r, nil)
safeWriter := ws.NewSafeWriter(conn)
defer safeWriter.Close()

// Безопасная отправка JSON данных
data := map[string]interface{}{
    "type": "update",
    "id": "obj1",
}
safeWriter.WriteJSON(data)
```

### WSServer

`WSServer` - сервер WebSocket, который обрабатывает соединения и управляет обменом данными.

Пример использования:

```go
// Создание сервера
server := ws.NewWSServer(worldManager, physicsClient)

// Регистрация обработчика
http.HandleFunc("/ws", server.HandleWS)
```

### Типы сообщений

Пакет также определяет структуры для различных типов сообщений:

- `ObjectMessage` - сообщения о создании и обновлении объектов
- `CommandMessage` - команды от клиента
- `AckMessage` - подтверждения команд
- `PingMessage` / `PongMessage` - измерение задержки
- `InfoMessage` - информационные сообщения

## Преимущества

1. **Потокобезопасность** - предотвращение ошибок concurrent write
2. **Типизированные сообщения** - строгое определение формата сообщений
3. **Константы** - предотвращение ошибок с использованием строковых литералов
4. **Модульная архитектура** - легкость тестирования и повторного использования 