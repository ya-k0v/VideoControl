# 📁 Структура проекта после рефакторинга

## 🌳 Полная структура

```
/vid/videocontrol/
│
├── 📄 package.json
├── 📄 server.js                          # 🎯 Точка входа (100 строк)
├── 📄 .gitignore
├── 📄 README.md
│
├── 📂 src/                               # ⚙️ Backend модули
│   │
│   ├── 📂 config/
│   │   ├── constants.js                  # Константы, пути, лимиты
│   │   └── socket-config.js              # Socket.IO конфигурация
│   │
│   ├── 📂 utils/
│   │   ├── sanitize.js                   # Валидация ID, фильтрация файлов
│   │   ├── encoding.js                   # Исправление кодировок
│   │   └── file-helpers.js               # Вспомогательные функции для файлов
│   │
│   ├── 📂 storage/
│   │   ├── devices-storage.js            # devices.json: load, save, scan
│   │   └── filenames-storage.js          # file-names-map.json: load, save
│   │
│   ├── 📂 video/
│   │   ├── ffmpeg-wrapper.js             # FFmpeg/FFprobe обертки
│   │   ├── optimizer.js                  # Оптимизация видео
│   │   └── file-status.js                # Управление статусами файлов
│   │
│   ├── 📂 converters/
│   │   ├── pdf-converter.js              # PDF → изображения
│   │   └── pptx-converter.js             # PPTX → изображения
│   │
│   ├── 📂 routes/
│   │   ├── devices.js                    # GET/POST/DELETE /api/devices
│   │   ├── files.js                      # Upload, rename, delete файлов
│   │   ├── placeholder.js                # Заглушки (make-default, get)
│   │   ├── video-info.js                 # Status, video-info, optimize
│   │   └── conversion.js                 # Slides-count, converted
│   │
│   ├── 📂 middleware/
│   │   ├── multer-config.js              # Multer storage & upload
│   │   └── auth.js                       # Basic Auth
│   │
│   └── 📂 socket/
│       ├── index.js                      # Общий setup handlers
│       ├── connection-manager.js         # Управление соединениями
│       ├── device-handlers.js            # player/register, player/ping
│       └── control-handlers.js           # player/play, stop, pause, etc.
│
├── 📂 public/                            # 🎨 Frontend
│   │
│   ├── 📄 index.html
│   ├── 📄 admin.html
│   ├── 📄 speaker.html
│   ├── 📄 player-videojs.html
│   │
│   ├── 📂 css/
│   │   ├── vars.css
│   │   ├── admin.css
│   │   ├── speaker.css
│   │   └── player.css
│   │
│   ├── 📂 js/
│   │   │
│   │   ├── 📄 admin.js                   # 🎯 Admin точка входа (150 строк)
│   │   ├── 📄 speaker.js                 # 🎯 Speaker точка входа (100 строк)
│   │   ├── 📄 player-videojs.js          # 🎯 Player точка входа (150 строк)
│   │   │
│   │   ├── 📂 admin/                     # Admin панель модули
│   │   │   ├── auth.js                   # Аутентификация
│   │   │   ├── socket-listeners.js       # Socket.IO обработчики
│   │   │   ├── devices-manager.js        # Управление устройствами
│   │   │   ├── files-manager.js          # Управление файлами
│   │   │   ├── upload-manager.js         # Upload + drag-and-drop
│   │   │   ├── file-actions.js           # Preview, Delete, Rename, etc.
│   │   │   ├── device-crud.js            # CRUD устройств
│   │   │   └── ui-helpers.js             # UI утилиты
│   │   │
│   │   ├── 📂 player/                    # Player модули
│   │   │   ├── socket-connection.js      # Socket.IO подключение
│   │   │   ├── videojs-setup.js          # Video.js инициализация
│   │   │   ├── placeholder-manager.js    # Заглушки
│   │   │   ├── content-player.js         # Воспроизведение медиа
│   │   │   ├── pdf-viewer.js             # PDF/PPTX просмотр
│   │   │   ├── socket-handlers.js        # Socket обработчики
│   │   │   ├── video-events.js           # Video.js события
│   │   │   └── state-manager.js          # Управление состоянием
│   │   │
│   │   ├── 📂 speaker/                   # Speaker панель модули
│   │   │   ├── socket-listeners.js       # Socket.IO обработчики
│   │   │   ├── files-manager.js          # Список файлов
│   │   │   ├── player-controls.js        # Управление плеером
│   │   │   └── ui-helpers.js             # UI утилиты
│   │   │
│   │   └── 📂 shared/                    # ♻️ Общие модули
│   │       ├── socket-base.js            # Базовая Socket.IO логика
│   │       ├── api-client.js             # Fetch обертка
│   │       ├── file-utils.js             # Работа с файлами
│   │       ├── constants.js              # Константы
│   │       └── dom-helpers.js            # DOM утилиты
│   │
│   └── 📂 content/                       # Файлы устройств
│       ├── ATV001/
│       ├── ATV002/
│       └── ...
│
├── 📂 nginx/
│   └── videocontrol.conf                 # Nginx конфигурация
│
├── 📂 clients/
│   ├── 📂 android-mediaplayer/           # Native Android приложение
│   └── 📂 vlc/                           # VLC плагин/скрипты
│
├── 📂 docs/                              # 📚 Документация
│   ├── INSTALL.md
│   ├── REFACTORING_ROADMAP.md            # 🔧 Этот roadmap
│   ├── PROJECT_STRUCTURE_AFTER_REFACTORING.md
│   ├── ANDROID.md
│   ├── VLC.md
│   └── STRUCTURE.md
│
├── 📂 scripts/                           # Утилиты
│   └── restart.sh
│
├── 📄 devices.json                       # Устройства
├── 📄 file-names-map.json                # Имена файлов
└── 📄 video-optimization.json            # Конфигурация оптимизации
```

---

## 📊 Сравнение: До и После

### ❌ До рефакторинга

```
server.js ────────────────── 1947 строк 🔴
admin.js ─────────────────── 1094 строк 🔴
player-videojs.js ────────── 1229 строк 🔴
speaker.js ───────────────── 515 строк 🟡
```

**Проблемы:**
- Монолитные файлы, сложно ориентироваться
- Дублирование кода (Socket.IO логика)
- Сложно тестировать
- Высокий порог входа для новых разработчиков

---

### ✅ После рефакторинга

#### Backend:
```
server.js ───────────────── ~100 строк ✅
src/config/ ────────────── ~150 строк ✅
src/utils/ ─────────────── ~200 строк ✅
src/storage/ ───────────── ~300 строк ✅
src/video/ ─────────────── ~500 строк ✅
src/converters/ ────────── ~150 строк ✅
src/routes/ ────────────── ~700 строк ✅
src/middleware/ ────────── ~100 строк ✅
src/socket/ ────────────── ~200 строк ✅
```

#### Frontend:
```
admin.js ───────────────── ~150 строк ✅
  admin/auth.js ──────────── ~80 строк ✅
  admin/socket-listeners.js ─ ~150 строк ✅
  admin/devices-manager.js ── ~200 строк ✅
  admin/files-manager.js ──── ~250 строк ✅
  admin/upload-manager.js ─── ~150 строк ✅
  admin/file-actions.js ───── ~150 строк ✅
  admin/device-crud.js ────── ~100 строк ✅

player-videojs.js ──────── ~150 строк ✅
  player/socket-connection.js ─ ~150 строк ✅
  player/videojs-setup.js ───── ~150 строк ✅
  player/placeholder-manager.js ─ ~200 строк ✅
  player/content-player.js ──── ~250 строк ✅
  player/pdf-viewer.js ──────── ~150 строк ✅
  player/socket-handlers.js ─── ~150 строк ✅
  player/video-events.js ────── ~150 строк ✅

speaker.js ─────────────── ~100 строк ✅
  speaker/socket-listeners.js ─ ~100 строк ✅
  speaker/files-manager.js ──── ~150 строк ✅
  speaker/player-controls.js ── ~100 строк ✅

shared/ ────────────────── ~300 строк ✅
```

**Преимущества:**
- ✅ Каждый модуль < 300 строк
- ✅ Логичная структура
- ✅ Легко найти нужный код
- ✅ Переиспользование через shared/
- ✅ Простое тестирование
- ✅ Параллельная разработка

---

## 🔄 Зависимости модулей

### Backend

```
server.js
  ↓
  ├─→ config/constants.js
  ├─→ config/socket-config.js
  │     ↓
  │     └─→ socket/index.js
  │           ↓
  │           ├─→ socket/connection-manager.js
  │           ├─→ socket/device-handlers.js
  │           └─→ socket/control-handlers.js
  │
  └─→ routes/*
        ↓
        ├─→ storage/devices-storage.js
        ├─→ storage/filenames-storage.js
        ├─→ video/optimizer.js
        │     ↓
        │     ├─→ video/ffmpeg-wrapper.js
        │     └─→ video/file-status.js
        ├─→ converters/pdf-converter.js
        ├─→ converters/pptx-converter.js
        └─→ utils/sanitize.js
```

### Frontend

```
admin.js
  ↓
  ├─→ shared/socket-base.js
  ├─→ shared/api-client.js
  ├─→ shared/constants.js
  ├─→ admin/auth.js
  │     ↓
  │     └─→ shared/api-client.js
  ├─→ admin/socket-listeners.js
  ├─→ admin/devices-manager.js
  │     ↓
  │     ├─→ shared/constants.js (icons)
  │     └─→ admin/ui-helpers.js
  ├─→ admin/files-manager.js
  │     ↓
  │     ├─→ shared/file-utils.js (resolutions)
  │     └─→ admin/file-actions.js
  └─→ admin/upload-manager.js

player-videojs.js
  ↓
  ├─→ shared/socket-base.js
  ├─→ player/socket-connection.js
  ├─→ player/videojs-setup.js
  ├─→ player/state-manager.js
  ├─→ player/placeholder-manager.js
  │     ↓
  │     └─→ shared/api-client.js
  ├─→ player/content-player.js
  │     ↓
  │     └─→ player/state-manager.js
  ├─→ player/pdf-viewer.js
  ├─→ player/socket-handlers.js
  └─→ player/video-events.js
```

---

## 📝 Примеры модулей

### Backend: `src/config/constants.js`

```javascript
import path from 'path';

export const ROOT = process.cwd();
export const PUBLIC = path.join(ROOT, 'public');
export const DEVICES = path.join(PUBLIC, 'content');
export const CONVERTED_CACHE = path.join(ROOT, '.converted');
export const NAMES_PATH = path.join(ROOT, 'devices.json');
export const FILE_NAMES_MAP_PATH = path.join(ROOT, 'file-names-map.json');

export const MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024; // 2GB
export const ALLOWED_EXT = /\.(mp4|webm|ogg|mkv|mov|avi|mp3|wav|m4a|png|jpg|jpeg|gif|webp|pdf|pptx)$/i;
```

### Backend: `src/routes/devices.js`

```javascript
import express from 'express';
import { loadDevicesJson, saveDevicesJson } from '../storage/devices-storage.js';

const router = express.Router();

// GET /api/devices
router.get('/', (req, res) => {
  const devices = loadDevicesJson();
  res.json({ devices });
});

// POST /api/devices
router.post('/', (req, res) => {
  const devices = loadDevicesJson();
  // ... логика создания
  saveDevicesJson(devices);
  res.json({ ok: true });
});

// DELETE /api/devices/:id
router.delete('/:id', (req, res) => {
  // ... логика удаления
});

export default router;
```

### Frontend: `public/js/shared/api-client.js`

```javascript
/**
 * Обертка для fetch с обработкой ошибок
 */
export async function apiFetch(url, options = {}) {
  try {
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      },
      ...options
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error(`[API] Ошибка запроса ${url}:`, error);
    throw error;
  }
}
```

### Frontend: `public/js/admin.js` (точка входа)

```javascript
import { initAuth } from './admin/auth.js';
import { setupSocketListeners } from './admin/socket-listeners.js';
import { initDevicesManager } from './admin/devices-manager.js';
import { initFilesManager } from './admin/files-manager.js';

// Инициализация
(async () => {
  // 1. Аутентификация
  await initAuth();
  
  // 2. Socket.IO
  const socket = io();
  setupSocketListeners(socket);
  
  // 3. UI менеджеры
  initDevicesManager(socket);
  initFilesManager(socket);
})();
```

---

## 🎯 Следующие шаги

1. **Изучить roadmap**: `/vid/videocontrol/docs/REFACTORING_ROADMAP.md`
2. **Создать ветку**: `git checkout -b refactor/modular-structure`
3. **Начать с Фазы 1**: Backend рефакторинг (config & utils)
4. **Тестировать**: После каждого модуля
5. **Коммитить**: Часто, с понятными сообщениями

---

**Дата создания**: 2025-11-08  
**Версия**: 1.0  
**Статус**: 📋 Готов к выполнению

