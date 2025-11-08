# VideoControl v2.5

Система управления видеоконтентом для дисплеев и Android TV устройств.

## 📦 Быстрый старт

```bash
# 1. Установка сервера
cd scripts
./install-server.sh

# 2. Установка Nginx
cd ../nginx
./install-nginx.sh

# 3. Запуск
sudo systemctl start videocontrol
sudo systemctl enable videocontrol
```

## 📂 Структура проекта

```
videocontrol/
├── server.js              # Главный серверный файл
├── package.json           # Зависимости Node.js
├── devices.json           # Конфигурация устройств
├── file-names-map.json    # Маппинг имен файлов
├── video-optimization.json # Настройки оптимизации видео
├── videocontrol.service   # Systemd сервис
│
├── public/                # Веб-интерфейсы
│   ├── admin.html         # Панель администратора
│   ├── speaker.html       # Панель спикера
│   ├── player-videojs.html # Плеер для устройств
│   ├── css/               # Стили
│   ├── js/                # JavaScript
│   └── content/           # Контент устройств (не в git)
│
├── nginx/                 # Конфигурация Nginx
│   ├── videocontrol.conf  # Основной конфиг
│   └── install-nginx.sh   # Установка Nginx
│
├── scripts/               # Служебные скрипты
│   ├── install-server.sh  # Установка сервера
│   ├── install-vlc-client.sh # Установка VLC клиента
│   └── setup-kiosk.sh     # Настройка kiosk режима
│
├── clients/               # Клиентские приложения
│   ├── android-tv/        # Android TV APK
│   └── vlc/               # VLC клиент
│
└── docs/                  # Документация
    ├── INSTALL.md         # Детальная установка
    ├── ROADMAP.md         # План развития
    ├── ANDROID.md         # Android клиент
    └── VLC.md             # VLC клиент
```

## 🚀 Возможности

- ✅ Управление несколькими устройствами
- ✅ Поддержка видео, изображений, PDF, PPTX
- ✅ Автоматическая оптимизация видео (720p/1080p)
- ✅ Реальное время через WebSocket
- ✅ Drag & Drop между устройствами
- ✅ Адаптивный интерфейс (desktop, tablet, mobile)
- ✅ Android TV приложение

## 📖 Документация

### Пользовательская
- [Установка](docs/INSTALL.md)
- [Android TV](docs/ANDROID.md)
- [VLC клиент](docs/VLC.md)

### Разработка
- [🔧 Roadmap рефакторинга](docs/REFACTORING_ROADMAP.md) - План деления больших файлов на модули
- [📁 Структура после рефакторинга](docs/PROJECT_STRUCTURE_AFTER_REFACTORING.md) - Целевая архитектура
- [✅ Чеклист рефакторинга](docs/REFACTORING_CHECKLIST.md) - Отслеживание прогресса

## 🔧 Требования

- Node.js 18+
- Nginx 1.18+
- FFmpeg (для оптимизации видео)
- Ubuntu 20.04+ (или другой Linux)

## 📝 Лицензия

MIT
