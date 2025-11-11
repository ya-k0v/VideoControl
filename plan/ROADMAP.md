# 🗺️ VideoControl - Roadmap & TODO

> Детальный план развития проекта на основе code review от 11.11.2025

---

## 📊 ОБЩИЙ OVERVIEW

| Фаза | Сроки | Приоритет | Статус |
|------|-------|-----------|--------|
| **Фаза 1: Безопасность** | 2-3 недели | 🔴 P0 | 🔄 В работе |
| **Фаза 2: Качество кода** | 2-3 недели | 🟠 P1 | ⏳ Запланировано |
| **Фаза 3: Мониторинг** | 1 неделя | 🟡 P2 | ⏳ Запланировано |
| **Фаза 4: Масштабирование** | Ongoing | 🟢 P3 | ⏳ Backlog |

---

## 🔴 ФАЗА 1: БЕЗОПАСНОСТЬ (2-3 недели)

### Sprint 1.1: Аутентификация (1 неделя)

#### Backend: JWT Authentication

**1.1.1 Установка зависимостей**
```bash
npm install jsonwebtoken bcrypt passport passport-jwt express-validator
npm install --save-dev @types/jsonwebtoken @types/bcrypt
```
- [ ] Установить пакеты
- [ ] Обновить package.json
- [ ] Проверить совместимость версий

**1.1.2 Создать User модель и миграцию БД**

Файл: `src/database/migrations/001_add_users.sql`
```sql
-- Таблица пользователей
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT DEFAULT 'viewer' CHECK(role IN ('admin', 'operator', 'viewer')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_login DATETIME,
  is_active BOOLEAN DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- Таблица refresh токенов
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  token TEXT UNIQUE NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token ON refresh_tokens(token);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);

-- Таблица аудита действий
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  action TEXT NOT NULL,
  resource_type TEXT,
  resource_id TEXT,
  details TEXT,
  ip_address TEXT,
  user_agent TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_log_user ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at);

-- Дефолтный admin пользователь (пароль: admin123 - ИЗМЕНИТЬ ПОСЛЕ УСТАНОВКИ!)
INSERT INTO users (username, email, password_hash, role) 
VALUES ('admin', 'admin@videocontrol.local', '$2b$10$YourHashedPasswordHere', 'admin');
```

Tasks:
- [ ] Создать файл миграции
- [ ] Добавить функцию `runMigrations()` в `src/database/database.js`
- [ ] Реализовать User model: `src/models/user.js`
- [ ] Добавить методы: `createUser()`, `findByUsername()`, `updateLastLogin()`

**1.1.3 Создать Auth middleware**

Файл: `src/middleware/auth.js`
```javascript
import jwt from 'jsonwebtoken';
import { getDatabase } from '../database/database.js';

const JWT_SECRET = process.env.JWT_SECRET || 'CHANGE_ME_IN_PRODUCTION';
const JWT_EXPIRES_IN = '15m';
const REFRESH_TOKEN_EXPIRES_IN = '7d';

export function generateAccessToken(userId, username, role) {
  return jwt.sign(
    { userId, username, role },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

export function generateRefreshToken(userId) {
  return jwt.sign(
    { userId, type: 'refresh' },
    JWT_SECRET,
    { expiresIn: REFRESH_TOKEN_EXPIRES_IN }
  );
}

export function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = authHeader.substring(7);
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    
    next();
  };
}

export const requireAdmin = requireRole('admin');
export const requireOperator = requireRole('admin', 'operator');
```

Tasks:
- [ ] Создать middleware файл
- [ ] Добавить JWT_SECRET в .env
- [ ] Реализовать `requireAuth`, `requireRole`, `requireAdmin`
- [ ] Добавить тесты для middleware

**1.1.4 Создать Auth routes**

Файл: `src/routes/auth.js`
```javascript
import express from 'express';
import bcrypt from 'bcrypt';
import { body, validationResult } from 'express-validator';
import { getDatabase } from '../database/database.js';
import { generateAccessToken, generateRefreshToken, requireAuth } from '../middleware/auth.js';

const router = express.Router();

// POST /api/auth/register - Регистрация (только для admin)
router.post('/register',
  requireAuth,
  requireAdmin,
  body('username').isLength({ min: 3, max: 50 }).trim(),
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 8 }),
  body('role').isIn(['admin', 'operator', 'viewer']),
  async (req, res) => {
    // Implementation
  }
);

// POST /api/auth/login - Вход
router.post('/login',
  body('username').trim(),
  body('password').notEmpty(),
  async (req, res) => {
    // Implementation
  }
);

// POST /api/auth/refresh - Обновление токена
router.post('/refresh', async (req, res) => {
  // Implementation
});

// POST /api/auth/logout - Выход
router.post('/logout', requireAuth, async (req, res) => {
  // Implementation
});

// GET /api/auth/me - Получить текущего пользователя
router.get('/me', requireAuth, async (req, res) => {
  // Implementation
});

export function createAuthRouter() {
  return router;
}
```

Tasks:
- [ ] Создать auth router
- [ ] Реализовать все endpoints
- [ ] Добавить валидацию через express-validator
- [ ] Написать тесты для каждого endpoint

**1.1.5 Защитить существующие routes**

Обновить: `src/routes/devices.js`
```javascript
import { requireAuth, requireAdmin, requireOperator } from '../middleware/auth.js';

// GET /api/devices - требует авторизации
router.get('/', requireAuth, (req, res) => { /* ... */ });

// POST /api/devices - только admin
router.post('/', requireAdmin, (req, res) => { /* ... */ });

// DELETE /api/devices/:id - только admin
router.delete('/:id', requireAdmin, (req, res) => { /* ... */ });
```

Tasks:
- [ ] Защитить `src/routes/devices.js`
- [ ] Защитить `src/routes/files.js` (upload - operator, delete - admin)
- [ ] Защитить `src/routes/placeholder.js`
- [ ] Защитить `src/routes/video-info.js`
- [ ] Защитить `src/routes/conversion.js`
- [ ] Защитить `src/routes/folders.js`
- [ ] Обновить документацию API

**Checkpoint 1.1:**
- [ ] Все routes защищены
- [ ] JWT работает корректно
- [ ] Refresh token механизм работает
- [ ] Написаны unit тесты
- [ ] Обновлена документация

---

### Sprint 1.2: Path Traversal Protection (2 дня)

**1.2.1 Создать Path Validation Utility**

Файл: `src/utils/path-validator.js`
```javascript
import path from 'path';
import fs from 'fs';

/**
 * Валидация пути для защиты от path traversal
 */
export function validatePath(userPath, baseDir) {
  // Резолвим абсолютный путь
  const resolvedPath = path.resolve(baseDir, userPath);
  
  // Проверяем что путь внутри baseDir
  if (!resolvedPath.startsWith(baseDir)) {
    throw new Error('Path traversal attempt detected');
  }
  
  return resolvedPath;
}

/**
 * Безопасное чтение файла
 */
export async function safeReadFile(userPath, baseDir) {
  const safePath = validatePath(userPath, baseDir);
  
  if (!fs.existsSync(safePath)) {
    throw new Error('File not found');
  }
  
  const stats = fs.statSync(safePath);
  if (!stats.isFile()) {
    throw new Error('Path is not a file');
  }
  
  return fs.promises.readFile(safePath);
}

/**
 * Безопасное удаление файла/папки
 */
export async function safeDelete(userPath, baseDir) {
  const safePath = validatePath(userPath, baseDir);
  
  if (!fs.existsSync(safePath)) {
    throw new Error('Path not found');
  }
  
  return fs.promises.rm(safePath, { recursive: true, force: true });
}
```

Tasks:
- [ ] Создать утилиту валидации
- [ ] Добавить тесты с path traversal попытками
- [ ] Написать документацию

**1.2.2 Обновить все routes с path операциями**

Обновить: `src/routes/files.js`
```javascript
import { validatePath, safeReadFile, safeDelete } from '../utils/path-validator.js';

// DELETE /api/devices/:id/files/:name
router.delete('/:id/files/:name', requireAuth, requireOperator, (req, res) => {
  const id = sanitizeDeviceId(req.params.id);
  const name = req.params.name;
  
  const deviceFolder = path.join(DEVICES, devices[id].folder);
  
  try {
    // БЕЗОПАСНАЯ валидация пути
    const filePath = validatePath(name, deviceFolder);
    
    // Удаляем файл
    await safeDelete(filePath, deviceFolder);
    
    res.json({ ok: true });
  } catch (err) {
    console.error(`[DELETE] Path validation failed:`, err);
    return res.status(400).json({ error: 'Invalid file path' });
  }
});
```

Tasks:
- [ ] Обновить `src/routes/files.js` - все операции с файлами
- [ ] Обновить `src/routes/folders.js` - операции с папками
- [ ] Обновить `src/converters/document-converter.js`
- [ ] Обновить `src/converters/folder-converter.js`
- [ ] Добавить логирование подозрительных попыток

**Checkpoint 1.2:**
- [ ] Path traversal невозможен
- [ ] Все файловые операции защищены
- [ ] Написаны тесты с malicious inputs
- [ ] Добавлено логирование

---

### Sprint 1.3: Rate Limiting & Input Validation (3 дня)

**1.3.1 Установить Rate Limiting**

```bash
npm install express-rate-limit express-slow-down
```

Файл: `src/middleware/rate-limit.js`
```javascript
import rateLimit from 'express-rate-limit';
import slowDown from 'express-slow-down';

// Глобальный rate limiter
export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 минут
  max: 1000, // 1000 запросов с IP
  message: 'Too many requests from this IP',
  standardHeaders: true,
  legacyHeaders: false,
});

// Строгий limiter для upload
export const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50, // 50 upload за 15 минут
  message: 'Too many uploads, please try again later'
});

// Auth limiter - защита от brute force
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5, // 5 попыток входа за 15 минут
  message: 'Too many login attempts, please try again later',
  skipSuccessfulRequests: true
});

// Speed limiter для API
export const apiSpeedLimiter = slowDown({
  windowMs: 15 * 60 * 1000,
  delayAfter: 100, // После 100 запросов начинаем замедлять
  delayMs: 500 // +500ms задержки на каждый запрос
});
```

Tasks:
- [ ] Создать middleware
- [ ] Применить `globalLimiter` на все API routes
- [ ] Применить `uploadLimiter` на upload endpoints
- [ ] Применить `authLimiter` на `/api/auth/login`
- [ ] Настроить Redis store для production (опционально)

**1.3.2 Добавить MIME Type Validation**

```bash
npm install file-type
```

Файл: `src/middleware/file-validation.js`
```javascript
import { fileTypeFromBuffer } from 'file-type';
import fs from 'fs';

const ALLOWED_MIME_TYPES = {
  video: ['video/mp4', 'video/webm', 'video/ogg', 'video/x-matroska'],
  image: ['image/png', 'image/jpeg', 'image/gif', 'image/webp'],
  document: ['application/pdf', 'application/vnd.ms-powerpoint', 
             'application/vnd.openxmlformats-officedocument.presentationml.presentation'],
  archive: ['application/zip']
};

export async function validateFileMimeType(filePath, expectedCategory) {
  const buffer = await fs.promises.readFile(filePath);
  const fileType = await fileTypeFromBuffer(buffer);
  
  if (!fileType) {
    throw new Error('Unable to detect file type');
  }
  
  const allowedMimes = ALLOWED_MIME_TYPES[expectedCategory] || [];
  
  if (!allowedMimes.includes(fileType.mime)) {
    throw new Error(`Invalid file type: ${fileType.mime}`);
  }
  
  return fileType;
}
```

Tasks:
- [ ] Создать validation middleware
- [ ] Интегрировать в multer upload
- [ ] Добавить валидацию после загрузки
- [ ] Удалять файлы с неверным MIME type

**1.3.3 Добавить Input Validation**

Обновить все routes с `express-validator`:

```javascript
import { body, param, query, validationResult } from 'express-validator';

// Middleware для проверки результатов валидации
export function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
}

// Пример: POST /api/devices
router.post('/',
  requireAdmin,
  body('device_id').matches(/^[A-Za-z0-9_-]+$/).isLength({ min: 1, max: 50 }),
  body('name').optional().isLength({ min: 1, max: 100 }).trim(),
  validate,
  async (req, res) => { /* ... */ }
);
```

Tasks:
- [ ] Добавить валидацию во все POST/PUT/PATCH endpoints
- [ ] Валидировать query параметры
- [ ] Валидировать path параметры
- [ ] Написать тесты с невалидными данными

**Checkpoint 1.3:**
- [ ] Rate limiting работает
- [ ] MIME type валидация работает
- [ ] Input validation на всех endpoints
- [ ] Написаны тесты

---

### Sprint 1.4: Logging & Audit (2 дня)

**1.4.1 Настроить Winston Logger**

```bash
npm install winston winston-daily-rotate-file
```

Файл: `src/config/logger.js`
```javascript
import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'path';

const LOG_DIR = process.env.LOG_DIR || path.join(process.cwd(), 'logs');

// Транспорты
const transports = [
  // Console для development
  new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    )
  }),
  
  // Файл для всех логов (ротация каждый день)
  new DailyRotateFile({
    filename: path.join(LOG_DIR, 'app-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    maxSize: '20m',
    maxFiles: '14d',
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.json()
    )
  }),
  
  // Отдельный файл для ошибок
  new DailyRotateFile({
    filename: path.join(LOG_DIR, 'error-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    maxSize: '20m',
    maxFiles: '30d',
    level: 'error',
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.json()
    )
  })
];

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports
});

// Audit logger для критических действий
export const auditLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new DailyRotateFile({
      filename: path.join(LOG_DIR, 'audit-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '90d' // Храним аудит 90 дней
    })
  ]
});
```

Tasks:
- [ ] Создать logger конфигурацию
- [ ] Заменить все `console.log` на `logger.info`
- [ ] Заменить все `console.error` на `logger.error`
- [ ] Создать папку `logs/` с правами доступа

**1.4.2 Добавить Audit Middleware**

Файл: `src/middleware/audit.js`
```javascript
import { auditLogger } from '../config/logger.js';
import { getDatabase } from '../database/database.js';

export function auditAction(action, resourceType = null) {
  return async (req, res, next) => {
    const originalSend = res.json;
    
    res.json = function(data) {
      // Логируем только успешные действия (2xx)
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const auditData = {
          userId: req.user?.userId || null,
          username: req.user?.username || 'anonymous',
          action,
          resourceType,
          resourceId: req.params.id || null,
          method: req.method,
          path: req.path,
          ipAddress: req.ip,
          userAgent: req.get('user-agent'),
          timestamp: new Date().toISOString()
        };
        
        // Логируем в файл
        auditLogger.info('Action performed', auditData);
        
        // Сохраняем в БД
        try {
          const db = getDatabase();
          db.prepare(`
            INSERT INTO audit_log 
            (user_id, action, resource_type, resource_id, details, ip_address, user_agent)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `).run(
            auditData.userId,
            auditData.action,
            auditData.resourceType,
            auditData.resourceId,
            JSON.stringify({ method: req.method, path: req.path }),
            auditData.ipAddress,
            auditData.userAgent
          );
        } catch (err) {
          logger.error('Failed to write audit log to DB:', err);
        }
      }
      
      originalSend.call(this, data);
    };
    
    next();
  };
}
```

Tasks:
- [ ] Создать audit middleware
- [ ] Применить на критические endpoints (CREATE, DELETE, UPDATE)
- [ ] Добавить API для просмотра audit logs (только admin)

**Checkpoint 1.4:**
- [ ] Winston logger настроен
- [ ] Все console.log заменены
- [ ] Audit log работает
- [ ] Логи ротируются автоматически

---

**ИТОГО ФАЗА 1:**
- [ ] JWT аутентификация ✅
- [ ] RBAC (admin/operator/viewer) ✅
- [ ] Path traversal защита ✅
- [ ] Rate limiting ✅
- [ ] MIME type validation ✅
- [ ] Input validation ✅
- [ ] Logging & Audit ✅
- [ ] Написаны тесты для всего ✅

**Время: 2-3 недели**

---

## 🟠 ФАЗА 2: КАЧЕСТВО КОДА (2-3 недели)

### Sprint 2.1: Testing Infrastructure (1 неделя)

**2.1.1 Настроить Jest для Backend**

```bash
npm install --save-dev jest supertest @types/jest
```

Файл: `jest.config.js`
```javascript
export default {
  testEnvironment: 'node',
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/**/*.test.js'
  ],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70
    }
  },
  transform: {
    '^.+\\.js$': 'babel-jest'
  }
};
```

Tasks:
- [ ] Настроить Jest
- [ ] Настроить coverage reporting
- [ ] Добавить npm scripts: `test`, `test:watch`, `test:coverage`
- [ ] Настроить CI/CD для запуска тестов

**2.1.2 Написать Unit тесты**

Примеры тестов:

```javascript
// src/utils/__tests__/sanitize.test.js
import { sanitizeDeviceId, isSystemFile } from '../sanitize.js';

describe('sanitize', () => {
  describe('sanitizeDeviceId', () => {
    it('should accept valid device IDs', () => {
      expect(sanitizeDeviceId('device-001')).toBe('device-001');
      expect(sanitizeDeviceId('TV_1')).toBe('TV_1');
    });
    
    it('should reject invalid device IDs', () => {
      expect(sanitizeDeviceId('../../../etc/passwd')).toBeNull();
      expect(sanitizeDeviceId('device@001')).toBeNull();
    });
  });
});
```

Tasks:
- [ ] Тесты для `src/utils/` (100% coverage)
- [ ] Тесты для `src/middleware/` (100% coverage)
- [ ] Тесты для `src/database/` (80% coverage)
- [ ] Тесты для `src/routes/` (80% coverage)
- [ ] Тесты для `src/video/` (70% coverage)

**2.1.3 Integration тесты для API**

```javascript
// src/routes/__tests__/devices.test.js
import request from 'supertest';
import app from '../../server.js';

describe('GET /api/devices', () => {
  it('should return 401 without auth', async () => {
    const response = await request(app)
      .get('/api/devices');
    
    expect(response.status).toBe(401);
  });
  
  it('should return devices with valid token', async () => {
    const token = await getValidToken(); // helper
    
    const response = await request(app)
      .get('/api/devices')
      .set('Authorization', `Bearer ${token}`);
    
    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
  });
});
```

Tasks:
- [ ] API тесты для auth endpoints
- [ ] API тесты для devices endpoints
- [ ] API тесты для files endpoints
- [ ] Тесты для Socket.IO handlers

**Checkpoint 2.1:**
- [ ] Jest настроен и работает
- [ ] Coverage >= 70%
- [ ] CI/CD запускает тесты
- [ ] Все critical paths покрыты тестами

---

### Sprint 2.2: Code Quality Tools (3 дня)

**2.2.1 Настроить ESLint**

```bash
npm install --save-dev eslint eslint-config-airbnb-base eslint-plugin-import
```

Файл: `.eslintrc.json`
```json
{
  "extends": ["airbnb-base"],
  "env": {
    "node": true,
    "es2021": true,
    "jest": true
  },
  "parserOptions": {
    "ecmaVersion": 2021,
    "sourceType": "module"
  },
  "rules": {
    "no-console": "warn",
    "import/extensions": ["error", "always", { "ignorePackages": true }],
    "max-len": ["error", { "code": 120 }]
  }
}
```

Tasks:
- [ ] Настроить ESLint
- [ ] Исправить все критические ошибки
- [ ] Добавить `npm run lint`
- [ ] Настроить pre-commit hook

**2.2.2 Настроить Prettier**

```bash
npm install --save-dev prettier eslint-config-prettier
```

Файл: `.prettierrc`
```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "es5",
  "printWidth": 100,
  "tabWidth": 2
}
```

Tasks:
- [ ] Настроить Prettier
- [ ] Отформатировать весь код
- [ ] Добавить `npm run format`
- [ ] Интегрировать с ESLint

**2.2.3 Настроить Husky + lint-staged**

```bash
npm install --save-dev husky lint-staged
npx husky install
```

Файл: `.husky/pre-commit`
```bash
#!/bin/sh
. "$(dirname "$0")/_/husky.sh"

npm run lint-staged
npm test
```

Tasks:
- [ ] Настроить Husky
- [ ] Настроить lint-staged
- [ ] Добавить pre-commit проверки

**Checkpoint 2.2:**
- [ ] ESLint настроен
- [ ] Prettier форматирует код
- [ ] Pre-commit hooks работают
- [ ] Код соответствует стандартам

---

### Sprint 2.3: CI/CD Pipeline (4 дня)

**2.3.1 GitHub Actions для тестов**

Файл: `.github/workflows/test.yml`
```yaml
name: Tests

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main ]

jobs:
  test:
    runs-on: ubuntu-latest
    
    strategy:
      matrix:
        node-version: [18.x, 20.x]
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Use Node.js ${{ matrix.node-version }}
        uses: actions/setup-node@v3
        with:
          node-version: ${{ matrix.node-version }}
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run linter
        run: npm run lint
      
      - name: Run tests
        run: npm test
      
      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./coverage/lcov.info
```

Tasks:
- [ ] Настроить GitHub Actions
- [ ] Настроить матрицу версий Node.js
- [ ] Интегрировать с Codecov
- [ ] Добавить badge в README

**2.3.2 Docker контейнеризация**

Файл: `Dockerfile`
```dockerfile
FROM node:20-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

FROM node:20-alpine

WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY . .

RUN apk add --no-cache ffmpeg libreoffice imagemagick

EXPOSE 3000

CMD ["node", "server.js"]
```

Файл: `docker-compose.yml`
```yaml
version: '3.8'

services:
  videocontrol:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - JWT_SECRET=${JWT_SECRET}
      - DATA_ROOT=/data
    volumes:
      - ./data:/data
      - ./config:/app/config
    restart: unless-stopped
  
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf
      - ./data:/data:ro
    depends_on:
      - videocontrol
    restart: unless-stopped
```

Tasks:
- [ ] Создать Dockerfile
- [ ] Создать docker-compose.yml
- [ ] Оптимизировать размер образа (multi-stage build)
- [ ] Документировать Docker deployment

**Checkpoint 2.3:**
- [ ] CI/CD pipeline работает
- [ ] Тесты запускаются автоматически
- [ ] Docker образы собираются
- [ ] Deployment автоматизирован

---

**ИТОГО ФАЗА 2:**
- [ ] Jest tests (coverage >= 70%) ✅
- [ ] ESLint + Prettier ✅
- [ ] Pre-commit hooks ✅
- [ ] GitHub Actions CI/CD ✅
- [ ] Docker контейнеризация ✅

**Время: 2-3 недели**

---

## 🟡 ФАЗА 3: МОНИТОРИНГ (1 неделя)

### Sprint 3.1: Metrics & Health Checks (1 неделя)

**3.1.1 Prometheus metrics**

```bash
npm install prom-client
```

Файл: `src/middleware/metrics.js`
```javascript
import client from 'prom-client';

// Создаем registry
const register = new client.Registry();

// Default metrics (CPU, memory)
client.collectDefaultMetrics({ register });

// Custom metrics
export const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register]
});

export const activeDevices = new client.Gauge({
  name: 'videocontrol_active_devices',
  help: 'Number of currently active devices',
  registers: [register]
});

export const filesUploaded = new client.Counter({
  name: 'videocontrol_files_uploaded_total',
  help: 'Total number of files uploaded',
  registers: [register]
});

// Middleware для метрик
export function metricsMiddleware(req, res, next) {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    httpRequestDuration
      .labels(req.method, req.route?.path || req.path, res.statusCode)
      .observe(duration);
  });
  
  next();
}

export { register };
```

Tasks:
- [ ] Настроить Prometheus metrics
- [ ] Добавить custom metrics (devices, files, uploads)
- [ ] Создать endpoint `/metrics`
- [ ] Настроить Prometheus server (опционально)

**3.1.2 Health check endpoints**

Файл: `src/routes/health.js`
```javascript
import express from 'express';
import { getDatabase } from '../database/database.js';
import fs from 'fs';

const router = express.Router();

// Простой health check
router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Детальный health check
router.get('/health/detailed', async (req, res) => {
  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    checks: {}
  };
  
  // Проверка БД
  try {
    const db = getDatabase();
    db.prepare('SELECT 1').get();
    health.checks.database = { status: 'ok' };
  } catch (err) {
    health.status = 'error';
    health.checks.database = { status: 'error', error: err.message };
  }
  
  // Проверка диска
  try {
    const stats = fs.statfsSync(DEVICES);
    const freePercent = (stats.bavail / stats.blocks) * 100;
    health.checks.disk = {
      status: freePercent > 10 ? 'ok' : 'warning',
      freePercent: freePercent.toFixed(2)
    };
  } catch (err) {
    health.checks.disk = { status: 'error', error: err.message };
  }
  
  res.status(health.status === 'ok' ? 200 : 503).json(health);
});

// Readiness probe (для Kubernetes)
router.get('/ready', async (req, res) => {
  try {
    const db = getDatabase();
    db.prepare('SELECT 1').get();
    res.status(200).send('Ready');
  } catch (err) {
    res.status(503).send('Not ready');
  }
});

// Liveness probe
router.get('/alive', (req, res) => {
  res.status(200).send('Alive');
});

export function createHealthRouter() {
  return router;
}
```

Tasks:
- [ ] Создать health check endpoints
- [ ] Добавить проверки (DB, disk, memory)
- [ ] Интегрировать с Kubernetes (если используется)

**Checkpoint 3.1:**
- [ ] Prometheus metrics работают
- [ ] Health checks доступны
- [ ] Мониторинг настроен

---

**ИТОГО ФАЗА 3:**
- [ ] Prometheus metrics ✅
- [ ] Health check endpoints ✅
- [ ] Dashboard для мониторинга ✅

**Время: 1 неделя**

---

## 🟢 ФАЗА 4: МАСШТАБИРОВАНИЕ (Ongoing)

### Долгосрочные улучшения:

**4.1 TypeScript Migration**
- [ ] Настроить TypeScript
- [ ] Создать типы для всех моделей
- [ ] Постепенная миграция модулей
- [ ] Строгая типизация

**4.2 GraphQL API**
- [ ] Установить Apollo Server
- [ ] Создать GraphQL схему
- [ ] Реализовать resolvers
- [ ] Миграция клиентов на GraphQL

**4.3 Distributed Caching**
- [ ] Интегрировать Redis
- [ ] Кэшировать frequently accessed data
- [ ] Session storage в Redis
- [ ] Pub/Sub для Socket.IO scaling

**4.4 Kubernetes Deployment**
- [ ] Создать Kubernetes манифесты
- [ ] Настроить Ingress
- [ ] Horizontal Pod Autoscaling
- [ ] Persistent Volumes для хранения

**4.5 Frontend Refactoring**
- [ ] Миграция на React/Vue
- [ ] State management (Zustand/Redux)
- [ ] Component library (Tailwind + Shadcn)
- [ ] TypeScript на фронтенде

---

## 📊 PROGRESS TRACKING

Используйте этот файл для отслеживания прогресса:

```bash
# Проверить прогресс
grep -c "\[x\]" ROADMAP.md
grep -c "\[ \]" ROADMAP.md

# Обновить статус
sed -i 's/\[ \] Task/[x] Task/' ROADMAP.md
```

---

## 🔄 WEEKLY REVIEW

Каждую неделю проводите review:

1. **Что сделано?** - Список завершенных задач
2. **Что в процессе?** - Текущие задачи
3. **Блокеры?** - Что мешает прогрессу
4. **Следующие шаги?** - План на следующую неделю

---

**Дата создания:** 11 ноября 2025  
**Версия:** 1.0  
**Статус:** 🔄 В работе

