# Video Control System v2.0

Система управления видео-контентом для множественных устройств (ТВ, проекторы, дисплеи) с поддержкой видео, изображений, PDF и PowerPoint презентаций.

**📥 Быстрая установка:** [INSTALL.md](INSTALL.md)  
**📊 Аудит проекта:** [AUDIT-REPORT.md](AUDIT-REPORT.md)

## 🚀 Установка

### Сервер - одна команда (Ubuntu/Debian/CentOS/RHEL)

**Через wget:**
```bash
wget -qO- https://raw.githubusercontent.com/ya-k0v/VideoControl/main/scripts/quick-install-server.sh | bash
```

**Через curl:**
```bash
curl -fsSL https://raw.githubusercontent.com/ya-k0v/VideoControl/main/scripts/quick-install-server.sh | bash
```

**Или через git:**
```bash
git clone https://github.com/ya-k0v/VideoControl.git
cd VideoControl
bash scripts/install-server.sh
```

Скрипты автоматически установят все зависимости и настроят систему.

**Запуск сервера:**
```bash
# Development
npm start

# Production (systemd)
sudo systemctl start videocontrol
sudo systemctl enable videocontrol

# Статус
sudo systemctl status videocontrol
```

### VLC Клиент - одна команда (Windows/Linux/macOS)

**Через wget:**
```bash
wget -qO- https://raw.githubusercontent.com/ya-k0v/VideoControl/main/scripts/quick-install-vlc.sh | bash
```

**Через curl:**
```bash
curl -fsSL https://raw.githubusercontent.com/ya-k0v/VideoControl/main/scripts/quick-install-vlc.sh | bash
```

**Или через git:**
```bash
git clone https://github.com/ya-k0v/VideoControl.git
cd VideoControl
bash scripts/install-vlc-client.sh
```

**Быстрая установка с параметрами (без вопросов):**
```bash
# Только установка зависимостей, без systemd
bash scripts/install-vlc-client.sh --no-systemd

# С автозапуском
bash scripts/install-vlc-client.sh --server http://192.168.1.10 --device vlc-001

# Только Python пакеты (VLC уже установлен)
bash scripts/install-vlc-client.sh --skip-vlc --no-systemd
```

**Запуск:**
```bash
cd ~/videocontrol-vlc
python3 vlc_client.py --server http://SERVER_IP --device vlc-001
```

### Android TV Client

Собранный APK находится в `clients/android-tv/VideoControlTV/app/build/outputs/apk/release/`.

Установка:
```bash
cd clients/android-tv
# Установка на одно устройство
adb install -r VideoControlTV/app/build/outputs/apk/release/app-release-unsigned.apk

# Массовая установка
bash mass-install.sh

# Настройка всех устройств
bash configure-devices.sh
```

## 📱 Доступ к интерфейсам

- **Админ панель:** http://localhost/admin.html
- **Плеер (Video.js):** http://localhost/player-videojs.html?device_id=YOUR_DEVICE_ID
- **Панель спикера:** http://localhost/speaker.html

## 🎯 Возможности

- 🎬 **Видео** - MP4, WebM, OGG, MKV, MOV, AVI
- 🖼️ **Изображения** - PNG, JPG, JPEG, GIF, WebP
- 📄 **PDF** - конвертация в изображения с навигацией
- 📊 **PowerPoint** - конвертация PPTX с навигацией
- 📱 **Адаптивный интерфейс** - PC, планшеты, телефоны
- 🔄 **Real-time управление** - через WebSocket
- ⏸️ **Управление** - Play, Pause, Restart, Stop
- 🌐 **Автономность** - Service Worker, работа офлайн
- 🚀 **Nginx раздача** - ускорение в 5-10 раз
- 🌍 **Русские символы** - полная поддержка
- ⚡ **PPTX кэширование** - мгновенное переключение слайдов

## 📦 Структура проекта

```
VideoControl/
├── server.js                  # Основной сервер
├── package.json               # Зависимости npm
├── devices.json               # Конфигурация устройств
├── videocontrol.service       # Systemd service
├── AUDIT-REPORT.md            # Отчет аудита
│
├── scripts/                   # Скрипты установки
│   ├── install.sh                 # Расширенная установка
│   ├── quick-install-server.sh    # Быстрая установка сервера
│   ├── quick-install-vlc.sh       # Быстрая установка VLC
│   ├── install-server.sh          # Локальная установка сервера
│   ├── install-vlc-client.sh      # Локальная установка VLC
│   ├── setup-kiosk.sh             # Настройка kiosk режима
│   └── generate-favicons.js       # Генерация иконок
│
├── nginx/                     # Конфигурация Nginx
│   ├── videocontrol.conf
│   └── install-nginx.sh
│
├── clients/                   # Клиенты
│   ├── vlc/                   # VLC клиент v2.0
│   │   ├── vlc_client.py
│   │   ├── requirements.txt
│   │   └── README.md
│   └── android-tv/            # Android TV клиент v1.0.2
│       ├── VideoControlTV/
│       ├── mass-install.sh
│       └── configure-devices.sh
│
└── public/                    # Публичные файлы
    ├── admin.html
    ├── player-videojs.html    # Video.js плеер
    ├── speaker.html
    ├── css/app.css
    ├── js/
    │   ├── admin.js
    │   ├── player-videojs.js  # Video.js логика
    │   ├── speaker.js
    │   └── utils.js
    ├── vendor/
    │   └── videojs/           # Локальные Video.js файлы
    └── content/               # Медиа-контент
```

## 🛠️ Требования

- **Node.js** 14+ (рекомендуется 18+)
- **LibreOffice** - для конвертации PPTX
- **GraphicsMagick** - для конвертации PDF/PPTX

## 📖 Примеры использования

### Пример 1: Установка сервера на чистую систему

```bash
# На Ubuntu/Debian сервере
curl -fsSL https://raw.githubusercontent.com/ya-k0v/VideoControl/main/scripts/quick-install-server.sh | sudo bash

# Запуск
sudo systemctl start videocontrol
sudo systemctl enable videocontrol

# Доступ
# http://YOUR_SERVER_IP/admin.html
```

### Пример 2: Установка VLC клиента на ПК

```bash
# На Windows/Linux/macOS ПК
curl -fsSL https://raw.githubusercontent.com/ya-k0v/VideoControl/main/scripts/quick-install-vlc.sh | bash -s -- --no-systemd

# Запуск
cd ~/videocontrol-vlc
python3 vlc_client.py --server http://SERVER_IP --device office-pc
```

### Пример 3: Установка Android TV клиента

```bash
# Сборка APK
cd clients/android-tv/VideoControlTV
./gradlew assembleRelease

# Установка на устройства
cd ..
bash mass-install.sh
```

### Регистрация устройства

Откройте плеер с параметром device_id:
```
http://your-server/player-videojs.html?device_id=TV-01
```

Устройство автоматически появится в админ-панели.

### Загрузка контента

1. Откройте админ-панель
2. Выберите устройство
3. Загрузите файлы (drag & drop)
4. Установите заглушку (default)

### Управление воспроизведением

В панели спикера:
- **Preview** - предпросмотр файла
- **Play** - воспроизведение на устройстве
- **Pause** - пауза
- **Restart** - перезапуск с начала
- **Stop** - остановка, возврат к заглушке
- **Next/Prev** - навигация по PDF/PPTX

## ⚙️ Конфигурация

### devices.json

Имена устройств для отображения:
```json
{
  "vlc-001": "Office Display 1",
  "android-tv-01": "Conference Room TV"
}
```

### Переменные окружения

- `PORT` - порт Node.js (по умолчанию 3000)
- `NODE_ENV` - окружение (development/production)

## 🔧 Управление сервисом

```bash
# Статус
sudo systemctl status videocontrol

# Логи
sudo journalctl -u videocontrol -f

# Перезапуск
sudo systemctl restart videocontrol

# Остановка
sudo systemctl stop videocontrol
```

## 🌐 Nginx для Production

Nginx значительно ускоряет раздачу контента:

```bash
cd nginx
sudo bash install-nginx.sh
```

**Преимущества:**
- ⚡ Ускорение в 5-10 раз
- 📊 100+ одновременных соединений
- 🎯 Оптимизированные HTTP заголовки
- 🔄 Range requests для видео

## 🎬 Клиенты

### VLC Client v2.0 (Windows/Linux/macOS)

Упрощенный и надежный клиент для офисных ПК:

```bash
python3 vlc_client.py --server http://SERVER --device vlc-001
```

**Поддержка:**
- ✅ Видео (mp4, webm, mkv, avi, mov, ogg)
- ✅ Автоматическая заглушка
- ✅ Надежный watchdog механизм
- ✅ Real-time управление
- ✅ Systemd автозапуск

**Документация:** [clients/vlc/README.md](clients/vlc/README.md)

### Android TV Client v1.0.2

Нативное Android приложение для Android TV устройств:

**Поддержка:**
- ✅ iconBIT DS2
- ✅ Lumien LS5550SD
- ✅ Любые Android 5.0+ устройства

**Особенности:**
- Fullscreen без chrome
- Автовоспроизведение со звуком
- WebView с Video.js плеером
- Настройка через ADB broadcasts

**Документация:** [clients/android-tv/README.md](clients/android-tv/README.md)

### Browser Player (любые устройства)

Универсальный плеер на базе Video.js:

```
http://server/player-videojs.html?device_id=DEVICE_ID&autoplay=1&sound=1
```

**Поддержка:**
- ✅ Видео (Video.js)
- ✅ Изображения
- ✅ PDF (с навигацией и кэшем)
- ✅ PPTX (с мгновенным переключением слайдов)
- ✅ Автоматический возврат к заглушке

## 🔌 API

### Устройства

- `GET /api/devices` - список устройств
- `POST /api/devices` - создать устройство
- `DELETE /api/devices/:id` - удалить устройство
- `POST /api/devices/:id/rename` - переименовать
- `GET /api/devices/:id/placeholder` - получить заглушку

### Файлы

- `GET /api/devices/:id/files` - список файлов
- `POST /api/devices/:id/upload` - загрузить файл
- `DELETE /api/devices/:id/files/:name` - удалить файл
- `POST /api/devices/:id/make-default` - установить заглушку
- `GET /api/devices/:id/slides-count?file=` - количество слайдов PPTX/PDF

### WebSocket

**Клиент → Сервер:**
- `player/register` - регистрация
- `player/ping` - heartbeat
- `control/play` - воспроизведение
- `control/pause` - пауза
- `control/stop` - остановка
- `control/pdfNext` / `control/pdfPrev` - PDF навигация
- `control/pptxNext` / `control/pptxPrev` - PPTX навигация

**Сервер → Клиент:**
- `player/state` - текущее состояние
- `player/play` - команда воспроизведения
- `player/pause` - команда паузы
- `player/stop` - команда остановки
- `player/pong` - heartbeat ответ
- `placeholder/refresh` - перезагрузка заглушки
- `player/pdfPage` / `player/pptxPage` - навигация по слайдам

## 🔒 Безопасность

- Валидация device_id
- Защита от directory traversal
- Ограничение размера файлов (1GB)
- Санитизация имен файлов
- CORS защита (только локальная сеть)

## 🛠️ Технологии

**Backend:**
- Node.js, Express.js, Socket.IO
- Nginx (reverse proxy)
- Multer (file upload)
- pdf2pic, pdf-lib (PDF processing)

**Frontend:**
- Vanilla JavaScript, HTML5, CSS3
- Video.js 8.16.1 (видео плеер)
- PWA (Service Worker v6)

**Клиенты:**
- Python 3.8+ (VLC client)
- Kotlin (Android TV)
- python-vlc, python-socketio

## 🐛 Troubleshooting

### Сервер не запускается

```bash
# Проверить логи
sudo journalctl -u videocontrol -n 50

# Проверить порт
sudo netstat -tlnp | grep 3000
```

### Плеер не подключается

```bash
# Проверить доступность
curl http://SERVER/api/devices

# Открыть порт
sudo ufw allow 80/tcp
```

### VLC клиент не показывает видео

```bash
# Проверить X server доступ
xhost +local:

# Проверить DISPLAY
echo $DISPLAY  # должно быть :0
```

### Android TV не воспроизводит видео

1. Проверьте сервер доступен с устройства
2. Убедитесь что `default.mp4` существует
3. Проверьте настройки Device ID в приложении
4. Переустановите APK: `adb install -r app-release-unsigned.apk`

## 📚 Версия

**Текущая:** v2.0 (November 2025)

**Changelog:**
- v2.0 - Video.js integration, VLC v2.0, Android TV v1.0.2, PPTX caching, removed MPV
- v1.0.2 - VLC/MPV клиенты, PWA, оптимизация
- v1.0.1 - Nginx поддержка
- v1.0.0 - Первый релиз

**Подробный отчет:** [AUDIT-REPORT.md](AUDIT-REPORT.md)

## 👨‍💻 Автор

**ya-k0v**  
GitHub: https://github.com/ya-k0v/VideoControl

## 📄 Лицензия

MIT License
