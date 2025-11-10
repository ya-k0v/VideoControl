#!/bin/bash
# VideoControl MPV Client - Quick Install from DEV branch
# Быстрая установка из dev ветки для тестирования новых функций
#
# Использование:
#   curl -fsSL https://raw.githubusercontent.com/ya-k0v/VideoControl/dev/clients/mpv/quick-install-dev.sh | bash -s -- --server http://SERVER_IP --device mpv-001

set -e

VERSION="1.0-dev"
INSTALL_DIR="$HOME/videocontrol-mpv"
REPO_URL="https://raw.githubusercontent.com/ya-k0v/VideoControl/dev/clients/mpv"

echo "=========================================="
echo "VideoControl MPV Client - Quick Install"
echo "Version: $VERSION (DEV BRANCH)"
echo "=========================================="
echo ""

# Парсинг аргументов
SERVER_URL=""
DEVICE_ID=""
INSTALL_SYSTEMD=true
SKIP_MPV=false

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
            SKIP_MPV=true
            shift
            ;;
        --help|-h)
            echo "Использование:"
            echo "  $0 --server URL --device ID [OPTIONS]"
            echo ""
            echo "Обязательные:"
            echo "  --server URL    Server URL (http://192.168.1.100)"
            echo "  --device ID     Device ID (mpv-001)"
            echo ""
            echo "Опциональные:"
            echo "  --no-systemd    Не устанавливать systemd service"
            echo "  --skip-mpv      Не устанавливать MPV (уже установлен)"
            echo ""
            echo "Примеры:"
            echo "  # Через curl (из DEV ветки):"
            echo "  curl -fsSL https://raw.githubusercontent.com/ya-k0v/VideoControl/dev/clients/mpv/quick-install-dev.sh | bash -s -- --server http://192.168.1.100 --device mpv-001"
            echo ""
            echo "  # Локально:"
            echo "  ./quick-install-dev.sh --server http://192.168.1.100 --device mpv-001"
            exit 0
            ;;
        *)
            echo "❌ Неизвестная опция: $1"
            echo "Используйте --help для справки"
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

echo "📋 Обнаружена ОС: $OS"
echo ""

# Установка MPV
if [ "$SKIP_MPV" = false ]; then
    echo "📦 Установка MPV и зависимостей..."
    
    if [ "$OS" = "ubuntu" ] || [ "$OS" = "debian" ] || [ "$OS" = "raspbian" ]; then
        sudo apt-get update -qq
        sudo apt-get install -y mpv python3 python3-pip curl
        
        # Аппаратное ускорение Intel/AMD
        echo "🔧 Установка драйверов аппаратного ускорения..."
        sudo apt-get install -y vainfo libva-drm2 mesa-va-drivers 2>/dev/null || true
        
        # Аппаратное ускорение NVIDIA
        if lspci 2>/dev/null | grep -qi nvidia; then
            sudo apt-get install -y vdpauinfo libvdpau1 2>/dev/null || true
        fi
        
    elif [ "$OS" = "centos" ] || [ "$OS" = "rhel" ]; then
        sudo yum install -y epel-release
        sudo yum install -y mpv python3 python3-pip curl
        
    elif [ "$OS" = "arch" ] || [ "$OS" = "manjaro" ]; then
        sudo pacman -S --noconfirm mpv python python-pip curl
    else
        echo "⚠️ Неизвестная ОС: $OS"
        echo "Попробуйте установить вручную: mpv python3 python3-pip"
    fi
    
    echo "✅ MPV установлен: $(mpv --version | head -1)"
else
    echo "⏭️ Пропускаем установку MPV"
fi

echo ""

# Установка Python зависимостей
echo "📦 Установка Python зависимостей..."
pip3 install --user --quiet python-socketio[client]==5.10.0 requests==2.31.0
echo "✅ Python зависимости установлены"
echo ""

# Создание директории
echo "📁 Создание директории: $INSTALL_DIR"
mkdir -p "$INSTALL_DIR"
cd "$INSTALL_DIR"

# Скачивание файлов клиента из DEV ветки
echo "📥 Скачивание файлов клиента из DEV ветки..."
echo "🌐 GitHub: dev branch"

# Проверяем локальный или удаленный запуск
if [ -f "$(dirname "$0")/mpv_client.py" ]; then
    # Локальный запуск - копируем файлы
    echo "📋 Копирование из локального репозитория (dev)..."
    cp "$(dirname "$0")/mpv_client.py" "$INSTALL_DIR/"
    cp "$(dirname "$0")/requirements.txt" "$INSTALL_DIR/"
    [ -f "$(dirname "$0")/videocontrol-mpv@.service" ] && cp "$(dirname "$0")/videocontrol-mpv@.service" "$INSTALL_DIR/"
else
    # Удаленный запуск - скачиваем с GitHub из DEV ветки
    echo "🌐 Скачивание с GitHub (dev branch)..."
    curl -fsSL "$REPO_URL/mpv_client.py" -o mpv_client.py
    curl -fsSL "$REPO_URL/requirements.txt" -o requirements.txt
    curl -fsSL "$REPO_URL/videocontrol-mpv@.service" -o videocontrol-mpv@.service || true
fi

chmod +x mpv_client.py
echo "✅ Файлы скачаны из dev ветки"
echo ""

# Установка systemd service
if [ "$INSTALL_SYSTEMD" = true ]; then
    if [ -z "$SERVER_URL" ] || [ -z "$DEVICE_ID" ]; then
        echo "⚠️ Для systemd нужны --server и --device"
        echo "Запустите с параметрами или используйте --no-systemd"
        echo ""
        INSTALL_SYSTEMD=false
    fi
fi

if [ "$INSTALL_SYSTEMD" = true ]; then
    echo "⚙️ Установка systemd service..."
    
    # Создаем service файл
    sudo tee /etc/systemd/system/videocontrol-mpv@.service > /dev/null << EOF
[Unit]
Description=VideoControl MPV Client for %i (DEV)
After=network-online.target sound.target
Wants=network-online.target

[Service]
Type=simple
User=$USER
Group=$USER
Environment="DISPLAY=:0"
WorkingDirectory=$INSTALL_DIR
ExecStart=/usr/bin/python3 $INSTALL_DIR/mpv_client.py --server $SERVER_URL --device %i --display :0
Restart=always
RestartSec=5
MemoryMax=512M
CPUQuota=80%
StandardOutput=journal
StandardError=journal
SyslogIdentifier=videocontrol-mpv-%i
NoNewPrivileges=yes
PrivateTmp=yes

[Install]
WantedBy=multi-user.target
EOF
    
    sudo systemctl daemon-reload
    sudo systemctl enable videocontrol-mpv@${DEVICE_ID}.service
    sudo systemctl start videocontrol-mpv@${DEVICE_ID}.service
    
    echo "✅ Systemd service установлен и запущен"
    echo ""
fi

echo "=========================================="
echo "✅ Установка завершена! (DEV version)"
echo "=========================================="
echo ""
echo "📁 Установлено в: $INSTALL_DIR"
echo "🌿 Ветка: dev (последняя разработка)"
echo ""

if [ "$INSTALL_SYSTEMD" = true ]; then
    echo "🎬 Управление через systemd:"
    echo "  Статус:  sudo systemctl status videocontrol-mpv@${DEVICE_ID}"
    echo "  Логи:    sudo journalctl -u videocontrol-mpv@${DEVICE_ID} -f"
    echo "  Стоп:    sudo systemctl stop videocontrol-mpv@${DEVICE_ID}"
    echo "  Старт:   sudo systemctl start videocontrol-mpv@${DEVICE_ID}"
    echo "  Рестарт: sudo systemctl restart videocontrol-mpv@${DEVICE_ID}"
else
    echo "🚀 Ручной запуск:"
    echo "  cd $INSTALL_DIR"
    
    if [ -n "$SERVER_URL" ] && [ -n "$DEVICE_ID" ]; then
        echo ""
        echo "💡 Для вашего устройства:"
        echo "  python3 mpv_client.py --server $SERVER_URL --device $DEVICE_ID"
        echo ""
        echo "🧪 Тест в окне (без fullscreen):"
        echo "  python3 mpv_client.py --server $SERVER_URL --device $DEVICE_ID --no-fullscreen"
    fi
fi

echo ""
echo "📊 MPV vs Video.js:"
echo "  ✅ Память: ~60 MB vs ~350 MB"
echo "  ✅ CPU: ~10% vs ~40%"
echo "  ✅ Большие файлы: без проблем vs проблемы"
echo "  ✅ Стабильность 24/7: отлично vs плохо"
echo ""
echo "🎯 MPV = ExoPlayer для Linux!"
echo "🌿 DEV branch - последние обновления и фичи"
echo ""

