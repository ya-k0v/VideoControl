# Scripts

Скрипты для установки и настройки.

## Быстрая установка (через wget/curl)

**Сервер:**
```bash
curl -fsSL https://raw.githubusercontent.com/ya-k0v/VideoControl/main/scripts/quick-install-server.sh | sudo bash
```

**VLC клиент (скачивает только 2 файла - быстро!):**
```bash
# Только зависимости (~10 сек)
curl -fsSL https://raw.githubusercontent.com/ya-k0v/VideoControl/main/scripts/quick-install-vlc.sh | bash -s -- --no-systemd

# С автозапуском (~30 сек)
curl -fsSL https://raw.githubusercontent.com/ya-k0v/VideoControl/main/scripts/quick-install-vlc.sh | bash -s -- --server http://SERVER --device vlc-001

# VLC уже установлен (~5 сек)
curl -fsSL https://raw.githubusercontent.com/ya-k0v/VideoControl/main/scripts/quick-install-vlc.sh | bash -s -- --skip-vlc --no-systemd
```

**MPV клиент (скачивает только 2 файла - быстро!):**
```bash
# Только зависимости (~10 сек)
curl -fsSL https://raw.githubusercontent.com/ya-k0v/VideoControl/main/scripts/quick-install-mpv.sh | bash -s -- --no-systemd

# С автозапуском (~30 сек)
curl -fsSL https://raw.githubusercontent.com/ya-k0v/VideoControl/main/scripts/quick-install-mpv.sh | bash -s -- --server http://SERVER --device rpi-001

# MPV уже установлен (~5 сек)
curl -fsSL https://raw.githubusercontent.com/ya-k0v/VideoControl/main/scripts/quick-install-mpv.sh | bash -s -- --skip-mpv --no-systemd
```

**Установка:** `~/videocontrol-vlc/` и `~/videocontrol-mpv/`

## Локальная установка (после клонирования)

**Сервер:**
```bash
bash scripts/install-server.sh
```

**VLC клиент:**
```bash
# Быстрая (без вопросов)
bash scripts/install-vlc-client.sh --no-systemd

# С автозапуском
bash scripts/install-vlc-client.sh --server http://SERVER --device vlc-001

# Только Python (VLC уже есть)
bash scripts/install-vlc-client.sh --skip-vlc --no-systemd
```

**MPV клиент:**
```bash
# Быстрая (без вопросов)
bash scripts/install-mpv-client.sh --no-systemd

# С автозапуском
bash scripts/install-mpv-client.sh --server http://SERVER --device rpi-001

# Только Python (MPV уже есть)
bash scripts/install-mpv-client.sh --skip-mpv --no-systemd
```

## Kiosk Mode Setup

Настройка Linux/Windows ПК как kiosk-плеера:

```bash
bash scripts/setup-kiosk.sh SERVER_IP DEVICE_ID
sudo reboot
```

**Требования:**
- Chromium browser
- X11 или Wayland

## Generate Favicons

Генерация favicon из SVG:

```bash
node scripts/generate-favicons.js
```

Создает:
- favicon.ico
- favicon-16.png, favicon-32.png
- apple-touch-icon.png
- icon-192.png, icon-512.png
