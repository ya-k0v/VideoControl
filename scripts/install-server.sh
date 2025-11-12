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
    sudo apt-get install -y ffmpeg libreoffice imagemagick unzip sqlite3
elif [ "$OS" = "centos" ] || [ "$OS" = "rhel" ]; then
    sudo yum install -y ffmpeg libreoffice ImageMagick unzip sqlite
fi

# Install npm packages
echo ""
echo "Installing npm packages..."
npm install

# Create .env file with JWT secret
echo ""
echo "Setting up authentication..."
if [ ! -f .env ]; then
    JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(64).toString('hex'))")
    cat > .env << EOF
NODE_ENV=production
PORT=3000
HOST=127.0.0.1

# JWT Authentication (12h access, 30d refresh)
JWT_SECRET=$JWT_SECRET
JWT_ACCESS_EXPIRES_IN=12h
JWT_REFRESH_EXPIRES_IN=30d

# Logging level
LOG_LEVEL=info
EOF
    echo "✅ Created .env with secure JWT secret"
    echo "   Access Token: 12 hours"
    echo "   Refresh Token: 30 days"
fi

# Create necessary directories
echo ""
echo "Creating directories..."
mkdir -p public/content
mkdir -p config
mkdir -p .converted
mkdir -p logs

# Initialize database
echo ""
echo "Initializing database..."
if [ ! -f config/main.db ]; then
    sqlite3 config/main.db < src/database/init.sql
    echo "✅ Database initialized with default schema"
    echo "   Default admin user: admin / admin123"
    echo "   ⚠️  CHANGE PASSWORD AFTER FIRST LOGIN!"
else
    echo "ℹ️  Database already exists, skipping initialization"
fi

# Create default config files if not exist (deprecated - kept for backward compatibility)
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
echo "✅ Installation Complete!"
echo "==================================="
echo ""
echo "🔐 Default Admin Credentials:"
echo "  Username: admin"
echo "  Password: admin123"
echo "  🚨 ОБЯЗАТЕЛЬНО смените после первого входа!"
echo ""
echo "📁 Project structure created:"
echo "  ✅ config/ - configuration files + main.db"
echo "  ✅ public/content/ - device content (up to 5GB per file)"
echo "  ✅ .converted/ - converted PDF/PPTX cache"
echo "  ✅ logs/ - Winston structured logs (will be created)"
echo ""
echo "🚀 Start server:"
echo "  Development: npm start"
echo "  Production:  sudo systemctl start videocontrol"
echo ""
echo "🌐 Access URLs:"
echo "  Login:        http://localhost/"
echo "  Admin Panel:  http://localhost/ (admin/admin123)"
echo "  Speaker Panel: http://localhost/speaker.html"
echo "  Player:       http://localhost/player-videojs.html?device_id=YOUR_ID"
echo ""
echo "🔒 Security Features:"
echo "  ✅ JWT Authentication (12h access, 30d refresh)"
echo "  ✅ Rate limiting (disabled for local network)"
echo "  ✅ Path traversal protection"
echo "  ✅ Audit logging to database"
echo ""
echo "📊 Monitoring:"
echo "  Status:  sudo systemctl status videocontrol"
echo "  Logs:    tail -f logs/combined-*.log"
echo "  Errors:  tail -f logs/error-*.log"
echo "  Audit:   sqlite3 config/main.db 'SELECT * FROM audit_log ORDER BY created_at DESC LIMIT 10;'"
echo "  Journal: sudo journalctl -u videocontrol -f"
echo ""
echo "📖 Documentation:"
echo "  📘 Installation:  docs/INSTALL.md"
echo "  🔐 Security:      plan/SECURITY_LEVELS.md"
echo "  📝 Roadmap:       plan/ROADMAP.md"
echo "  📁 Folders:       docs/FOLDERS_FEATURE.md"
echo "  📱 Android:       docs/ANDROID.md"
echo ""

