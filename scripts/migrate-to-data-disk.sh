#!/bin/bash
# VideoControl - Migration to External Data Disk
# Миграция данных на отдельный диск для оптимизации хранения

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}VideoControl - Data Disk Migration${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Параметры
DATA_DISK="${1}"
MOUNT_POINT="/mnt/videocontrol-data"
PROJECT_ROOT="/vid/videocontrol"

# Проверка запуска с правами root
if [ "$EUID" -ne 0 ]; then 
    echo -e "${RED}❌ Please run as root (sudo)${NC}"
    exit 1
fi

# Проверка параметра диска
if [ -z "$DATA_DISK" ]; then
    echo -e "${YELLOW}Usage: $0 <disk_device>${NC}"
    echo ""
    echo "Example:"
    echo "  $0 /dev/sdb1"
    echo ""
    echo "Available disks:"
    lsblk -o NAME,SIZE,FSTYPE,MOUNTPOINT
    exit 1
fi

# Проверка существования диска
if [ ! -b "$DATA_DISK" ]; then
    echo -e "${RED}❌ Disk $DATA_DISK not found${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Disk found: $DATA_DISK${NC}"
lsblk "$DATA_DISK"
echo ""

# Предупреждение
echo -e "${YELLOW}⚠️  WARNING: This will:${NC}"
echo "   1. Stop videocontrol service"
echo "   2. Format disk $DATA_DISK (ALL DATA WILL BE LOST)"
echo "   3. Create mount point $MOUNT_POINT"
echo "   4. Move data from $PROJECT_ROOT/public/content"
echo "   5. Update configurations"
echo ""
read -p "Continue? (yes/no): " -r
if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
    echo "Aborted."
    exit 1
fi

# Остановка сервиса
echo ""
echo -e "${BLUE}[1/8]${NC} Stopping videocontrol service..."
systemctl stop videocontrol || echo "Service not running"

# Форматирование диска
echo -e "${BLUE}[2/8]${NC} Formatting disk $DATA_DISK as ext4..."
mkfs.ext4 -F "$DATA_DISK"

# Создание точки монтирования
echo -e "${BLUE}[3/8]${NC} Creating mount point $MOUNT_POINT..."
mkdir -p "$MOUNT_POINT"

# Монтирование диска
echo -e "${BLUE}[4/8]${NC} Mounting disk..."
mount "$DATA_DISK" "$MOUNT_POINT"

# Создание структуры папок
echo -e "${BLUE}[5/8]${NC} Creating directory structure..."
mkdir -p "$MOUNT_POINT/content"
mkdir -p "$MOUNT_POINT/converted"
mkdir -p "$MOUNT_POINT/temp"
mkdir -p "$MOUNT_POINT/backups"

# Копирование данных
echo -e "${BLUE}[6/8]${NC} Migrating data..."

if [ -d "$PROJECT_ROOT/public/content" ]; then
    echo "  - Copying content/ ..."
    rsync -av --progress "$PROJECT_ROOT/public/content/" "$MOUNT_POINT/content/"
    CONTENT_SIZE=$(du -sh "$MOUNT_POINT/content" | cut -f1)
    echo -e "  ${GREEN}✅ Content migrated: $CONTENT_SIZE${NC}"
fi

if [ -d "$PROJECT_ROOT/.converted" ]; then
    echo "  - Copying converted cache..."
    rsync -av --progress "$PROJECT_ROOT/.converted/" "$MOUNT_POINT/converted/"
    CONVERTED_SIZE=$(du -sh "$MOUNT_POINT/converted" | cut -f1)
    echo -e "  ${GREEN}✅ Converted cache migrated: $CONVERTED_SIZE${NC}"
fi

# Установка владельца
echo -e "${BLUE}[7/8]${NC} Setting permissions..."
chown -R $(stat -c '%U:%G' "$PROJECT_ROOT") "$MOUNT_POINT"
chmod -R 755 "$MOUNT_POINT"

# Настройка автомонтирования
echo -e "${BLUE}[8/8]${NC} Configuring auto-mount in /etc/fstab..."
UUID=$(blkid -s UUID -o value "$DATA_DISK")
FSTAB_ENTRY="UUID=$UUID $MOUNT_POINT ext4 defaults,nofail 0 2"

if ! grep -q "$MOUNT_POINT" /etc/fstab; then
    echo "$FSTAB_ENTRY" >> /etc/fstab
    echo -e "  ${GREEN}✅ Added to /etc/fstab${NC}"
else
    echo -e "  ${YELLOW}⚠️  Entry already exists in /etc/fstab${NC}"
fi

# Обновление systemd service
echo ""
echo -e "${BLUE}Updating systemd service...${NC}"
SERVICE_FILE="/etc/systemd/system/videocontrol.service"

if [ -f "$SERVICE_FILE" ]; then
    if ! grep -q "Environment=DATA_ROOT" "$SERVICE_FILE"; then
        sed -i "/\[Service\]/a Environment=DATA_ROOT=$MOUNT_POINT" "$SERVICE_FILE"
        systemctl daemon-reload
        echo -e "${GREEN}✅ Service updated with DATA_ROOT=$MOUNT_POINT${NC}"
    else
        echo -e "${YELLOW}⚠️  DATA_ROOT already set in service${NC}"
    fi
fi

# Обновление nginx конфигурации
echo ""
echo -e "${BLUE}Updating nginx configuration...${NC}"
NGINX_CONF="$PROJECT_ROOT/nginx/videocontrol.conf"

if [ -f "$NGINX_CONF" ]; then
    echo -e "${YELLOW}ℹ️  Manual step required:${NC}"
    echo "   Edit $NGINX_CONF"
    echo "   Change: alias /vid/videocontrol/public/content/;"
    echo "   To:     alias $MOUNT_POINT/content/;"
    echo ""
    read -p "Open nginx config now? (y/n): " -r
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        ${EDITOR:-nano} "$NGINX_CONF"
    fi
fi

# Резюме
echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}✅ Migration completed successfully!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "Summary:"
echo "  • Data disk: $DATA_DISK"
echo "  • Mount point: $MOUNT_POINT"
echo "  • Content: $CONTENT_SIZE"
echo "  • Converted: ${CONVERTED_SIZE:-0}"
echo ""
echo "Next steps:"
echo "  1. Update nginx config: $NGINX_CONF"
echo "  2. Reload nginx: sudo nginx -s reload"
echo "  3. Start service: sudo systemctl start videocontrol"
echo ""
echo "Old data locations (safe to remove after verification):"
echo "  • $PROJECT_ROOT/public/content/"
echo "  • $PROJECT_ROOT/.converted/"
echo ""
echo -e "${YELLOW}⚠️  Verify everything works before removing old data!${NC}"

