#!/bin/bash
# Скрипт установки VideoControl VLC Client

set -e  # Остановка при ошибке

echo "=================================================="
echo "   VideoControl VLC Client - Установка"
echo "=================================================="

# Цвета
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Проверка что запущено из правильной директории
if [ ! -f "vlc_client.py" ] || [ ! -f "requirements.txt" ]; then
    echo -e "${RED}Ошибка: Запустите скрипт из директории clients/vlc${NC}"
    echo "cd /vid/videocontrol/clients/vlc && bash install.sh"
    exit 1
fi

echo ""
echo -e "${BLUE}Этот скрипт установит VLC клиент для VideoControl${NC}"
echo ""

echo -e "${YELLOW}Шаг 1/5: Проверка Python 3...${NC}"
if command -v python3 &> /dev/null; then
    PYTHON_VERSION=$(python3 --version)
    echo -e "${GREEN}✓ Python 3 установлен: $PYTHON_VERSION${NC}"
else
    echo -e "${RED}✗ Python 3 не установлен!${NC}"
    echo "Установите: sudo apt install python3 python3-pip"
    exit 1
fi

echo ""
echo -e "${YELLOW}Шаг 2/5: Проверка pip3...${NC}"
if command -v pip3 &> /dev/null; then
    PIP_VERSION=$(pip3 --version)
    echo -e "${GREEN}✓ pip3 установлен: $PIP_VERSION${NC}"
else
    echo -e "${RED}✗ pip3 не установлен!${NC}"
    echo "Установите: sudo apt install python3-pip"
    exit 1
fi

echo ""
echo -e "${YELLOW}Шаг 3/5: Проверка VLC...${NC}"
if command -v vlc &> /dev/null; then
    VLC_VERSION=$(vlc --version | head -n1)
    echo -e "${GREEN}✓ VLC установлен: $VLC_VERSION${NC}"
else
    echo -e "${YELLOW}⚠ VLC не установлен${NC}"
    echo ""
    echo -e "${YELLOW}Установить VLC? (y/n)${NC}"
    read -r INSTALL_VLC
    
    if [ "$INSTALL_VLC" = "y" ] || [ "$INSTALL_VLC" = "Y" ]; then
        if [[ "$OSTYPE" == "linux-gnu"* ]]; then
            echo "Установка VLC на Linux..."
            sudo apt update
            sudo apt install -y vlc python3-vlc
            echo -e "${GREEN}✓ VLC установлен${NC}"
        elif [[ "$OSTYPE" == "darwin"* ]]; then
            echo "Установка VLC на macOS..."
            if command -v brew &> /dev/null; then
                brew install --cask vlc
                echo -e "${GREEN}✓ VLC установлен${NC}"
            else
                echo -e "${RED}Homebrew не найден. Установите VLC вручную: https://www.videolan.org/vlc/${NC}"
                exit 1
            fi
        else
            echo -e "${RED}Неподдерживаемая ОС. Установите VLC вручную: https://www.videolan.org/vlc/${NC}"
            exit 1
        fi
    else
        echo -e "${RED}VLC необходим для работы клиента!${NC}"
        exit 1
    fi
fi

echo ""
echo -e "${YELLOW}Шаг 4/5: Установка Python зависимостей...${NC}"
pip3 install -r requirements.txt
echo -e "${GREEN}✓ Python зависимости установлены${NC}"

echo ""
echo -e "${YELLOW}Шаг 5/5: Проверка подключения к серверу...${NC}"
echo -e "${BLUE}Введите URL сервера (по умолчанию: http://localhost):${NC}"
read -r SERVER_URL
SERVER_URL=${SERVER_URL:-http://localhost}

echo -e "${BLUE}Введите ID устройства (по умолчанию: vlc-test):${NC}"
read -r DEVICE_ID
DEVICE_ID=${DEVICE_ID:-vlc-test}

echo ""
echo "Проверка доступности сервера $SERVER_URL ..."
if curl -s -f -m 5 "$SERVER_URL/" > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Сервер доступен${NC}"
else
    echo -e "${YELLOW}⚠ Сервер недоступен по адресу $SERVER_URL${NC}"
    echo "  Убедитесь что сервер запущен: npm start"
    echo "  Или установлен Nginx: cd nginx && sudo bash install-nginx.sh"
fi

echo ""
echo "=================================================="
echo -e "${GREEN}✓ Установка VLC клиента завершена!${NC}"
echo "=================================================="
echo ""
echo "Запуск клиента:"
echo "  ${BLUE}python3 vlc_client.py --server $SERVER_URL --device $DEVICE_ID${NC}"
echo ""
echo "Или с отладкой:"
echo "  ${BLUE}python3 vlc_client.py --server $SERVER_URL --device $DEVICE_ID --debug${NC}"
echo ""
echo "Без fullscreen (для тестирования):"
echo "  ${BLUE}python3 vlc_client.py --server $SERVER_URL --device $DEVICE_ID --no-fullscreen${NC}"
echo ""
echo "Через переменные окружения:"
echo "  ${BLUE}export VIDEOCONTROL_SERVER=\"$SERVER_URL\"${NC}"
echo "  ${BLUE}export VIDEOCONTROL_DEVICE_ID=\"$DEVICE_ID\"${NC}"
echo "  ${BLUE}python3 vlc_client.py${NC}"
echo ""
echo "Systemd service (автозапуск):"
echo "  1. ${BLUE}nano videocontrol-vlc@.service${NC} (отредактируйте YOUR_USERNAME и SERVER)"
echo "  2. ${BLUE}sudo cp videocontrol-vlc@.service /etc/systemd/system/${NC}"
echo "  3. ${BLUE}sudo systemctl enable videocontrol-vlc@$DEVICE_ID${NC}"
echo "  4. ${BLUE}sudo systemctl start videocontrol-vlc@$DEVICE_ID${NC}"
echo ""
echo "Справка:"
echo "  ${BLUE}python3 vlc_client.py --help${NC}"
echo ""

