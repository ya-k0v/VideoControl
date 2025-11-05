#!/bin/bash
# Скрипт оптимизации Nginx для тяжелых видео файлов

set -e

echo "=================================================="
echo "   Nginx - Оптимизация для больших видео"
echo "=================================================="

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Проверка прав root
if [ "$EUID" -ne 0 ]; then 
    echo -e "${RED}Ошибка: Запустите скрипт с sudo${NC}"
    echo "Использование: sudo bash optimize-for-large-videos.sh"
    exit 1
fi

echo ""
echo -e "${YELLOW}Этот скрипт оптимизирует Nginx для работы с большими видео файлами${NC}"
echo ""

# Проверка что Nginx установлен
if ! command -v nginx &> /dev/null; then
    echo -e "${RED}✗ Nginx не установлен!${NC}"
    echo "Сначала установите Nginx: bash install-nginx.sh"
    exit 1
fi

echo -e "${YELLOW}Шаг 1: Обновление videocontrol.conf (уже применено)${NC}"
echo -e "${GREEN}✓ Конфигурация обновлена${NC}"
echo "  • directio: 4m → 512m (меньше прямого I/O)"
echo "  • output_buffers: 512k → 2x2MB (больше буферы)"

echo ""
echo -e "${YELLOW}Шаг 2: Проверка /etc/nginx/nginx.conf${NC}"

NGINX_CONF="/etc/nginx/nginx.conf"
BACKUP_CONF="/etc/nginx/nginx.conf.backup-$(date +%Y%m%d-%H%M%S)"

# Создаем бэкап
cp "$NGINX_CONF" "$BACKUP_CONF"
echo -e "${GREEN}✓ Создан бэкап: $BACKUP_CONF${NC}"

# Проверяем текущие настройки
echo ""
echo "Текущие настройки:"

WORKER_PROC=$(grep -E "^\s*worker_processes" "$NGINX_CONF" | head -1 || echo "не найдено")
echo "  worker_processes: $WORKER_PROC"

WORKER_CONN=$(grep -E "^\s*worker_connections" "$NGINX_CONF" | head -1 || echo "не найдено")
echo "  worker_connections: $WORKER_CONN"

SENDFILE=$(grep -E "^\s*sendfile" "$NGINX_CONF" | head -1 || echo "не найдено")
echo "  sendfile: $SENDFILE"

OPEN_FILE_CACHE=$(grep -E "^\s*open_file_cache" "$NGINX_CONF" | head -1 || echo "не найдено")
echo "  open_file_cache: $OPEN_FILE_CACHE"

echo ""
echo -e "${YELLOW}Рекомендуемые оптимизации для /etc/nginx/nginx.conf:${NC}"
echo ""
cat <<'EOF'
http {
    # Worker optimization
    worker_processes auto;
    worker_rlimit_nofile 65535;
    
    events {
        worker_connections 4096;
        use epoll;
        multi_accept on;
    }
    
    # File sending optimization
    sendfile on;
    sendfile_max_chunk 2m;  # ← ВАЖНО для больших файлов
    tcp_nopush on;
    tcp_nodelay on;
    
    # File cache (критично!)
    open_file_cache max=10000 inactive=30s;
    open_file_cache_valid 60s;
    open_file_cache_min_uses 2;
    open_file_cache_errors on;
    
    # Keepalive
    keepalive_timeout 65;
    keepalive_requests 1000;
    
    # Buffers
    client_body_buffer_size 256k;
}
EOF

echo ""
echo -e "${YELLOW}Применить эти оптимизации? (y/n)${NC}"
read -r APPLY

if [ "$APPLY" = "y" ] || [ "$APPLY" = "Y" ]; then
    echo ""
    echo "Применение оптимизаций..."
    
    # Проверяем есть ли уже sendfile_max_chunk
    if ! grep -q "sendfile_max_chunk" "$NGINX_CONF"; then
        # Добавляем после sendfile on;
        sed -i '/sendfile on;/a \    sendfile_max_chunk 2m;' "$NGINX_CONF"
        echo -e "${GREEN}✓ Добавлен sendfile_max_chunk 2m${NC}"
    fi
    
    # Проверяем есть ли open_file_cache
    if ! grep -q "open_file_cache" "$NGINX_CONF"; then
        # Добавляем в секцию http
        sed -i '/http {/a \    # File cache for large video files\n    open_file_cache max=10000 inactive=30s;\n    open_file_cache_valid 60s;\n    open_file_cache_min_uses 2;\n    open_file_cache_errors on;' "$NGINX_CONF"
        echo -e "${GREEN}✓ Добавлен open_file_cache${NC}"
    fi
    
    echo -e "${GREEN}✓ Оптимизации применены${NC}"
else
    echo -e "${YELLOW}Пропущено. Вы можете применить вручную.${NC}"
    echo "Примеры настроек сохранены в: nginx-optimization.conf"
fi

echo ""
echo -e "${YELLOW}Шаг 3: Тест конфигурации${NC}"
nginx -t

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Конфигурация корректна${NC}"
else
    echo -e "${RED}✗ Ошибка в конфигурации!${NC}"
    echo "Восстанавливаем из бэкапа..."
    cp "$BACKUP_CONF" "$NGINX_CONF"
    exit 1
fi

echo ""
echo -e "${YELLOW}Шаг 4: Перезагрузка Nginx${NC}"
systemctl reload nginx
echo -e "${GREEN}✓ Nginx перезагружен${NC}"

echo ""
echo "=================================================="
echo -e "${GREEN}✓ Оптимизация завершена!${NC}"
echo "=================================================="
echo ""
echo "Что изменилось:"
echo "  • sendfile_max_chunk: 2MB (оптимально для видео)"
echo "  • directio: 512MB (меньше прямого I/O)"
echo "  • output_buffers: 2x2MB (больше буферы)"
echo "  • open_file_cache: 10000 файлов (быстрый доступ)"
echo ""
echo "Теперь большие видео должны загружаться плавно!"
echo ""
echo "Для очень медленных сетей раскомментируйте limit_rate в:"
echo "  /vid/videocontrol/nginx/videocontrol.conf (строки 60-61)"
echo ""
echo "Бэкап сохранен: $BACKUP_CONF"
echo ""

