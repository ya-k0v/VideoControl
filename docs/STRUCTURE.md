# Структура проекта

## Серверная часть

### Основные файлы
- `server.js` - главный сервер (Express + Socket.IO)
- `package.json` - зависимости и npm скрипты
- `videocontrol.service` - systemd сервис

### Конфигурация
- `main.db` - единая SQLite база данных (устройства, файлы, пользователи)
- `video-optimization.json` - профили оптимизации видео
- `.env` - переменные окружения (JWT_SECRET и т.д.)

## Клиентские интерфейсы (public/)

### HTML страницы
- `admin.html` - панель администратора
- `speaker.html` - панель спикера  
- `player-videojs.html` - плеер для устройств

### JavaScript модули
- `js/admin.js` - логика админки
- `js/speaker.js` - логика спикера
- `js/player-videojs.js` - плеер с Video.js

### Ресурсы
- `css/app.css` - единые стили
- `content/` - файлы устройств (генерируется)

## Инфраструктура

### Nginx (nginx/)
- `videocontrol.conf` - конфигурация для раздачи контента
- `install-nginx.sh` - установка и настройка

### Скрипты (scripts/)
- `install-server.sh` - установка сервера
- `install-vlc-client.sh` - установка VLC клиента
- `setup-kiosk.sh` - настройка kiosk режима

### Клиенты (clients/)
- `android-tv/` - Android TV приложение (APK)
- `vlc/` - VLC Python клиент

## Документация (docs/)
- `INSTALL.md` - детальная установка
- `ROADMAP.md` - план развития
- `ANDROID.md` - Android клиент
- `VLC.md` - VLC клиент
- `STRUCTURE.md` - этот файл
