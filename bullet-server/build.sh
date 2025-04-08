#!/bin/bash

# Скрипт для сборки и запуска Bullet Physics сервера

# Параметры
GO_SERVER="localhost:8080"  # Адрес Go сервера по умолчанию

# Парсинг аргументов командной строки
while [[ "$#" -gt 0 ]]; do
    case $1 in
        --go-server) GO_SERVER="$2"; shift ;;
        *) echo "Неизвестный параметр: $1"; exit 1 ;;
    esac
    shift
done

echo "Используем Go-сервер: $GO_SERVER"

# Проверяем необходимые зависимости на macOS
if [[ "$OSTYPE" == "darwin"* ]]; then
    echo "Обнаружена macOS, проверяем наличие zlib..."
    
    # Проверяем, установлен ли brew
    if command -v brew &> /dev/null; then
        echo "Homebrew найден, проверяем zlib..."
        
        # Проверяем, установлен ли zlib
        if ! brew list zlib &> /dev/null; then
            echo "zlib не найден, устанавливаем..."
            brew install zlib
        else
            echo "zlib уже установлен"
        fi
        
        # Получаем путь к библиотекам zlib от brew
        ZLIB_PATH=$(brew --prefix zlib)
        echo "Путь к zlib: $ZLIB_PATH"
        
        # Экспортируем переменные окружения для CMake
        export LDFLAGS="-L$ZLIB_PATH/lib"
        export CPPFLAGS="-I$ZLIB_PATH/include"
        export PKG_CONFIG_PATH="$ZLIB_PATH/lib/pkgconfig"
    else
        echo "Homebrew не найден. Рекомендуется установить Homebrew и zlib."
    fi
fi

# Создаем директорию сборки
mkdir -p build
cd build

# Выполняем CMake и сборку
echo "Запуск CMake..."
cmake ..
if [ $? -ne 0 ]; then
    echo "Ошибка CMake. Выход."
    exit 1
fi

echo "Компиляция..."
make -j4
if [ $? -ne 0 ]; then
    echo "Ошибка компиляции. Выход."
    exit 1
fi

# Настройка переменных окружения для поиска библиотек
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS-специфичные пути
    BREW_PREFIX=$(brew --prefix)
    export DYLD_LIBRARY_PATH="$BREW_PREFIX/lib:$ZLIB_PATH/lib:/usr/local/lib:/usr/lib:$DYLD_LIBRARY_PATH"
    export DYLD_FALLBACK_LIBRARY_PATH="$BREW_PREFIX/lib:$ZLIB_PATH/lib:/usr/local/lib:/usr/lib:$DYLD_FALLBACK_LIBRARY_PATH"
else
    # Linux или другие ОС
    export DYLD_LIBRARY_PATH="/usr/local/lib:/usr/lib:$DYLD_LIBRARY_PATH"
    export DYLD_FALLBACK_LIBRARY_PATH="/usr/local/lib:/usr/lib:$DYLD_FALLBACK_LIBRARY_PATH"
fi

# Запускаем сервер с правильным именем исполняемого файла
echo "Запуск Bullet Physics сервера..."
# Проверяем, какой исполняемый файл существует
if [ -f "./BulletPhysicsServer" ]; then
    ./BulletPhysicsServer --go-server "$GO_SERVER"
elif [ -f "./bullet-server" ]; then
    ./bullet-server --go-server "$GO_SERVER"
else
    echo "Ошибка: исполняемый файл сервера не найден!"
    ls -la
    exit 1
fi