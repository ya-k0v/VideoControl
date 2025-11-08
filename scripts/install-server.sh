#!/bin/bash
# Video Control - Server Installation Script
# Установка сервера на чистую систему (Ubuntu/Debian/CentOS/RHEL)

set -e

echo "==================================="
echo "Video Control Server - Installation"
echo "==================================="
echo ""

# Detect OS
if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS=$ID
else
    echo "Cannot detect OS"
    exit 1
fi

echo "Detected OS: $OS"
echo ""

# Install Node.js if not installed
if ! command -v node &> /dev/null; then
    echo "Installing Node.js..."
    if [ "$OS" = "ubuntu" ] || [ "$OS" = "debian" ]; then
        curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
        sudo apt-get install -y nodejs
    elif [ "$OS" = "centos" ] || [ "$OS" = "rhel" ]; then
        curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
        sudo yum install -y nodejs
    fi
else
    echo "Node.js already installed: $(node --version)"
fi

# Install system dependencies
echo ""
echo "Installing system dependencies..."
if [ "$OS" = "ubuntu" ] || [ "$OS" = "debian" ]; then
    sudo apt-get update
    sudo apt-get install -y libreoffice graphicsmagick
elif [ "$OS" = "centos" ] || [ "$OS" = "rhel" ]; then
    sudo yum install -y libreoffice GraphicsMagick
fi

# Install npm packages
echo ""
echo "Installing npm packages..."
npm install

# Create necessary directories
echo ""
echo "Creating directories..."
mkdir -p public/content
mkdir -p config
mkdir -p archive
mkdir -p docs/reports/{backend,frontend,android,fixes}
mkdir -p docs/status

# Create default config files if not exist
if [ ! -f config/devices.json ]; then
    echo '{}' > config/devices.json
    echo "Created config/devices.json"
fi

if [ ! -f config/file-names-map.json ]; then
    echo '{}' > config/file-names-map.json
    echo "Created config/file-names-map.json"
fi

if [ ! -f config/video-optimization.json ]; then
    echo '{"enabled": true, "targetResolution": "1080p"}' > config/video-optimization.json
    echo "Created config/video-optimization.json"
fi

# Setup systemd service
echo ""
read -p "Install as systemd service? (y/n): " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    CURRENT_USER=$(whoami)
    CURRENT_DIR=$(pwd)
    
    cat > /tmp/videocontrol.service << EOF
[Unit]
Description=Video Control Server
After=network.target

[Service]
Type=simple
User=$CURRENT_USER
WorkingDirectory=$CURRENT_DIR
ExecStart=/usr/bin/node $CURRENT_DIR/server.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF
    
    sudo mv /tmp/videocontrol.service /etc/systemd/system/
    sudo systemctl daemon-reload
    sudo systemctl enable videocontrol
    
    echo ""
    echo "Systemd service installed!"
    echo "Start: sudo systemctl start videocontrol"
    echo "Status: sudo systemctl status videocontrol"
    echo "Logs: sudo journalctl -u videocontrol -f"
fi

# Setup Nginx
echo ""
read -p "Install and configure Nginx? (y/n): " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    if [ -f nginx/install-nginx.sh ]; then
        cd nginx
        sudo bash install-nginx.sh
        cd ..
    fi
fi

echo ""
echo "==================================="
echo "Installation Complete!"
echo "==================================="
echo ""
echo "📁 Project structure created:"
echo "  ✅ config/ - configuration files"
echo "  ✅ public/content/ - device content"
echo "  ✅ docs/reports/ - refactoring reports"
echo "  ✅ archive/ - old files"
echo ""
echo "🚀 Start server:"
echo "  Development: npm start"
echo "  Production: sudo systemctl start videocontrol"
echo ""
echo "🌐 Access URLs:"
echo "  Admin Panel:  http://localhost/admin.html"
echo "  Speaker Panel: http://localhost/speaker.html"
echo "  Player: http://localhost/player-videojs.html?device_id=YOUR_ID"
echo ""
echo "📊 Monitoring:"
echo "  Status: sudo systemctl status videocontrol"
echo "  Logs: sudo journalctl -u videocontrol -f"
echo ""
echo "📖 Documentation:"
echo "  See docs/INSTALL.md for detailed instructions"
echo ""

