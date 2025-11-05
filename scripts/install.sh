#!/bin/bash
# VideoControl Server - Полная установка одной командой
# Использование: 
#   bash install.sh              # Development установка (в текущую директорию)
#   sudo bash install.sh         # Production установка (в /opt/videocontrol + systemd)

set -e

# Цвета
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

echo ""
echo "=================================================="
echo "   VideoControl Server - Полная установка"
echo "=================================================="
echo ""

# Определяем режим установки
if [ "$EUID" -eq 0 ]; then
    INSTALL_MODE="production"
    INSTALL_DIR="/opt/videocontrol"
    SERVICE_USER="videocontrol"
    echo -e "${CYAN}Режим: Production (systemd + /opt/videocontrol)${NC}"
else
    INSTALL_MODE="development"
    INSTALL_DIR="$(pwd)"
    echo -e "${CYAN}Режим: Development (локальная директория)${NC}"
fi

echo ""

# Проверка что запущено из правильной директории (для development)
if [ "$INSTALL_MODE" = "development" ]; then
    if [ ! -f "server.js" ] || [ ! -f "package.json" ]; then
        echo -e "${RED}❌ Ошибка: Запустите скрипт из директории проекта VideoControl${NC}"
        echo "   cd /vid/videocontrol && bash install.sh"
        exit 1
    fi
    PROJECT_DIR="$(pwd)"
else
    # Production - определяем откуда запущен скрипт
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    if [ -f "$SCRIPT_DIR/server.js" ]; then
        PROJECT_DIR="$SCRIPT_DIR"
    else
        echo -e "${RED}❌ Ошибка: server.js не найден${NC}"
        exit 1
    fi
fi

# ============================================
# Шаг 1: Проверка и установка Node.js
# ============================================
echo -e "${YELLOW}📦 Шаг 1/7: Проверка Node.js...${NC}"

if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    NODE_MAJOR=$(echo $NODE_VERSION | cut -d'v' -f2 | cut -d'.' -f1)
    echo -e "${GREEN}✓ Node.js установлен: $NODE_VERSION${NC}"
    
    if [ "$NODE_MAJOR" -lt 14 ]; then
        echo -e "${YELLOW}⚠ Рекомендуется Node.js 14+${NC}"
    fi
else
    echo -e "${YELLOW}⚠ Node.js не установлен${NC}"
    
    if [ "$INSTALL_MODE" = "production" ]; then
        echo "Установка Node.js 18..."
        if [ -f /etc/debian_version ]; then
            curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
            apt-get install -y nodejs
            echo -e "${GREEN}✓ Node.js 18 установлен${NC}"
        else
            echo -e "${RED}❌ Автоматическая установка Node.js не поддерживается для этой ОС${NC}"
            echo "Установите вручную: https://nodejs.org/"
            exit 1
        fi
    else
        echo -e "${RED}❌ Установите Node.js 14+:${NC}"
        echo "  Ubuntu/Debian: curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash - && sudo apt install nodejs"
        echo "  macOS: brew install node"
        exit 1
    fi
fi

# ============================================
# Шаг 2: Установка системных зависимостей
# ============================================
echo ""
echo -e "${YELLOW}📦 Шаг 2/7: Системные зависимости...${NC}"

MISSING_DEPS=false

# LibreOffice
if command -v soffice &> /dev/null || command -v libreoffice &> /dev/null; then
    echo -e "${GREEN}✓ LibreOffice установлен${NC}"
else
    echo -e "${YELLOW}⚠ LibreOffice не найден (нужен для PPTX)${NC}"
    MISSING_DEPS=true
fi

# GraphicsMagick
if command -v gm &> /dev/null; then
    echo -e "${GREEN}✓ GraphicsMagick установлен${NC}"
elif command -v convert &> /dev/null; then
    echo -e "${GREEN}✓ ImageMagick установлен${NC}"
else
    echo -e "${YELLOW}⚠ GraphicsMagick не найден (нужен для PDF/PPTX)${NC}"
    MISSING_DEPS=true
fi

# Curl
if command -v curl &> /dev/null; then
    echo -e "${GREEN}✓ curl установлен${NC}"
else
    echo -e "${YELLOW}⚠ curl не найден${NC}"
    MISSING_DEPS=true
fi

if [ "$MISSING_DEPS" = true ]; then
    if [ "$INSTALL_MODE" = "production" ]; then
        echo "Установка системных зависимостей..."
        apt-get update -qq
        apt-get install -y libreoffice graphicsmagick curl git
        echo -e "${GREEN}✓ Системные зависимости установлены${NC}"
    else
        echo ""
        echo -e "${YELLOW}Установить отсутствующие зависимости? (y/n)${NC}"
        read -r INSTALL_DEPS
        if [ "$INSTALL_DEPS" = "y" ] || [ "$INSTALL_DEPS" = "Y" ]; then
            sudo apt-get update
            sudo apt-get install -y libreoffice graphicsmagick curl
            echo -e "${GREEN}✓ Системные зависимости установлены${NC}"
        else
            echo -e "${YELLOW}⚠ Продолжаем без некоторых зависимостей${NC}"
            echo "  (PDF/PPTX конвертация может не работать)"
        fi
    fi
fi

# ============================================
# Шаг 3: Копирование файлов (для production)
# ============================================
if [ "$INSTALL_MODE" = "production" ]; then
    echo ""
    echo -e "${YELLOW}📁 Шаг 3/7: Копирование файлов в $INSTALL_DIR...${NC}"
    
    # Создаем пользователя
    if ! id "$SERVICE_USER" &>/dev/null; then
        useradd -r -s /bin/false -d $INSTALL_DIR -c "Video Control Service" $SERVICE_USER
        echo -e "${GREEN}✓ Пользователь $SERVICE_USER создан${NC}"
    else
        echo -e "${GREEN}✓ Пользователь $SERVICE_USER существует${NC}"
    fi
    
    # Копируем файлы
    mkdir -p $INSTALL_DIR
    rsync -a --exclude='node_modules' --exclude='.git' --exclude='logs' --exclude='.internal' \
        "$PROJECT_DIR/" "$INSTALL_DIR/"
    
    # Создаем директории
    mkdir -p $INSTALL_DIR/logs
    mkdir -p $INSTALL_DIR/public/content
    mkdir -p $INSTALL_DIR/.converted
    
    echo -e "${GREEN}✓ Файлы скопированы${NC}"
    
    # Переходим в install dir
    cd $INSTALL_DIR
else
    echo ""
    echo -e "${YELLOW}📁 Шаг 3/7: Подготовка директорий...${NC}"
    
    # Создаем директории
    mkdir -p public/content
    mkdir -p .converted
    mkdir -p .pptx_cache
    
    # Примеры устройств
    mkdir -p public/content/pc001
    mkdir -p public/content/rpi0001
    
    echo -e "${GREEN}✓ Директории готовы${NC}"
fi

# ============================================
# Шаг 4: Установка Node.js зависимостей
# ============================================
echo ""
echo -e "${YELLOW}📦 Шаг 4/7: Установка Node.js зависимостей...${NC}"

if [ "$INSTALL_MODE" = "production" ]; then
    sudo -u $SERVICE_USER npm install --production
    chown -R $SERVICE_USER:$SERVICE_USER $INSTALL_DIR
else
    npm install
fi

echo -e "${GREEN}✓ Node.js зависимости установлены${NC}"

# ============================================
# Шаг 5: Создание конфигурационных файлов
# ============================================
echo ""
echo -e "${YELLOW}⚙️  Шаг 5/7: Конфигурационные файлы...${NC}"

# devices.json
if [ ! -f "devices.json" ]; then
    cat > devices.json << 'EOF'
{
  "pc001": "PC Display 1",
  "rpi0001": "Raspberry Pi Display 1"
}
EOF
    echo -e "${GREEN}✓ Создан devices.json${NC}"
else
    echo -e "${GREEN}✓ devices.json существует${NC}"
fi

# file-names-map.json
if [ ! -f "file-names-map.json" ]; then
    cat > file-names-map.json << 'EOF'
{
  "pc001": {},
  "rpi0001": {}
}
EOF
    echo -e "${GREEN}✓ Создан file-names-map.json${NC}"
else
    echo -e "${GREEN}✓ file-names-map.json существует${NC}"
fi

if [ "$INSTALL_MODE" = "production" ]; then
    chown $SERVICE_USER:$SERVICE_USER devices.json file-names-map.json
fi

# ============================================
# Шаг 6: Systemd service (только production)
# ============================================
if [ "$INSTALL_MODE" = "production" ]; then
    echo ""
    echo -e "${YELLOW}⚙️  Шаг 6/7: Настройка systemd service...${NC}"
    
    cat > /etc/systemd/system/videocontrol.service << 'EOF'
[Unit]
Description=Video Control System Server
Documentation=https://github.com/ya-k0v/VideoControl
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=videocontrol
Group=videocontrol
WorkingDirectory=/opt/videocontrol
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=10
StartLimitInterval=60
StartLimitBurst=3

# Logging
StandardOutput=journal
StandardError=journal
SyslogIdentifier=videocontrol

# Resource limits
MemoryLimit=2G
CPUQuota=80%
TasksMax=512

# Environment
Environment=NODE_ENV=production
Environment=PORT=3000
Environment=LOG_LEVEL=info

# Security
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/opt/videocontrol

[Install]
WantedBy=multi-user.target
EOF
    
    systemctl daemon-reload
    echo -e "${GREEN}✓ Systemd service создан${NC}"
    
    # Logrotate
    cat > /etc/logrotate.d/videocontrol << 'EOF'
/opt/videocontrol/logs/*.log {
    daily
    rotate 14
    compress
    delaycompress
    notifempty
    create 0640 videocontrol videocontrol
    sharedscripts
    postrotate
        systemctl reload videocontrol >/dev/null 2>&1 || true
    endscript
}
EOF
    echo -e "${GREEN}✓ Logrotate настроен${NC}"
else
    echo ""
    echo -e "${YELLOW}⚙️  Шаг 6/7: Systemd service (пропущен в development режиме)${NC}"
fi

# ============================================
# Шаг 7: Nginx (опционально)
# ============================================
echo ""
echo -e "${YELLOW}🌐 Шаг 7/7: Nginx setup...${NC}"

if [ "$INSTALL_MODE" = "production" ]; then
    echo ""
    echo -e "${CYAN}Установить и настроить Nginx? (рекомендуется для production) (y/n)${NC}"
    read -r INSTALL_NGINX
    
    if [ "$INSTALL_NGINX" = "y" ] || [ "$INSTALL_NGINX" = "Y" ]; then
        if [ -f "$INSTALL_DIR/nginx/install-nginx.sh" ]; then
            bash "$INSTALL_DIR/nginx/install-nginx.sh"
            echo -e "${GREEN}✓ Nginx установлен и настроен${NC}"
        else
            echo -e "${YELLOW}⚠ nginx/install-nginx.sh не найден${NC}"
        fi
    else
        echo -e "${YELLOW}⚠ Nginx пропущен (можно установить позже: sudo bash nginx/install-nginx.sh)${NC}"
    fi
else
    echo "Nginx рекомендуется для production."
    echo "Для установки: sudo bash nginx/install-nginx.sh"
fi

# ============================================
# Завершение и инструкции
# ============================================
echo ""
echo "=================================================="
echo -e "${GREEN}✓ Установка завершена успешно!${NC}"
echo "=================================================="
echo ""

if [ "$INSTALL_MODE" = "production" ]; then
    echo -e "${CYAN}Production режим - установлено в /opt/videocontrol${NC}"
    echo ""
    echo "📋 Управление сервисом:"
    echo "  ${BLUE}sudo systemctl start videocontrol${NC}    # Запустить"
    echo "  ${BLUE}sudo systemctl enable videocontrol${NC}   # Автозапуск"
    echo "  ${BLUE}sudo systemctl status videocontrol${NC}   # Статус"
    echo "  ${BLUE}sudo journalctl -u videocontrol -f${NC}   # Логи"
    echo ""
    echo "🌐 Веб-интерфейсы:"
    echo "  • Админ: http://$(hostname -I | awk '{print $1}')/admin.html"
    echo "  • Спикер: http://$(hostname -I | awk '{print $1}')/speaker.html"
    echo ""
    echo "💡 Следующие шаги:"
    echo "  1. ${BLUE}sudo systemctl start videocontrol${NC}"
    echo "  2. ${BLUE}sudo systemctl enable videocontrol${NC}"
    echo "  3. Откройте http://$(hostname -I | awk '{print $1}')/admin.html"
else
    echo -e "${CYAN}Development режим - установлено локально${NC}"
    echo ""
    echo "🚀 Запуск сервера:"
    echo "  ${BLUE}npm start${NC}"
    echo ""
    echo "Или в фоновом режиме:"
    echo "  ${BLUE}npm start &${NC}"
    echo ""
    echo "🌐 После запуска откройте:"
    echo "  • Админ: http://localhost/admin.html"
    echo "  • Плеер: http://localhost/player.html?device_id=pc001"
    echo "  • Спикер: http://localhost/speaker.html"
    echo ""
    echo "📝 Для production установки:"
    echo "  ${BLUE}sudo bash install.sh${NC}"
    echo ""
    echo "📦 Для установки Nginx (рекомендуется):"
    echo "  ${BLUE}cd nginx && sudo bash install-nginx.sh${NC}"
fi

echo ""
echo "📚 Документация:"
echo "  • README.md - основная документация"
echo "  • scripts/README.md - deployment инструкции"
echo "  • clients/README.md - клиенты для разных платформ"
echo ""
echo -e "${GREEN}Готово! 🚀${NC}"
echo ""
