#!/bin/bash
################################################################################
# VCPlayer - Сборка подписанного APK
# 
# Этот скрипт:
# 1. Создает debug keystore для подписи
# 2. Собирает release APK с подписью
# 3. Переименовывает в VCPlayer.apk
################################################################################

set -e

echo "=========================================="
echo "VCPlayer APK Builder"
echo "=========================================="

# Переходим в папку проекта
cd "$(dirname "$0")/VideoControlTV"

# Создаем debug keystore если его нет
KEYSTORE_PATH="app/debug.keystore"

if [ ! -f "$KEYSTORE_PATH" ]; then
    echo ""
    echo "📝 Создаем debug keystore..."
    keytool -genkey -v \
        -keystore "$KEYSTORE_PATH" \
        -alias androiddebugkey \
        -keyalg RSA \
        -keysize 2048 \
        -validity 10000 \
        -storepass android \
        -keypass android \
        -dname "CN=Android Debug,O=Android,C=US"
    echo "✅ Keystore создан: $KEYSTORE_PATH"
else
    echo "✅ Keystore уже существует: $KEYSTORE_PATH"
fi

# Очистка предыдущих сборок
echo ""
echo "🧹 Очистка предыдущих сборок..."
./gradlew clean

# Сборка release APK
echo ""
echo "🔨 Сборка release APK..."
./gradlew assembleRelease

# Проверяем результат
APK_PATH="app/build/outputs/apk/release/app-release.apk"
if [ ! -f "$APK_PATH" ]; then
    echo "❌ ОШИБКА: APK не найден в $APK_PATH"
    exit 1
fi

# Переименовываем APK
OUTPUT_APK="../VCPlayer.apk"
cp "$APK_PATH" "$OUTPUT_APK"

echo ""
echo "=========================================="
echo "✅ УСПЕШНО!"
echo "=========================================="
echo ""
echo "📦 APK файл: $(realpath $OUTPUT_APK)"
echo "📊 Размер: $(du -h $OUTPUT_APK | cut -f1)"
echo ""
echo "📱 Установка:"
echo "   adb install -r ../VCPlayer.apk"
echo ""
echo "🚀 Массовая установка:"
echo "   bash ../mass-install.sh"
echo ""
echo "=========================================="

