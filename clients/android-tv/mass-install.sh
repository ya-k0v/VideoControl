#!/bin/bash
# VideoControl - Массовая установка APK на Android устройства
# Usage: bash mass-install.sh

set -e

APK="VideoControlTV/app/build/outputs/apk/release/app-release.apk"

if [ ! -f "$APK" ]; then
    echo "❌ APK не найден: $APK"
    echo "Сначала соберите APK:"
    echo "  cd VideoControlTV"
    echo "  ./gradlew assembleRelease"
    exit 1
fi

echo "======================================"
echo "VideoControl - Массовая установка APK"
echo "======================================"
echo ""
echo "APK: $APK"
echo ""

# Проверяем ADB
if ! command -v adb &> /dev/null; then
    echo "❌ ADB не установлен"
    echo "Установите Android SDK Platform Tools"
    exit 1
fi

echo "Найденные устройства:"
adb devices -l
echo ""

# Функция установки на устройство
install_device() {
    local DEVICE_ID=$1
    local DEVICE_NAME=$2
    
    echo "[$DEVICE_NAME] Установка APK..."
    
    if adb -s "$DEVICE_ID" install -r "$APK" 2>&1 | grep -q "Success"; then
        echo "[$DEVICE_NAME] ✓ APK установлен"
        
        # Опционально: Запустить приложение
        adb -s "$DEVICE_ID" shell am start -n com.videocontrol.tv/.MainActivity 2>/dev/null || true
        
        return 0
    else
        echo "[$DEVICE_NAME] ❌ Ошибка установки"
        return 1
    fi
}

# Получаем список подключенных устройств
DEVICES=$(adb devices | grep -v "List" | grep "device$" | awk '{print $1}')

if [ -z "$DEVICES" ]; then
    echo "❌ Нет подключенных устройств"
    echo ""
    echo "Подключите устройства через USB или WiFi:"
    echo "  adb connect 192.168.1.101:5555"
    echo ""
    exit 1
fi

# Счетчик
SUCCESS=0
FAILED=0
TOTAL=0

# Устанавливаем на все подключенные устройства
for DEVICE in $DEVICES; do
    TOTAL=$((TOTAL + 1))
    
    # Получаем модель устройства
    MODEL=$(adb -s "$DEVICE" shell getprop ro.product.model 2>/dev/null | tr -d '\r' || echo "Unknown")
    
    echo ""
    echo "----------------------------------------"
    echo "Устройство $TOTAL: $DEVICE"
    echo "Модель: $MODEL"
    echo "----------------------------------------"
    
    if install_device "$DEVICE" "$MODEL"; then
        SUCCESS=$((SUCCESS + 1))
    else
        FAILED=$((FAILED + 1))
    fi
    
    sleep 1
done

echo ""
echo "======================================"
echo "Результаты установки"
echo "======================================"
echo "Всего устройств: $TOTAL"
echo "Успешно: $SUCCESS ✓"
echo "Ошибок: $FAILED ✗"
echo ""

if [ $SUCCESS -eq $TOTAL ]; then
    echo "🎉 Все устройства настроены!"
    echo ""
    echo "Следующие шаги:"
    echo "1. Откройте приложение на каждом устройстве"
    echo "2. Введите Server URL: http://ВАШ_СЕРВЕР"
    echo "3. Введите Device ID: lumien-01, lumien-02, и т.д."
    echo "4. Загрузите default.mp4 для каждого устройства"
else
    echo "⚠️  Не все устройства установлены успешно"
    echo "Проверьте подключение и повторите установку"
fi

echo ""

