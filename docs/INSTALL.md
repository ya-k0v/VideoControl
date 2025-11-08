# Установка VideoControl v2.5

## 📦 Быстрая установка сервера

### Production (с автозапуском):

```bash
# Клонировать репозиторий
git clone https://github.com/ya-k0v/VideoControl.git
cd VideoControl

# Запустить установку
cd scripts
./install-server.sh

# Сервер установлен и настроен!
# Запустить: sudo systemctl start videocontrol
```

### Development:

```bash
# Клонировать репозиторий
git clone https://github.com/ya-k0v/VideoControl.git
cd VideoControl

# Установить зависимости
npm install

# Создать структуру
mkdir -p public/content config

# Создать конфиги
echo '{}' > config/devices.json
echo '{}' > config/file-names-map.json

# Запустить
npm start
```

---

## 📁 Структура после установки

```
VideoControl/
├── config/                   Конфигурационные файлы
├── src/                      Backend (21 модуль)
├── public/                   Frontend (17 модулей)
├── docs/                     Документация
├── scripts/                  Скрипты
└── clients/                  Android & VLC клиенты
```

## VLC Клиент

**Быстрая установка (только зависимости):**
```bash
curl -fsSL https://raw.githubusercontent.com/ya-k0v/VideoControl/main/scripts/quick-install-vlc.sh | bash -s -- --no-systemd
cd ~/videocontrol-vlc
python3 vlc_client.py --server http://SERVER_IP --device vlc-001
```

**С автозапуском (systemd):**
```bash
curl -fsSL https://raw.githubusercontent.com/ya-k0v/VideoControl/main/scripts/quick-install-vlc.sh | bash -s -- --server http://SERVER_IP --device vlc-001
```

**Если VLC уже установлен:**
```bash
curl -fsSL https://raw.githubusercontent.com/ya-k0v/VideoControl/main/scripts/quick-install-vlc.sh | bash -s -- --skip-vlc --no-systemd
```

## MPV Клиент (Raspberry Pi)

**Быстрая установка (только зависимости):**
```bash
curl -fsSL https://raw.githubusercontent.com/ya-k0v/VideoControl/main/scripts/quick-install-mpv.sh | bash -s -- --no-systemd
cd ~/videocontrol-mpv
python3 mpv_client.py --server http://SERVER_IP --device rpi-001
```

**С автозапуском (systemd):**
```bash
curl -fsSL https://raw.githubusercontent.com/ya-k0v/VideoControl/main/scripts/quick-install-mpv.sh | bash -s -- --server http://SERVER_IP --device rpi-001
```

**Если MPV уже установлен:**
```bash
curl -fsSL https://raw.githubusercontent.com/ya-k0v/VideoControl/main/scripts/quick-install-mpv.sh | bash -s -- --skip-mpv --no-systemd
```

## Доступ

- **Админ:** http://SERVER_IP/admin.html
- **Спикер:** http://SERVER_IP/speaker.html
- **Плеер:** http://SERVER_IP/player.html?device_id=DEVICE_ID

---

**Полная документация:** [README.md](README.md)

