#!/bin/bash
# VideoControl - Quick Installation Script (One Command Setup)
# Полная установка системы на чистый Ubuntu/Debian сервер

set -e

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}============================================${NC}"
echo -e "${BLUE}  VideoControl v2.5.0 - Quick Install${NC}"
echo -e "${BLUE}============================================${NC}"
echo ""

# Проверка OS
if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS_NAME=$ID
else
    echo -e "${RED}❌ Cannot detect OS${NC}"
    exit 1
fi

if [ "$OS_NAME" != "ubuntu" ] && [ "$OS_NAME" != "debian" ]; then
    echo -e "${YELLOW}⚠️  This script is designed for Ubuntu/Debian${NC}"
    echo -e "${YELLOW}   For other OS, use manual installation${NC}"
    exit 1
fi

echo -e "${GREEN}✅ OS: $PRETTY_NAME${NC}"
echo ""

# Определяем установочную директорию
INSTALL_DIR="${1:-/vid/videocontrol}"
CURRENT_USER="${SUDO_USER:-$(whoami)}"

echo "Installation settings:"
echo "  Directory: $INSTALL_DIR"
echo "  User: $CURRENT_USER"
echo ""
read -p "Continue? (y/n): " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 0
fi

# ==========================================
# PHASE 1: SYSTEM DEPENDENCIES
# ==========================================
echo ""
echo -e "${BLUE}[1/7] Installing system dependencies...${NC}"

# Обновляем список пакетов
apt-get update -qq

# Устанавливаем базовые инструменты
apt-get install -y curl wget git build-essential

# Node.js (если еще не установлен)
if ! command -v node &> /dev/null; then
    echo "  Installing Node.js 18..."
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
    apt-get install -y nodejs
    echo -e "  ${GREEN}✅ Node.js $(node --version)${NC}"
else
    echo -e "  ${GREEN}✅ Node.js already installed: $(node --version)${NC}"
fi

# FFmpeg, LibreOffice, ImageMagick, unzip
echo "  Installing media processing tools..."
apt-get install -y ffmpeg libreoffice imagemagick unzip sqlite3

echo -e "${GREEN}✅ System dependencies installed${NC}"

# ==========================================
# PHASE 2: DOWNLOAD/CLONE PROJECT
# ==========================================
echo ""
echo -e "${BLUE}[2/7] Setting up project...${NC}"

if [ -d "$INSTALL_DIR" ]; then
    echo -e "${YELLOW}⚠️  Directory $INSTALL_DIR already exists${NC}"
    read -p "Remove and reinstall? (y/n): " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        rm -rf "$INSTALL_DIR"
    else
        echo "Installation cancelled."
        exit 0
    fi
fi

mkdir -p "$INSTALL_DIR"
cd "$INSTALL_DIR"

# Клонируем из GitHub
echo "  Cloning from GitHub..."
git clone https://github.com/ya-k0v/VideoControl.git .

echo -e "${GREEN}✅ Project downloaded${NC}"

# ==========================================
# PHASE 3: NPM DEPENDENCIES
# ==========================================
echo ""
echo -e "${BLUE}[3/7] Installing Node.js packages...${NC}"

npm install

echo -e "${GREEN}✅ NPM packages installed${NC}"

# ==========================================
# PHASE 4: PROJECT STRUCTURE
# ==========================================
echo ""
echo -e "${BLUE}[4/7] Creating project structure...${NC}"

mkdir -p public/content
mkdir -p config
mkdir -p .converted
mkdir -p temp/nginx_upload

# Устанавливаем права
chown -R $CURRENT_USER:$CURRENT_USER "$INSTALL_DIR"
chmod 755 temp/nginx_upload

# Создаем пустую БД (будет инициализирована при первом запуске)
echo "  Initializing SQLite database..."
touch config/main.db
chown $CURRENT_USER:$CURRENT_USER config/main.db

# Создаем конфигурацию видео-оптимизации если нет
if [ ! -f config/video-optimization.json ]; then
    cp config/video-optimization.json.example config/video-optimization.json 2>/dev/null || \
    cat > config/video-optimization.json << 'EOF'
{
  "enabled": true,
  "autoOptimize": true,
  "deleteOriginal": true,
  "defaultProfile": "1080p"
}
EOF
fi

echo -e "${GREEN}✅ Project structure created${NC}"

# ==========================================
# PHASE 5: NETWORK OPTIMIZATION
# ==========================================
echo ""
echo -e "${BLUE}[5/7] Optimizing network for large file uploads...${NC}"

if [ -f scripts/optimize-network.sh ]; then
    bash scripts/optimize-network.sh
    echo -e "${GREEN}✅ TCP buffers optimized (16MB for fast uploads)${NC}"
fi

# ==========================================
# PHASE 6: NGINX INSTALLATION
# ==========================================
echo ""
echo -e "${BLUE}[6/7] Installing and configuring Nginx...${NC}"

# Устанавливаем Nginx
if ! command -v nginx &> /dev/null; then
    apt-get install -y nginx
fi

# Копируем конфигурацию
cp nginx/videocontrol.conf /etc/nginx/sites-available/videocontrol

# Удаляем старые конфиги если есть
rm -f /etc/nginx/sites-enabled/default
rm -f /etc/nginx/sites-enabled/videocontrol.conf 2>/dev/null

# Создаем симлинк
ln -sf /etc/nginx/sites-available/videocontrol /etc/nginx/sites-enabled/videocontrol

# Проверяем конфигурацию
if nginx -t; then
    systemctl enable nginx
    systemctl restart nginx
    echo -e "${GREEN}✅ Nginx configured and running${NC}"
else
    echo -e "${RED}❌ Nginx configuration error${NC}"
    exit 1
fi

# ==========================================
# PHASE 7: SYSTEMD SERVICE
# ==========================================
echo ""
echo -e "${BLUE}[7/7] Creating systemd service...${NC}"

cat > /etc/systemd/system/videocontrol.service << EOF
[Unit]
Description=VCServer
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$CURRENT_USER
WorkingDirectory=$INSTALL_DIR
ExecStart=/usr/bin/node $INSTALL_DIR/server.js
Restart=on-failure
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable videocontrol
systemctl start videocontrol

# Проверяем запуск
sleep 3
if systemctl is-active --quiet videocontrol; then
    echo -e "${GREEN}✅ VideoControl service running${NC}"
else
    echo -e "${RED}❌ Service failed to start. Check logs:${NC}"
    echo "   journalctl -u videocontrol -n 50"
    exit 1
fi

# ==========================================
# INSTALLATION COMPLETE
# ==========================================
echo ""
echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}  ✅ Installation Complete!${NC}"
echo -e "${GREEN}============================================${NC}"
echo ""
echo "🎉 VideoControl v2.5.0 successfully installed!"
echo ""
echo "📂 Installation directory: $INSTALL_DIR"
echo "📊 Database: config/main.db (SQLite)"
echo "🌐 Server: http://$(hostname -I | awk '{print $1}')"
echo ""
echo "🚀 Access URLs:"
echo "  📱 Admin:   http://$(hostname -I | awk '{print $1}')/admin.html"
echo "  🎤 Speaker: http://$(hostname -I | awk '{print $1}')/speaker.html"
echo ""
echo "📋 Next steps:"
echo "  1. Open Admin panel: http://$(hostname -I | awk '{print $1}')/admin.html"
echo "  2. Add devices in admin panel"
echo "  3. Upload content to devices"
echo "  4. Download Android app: $INSTALL_DIR/VCMplayer-v2.5.0.apk"
echo ""
echo "🔧 Useful commands:"
echo "  Status:  sudo systemctl status videocontrol"
echo "  Restart: sudo systemctl restart videocontrol"
echo "  Logs:    sudo journalctl -u videocontrol -f"
echo "  Stop:    sudo systemctl stop videocontrol"
echo ""
echo "📚 Documentation:"
echo "  README:   $INSTALL_DIR/README.md"
echo "  Hardware: $INSTALL_DIR/docs/HARDWARE_REQUIREMENTS.md"
echo "  Android:  $INSTALL_DIR/docs/ANDROID.md"
echo ""

