#!/bin/bash
# setup-kiosk.sh - Автоматическая настройка устройства в режиме киоска
# Использование: ./setup-kiosk.sh <SERVER_IP> <DEVICE_ID>

set -e

if [ "$EUID" -eq 0 ]; then 
  echo "❌ Не запускайте этот скрипт от root! Используйте обычного пользователя."
  exit 1
fi

if [ -z "$1" ] || [ -z "$2" ]; then
  echo "Использование: $0 <SERVER_IP> <DEVICE_ID>"
  echo "Пример: $0 192.168.1.100 tv001"
  exit 1
fi

SERVER_IP="$1"
DEVICE_ID="$2"
PLAYER_URL="http://${SERVER_IP}/player-videojs.html?device_id=${DEVICE_ID}&autoplay=1"

echo "🚀 Настройка Video Control Player"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Сервер: $SERVER_IP"
echo "Device ID: $DEVICE_ID"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# 1. Установка зависимостей
echo ""
echo "📦 Шаг 1/5: Установка зависимостей..."
sudo apt-get update -qq
sudo apt-get install -y chromium-browser unclutter xdotool x11-xserver-utils

# 2. Создание скрипта запуска плеера
echo "📝 Шаг 2/5: Создание скрипта запуска..."
cat > ~/start-videocontrol-player.sh << 'SCRIPT_EOF'
#!/bin/bash

# Переменные (будут заменены при установке)
SERVER_IP="SERVER_IP_PLACEHOLDER"
DEVICE_ID="DEVICE_ID_PLACEHOLDER"
PLAYER_URL="http://${SERVER_IP}/player-videojs.html?device_id=${DEVICE_ID}&autoplay=1"

export DISPLAY=:0

# Ждем запуска X сервера
while ! xset q &>/dev/null; do
  echo "Waiting for X server..."
  sleep 2
done

echo "Starting Video Control Player for device: $DEVICE_ID"

# Отключаем скринсейвер и энергосбережение
xset s off
xset -dpms
xset s noblank

# Скрываем курсор мыши
unclutter -idle 0.1 -root &

# Закрываем все открытые окна chromium
pkill -f chromium-browser || true
sleep 2

# Запускаем плеер в kiosk режиме
chromium-browser \
  --kiosk \
  --noerrdialogs \
  --disable-infobars \
  --disable-session-crashed-bubble \
  --disable-features=TranslateUI \
  --autoplay-policy=no-user-gesture-required \
  --no-first-run \
  --fast \
  --fast-start \
  --disable-restore-session-state \
  --disable-component-update \
  --disable-background-networking \
  --disable-sync \
  --disk-cache-size=524288000 \
  --media-cache-size=524288000 \
  --disable-background-timer-throttling \
  --disable-backgrounding-occluded-windows \
  --disable-renderer-backgrounding \
  --enable-features=NetworkService,NetworkServiceInProcess \
  "$PLAYER_URL" 2>/dev/null &

BROWSER_PID=$!
echo "Browser started with PID: $BROWSER_PID"

# Watchdog: перезапускаем если браузер упал
while true; do
  if ! ps -p $BROWSER_PID > /dev/null; then
    echo "Browser crashed, restarting in 5 seconds..."
    sleep 5
    exec "$0"
  fi
  sleep 10
done
SCRIPT_EOF

# Заменяем плейсхолдеры
sed -i "s/SERVER_IP_PLACEHOLDER/$SERVER_IP/g" ~/start-videocontrol-player.sh
sed -i "s/DEVICE_ID_PLACEHOLDER/$DEVICE_ID/g" ~/start-videocontrol-player.sh
chmod +x ~/start-videocontrol-player.sh

# 3. Создание desktop entry для автозапуска
echo "🖥️  Шаг 3/5: Настройка автозапуска..."
mkdir -p ~/.config/autostart
cat > ~/.config/autostart/videocontrol-player.desktop << EOF
[Desktop Entry]
Type=Application
Name=Video Control Player
Comment=Automatically start video control player on boot
Exec=/home/$USER/start-videocontrol-player.sh
X-GNOME-Autostart-enabled=true
Hidden=false
NoDisplay=false
StartupNotify=false
Terminal=false
EOF

# 4. Создание systemd watchdog service
echo "🔄 Шаг 4/5: Настройка watchdog service..."
sudo tee /usr/local/bin/videocontrol-watchdog.sh > /dev/null << 'WATCHDOG_EOF'
#!/bin/bash

DEVICE_ID="$1"
SERVER_IP="$2"

if [ -z "$DEVICE_ID" ] || [ -z "$SERVER_IP" ]; then
  echo "Usage: $0 <DEVICE_ID> <SERVER_IP>"
  exit 1
fi

SERVER_URL="http://${SERVER_IP}"
PLAYER_URL="${SERVER_URL}/player.html?device_id=${DEVICE_ID}&autoplay=1"
CHECK_INTERVAL=30
MAX_FAILURES=3
failure_count=0

echo "Starting watchdog for device: $DEVICE_ID"

while true; do
  # Проверяем что сервер доступен
  if ! curl -s -f "${SERVER_URL}/health" > /dev/null 2>&1; then
    failure_count=$((failure_count + 1))
    echo "Server check failed ($failure_count/$MAX_FAILURES)"
    
    if [ $failure_count -ge $MAX_FAILURES ]; then
      echo "Server unreachable after $MAX_FAILURES attempts"
      failure_count=0
    fi
  else
    failure_count=0
  fi
  
  # Проверяем что плеер работает
  export DISPLAY=:0
  if ! pgrep -f "chromium-browser.*${DEVICE_ID}" > /dev/null; then
    echo "Player process not found, attempting restart..."
    
    # Пробуем перезапустить через autostart скрипт
    if [ -f "/home/$USER/start-videocontrol-player.sh" ]; then
      sudo -u $USER /home/$USER/start-videocontrol-player.sh &
    fi
  fi
  
  sleep $CHECK_INTERVAL
done
WATCHDOG_EOF

sudo chmod +x /usr/local/bin/videocontrol-watchdog.sh

sudo tee /etc/systemd/system/videocontrol-watchdog.service > /dev/null << EOF
[Unit]
Description=Video Control Player Watchdog for $DEVICE_ID
After=network-online.target graphical.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=/usr/local/bin/videocontrol-watchdog.sh $DEVICE_ID $SERVER_IP
Restart=always
RestartSec=10
User=$USER
Environment=DISPLAY=:0
Environment=XAUTHORITY=/home/$USER/.Xauthority

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable videocontrol-watchdog.service

# 5. Тестирование подключения к серверу
echo "🔍 Шаг 5/5: Проверка подключения к серверу..."
if curl -s -f "http://${SERVER_IP}/api/devices" > /dev/null 2>&1; then
  echo "✅ Сервер доступен!"
else
  echo "⚠️  Внимание: Сервер не доступен по адресу http://${SERVER_IP}"
  echo "   Убедитесь что сервер запущен и доступен с этого устройства"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Установка завершена!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📋 Что дальше:"
echo "1. Перезагрузите систему: sudo reboot"
echo "2. После перезагрузки плеер запустится автоматически"
echo "3. Проверьте статус watchdog: sudo systemctl status videocontrol-watchdog"
echo ""
echo "🛠️  Управление:"
echo "- Запустить плеер вручную: ~/start-videocontrol-player.sh"
echo "- Остановить watchdog: sudo systemctl stop videocontrol-watchdog"
echo "- Логи watchdog: sudo journalctl -u videocontrol-watchdog -f"
echo ""
echo "💡 Полезные команды:"
echo "- Проверить работу плеера: ps aux | grep chromium"
echo "- Убить все процессы chromium: pkill -f chromium-browser"
echo "- Открыть админку на другом устройстве: http://${SERVER_IP}/admin.html"
echo ""

