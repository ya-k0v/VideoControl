# Быстрая установка Video Control

## Сервер

### Production (с автозапуском)
```bash
curl -fsSL https://raw.githubusercontent.com/ya-k0v/VideoControl/main/scripts/quick-install-server.sh | sudo bash
sudo systemctl start videocontrol
sudo systemctl enable videocontrol
```

### Development
```bash
curl -fsSL https://raw.githubusercontent.com/ya-k0v/VideoControl/main/scripts/quick-install-server.sh | bash
cd ~/videocontrol
npm start
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

