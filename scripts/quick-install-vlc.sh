#!/bin/bash
# VideoControl VLC Client - Quick Install Script v2.0
# Упрощенная установка VLC клиента для любой Linux системы

set -e

echo "============================================"
echo "VLC Client v2.0 - Quick Install"
echo "============================================"
echo ""

# Определение системы
if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS=$ID
    VER=$VERSION_ID
else
    echo "❌ Не удалось определить ОС"
    exit 1
fi

echo "📦 Обнаружена система: $OS $VER"
echo ""

# Установка VLC
echo "🔧 Установка VLC..."
if [ "$OS" = "ubuntu" ] || [ "$OS" = "debian" ]; then
    sudo apt-get update
    sudo apt-get install -y vlc python3-vlc python3-pip python3-socketio
elif [ "$OS" = "centos" ] || [ "$OS" = "rhel" ] || [ "$OS" = "fedora" ]; then
    sudo yum install -y vlc python3-vlc python3-pip
    sudo pip3 install python-socketio[client]
elif [ "$OS" = "arch" ]; then
    sudo pacman -S --noconfirm vlc python-vlc python-pip
    sudo pip3 install python-socketio[client]
else
    echo "⚠️ Неизвестная ОС, попытка установки через pip..."
    sudo apt-get install -y python3-pip || sudo yum install -y python3-pip
fi

echo ""
echo "📦 Установка Python зависимостей..."
pip3 install --user python-vlc python-socketio[client]>=5.10.0 requests>=2.28.0

echo ""
echo "📁 Создание рабочей директории..."
mkdir -p ~/videocontrol-vlc
cd ~/videocontrol-vlc

echo ""
echo "📥 Загрузка VLC клиента..."
curl -sL https://raw.githubusercontent.com/ya-k0v/VideoControl/main/clients/vlc/vlc_client.py -o vlc_client.py
curl -sL https://raw.githubusercontent.com/ya-k0v/VideoControl/main/clients/vlc/requirements.txt -o requirements.txt
chmod +x vlc_client.py

echo ""
echo "📝 Установка Python зависимостей из requirements.txt..."
pip3 install --user -r requirements.txt

echo ""
echo "🔧 Создание systemd сервиса..."

# Запрос параметров
read -p "🌐 Введите адрес сервера (например, http://192.168.1.100): " SERVER_URL
read -p "📺 Введите Device ID (например, vlc-001): " DEVICE_ID

# Создание systemd service
sudo tee /etc/systemd/system/videocontrol-vlc.service > /dev/null <<EOF
[Unit]
Description=VideoControl VLC Client
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$HOME/videocontrol-vlc
Environment=DISPLAY=:0
Environment=XAUTHORITY=$HOME/.Xauthority
ExecStart=/usr/bin/python3 $HOME/videocontrol-vlc/vlc_client.py --server $SERVER_URL --device $DEVICE_ID
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

echo ""
echo "🚀 Запуск сервиса..."
sudo systemctl daemon-reload
sudo systemctl enable videocontrol-vlc
sudo systemctl start videocontrol-vlc

echo ""
echo "✅ Установка завершена!"
echo ""
echo "📊 Проверка статуса:"
sudo systemctl status videocontrol-vlc --no-pager -l

echo ""
echo "💡 Полезные команды:"
echo "   Просмотр логов:     sudo journalctl -u videocontrol-vlc -f"
echo "   Перезапуск:         sudo systemctl restart videocontrol-vlc"
echo "   Остановка:          sudo systemctl stop videocontrol-vlc"
echo "   Статус:             sudo systemctl status videocontrol-vlc"
echo ""
echo "🎉 VLC клиент готов к работе!"
