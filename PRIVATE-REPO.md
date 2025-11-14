# 🔒 Работа с приватным репозиторием

## 📊 Структура репозиториев:

### **Публичный (origin):**
- **URL:** https://github.com/ya-k0v/VideoControl
- **Доступ:** Все
- **Назначение:** Стабильные релизы, публичная документация

### **Приватный (private):**
- **URL:** https://github.com/ya-k0v/VideoControl-private
- **Доступ:** Только вы
- **Назначение:** Разработка, эксперименты, приватные фичи

---

## 🔧 Настройка (уже выполнено):

```bash
# Remote репозитории
git remote -v

# Должно быть:
# origin   git@github.com:ya-k0v/VideoControl.git
# private  git@github.com:ya-k0v/VideoControl-private.git
```

---

## 📝 Workflow - Как работать:

### **Вариант 1: Разработка в приватном → Релиз в публичный**

```bash
# 1. Создать feature ветку
git checkout dev
git checkout -b feature/new-awesome-feature

# 2. Разработка
git add .
git commit -m "Add awesome feature"

# 3. Пушить ТОЛЬКО в приватный репозиторий
git push private feature/new-awesome-feature

# 4. Когда готово - мержить в dev
git checkout dev
git merge feature/new-awesome-feature

# 5. Тестирование в приватном
git push private dev

# 6. Когда протестировано - релиз в публичный
git push origin dev
```

---

### **Вариант 2: Разные ветки для разработки**

```bash
# dev-private - только в приватном репо
git checkout -b dev-private
git push private dev-private

# dev - в обоих репозиториях
git checkout dev
git push origin dev
git push private dev

# Экспериментальные фичи
git checkout -b experimental
git push private experimental  # Только приватный!
```

---

### **Вариант 3: Sync стабильных веток**

```bash
# Автоматически пушить стабильные ветки в оба репо
git checkout dev
git push origin dev
git push private dev

# Или одной командой
git push origin dev && git push private dev

# Или настроить alias
git config alias.push-both '!git push origin && git push private'
git push-both dev
```

---

## 🚀 Основные команды:

### **Push в приватный:**
```bash
git push private <branch-name>
git push private --all          # Все ветки
git push private --tags         # Все теги
```

### **Push в публичный:**
```bash
git push origin <branch-name>
git push origin --all
git push origin --tags
```

### **Push в оба:**
```bash
git push origin dev && git push private dev
```

### **Fetch из приватного:**
```bash
git fetch private
git checkout -b feature-from-private private/feature-branch
```

### **Проверить что где:**
```bash
# Локальные ветки
git branch

# Удалённые ветки в origin
git branch -r | grep origin

# Удалённые ветки в private
git branch -r | grep private
```

---

## 🔐 Безопасность:

### **❌ НЕ коммитить в публичный:**
- Приватные API ключи
- Пароли и секреты
- Внутренние конфигурации
- Незавершённые эксперименты

### **✅ Коммитить в приватный:**
- Всё что угодно
- Экспериментальные фичи
- WIP коммиты
- Бэкапы конфигураций

### **✅ Коммитить в оба:**
- Стабильный код
- Публичная документация
- Релизы
- Bugfixes

---

## 📋 Рекомендуемый процесс:

### **Ежедневная разработка:**

```bash
# Утро - синхронизация
git checkout dev
git pull private dev

# Работа
git checkout -b feature/my-feature
# ... coding ...
git commit -am "WIP: My feature"

# Вечер - бэкап в приватный
git push private feature/my-feature
```

### **Релиз новой версии:**

```bash
# 1. Финализировать в dev (приватный)
git checkout dev
git merge feature/my-feature
git push private dev

# 2. Тестирование (тут можно делать hotfixes)
# ...

# 3. Обновить версию
npm version patch  # 2.6.3 → 2.6.4
git push private dev --tags

# 4. Когда готово - релиз в публичный
git push origin dev --tags

# 5. Создать GitHub Release (опционально)
gh release create v2.6.4 --title "v2.6.4" --notes "Release notes"
```

---

## 🔄 Синхронизация:

### **Если нужно синхронизировать приватный с публичным:**

```bash
# Забрать изменения из публичного
git fetch origin

# Мержить изменения
git checkout dev
git merge origin/dev

# Запушить в приватный
git push private dev
```

### **Автоматическая синхронизация (GitHub Actions):**

Можно настроить автоматический sync, но для приватного репо это не нужно - вы единственный разработчик.

---

## ⚠️ Предупреждения:

### **1. Случайный push в публичный:**

```bash
# ПЛОХО: Случайно запушили в origin
git push origin experimental  # Ой! Эта ветка должна быть приватной!

# Удалить ветку из публичного
git push origin --delete experimental

# Но если кто-то уже клонировал - поздно!
```

**Профилактика:**
```bash
# Установить дефолтный remote для веток
git config branch.experimental.remote private
git config branch.experimental.pushRemote private

# Теперь git push будет пушить в private
```

### **2. Конфликты при синхронизации:**

Если работаете на нескольких машинах:

```bash
# Всегда pull перед push
git pull private dev
git push private dev
```

---

## 📊 Мониторинг:

### **Где какие ветки:**

```bash
# Скрипт для проверки
cat > check-repos.sh << 'EOF'
#!/bin/bash
echo "=== ORIGIN (PUBLIC) ==="
git ls-remote --heads origin | awk '{print $2}' | sed 's|refs/heads/||'

echo ""
echo "=== PRIVATE ==="
git ls-remote --heads private | awk '{print $2}' | sed 's|refs/heads/||'

echo ""
echo "=== LOCAL ==="
git branch | sed 's/\*//'
EOF

chmod +x check-repos.sh
./check-repos.sh
```

---

## 🎯 Типичные сценарии:

### **Сценарий 1: Экспериментальная фича**

```bash
git checkout -b experiment/cool-idea
# ... coding ...
git push private experiment/cool-idea  # Только приватный

# Если удачно - мержим в dev
git checkout dev
git merge experiment/cool-idea
git push origin dev  # В публичный
git push private dev # В приватный
```

### **Сценарий 2: Hotfix для production**

```bash
git checkout main
git checkout -b hotfix/critical-bug
# ... fix ...
git commit -am "Fix critical bug"

# Тестируем в приватном
git push private hotfix/critical-bug

# Когда готово - в публичный
git checkout main
git merge hotfix/critical-bug
git push origin main
git push private main

# Мержим в dev тоже
git checkout dev
git merge main
git push origin dev
git push private dev
```

### **Сценарий 3: Бэкап конфигурации**

```bash
# Добавить приватную конфигурацию
echo "SECRET_KEY=xxx" > .env.private

# Добавить в .gitignore для origin
echo ".env.private" >> .gitignore
git add .gitignore
git commit -m "Ignore private env"
git push origin dev

# Но закоммитить в приватный (создать отдельный .gitignore)
git checkout -b config-backup
git reset HEAD .gitignore
git add .env.private
git commit -m "Backup private config"
git push private config-backup
```

---

## ✅ Checklist:

Настройка завершена:
- [x] Приватный репозиторий создан
- [x] Remote `private` добавлен
- [x] Все ветки и теги запушены
- [x] Документация создана

Рекомендуется:
- [ ] Создать `.github/workflows/` только в приватном
- [ ] Добавить коллабораторов (если нужно)
- [ ] Настроить branch protection rules
- [ ] Создать приватные issues/projects

---

## 📚 Дополнительно:

### **GitHub Settings для приватного репо:**

1. **Settings → Collaborators:** Добавить разработчиков (если нужно)
2. **Settings → Branches:** Защитить `main` и `dev`
3. **Settings → Actions:** Настроить CI/CD только в приватном
4. **Settings → Secrets:** Добавить приватные токены

### **Полезные команды:**

```bash
# Сменить URL remote
git remote set-url private git@github.com:ya-k0v/VideoControl-private.git

# Удалить remote
git remote remove private

# Переименовать remote
git remote rename private backup

# Проверить конфигурацию
git config --list | grep remote
```

---

**Приватный репозиторий готов к использованию! 🎉**

URL: https://github.com/ya-k0v/VideoControl-private

