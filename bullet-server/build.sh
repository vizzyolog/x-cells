rm -rf buildк

#!/bin/bash

# Создаем директорию для сборки, если её нет
mkdir -p build

# Переходим в директорию сборки
cd build

# Запускаем CMake для конфигурации проекта
# Важно: .. указывает на директорию с CMakeLists.txt
cmake ..

# Собираем проект
cmake --build .