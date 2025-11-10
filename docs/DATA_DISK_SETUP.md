# Настройка отдельного диска для данных VideoControl

> Руководство по оптимизации хранения медиа-файлов на отдельном диске

---

## 🎯 Зачем нужен отдельный диск?

**Преимущества:**
- ✅ **OS на быстром SSD** → высокая производительность сервера
- ✅ **Медиа на большом HDD** → экономия, много места
- ✅ **Легкое расширение** → просто заменить data диск
- ✅ **Простое резервирование** → бэкап только данных
- ✅ **Лучшая производительность** → параллельный I/O на разных дисках

**Рекомендуемая конфигурация:**
```
/dev/sda (40-80 GB SSD):
  ├── / (Linux OS)
  ├── /vid/videocontrol (код приложения)
  └── swap

/dev/sdb (500GB-2TB HDD/SSD):
  └── /mnt/videocontrol-data
      ├── content/     (медиа файлы устройств)
      ├── converted/   (кэш PDF/PPTX)
      ├── temp/        (временные файлы)
      └── backups/     (резервные копии)
```

---

## 📦 Быстрая миграция (Автоматический скрипт)

### Шаг 1: Подключить новый диск

```bash
# Проверить доступные диски
lsblk

# Пример вывода:
# NAME   SIZE  TYPE MOUNTPOINT
# sda    50G   disk /
# sdb    500G  disk           ← ваш новый диск
```

### Шаг 2: Запустить скрипт миграции

```bash
cd /vid/videocontrol
sudo ./scripts/migrate-to-data-disk.sh /dev/sdb1
```

**Скрипт автоматически:**
1. ✅ Форматирует диск в ext4
2. ✅ Создает структуру папок
3. ✅ Копирует данные из `public/content` и `.converted`
4. ✅ Настраивает автомонтирование в `/etc/fstab`
5. ✅ Обновляет systemd service с `DATA_ROOT`
6. ✅ Устанавливает права доступа

### Шаг 3: Обновить nginx конфигурацию

Отредактируйте `/vid/videocontrol/nginx/videocontrol.conf`:

```nginx
location /content/ {
    # Было:
    # alias /vid/videocontrol/public/content/;
    
    # Стало:
    alias /mnt/videocontrol-data/content/;
    
    # остальное без изменений
}
```

Перезагрузите nginx:
```bash
sudo nginx -t
sudo nginx -s reload
```

### Шаг 4: Запустить сервис

```bash
sudo systemctl start videocontrol
sudo systemctl status videocontrol
```

Проверьте логи:
```bash
journalctl -u videocontrol -f
```

Вы должны увидеть:
```
[Config] ✅ Using external data disk: /mnt/videocontrol-data
```

### Шаг 5: Удалить старые данные (опционально)

**⚠️ ТОЛЬКО после проверки что все работает!**

```bash
# Сделайте бэкап на всякий случай
sudo tar -czf ~/videocontrol-old-data-backup.tar.gz \
  /vid/videocontrol/public/content \
  /vid/videocontrol/.converted

# Удалите старые данные
sudo rm -rf /vid/videocontrol/public/content/*
sudo rm -rf /vid/videocontrol/.converted/*
```

---

## 🔧 Ручная настройка (Детальное руководство)

### 1. Подготовка диска

```bash
# Создать раздел (если нужно)
sudo fdisk /dev/sdb
# n → p → 1 → Enter → Enter → w

# Форматировать в ext4
sudo mkfs.ext4 /dev/sdb1

# Получить UUID диска
sudo blkid /dev/sdb1
# UUID="abc123-..."
```

### 2. Создать точку монтирования

```bash
sudo mkdir -p /mnt/videocontrol-data
sudo mount /dev/sdb1 /mnt/videocontrol-data
```

### 3. Создать структуру папок

```bash
sudo mkdir -p /mnt/videocontrol-data/content
sudo mkdir -p /mnt/videocontrol-data/converted
sudo mkdir -p /mnt/videocontrol-data/temp
sudo mkdir -p /mnt/videocontrol-data/backups

# Установить владельца
sudo chown -R $(whoami):$(whoami) /mnt/videocontrol-data
```

### 4. Скопировать данные

```bash
# Копировать контент
rsync -av --progress \
  /vid/videocontrol/public/content/ \
  /mnt/videocontrol-data/content/

# Копировать кэш конвертации
rsync -av --progress \
  /vid/videocontrol/.converted/ \
  /mnt/videocontrol-data/converted/
```

### 5. Настроить автомонтирование

Добавить в `/etc/fstab`:
```bash
# VideoControl Data Disk
UUID=abc123-xxx /mnt/videocontrol-data ext4 defaults,nofail 0 2
```

Проверить:
```bash
sudo umount /mnt/videocontrol-data
sudo mount -a
df -h /mnt/videocontrol-data
```

### 6. Обновить systemd service

Отредактировать `/etc/systemd/system/videocontrol.service`:

```ini
[Service]
Type=simple
User=yashka
WorkingDirectory=/vid/videocontrol
ExecStart=/usr/bin/node /vid/videocontrol/server.js
Restart=on-failure
RestartSec=10
Environment=NODE_ENV=production
Environment=DATA_ROOT=/mnt/videocontrol-data  ← Добавить эту строку

[Install]
WantedBy=multi-user.target
```

Перезагрузить:
```bash
sudo systemctl daemon-reload
sudo systemctl restart videocontrol
```

---

## 🔍 Проверка работы

### Убедиться что используется внешний диск:

```bash
# В логах должно быть:
journalctl -u videocontrol -n 50 | grep "Using external data disk"

# Проверить использование места
df -h /mnt/videocontrol-data

# Проверить файлы
ls -lh /mnt/videocontrol-data/content/
```

### Тест загрузки файла:

1. Откройте Admin панель
2. Загрузите тестовый файл
3. Проверьте что он появился в `/mnt/videocontrol-data/content/DEVICE_ID/`

---

## 📊 Мониторинг дискового пространства

### Создать скрипт мониторинга:

```bash
cat > ~/check-videocontrol-disk.sh << 'EOF'
#!/bin/bash
echo "=== VideoControl Disk Usage ==="
echo ""
echo "Data disk:"
df -h /mnt/videocontrol-data
echo ""
echo "Top 10 largest files:"
du -h /mnt/videocontrol-data/content | sort -rh | head -10
echo ""
echo "Total by device:"
du -sh /mnt/videocontrol-data/content/*
EOF

chmod +x ~/check-videocontrol-disk.sh
```

Запускать:
```bash
~/check-videocontrol-disk.sh
```

---

## 🔄 Резервное копирование

### Простой скрипт бэкапа:

```bash
cat > ~/backup-videocontrol.sh << 'EOF'
#!/bin/bash
BACKUP_DIR="/mnt/backup/videocontrol"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p "$BACKUP_DIR"

echo "Backing up VideoControl data..."
rsync -av --progress \
  /mnt/videocontrol-data/content/ \
  "$BACKUP_DIR/$DATE/content/"

echo "Backup completed: $BACKUP_DIR/$DATE"

# Удалить бэкапы старше 30 дней
find "$BACKUP_DIR" -type d -mtime +30 -exec rm -rf {} \;
EOF

chmod +x ~/backup-videocontrol.sh
```

Добавить в cron (ежедневно в 2 ночи):
```bash
crontab -e
# Добавить:
0 2 * * * /home/yashka/backup-videocontrol.sh
```

---

## ⚡ Оптимизация производительности

### 1. Настроить планировщик I/O

```bash
# Для SSD (OS диск)
echo "noop" | sudo tee /sys/block/sda/queue/scheduler

# Для HDD (data диск)
echo "deadline" | sudo tee /sys/block/sdb/queue/scheduler

# Добавить в /etc/rc.local для автозапуска
```

### 2. Оптимизировать параметры монтирования

В `/etc/fstab`:
```
UUID=xxx /mnt/videocontrol-data ext4 noatime,nodiratime,data=writeback 0 2
```

- `noatime` - не обновлять время доступа (быстрее)
- `nodiratime` - не обновлять время для директорий
- `data=writeback` - быстрее запись (для HDD)

### 3. Настроить readahead

```bash
# Увеличить readahead для больших последовательных чтений
sudo blockdev --setra 8192 /dev/sdb
```

---

## 🛟 Восстановление после сбоя

### Если диск не монтируется при загрузке:

```bash
# Проверить диск
sudo fsck -y /dev/sdb1

# Смонтировать вручную
sudo mount /dev/sdb1 /mnt/videocontrol-data

# Проверить /etc/fstab
cat /etc/fstab | grep videocontrol-data
```

### Откатиться на локальное хранение:

```bash
# 1. Остановить сервис
sudo systemctl stop videocontrol

# 2. Убрать DATA_ROOT из service
sudo nano /etc/systemd/system/videocontrol.service
# Удалить строку: Environment=DATA_ROOT=...

# 3. Перезагрузить и запустить
sudo systemctl daemon-reload
sudo systemctl start videocontrol

# Сервер будет использовать /vid/videocontrol/public/content
```

---

## 📚 Дополнительные ресурсы

- [Основная документация VideoControl](../README.md)
- [Установка сервера](INSTALL.md)
- [Структура проекта](STRUCTURE.md)

---

## ❓ FAQ

**Q: Можно ли использовать NFS/SMB вместо локального диска?**
A: Да! Просто смонтируйте NFS/SMB на `/mnt/videocontrol-data` и установите `DATA_ROOT`.

**Q: Что делать если закончилось место на data диске?**
A: Можно заменить диск на больший или добавить второй диск и использовать LVM.

**Q: Можно ли изменить путь `/mnt/videocontrol-data`?**
A: Да, установите любой путь через `DATA_ROOT` в systemd service.

**Q: Нужен ли SSD для data диска?**
A: Для видео достаточно HDD. SSD нужен только для OS и временных файлов (nginx temp).

