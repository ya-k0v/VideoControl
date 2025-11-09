#!/bin/bash
# VideoControl MPV Client - Installation Script
# Установка стабильного клиента для Linux устройств 24/7

set -e

echo "=========================================="
echo "VideoControl MPV Client - Installation"
echo "Native Player for Linux (как ExoPlayer)"
echo "=========================================="
echo ""

# Проверка аргументов
if [ "$1" = "--help" ] || [ "$1" = "-h" ]; then
    echo "Использование:"
    echo "  $0 [OPTIONS]"
    echo ""
    echo "Опции:"
    echo "  --server URL       Server URL (обязательно)"
    echo "  --device ID        Device ID (обязательно)"
    echo "  --no-systemd       Только установка, без systemd"
    echo "  --skip-mpv         Не устанавливать MPV (уже установлен)"
    echo ""
    echo "Примеры:"
    echo "  $0 --server http://192.168.1.100 --device mpv-001"
    echo "  $0 --server http://192.168.1.100 --device mpv-001 --no-systemd"
    exit 0
fi

# Парсинг аргументов
SERVER_URL=""
DEVICE_ID=""
INSTALL_SYSTEMD=true
INSTALL_MPV=true

while [[ $# -gt 0 ]]; do
    case $1 in
        --server)
            SERVER_URL="$2"
            shift 2
            ;;
        --device)
            DEVICE_ID="$2"
            shift 2
            ;;
        --no-systemd)
            INSTALL_SYSTEMD=false
            shift
            ;;
        --skip-mpv)
            INSTALL_MPV=false
            shift
            ;;
        *)
            echo "Неизвестная опция: $1"
            exit 1
            ;;
    esac
done

# Определение ОС
if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS=$ID
else
    echo "❌ Не удалось определить ОС"
    exit 1
fi

echo "Обнаружена ОС: $OS"
echo ""

# Установка MPV
if [ "$INSTALL_MPV" = true ]; then
    echo "📦 Установка MPV..."
    
    if [ "$OS" = "ubuntu" ] || [ "$OS" = "debian" ]; then
        sudo apt-get update
        sudo apt-get install -y mpv python3 python3-pip
        
        # VAAPI для Intel/AMD (аппаратное ускорение)
        sudo apt-get install -y vainfo libva-drm2 mesa-va-drivers
        
        # VDPAU для NVIDIA (аппаратное ускорение)
        if lspci | grep -i nvidia > /dev/null; then
            sudo apt-get install -y vdpauinfo libvdpau-va-gl1
        fi
        
    elif [ "$OS" = "centos" ] || [ "$OS" = "rhel" ]; then
        sudo yum install -y epel-release
        sudo yum install -y mpv python3 python3-pip
        
    elif [ "$OS" = "arch" ] || [ "$OS" = "manjaro" ]; then
        sudo pacman -S --noconfirm mpv python python-pip
    fi
    
    echo "✅ MPV установлен"
    mpv --version | head -1
    echo ""
else
    echo "⏭️  Пропускаем установку MPV"
    echo ""
fi

# Установка Python зависимостей
echo "📦 Установка Python зависимостей..."
pip3 install python-socketio[client] requests
echo "✅ Python зависимости установлены"
echo ""

# Создание директории
INSTALL_DIR="/opt/videocontrol-mpv"

echo "📁 Создание директории: $INSTALL_DIR"
sudo mkdir -p "$INSTALL_DIR"

# Копирование файлов
echo "📋 Копирование файлов..."
sudo cp mpv_client.py "$INSTALL_DIR/"
sudo cp requirements.txt "$INSTALL_DIR/"
sudo chmod +x "$INSTALL_DIR/mpv_client.py"

echo "✅ Файлы скопированы"
echo ""

# Создание пользователя
if ! id -u videocontrol &>/dev/null; then
    echo "👤 Создание пользователя videocontrol..."
    sudo useradd -r -s /bin/bash -d "$INSTALL_DIR" videocontrol
    echo "✅ Пользователь создан"
else
    echo "✅ Пользователь videocontrol уже существует"
fi

sudo chown -R videocontrol:videocontrol "$INSTALL_DIR"
echo ""

# Установка systemd service
if [ "$INSTALL_SYSTEMD" = true ]; then
    if [ -z "$SERVER_URL" ] || [ -z "$DEVICE_ID" ]; then
        echo "⚠️  Для установки systemd service нужны --server и --device"
        echo "💡 Запустите повторно с параметрами или используйте --no-systemd"
        exit 1
    fi
    
    echo "⚙️  Установка systemd service..."
    
    # Создаем environment файл
    sudo mkdir -p /etc/videocontrol
    sudo bash -c "cat > /etc/videocontrol/mpv-${DEVICE_ID}.env << EOF
SERVER_URL=${SERVER_URL}
DEVICE_ID=${DEVICE_ID}
EOF"
    
    # Копируем service файл
    sudo cp videocontrol-mpv@.service /etc/systemd/system/
    
    # Обновляем service файл с переменными
    sudo sed -i "s|\${SERVER_URL}|${SERVER_URL}|g" /etc/systemd/system/videocontrol-mpv@.service
    
    # Reload systemd
    sudo systemctl daemon-reload
    
    # Включаем и запускаем
    sudo systemctl enable videocontrol-mpv@${DEVICE_ID}.service
    sudo systemctl start videocontrol-mpv@${DEVICE_ID}.service
    
    echo "✅ Systemd service установлен и запущен"
    echo ""
    echo "📊 Управление сервисом:"
    echo "  Статус:  sudo systemctl status videocontrol-mpv@${DEVICE_ID}"
    echo "  Логи:    sudo journalctl -u videocontrol-mpv@${DEVICE_ID} -f"
    echo "  Стоп:    sudo systemctl stop videocontrol-mpv@${DEVICE_ID}"
    echo "  Старт:   sudo systemctl start videocontrol-mpv@${DEVICE_ID}"
    echo "  Рестарт: sudo systemctl restart videocontrol-mpv@${DEVICE_ID}"
    echo ""
else
    echo "⏭️  Пропускаем установку systemd service"
    echo ""
    echo "🚀 Ручной запуск:"
    echo "  cd $INSTALL_DIR"
    echo "  sudo -u videocontrol python3 mpv_client.py --server <URL> --device <ID>"
    echo ""
fi

echo "=========================================="
echo "✅ Установка завершена!"
echo "=========================================="
echo ""
echo "📊 MPV vs Video.js:"
echo "  Memory:        ~60 MB vs ~350 MB"
echo "  CPU:           ~10% vs ~40%"
echo "  Large files:   ✅ vs ❌"
echo "  HW decode:     ✅ vs ⚠️"
echo "  Stability 24/7: ✅ vs ❌"
echo ""
echo "🎯 MPV = ExoPlayer для Linux!"
echo ""

