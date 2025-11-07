import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import fs from 'fs';
import path from 'path';
import mime from 'mime';
import multer from 'multer';
import crypto from 'crypto';
import util from "util";
import { fromPath } from "pdf2pic";
import { exec as execCallback, spawn } from "child_process";
import { PDFDocument } from 'pdf-lib';

const execAsync = util.promisify(execCallback);

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const ROOT = process.cwd();

function sanitizeDeviceId(id){
  if(!id) return null;
  if(typeof id !== 'string') return null;
  const m = id.match(/^[A-Za-z0-9_-]+$/);
  return m ? id : null;
}

// Проверка является ли файл системным/временным (не показывать пользователям)
function isSystemFile(fileName) {
  // Исключаем:
  // - default.* (заглушки)
  // - .optimizing_* (временные файлы оптимизации)
  // - .tmp_default_* (временные файлы при смене заглушки)
  // - любые файлы начинающиеся с точки
  return /^default\.(mp4|webm|ogg|mkv|mov|avi|mp3|wav|m4a|png|jpg|jpeg|gif|webp|pdf|pptx)$/i.test(fileName) ||
         /^\.optimizing_/i.test(fileName) ||
         /^\.tmp_default_/i.test(fileName) ||
         /^\.original_/i.test(fileName) ||
         fileName.startsWith('.');
}

const PUBLIC = path.join(ROOT, 'public');
const DEVICES = path.join(PUBLIC, 'content');
const NAMES_PATH = path.join(ROOT, 'devices.json');
const CONVERTED_CACHE = path.join(ROOT, '.converted');

if (!fs.existsSync(CONVERTED_CACHE)) fs.mkdirSync(CONVERTED_CACHE, { recursive: true });

const MAX_FILE_SIZE = 1024 * 1024 * 1024;
const ALLOWED_EXT = /\.(mp4|webm|ogg|mkv|mov|avi|mp3|wav|m4a|png|jpg|jpeg|gif|webp|pdf|pptx)$/i;

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const id = sanitizeDeviceId(req.params.id);
    if (!id) return cb(new Error('invalid device id'));
    const d = devices[id];
    if (!d) return cb(new Error('device not found'));
    const folder = path.join(DEVICES, d.folder);
    if (!fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true });
    cb(null, folder);
  },
  filename: (req, file, cb) => {
    if (file.originalname.toLowerCase() === 'default.mp4') {
      return cb(new Error('reserved filename'));
    }
    const id = sanitizeDeviceId(req.params.id);
    if (!id || !devices[id]) return cb(new Error('device not found'));
    
    let originalName = file.originalname;
    try {
      if (Buffer.isBuffer(originalName)) {
        originalName = originalName.toString('utf-8');
      } else if (typeof originalName === 'string') {
        const fixed = fixEncoding(originalName);
        if (fixed !== originalName) originalName = fixed;
      }
    } catch {}
    
    const base = path.basename(originalName);
    req.originalFileNames = req.originalFileNames || new Map();
    const safe = base.replace(/[^\w.\- ()\[\]]+/g, '_');
    const folder = path.join(DEVICES, devices[id].folder);
    const dest = path.join(folder, safe);
    
    let finalSafeName = safe;
    if (fs.existsSync(dest)) {
      const ext = path.extname(safe);
      const name = path.basename(safe, ext);
      const suffix = '-' + crypto.randomBytes(3).toString('hex');
      finalSafeName = `${name}${suffix}${ext}`;
    }
    
    req.originalFileNames.set(finalSafeName, base);
    cb(null, finalSafeName);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_EXT.test(file.originalname)) return cb(new Error('unsupported type'));
    cb(null, true);
  }
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use((req, res, next) => {
  const originalJson = res.json.bind(res);
  res.json = function(data) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return originalJson(data);
  };
  next();
});
app.use((req, res, next) => {
  try { console.log(new Date().toISOString(), req.method, req.url); } catch(e) {}
  next();
});

app.use(express.static(PUBLIC));
app.use('/devices.json', express.static(path.join(ROOT, 'devices.json')));
app.use('/content', express.static(DEVICES, {
  extensions: ['.mp4', '.webm', '.ogg', '.jpg', '.jpeg', '.png', '.gif', '.pdf'],
  setHeaders: (res, filePath) => {
    const type = mime.getType(filePath) || 'application/octet-stream';
    res.setHeader('Content-Type', type);
    
    const isVideo = /\.(mp4|webm|ogg|mkv|mov|avi)$/i.test(filePath);
    if (isVideo) {
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=3600');
    }
    
    const fileName = path.basename(filePath);
    if (/^default\.(mp4|webm|ogg|mkv|mov|avi|mp3|wav|m4a|png|jpg|jpeg|gif|webp)$/i.test(fileName)) {
      // КРИТИЧНО: НЕ кэшируем default.* файлы (могут меняться через админ панель)
      // no-cache заставляет браузер проверять актуальность при каждом запросе
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.setHeader('Accept-Ranges', 'bytes');
    } else if (!isVideo) {
      res.setHeader('Cache-Control', 'public, max-age=86400');
    }
    
    if (filePath.toLowerCase().endsWith && filePath.toLowerCase().endsWith('.pdf')) {
      try { res.setHeader('Content-Disposition', 'inline'); } catch(e) {}
    }
  }
}));



if (!fs.existsSync(DEVICES)) fs.mkdirSync(DEVICES, { recursive: true });

let devices = {};
let savedNames = {};
const FILE_NAMES_MAP_PATH = path.join(ROOT, 'file-names-map.json');
let fileNamesMap = loadFileNamesMap();

function loadDevicesJson() {
  try {
    const raw = fs.readFileSync(NAMES_PATH, 'utf-8');
    const parsed = JSON.parse(raw || '{}');
    if (parsed && typeof parsed === 'object') return parsed;
  } catch {}
  return {};
}

function fixEncoding(str) {
  if (!str || typeof str !== 'string') return str;
  if (/[а-яё]/i.test(str)) return str;
  
  const doubleEncodedPattern = /Ð[ÑÐµÐ·Ð½ÑÐ°ÑÐ¸Ð¼Ð¸Ð´Ð¾Ñ]/;
  if (doubleEncodedPattern.test(str)) {
    try {
      const step1 = Buffer.from(str, 'latin1');
      const decoded = step1.toString('utf-8');
      if (/[а-яё]/i.test(decoded) && decoded.length > 0 && decoded.length <= str.length * 2) {
        return decoded;
      }
    } catch {}
  }
  
  try {
    const decoded = Buffer.from(str, 'latin1').toString('utf-8');
    if (/[а-яё]/i.test(decoded) && decoded.length > 0 && decoded.length <= str.length * 2) {
      return decoded;
    }
  } catch {}
  
  if (str.includes('%')) {
    try {
      const decoded = decodeURIComponent(str);
      if (/[а-яё]/i.test(decoded)) return decoded;
    } catch {}
  }
  
  return str;
}

function loadFileNamesMap() {
  try {
    if (!fs.existsSync(FILE_NAMES_MAP_PATH)) return {};
    const raw = fs.readFileSync(FILE_NAMES_MAP_PATH, 'utf-8');
    const parsed = JSON.parse(raw || '{}');
    if (parsed && typeof parsed === 'object') {
      const fixed = {};
      for (const [deviceId, fileMap] of Object.entries(parsed)) {
        if (fileMap && typeof fileMap === 'object') {
          fixed[deviceId] = {};
          for (const [safeName, originalName] of Object.entries(fileMap)) {
            fixed[deviceId][safeName] = fixEncoding(originalName);
          }
        }
      }
      let needsSave = false;
      for (const [deviceId, fileMap] of Object.entries(parsed)) {
        if (fileMap && typeof fileMap === 'object') {
          for (const [safeName, originalName] of Object.entries(fileMap)) {
            if (fixEncoding(originalName) !== originalName) {
              needsSave = true;
              break;
            }
          }
          if (needsSave) break;
        }
      }
      if (needsSave) {
        fileNamesMap = fixed;
        saveFileNamesMap();
      }
      return fixed;
    }
  } catch {}
  return {};
}

function saveFileNamesMap() {
  try {
    fs.writeFileSync(FILE_NAMES_MAP_PATH, JSON.stringify(fileNamesMap, null, 2), 'utf-8');
    console.log(`[FileNamesMap] ✅ Сохранено в ${FILE_NAMES_MAP_PATH}`);
  } catch (e) {
    console.error(`[FileNamesMap] ❌ Ошибка сохранения: ${e}`);
  }
}

function scan() {
  // load saved names before scanning folders so we can apply them
  savedNames = loadDevicesJson();
  fileNamesMap = loadFileNamesMap();
  const dirs = fs.readdirSync(DEVICES).filter(d => fs.statSync(path.join(DEVICES, d)).isDirectory());
  
  // КРИТИЧНО: Очистка временных файлов оптимизации при запуске сервера
  console.log('[Cleanup] 🧹 Очистка временных файлов...');
  for (const d of dirs) {
    const folder = path.join(DEVICES, d);
    try {
      const entries = fs.readdirSync(folder);
      for (const entry of entries) {
        // Удаляем все временные файлы оптимизации и смены заглушки
        if (/^\.optimizing_/i.test(entry) || /^\.tmp_default_/i.test(entry)) {
          const tmpFile = path.join(folder, entry);
          try {
            fs.unlinkSync(tmpFile);
            console.log(`[Cleanup] 🗑️ Удален временный файл: ${entry}`);
          } catch (e) {
            console.warn(`[Cleanup] ⚠️ Не удалось удалить ${entry}: ${e.message}`);
          }
        }
      }
    } catch (e) {
      console.warn(`[Cleanup] ⚠️ Ошибка очистки папки ${d}: ${e.message}`);
    }
  }
  console.log('[Cleanup] ✅ Очистка завершена');
  
  for (const d of dirs) {
    const id = d;
    const folder = path.join(DEVICES, d);
    
    // Scan files (including PDF/PPTX folders shown as files)
    const result = [];
    const fileNames = [];
    if (fs.existsSync(folder)) {
      const entries = fs.readdirSync(folder);
      for (const entry of entries) {
        const entryPath = path.join(folder, entry);
        const stat = fs.statSync(entryPath);
        
        if (stat.isFile()) {
          // Пропускаем системные файлы (default.*, .optimizing_*, .tmp_*, etc.)
          if (!isSystemFile(entry)) {
            result.push(entry);
            // Используем оригинальное имя если есть маппинг
            const originalName = fileNamesMap[id]?.[entry] || entry;
            fileNames.push(originalName);
          }
        } else if (stat.isDirectory()) {
          const folderContents = fs.readdirSync(entryPath);
          const originalFile = folderContents.find(f => /\.(pdf|pptx)$/i.test(f));
          if (originalFile) {
            result.push(originalFile);
            // Для PDF/PPTX используем имя папки или оригинальное имя
            const originalName = fileNamesMap[id]?.[entry] || originalFile;
            fileNames.push(originalName);
          }
        }
      }
    }
    
    const name = savedNames[id] || id;
    devices[id] ??= { name, folder: d, files: result, fileNames: fileNames, current: { type: 'idle', file: null, state: 'idle' } };
    // keep name if already exists, but prefer saved value when present
    if (savedNames[id]) devices[id].name = savedNames[id];
    devices[id].files = result;
    devices[id].fileNames = fileNames;
  }
}
scan();

// persist id->name mapping to devices.json at project root
function saveDevicesJson() {
  try {
    const mapping = Object.fromEntries(Object.entries(devices).map(([id, d]) => [id, d.name || id]));
    fs.writeFileSync(NAMES_PATH, JSON.stringify(mapping, null, 2));
  } catch (e) {
    try { console.warn('Failed to write devices.json', e); } catch {}
  }
}
// initial write
saveDevicesJson();

app.post('/api/devices/:id/upload', async (req, res, next) => {
  const id = sanitizeDeviceId(req.params.id); if(!id) return res.status(400).json({ error: 'invalid device id' });
  if (!devices[id]) return res.status(404).json({ error: 'device not found' });
  upload.array('files', 50)(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });
    
    const uploaded = (req.files || []).map(f => f.filename);
    
    // КРИТИЧНО: Устанавливаем права 644 на все загруженные файлы
    // Чтобы Nginx (www-data) мог их прочитать
    const folder = path.join(DEVICES, devices[id].folder);
    for (const file of (req.files || [])) {
      try {
        const filePath = path.join(folder, file.filename);
        fs.chmodSync(filePath, 0o644);
        console.log(`[upload] ✅ Права 644 установлены: ${file.filename}`);
      } catch (e) {
        console.warn(`[upload] ⚠️ Не удалось установить права на ${file.filename}: ${e}`);
      }
    }
    
    if (req.originalFileNames && req.originalFileNames.size > 0) {
      if (!fileNamesMap[id]) fileNamesMap[id] = {};
      for (const [safeName, originalName] of req.originalFileNames) {
        fileNamesMap[id][safeName] = originalName;
      }
      saveFileNamesMap();
    }
    
    for (const fileName of uploaded) {
      const ext = path.extname(fileName).toLowerCase();
      if (ext === '.pdf' || ext === '.pptx') {
        autoConvertFile(id, fileName).catch(() => {});
      }
      // НОВОЕ: Автоматическая оптимизация видео
      else if (['.mp4', '.webm', '.ogg', '.mkv', '.mov', '.avi'].includes(ext)) {
        // Оптимизация в фоне, не блокирует ответ
        autoOptimizeVideo(id, fileName).then(result => {
          if (result.success) {
            console.log(`[upload] 🎬 Видео обработано: ${fileName} (optimized=${result.optimized})`);
            // Отправляем событие клиентам об обновлении
            io.emit('devices/updated');
          }
        }).catch(err => {
          console.error(`[upload] ❌ Ошибка оптимизации ${fileName}:`, err);
        });
      }
    }
    
    // folder уже определен выше
    const result = [];
    const fileNames = [];
    if (fs.existsSync(folder)) {
      const entries = fs.readdirSync(folder);
      for (const entry of entries) {
        const entryPath = path.join(folder, entry);
        const stat = fs.statSync(entryPath);
        
        if (stat.isFile()) {
          // Пропускаем системные файлы (default.*, .optimizing_*, .tmp_*, etc.)
          if (!isSystemFile(entry)) {
            result.push(entry);
            const originalName = fileNamesMap[id]?.[entry] || entry;
            fileNames.push(originalName);
          }
        } else if (stat.isDirectory()) {
          const folderContents = fs.readdirSync(entryPath);
          const originalFile = folderContents.find(f => /\.(pdf|pptx)$/i.test(f));
          if (originalFile) {
            result.push(originalFile);
            const originalName = fileNamesMap[id]?.[entry] || originalFile;
            fileNames.push(originalName);
          }
        }
      }
    }
    
    devices[id].files = result;
    devices[id].fileNames = fileNames;
    io.emit('devices/updated');
    res.json({ ok: true, files: result, uploaded });
  });
});

app.post('/api/devices/:id/make-default', (req, res) => {
  const id = sanitizeDeviceId(req.params.id); if(!id) return res.status(400).json({ error: 'invalid device id' });
  const { file } = req.body || {};
  const d = devices[id];
  if (!d) return res.status(404).json({ error: 'device not found' });
  if (!file || typeof file !== 'string') return res.status(400).json({ error: 'file required' });
  const ext = (path.extname(file) || '').toLowerCase();
  if (!ALLOWED_EXT.test(ext)) return res.status(400).json({ error: 'unsupported type' });
  if (ext === '.pdf' || ext === '.pptx') return res.status(400).json({ error: 'pdf_pptx_not_allowed_as_placeholder' });

  const folder = path.join(DEVICES, d.folder);
  const folderName = file.replace(/\.(pdf|pptx)$/i, '');
  const possibleFolder = path.join(folder, folderName);
  let src = path.join(folder, file);
  
  if (fs.existsSync(possibleFolder) && fs.statSync(possibleFolder).isDirectory()) {
    const folderFile = path.join(possibleFolder, file);
    if (fs.existsSync(folderFile)) src = folderFile;
  }
  
  const dst = path.join(folder, `default${ext}`);
  if (!src.startsWith(DEVICES) || !dst.startsWith(DEVICES)) return res.status(403).json({ error: 'forbidden' });
  if (!fs.existsSync(src)) return res.status(404).json({ error: 'source not found' });

  // КРИТИЧНО: Если src уже является default.*, то просто возвращаем success
  // Избегаем удаления файла, который пытаемся скопировать
  if (path.basename(src).match(/^default\.(mp4|webm|ogg|mkv|mov|avi|mp3|wav|m4a|png|jpg|jpeg|gif|webp)$/i)) {
    return res.json({ success: true, message: 'Already default file' });
  }

  // АТОМАРНАЯ ОПЕРАЦИЯ: Копируем сначала во временный файл, затем переименовываем
  // Это предотвращает race condition когда клиенты запрашивают файл между удалением и копированием
  const tmpPath = path.join(folder, `.tmp_default_${Date.now()}${ext}`);
  
  try {
    // Шаг 1: Копируем в временный файл
    console.log(`[make-default] 📝 Копирование в временный файл: ${tmpPath}`);
    fs.copyFileSync(src, tmpPath);
    
    // Устанавливаем права сразу на временный файл
    try {
      fs.chmodSync(tmpPath, 0o644);
      console.log(`[make-default] ✅ Права 644 установлены на временный файл`);
    } catch (e) {
      console.warn(`[make-default] ⚠️ Не удалось установить права на временный файл: ${e}`);
    }
    
    // Проверяем что временный файл доступен для чтения
    try {
      fs.accessSync(tmpPath, fs.constants.R_OK);
      const tmpStats = fs.statSync(tmpPath);
      console.log(`[make-default] ✅ Временный файл готов, размер: ${tmpStats.size} bytes`);
      
      // Проверяем что размер совпадает с источником
      const srcStats = fs.statSync(src);
      if (tmpStats.size !== srcStats.size) {
        throw new Error(`Size mismatch: src=${srcStats.size}, tmp=${tmpStats.size}`);
      }
    } catch (e) {
      console.error(`[make-default] ❌ Ошибка проверки временного файла: ${e}`);
      try { fs.unlinkSync(tmpPath); } catch {}
      return res.status(500).json({ error: 'temporary file validation failed', detail: String(e) });
    }
    
    // Шаг 2: Удаляем существующие default.* файлы (кроме src)
    console.log(`[make-default] 🗑️ Удаление старых заглушек...`);
    try {
      const existing = fs.readdirSync(folder);
      for (const f of existing) {
        if (/^default\.(mp4|webm|ogg|mkv|mov|avi|mp3|wav|m4a|png|jpg|jpeg|gif|webp|pdf|pptx)$/i.test(f)) {
          const fullPath = path.join(folder, f);
          // НЕ удаляем исходный файл если он default.*
          if (fullPath !== src) {
            try { 
              fs.unlinkSync(fullPath);
              console.log(`[make-default] 🗑️ Удален: ${f}`);
            } catch {}
          }
        }
      }
    } catch (e) {
      console.warn(`[make-default] ⚠️ Ошибка удаления старых заглушек: ${e}`);
    }
    
    // Шаг 3: АТОМАРНОЕ переименование временного файла → default.*
    // Это гарантирует что файл либо существует полностью, либо не существует вообще
    console.log(`[make-default] 🔄 Атомарное переименование: ${path.basename(tmpPath)} → ${path.basename(dst)}`);
    fs.renameSync(tmpPath, dst);
    
    // Финальная проверка
    try {
      fs.accessSync(dst, fs.constants.R_OK);
      const finalStats = fs.statSync(dst);
      console.log(`[make-default] ✅ Заглушка установлена успешно! Размер: ${finalStats.size} bytes`);
      console.log(`[make-default] 📍 Путь: ${dst}`);
    } catch (e) {
      console.error(`[make-default] ❌ Финальная проверка не пройдена: ${e}`);
      return res.status(500).json({ error: 'final validation failed', detail: String(e) });
    }
    
  } catch (e) {
    console.error(`[make-default] ❌ Ошибка атомарного копирования: ${e}`);
    // Очищаем временный файл в случае ошибки
    try { 
      if (fs.existsSync(tmpPath)) {
        fs.unlinkSync(tmpPath);
        console.log(`[make-default] 🧹 Временный файл удален после ошибки`);
      }
    } catch {}
    return res.status(500).json({ error: 'atomic copy failed', detail: String(e) });
  }

  const result = [];
  if (fs.existsSync(folder)) {
    const entries = fs.readdirSync(folder);
    for (const entry of entries) {
      const entryPath = path.join(folder, entry);
      const stat = fs.statSync(entryPath);
      
      if (stat.isFile()) {
        // Пропускаем системные файлы (default.*, .optimizing_*, .tmp_*, etc.)
        if (!isSystemFile(entry)) {
          result.push(entry);
        }
      } else if (stat.isDirectory()) {
        const folderContents = fs.readdirSync(entryPath);
        const originalFile = folderContents.find(f => /\.(pdf|pptx)$/i.test(f));
        if (originalFile) result.push(originalFile);
      }
    }
  }
  d.files = result;

  io.emit('devices/updated');
  io.to(`device:${id}`).emit('player/stop');
  
  // КРИТИЧНО: Увеличенная задержка + проверка готовности файла
  // Даем файловой системе, Nginx и клиентскому кэшу время синхронизироваться
  console.log(`[make-default] ⏳ Ожидание синхронизации перед отправкой событий...`);
  
  // Возвращаем успешный ответ клиенту немедленно
  res.json({ ok: true, default: path.basename(dst) });
  
  // Асинхронно проверяем готовность и отправляем события
  setTimeout(async () => {
    try {
      // Финальная проверка что файл всё ещё доступен и не поврежден
      const finalCheck = fs.statSync(dst);
      if (finalCheck.size === 0) {
        console.error(`[make-default] ❌ Файл пустой (0 bytes), отменяем отправку событий`);
        return;
      }
      
      // Проверяем что файл читаемый
      fs.accessSync(dst, fs.constants.R_OK);
      
      console.log(`[make-default] ✅ Финальная проверка OK: ${finalCheck.size} bytes`);
      
      // Отправляем события клиентам
      io.to(`device:${id}`).emit('placeholder/refresh');
      io.emit('preview/refresh', { device_id: id });
      console.log(`[make-default] 📡 События placeholder/refresh отправлены для ${id}`);
      
    } catch (e) {
      console.error(`[make-default] ❌ Финальная проверка не пройдена, события НЕ отправлены: ${e}`);
    }
  }, 1500); // Увеличено с 500ms до 1500ms для гарантии синхронизации
  
  return; // res.json уже вызван выше
});

app.post('/api/devices/:id/files/:name/rename', express.json(), (req, res) => {
  const id = sanitizeDeviceId(req.params.id); 
  if(!id) return res.status(400).json({ error: 'invalid device id' });
  
  const oldName = req.params.name;
  const { newName } = req.body;
  
  if (!newName || typeof newName !== 'string' || newName.trim() === '') {
    return res.status(400).json({ error: 'invalid new name' });
  }
  
  const d = devices[id];
  if (!d) return res.status(404).json({ error: 'device not found' });
  if (/^default\./i.test(oldName)) return res.status(403).json({ error: 'cannot rename default file' });
  
  const deviceFolder = path.join(DEVICES, d.folder);
  const oldPath = path.join(deviceFolder, oldName);
  const ext = path.extname(oldName);
  const newNameWithExt = newName.endsWith(ext) ? newName : newName + ext;
  const newPath = path.join(deviceFolder, newNameWithExt);
  
  if (!fs.existsSync(oldPath)) return res.status(404).json({ error: 'file not found' });
  if (fs.existsSync(newPath) && oldPath !== newPath) return res.status(409).json({ error: 'file with this name already exists' });
  
  try {
    fs.renameSync(oldPath, newPath);
    if (!fileNamesMap[id]) fileNamesMap[id] = {};
    if (fileNamesMap[id][oldName]) delete fileNamesMap[id][oldName];
    saveFileNamesMap();
    d.files = fs.readdirSync(deviceFolder).filter(f => ALLOWED_EXT.test(f));
    d.fileNames = d.files.map(f => fileNamesMap[id]?.[f] || f);
    res.json({ success: true, newName: newNameWithExt });
    io.emit('devices/updated');
  } catch (err) {
    res.status(500).json({ error: 'failed to rename file' });
  }
});

app.delete('/api/devices/:id/files/:name', (req, res) => {
  const id = sanitizeDeviceId(req.params.id); if(!id) return res.status(400).json({ error: 'invalid device id' });
  const name = req.params.name;
  const d = devices[id];
  if (!d) return res.status(404).json({ error: 'device not found' });
  if (/^default\./i.test(name)) return res.status(403).json({ error: 'forbidden' });
  
  const deviceFolder = path.join(DEVICES, d.folder);
  const folderName = name.replace(/\.(pdf|pptx)$/i, '');
  const possibleFolder = path.join(deviceFolder, folderName);
  let deletedFileName = name;
  
  if (fs.existsSync(possibleFolder) && fs.statSync(possibleFolder).isDirectory()) {
    if (!possibleFolder.startsWith(DEVICES)) return res.status(403).json({ error: 'forbidden' });
    try {
      fs.rmSync(possibleFolder, { recursive: true, force: true });
      deletedFileName = folderName;
    } catch (e) {
      return res.status(500).json({ error: 'Failed to delete folder' });
    }
  } else {
    const abs = path.join(deviceFolder, name);
    if (!abs.startsWith(DEVICES)) return res.status(403).json({ error: 'forbidden' });
    if (!fs.existsSync(abs)) return res.status(404).json({ error: 'file not found' });
    fs.unlinkSync(abs);
  }
  
  if (fileNamesMap[id]) {
    if (fileNamesMap[id][name]) delete fileNamesMap[id][name];
    if (fileNamesMap[id][deletedFileName] && deletedFileName !== name) delete fileNamesMap[id][deletedFileName];
    if (Object.keys(fileNamesMap[id]).length === 0) delete fileNamesMap[id];
    saveFileNamesMap();
  }
  
  const result = [];
  const fileNames = [];
  if (fs.existsSync(deviceFolder)) {
    const entries = fs.readdirSync(deviceFolder);
    for (const entry of entries) {
      const entryPath = path.join(deviceFolder, entry);
      const stat = fs.statSync(entryPath);
      
      if (stat.isFile()) {
        // Пропускаем системные файлы (default.*, .optimizing_*, .tmp_*, etc.)
        if (!isSystemFile(entry)) {
          result.push(entry);
          const originalName = fileNamesMap[id]?.[entry] || entry;
          fileNames.push(originalName);
        }
      } else if (stat.isDirectory()) {
        const folderContents = fs.readdirSync(entryPath);
        const originalFile = folderContents.find(f => /\.(pdf|pptx)$/i.test(f));
        if (originalFile) {
          result.push(originalFile);
          const originalName = fileNamesMap[id]?.[entry] || originalFile;
          fileNames.push(originalName);
        }
      }
    }
  }
  
  d.files = result;
  d.fileNames = fileNames;
  io.emit('devices/updated');
  res.json({ ok: true, files: result });
});

app.get('/api/devices', (req, res) => {
  res.json(Object.entries(devices).map(([id, d]) => ({
    device_id: id, 
    name: d.name, 
    folder: d.folder, 
    files: d.files, 
    fileNames: d.fileNames || d.files,
    current: d.current,
    deviceType: d.deviceType || 'browser',
    capabilities: d.capabilities || { video: true, audio: true, images: true, pdf: true, pptx: true, streaming: true },
    platform: d.platform || 'Unknown',
    lastSeen: d.lastSeen || null
  })));
});

app.post('/api/devices', (req, res) => {
  const { device_id, name } = req.body;
  if (!device_id) return res.status(400).json({ error: 'device_id required' });
  if (devices[device_id]) return res.status(409).json({ error: 'exists' });
  
  const devicePath = path.join(DEVICES, device_id);
  fs.mkdirSync(devicePath, { recursive: true });
  
  // КРИТИЧНО: Устанавливаем права 755 на папку устройства
  // Чтобы Nginx (www-data) мог читать файлы
  try {
    fs.chmodSync(devicePath, 0o755);
    console.log(`[create device] ✅ Создана папка с правами 755: ${devicePath}`);
  } catch (e) {
    console.warn(`[create device] ⚠️ Не удалось установить права на ${devicePath}: ${e}`);
  }
  
  devices[device_id] = { name: name || device_id, folder: device_id, files: [], current: { type: 'idle', file: null, state: 'idle' } };
  io.emit('devices/updated');
  saveDevicesJson();
  res.json({ ok: true });
});

app.post('/api/devices/:id/rename', (req, res) => {
  const id = sanitizeDeviceId(req.params.id); if(!id) return res.status(400).json({ error: 'invalid device id' });
  if (!devices[id]) return res.status(404).json({ error: 'not found' });
  devices[id].name = req.body.name || id;
  io.emit('devices/updated');
  saveDevicesJson();
  res.json({ ok: true });
});

app.delete('/api/devices/:id', (req, res) => {
  const id = sanitizeDeviceId(req.params.id); if(!id) return res.status(400).json({ error: 'invalid device id' });
  const d = devices[id];
  if (!d) return res.status(404).json({ error: 'not found' });
  
  console.log(`[DELETE device] Удаление устройства: ${id} (folder: ${d.folder})`);
  
  // Удаляем папку устройства
  const devicePath = path.join(DEVICES, d.folder);
  console.log(`[DELETE device] Удаление папки: ${devicePath}`);
  fs.rmSync(devicePath, { recursive: true, force: true });
  
  // Удаляем из devices
  delete devices[id];
  console.log(`[DELETE device] Удалено из devices: ${id}`);
  
  // КРИТИЧНО: Удаляем из fileNamesMap
  if (fileNamesMap[id]) {
    console.log(`[DELETE device] Удаление из fileNamesMap: ${id} (${Object.keys(fileNamesMap[id]).length} файлов)`);
    delete fileNamesMap[id];
    saveFileNamesMap();
  } else {
    console.log(`[DELETE device] ℹ️ Устройство ${id} не найдено в fileNamesMap`);
  }
  
  io.emit('devices/updated');
  saveDevicesJson();
  console.log(`[DELETE device] ✅ Устройство ${id} полностью удалено`);
  res.json({ ok: true });
});

app.get('/api/devices/:id/placeholder', (req, res) => {
  const id = sanitizeDeviceId(req.params.id);
  if (!id) return res.status(400).json({ error: 'invalid device id' });
  const d = devices[id];
  if (!d) return res.status(404).json({ error: 'device not found' });
  const folder = path.join(DEVICES, d.folder);
  
  if (!fs.existsSync(folder)) {
    console.log(`[placeholder] ❌ Папка не существует: ${folder}`);
    return res.json({ placeholder: null });
  }
  
  const tryList = ['mp4','webm','ogg','mkv','mov','avi','mp3','wav','m4a','png','jpg','jpeg','gif','webp'];
  for (const ext of tryList) {
    const fileName = `default.${ext}`;
    const filePath = path.join(folder, fileName);
    
    // КРИТИЧНО: Проверяем не только существование, но и что это файл (не папка) и размер > 0
    if (fs.existsSync(filePath)) {
      const stats = fs.statSync(filePath);
      if (stats.isFile() && stats.size > 0) {
        console.log(`[placeholder] ✅ Найдена заглушка: ${fileName} (${stats.size} bytes)`);
        return res.json({ placeholder: fileName });
      } else if (stats.size === 0) {
        console.log(`[placeholder] ⚠️ Файл ${fileName} пустой (0 bytes), пропускаем`);
      }
    }
  }
  
  console.log(`[placeholder] ❌ Не найдена ни одна заглушка в ${folder}`);
  res.json({ placeholder: null });
});

app.get('/api/devices/:id/files', (req, res) => {
  const id = sanitizeDeviceId(req.params.id); if(!id) return res.status(400).json({ error: 'invalid device id' });
  const d = devices[id];
  if (!d) return res.status(404).json({ error: 'not found' });
  const folder = path.join(DEVICES, d.folder);
  
  const result = [];
  const fileNames = [];
  if (fs.existsSync(folder)) {
    const entries = fs.readdirSync(folder);
    for (const entry of entries) {
      const entryPath = path.join(folder, entry);
      const stat = fs.statSync(entryPath);
      
      if (stat.isFile()) {
        // Пропускаем системные файлы (default.*, .optimizing_*, .tmp_*, etc.)
        if (!isSystemFile(entry)) {
          result.push(entry);
          const originalName = fileNamesMap[id]?.[entry] || entry;
          fileNames.push(originalName);
        }
      } else if (stat.isDirectory()) {
        const folderContents = fs.readdirSync(entryPath);
        const hasPdfPptx = folderContents.some(f => /\.(pdf|pptx)$/i.test(f));
        if (hasPdfPptx) {
          const originalFile = folderContents.find(f => /\.(pdf|pptx)$/i.test(f));
          if (originalFile) {
            result.push(originalFile);
            const originalName = fileNamesMap[id]?.[entry] || originalFile;
            fileNames.push(originalName);
          }
        }
      }
    }
  }
  
  d.files = result;
  d.fileNames = fileNames;
  const response = result.map((safeName, index) => ({
    safeName: safeName,
    originalName: fileNames[index] || safeName
  }));
  res.json(response);
});

async function getPdfPageCount(pdfPath) {
  const pdfBytes = await fs.promises.readFile(pdfPath);
  const pdfDoc = await PDFDocument.load(pdfBytes);
  return pdfDoc.getPageCount();
}

async function convertPptxToImages(pptxPath, outputDir) {
  const fileNameWithoutExt = path.basename(pptxPath, path.extname(pptxPath));
  const pdfPath = path.join(outputDir, `${fileNameWithoutExt}.pdf`);
  await execAsync(`soffice --headless --convert-to pdf --outdir "${outputDir}" "${pptxPath}"`);
  const numPages = await convertPdfToImages(pdfPath, outputDir);
  fs.unlinkSync(pdfPath);
  return numPages;
}

async function convertPdfToImages(pdfPath, outputDir) {
  const options = {
    density: 150,
    saveFilename: "page",
    savePath: outputDir,
    format: "png",
    width: 1920,
    height: 1080,
  };
  const convert = fromPath(pdfPath, options);
  const pageCount = await getPdfPageCount(pdfPath);
  for (let i = 1; i <= pageCount; i++) {
    await convert(i);
  }
  return pageCount;
}

// ========================================
// VIDEO OPTIMIZATION для Android TV
// ========================================

// Загружаем конфигурацию оптимизации
let videoOptConfig = {};
try {
  const configPath = path.join(ROOT, 'video-optimization.json');
  if (fs.existsSync(configPath)) {
    videoOptConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    console.log('[VideoOpt] ✅ Конфигурация загружена');
  }
} catch (e) {
  console.warn('[VideoOpt] ⚠️ Ошибка загрузки конфигурации, используем defaults');
  videoOptConfig = { enabled: false };
}

// Глобальное хранилище статусов файлов
const fileStatuses = new Map(); // Map<deviceId_fileName, {status, progress, error, job}>

// Проверка параметров видео через ffprobe
async function checkVideoParameters(filePath) {
  try {
    const { stdout } = await execAsync(
      `ffprobe -v error -select_streams v:0 -show_entries stream=codec_name,width,height,r_frame_rate,bit_rate,profile,level -of json "${filePath}"`
    );
    
    const data = JSON.parse(stdout);
    const stream = data.streams?.[0];
    
    if (!stream) return null;
    
    // Парсим frame rate (например "25/1" -> 25)
    let fps = 0;
    if (stream.r_frame_rate) {
      const [num, den] = stream.r_frame_rate.split('/').map(Number);
      fps = den ? num / den : num;
    }
    
    return {
      codec: stream.codec_name,
      width: stream.width || 0,
      height: stream.height || 0,
      fps: Math.round(fps),
      bitrate: parseInt(stream.bit_rate) || 0,
      profile: stream.profile || 'unknown',
      level: stream.level || 0
    };
  } catch (error) {
    console.error(`[VideoOpt] ❌ Ошибка ffprobe: ${error.message}`);
    return null;
  }
}

// Проверяем нужна ли оптимизация
function needsOptimization(params) {
  if (!params || !videoOptConfig.enabled) return false;
  
  const thresholds = videoOptConfig.thresholds || {};
  
  const needsOpt = 
    params.width > (thresholds.maxWidth || 1920) ||
    params.height > (thresholds.maxHeight || 1080) ||
    params.fps > (thresholds.maxFps || 30) ||
    params.bitrate > (thresholds.maxBitrate || 6000000) ||
    params.profile === 'High 10' ||
    params.profile === 'High 4:4:4 Predictive' ||
    (params.codec !== 'h264' && params.codec !== 'H.264');
  
  return needsOpt;
}

// Автоматическая оптимизация видео для Android TV
async function autoOptimizeVideo(deviceId, fileName) {
  const d = devices[deviceId];
  if (!d) return { success: false, message: 'Device not found' };
  
  if (!videoOptConfig.enabled) {
    return { success: false, message: 'Video optimization disabled' };
  }
  
  const deviceFolder = path.join(DEVICES, d.folder);
  const filePath = path.join(deviceFolder, fileName);
  const statusKey = `${deviceId}_${fileName}`;
  
  if (!fs.existsSync(filePath)) {
    return { success: false, message: 'File not found' };
  }
  
  const ext = path.extname(fileName).toLowerCase();
  if (!['.mp4', '.webm', '.ogg', '.mkv', '.mov', '.avi'].includes(ext)) {
    return { success: false, message: 'Not a video file' };
  }
  
  console.log(`[VideoOpt] 🔍 Проверка: ${fileName}`);
  
  // Устанавливаем статус "проверка"
  fileStatuses.set(statusKey, { status: 'checking', progress: 0, canPlay: false });
  
  // Проверяем параметры видео
  const params = await checkVideoParameters(filePath);
  if (!params) {
    fileStatuses.delete(statusKey);
    return { success: false, message: 'Cannot read video parameters' };
  }
  
  console.log(`[VideoOpt] 📊 Параметры: ${params.width}x${params.height} @ ${params.fps}fps, ${Math.round(params.bitrate/1000)}kbps, ${params.codec}/${params.profile}`);
  
  // Проверяем нужна ли оптимизация
  if (!needsOptimization(params)) {
    console.log(`[VideoOpt] ✅ Видео оптимально: ${fileName}`);
    fileStatuses.set(statusKey, { status: 'ready', progress: 100, canPlay: true });
    return { success: true, message: 'Already optimized', optimized: false };
  }
  
  console.log(`[VideoOpt] ⚠️ Требуется оптимизация: ${fileName}`);
  
  // Устанавливаем статус "обработка"
  fileStatuses.set(statusKey, { status: 'processing', progress: 5, canPlay: false });
  io.emit('file/processing', { device_id: deviceId, file: fileName });
  
  // Определяем целевой профиль
  const profiles = videoOptConfig.profiles || {};
  let targetProfile = profiles['1080p'];
  
  // Если видео меньше 1080p - используем 720p
  if (params.width <= 1280 && params.height <= 720) {
    targetProfile = profiles['720p'];
  }
  
  // Если видео больше 1080p (4K) - конвертируем в 1080p
  if (params.width > 1920 || params.height > 1080) {
    targetProfile = profiles['1080p'];
    console.log(`[VideoOpt] 📉 4K → 1080p конвертация`);
  }
  
  const optConfig = videoOptConfig.optimization || {};
  
  // Создаем временный файл
  const tempPath = path.join(deviceFolder, `.optimizing_${Date.now()}${ext}`);
  
  console.log(`[VideoOpt] 🎬 Начало конвертации: ${fileName}`);
  console.log(`[VideoOpt] 🎯 Профиль: ${targetProfile.width}x${targetProfile.height} @ ${targetProfile.fps}fps, ${targetProfile.bitrate}`);
  
  try {
    // FFmpeg аргументы
    const ffmpegArgs = [
      '-i', filePath,
      '-c:v', 'libx264',
      '-profile:v', targetProfile.profile,
      '-level', String(targetProfile.level),
      '-vf', `scale=${targetProfile.width}:${targetProfile.height}`,
      '-r', String(targetProfile.fps),
      '-b:v', targetProfile.bitrate,
      '-maxrate', targetProfile.maxrate,
      '-bufsize', targetProfile.bufsize,
      '-g', String(targetProfile.fps * 2),
      '-preset', optConfig.preset || 'medium',
      '-pix_fmt', optConfig.pixelFormat || 'yuv420p',
      '-c:a', optConfig.audioCodec || 'aac',
      '-b:a', targetProfile.audioBitrate,
      '-ar', String(optConfig.audioSampleRate || '44100'),
      '-ac', String(optConfig.audioChannels || 2),
      '-movflags', '+faststart',
      '-y', tempPath
    ];
    
    console.log(`[VideoOpt] 🔧 FFmpeg команда: ffmpeg ${ffmpegArgs.join(' ')}`);
    
    // Запускаем FFmpeg с отслеживанием прогресса
    await new Promise((resolve, reject) => {
      const ffmpegProcess = spawn('ffmpeg', ffmpegArgs);
      
      let duration = 0;
      let stderr = '';
      
      // Парсим вывод FFmpeg для прогресса
      ffmpegProcess.stderr.on('data', (data) => {
        const output = data.toString();
        stderr += output;
        
        // Извлекаем длительность видео (только один раз)
        if (duration === 0) {
          const durationMatch = output.match(/Duration: (\d{2}):(\d{2}):(\d{2}\.\d{2})/);
          if (durationMatch) {
            const hours = parseInt(durationMatch[1]);
            const minutes = parseInt(durationMatch[2]);
            const seconds = parseFloat(durationMatch[3]);
            duration = hours * 3600 + minutes * 60 + seconds;
            console.log(`[VideoOpt] ⏱️ Длительность видео: ${duration.toFixed(1)}s`);
          }
        }
        
        // Извлекаем текущее время обработки
        if (duration > 0) {
          const timeMatch = output.match(/time=(\d{2}):(\d{2}):(\d{2}\.\d{2})/);
          if (timeMatch) {
            const hours = parseInt(timeMatch[1]);
            const minutes = parseInt(timeMatch[2]);
            const seconds = parseFloat(timeMatch[3]);
            const currentTime = hours * 3600 + minutes * 60 + seconds;
            
            // Вычисляем прогресс (10% - 90%)
            const rawProgress = (currentTime / duration) * 100;
            const progress = Math.min(90, Math.max(10, 10 + Math.round(rawProgress * 0.8)));
            
            // Обновляем статус
            fileStatuses.set(statusKey, { status: 'processing', progress, canPlay: false });
            
            // Отправляем событие клиентам каждые 5%
            if (progress % 5 === 0) {
              io.emit('file/progress', { device_id: deviceId, file: fileName, progress });
              console.log(`[VideoOpt] 📊 Прогресс: ${progress}% (${currentTime.toFixed(1)}s / ${duration.toFixed(1)}s)`);
            }
          }
        }
      });
      
      ffmpegProcess.on('close', (code) => {
        if (code === 0) {
          console.log(`[VideoOpt] ✅ FFmpeg завершен успешно`);
          resolve();
        } else {
          console.error(`[VideoOpt] ❌ FFmpeg завершен с кодом ${code}`);
          console.error(`[VideoOpt] Stderr: ${stderr.substring(stderr.length - 500)}`); // Последние 500 символов
          reject(new Error(`FFmpeg exited with code ${code}`));
        }
      });
      
      ffmpegProcess.on('error', (err) => {
        console.error(`[VideoOpt] ❌ Ошибка запуска FFmpeg: ${err}`);
        reject(err);
      });
    });
    
    fileStatuses.set(statusKey, { status: 'processing', progress: 90, canPlay: false });
    console.log(`[VideoOpt] ✅ Конвертация завершена: ${fileName}`);
    
    // Проверяем что файл создан и не пустой
    const stats = fs.statSync(tempPath);
    if (stats.size === 0) {
      throw new Error('Converted file is empty');
    }
    
    // КРИТИЧНО: Удаляем оригинал и заменяем оптимизированным (без резервной копии)
    fs.unlinkSync(filePath);
    fs.renameSync(tempPath, filePath);
    
    // Устанавливаем права
    fs.chmodSync(filePath, 0o644);
    
    // Устанавливаем статус "готово"
    fileStatuses.set(statusKey, { status: 'ready', progress: 100, canPlay: true });
    io.emit('file/ready', { device_id: deviceId, file: fileName });
    
    console.log(`[VideoOpt] 🎉 Видео оптимизировано: ${fileName}`);
    console.log(`[VideoOpt] 📊 Размер: ${Math.round(stats.size / 1024 / 1024)}MB`);
    
    return { 
      success: true, 
      message: 'Optimized successfully', 
      optimized: true,
      sizeBytes: stats.size,
      params: {
        before: params,
        after: {
          width: targetProfile.width,
          height: targetProfile.height,
          fps: targetProfile.fps,
          bitrate: targetProfile.bitrate
        }
      }
    };
    
  } catch (error) {
    console.error(`[VideoOpt] ❌ Ошибка конвертации: ${error.message}`);
    
    // Очищаем временный файл
    if (fs.existsSync(tempPath)) {
      fs.unlinkSync(tempPath);
    }
    
    // Если оригинал был удален, а конвертация провалилась - проблема!
    // Но мы удаляем оригинал ПОСЛЕ успешной конвертации, так что это safe
    
    // Устанавливаем статус "ошибка" но файл можно воспроизвести (оригинал)
    fileStatuses.set(statusKey, { 
      status: 'error', 
      progress: 0, 
      canPlay: true, 
      error: error.message 
    });
    io.emit('file/error', { device_id: deviceId, file: fileName, error: error.message });
    
    return { success: false, message: `Conversion failed: ${error.message}` };
  }
}

async function autoConvertFile(deviceId, fileName) {
  const d = devices[deviceId];
  if (!d) return 0;
  const deviceFolder = path.join(DEVICES, d.folder);
  const filePath = path.join(deviceFolder, fileName);
  if (!fs.existsSync(filePath)) return 0;
  
  const ext = path.extname(fileName).toLowerCase();
  if (ext !== '.pdf' && ext !== '.pptx') return 0;
  
  const folderName = fileName.replace(/\.(pdf|pptx)$/i, '');
  const convertedDir = path.join(deviceFolder, folderName);
  const originalName = fileNamesMap[deviceId]?.[fileName] || fileName;
  
  const existing = fs.existsSync(convertedDir) && fs.statSync(convertedDir).isDirectory()
    ? fs.readdirSync(convertedDir).filter(f => f.toLowerCase().endsWith('.png')).length
    : 0;
  
  if (existing > 0) {
    if (!fileNamesMap[deviceId]) fileNamesMap[deviceId] = {};
    if (!fileNamesMap[deviceId][folderName]) {
      fileNamesMap[deviceId][folderName] = originalName;
      saveFileNamesMap();
    }
    return existing;
  }
  
  try {
    if (!fs.existsSync(convertedDir)) fs.mkdirSync(convertedDir, { recursive: true });
    
    const movedFilePath = path.join(convertedDir, fileName);
    if (!fs.existsSync(movedFilePath)) fs.renameSync(filePath, movedFilePath);
    
    if (!fileNamesMap[deviceId]) fileNamesMap[deviceId] = {};
    fileNamesMap[deviceId][folderName] = originalName;
    fileNamesMap[deviceId][fileName] = originalName;
    saveFileNamesMap();
    
    let count = 0;
    if (ext === '.pptx') {
      count = await convertPptxToImages(movedFilePath, convertedDir);
    } else if (ext === '.pdf') {
      count = await convertPdfToImages(movedFilePath, convertedDir);
    }
    return count;
  } catch (error) {
    const movedFilePath = path.join(convertedDir, fileName);
    if (fs.existsSync(movedFilePath) && !fs.existsSync(filePath)) {
      try { fs.renameSync(movedFilePath, filePath); } catch {}
    }
    return 0;
  }
}

function findFileFolder(deviceId, fileName) {
  const deviceFolder = path.join(DEVICES, deviceId);
  if (!fs.existsSync(deviceFolder)) return null;
  
  const folderName = fileName.replace(/\.(pdf|pptx)$/i, '');
  const possibleFolder = path.join(deviceFolder, folderName);
  
  if (fs.existsSync(possibleFolder) && fs.statSync(possibleFolder).isDirectory()) {
    const folderContents = fs.readdirSync(possibleFolder);
    if (folderContents.includes(fileName)) {
      return possibleFolder;
    }
  }
  
  const filePath = path.join(deviceFolder, fileName);
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) return null;
  return null;
}

// Функция для подсчета слайдов PPTX/PDF (вынесена из Socket.IO блока для использования в Express routes)
async function getPageSlideCount(deviceId, fileName, type) {
  try {
    const convertedDir = findFileFolder(deviceId, fileName);
    if (!convertedDir) return 0;
    const pngFiles = fs.readdirSync(convertedDir)
      .filter(f => f.toLowerCase().endsWith('.png'))
      .sort();
    return pngFiles.length;
  } catch {
    return 0;
  }
}

// API: Get slide/page count for PPTX/PDF
// Используем query параметр вместо path параметра для поддержки имен с пробелами
app.get('/api/devices/:id/slides-count', async (req, res) => {
  const id = sanitizeDeviceId(req.params.id); 
  if(!id) return res.status(400).json({ error: 'invalid device id' });
  const d = devices[id];
  if (!d) return res.status(404).json({ error: 'device not found' });
  const fileName = req.query.file;
  
  if (!fileName) {
    return res.status(400).json({ error: 'file parameter is required' });
  }
  
  const ext = path.extname(fileName).toLowerCase();
  if (ext !== '.pdf' && ext !== '.pptx') {
    return res.status(400).json({ error: 'Only PDF and PPTX files supported' });
  }
  
  const type = ext === '.pdf' ? 'page' : 'slide';
  const count = await getPageSlideCount(id, fileName, type);
  
  res.json({ 
    device_id: id, 
    file: fileName, 
    type: ext === '.pdf' ? 'pdf' : 'pptx',
    count: count 
  });
});

app.get('/api/devices/:id/converted/:file/:type/:num', async (req, res) => {
  const id = sanitizeDeviceId(req.params.id); if(!id) return res.status(400).json({ error: 'invalid device id' });
  const d = devices[id];
  if (!d) return res.status(404).json({ error: 'device not found' });
  const fileName = req.params.file;
  const type = req.params.type;
  const num = parseInt(req.params.num) || 1;
  
  const ext = path.extname(fileName).toLowerCase();
  if ((ext === '.pdf' && type !== 'page') || (ext === '.pptx' && type !== 'slide')) {
    return res.status(400).json({ error: 'invalid type for file' });
  }
  
  let convertedDir = findFileFolder(id, fileName);
  
  if (!convertedDir) {
    const filePath = path.join(DEVICES, id, fileName);
    if (fs.existsSync(filePath)) {
      const count = await autoConvertFile(id, fileName);
      if (count === 0) return res.status(500).json({ error: 'Conversion failed or in progress' });
      convertedDir = findFileFolder(id, fileName);
    }
    if (!convertedDir) return res.status(404).json({ error: 'file not found' });
  }
  
  try {
    const pngFiles = fs.readdirSync(convertedDir)
      .filter(f => f.toLowerCase().endsWith('.png'))
      .sort();
    
    if (pngFiles.length === 0) return res.status(500).json({ error: 'No pages/slides available' });
    
    const index = Math.max(0, Math.min(num - 1, pngFiles.length - 1));
    const imageFile = pngFiles[index];
    const imagePath = path.join(convertedDir, imageFile);
    
    if (!fs.existsSync(imagePath)) return res.status(404).json({ error: 'page/slide not found' });
    
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.sendFile(imagePath);
  } catch (error) {
    res.status(500).json({ error: `Failed: ${error.message}` });
  }
});

// ========================================
// VIDEO OPTIMIZATION API
// ========================================

// API: Получить статус файла (обрабатывается/готов)
app.get('/api/devices/:id/files/:name/status', (req, res) => {
  const id = sanitizeDeviceId(req.params.id);
  if (!id) return res.status(400).json({ error: 'invalid device id' });
  
  const fileName = req.params.name;
  const statusKey = `${id}_${fileName}`;
  
  const status = fileStatuses.get(statusKey);
  
  if (!status) {
    // Файл не в обработке - значит готов к воспроизведению
    return res.json({
      file: fileName,
      status: 'ready',
      progress: 100,
      canPlay: true
    });
  }
  
  res.json({
    file: fileName,
    ...status
  });
});

// API: Получить информацию о видео (параметры)
app.get('/api/devices/:id/files/:name/video-info', async (req, res) => {
  const id = sanitizeDeviceId(req.params.id);
  if (!id) return res.status(400).json({ error: 'invalid device id' });
  
  const fileName = req.params.name;
  const d = devices[id];
  
  if (!d) return res.status(404).json({ error: 'device not found' });
  
  const deviceFolder = path.join(DEVICES, d.folder);
  const filePath = path.join(deviceFolder, fileName);
  
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'file not found' });
  }
  
  try {
    const params = await checkVideoParameters(filePath);
    if (!params) {
      return res.status(400).json({ error: 'cannot read video parameters' });
    }
    
    const needsOpt = needsOptimization(params);
    
    res.json({
      file: fileName,
      parameters: params,
      needsOptimization: needsOpt,
      recommendation: needsOpt ? 
        'Видео рекомендуется оптимизировать для Android TV' : 
        'Видео оптимально для Android TV'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API: Запустить оптимизацию вручную
app.post('/api/devices/:id/files/:name/optimize', async (req, res) => {
  const id = sanitizeDeviceId(req.params.id);
  if (!id) return res.status(400).json({ error: 'invalid device id' });
  
  const fileName = req.params.name;
  const d = devices[id];
  
  if (!d) return res.status(404).json({ error: 'device not found' });
  
  console.log(`[API] 🎬 Ручная оптимизация: ${fileName}`);
  
  try {
    const result = await autoOptimizeVideo(id, fileName);
    
    if (result.success) {
      // Обновляем список файлов
      io.emit('devices/updated');
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API: Список всех файлов со статусами
app.get('/api/devices/:id/files-with-status', (req, res) => {
  const id = sanitizeDeviceId(req.params.id);
  if (!id) return res.status(400).json({ error: 'invalid device id' });
  
  const d = devices[id];
  if (!d) return res.status(404).json({ error: 'device not found' });
  
  const files = d.files || [];
  const filesWithStatus = files.map(fileName => {
    const statusKey = `${id}_${fileName}`;
    const status = fileStatuses.get(statusKey);
    
    return {
      name: fileName,
      originalName: d.fileNames?.[files.indexOf(fileName)] || fileName,
      status: status ? status.status : 'ready',
      progress: status ? status.progress : 100,
      canPlay: status ? status.canPlay : true,
      error: status ? status.error : null
    };
  });
  
  res.json(filesWithStatus);
});

const activeConnections = new Map();
const deviceSockets = new Map();

function updateDeviceStatus(device_id) {
  const sockets = deviceSockets.get(device_id);
  return sockets && sockets.size > 0;
}

function getOnlineDevices() {
  const onlineSet = new Set();
  for (const device_id of deviceSockets.keys()) {
    if (deviceSockets.get(device_id) && deviceSockets.get(device_id).size > 0) {
      onlineSet.add(device_id);
    }
  }
  return Array.from(onlineSet);
}

io.on('connection', socket => {
  try {
    const snapshot = getOnlineDevices();
    socket.emit('players/onlineSnapshot', snapshot);
  } catch {}
      
  socket.on('player/register', ({ device_id, device_type, capabilities, platform }) => {
    if (!device_id || !devices[device_id]) {
      socket.emit('player/reject', { reason: 'unknown_device' });
      return;
    }
    
    const defaultCapabilities = {
      video: true,
      audio: true,
      images: true,
      pdf: true,
      pptx: true,
      streaming: true
    };
    
    devices[device_id].deviceType = device_type || 'browser';
    devices[device_id].capabilities = capabilities || defaultCapabilities;
    devices[device_id].platform = platform || 'Unknown';
    devices[device_id].lastSeen = new Date().toISOString();
    
    const prevDevice = activeConnections.get(socket.id);
    if (prevDevice && prevDevice !== device_id) {
      const prevSockets = deviceSockets.get(prevDevice);
      if (prevSockets) {
        prevSockets.delete(socket.id);
        if (prevSockets.size === 0) {
          deviceSockets.delete(prevDevice);
          io.emit('player/offline', { device_id: prevDevice });
        }
      }
    }
    
    if (prevDevice === device_id) {
      const sockets = deviceSockets.get(device_id);
      if (sockets && sockets.has(socket.id)) {
        if (socket.data) socket.data.lastPing = Date.now();
        devices[device_id].current = { type: 'idle', file: null, state: 'idle' };
        socket.emit('player/state', devices[device_id].current);
        return;
      }
    }
    
    socket.join(`device:${device_id}`);
    socket.data.device_id = device_id;
    socket.data.lastPing = Date.now();
    activeConnections.set(socket.id, device_id);
    
    if (!deviceSockets.has(device_id)) {
      deviceSockets.set(device_id, new Set());
    }
    const wasOffline = deviceSockets.get(device_id).size === 0;
    deviceSockets.get(device_id).add(socket.id);
    
    if (wasOffline) {
      io.emit('player/online', { device_id });
    }
    
    devices[device_id].current = { type: 'idle', file: null, state: 'idle' };
    socket.emit('player/state', devices[device_id].current);
    
    // КРИТИЧНО: Отправляем подтверждение успешной регистрации
    socket.emit('player/registered', { 
      device_id, 
      current: devices[device_id].current,
      timestamp: Date.now()
    });
    console.log(`[Server] ✅ Player registered: ${device_id} (socket: ${socket.id})`);
  });
    
  socket.on('player/ping', () => {
    if (socket.data.device_id) {
      socket.emit('player/pong');
      if (socket.data) socket.data.lastPing = Date.now();
    }
  });
  
  socket.data.lastPing = Date.now();
  socket.data.inactivityTimeout = setInterval(() => {
    if (!socket.connected || !socket.data.device_id) {
      clearInterval(socket.data.inactivityTimeout);
      socket.data.inactivityTimeout = null;
      return;
    }
    
    const timeSinceLastPing = Date.now() - (socket.data.lastPing || 0);
    if (timeSinceLastPing > 30000) {
      const did = socket.data.device_id;
      const sockets = deviceSockets.get(did);
      if (sockets) {
        sockets.delete(socket.id);
        if (sockets.size === 0) {
          deviceSockets.delete(did);
          io.emit('player/offline', { device_id: did });
        }
      }
      activeConnections.delete(socket.id);
      clearInterval(socket.data.inactivityTimeout);
      socket.data.inactivityTimeout = null;
      socket.disconnect(true);
    }
  }, 10000);

  socket.on('control/play', ({ device_id, file }) => {
    const d = devices[device_id];
    if (!d) return;
    if (file) {
      const ext = file.split('.').pop().toLowerCase();
      const type = ext === 'pdf' ? 'pdf' : ext === 'pptx' ? 'pptx' : ['png','jpg','jpeg','gif','webp'].includes(ext) ? 'image' : 'video';
      d.current = { type, file, state: 'playing', page: (type === 'pdf' || type === 'pptx') ? 1 : undefined };
      io.to(`device:${device_id}`).emit('player/play', d.current);
    } else {
      if (!d.current || d.current.type === 'idle') return;
      d.current.state = 'playing';
      io.to(`device:${device_id}`).emit('player/play', d.current);
    }
    io.emit('preview/refresh', { device_id });
  });

  socket.on('control/pause', ({ device_id }) => {
    const d = devices[device_id]; if (!d) return;
    d.current.state = 'paused';
    io.to(`device:${device_id}`).emit('player/pause');
    io.emit('preview/refresh', { device_id });
  });

  socket.on('control/restart', ({ device_id }) => {
    const d = devices[device_id]; if (!d) return;
    d.current.state = 'playing';
    io.to(`device:${device_id}`).emit('player/restart');
    io.emit('preview/refresh', { device_id });
  });

  socket.on('control/stop', ({ device_id }) => {
    const d = devices[device_id]; if (!d) return;
    d.current = { type: 'idle', file: null, state: 'idle' };
    io.to(`device:${device_id}`).emit('player/stop');
    io.emit('preview/refresh', { device_id });
  });

  socket.on('control/pdfPrev', ({ device_id }) => {
    const d = devices[device_id]; if (!d) return;
    if (d.current.type === 'pdf') {
      d.current.page = Math.max(1, (d.current.page || 1) - 1);
      io.to(`device:${device_id}`).emit('player/pdfPage', d.current.page);
    } else if (d.current.type === 'pptx') {
      d.current.page = Math.max(1, (d.current.page || 1) - 1);
      io.to(`device:${device_id}`).emit('player/pptxPage', d.current.page);
    }
  });

  socket.on('control/pdfNext', async ({ device_id }) => {
    const d = devices[device_id]; if (!d) return;
    if (d.current.type === 'pdf' && d.current.file) {
      const maxPages = await getPageSlideCount(device_id, d.current.file, 'page');
      if (maxPages > 0) {
        const nextPage = Math.min((d.current.page || 1) + 1, maxPages);
        if (nextPage !== d.current.page) {
          d.current.page = nextPage;
          io.to(`device:${device_id}`).emit('player/pdfPage', d.current.page);
        }
      }
    } else if (d.current.type === 'pptx' && d.current.file) {
      const maxSlides = await getPageSlideCount(device_id, d.current.file, 'slide');
      if (maxSlides > 0) {
        const nextSlide = Math.min((d.current.page || 1) + 1, maxSlides);
        if (nextSlide !== d.current.page) {
          d.current.page = nextSlide;
          io.to(`device:${device_id}`).emit('player/pptxPage', d.current.page);
        }
      }
    }
  });

  socket.on('disconnecting', () => {
    const did = socket.data?.device_id;
    if (socket.data.inactivityTimeout) {
      clearInterval(socket.data.inactivityTimeout);
      socket.data.inactivityTimeout = null;
    }
    if (!did) return;
    const sockets = deviceSockets.get(did);
    if (sockets) {
      sockets.delete(socket.id);
      if (sockets.size === 0) {
        deviceSockets.delete(did);
        io.emit('player/offline', { device_id: did });
      }
    }
    activeConnections.delete(socket.id);
  });
  
  socket.on('disconnect', () => {
    if (socket.data.inactivityTimeout) {
      clearInterval(socket.data.inactivityTimeout);
      socket.data.inactivityTimeout = null;
    }
    const did = socket.data?.device_id;
    if (did && activeConnections.get(socket.id) === did) {
      const sockets = deviceSockets.get(did);
      if (sockets) {
        sockets.delete(socket.id);
        if (sockets.size === 0) {
          deviceSockets.delete(did);
          io.emit('player/offline', { device_id: did });
        }
      }
      activeConnections.delete(socket.id);
    }
  });
});

const PORT = process.env.PORT || 3000;
const HOST = '127.0.0.1'; // Слушаем только localhost, доступ только через Nginx
server.listen(PORT, HOST, () => {
  console.log(`Server on ${HOST}:${PORT} (доступен только через Nginx)`);
});
