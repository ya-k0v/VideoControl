#!/bin/bash
# VideoControl - Автоматическая настройка Device ID на Android устройствах
# Usage: bash configure-devices.sh SERVER_URL

SERVER_URL=${1:-"http://10.172.0.151"}

if [ -z "$SERVER_URL" ]; then
    echo "Usage: $0 <server_url>"
    echo "Example: $0 http://10.172.0.151"
    exit 1
fi

echo "======================================"
echo "VideoControl - Настройка устройств"
echo "======================================"
echo "Server URL: $SERVER_URL"
echo ""

# Функция настройки устройства
configure_device() {
    local ADB_ID=$1
    local DEVICE_ID=$2
    local DEVICE_NAME=$3
    
    echo "[$DEVICE_NAME] Настройка..."
    echo "  Device ID: $DEVICE_ID"
    
    # Создаем XML файл конфигурации
    local CONFIG="<?xml version='1.0' encoding='utf-8' standalone='yes' ?>
<map>
    <string name=\"server_url\">$SERVER_URL</string>
    <string name=\"device_id\">$DEVICE_ID</string>
</map>"
    
    # Записываем конфигурацию через adb
    adb -s "$ADB_ID" shell "mkdir -p /data/data/com.videocontrol.tv/shared_prefs" 2>/dev/null || true
    echo "$CONFIG" | adb -s "$ADB_ID" shell "cat > /data/data/com.videocontrol.tv/shared_prefs/videocontrol.xml"
    
    # Даем права
    adb -s "$ADB_ID" shell "chmod 660 /data/data/com.videocontrol.tv/shared_prefs/videocontrol.xml" 2>/dev/null || true
    
    # Перезапускаем приложение
    adb -s "$ADB_ID" shell am force-stop com.videocontrol.tv 2>/dev/null || true
    sleep 1
    adb -s "$ADB_ID" shell am start -n com.videocontrol.tv/.MainActivity 2>/dev/null || true
    
    echo "[$DEVICE_NAME] ✓ Настроено"
}

# Получаем список устройств
DEVICES=$(adb devices | grep -v "List" | grep "device$" | awk '{print $1}')

if [ -z "$DEVICES" ]; then
    echo "❌ Нет подключенных устройств"
    echo ""
    echo "Примеры подключения:"
    echo ""
    echo "# iconBIT DS2"
    echo "adb connect 192.168.1.101:5555"
    echo "adb connect 192.168.1.102:5555"
    echo ""
    echo "# Lumien LS5550SD (1-8)"
    echo "for i in {1..8}; do"
    echo "  adb connect 192.168.1.\$(( 110 + i )):5555"
    echo "done"
    echo ""
    exit 1
fi

echo "Подключенные устройства:"
adb devices -l | grep "device$"
echo ""

# КОНФИГУРАЦИЯ УСТРОЙСТВ
# Измените IP адреса и Device ID под ваши устройства

declare -A DEVICE_MAP

# iconBIT DS2 - 2 шт
DEVICE_MAP["192.168.1.101:5555"]="iconbit-01"
DEVICE_MAP["192.168.1.102:5555"]="iconbit-02"

# Lumien LS5550SD - 8 шт
DEVICE_MAP["192.168.1.111:5555"]="lumien-01"
DEVICE_MAP["192.168.1.112:5555"]="lumien-02"
DEVICE_MAP["192.168.1.113:5555"]="lumien-03"
DEVICE_MAP["192.168.1.114:5555"]="lumien-04"
DEVICE_MAP["192.168.1.115:5555"]="lumien-05"
DEVICE_MAP["192.168.1.116:5555"]="lumien-06"
DEVICE_MAP["192.168.1.117:5555"]="lumien-07"
DEVICE_MAP["192.168.1.118:5555"]="lumien-08"

# Настраиваем каждое устройство
SUCCESS=0
FAILED=0

for DEVICE in $DEVICES; do
    # Ищем device_id для этого ADB устройства
    DEVICE_ID="${DEVICE_MAP[$DEVICE]}"
    
    if [ -z "$DEVICE_ID" ]; then
        echo "⚠️  Устройство $DEVICE не найдено в списке конфигурации"
        echo "   Добавьте его в DEVICE_MAP в скрипте"
        FAILED=$((FAILED + 1))
        continue
    fi
    
    # Получаем модель
    MODEL=$(adb -s "$DEVICE" shell getprop ro.product.model 2>/dev/null | tr -d '\r' || echo "Unknown")
    
    if configure_device "$DEVICE" "$DEVICE_ID" "$MODEL"; then
        SUCCESS=$((SUCCESS + 1))
    else
        FAILED=$((FAILED + 1))
    fi
    
    sleep 1
done

echo ""
echo "======================================"
echo "Результаты настройки"
echo "======================================"
echo "Успешно: $SUCCESS ✓"
echo "Ошибок: $FAILED ✗"
echo ""

if [ $SUCCESS -gt 0 ]; then
    echo "🎉 Устройства настроены!"
    echo ""
    echo "Проверьте в админке: http://$SERVER_URL/admin.html"
fi

