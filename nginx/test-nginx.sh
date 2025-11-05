#!/bin/bash
# Скрипт тестирования Nginx конфигурации для VideoControl

set -e

echo "=================================================="
echo "   VideoControl - Тестирование Nginx"
echo "=================================================="

# Цвета
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Функция проверки
check() {
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓ $1${NC}"
        return 0
    else
        echo -e "${RED}✗ $1${NC}"
        return 1
    fi
}

echo ""
echo -e "${YELLOW}Тест 1: Проверка запущен ли Nginx...${NC}"
if systemctl is-active --quiet nginx 2>/dev/null; then
    echo -e "${GREEN}✓ Nginx запущен${NC}"
else
    echo -e "${RED}✗ Nginx не запущен!${NC}"
    echo "Запустите: sudo systemctl start nginx"
    exit 1
fi

echo ""
echo -e "${YELLOW}Тест 2: Проверка конфигурации Nginx...${NC}"
sudo nginx -t
check "Конфигурация корректна"

echo ""
echo -e "${YELLOW}Тест 3: Проверка что порт 80 слушается...${NC}"
if sudo netstat -tlnp 2>/dev/null | grep -q ':80 ' || sudo ss -tlnp 2>/dev/null | grep -q ':80 '; then
    echo -e "${GREEN}✓ Порт 80 слушается${NC}"
    sudo netstat -tlnp 2>/dev/null | grep ':80 ' || sudo ss -tlnp 2>/dev/null | grep ':80 '
else
    echo -e "${RED}✗ Порт 80 не слушается${NC}"
    exit 1
fi

echo ""
echo -e "${YELLOW}Тест 4: Проверка HTTP запроса к корню...${NC}"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost/ 2>/dev/null || echo "000")
if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "304" ]; then
    echo -e "${GREEN}✓ HTTP запрос успешен (код: $HTTP_CODE)${NC}"
else
    echo -e "${YELLOW}⚠ HTTP код: $HTTP_CODE${NC}"
    if [ "$HTTP_CODE" = "502" ]; then
        echo -e "${RED}  Ошибка: Node.js сервер не доступен на порту 3000${NC}"
        echo "  Запустите Node.js: cd /vid/videocontrol && npm start"
    fi
fi

echo ""
echo -e "${YELLOW}Тест 5: Проверка раздачи контента через Nginx...${NC}"
# Проверяем есть ли какой-то контент
CONTENT_DIR="/vid/videocontrol/public/content"
if [ -d "$CONTENT_DIR" ]; then
    # Ищем любой файл для тестирования
    TEST_FILE=$(find "$CONTENT_DIR" -type f \( -name "*.mp4" -o -name "*.jpg" -o -name "*.png" \) | head -n 1)
    
    if [ -n "$TEST_FILE" ]; then
        # Получаем относительный путь
        REL_PATH="${TEST_FILE#$CONTENT_DIR/}"
        TEST_URL="http://localhost/content/$REL_PATH"
        
        echo "Тестируем: $TEST_URL"
        
        # Проверяем заголовки
        HEADERS=$(curl -sI "$TEST_URL" 2>/dev/null || echo "")
        
        if echo "$HEADERS" | grep -q "200 OK"; then
            echo -e "${GREEN}✓ Файл доступен через Nginx${NC}"
            
            # Проверяем важные заголовки
            if echo "$HEADERS" | grep -q "Accept-Ranges: bytes"; then
                echo -e "${GREEN}  ✓ Accept-Ranges: bytes (поддержка seek)${NC}"
            fi
            
            if echo "$HEADERS" | grep -q "Cache-Control"; then
                CACHE_VALUE=$(echo "$HEADERS" | grep "Cache-Control" | cut -d: -f2 | xargs)
                echo -e "${GREEN}  ✓ Cache-Control: $CACHE_VALUE${NC}"
            fi
            
            if echo "$HEADERS" | grep -q "Server: nginx"; then
                echo -e "${GREEN}  ✓ Раздается через Nginx (не Node.js)${NC}"
            fi
        else
            echo -e "${RED}✗ Ошибка доступа к файлу${NC}"
            echo "$HEADERS"
        fi
    else
        echo -e "${YELLOW}⚠ Нет тестовых файлов в $CONTENT_DIR${NC}"
    fi
else
    echo -e "${YELLOW}⚠ Директория контента не найдена: $CONTENT_DIR${NC}"
fi

echo ""
echo -e "${YELLOW}Тест 6: Проверка работы Node.js через прокси...${NC}"
if curl -s http://localhost/ >/dev/null 2>&1; then
    echo -e "${GREEN}✓ Node.js сервер доступен напрямую (порт 3000)${NC}"
else
    echo -e "${YELLOW}⚠ Node.js сервер не отвечает на порту 3000${NC}"
    echo "  Запустите: cd /vid/videocontrol && npm start"
fi

echo ""
echo -e "${YELLOW}Тест 7: Проверка логов Nginx...${NC}"
ERROR_LOG="/var/log/nginx/videocontrol_error.log"
ACCESS_LOG="/var/log/nginx/videocontrol_access.log"

if [ -f "$ERROR_LOG" ]; then
    ERROR_COUNT=$(wc -l < "$ERROR_LOG" 2>/dev/null || echo 0)
    echo -e "${GREEN}✓ Лог ошибок существует ($ERROR_COUNT строк)${NC}"
    
    # Показываем последние ошибки если есть
    RECENT_ERRORS=$(tail -n 5 "$ERROR_LOG" 2>/dev/null | grep -i error || echo "")
    if [ -n "$RECENT_ERRORS" ]; then
        echo -e "${YELLOW}  Последние ошибки:${NC}"
        echo "$RECENT_ERRORS" | sed 's/^/    /'
    fi
else
    echo -e "${YELLOW}⚠ Лог ошибок не найден: $ERROR_LOG${NC}"
fi

if [ -f "$ACCESS_LOG" ]; then
    ACCESS_COUNT=$(wc -l < "$ACCESS_LOG" 2>/dev/null || echo 0)
    echo -e "${GREEN}✓ Лог доступа существует ($ACCESS_COUNT запросов)${NC}"
else
    echo -e "${YELLOW}⚠ Лог доступа не найден: $ACCESS_LOG${NC}"
fi

echo ""
echo "=================================================="
echo -e "${GREEN}✓ Тестирование завершено${NC}"
echo "=================================================="
echo ""
echo "Полезные команды:"
echo "  • Логи ошибок: sudo tail -f /var/log/nginx/videocontrol_error.log"
echo "  • Логи доступа: sudo tail -f /var/log/nginx/videocontrol_access.log"
echo "  • Рестарт Nginx: sudo systemctl restart nginx"
echo "  • Статус Nginx: sudo systemctl status nginx"
echo ""
echo "Откройте в браузере:"
SERVER_IP=$(hostname -I | awk '{print $1}')
echo "  • http://$SERVER_IP/"
echo "  • http://$SERVER_IP/admin.html"
echo "  • http://$SERVER_IP/player.html?device_id=test001"
echo ""

