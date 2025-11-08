# План реорганизации проекта

## 📊 ТЕКУЩАЯ ПРОБЛЕМА:

В корне проекта **23 MD файла** с отчетами:
- ADMIN_PANEL_FIXES.md
- ANDROID_APP_FIXES.md
- ANDROID_ICONS_APPLIED.md
- CONSOLE_ERRORS_EXPLAINED.md
- DRAG_AND_DROP_FIXES.md
- FINAL_COMPLETE_STATUS.md
- JS_CLEANUP_COMPLETE.md
- И еще 16 файлов...

**Проблема:** Корень захламлен, сложно найти важные файлы!

---

## 🎯 НОВАЯ СТРУКТУРА:

```
/vid/videocontrol/
├── README.md                    ✅ Главный README
├── package.json                 ✅ NPM конфиг
├── package-lock.json            ✅ NPM lock
├── server.js                    ✅ Точка входа
├── videocontrol.service         ✅ Systemd service
│
├── config/                      📁 НОВАЯ - Конфигурация
│   ├── devices.json
│   ├── file-names-map.json
│   └── video-optimization.json
│
├── docs/                        📁 Основная документация
│   ├── INSTALL.md
│   ├── ANDROID.md
│   ├── STRUCTURE.md
│   ├── REFACTORING_ROADMAP.md
│   ├── REFACTORING_CHECKLIST.md
│   ├── PROJECT_STRUCTURE_AFTER_REFACTORING.md
│   │
│   ├── reports/                 📁 НОВАЯ - Отчеты рефакторинга
│   │   ├── backend/
│   │   │   └── BACKEND_REFACTORING_COMPLETE.md
│   │   ├── frontend/
│   │   │   ├── ADMIN_PANEL_FIXES.md
│   │   │   ├── ADMIN_REFACTORING_COMPLETE.md
│   │   │   ├── JS_CLEANUP_COMPLETE.md
│   │   │   ├── JS_CODE_AUDIT_REPORT.md
│   │   │   └── JS_FINAL_AUDIT.md
│   │   ├── android/
│   │   │   ├── ANDROID_APP_FIXES.md
│   │   │   ├── ANDROID_ICONS_APPLIED.md
│   │   │   ├── ANDROID_IMAGE_BUFFERING_EXPLAINED.md
│   │   │   └── ANDROID_PLACEHOLDER_CONTROL_FIX.md
│   │   └── fixes/
│   │       ├── DRAG_AND_DROP_FIXES.md
│   │       ├── CONSOLE_ERRORS_EXPLAINED.md
│   │       ├── COMPATIBILITY_REPORT.md
│   │       └── FIXES_SUMMARY.md
│   │
│   └── status/                  📁 НОВАЯ - Статусы
│       ├── FINAL_COMPLETE_STATUS.md
│       ├── FINAL_SUMMARY.md
│       ├── VERIFICATION_COMPLETE.md
│       └── REFACTORING_REALITY.md
│
├── src/                         ✅ Backend модули (уже OK)
│   ├── config/
│   ├── converters/
│   ├── middleware/
│   ├── routes/
│   ├── socket/
│   ├── storage/
│   ├── utils/
│   └── video/
│
├── public/                      ✅ Frontend (уже OK)
│   ├── js/
│   │   ├── admin/
│   │   └── shared/
│   ├── css/
│   ├── vendor/
│   └── content/
│
├── scripts/                     ✅ Скрипты (уже OK)
│   ├── install-server.sh
│   ├── install-vlc-client.sh
│   └── setup-kiosk.sh
│
├── clients/                     ✅ Клиенты (уже OK)
│   ├── android-mediaplayer/
│   └── vlc/
│
├── nginx/                       ✅ NGINX (уже OK)
│   └── install-nginx.sh
│
└── archive/                     📁 НОВАЯ - Архивы
    └── videocontrol-20251101.tar.gz
```

---

## 🔧 ДЕЙСТВИЯ:

### 1. Создать новые папки:
- `config/`
- `docs/reports/backend/`
- `docs/reports/frontend/`
- `docs/reports/android/`
- `docs/reports/fixes/`
- `docs/status/`
- `archive/`

### 2. Переместить конфигурации:
- `devices.json` → `config/`
- `file-names-map.json` → `config/`
- `video-optimization.json` → `config/`

### 3. Переместить отчеты backend:
- `BACKEND_REFACTORING_COMPLETE.md` → `docs/reports/backend/`

### 4. Переместить отчеты frontend:
- `ADMIN_PANEL_FIXES.md` → `docs/reports/frontend/`
- `ADMIN_REFACTORING_*.md` → `docs/reports/frontend/`
- `JS_*.md` → `docs/reports/frontend/`

### 5. Переместить отчеты Android:
- `ANDROID_*.md` → `docs/reports/android/`

### 6. Переместить отчеты фиксов:
- `DRAG_AND_DROP_FIXES.md` → `docs/reports/fixes/`
- `CONSOLE_ERRORS_EXPLAINED.md` → `docs/reports/fixes/`
- `COMPATIBILITY_REPORT.md` → `docs/reports/fixes/`
- `FIXES_SUMMARY.md` → `docs/reports/fixes/`

### 7. Переместить статусы:
- `FINAL_*.md` → `docs/status/`
- `VERIFICATION_COMPLETE.md` → `docs/status/`
- `REFACTORING_REALITY.md` → `docs/status/`

### 8. Переместить архивы:
- `videocontrol-20251101.tar.gz` → `archive/`
- Старые `.txt` файлы → `archive/`

### 9. Обновить пути в коде:
- `src/storage/devices-storage.js` → devices.json path
- `src/storage/filenames-storage.js` → file-names-map.json path
- `src/video/optimizer.js` → video-optimization.json path

---

## ✅ РЕЗУЛЬТАТ:

**Корень проекта:**
- README.md
- package.json
- package-lock.json
- server.js
- videocontrol.service
- icon.svg

**Все остальное в логичных папках!**

Чисто, организованно, профессионально! 🎯
