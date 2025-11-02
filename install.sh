#!/bin/bash
# Скрипт установки VideoControl Server

set -e  # Остановка при ошибке

echo "=================================================="
echo "   VideoControl Server - Установка"
echo "=================================================="

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

PROJECT_DIR="/vid/videocontrol"

echo ""
echo -e "${BLUE}Этот скрипт установит VideoControl Server с зависимостями${NC}"
echo ""

# Проверка что запущено из правильной директории
if [ ! -f "server.js" ] || [ ! -f "package.json" ]; then
    echo -e "${RED}Ошибка: Запустите скрипт из директории проекта VideoControl${NC}"
    echo "cd /vid/videocontrol && bash install.sh"
    exit 1
fi

echo -e "${YELLOW}Шаг 1/6: Проверка Node.js...${NC}"
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    echo -e "${GREEN}✓ Node.js установлен: $NODE_VERSION${NC}"
    
    # Проверка версии (нужна 14+)
    NODE_MAJOR=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_MAJOR" -lt 14 ]; then
        echo -e "${YELLOW}⚠ Рекомендуется Node.js 14+, у вас: $NODE_VERSION${NC}"
    fi
else
    echo -e "${RED}✗ Node.js не установлен!${NC}"
    echo ""
    echo "Установите Node.js 18+:"
    echo "  Ubuntu/Debian: curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash - && sudo apt install nodejs"
    echo "  macOS: brew install node"
    exit 1
fi

echo ""
echo -e "${YELLOW}Шаг 2/6: Проверка npm...${NC}"
if command -v npm &> /dev/null; then
    NPM_VERSION=$(npm --version)
    echo -e "${GREEN}✓ npm установлен: v$NPM_VERSION${NC}"
else
    echo -e "${RED}✗ npm не установлен!${NC}"
    exit 1
fi

echo ""
echo -e "${YELLOW}Шаг 3/6: Установка Node.js зависимостей...${NC}"
npm install
echo -e "${GREEN}✓ Node.js зависимости установлены${NC}"

echo ""
echo -e "${YELLOW}Шаг 4/6: Проверка системных зависимостей...${NC}"

# LibreOffice для PPTX
if command -v soffice &> /dev/null || command -v libreoffice &> /dev/null; then
    echo -e "${GREEN}✓ LibreOffice установлен${NC}"
else
    echo -e "${YELLOW}⚠ LibreOffice не найден (нужен для PPTX конвертации)${NC}"
    echo "  Установка: sudo apt install libreoffice"
    MISSING_DEPS=true
fi

# GraphicsMagick для PDF/PPTX
if command -v gm &> /dev/null; then
    echo -e "${GREEN}✓ GraphicsMagick установлен${NC}"
elif command -v convert &> /dev/null; then
    echo -e "${GREEN}✓ ImageMagick установлен (альтернатива GraphicsMagick)${NC}"
else
    echo -e "${YELLOW}⚠ GraphicsMagick/ImageMagick не найден (нужен для PDF/PPTX)${NC}"
    echo "  Установка: sudo apt install graphicsmagick"
    MISSING_DEPS=true
fi

if [ "$MISSING_DEPS" = true ]; then
    echo ""
    echo -e "${YELLOW}Установить отсутствующие зависимости? (y/n)${NC}"
    read -r INSTALL_DEPS
    if [ "$INSTALL_DEPS" = "y" ] || [ "$INSTALL_DEPS" = "Y" ]; then
        echo "Установка системных зависимостей..."
        sudo apt update
        sudo apt install -y libreoffice graphicsmagick
        echo -e "${GREEN}✓ Системные зависимости установлены${NC}"
    else
        echo -e "${YELLOW}⚠ Продолжаем без системных зависимостей${NC}"
        echo "  (PDF/PPTX конвертация не будет работать)"
    fi
fi

echo ""
echo -e "${YELLOW}Шаг 5/6: Создание необходимых директорий...${NC}"

# Создаем директории если не существуют
mkdir -p public/content
mkdir -p .converted
mkdir -p .pptx_cache

# Создаем примеры устройств если их нет
if [ ! -d "public/content/pc001" ]; then
    mkdir -p public/content/pc001
    echo -e "${GREEN}✓ Создана директория: public/content/pc001${NC}"
fi

if [ ! -d "public/content/rpi0001" ]; then
    mkdir -p public/content/rpi0001
    echo -e "${GREEN}✓ Создана директория: public/content/rpi0001${NC}"
fi

echo -e "${GREEN}✓ Директории готовы${NC}"

echo ""
echo -e "${YELLOW}Шаг 6/6: Проверка конфигурации...${NC}"

# Проверка devices.json
if [ ! -f "devices.json" ]; then
    echo '{
  "pc001": "PC Display 1",
  "rpi0001": "Raspberry Pi Display 1"
}' > devices.json
    echo -e "${GREEN}✓ Создан devices.json${NC}"
else
    echo -e "${GREEN}✓ devices.json существует${NC}"
fi

# Проверка file-names-map.json
if [ ! -f "file-names-map.json" ]; then
    echo '{
  "pc001": {},
  "rpi0001": {}
}' > file-names-map.json
    echo -e "${GREEN}✓ Создан file-names-map.json${NC}"
else
    echo -e "${GREEN}✓ file-names-map.json существует${NC}"
fi

echo ""
echo "=================================================="
echo -e "${GREEN}✓ Установка сервера завершена!${NC}"
echo "=================================================="
echo ""
echo "Запуск сервера:"
echo "  ${BLUE}npm start${NC}"
echo ""
echo "Или установите systemd service для автозапуска:"
echo "  ${BLUE}sudo nano videocontrol.service${NC}  (отредактируйте пути)"
echo "  ${BLUE}sudo cp videocontrol.service /etc/systemd/system/${NC}"
echo "  ${BLUE}sudo systemctl enable videocontrol${NC}"
echo "  ${BLUE}sudo systemctl start videocontrol${NC}"
echo ""
echo "Для установки Nginx (рекомендуется для production):"
echo "  ${BLUE}cd nginx && sudo bash install-nginx.sh${NC}"
echo ""
echo "После запуска сервера откройте в браузере:"
echo "  • http://localhost:3000/admin.html"
echo "  • http://localhost:3000/player.html?device_id=pc001"
echo ""
echo "С Nginx (после установки):"
echo "  • http://localhost/admin.html"
echo "  • http://localhost/player.html?device_id=pc001"
echo ""

