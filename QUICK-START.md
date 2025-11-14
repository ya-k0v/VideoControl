# 🚀 VideoControl - Быстрая установка

## ⚡ Установка одной командой

### Для Ubuntu/Debian (чистая ОС):

```bash
# Скачиваем и запускаем установщик
wget -O - https://raw.githubusercontent.com/ya-k0v/VideoControl/main/scripts/quick-install.sh | sudo bash
```

**Или клонируйте репозиторий:**

```bash
git clone https://github.com/ya-k0v/VideoControl.git
cd VideoControl
sudo bash scripts/quick-install.sh
```

---

## 📦 Что установится автоматически:

### **Системные зависимости:**
- ✅ Node.js 18+ (если не установлен)
- ✅ FFmpeg + FFprobe (обработка видео)
- ✅ LibreOffice (конвертация PDF/PPTX)
- ✅ ImageMagick (обработка изображений)
- ✅ SQLite3 (база данных)
- ✅ Nginx (веб-сервер)
- ✅ unzip, curl, wget, git

### **Node.js пакеты:**
- ✅ express, socket.io
- ✅ bcrypt, jsonwebtoken (аутентификация)
- ✅ better-sqlite3, multer
- ✅ pdf-lib, pdf2pic
- ✅ winston (логирование)
- ✅ И другие (см. package.json)

### **Настройка системы:**
- ✅ Создаёт директории: `/vid/videocontrol`
- ✅ Настраивает права доступа
- ✅ Генерирует JWT secret
- ✅ Инициализирует SQLite базу
- ✅ Создаёт дефолтного админа
- ✅ Оптимизирует сеть (TCP буферы 16MB)
- ✅ Настраивает Nginx reverse proxy
- ✅ Создаёт systemd service
- ✅ Автозапуск при загрузке

---

## 🎯 После установки:

### **Доступ к системе:**
```
🌐 Admin Panel:   http://YOUR_SERVER_IP/
🎤 Speaker Panel: http://YOUR_SERVER_IP/speaker.html
🎮 Player:        http://YOUR_SERVER_IP/player-videojs.html?device_id=DEVICE_ID
```

### **Дефолтные учетные данные:**
```
Username: admin
Password: admin123
```

**🚨 ОБЯЗАТЕЛЬНО смените пароль после первого входа!**

---

## 🔧 Управление сервисом:

```bash
# Проверить статус
sudo systemctl status videocontrol

# Перезапустить
sudo systemctl restart videocontrol

# Остановить
sudo systemctl stop videocontrol

# Запустить
sudo systemctl start videocontrol

# Логи (journalctl)
sudo journalctl -u videocontrol -f

# Логи (файлы)
tail -f /vid/videocontrol/logs/combined-*.log
tail -f /vid/videocontrol/logs/error-*.log

# Nginx логи
sudo tail -f /var/log/nginx/videocontrol_error.log
sudo tail -f /var/log/nginx/videocontrol_access.log
```

---

## 📊 Структура проекта:

```
/vid/videocontrol/
├── config/
│   ├── main.db                          # SQLite база (users, devices, files)
│   └── video-optimization.json          # Настройки оптимизации видео
├── public/
│   ├── content/                         # Контент устройств (до 5GB на файл)
│   ├── admin.html, speaker.html         # Интерфейсы
│   └── player-videojs.html              # Плеер
├── logs/
│   ├── combined-YYYY-MM-DD.log          # Все логи
│   └── error-YYYY-MM-DD.log             # Только ошибки
├── .converted/                          # Кэш конвертированных PDF/PPTX
├── temp/
│   └── nginx_upload/                    # Временные файлы загрузки
├── server.js                            # Главный файл сервера
└── .env                                 # JWT secret (автоген)
```

---

## 🔒 Безопасность:

### **Двухуровневая защита:**

1. **Nginx geo-блокировка:**
   - Доступ только из локальной сети (автоопределение)
   - Редактируй: `/etc/nginx/sites-available/videocontrol`

2. **JWT аутентификация:**
   - Access token: 12 часов
   - Refresh token: 30 дней
   - Все действия логируются в `audit_log` таблицу

### **Смена пароля:**

**Через API:**
```bash
curl -X POST http://YOUR_IP/api/auth/change-password \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "oldPassword": "admin123",
    "newPassword": "your_strong_password_123!"
  }'
```

**Через админ панель:**
1. Войти → Настройки → Сменить пароль

---

## ⚙️ Дополнительная настройка:

### **Видео оптимизация:**

Редактируй `config/video-optimization.json`:

```json
{
  "enabled": true,
  "autoOptimize": true,
  "deleteOriginal": true,
  "defaultProfile": "1080p",
  "thresholds": {
    "maxWidth": 1920,
    "maxHeight": 1080,
    "maxFps": 30,
    "maxBitrate": 6000000
  }
}
```

### **Nginx настройки:**

- **Файл:** `/etc/nginx/sites-available/videocontrol`
- **Максимальный размер файла:** 5GB (можно увеличить)
- **Таймауты:** 300-900 секунд
- **Sendfile:** включен (оптимизация для видео)

### **Сеть оптимизация:**

Уже настроено автоматически:
```
net.core.rmem_max = 16777216
net.core.wmem_max = 16777216
net.ipv4.tcp_rmem = 4096 87380 16777216
net.ipv4.tcp_wmem = 4096 65536 16777216
```

---

## 🐛 Решение проблем:

### **Сервер не запускается:**

```bash
# Проверить логи
sudo journalctl -u videocontrol -n 100

# Проверить Node.js
node --version  # Должно быть 18+

# Проверить порт 3000
sudo netstat -tulpn | grep 3000

# Проверить права
ls -la /vid/videocontrol/config/main.db
```

### **Nginx ошибка:**

```bash
# Тест конфигурации
sudo nginx -t

# Проверить порт 80
sudo netstat -tulpn | grep :80

# Логи
sudo tail -50 /var/log/nginx/videocontrol_error.log
```

### **LibreOffice не работает:**

```bash
# Проверить установку
libreoffice --version

# Права на cache директорию
ls -la ~/.cache

# Создать вручную
mkdir -p ~/.cache ~/.config
chmod 755 ~/.cache ~/.config
```

### **Загрузка файлов не работает:**

```bash
# Проверить права
ls -la /vid/videocontrol/public/content/
ls -la /vid/videocontrol/temp/nginx_upload/

# Дать права
sudo chown -R $USER:vcgroup /vid/videocontrol/
sudo chmod 755 /vid/videocontrol/temp/nginx_upload/
```

---

## 📱 Клиенты:

### **Android TV / Media Player:**

1. Скачай APK: `clients/android-mediaplayer/`
2. Установи на устройство
3. Настрой server URL и device ID
4. Готово!

### **MPV Player (Linux):**

```bash
cd clients/mpv
sudo bash quick-install.sh
```

### **Браузер (любой):**

Просто открой: `http://SERVER_IP/player-videojs.html?device_id=YOUR_ID`

---

## 🔄 Обновление:

```bash
cd /vid/videocontrol
sudo systemctl stop videocontrol

# Бэкап БД
cp config/main.db config/main.db.backup

# Обновление
git pull origin main
npm install

# Применить миграции (если есть)
# sqlite3 config/main.db < src/database/migrations/XXX.sql

sudo systemctl start videocontrol
```

---

## 📚 Документация:

- **README.md** - общее описание
- **plan/ROADMAP.md** - планы развития
- **plan/SECURITY_LEVELS.md** - безопасность
- **docs/HARDWARE_REQUIREMENTS.md** - требования к железу
- **docs/FOLDERS_FEATURE.md** - работа с папками
- **docs/ANDROID.md** - Android клиент

---

## 💬 Поддержка:

- **GitHub:** https://github.com/ya-k0v/VideoControl
- **Issues:** https://github.com/ya-k0v/VideoControl/issues

---

## ✅ Checklist после установки:

- [ ] Сервер запущен: `systemctl status videocontrol`
- [ ] Nginx работает: `systemctl status nginx`
- [ ] Админ панель открывается: `http://YOUR_IP/`
- [ ] Вход с `admin / admin123` работает
- [ ] **Пароль изменён на безопасный!** 🔒
- [ ] Созданы пользователи (если нужно)
- [ ] Добавлены устройства
- [ ] Загружен тестовый контент
- [ ] Speaker панель работает
- [ ] Player подключается

---

**Готово! 🎉 VideoControl установлен и готов к работе!**

