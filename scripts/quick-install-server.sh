#!/bin/bash
# Video Control Server - Quick Install from GitHub
# Usage: 
#   wget -qO- https://raw.githubusercontent.com/ya-k0v/VideoControl/main/scripts/quick-install-server.sh | bash
#   curl -fsSL https://raw.githubusercontent.com/ya-k0v/VideoControl/main/scripts/quick-install-server.sh | bash

set -e

REPO_URL="https://github.com/ya-k0v/VideoControl.git"
INSTALL_DIR="/opt/videocontrol"

echo "=========================================="
echo "Video Control Server - Quick Install"
echo "=========================================="
echo ""

# Check if running as root
if [ "$EUID" -eq 0 ]; then
    MODE="production"
    echo "Mode: Production (systemd + /opt/videocontrol)"
else
    MODE="development"
    INSTALL_DIR="$HOME/videocontrol"
    echo "Mode: Development (~/ videocontrol)"
fi

echo ""

# Detect OS
if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS=$ID
else
    echo "Cannot detect OS"
    exit 1
fi

echo "OS: $OS"
echo "Install to: $INSTALL_DIR"
echo ""

# Install git if not present
if ! command -v git &> /dev/null; then
    echo "Installing git..."
    if [ "$MODE" = "production" ]; then
        if [ "$OS" = "ubuntu" ] || [ "$OS" = "debian" ]; then
            apt-get update -qq
            apt-get install -y git
        elif [ "$OS" = "centos" ] || [ "$OS" = "rhel" ]; then
            yum install -y git
        fi
    else
        echo "Please install git first"
        exit 1
    fi
fi

# Clone repository
echo "Cloning repository..."
if [ -d "$INSTALL_DIR" ]; then
    echo "Directory $INSTALL_DIR already exists"
    cd "$INSTALL_DIR"
    git pull || true
else
    git clone "$REPO_URL" "$INSTALL_DIR"
    cd "$INSTALL_DIR"
fi

echo ""

# Run local install script
if [ "$MODE" = "production" ]; then
    echo "Running production install..."
    bash scripts/install-server.sh
    
    echo ""
    echo "=========================================="
    echo "Installation Complete!"
    echo "=========================================="
    echo ""
    echo "Start server:"
    echo "  sudo systemctl start videocontrol"
    echo "  sudo systemctl enable videocontrol"
    echo ""
    echo "Access:"
    echo "  http://$(hostname -I | awk '{print $1}')/admin.html"
    echo ""
else
    echo "Running development install..."
    bash scripts/install-server.sh
    
    echo ""
    echo "=========================================="
    echo "Installation Complete!"
    echo "=========================================="
    echo ""
    echo "Start server:"
    echo "  cd $INSTALL_DIR"
    echo "  npm start"
    echo ""
    echo "Access:"
    echo "  http://localhost/admin.html"
    echo ""
fi

