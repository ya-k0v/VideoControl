#!/bin/bash
# Video Control - VLC Client Installation Script
# Usage:
#   bash install-vlc-client.sh [--server URL] [--device ID] [--skip-vlc] [--no-systemd]

set -e

SERVER_URL=""
DEVICE_ID=""
SKIP_VLC=false
NO_SYSTEMD=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --server) SERVER_URL="$2"; shift 2 ;;
        --device) DEVICE_ID="$2"; shift 2 ;;
        --skip-vlc) SKIP_VLC=true; shift ;;
        --no-systemd) NO_SYSTEMD=true; shift ;;
        *) shift ;;
    esac
done

echo "======================================"
echo "VLC Client - Quick Install"
echo "======================================"

if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS=$ID
elif [[ "$OSTYPE" == "darwin"* ]]; then
    OS="macos"
else
    OS="unknown"
fi

if [ "$SKIP_VLC" = false ] && ! command -v vlc &> /dev/null; then
    echo "Installing VLC..."
    if [ "$OS" = "ubuntu" ] || [ "$OS" = "debian" ]; then
        sudo apt-get update -qq
        sudo apt-get install -y -qq vlc python3-pip
    elif [ "$OS" = "centos" ] || [ "$OS" = "rhel" ]; then
        sudo yum install -y vlc python3-pip
    elif [ "$OS" = "macos" ]; then
        brew install --cask vlc
        brew install python3
    fi
fi

echo "Installing Python packages..."
cd clients/vlc
pip3 install -q -r requirements.txt --user --break-system-packages 2>/dev/null || \
pip3 install -q -r requirements.txt --user

if [ "$OS" != "macos" ] && [ "$OS" != "unknown" ] && [ "$NO_SYSTEMD" = false ]; then
    if [ -z "$SERVER_URL" ]; then
        read -p "Server URL (e.g. http://192.168.1.10): " SERVER_URL
    fi
    if [ -z "$DEVICE_ID" ]; then
        read -p "Device ID (e.g. vlc-001): " DEVICE_ID
    fi
    
    if [ -n "$SERVER_URL" ] && [ -n "$DEVICE_ID" ]; then
        CURRENT_USER=$(whoami)
        CURRENT_DIR=$(pwd)
        
        sudo tee /etc/systemd/system/videocontrol-vlc@.service > /dev/null << EOF
[Unit]
Description=Video Control VLC Client (%i)
After=network.target

[Service]
Type=simple
User=$CURRENT_USER
WorkingDirectory=$CURRENT_DIR
ExecStart=/usr/bin/python3 $CURRENT_DIR/vlc_client.py --server $SERVER_URL --device %i
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF
        
        sudo systemctl daemon-reload
        sudo systemctl enable videocontrol-vlc@$DEVICE_ID
        sudo systemctl start videocontrol-vlc@$DEVICE_ID
        echo "✓ Systemd service started"
    fi
fi

echo ""
echo "======================================"
echo "✓ Installation Complete!"
echo "======================================"
echo ""
echo "Run: python3 vlc_client.py --server http://SERVER --device DEVICE_ID"
echo ""
