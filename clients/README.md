# Video Control - Клиенты

Нативные клиенты для разных платформ.

## VLC Client (Windows/Linux/macOS)

**Быстрая установка:**
```bash
# Без вопросов (только зависимости)
bash scripts/install-vlc-client.sh --no-systemd

# С автозапуском
bash scripts/install-vlc-client.sh --server http://SERVER --device vlc-001

# Если VLC уже установлен
bash scripts/install-vlc-client.sh --skip-vlc --no-systemd
```

**Запуск:**
```bash
cd clients/vlc
python3 vlc_client.py --server http://SERVER_IP --device vlc-001
```

**Подходит для:**
- Офисные ПК
- Конференц-залы
- Презентационные экраны

## MPV Client (Raspberry Pi/Linux)

**Быстрая установка:**
```bash
# Без вопросов (только зависимости)
bash scripts/install-mpv-client.sh --no-systemd

# С автозапуском
bash scripts/install-mpv-client.sh --server http://SERVER --device rpi-001

# Если MPV уже установлен
bash scripts/install-mpv-client.sh --skip-mpv --no-systemd
```

**Запуск:**
```bash
cd clients/mpv
python3 mpv_client.py --server http://SERVER_IP --device rpi-001
```

**Подходит для:**
- Raspberry Pi (оптимизировано!)
- Слабые ПК
- Embedded системы

## Возможности

- ✅ Видео, изображения, PDF, PPTX
- ✅ Real-time управление
- ✅ Автоматическая заглушка
- ✅ Автономность при потере связи
- ✅ Hardware acceleration

## Требования

**VLC:**
- Python 3.7+
- VLC Media Player
- python-vlc, python-socketio

**MPV:**
- Python 3.7+
- MPV Player
- python-mpv, python-socketio
