# 📝 VideoControl - Quick TODO List

> Краткий список задач для быстрого доступа. Полный roadmap: [ROADMAP.md](./ROADMAP.md)

---

## 🔴 КРИТИЧНЫЕ ЗАДАЧИ (P0) - Сделать СРОЧНО!

### 🔒 Безопасность (2-3 недели)

#### Week 1: Аутентификация
```bash
# Установка
npm install jsonwebtoken bcrypt passport passport-jwt express-validator

# Задачи
[ ] 1. Создать миграцию БД: users, refresh_tokens, audit_log
[ ] 2. Создать src/middleware/auth.js (JWT, requireAuth, requireRole)
[ ] 3. Создать src/routes/auth.js (login, register, refresh, logout)
[ ] 4. Создать src/models/user.js (User модель)
[ ] 5. Защитить все существующие routes (requireAuth, requireAdmin)
[ ] 6. Обновить документацию API
[ ] 7. Написать тесты для auth
```

**Checkpoint Week 1:**
- [ ] JWT работает
- [ ] Refresh token работает
- [ ] Все routes защищены
- [ ] Тесты написаны

#### Week 2: Path Traversal & Validation
```bash
# Установка
npm install express-rate-limit express-slow-down file-type

# Задачи
[ ] 1. Создать src/utils/path-validator.js (validatePath, safeReadFile, safeDelete)
[ ] 2. Обновить src/routes/files.js - использовать validatePath()
[ ] 3. Обновить src/routes/folders.js - использовать validatePath()
[ ] 4. Создать src/middleware/rate-limit.js (limiter для API/upload/auth)
[ ] 5. Создать src/middleware/file-validation.js (MIME type проверка)
[ ] 6. Добавить express-validator во все POST/PUT endpoints
[ ] 7. Написать тесты с malicious inputs
```

**Checkpoint Week 2:**
- [ ] Path traversal невозможен
- [ ] Rate limiting работает
- [ ] MIME type валидация работает
- [ ] Input validation на всех endpoints

#### Week 3: Logging & Audit
```bash
# Установка
npm install winston winston-daily-rotate-file

# Задачи
[ ] 1. Создать src/config/logger.js (Winston конфигурация)
[ ] 2. Создать src/middleware/audit.js (Audit middleware)
[ ] 3. Заменить все console.log на logger.info
[ ] 4. Заменить все console.error на logger.error
[ ] 5. Применить audit middleware на критические endpoints
[ ] 6. Создать API для просмотра audit logs (только admin)
[ ] 7. Настроить ротацию логов
```

**Checkpoint Week 3:**
- [ ] Winston logger работает
- [ ] Audit log пишется в БД и файлы
- [ ] Логи ротируются
- [ ] API для аудита доступен

---

## 🟠 ВАЖНЫЕ ЗАДАЧИ (P1) - Следующий приоритет

### 🧪 Тестирование (1-2 недели)

```bash
# Установка
npm install --save-dev jest supertest @types/jest

# Задачи
[ ] 1. Настроить Jest (jest.config.js)
[ ] 2. Написать unit tests для src/utils/ (100% coverage)
[ ] 3. Написать unit tests для src/middleware/ (100% coverage)
[ ] 4. Написать integration tests для src/routes/ (80% coverage)
[ ] 5. Написать tests для Socket.IO handlers
[ ] 6. Настроить coverage reporting (>= 70% total)
[ ] 7. Добавить npm scripts: test, test:watch, test:coverage
```

**Goal: Coverage >= 70%**

### 📏 Code Quality (3-4 дня)

```bash
# Установка
npm install --save-dev eslint prettier husky lint-staged
npm install --save-dev eslint-config-airbnb-base eslint-plugin-import

# Задачи
[ ] 1. Настроить ESLint (.eslintrc.json)
[ ] 2. Настроить Prettier (.prettierrc)
[ ] 3. Исправить все критические ESLint ошибки
[ ] 4. Отформатировать весь код через Prettier
[ ] 5. Настроить Husky pre-commit hooks
[ ] 6. Настроить lint-staged
[ ] 7. Добавить npm scripts: lint, format
```

### 🚀 CI/CD (4-5 дней)

```bash
# Задачи
[ ] 1. Создать .github/workflows/test.yml (автотесты)
[ ] 2. Настроить матрицу версий Node.js (18, 20)
[ ] 3. Интегрировать с Codecov
[ ] 4. Создать Dockerfile (multi-stage build)
[ ] 5. Создать docker-compose.yml
[ ] 6. Настроить GitHub Actions для Docker builds
[ ] 7. Добавить badges в README (tests, coverage)
```

---

## 🟡 ЖЕЛАТЕЛЬНЫЕ ЗАДАЧИ (P2) - Когда будет время

### 📊 Мониторинг (1 неделя)

```bash
# Установка
npm install prom-client

# Задачи
[ ] 1. Создать src/middleware/metrics.js (Prometheus metrics)
[ ] 2. Создать src/routes/health.js (health checks)
[ ] 3. Добавить custom metrics (devices, files, uploads)
[ ] 4. Создать endpoint /metrics
[ ] 5. Создать endpoints /health, /ready, /alive
[ ] 6. Настроить Prometheus server (опционально)
[ ] 7. Создать Grafana dashboard (опционально)
```

### 🐛 Bug Fixes & Improvements

```bash
# Задачи из ревью
[ ] 1. Заменить hardcoded константы на env vars
[ ] 2. Оптимизировать SQL запросы (SELECT только нужных полей)
[ ] 3. Убрать дублирование кода в фронтенде (shared modules)
[ ] 4. Добавить error boundaries на фронтенде
[ ] 5. Добавить retry логику для failed requests
[ ] 6. Оптимизировать размер bundle (code splitting)
```

---

## 🟢 BACKLOG (P3) - Долгосрочные планы

### TypeScript Migration
```bash
[ ] Настроить TypeScript
[ ] Создать типы для моделей
[ ] Постепенная миграция модулей
```

### Frontend Refactoring
```bash
[ ] Миграция на React/Vue
[ ] State management (Zustand/Redux)
[ ] Component library (Tailwind + Shadcn)
```

### Advanced Features
```bash
[ ] GraphQL API вместо REST
[ ] Redis для кэширования
[ ] Kubernetes deployment
[ ] Horizontal scaling
```

---

## 📅 SPRINT PLANNING

### Current Sprint: **Week 1 - Authentication** (11.11 - 18.11)

**Sprint Goal:** Внедрить JWT аутентификацию и защитить все API endpoints

**Tasks this week:**
1. [ ] Создать миграцию БД для users
2. [ ] Реализовать JWT middleware
3. [ ] Создать auth routes
4. [ ] Защитить существующие routes
5. [ ] Написать тесты

**Daily Standup Questions:**
- Что сделано вчера?
- Что планируется сегодня?
- Есть ли блокеры?

---

## 🎯 QUICK COMMANDS

```bash
# Статус выполнения
grep -c "\[x\]" TODO.md  # Сколько сделано
grep -c "\[ \]" TODO.md  # Сколько осталось

# Пометить задачу как выполненную
sed -i 's/\[ \] Task Name/[x] Task Name/' TODO.md

# Запустить тесты
npm test

# Проверить code quality
npm run lint
npm run format

# Собрать Docker образ
docker-compose build

# Запустить в dev режиме
npm start
```

---

## 📊 PROGRESS TRACKER

```
Фаза 1 (Безопасность):     [░░░░░░░░░░] 0% (0/30 tasks)
Фаза 2 (Качество кода):    [░░░░░░░░░░] 0% (0/25 tasks)
Фаза 3 (Мониторинг):       [░░░░░░░░░░] 0% (0/10 tasks)
Фаза 4 (Масштабирование):  [░░░░░░░░░░] 0% (0/15 tasks)

TOTAL:                     [░░░░░░░░░░] 0% (0/80 tasks)
```

**Обновляйте этот раздел каждую неделю!**

---

## 🚨 ВАЖНЫЕ НАПОМИНАНИЯ

### ⚠️ КРИТИЧНО - Сделать до production:
1. ❌ **Сменить дефолтный JWT_SECRET** в .env
2. ❌ **Сменить пароль admin пользователя**
3. ❌ **Настроить HTTPS/TLS**
4. ❌ **Настроить firewall rules**
5. ❌ **Включить rate limiting**
6. ❌ **Настроить backup БД**

### 📝 Не забыть:
- [ ] Обновить README после каждой фазы
- [ ] Документировать API изменения
- [ ] Писать changelog
- [ ] Делать git tags для releases

---

## 🔗 USEFUL LINKS

- **Full Roadmap:** [ROADMAP.md](./ROADMAP.md)
- **Code Review:** [docs/CODE_REVIEW.md](./docs/CODE_REVIEW.md)
- **API Docs:** [docs/API.md](./docs/API.md)
- **Installation:** [docs/INSTALL.md](./docs/INSTALL.md)

---

**Last Updated:** 11 ноября 2025  
**Current Sprint:** Week 1 - Authentication  
**Next Review:** 18 ноября 2025

