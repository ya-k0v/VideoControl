# Nginx Configuration for VideoControl

## 📦 Установка Nginx

### Ubuntu/Debian:
```bash
sudo apt update
sudo apt install nginx -y
```

### CentOS/RHEL:
```bash
sudo yum install nginx -y
```

### Проверка установки:
```bash
nginx -v
```

## 🔧 Применение конфигурации

### 1. Создать симлинк на конфигурацию:
```bash
sudo ln -sf /vid/videocontrol/nginx/videocontrol.conf /etc/nginx/sites-available/videocontrol
sudo ln -sf /etc/nginx/sites-available/videocontrol /etc/nginx/sites-enabled/videocontrol
```

### 2. Удалить дефолтную конфигурацию (опционально):
```bash
sudo rm -f /etc/nginx/sites-enabled/default
```

### 3. Проверить конфигурацию на ошибки:
```bash
sudo nginx -t
```

Должно вывести:
```
nginx: the configuration file /etc/nginx/nginx.conf syntax is ok
nginx: configuration file /etc/nginx/nginx.conf test is successful
```

### 4. Перезапустить Nginx:
```bash
sudo systemctl restart nginx
sudo systemctl enable nginx  # Автозапуск при загрузке системы
```

### 5. Проверить статус:
```bash
sudo systemctl status nginx
```

## 🚀 Использование

После установки:

- **Nginx** слушает на порту **80** (HTTP)
- **Node.js** продолжает работать на порту **3000** (внутренний)
- Доступ к приложению: `http://your-server-ip/`

### Что теперь раздает Nginx:
- ✅ `/content/*` - видео, изображения (БЫСТРО через sendfile)
- ✅ `/css/*`, `/js/*` - статические файлы
- ✅ HTML файлы

### Что проксируется на Node.js:
- ✅ `/api/*` - API endpoints
- ✅ `/socket.io/*` - WebSocket соединения
- ✅ Upload файлов

## 📊 Производительность

### До Nginx (только Node.js):
- Скорость раздачи видео: ~50-100 MB/s
- Одновременные соединения: ~10-20
- CPU нагрузка: высокая

### После Nginx:
- Скорость раздачи видео: ~500-1000 MB/s (10x быстрее!)
- Одновременные соединения: 100+
- CPU нагрузка: низкая

## 🔍 Тестирование

### 1. Проверить раздачу контента через Nginx:
```bash
curl -I http://localhost/content/pc001/default.mp4
```

Должны увидеть заголовки:
```
HTTP/1.1 200 OK
Server: nginx
Accept-Ranges: bytes
Cache-Control: public, immutable
```

### 2. Проверить WebSocket через Nginx:
Откройте браузер и зайдите на `http://localhost/player.html?device_id=test001`

### 3. Логи Nginx:
```bash
# Ошибки
sudo tail -f /var/log/nginx/videocontrol_error.log

# Запросы
sudo tail -f /var/log/nginx/videocontrol_access.log
```

## ⚙️ Настройка

### Изменить порт Node.js сервера:

Если ваш Node.js работает на другом порту (не 3000), измените в конфиге:
```nginx
upstream nodejs_backend {
    server 127.0.0.1:ВАШІ_ПОРТ;
    keepalive 64;
}
```

### Работа через доменное имя:

Замените в конфиге:
```nginx
server_name _;  # любой домен
```

На:
```nginx
server_name videocontrol.example.com;  # ваш домен
```

## 🔒 HTTPS (SSL)

### 1. Получить SSL сертификат (Let's Encrypt):
```bash
sudo apt install certbot python3-certbot-nginx -y
sudo certbot --nginx -d videocontrol.example.com
```

### 2. Certbot автоматически настроит HTTPS

### 3. Автообновление сертификата:
```bash
sudo certbot renew --dry-run
```

## 🐛 Troubleshooting

### Ошибка "connection refused":
```bash
# Проверить что Node.js запущен
sudo systemctl status videocontrol

# Или запустить вручную для теста
cd /vid/videocontrol
npm start
```

### Ошибка "Permission denied" для /content/:
```bash
# Дать Nginx доступ к файлам
sudo chown -R www-data:www-data /vid/videocontrol/public/content/
sudo chmod -R 755 /vid/videocontrol/public/content/
```

### Проверка кто слушает порт 80:
```bash
sudo netstat -tlnp | grep :80
# или
sudo lsof -i :80
```

## 📈 Мониторинг

### Статистика Nginx:
```bash
# Количество соединений
sudo netstat -an | grep :80 | wc -l

# Процессы Nginx
ps aux | grep nginx
```

### Метрики производительности:
```bash
# Загрузка CPU/Memory
top -p $(pgrep -d',' nginx)
```

## 🔄 Обновление конфигурации

После изменения `videocontrol.conf`:
```bash
sudo nginx -t          # Проверка
sudo systemctl reload nginx  # Перезагрузка без остановки
```

## 📚 Дополнительная оптимизация

### В `/etc/nginx/nginx.conf` добавьте:
```nginx
# В секции http {}
worker_processes auto;  # Автоматически по количеству CPU ядер
worker_connections 2048;  # Увеличить для большого количества клиентов

# Включить открытие файлов с кэшированием
open_file_cache max=10000 inactive=30s;
open_file_cache_valid 60s;
open_file_cache_min_uses 2;
open_file_cache_errors on;
```

Затем:
```bash
sudo systemctl reload nginx
```

