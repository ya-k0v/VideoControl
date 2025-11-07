# VideoControl Native MediaPlayer для Android TV

Нативное Android приложение с ExoPlayer для стабильного воспроизведения больших видеофайлов.

## Почему нативное приложение?

WebView имеет ограничения:
- ❌ Зависания на больших файлах (>1GB)
- ❌ Агрессивное энергосбережение (suspend)
- ❌ Ограничения памяти для буферизации
- ❌ Проблемы с pixel format декодированием

ExoPlayer:
- ✅ Оптимизирован для Android
- ✅ Стабильная работа с файлами любого размера
- ✅ Эффективная буферизация
- ✅ Аппаратное ускорение
- ✅ Progressive download через HTTP Range requests

## Сборка

```bash
cd /vid/videocontrol/clients/android-mediaplayer

# Сборка APK
./gradlew assembleRelease

# APK будет в:
# app/build/outputs/apk/release/app-release.apk
```

## Установка

```bash
adb install -r app/build/outputs/apk/release/app-release.apk
```

## Настройка

Откройте `MainActivity.kt` и измените:
```kotlin
private val SERVER_URL = "http://10.172.0.151"  // IP сервера
private val DEVICE_ID = "ATV001"                // ID устройства
```

## Требования

- Android 5.0+ (API 21+)
- Android Studio Hedgehog или новее
- Gradle 8.1+
- JDK 17

## Зависимости

- ExoPlayer 2.19.1 - для воспроизведения видео
- Socket.IO Client 2.1.0 - для WebSocket
- Kotlin Coroutines - для асинхронности
- Gson - для JSON

## TODO

- [ ] Загрузка изображений (Glide/Coil)
- [ ] Настройки (SERVER_URL, DEVICE_ID из UI)
- [ ] Heartbeat/ping
- [ ] Обработка PDF/PPTX
- [ ] Reconnection logic
- [ ] Error handling

