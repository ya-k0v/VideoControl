#!/bin/bash
# Скрипт установки VideoControl MPV Client
# Оптимизирован для Raspberry Pi

set -e  # Остановка при ошибке

echo "=================================================="
echo "   VideoControl MPV Client - Установка"
echo "=================================================="

# Цвета
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Проверка что запущено из правильной директории
if [ ! -f "mpv_client.py" ] || [ ! -f "requirements.txt" ]; then
    echo -e "${RED}Ошибка: Запустите скрипт из директории clients/mpv${NC}"
    echo "cd /vid/videocontrol/clients/mpv && bash install.sh"
    exit 1
fi

echo ""
echo -e "${BLUE}Этот скрипт установит MPV клиент для VideoControl${NC}"
echo -e "${BLUE}(Оптимизирован для Raspberry Pi)${NC}"
echo ""

# Определение платформы
IS_RPI=false
if [ -f /proc/device-tree/model ]; then
    if grep -q "Raspberry Pi" /proc/device-tree/model 2>/dev/null; then
        IS_RPI=true
        RPI_MODEL=$(cat /proc/device-tree/model | tr -d '\0')
        echo -e "${GREEN}Обнаружен: $RPI_MODEL${NC}"
    fi
fi

echo -e "${YELLOW}Шаг 1/6: Проверка Python 3...${NC}"
if command -v python3 &> /dev/null; then
    PYTHON_VERSION=$(python3 --version)
    echo -e "${GREEN}✓ Python 3 установлен: $PYTHON_VERSION${NC}"
else
    echo -e "${RED}✗ Python 3 не установлен!${NC}"
    echo "Установите: sudo apt install python3 python3-pip"
    exit 1
fi

echo ""
echo -e "${YELLOW}Шаг 2/6: Проверка pip3...${NC}"
if command -v pip3 &> /dev/null; then
    PIP_VERSION=$(pip3 --version)
    echo -e "${GREEN}✓ pip3 установлен: $PIP_VERSION${NC}"
else
    echo -e "${RED}✗ pip3 не установлен!${NC}"
    echo "Установите: sudo apt install python3-pip"
    exit 1
fi

echo ""
echo -e "${YELLOW}Шаг 3/6: Проверка MPV...${NC}"
if command -v mpv &> /dev/null; then
    MPV_VERSION=$(mpv --version | head -n1)
    echo -e "${GREEN}✓ MPV установлен: $MPV_VERSION${NC}"
else
    echo -e "${YELLOW}⚠ MPV не установлен${NC}"
    echo ""
    echo -e "${YELLOW}Установить MPV? (y/n)${NC}"
    read -r INSTALL_MPV
    
    if [ "$INSTALL_MPV" = "y" ] || [ "$INSTALL_MPV" = "Y" ]; then
        echo "Установка MPV..."
        sudo apt update
        sudo apt install -y mpv libmpv-dev
        echo -e "${GREEN}✓ MPV установлен${NC}"
    else
        echo -e "${RED}MPV необходим для работы клиента!${NC}"
        exit 1
    fi
fi

echo ""
echo -e "${YELLOW}Шаг 4/6: Установка Python зависимостей...${NC}"
pip3 install -r requirements.txt
echo -e "${GREEN}✓ Python зависимости установлены${NC}"

echo ""
echo -e "${YELLOW}Шаг 5/6: Оптимизация для Raspberry Pi...${NC}"
if [ "$IS_RPI" = true ]; then
    # Проверка GPU memory
    if command -v vcgencmd &> /dev/null; then
        GPU_MEM=$(vcgencmd get_mem gpu | cut -d'=' -f2 | cut -d'M' -f1)
        echo "GPU Memory: ${GPU_MEM}MB"
        
        if [ "$GPU_MEM" -lt 256 ]; then
            echo -e "${YELLOW}⚠ GPU memory меньше 256MB (текущее: ${GPU_MEM}MB)${NC}"
            echo "  Для оптимальной работы видео рекомендуется >= 256MB"
            echo ""
            echo -e "${YELLOW}Увеличить GPU memory до 256MB? (y/n)${NC}"
            echo "  (Требуется перезагрузка после изменения)"
            read -r INCREASE_GPU
            
            if [ "$INCREASE_GPU" = "y" ] || [ "$INCREASE_GPU" = "Y" ]; then
                # Проверка наличия /boot/config.txt
                if [ -f /boot/config.txt ]; then
                    echo "Настройка GPU memory в /boot/config.txt..."
                    sudo sed -i '/^gpu_mem=/d' /boot/config.txt
                    echo "gpu_mem=256" | sudo tee -a /boot/config.txt > /dev/null
                    echo -e "${GREEN}✓ GPU memory установлен на 256MB${NC}"
                    echo -e "${YELLOW}⚠ Требуется перезагрузка: sudo reboot${NC}"
                    NEED_REBOOT=true
                elif [ -f /boot/firmware/config.txt ]; then
                    echo "Настройка GPU memory в /boot/firmware/config.txt..."
                    sudo sed -i '/^gpu_mem=/d' /boot/firmware/config.txt
                    echo "gpu_mem=256" | sudo tee -a /boot/firmware/config.txt > /dev/null
                    echo -e "${GREEN}✓ GPU memory установлен на 256MB${NC}"
                    echo -e "${YELLOW}⚠ Требуется перезагрузка: sudo reboot${NC}"
                    NEED_REBOOT=true
                fi
            fi
        else
            echo -e "${GREEN}✓ GPU memory оптимален (${GPU_MEM}MB >= 256MB)${NC}"
        fi
    fi
    
    # Проверка vc4-kms-v3d overlay
    if [ -f /boot/config.txt ]; then
        CONFIG_FILE="/boot/config.txt"
    elif [ -f /boot/firmware/config.txt ]; then
        CONFIG_FILE="/boot/firmware/config.txt"
    fi
    
    if [ -n "$CONFIG_FILE" ]; then
        if grep -q "^dtoverlay=vc4-kms-v3d" "$CONFIG_FILE" || grep -q "^dtoverlay=vc4-fkms-v3d" "$CONFIG_FILE"; then
            echo -e "${GREEN}✓ Video driver оптимизирован${NC}"
        else
            echo -e "${YELLOW}⚠ Video driver не оптимизирован${NC}"
            echo "  Добавьте в $CONFIG_FILE: dtoverlay=vc4-kms-v3d"
        fi
    fi
else
    echo -e "${BLUE}ℹ Не Raspberry Pi - пропускаем оптимизацию${NC}"
fi

echo ""
echo -e "${YELLOW}Шаг 6/6: Проверка подключения к серверу...${NC}"
echo -e "${BLUE}Введите URL сервера (по умолчанию: http://localhost):${NC}"
read -r SERVER_URL
SERVER_URL=${SERVER_URL:-http://localhost}

echo -e "${BLUE}Введите ID устройства (по умолчанию: mpv-test):${NC}"
read -r DEVICE_ID
DEVICE_ID=${DEVICE_ID:-mpv-test}

echo ""
echo "Проверка доступности сервера $SERVER_URL ..."
if curl -s -f -m 5 "$SERVER_URL/" > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Сервер доступен${NC}"
else
    echo -e "${YELLOW}⚠ Сервер недоступен по адресу $SERVER_URL${NC}"
    echo "  Убедитесь что сервер запущен на другой машине"
fi

echo ""
echo "=================================================="
echo -e "${GREEN}✓ Установка MPV клиента завершена!${NC}"
echo "=================================================="
echo ""

if [ "$NEED_REBOOT" = true ]; then
    echo -e "${YELLOW}⚠ ВАЖНО: Требуется перезагрузка для применения настроек GPU!${NC}"
    echo "  ${BLUE}sudo reboot${NC}"
    echo ""
fi

echo "Запуск клиента:"
echo "  ${BLUE}python3 mpv_client.py --server $SERVER_URL --device $DEVICE_ID${NC}"
echo ""
echo "Или с отладкой:"
echo "  ${BLUE}python3 mpv_client.py --server $SERVER_URL --device $DEVICE_ID --debug${NC}"
echo ""
echo "Без hardware декодирования (если тормозит):"
echo "  ${BLUE}python3 mpv_client.py --server $SERVER_URL --device $DEVICE_ID --no-hwdec${NC}"
echo ""
echo "Через переменные окружения:"
echo "  ${BLUE}export VIDEOCONTROL_SERVER=\"$SERVER_URL\"${NC}"
echo "  ${BLUE}export VIDEOCONTROL_DEVICE_ID=\"$DEVICE_ID\"${NC}"
echo "  ${BLUE}python3 mpv_client.py${NC}"
echo ""
echo "Systemd service (автозапуск при загрузке):"
echo "  1. ${BLUE}nano videocontrol-mpv@.service${NC} (отредактируйте YOUR_USERNAME и SERVER)"
echo "  2. ${BLUE}sudo cp videocontrol-mpv@.service /etc/systemd/system/${NC}"
echo "  3. ${BLUE}sudo systemctl enable videocontrol-mpv@$DEVICE_ID${NC}"
echo "  4. ${BLUE}sudo systemctl start videocontrol-mpv@$DEVICE_ID${NC}"
echo ""
echo "Справка:"
echo "  ${BLUE}python3 mpv_client.py --help${NC}"
echo ""

if [ "$IS_RPI" = true ]; then
    echo -e "${BLUE}📝 Raspberry Pi Tips:${NC}"
    echo "  • Используйте качественное питание (5V 3A)"
    echo "  • Raspberry Pi 4 рекомендуется для 1080p видео"
    echo "  • Проверяйте температуру: vcgencmd measure_temp"
    echo "  • Используйте охлаждение при длительной работе"
    echo ""
fi

