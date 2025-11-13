# 📺 VideoControl

**Система управления медиаконтентом для цифровых дисплеев**

![Version](https://img.shields.io/badge/version-2.6.2-blue)
![Node](https://img.shields.io/badge/node-20.x-green)
![License](https://img.shields.io/badge/license-MIT-orange)

---

## 🚀 Быстрый старт

### Требования
- **Node.js** 20.x+
- **FFmpeg** + **FFprobe**
- **LibreOffice** (для PDF/PPTX)
- **SQLite3**

### Установка

```bash
# 1. Клонируем репозиторий
git clone https://github.com/ya-k0v/VideoControl.git
cd VideoControl

# 2. Устанавливаем зависимости
npm install

# 3. Создаем конфигурацию
mkdir -p config public/content logs

# 4. Запускаем
node server.js
```

**По умолчанию:**
- Сервер: `http://localhost:3000`
- Админ: `admin / Admin123!`

### Systemd (для production)

```bash
sudo cp videocontrol.service /etc/systemd/system/
sudo systemctl enable videocontrol
sudo systemctl start videocontrol
```

---

## 📱 Android клиент

### Быстрая установка

```bash
cd scripts
./quick-setup-android.sh
```

**Скрипт автоматически:**
- Подключается к устройству через ADB
- Устанавливает APK
- Настраивает server URL и device ID
- Отключает энергосбережение
- Запускает приложение

**Вручную:**

```bash
# 1. Установить APK
adb install -r VCMplayer-v2.5.5.apk

# 2. Запустить
adb shell am start -n com.videocontrol.mediaplayer/.MainActivity

# 3. Настроить через админ панель
# Server URL: http://your-server:3000
# Device ID: DEVICE001
```

---

## 🎯 Возможности

### Backend
- **SQLite** - быстрая БД с WAL mode
- **JWT Auth** - 12h access + 30d refresh tokens
- **MD5 Deduplication** - экономия места на диске
- **FFmpeg** - автооптимизация видео (720p/1080p)
- **PDF/PPTX → изображения** - автоконвертация
- **Graceful Shutdown** - корректное завершение
- **Winston Logging** - структурированные логи
- **Rate Limiting** - защита от brute-force

### Frontend
- **Админ панель** - управление устройствами и файлами
- **Спикер панель** - воспроизведение контента
- **JWT Auth UI** - безопасная авторизация
- **Drag & Drop** - перемещение файлов между устройствами
- **Live Preview** - предпросмотр контента
- **PWA** - работает offline

### Android Player
- **ExoPlayer** - стабильное воспроизведение + кэш 500 MB
- **Glide** - плавная загрузка изображений
- **Презентации** - PDF/PPTX слайды
- **Папки** - навигация по изображениям
- **Заглушка** - автовоспроизведение при отсутствии контента

---

## 📁 Структура

```
videocontrol/
├── server.js                    # Точка входа
├── src/
│   ├── routes/                  # 10 роутеров (auth, devices, files...)
│   ├── database/                # SQLite (БД + metadata)
│   ├── video/                   # FFmpeg обработка
│   ├── converters/              # PDF/PPTX → изображения
│   ├── socket/                  # Socket.IO handlers
│   ├── middleware/              # Auth, rate limit
│   └── utils/                   # Helpers
├── public/
│   ├── js/                      # Frontend (модульный)
│   │   ├── admin/               # 13 модулей админ панели
│   │   └── speaker/             # Спикер панель
│   ├── content/                 # Медиафайлы (shared storage)
│   └── sw.js                    # Service Worker
├── clients/android-mediaplayer/ # Android приложение
├── config/
│   └── main.db                  # SQLite база
├── logs/                        # Winston логи
└── scripts/
    └── quick-setup-android.sh   # Быстрая установка Android
```

---

## 🔧 API

### Аутентификация
```http
POST /api/auth/login
POST /api/auth/refresh
POST /api/auth/logout
GET  /api/auth/me
```

### Устройства
```http
GET    /api/devices
POST   /api/devices
DELETE /api/devices/:id
```

### Файлы
```http
POST   /api/devices/:id/upload
GET    /api/devices/:id/files-with-status
POST   /api/devices/:id/files/:name/rename
DELETE /api/devices/:id/files/:name
GET    /api/files/resolve/:deviceId/:fileName
```

### Заглушка
```http
GET  /api/devices/:id/placeholder
POST /api/devices/:id/placeholder
```

---

## 🔐 Безопасность

- ✅ **JWT** - access (12h) + refresh tokens (30d)
- ✅ **Rate Limiting** - защита от brute-force
- ✅ **SQL Prepared Statements** - защита от injection
- ✅ **Sanitization** - все device ID очищаются
- ✅ **Audit Logging** - все операции логируются
- ✅ **Password Reset** - только admin

---

## 📊 Производительность

- **Дедупликация:** 33% экономия места (в среднем)
- **FFmpeg timeout:** 30 мин (защита от зависания)
- **Upload limit:** 5 GB на файл
- **ExoPlayer cache:** 500 MB
- **TCP buffers:** 16 MB (быстрая загрузка)

---

## 🐛 Troubleshooting

### Видео не воспроизводится
```bash
# Очистить кэш браузера
Ctrl + Shift + R

# Очистить кэш Android
adb shell pm clear com.videocontrol.mediaplayer
```

### Заглушка не показывается
```bash
# Проверить БД
sqlite3 config/main.db "SELECT * FROM files_metadata WHERE is_placeholder=1;"

# Проверить логи
sudo journalctl -u videocontrol -f
```

### Файлы не загружаются
```bash
# Проверить место на диске
df -h /vid/videocontrol/public/content

# Проверить права
ls -la public/content/
```

---

## 📝 Логи

```bash
# Server логи
sudo journalctl -u videocontrol -f

# Android логи
adb logcat | grep -iE "VCMedia|VideoControl"

# Winston логи
tail -f logs/error.log
tail -f logs/combined.log
```

---

## 🔄 Обновление

```bash
# 1. Остановить сервер
sudo systemctl stop videocontrol

# 2. Обновить код
git pull origin main

# 3. Установить зависимости
npm install

# 4. Запустить
sudo systemctl start videocontrol

# 5. Обновить Android APK
adb install -r VCMplayer-v2.5.5.apk
```

---

## 📄 Лицензия

MIT License - свободное использование

---

## 👤 Автор

**ya-k0v** - [GitHub](https://github.com/ya-k0v/VideoControl)

**Версия:** 2.6.2
