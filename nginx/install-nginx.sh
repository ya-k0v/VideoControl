#!/bin/bash
# Скрипт установки и настройки Nginx для VideoControl

set -e  # Остановка при ошибке

echo "=================================================="
echo "   VideoControl - Установка Nginx"
echo "=================================================="

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Проверка прав root
if [ "$EUID" -ne 0 ]; then 
    echo -e "${RED}Ошибка: Запустите скрипт с sudo${NC}"
    echo "Использование: sudo bash install-nginx.sh"
    exit 1
fi

echo -e "${YELLOW}Шаг 1: Проверка установки Nginx...${NC}"
if command -v nginx &> /dev/null; then
    echo -e "${GREEN}✓ Nginx уже установлен$(nginx -v 2>&1)${NC}"
else
    echo -e "${YELLOW}Устанавливаем Nginx...${NC}"
    apt update
    apt install nginx -y
    echo -e "${GREEN}✓ Nginx установлен${NC}"
fi

echo ""
echo -e "${YELLOW}Шаг 2: Остановка Nginx (если запущен)...${NC}"
systemctl stop nginx 2>/dev/null || true
echo -e "${GREEN}✓ Nginx остановлен${NC}"

echo ""
echo -e "${YELLOW}Шаг 3: Применение конфигурации...${NC}"

# Удаление дефолтной конфигурации
if [ -f /etc/nginx/sites-enabled/default ]; then
    rm -f /etc/nginx/sites-enabled/default
    echo -e "${GREEN}✓ Удалена дефолтная конфигурация${NC}"
fi

# Создание симлинка на нашу конфигурацию
ln -sf /vid/videocontrol/nginx/videocontrol.conf /etc/nginx/sites-available/videocontrol
ln -sf /etc/nginx/sites-available/videocontrol /etc/nginx/sites-enabled/videocontrol
echo -e "${GREEN}✓ Конфигурация применена${NC}"

echo ""
echo -e "${YELLOW}Шаг 4: Проверка правильности конфигурации...${NC}"
if nginx -t; then
    echo -e "${GREEN}✓ Конфигурация корректна${NC}"
else
    echo -e "${RED}✗ Ошибка в конфигурации Nginx!${NC}"
    echo "Проверьте файл: /vid/videocontrol/nginx/videocontrol.conf"
    exit 1
fi

echo ""
echo -e "${YELLOW}Шаг 5: Настройка прав доступа к файлам...${NC}"
# Nginx должен иметь доступ к контенту
if [ -d /vid/videocontrol/public/content ]; then
    chown -R www-data:www-data /vid/videocontrol/public/content/ 2>/dev/null || true
    chmod -R 755 /vid/videocontrol/public/content/
    echo -e "${GREEN}✓ Права доступа настроены${NC}"
else
    echo -e "${YELLOW}⚠ Директория /vid/videocontrol/public/content не найдена${NC}"
fi

echo ""
echo -e "${YELLOW}Шаг 6: Запуск Nginx...${NC}"
systemctl start nginx
systemctl enable nginx  # Автозапуск при загрузке системы
echo -e "${GREEN}✓ Nginx запущен и добавлен в автозагрузку${NC}"

echo ""
echo -e "${YELLOW}Шаг 7: Проверка статуса...${NC}"
if systemctl is-active --quiet nginx; then
    echo -e "${GREEN}✓ Nginx работает${NC}"
else
    echo -e "${RED}✗ Nginx не запущен!${NC}"
    systemctl status nginx
    exit 1
fi

echo ""
echo "=================================================="
echo -e "${GREEN}✓ Установка завершена успешно!${NC}"
echo "=================================================="
echo ""
echo "Информация:"
echo "  • Nginx слушает на порту: 80"
echo "  • Node.js сервер на порту: 3000 (внутренний)"
echo "  • Конфигурация: /vid/videocontrol/nginx/videocontrol.conf"
echo "  • Логи ошибок: /var/log/nginx/videocontrol_error.log"
echo "  • Логи доступа: /var/log/nginx/videocontrol_access.log"
echo ""
echo "Проверьте работу:"
echo "  1. Откройте браузер: http://$(hostname -I | awk '{print $1}')/"
echo "  2. Или локально: http://localhost/"
echo ""
echo "Команды управления:"
echo "  • Статус: sudo systemctl status nginx"
echo "  • Рестарт: sudo systemctl restart nginx"
echo "  • Логи: sudo tail -f /var/log/nginx/videocontrol_error.log"
echo ""

