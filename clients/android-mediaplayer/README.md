# VideoControl Native MediaPlayer для Android TV

Нативное Android приложение для стабильного воспроизведения медиа-контента 24/7.

## Возможности

- ✅ **ExoPlayer** - стабильная работа с файлами любого размера
- ✅ **Glide** - загрузка изображений с кэшем
- ✅ **PDF/PPTX** - через конвертированные изображения
- ✅ **Автозапуск** - при включении устройства
- ✅ **Watchdog** - автоперезапуск при потере связи > 3 минут
- ✅ **Wake Lock** - экран не гаснет
- ✅ **Retry** - автовосстановление при ошибках (3 попытки)
- ✅ **24/7** - стабильная работа без перезапусков

## Требования

- **Android:** 5.0+ (API 21+)
- **Gradle:** 8.1+, JDK 17
- **Сеть:** Wi-Fi подключение к серверу

## Быстрый старт

### 1. Сборка APK

```bash
cd /vid/videocontrol/clients/android-mediaplayer
./gradlew assembleDebug
```

**APK:** `app/build/outputs/apk/debug/app-debug.apk`

### 2. Установка

```bash
# Подключение к устройству
adb connect <device_ip>:5555

# Установка
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

### 3. Настройка устройства для 24/7

```bash
./setup-device-24-7.sh <device_ip>:5555
```

Скрипт автоматически:
- Отключит таймаут экрана
- Добавит в whitelist оптимизации батареи
- Включит Stay Awake при питании
- Проверит все разрешения

### 4. Настройка приложения

1. Откройте приложение на устройстве
2. Введите **Server URL** и **Device ID**
3. Сохраните

### 5. Автозапуск на Xiaomi/Huawei (вручную)

**Для Xiaomi Mi TV:**
```
Settings → Apps → VideoControl MediaPlayer
→ Autostart: ON ✅
→ Battery: No restrictions
```

**Для Huawei:**
```
Settings → Battery → App launch → VideoControl
→ Manual: ON → Auto-launch: ON ✅
```

**Для остальных (Sony/TCL/Philips/Generic):**
- Настройки применяются автоматически через скрипт

### 6. Перезагрузка

```bash
adb reboot
# Приложение запустится автоматически через 1-2 секунды
```

## Проверка

```bash
# Проверка что приложение работает
adb shell "ps -A | grep videocontrol"

# Проверка логов
adb logcat -d | grep -E "BootReceiver|VCMediaPlayer"
```

## Управление

**Команды через админку:**
- `play` - воспроизвести контент
- `pause` - пауза с сохранением позиции
- `stop` - остановка и возврат к заглушке
- `restart` - перезапуск с начала

**Доступ к настройкам:**
- Длинное нажатие на экран → открывает настройки

## Совместимость

| Производитель | Автозапуск | Примечания |
|---------------|------------|------------|
| Sony/TCL/Philips TV | ✅ Авто | Стандартный Android TV |
| Generic TV Box | ✅ Авто | Без ограничений |
| **Xiaomi Mi TV** | ⚠️ Вручную | Включить Autostart в настройках |
| Samsung | ⚠️ Вручную | Отключить Knox если есть |
| Huawei/Honor | ⚠️ Вручную | Защищённые приложения |

**Минимум:** Android 5.0+ (API 21+)

## Зависимости

```gradle
ExoPlayer 2.19.1          // Видео
Socket.IO Client 2.1.0    // WebSocket
Glide 4.16.0             // Изображения
Kotlin Coroutines 1.7.3  // Асинхронность
Gson 2.10.1              // JSON
```

## Структура

```
app/src/main/java/com/videocontrol/mediaplayer/
├── MainActivity.kt         // Главный экран с плеером
├── SettingsActivity.kt     // Настройки (Server URL, Device ID)
├── BootReceiver.kt         // Автозапуск при включении
├── ConnectionWatchdog.kt   // Автоперезапуск при потере связи
└── RemoteConfig.kt         // Загрузка конфигурации с сервера
```

## Файлы

- **README.md** - эта инструкция
- **setup-device-24-7.sh** - скрипт настройки устройства
- **AUTOSTART.md** - детальная документация по автозапуску
- **BUILD.md** - инструкции по сборке
