#!/bin/bash

# Скрипт настройки Android устройства для работы 24/7
# Использование: ./setup-device-24-7.sh <device_ip:port>
# Пример: ./setup-device-24-7.sh 192.168.11.57:5555

DEVICE=$1

if [ -z "$DEVICE" ]; then
    echo "❌ Использование: $0 <device_ip:port>"
    echo "Пример: $0 192.168.11.57:5555"
    exit 1
fi

echo "🔧 Настройка устройства $DEVICE для работы 24/7..."
echo ""

# Подключение к устройству
echo "1️⃣ Подключение к устройству..."
adb connect $DEVICE
sleep 2

# Проверка подключения
if ! adb -s $DEVICE shell "echo test" > /dev/null 2>&1; then
    echo "❌ Не удалось подключиться к устройству $DEVICE"
    exit 1
fi
echo "✅ Подключено к $DEVICE"
echo ""

# 1. Отключить таймаут выключения экрана
echo "2️⃣ Отключение таймаута выключения экрана..."
adb -s $DEVICE shell "settings put system screen_off_timeout 2147483647"
TIMEOUT=$(adb -s $DEVICE shell "settings get system screen_off_timeout")
echo "   Таймаут экрана: $TIMEOUT (2147483647 = никогда не гаснет)"
echo ""

# 2. Включить "Stay awake" при подключении к питанию
echo "3️⃣ Включение Stay Awake..."
adb -s $DEVICE shell "settings put global stay_on_while_plugged_in 3"
STAY_ON=$(adb -s $DEVICE shell "settings get global stay_on_while_plugged_in")
echo "   Stay awake: $STAY_ON (3 = USB + AC)"
echo ""

# 3. Добавить приложение в whitelist оптимизации батареи
echo "4️⃣ Добавление в whitelist оптимизации батареи..."
adb -s $DEVICE shell "dumpsys deviceidle whitelist +com.videocontrol.mediaplayer"
echo "   ✅ Добавлено в whitelist"
echo ""

# 4. Отключить оптимизацию батареи для приложения (если возможно)
echo "5️⃣ Отключение оптимизации батареи для приложения..."
adb -s $DEVICE shell "cmd appops set com.videocontrol.mediaplayer RUN_IN_BACKGROUND allow" 2>/dev/null || echo "   ⚠️ Не поддерживается на этой версии Android"
echo ""

# 5. Проверить разрешения
echo "6️⃣ Проверка разрешений..."
PERMS=$(adb -s $DEVICE shell "dumpsys package com.videocontrol.mediaplayer | grep 'android.permission.RECEIVE_BOOT_COMPLETED: granted'")
if [ -n "$PERMS" ]; then
    echo "   ✅ RECEIVE_BOOT_COMPLETED: granted"
else
    echo "   ❌ RECEIVE_BOOT_COMPLETED: NOT granted"
fi

WAKE_PERM=$(adb -s $DEVICE shell "dumpsys package com.videocontrol.mediaplayer | grep 'android.permission.WAKE_LOCK: granted'")
if [ -n "$WAKE_PERM" ]; then
    echo "   ✅ WAKE_LOCK: granted"
else
    echo "   ❌ WAKE_LOCK: NOT granted"
fi
echo ""

# 6. Проверить настройки приложения
echo "7️⃣ Проверка настроек приложения..."
SETTINGS=$(adb -s $DEVICE shell "run-as com.videocontrol.mediaplayer cat shared_prefs/VCMediaPlayerSettings.xml 2>/dev/null")
if [ -n "$SETTINGS" ]; then
    echo "   ✅ Настройки сохранены:"
    SERVER_URL=$(echo "$SETTINGS" | grep -o 'name="server_url">[^<]*' | cut -d'>' -f2)
    DEVICE_ID=$(echo "$SETTINGS" | grep -o 'name="device_id">[^<]*' | cut -d'>' -f2)
    echo "      Server URL: $SERVER_URL"
    echo "      Device ID: $DEVICE_ID"
else
    echo "   ⚠️ Настройки не найдены - настройте приложение вручную!"
fi
echo ""

# 7. Информация о версии Android
echo "8️⃣ Информация об устройстве..."
ANDROID_VERSION=$(adb -s $DEVICE shell "getprop ro.build.version.release")
SDK_VERSION=$(adb -s $DEVICE shell "getprop ro.build.version.sdk")
MANUFACTURER=$(adb -s $DEVICE shell "getprop ro.product.manufacturer")
MODEL=$(adb -s $DEVICE shell "getprop ro.product.model")

echo "   Android: $ANDROID_VERSION (SDK $SDK_VERSION)"
echo "   Производитель: $MANUFACTURER"
echo "   Модель: $MODEL"
echo ""

# 8. Рекомендации для конкретных производителей
echo "📋 Рекомендации для вашего устройства ($MANUFACTURER):"
echo ""

case "$MANUFACTURER" in
    *Xiaomi*|*xiaomi*|*XIAOMI*)
        echo "   🔧 Xiaomi устройство - дополнительные настройки вручную:"
        echo "      Settings → Apps → VideoControl MediaPlayer"
        echo "      → Autostart: ON ✅"
        echo "      → Battery saver: No restrictions"
        echo "      → Display pop-up windows: ON"
        ;;
    *Samsung*|*samsung*|*SAMSUNG*)
        echo "   🔧 Samsung устройство - дополнительные настройки вручную:"
        echo "      Settings → Apps → VideoControl MediaPlayer"
        echo "      → Battery → Unrestricted"
        echo "      → Background usage: Don't restrict"
        ;;
    *Huawei*|*huawei*|*HUAWEI*|*Honor*|*honor*)
        echo "   🔧 Huawei устройство - дополнительные настройки вручную:"
        echo "      Settings → Battery → App launch → VideoControl"
        echo "      → Manual: ON"
        echo "      → Auto-launch: ON ✅"
        echo "      → Secondary launch: ON ✅"
        echo "      → Run in background: ON ✅"
        ;;
    *)
        echo "   ✅ Стандартное Android устройство - базовые настройки применены!"
        echo "      Если автозапуск не работает, проверьте в настройках:"
        echo "      Settings → Apps → VideoControl → Battery → Unrestricted"
        ;;
esac

echo ""
echo "========================================="
echo "✅ НАСТРОЙКА ЗАВЕРШЕНА!"
echo "========================================="
echo ""
echo "🎯 Что дальше:"
echo "   1. Если настройки приложения не сохранены - откройте приложение и настройте"
echo "   2. Перезагрузите устройство: adb -s $DEVICE reboot"
echo "   3. Подождите ~30-60 секунд"
echo "   4. Проверьте что приложение запустилось автоматически"
echo ""
echo "🔍 Проверка автозапуска:"
echo "   adb -s $DEVICE shell \"ps -A | grep videocontrol\""
echo ""
echo "📊 Проверка логов:"
echo "   adb -s $DEVICE logcat -d | grep -E 'BootReceiver|VCMediaPlayer'"
echo ""

