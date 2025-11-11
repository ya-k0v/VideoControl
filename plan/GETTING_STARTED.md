# 🚀 Getting Started - Security Implementation

> Быстрый старт для внедрения системы безопасности в VideoControl

---

## 📋 Checklist перед началом

- [ ] Сделан backup текущей системы
- [ ] Установлен Node.js 18+
- [ ] Установлен Git
- [ ] Настроен редактор кода (VSCode рекомендуется)
- [ ] Прочитан [ROADMAP.md](./ROADMAP.md)

---

## ⚡ Quick Start (Week 1: Authentication)

### Step 1: Установка зависимостей (5 минут)

```bash
cd /vid/videocontrol

# Установка authentication пакетов
npm install jsonwebtoken bcrypt passport passport-jwt express-validator

# Установка dev зависимостей для тестирования
npm install --save-dev jest supertest @types/jest
```

### Step 2: Настройка окружения (5 минут)

```bash
# Копируем .env.example в .env
cp .env.example .env

# ВАЖНО: Генерируем сильный JWT_SECRET
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# Вставляем сгенерированный secret в .env
nano .env
# JWT_SECRET=ваш_сгенерированный_секрет
```

### Step 3: Применение миграции БД (2 минуты)

```bash
# Создаем папку для миграций если нет
mkdir -p src/database/migrations

# Миграция уже создана: src/database/migrations/001_add_users.sql

# Применяем миграцию (автоматически при следующем запуске)
npm start
```

### Step 4: Создание auth модулей (Day 1-2)

#### 4.1 Создать Auth Middleware

```bash
# Создать файл
touch src/middleware/auth.js
```

Скопируйте содержимое из **ROADMAP.md → Sprint 1.1.3**

```javascript
// src/middleware/auth.js
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET;

export function requireAuth(req, res, next) {
  // ... implementation
}

export function requireRole(...roles) {
  // ... implementation
}

export const requireAdmin = requireRole('admin');
```

#### 4.2 Создать Auth Routes

```bash
# Создать файл
touch src/routes/auth.js
```

Скопируйте содержимое из **ROADMAP.md → Sprint 1.1.4**

```javascript
// src/routes/auth.js
import express from 'express';
import bcrypt from 'bcrypt';

const router = express.Router();

// POST /api/auth/login
router.post('/login', async (req, res) => {
  // ... implementation
});

// POST /api/auth/register
router.post('/register', requireAdmin, async (req, res) => {
  // ... implementation
});
```

#### 4.3 Обновить server.js

```javascript
// server.js - добавить после существующих импортов
import { createAuthRouter } from './src/routes/auth.js';

// ... существующий код ...

// Добавить auth router ПЕРЕД другими роутерами
app.use('/api/auth', createAuthRouter());

// Теперь защищаем существующие routes
import { requireAuth, requireAdmin } from './src/middleware/auth.js';

// Devices router - теперь с аутентификацией
const devicesRouter = createDevicesRouter({ 
  devices, 
  io, 
  saveDevicesJson: saveDevicesToDB, 
  fileNamesMap, 
  saveFileNamesMap: saveFileNamesToDB,
  requireAuth,  // Передаем middleware
  requireAdmin
});
```

### Step 5: Защита существующих routes (Day 3-4)

#### Обновить src/routes/devices.js

```javascript
// src/routes/devices.js

export function createDevicesRouter(deps) {
  const { devices, io, saveDevicesJson, requireAuth, requireAdmin } = deps;
  
  // GET - требует авторизации
  router.get('/', requireAuth, (req, res) => { /* ... */ });
  
  // POST - только admin
  router.post('/', requireAdmin, (req, res) => { /* ... */ });
  
  // DELETE - только admin
  router.delete('/:id', requireAdmin, (req, res) => { /* ... */ });
  
  return router;
}
```

**Повторить для всех routes:**
- src/routes/files.js
- src/routes/folders.js
- src/routes/placeholder.js
- src/routes/video-info.js
- src/routes/conversion.js

### Step 6: Тестирование (Day 5)

#### Создать test файлы

```bash
mkdir -p src/routes/__tests__

touch src/routes/__tests__/auth.test.js
```

```javascript
// src/routes/__tests__/auth.test.js
import request from 'supertest';
import app from '../../../server.js';

describe('POST /api/auth/login', () => {
  it('should login with valid credentials', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'admin123' });
    
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('accessToken');
    expect(response.body).toHaveProperty('refreshToken');
  });
  
  it('should reject invalid credentials', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'wrong' });
    
    expect(response.status).toBe(401);
  });
});
```

#### Запустить тесты

```bash
npm test
```

---

## 📝 Week 1 Daily Tasks

### День 1 (Понедельник)
- [ ] Установить зависимости
- [ ] Настроить .env
- [ ] Применить миграцию БД
- [ ] Создать src/middleware/auth.js

### День 2 (Вторник)
- [ ] Создать src/routes/auth.js
- [ ] Реализовать POST /api/auth/login
- [ ] Реализовать POST /api/auth/register
- [ ] Реализовать POST /api/auth/refresh

### День 3 (Среда)
- [ ] Обновить server.js
- [ ] Защитить src/routes/devices.js
- [ ] Защитить src/routes/files.js
- [ ] Тестировать через Postman/curl

### День 4 (Четверг)
- [ ] Защитить остальные routes
- [ ] Обновить frontend (добавить login форму)
- [ ] Сохранять token в localStorage
- [ ] Отправлять token в Authorization header

### День 5 (Пятница)
- [ ] Написать unit tests
- [ ] Написать integration tests
- [ ] Проверить coverage (>= 70%)
- [ ] Week 1 Review

---

## 🧪 Тестирование API через curl

### Login
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'
```

Ответ:
```json
{
  "accessToken": "eyJhbGc...",
  "refreshToken": "eyJhbGc...",
  "user": {
    "id": 1,
    "username": "admin",
    "role": "admin"
  }
}
```

### Get Devices (с токеном)
```bash
TOKEN="your_access_token_here"

curl http://localhost:3000/api/devices \
  -H "Authorization: Bearer $TOKEN"
```

### Create Device (требует admin)
```bash
curl -X POST http://localhost:3000/api/devices \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"device_id":"tv-001","name":"Living Room TV"}'
```

---

## ⚠️ Troubleshooting

### Проблема: "JWT_SECRET not defined"
```bash
# Проверить .env
cat .env | grep JWT_SECRET

# Если пусто - сгенерировать
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### Проблема: "Cannot find module 'jsonwebtoken'"
```bash
# Переустановить зависимости
rm -rf node_modules
npm install
```

### Проблема: "Database locked"
```bash
# Остановить все процессы Node.js
pkill -9 node

# Удалить lock файлы
rm -f config/main.db-shm config/main.db-wal

# Перезапустить
npm start
```

### Проблема: Тесты падают
```bash
# Проверить NODE_ENV
export NODE_ENV=test

# Очистить кэш Jest
npx jest --clearCache

# Запустить с verbose
npm test -- --verbose
```

---

## 📚 Дополнительные ресурсы

### Документация
- [JWT.io](https://jwt.io) - JWT debugger
- [bcrypt](https://www.npmjs.com/package/bcrypt) - Password hashing
- [Express Validator](https://express-validator.github.io/docs/) - Input validation

### Инструменты
- [Postman](https://www.postman.com/) - API testing
- [JWT Debugger](https://jwt.io/#debugger) - Decode tokens
- [bcrypt-generator](https://bcrypt-generator.com/) - Generate password hashes

### Полезные команды
```bash
# Генерация сильного пароля
openssl rand -base64 32

# Генерация JWT secret
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# Хеширование пароля (для создания тестовых пользователей)
node -e "console.log(require('bcrypt').hashSync('password', 10))"

# Проверка JWT токена
node -e "console.log(require('jsonwebtoken').decode('YOUR_TOKEN'))"
```

---

## ✅ Week 1 Checkpoint

К концу недели 1 должно быть:
- [x] JWT аутентификация работает
- [x] Login/Register endpoints реализованы
- [x] Refresh token механизм работает
- [x] Все routes защищены
- [x] Frontend отправляет токены
- [x] Тесты написаны и проходят
- [x] Coverage >= 70%

**Если все пункты выполнены → Переходим к Week 2 (Path Traversal Protection)**

---

## 🆘 Нужна помощь?

1. Проверьте [ROADMAP.md](./ROADMAP.md) - детальные инструкции
2. Проверьте [TODO.md](./TODO.md) - краткий список задач
3. Проверьте логи: `tail -f logs/app-*.log`
4. Запустите тесты: `npm test -- --verbose`

---

**Last Updated:** 11 ноября 2025  
**Current Sprint:** Week 1 - Authentication  
**Status:** 🚀 Ready to start

