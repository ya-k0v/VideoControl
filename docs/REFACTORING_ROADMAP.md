# 🔧 Roadmap рефакторинга VideoControl

## 📊 Текущее состояние

### Проблемные файлы:
- **server.js** → 1947 строк (монолит бэкенда)
- **admin.js** → 1094 строк (админ-панель)
- **player-videojs.js** → 1229 строк (плеер)
- **speaker.js** → 515 строк (панель спикера)

---

## 🎯 Цель рефакторинга

Разделить большие файлы на логические модули для:
- ✅ Улучшения читаемости кода
- ✅ Упрощения поддержки и отладки
- ✅ Возможности переиспользования компонентов
- ✅ Упрощения тестирования
- ✅ Ускорения разработки новых функций

---

## 📦 ФАЗА 1: Backend рефакторинг (server.js)

### 1.1 Создать структуру модулей

```
/vid/videocontrol/
├── server.js (точка входа, ~100 строк)
├── src/
│   ├── config/
│   │   ├── constants.js          # Константы, пути, лимиты
│   │   └── socket-config.js      # Конфигурация Socket.IO
│   ├── utils/
│   │   ├── sanitize.js           # sanitizeDeviceId, isSystemFile
│   │   ├── encoding.js           # fixEncoding
│   │   └── file-helpers.js       # findFileFolder, getPdfPageCount
│   ├── storage/
│   │   ├── devices-storage.js    # loadDevicesJson, saveDevicesJson, scan
│   │   └── filenames-storage.js  # loadFileNamesMap, saveFileNamesMap
│   ├── video/
│   │   ├── ffmpeg-wrapper.js     # checkVideoParameters, execAsync
│   │   ├── optimizer.js          # autoOptimizeVideo, needsOptimization
│   │   └── file-status.js        # fileStatuses Map, управление статусами
│   ├── converters/
│   │   ├── pdf-converter.js      # convertPdfToImages
│   │   └── pptx-converter.js     # convertPptxToImages
│   ├── routes/
│   │   ├── devices.js            # CRUD операции с устройствами
│   │   ├── files.js              # Управление файлами (upload, delete, rename)
│   │   ├── placeholder.js        # Заглушки (make-default, get placeholder)
│   │   ├── video-info.js         # Информация о видео (status, video-info, optimize)
│   │   └── conversion.js         # Конвертация (slides-count, converted)
│   ├── middleware/
│   │   ├── multer-config.js      # Настройка multer (storage, upload)
│   │   └── auth.js               # Basic Auth проверка
│   └── socket/
│       ├── connection-manager.js # activeConnections, deviceSockets
│       ├── device-handlers.js    # player/register, player/ping
│       └── control-handlers.js   # player/play, player/stop, player/pause
└── package.json
```

### 1.2 Порядок разделения (по приоритету)

#### Шаг 1: Config & Utils (~200 строк)
- [x] Вынести константы → `config/constants.js`
- [x] Вынести Socket.IO config → `config/socket-config.js`
- [x] Вынести утилиты → `utils/sanitize.js`, `utils/encoding.js`

#### Шаг 2: Storage (~300 строк)
- [x] Вынести работу с devices.json → `storage/devices-storage.js`
- [x] Вынести работу с file-names-map.json → `storage/filenames-storage.js`

#### Шаг 3: Video Processing (~500 строк)
- [x] Вынести FFmpeg обертки → `video/ffmpeg-wrapper.js`
- [x] Вынести оптимизацию → `video/optimizer.js`
- [x] Вынести fileStatuses → `video/file-status.js`

#### Шаг 4: Routes (~700 строк)
- [x] Разделить API эндпоинты на отдельные роутеры:
  - `/api/devices` → `routes/devices.js`
  - `/api/devices/:id/files` → `routes/files.js`
  - `/api/devices/:id/placeholder` → `routes/placeholder.js`
  - `/api/devices/:id/files/:name/*` → `routes/video-info.js`
  - `/api/devices/:id/converted` → `routes/conversion.js`

#### Шаг 5: Socket.IO (~200 строк)
- [x] Вынести управление соединениями → `socket/connection-manager.js`
- [x] Разделить обработчики событий:
  - Device lifecycle → `socket/device-handlers.js`
  - Player control → `socket/control-handlers.js`

### 1.3 Итоговый server.js (~100 строк)

```javascript
import express from 'express';
import http from 'http';
import { initSocketIO } from './src/config/socket-config.js';
import { loadConfig } from './src/config/constants.js';
import devicesRouter from './src/routes/devices.js';
import filesRouter from './src/routes/files.js';
// ... остальные импорты

const app = express();
const server = http.createServer(app);
const io = initSocketIO(server);

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Routes
app.use('/api/devices', devicesRouter);
app.use('/api/devices/:id/files', filesRouter);
// ... остальные роуты

// Socket.IO
import { setupSocketHandlers } from './src/socket/index.js';
setupSocketHandlers(io);

// Start server
server.listen(PORT, HOST);
```

---

## 🎨 ФАЗА 2: Frontend рефакторинг

### 2.1 Admin Panel (admin.js → модули)

```
/public/js/
├── admin.js (точка входа, ~150 строк)
├── admin/
│   ├── auth.js                # askLogin, ensureAuth, adminFetch, setXhrAuth
│   ├── socket-listeners.js    # Все socket.on обработчики
│   ├── devices-manager.js     # loadDevices, renderTVList, renderDeviceCard
│   ├── files-manager.js       # renderFilesPane, refreshFilesPanel
│   ├── upload-manager.js      # setupUploadUI, handleDragDrop
│   ├── file-actions.js        # Preview, Rename, Delete, MakeDefault
│   ├── device-crud.js         # Создание/удаление/переименование устройств
│   └── ui-helpers.js          # Вспомогательные UI функции, debounce
```

#### Разделение admin.js:

**Шаг 1: Auth & Network (~80 строк)**
- `askLogin()`, `ensureAuth()`, `adminFetch()`, `setXhrAuth()` → `admin/auth.js`

**Шаг 2: Socket обработчики (~150 строк)**
- Все `socket.on(...)` → `admin/socket-listeners.js`

**Шаг 3: Devices UI (~300 строк)**
- `loadDevices()`, `renderTVList()`, `renderDeviceCard()` → `admin/devices-manager.js`
- CRUD операции → `admin/device-crud.js`

**Шаг 4: Files UI (~400 строк)**
- `renderFilesPane()`, `refreshFilesPanel()` → `admin/files-manager.js`
- Upload UI + drag-and-drop → `admin/upload-manager.js`
- Preview, Delete, Rename, MakeDefault → `admin/file-actions.js`

**Шаг 5: Helpers (~100 строк)**
- `debounce()`, UI helpers → `admin/ui-helpers.js`

### 2.2 Player (player-videojs.js → модули)

```
/public/js/
├── player-videojs.js (точка входа, ~150 строк)
├── player/
│   ├── socket-connection.js   # Socket.IO подключение, reconnect логика
│   ├── videojs-setup.js       # Инициализация Video.js
│   ├── placeholder-manager.js # resolvePlaceholder, showPlaceholder
│   ├── content-player.js      # playMedia, stopMedia, pauseMedia
│   ├── pdf-viewer.js          # loadPage для PDF/PPTX
│   ├── socket-handlers.js     # Обработчики player/play, player/stop и т.д.
│   ├── video-events.js        # Video.js события (ended, error, playing и т.д.)
│   └── state-manager.js       # currentFileState, currentPageState
```

#### Разделение player-videojs.js:

**Шаг 1: Socket.IO (~200 строк)**
- `ensureSocketConnected()`, reconnect логика → `player/socket-connection.js`
- Все `socket.on(...)` обработчики → `player/socket-handlers.js`

**Шаг 2: Video.js Setup (~150 строк)**
- Инициализация `videojs(...)` → `player/videojs-setup.js`
- Все `vjsPlayer.on(...)` → `player/video-events.js`

**Шаг 3: Content Management (~400 строк)**
- Placeholder логика → `player/placeholder-manager.js`
- Media playback → `player/content-player.js`
- PDF/PPTX viewer → `player/pdf-viewer.js`

**Шаг 4: State (~100 строк)**
- `currentFileState`, управление состоянием → `player/state-manager.js`

### 2.3 Speaker Panel (speaker.js → модули)

```
/public/js/
├── speaker.js (точка входа, ~100 строк)
├── speaker/
│   ├── socket-listeners.js    # Socket.IO обработчики
│   ├── files-manager.js       # loadFiles, renderFiles
│   ├── player-controls.js     # play, preview, playNext, goToSlide
│   └── ui-helpers.js          # UI вспомогательные функции
```

#### Разделение speaker.js:

**Шаг 1: Socket (~100 строк)**
- `socket.on(...)` → `speaker/socket-listeners.js`

**Шаг 2: Files UI (~200 строк)**
- `loadFiles()`, render → `speaker/files-manager.js`

**Шаг 3: Controls (~150 строк)**
- Play, Preview, Next → `speaker/player-controls.js`

**Шаг 4: Helpers (~65 строк)**
- UI helpers → `speaker/ui-helpers.js`

---

## 🔄 ФАЗА 3: Общие модули (shared)

### 3.1 Создать shared модули

```
/public/js/shared/
├── socket-base.js         # Базовая логика Socket.IO (reconnect, ensureConnected)
├── api-client.js          # Обертка для fetch с error handling
├── file-utils.js          # Работа с файлами (resolution labels, extensions)
├── constants.js           # Общие константы (device icons, types)
└── dom-helpers.js         # DOM утилиты (debounce, createElement)
```

---

## 📋 План выполнения

### Этап 1: Backend (1-2 дня)
1. ✅ Создать структуру папок `src/`
2. ✅ Вынести config & utils
3. ✅ Разделить routes на отдельные файлы
4. ✅ Вынести video processing
5. ✅ Разделить Socket.IO handlers
6. ✅ Обновить `server.js` до точки входа
7. ✅ Тестирование всех эндпоинтов

### Этап 2: Admin Panel (1 день)
1. ✅ Создать структуру `public/js/admin/`
2. ✅ Вынести auth модуль
3. ✅ Разделить socket listeners
4. ✅ Разделить devices manager
5. ✅ Разделить files manager
6. ✅ Обновить `admin.js` до точки входа
7. ✅ Тестирование UI

### Этап 3: Player (1 день)
1. ✅ Создать структуру `public/js/player/`
2. ✅ Разделить socket connection
3. ✅ Разделить video.js setup
4. ✅ Разделить content managers
5. ✅ Обновить `player-videojs.js` до точки входа
6. ✅ Тестирование на устройствах

### Этап 4: Speaker Panel (0.5 дня)
1. ✅ Создать структуру `public/js/speaker/`
2. ✅ Разделить модули
3. ✅ Обновить `speaker.js`
4. ✅ Тестирование UI

### Этап 5: Shared & Cleanup (0.5 дня)
1. ✅ Создать shared модули
2. ✅ Удалить дублирование кода
3. ✅ Обновить imports
4. ✅ Финальное тестирование

---

## 🎯 Критерии успеха

### Backend
- ✅ `server.js` < 150 строк
- ✅ Каждый модуль < 300 строк
- ✅ Все тесты проходят
- ✅ API работает без изменений

### Frontend
- ✅ `admin.js` < 200 строк
- ✅ `player-videojs.js` < 200 строк
- ✅ `speaker.js` < 150 строк
- ✅ UI работает без изменений
- ✅ Нет ошибок в консоли

### Общее
- ✅ Код читается легче
- ✅ Модули переиспользуемые
- ✅ Упрощена отладка
- ✅ Документация обновлена

---

## ⚠️ Риски и меры предосторожности

### Риски:
1. **Поломка существующего функционала** → Тестировать после каждого шага
2. **Import/Export ошибки** → Использовать ES6 modules последовательно
3. **Circular dependencies** → Проектировать зависимости снизу вверх
4. **Performance регрессия** → Замерять время загрузки до/после

### Меры:
- ✅ Коммитить после каждого этапа
- ✅ Тестировать в dev окружении
- ✅ Откатываться при проблемах
- ✅ Документировать изменения

---

## 📝 Примечания

### Преимущества модульной структуры:
1. **Читаемость**: Каждый файл < 300 строк, легко понять
2. **Поддержка**: Быстро найти нужный код
3. **Тестирование**: Можно тестировать модули отдельно
4. **Переиспользование**: Shared модули в разных частях
5. **Командная работа**: Меньше конфликтов при merge

### Node.js особенности:
- Использовать ES6 modules (`import/export`)
- В `package.json` указать `"type": "module"`
- Все импорты с расширениями `.js`

### Frontend особенности:
- Использовать ES6 modules в браузере
- Добавить `type="module"` к `<script>` тегам
- Следить за порядком загрузки модулей

---

## 🚀 Начало работы

### 1. Создать ветку для рефакторинга:
```bash
git checkout -b refactor/modular-structure
```

### 2. Начать с Backend (Этап 1):
```bash
mkdir -p src/{config,utils,storage,video,converters,routes,middleware,socket}
```

### 3. Протестировать после каждого модуля:
```bash
npm test  # или вручную проверить эндпоинты
```

### 4. Коммитить часто:
```bash
git add . && git commit -m "refactor: extract config module"
```

---

**Статус**: 📋 **Roadmap готов к выполнению**

**Следующий шаг**: Начать с **ФАЗЫ 1, Шаг 1** (Config & Utils)

