# 🛡️ Уровни безопасности VideoControl

> Документация двухуровневой системы защиты

---

## 📊 Обзор архитектуры безопасности

```
┌─────────────────────────────────────────────────────────────┐
│                    INTERNET (Public)                         │
│                           ↓                                   │
│                       ❌ BLOCKED                              │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                  FIREWALL / NGINX (Layer 1)                  │
│                                                               │
│  ┌─────────────────────────┐  ┌─────────────────────────┐  │
│  │   Admin Network         │  │   Device Network        │  │
│  │   192.168.1.0/24        │  │   192.168.0.0/16        │  │
│  │   + VPN 10.8.0.0/24     │  │   (Local LAN)           │  │
│  └───────────┬─────────────┘  └───────────┬─────────────┘  │
│              │                             │                 │
└──────────────┼─────────────────────────────┼─────────────────┘
               ↓                             ↓
┌──────────────┴─────────────────────────────┴─────────────────┐
│              APPLICATION LAYER (Layer 2)                      │
│                                                               │
│  ┌─────────────────────┐       ┌─────────────────────┐      │
│  │   Admin/Speaker     │       │   Devices (Players)  │      │
│  │   🔐 JWT Required   │       │   🔓 No Auth         │      │
│  │   - /admin.html     │       │   - /socket.io       │      │
│  │   - /speaker.html   │       │   - /player*.html    │      │
│  │   - /api/*          │       │   - /content/*       │      │
│  └─────────────────────┘       └─────────────────────┘      │
│                                                               │
└───────────────────────────────────────────────────────────────┘
```

---

## 🔴 Уровень 1: Сетевая защита (Nginx)

### Принцип работы

**Nginx проверяет IP адрес** каждого запроса и решает пропустить или блокировать:

```nginx
# Правило для админов
if ($admin_access = 0) {
    return 403;  # Блокировать
}

# Правило для устройств
if ($device_access = 0) {
    return 403;  # Блокировать
}
```

### Конфигурация доступа

| Категория | Разрешенные IP | Защищаемые ресурсы |
|-----------|----------------|-------------------|
| **Admin** | 192.168.1.0/24<br>10.8.0.0/24<br>127.0.0.1 | /admin.html<br>/speaker.html<br>/api/*<br>/login.html |
| **Device** | 192.168.0.0/16<br>10.0.0.0/8<br>172.16.0.0/12<br>127.0.0.1 | /socket.io/*<br>/player*.html<br>/content/* |

### Что блокируется

```
❌ Интернет → /admin.html           (403 Forbidden)
❌ Интернет → /api/devices          (403 Forbidden)
❌ Интернет → /socket.io            (403 Forbidden)
❌ Интернет → /content/device-001/  (403 Forbidden)

✅ Локалка → /admin.html            (OK, но нужен JWT)
✅ Локалка → /socket.io             (OK, без JWT)
✅ Локалка → /content/*             (OK, без JWT)
```

### Преимущества

- ✅ **Быстро** - блокирует на уровне Nginx, до Node.js
- ✅ **Надежно** - нет способа обойти (кроме взлома сервера)
- ✅ **Просто** - настраивается один раз
- ✅ **Не требует обновления клиентов**

---

## 🟡 Уровень 2: JWT авторизация (Express)

### Принцип работы

**Express проверяет JWT токен** в заголовке Authorization:

```javascript
// Middleware проверяет токен
function requireAuth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'No token' });
  }
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;  // { userId, username, role }
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}
```

### Где применяется JWT

| Endpoint | Требуется токен | Роль |
|----------|----------------|------|
| `POST /api/auth/login` | ❌ Нет | - |
| `GET /api/devices` | ✅ Да | viewer+ |
| `POST /api/devices` | ✅ Да | admin |
| `POST /api/devices/:id/upload` | ✅ Да | operator+ |
| `DELETE /api/devices/:id` | ✅ Да | admin |
| `DELETE /api/devices/:id/files/:name` | ✅ Да | operator+ |

### Где НЕ применяется JWT

| Endpoint/Протокол | Авторизация | Защита |
|------------------|-------------|--------|
| `Socket.IO` | ❌ Нет | Только Nginx (Layer 1) |
| `/player-videojs.html` | ❌ Нет | Только Nginx |
| `/content/*` | ❌ Нет | Только Nginx |
| `/css/*`, `/js/*` | ❌ Нет | Только Nginx |

### Роли пользователей

```javascript
// 3 роли с разными правами
const roles = {
  viewer: {
    permissions: ['read']
  },
  operator: {
    permissions: ['read', 'upload', 'rename', 'copy']
  },
  admin: {
    permissions: ['read', 'upload', 'rename', 'copy', 'delete', 'create']
  }
};
```

---

## 🔐 Двухуровневая проверка

### Пример: Admin панель

```
Request: GET /admin.html
From: 203.0.113.5 (Internet)

Step 1 (Nginx):
  ├─ Check IP: 203.0.113.5
  ├─ geo $admin_access = 0
  └─ Response: 403 Forbidden ❌
  
→ Request BLOCKED, не доходит до Node.js
```

```
Request: GET /admin.html  
From: 192.168.1.50 (Office)

Step 1 (Nginx):
  ├─ Check IP: 192.168.1.50
  ├─ geo $admin_access = 1
  └─ Pass to Node.js ✅

Step 2 (Express - для API запросов):
  ├─ Check Authorization header
  ├─ Verify JWT token
  └─ Allow if valid ✅
```

### Пример: Socket.IO для устройства

```
Request: CONNECT /socket.io/
From: 192.168.50.100 (Device)

Step 1 (Nginx):
  ├─ Check IP: 192.168.50.100
  ├─ geo $device_access = 1
  └─ Pass to Node.js ✅

Step 2 (Express/Socket.IO):
  ├─ No JWT check ✅
  ├─ Check device_id exists
  └─ Register device ✅
```

---

## 📋 Матрица доступа

### Полная таблица прав

| Ресурс | Из интернета | Из офиса без JWT | Из офиса с JWT (viewer) | Из офиса с JWT (admin) | Из локалки без JWT |
|--------|--------------|------------------|------------------------|------------------------|-------------------|
| `/admin.html` | ❌ | ⚠️ Загрузка OK, API блок | ✅ Просмотр | ✅ Полный доступ | ❌ |
| `/speaker.html` | ❌ | ⚠️ Загрузка OK, API блок | ✅ Просмотр | ✅ Полный доступ | ❌ |
| `/login.html` | ❌ | ✅ Доступен | ✅ Доступен | ✅ Доступен | ❌ |
| `GET /api/devices` | ❌ | ❌ | ✅ Просмотр | ✅ Просмотр | ❌ |
| `POST /api/devices` | ❌ | ❌ | ❌ | ✅ Создание | ❌ |
| `DELETE /api/devices/:id` | ❌ | ❌ | ❌ | ✅ Удаление | ❌ |
| `/socket.io/*` | ❌ | ✅ Подключение | ✅ Подключение | ✅ Подключение | ✅ Подключение |
| `/player-videojs.html` | ❌ | ✅ Загрузка | ✅ Загрузка | ✅ Загрузка | ✅ Загрузка |
| `/content/*` | ❌ | ✅ Чтение файлов | ✅ Чтение файлов | ✅ Чтение файлов | ✅ Чтение файлов |

---

## 🎯 Сценарии использования

### Сценарий 1: Администратор в офисе

```
1. Подключается к http://192.168.1.100/admin.html
   ✅ Nginx: IP 192.168.1.50 → admin_access = 1
   ✅ Express: Загружает страницу

2. Вводит логин/пароль
   ✅ POST /api/auth/login
   ✅ Получает JWT токен

3. Создает новое устройство
   ✅ POST /api/devices (с JWT токеном)
   ✅ Express: Проверяет токен → role = admin
   ✅ Создает устройство
```

### Сценарий 2: Оператор в офисе

```
1. Подключается к http://192.168.1.100/speaker.html
   ✅ Nginx: IP 192.168.1.60 → admin_access = 1
   ✅ Express: Загружает страницу

2. Вводит логин/пароль
   ✅ POST /api/auth/login
   ✅ Получает JWT токен (role = operator)

3. Загружает файл
   ✅ POST /api/devices/tv-001/upload (с JWT токеном)
   ✅ Express: Проверяет токен → role = operator
   ✅ Загружает файл

4. Пробует удалить устройство
   ❌ DELETE /api/devices/tv-001 (с JWT токеном)
   ❌ Express: Проверяет токен → role = operator ≠ admin
   ❌ 403 Forbidden (недостаточно прав)
```

### Сценарий 3: Android устройство в локалке

```
1. Приложение запускается
   ✅ Подключается к ws://192.168.50.100/socket.io
   ✅ Nginx: IP 192.168.50.101 → device_access = 1
   ✅ Express: Принимает WebSocket

2. Отправляет player/register
   ✅ Socket.IO: Проверяет device_id существует
   ✅ Регистрирует устройство (БЕЗ JWT!)

3. Получает команду play video
   ✅ Socket.IO: Отправляет player/play
   ✅ Скачивает видео с /content/tv-001/video.mp4
   ✅ Nginx: Раздает файл (БЕЗ JWT!)
```

### Сценарий 4: Злоумышленник из интернета

```
1. Пробует доступ к admin панели
   ❌ GET http://public-ip/admin.html
   ❌ Nginx: IP xxx.xxx.xxx.xxx → admin_access = 0
   ❌ 403 Forbidden

2. Пробует прямой доступ к API
   ❌ GET http://public-ip/api/devices
   ❌ Nginx: IP xxx.xxx.xxx.xxx → admin_access = 0
   ❌ 403 Forbidden

3. Пробует подключиться к Socket.IO
   ❌ CONNECT ws://public-ip/socket.io
   ❌ Nginx: IP xxx.xxx.xxx.xxx → device_access = 0
   ❌ 403 Forbidden

4. Пробует скачать контент
   ❌ GET http://public-ip/content/tv-001/video.mp4
   ❌ Nginx: IP xxx.xxx.xxx.xxx → device_access = 0
   ❌ 403 Forbidden

→ Все заблокировано на уровне Nginx, до Node.js не доходит
```

---

## ✅ Преимущества этого подхода

### Для администраторов:
- ✅ Не нужно обновлять устройства
- ✅ Устройства работают 24/7 без токенов
- ✅ Простая настройка (один раз)
- ✅ Легко добавить новые IP

### Для безопасности:
- ✅ Защита от внешних атак (Nginx блокирует)
- ✅ Защита от неавторизованных действий (JWT)
- ✅ Разделение прав (admin/operator/viewer)
- ✅ Audit log всех действий

### Для производительности:
- ✅ Nginx блокирует на раннем этапе
- ✅ Node.js не перегружается запросами извне
- ✅ Socket.IO работает без overhead JWT

---

## 🔄 Миграция с текущей системы

### Что НЕ изменится:
- ✅ Android клиенты работают как раньше
- ✅ MPV клиенты работают как раньше
- ✅ Browser players работают как раньше
- ✅ Socket.IO протокол не меняется

### Что изменится:
- ⚠️ Admin панель требует вход (login)
- ⚠️ Speaker панель требует вход (login)
- ⚠️ REST API требует JWT токен

### План миграции:
1. Установить Nginx конфиг (Layer 1)
2. Протестировать доступ
3. Внедрить JWT (Layer 2) - см. ROADMAP.md Sprint 1.1
4. Создать пользователей
5. Обучить администраторов

---

**Дата создания**: 11 ноября 2025  
**Версия**: 1.0  
**Статус**: Ready for implementation

