// Функция для проверки возможных проблем с отображением и расчетом скорости
// Запустите этот тест с помощью node applySpeedLimits.test.js

console.log('Тестирование обработки скорости');

// Функция для обновления отображения скорости игрока
function testSpeedCalculation(velocity) {
    // Расчет скорости
    const serverSpeed = Math.sqrt(
        velocity.x * velocity.x + 
        velocity.y * velocity.y + 
        velocity.z * velocity.z
    );
    
    console.log(`Скорость из компонентов (${velocity.x}, ${velocity.y}, ${velocity.z}): ${serverSpeed}`);
}

// Тестовые данные
const testCases = [
    { x: 0.1, y: 0.1, z: 0.1 },       // Малые значения
    { x: 1.0, y: 1.0, z: 1.0 },       // Средние значения
    { x: 10.0, y: 10.0, z: 10.0 },    // Большие значения
    { x: 100.0, y: 0.0, z: 0.0 },     // Только одна компонента
    { x: -10.0, y: 5.0, z: -3.0 },    // Отрицательные значения
    { x: 50.0, y: 50.0, z: 50.0 }     // Очень большие значения
];

// Запуск тестов
testCases.forEach((velocity, index) => {
    console.log(`Тест #${index + 1}:`);
    testSpeedCalculation(velocity);
    console.log('---');
});

// Проверка формата, который приходит с сервера
function testServerDataProcessing(data) {
    console.log('Обработка данных с сервера:');
    console.log('Полученные данные:', JSON.stringify(data, null, 2));
    
    // Проверяем формат и извлекаем velocity
    if (data.objects && data.objects.mainPlayer1 && data.objects.mainPlayer1.velocity) {
        const velocity = data.objects.mainPlayer1.velocity;
        testSpeedCalculation(velocity);
    } else {
        console.log('Ошибка: Неверный формат данных или отсутствует поле velocity');
    }
}

// Тестовые данные сервера
const serverDataTests = [
    // Корректный формат
    {
        objects: {
            mainPlayer1: {
                position: { x: 0, y: 0, z: 0 },
                velocity: { x: 50, y: 50, z: 50 }
            }
        }
    },
    // Неправильный формат (velocity как массив)
    {
        objects: {
            mainPlayer1: {
                position: { x: 0, y: 0, z: 0 },
                velocity: [50, 50, 50]
            }
        }
    },
    // Неправильный формат (velocity как число)
    {
        objects: {
            mainPlayer1: {
                position: { x: 0, y: 0, z: 0 },
                velocity: 86.6 // sqrt(50^2 + 50^2 + 50^2)
            }
        }
    }
];

// Запуск тестов формата данных
serverDataTests.forEach((data, index) => {
    console.log(`\nТест формата данных #${index + 1}:`);
    testServerDataProcessing(data);
    console.log('---');
});

console.log('Тестирование завершено'); 