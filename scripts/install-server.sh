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

# Create content directory
mkdir -p public/content

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
echo "Start server:"
echo "  Development: npm start"
echo "  Production: sudo systemctl start videocontrol"
echo ""
echo "Access URLs:"
echo "  Admin: http://localhost/admin.html"
echo "  Player: http://localhost/player.html?device_id=YOUR_ID"
echo "  Speaker: http://localhost/speaker.html"
echo ""

