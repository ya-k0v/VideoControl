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

# Инициализировать БД
sqlite3 config/main.db < src/database/init.sql

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

## Linux MPV Клиент (рекомендуется для 24/7)

MPV - нативный плеер для Linux с производительностью как ExoPlayer на Android.

**Преимущества:**
- ✅ Аппаратное ускорение (VAAPI/VDPAU/NVDEC)
- ✅ Стабильность 24/7
- ✅ Большие файлы >4GB без проблем
- ✅ Память ~50-70 MB (vs ~350 MB у браузера)
- ✅ Идентичен Android ExoPlayer по функциональности

**Быстрая установка (одна команда, без клонирования):**
```bash
curl -fsSL https://raw.githubusercontent.com/ya-k0v/VideoControl/main/clients/mpv/quick-install.sh | bash -s -- --server http://SERVER_IP --device mpv-001
```

**Или из репозитория:**
```bash
cd clients/mpv
./install.sh --server http://SERVER_IP --device mpv-001
```

**Ручная установка:**
```bash
# Установка MPV
sudo apt install mpv python3 python3-pip

# Драйверы аппаратного ускорения (Intel/AMD)
sudo apt install vainfo libva-drm2 mesa-va-drivers

# Драйверы для NVIDIA
sudo apt install vdpauinfo libvdpau-va-gl1

# Python зависимости
pip3 install python-socketio[client] requests

# Запуск
python3 mpv_client.py --server http://SERVER_IP --device mpv-001
```

**Подробнее:** [clients/mpv/README.md](../clients/mpv/README.md)

## Доступ

- **Админ:** http://SERVER_IP/admin.html
- **Спикер:** http://SERVER_IP/speaker.html
- **Плеер:** http://SERVER_IP/player.html?device_id=DEVICE_ID

---

**Полная документация:** [README.md](README.md)

