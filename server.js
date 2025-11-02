import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import fs from 'fs';
import path from 'path';
import mime from 'mime';
import multer from 'multer'; // + новый импорт
import crypto from 'crypto';  // для уникализации имён при совпадении
import util from "util";   
import { fromPath } from "pdf2pic";
import { exec as execCallback } from "child_process";
import { PDFDocument } from 'pdf-lib';

const execAsync = util.promisify(execCallback);


const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const ROOT = process.cwd();

// Admin auth middleware removed (unused)

// sanitize device id to prevent directory traversal and bad chars
function sanitizeDeviceId(id){
  if(!id) return null;
  if(typeof id !== 'string') return null;
  const m = id.match(/^[A-Za-z0-9_-]+$/);
  return m ? id : null;
}

const PUBLIC = path.join(ROOT, 'public');
const DEVICES = path.join(PUBLIC, 'content'); // unified content path for static /content/<device>/<file>
const NAMES_PATH = path.join(ROOT, 'devices.json');
const CONVERTED_CACHE = path.join(ROOT, '.converted'); // cache for converted PDF/PPTX slides/pages

// Ensure converted cache directory exists
if (!fs.existsSync(CONVERTED_CACHE)) fs.mkdirSync(CONVERTED_CACHE, { recursive: true });

const MAX_FILE_SIZE = 1024 * 1024 * 1024; // 1 GB, настрой по задаче
const ALLOWED_EXT = /\.(mp4|webm|ogg|mkv|mov|avi|mp3|wav|m4a|png|jpg|jpeg|gif|webp|pdf|pptx)$/i;

// const snapshots = new Map(); // removed: unused

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // проверяем и очищаем идентификатор устройства
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
    
    // Декодируем оригинальное имя файла в UTF-8
    // Multer может получать имя в неправильной кодировке из multipart/form-data
    let originalName = file.originalname;
    try {
      // Если originalname приходит как Buffer, декодируем в UTF-8
      if (Buffer.isBuffer(originalName)) {
        originalName = originalName.toString('utf-8');
      } else if (typeof originalName === 'string') {
        // Используем функцию fixEncoding для исправления неправильной кодировки
        const fixed = fixEncoding(originalName);
        if (fixed !== originalName) {
          originalName = fixed;
          console.log(`[Multer] Fixed filename encoding: "${file.originalname}" -> "${originalName}"`);
        }
      }
    } catch (e) {
      // Если декодирование не удалось - используем оригинальное значение
      console.warn('Failed to decode filename:', e);
    }
    
    const base = path.basename(originalName);
    // Сохраняем оригинальное имя (с русскими буквами) в request для последующего сохранения
    req.originalFileNames = req.originalFileNames || new Map();
    
    // Создаем безопасное имя файла для файловой системы
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
    
    // Сохраняем маппинг: безопасное имя -> оригинальное имя (правильно декодированное)
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
// Middleware для установки UTF-8 для JSON ответов
app.use((req, res, next) => {
  // Переопределяем res.json для явной установки charset=utf-8
  const originalJson = res.json.bind(res);
  res.json = function(data) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return originalJson(data);
  };
  next();
});
// Simple request logging for diagnostics
app.use((req, res, next) => {
  try { console.log(new Date().toISOString(), req.method, req.url); } catch(e) {}
  next();
});

app.use(express.static(PUBLIC));

// expose devices.json from project root for admin UI
app.use('/devices.json', express.static(path.join(ROOT, 'devices.json')));

// Serve device content at /content/<device_id>/<file>
app.use('/content', express.static(DEVICES, {
  extensions: ['.mp4', '.webm', '.ogg', '.jpg', '.jpeg', '.png', '.gif', '.pdf'],
  setHeaders: (res, filePath) => {
    const type = mime.getType(filePath) || 'application/octet-stream';
    res.setHeader('Content-Type', type);
    
    // Оптимизация для видео файлов - поддержка Range запросов
    const isVideo = /\.(mp4|webm|ogg|mkv|mov|avi)$/i.test(filePath);
    if (isVideo) {
      // Явно указываем поддержку Range запросов для ускорения загрузки
      res.setHeader('Accept-Ranges', 'bytes');
      // Кэшируем видео для ускорения повторных Range запросов
      res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=3600');
    }
    
    // Кэширование заглушек для автономной работы плеера (1 год)
    const fileName = path.basename(filePath);
    if (/^default\.(mp4|webm|ogg|mkv|mov|avi|mp3|wav|m4a|png|jpg|jpeg|gif|webp)$/i.test(fileName)) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable'); // 1 год, immutable для стабильности
      res.setHeader('Accept-Ranges', 'bytes'); // Поддержка Range для заглушек-видео
    } else if (!isVideo) {
      // Обычный контент (не видео) кэшируем на меньшее время (1 день)
      res.setHeader('Cache-Control', 'public, max-age=86400'); // 1 день
    }
    
    // Inline PDFs for iframe viewing
    if (filePath.toLowerCase().endsWith && filePath.toLowerCase().endsWith('.pdf')) {
      try { res.setHeader('Content-Disposition', 'inline'); } catch(e) {}
    }
  }
}));



if (!fs.existsSync(DEVICES)) fs.mkdirSync(DEVICES, { recursive: true });

let devices = {}; // { id: { name, folder, files, current, fileNames } }
let savedNames = {}; // { device_id: name }
// Маппинг безопасных имен файлов к оригинальным именам: { device_id: { safeName: originalName } }
const FILE_NAMES_MAP_PATH = path.join(ROOT, 'file-names-map.json');
let fileNamesMap = loadFileNamesMap(); // { device_id: { safeName: originalName } }

function loadDevicesJson() {
  try {
    const raw = fs.readFileSync(NAMES_PATH, 'utf-8');
    const parsed = JSON.parse(raw || '{}');
    if (parsed && typeof parsed === 'object') return parsed;
  } catch {}
  return {};
}

// Функция для исправления неправильно закодированных имен (кракозябры)
function fixEncoding(str) {
  if (!str || typeof str !== 'string') return str;
  
  // Если строка уже содержит кириллицу - возвращаем как есть
  if (/[а-яё]/i.test(str)) return str;
  
  // Проверяем, содержит ли строка характерные признаки двойного неправильного декодирования
  // Это когда UTF-8 текст был прочитан как latin1, а затем снова прочитан как latin1
  // Характерные признаки: начинается с Ð, содержит сочетания типа ÐÑ, Ðµ, Ð·, Ð½ и т.д.
  const doubleEncodedPattern = /Ð[ÑÐµÐ·Ð½ÑÐ°ÑÐ¸Ð¼Ð¸Ð´Ð¾Ñ]/;
  if (doubleEncodedPattern.test(str)) {
    try {
      // Шаг 1: Кодируем обратно в latin1 (восстанавливаем байты после первого неправильного декодирования)
      const step1 = Buffer.from(str, 'latin1');
      // Шаг 2: Декодируем как UTF-8 (восстанавливаем оригинальный UTF-8 текст)
      const decoded = step1.toString('utf-8');
      // Проверяем, что получилась правильная кириллица
      if (/[а-яё]/i.test(decoded) && decoded.length > 0 && decoded.length <= str.length * 2) {
        return decoded;
      }
    } catch (e) {
      // Если первый способ не сработал, пробуем альтернативные варианты
    }
  }
  
  // Альтернативный способ: пробуем декодировать из latin1 в utf-8 (для одинарного неправильного декодирования)
  try {
    const decoded = Buffer.from(str, 'latin1').toString('utf-8');
    // Проверяем что получилась кириллица и результат выглядит корректно
    if (/[а-яё]/i.test(decoded) && decoded.length > 0 && decoded.length <= str.length * 2) {
      return decoded;
    }
  } catch {}
  
  // Если содержит URL-кодирование - пробуем декодировать
  if (str.includes('%')) {
    try {
      const decoded = decodeURIComponent(str);
      if (/[а-яё]/i.test(decoded)) {
        return decoded;
      }
    } catch {}
  }
  
  // Если ничего не помогло - возвращаем как есть
  return str;
}

function loadFileNamesMap() {
  try {
    if (!fs.existsSync(FILE_NAMES_MAP_PATH)) return {};
    const raw = fs.readFileSync(FILE_NAMES_MAP_PATH, 'utf-8');
    const parsed = JSON.parse(raw || '{}');
    if (parsed && typeof parsed === 'object') {
      // Исправляем неправильно закодированные имена при загрузке
      const fixed = {};
      for (const [deviceId, fileMap] of Object.entries(parsed)) {
        if (fileMap && typeof fileMap === 'object') {
          fixed[deviceId] = {};
          for (const [safeName, originalName] of Object.entries(fileMap)) {
            // Исправляем оригинальное имя если оно неправильно закодировано
            fixed[deviceId][safeName] = fixEncoding(originalName);
          }
        }
      }
      // Сохраняем исправленные имена обратно в файл, если были исправления
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
        console.log('[FileNames] Fixed encoding issues in file-names-map.json');
      }
      return fixed;
    }
  } catch (e) {
    console.warn('Failed to load file names map:', e);
  }
  return {};
}

function saveFileNamesMap() {
  try {
    fs.writeFileSync(FILE_NAMES_MAP_PATH, JSON.stringify(fileNamesMap, null, 2), 'utf-8');
  } catch (e) {
    console.warn('Failed to save file names map:', e);
  }
}

function scan() {
  // load saved names before scanning folders so we can apply them
  savedNames = loadDevicesJson();
  fileNamesMap = loadFileNamesMap();
  const dirs = fs.readdirSync(DEVICES).filter(d => fs.statSync(path.join(DEVICES, d)).isDirectory());
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
          if (entry.toLowerCase() !== 'default.mp4' && !/^default\.(mp4|webm|ogg|mkv|mov|avi|mp3|wav|m4a|png|jpg|jpeg|gif|webp|pdf|pptx)$/i.test(entry)) {
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

// Загрузка файлов под устройство
app.post('/api/devices/:id/upload', async (req, res, next) => {
  const id = sanitizeDeviceId(req.params.id); if(!id) return res.status(400).json({ error: 'invalid device id' });
  if (!devices[id]) return res.status(404).json({ error: 'device not found' });
  upload.array('files', 50)(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ error: err.message });
    }
    
    const uploaded = (req.files || []).map(f => f.filename);
    
    // Сохраняем маппинг оригинальных имен файлов
    if (req.originalFileNames && req.originalFileNames.size > 0) {
      if (!fileNamesMap[id]) fileNamesMap[id] = {};
      for (const [safeName, originalName] of req.originalFileNames) {
        fileNamesMap[id][safeName] = originalName;
      }
      // Сохраняем маппинг в файл
      saveFileNamesMap();
    }
    
    // Auto-convert PDF/PPTX files (moves them to folders)
    for (const fileName of uploaded) {
      const ext = path.extname(fileName).toLowerCase();
      if (ext === '.pdf' || ext === '.pptx') {
        // Convert in background - this will move file to folder
        autoConvertFile(id, fileName).catch(err => {
          console.error(`Background conversion error for ${fileName}:`, err);
        });
      }
    }
    
    // Re-read files list (including PDF/PPTX folders shown as files)
    const folder = path.join(DEVICES, devices[id].folder);
    const result = [];
    const fileNames = []; // Массив с оригинальными именами для отображения
    if (fs.existsSync(folder)) {
      const entries = fs.readdirSync(folder);
      for (const entry of entries) {
        const entryPath = path.join(folder, entry);
        const stat = fs.statSync(entryPath);
        
        if (stat.isFile()) {
          if (!/^default\.(mp4|webm|ogg|mkv|mov|avi|mp3|wav|m4a|png|jpg|jpeg|gif|webp|pdf|pptx)$/i.test(entry)) {
            result.push(entry);
            // Используем оригинальное имя если есть маппинг, иначе безопасное
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
    
    devices[id].files = result;
    devices[id].fileNames = fileNames; // Сохраняем оригинальные имена для отображения
    io.emit('devices/updated');
    res.json({ ok: true, files: result, uploaded });
  });
});

// Скопировать указанный файл (видео/изображение) в default.<ext> устройства (overwrite)
app.post('/api/devices/:id/make-default', (req, res) => {
  const id = sanitizeDeviceId(req.params.id); if(!id) return res.status(400).json({ error: 'invalid device id' });
  const { file } = req.body || {};
  const d = devices[id];
  if (!d) return res.status(404).json({ error: 'device not found' });
  if (!file || typeof file !== 'string') return res.status(400).json({ error: 'file required' });
  const ext = (path.extname(file) || '').toLowerCase();
  if (!ALLOWED_EXT.test(ext)) return res.status(400).json({ error: 'unsupported type' });
  // do not allow pdf/pptx as placeholder
  if (ext === '.pdf' || ext === '.pptx') return res.status(400).json({ error: 'pdf_pptx_not_allowed_as_placeholder' });

  const folder = path.join(DEVICES, d.folder);
  
  // Check if file is in a folder (PDF/PPTX converted)
  const folderName = file.replace(/\.(pdf|pptx)$/i, '');
  const possibleFolder = path.join(folder, folderName);
  let src = path.join(folder, file);
  
  // If it's a PDF/PPTX folder, get original file from folder
  if (fs.existsSync(possibleFolder) && fs.statSync(possibleFolder).isDirectory()) {
    const folderFile = path.join(possibleFolder, file);
    if (fs.existsSync(folderFile)) {
      src = folderFile;
    }
  }
  
  const dst = path.join(folder, `default${ext}`);
  if (!src.startsWith(DEVICES) || !dst.startsWith(DEVICES)) return res.status(403).json({ error: 'forbidden' });
  if (!fs.existsSync(src)) return res.status(404).json({ error: 'source not found' });

  // remove any existing default.* to ensure the player picks the new one
  try {
    const existing = fs.readdirSync(folder);
    for (const f of existing) {
      if (/^default\.(mp4|webm|ogg|mkv|mov|avi|mp3|wav|m4a|png|jpg|jpeg|gif|webp|pdf|pptx)$/i.test(f)) {
        try { fs.unlinkSync(path.join(folder, f)); } catch {}
      }
    }
  } catch {}

  try {
    fs.copyFileSync(src, dst); // overwrite по умолчанию
  } catch (e) {
    return res.status(500).json({ error: 'copy failed', detail: String(e) });
  }

  // Перечитать список (default.* скрыт из API /files, включая PDF/PPTX папки)
  const result = [];
  if (fs.existsSync(folder)) {
    const entries = fs.readdirSync(folder);
    for (const entry of entries) {
      const entryPath = path.join(folder, entry);
      const stat = fs.statSync(entryPath);
      
      if (stat.isFile()) {
        if (!/^default\.(mp4|webm|ogg|mkv|mov|avi|mp3|wav|m4a|png|jpg|jpeg|gif|webp|pdf|pptx)$/i.test(entry)) {
          result.push(entry);
        }
      } else if (stat.isDirectory()) {
        const folderContents = fs.readdirSync(entryPath);
        const originalFile = folderContents.find(f => /\.(pdf|pptx)$/i.test(f));
        if (originalFile) {
          result.push(originalFile);
        }
      }
    }
  }
  d.files = result;

  io.emit('devices/updated');
  // Отправляем событие обновления заглушки для всех плееров этого устройства
  io.to(`device:${id}`).emit('player/stop'); // force players to reload placeholder immediately
  io.to(`device:${id}`).emit('placeholder/refresh'); // Дополнительное событие для обновления кэша
  io.emit('preview/refresh', { device_id: id });
  return res.json({ ok: true, default: path.basename(dst) });
});

// (Опционально) удалить файл устройства
app.delete('/api/devices/:id/files/:name', (req, res) => {
  const id = sanitizeDeviceId(req.params.id); if(!id) return res.status(400).json({ error: 'invalid device id' });
  const name = req.params.name;
  const d = devices[id];
  if (!d) return res.status(404).json({ error: 'device not found' });
  if (/^default\./i.test(name)) return res.status(403).json({ error: 'forbidden' });
  
  const deviceFolder = path.join(DEVICES, d.folder);
  const ext = path.extname(name).toLowerCase();
  
  // Check if it's a PDF/PPTX folder
  const folderName = name.replace(/\.(pdf|pptx)$/i, '');
  const possibleFolder = path.join(deviceFolder, folderName);
  let deletedFileName = name; // Имя для удаления из маппинга
  
  if (fs.existsSync(possibleFolder) && fs.statSync(possibleFolder).isDirectory()) {
    // Delete entire folder (contains original file + converted images)
    if (!possibleFolder.startsWith(DEVICES)) return res.status(403).json({ error: 'forbidden' });
    try {
      fs.rmSync(possibleFolder, { recursive: true, force: true });
      // Для PDF/PPTX маппинг может быть по имени папки
      deletedFileName = folderName;
    } catch (e) {
      return res.status(500).json({ error: 'Failed to delete folder' });
    }
  } else {
    // Regular file deletion
    const abs = path.join(deviceFolder, name);
    if (!abs.startsWith(DEVICES)) return res.status(403).json({ error: 'forbidden' });
    if (!fs.existsSync(abs)) return res.status(404).json({ error: 'file not found' });
    fs.unlinkSync(abs);
  }
  
  // Удаляем маппинг из fileNamesMap если есть (проверяем и по имени файла, и по имени папки для PDF/PPTX)
  if (fileNamesMap[id]) {
    if (fileNamesMap[id][name]) {
      delete fileNamesMap[id][name];
    }
    if (fileNamesMap[id][deletedFileName] && deletedFileName !== name) {
      delete fileNamesMap[id][deletedFileName];
    }
    if (Object.keys(fileNamesMap[id]).length === 0) {
      delete fileNamesMap[id];
    }
    saveFileNamesMap();
  }
  
  // обновим список
  const result = [];
  const fileNames = [];
  if (fs.existsSync(deviceFolder)) {
    const entries = fs.readdirSync(deviceFolder);
    for (const entry of entries) {
      const entryPath = path.join(deviceFolder, entry);
      const stat = fs.statSync(entryPath);
      
      if (stat.isFile()) {
        if (!/^default\.(mp4|webm|ogg|mkv|mov|avi|mp3|wav|m4a|png|jpg|jpeg|gif|webp|pdf|pptx)$/i.test(entry)) {
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

// API: список устройств
app.get('/api/devices', (req, res) => {
  res.json(Object.entries(devices).map(([id, d]) => ({
    device_id: id, 
    name: d.name, 
    folder: d.folder, 
    files: d.files, 
    fileNames: d.fileNames || d.files, // Оригинальные имена для отображения
    current: d.current
  })));
});

// API: создать устройство
app.post('/api/devices', (req, res) => {
  const { device_id, name } = req.body;
  if (!device_id) return res.status(400).json({ error: 'device_id required' });
  if (devices[device_id]) return res.status(409).json({ error: 'exists' });
  fs.mkdirSync(path.join(DEVICES, device_id), { recursive: true });
  devices[device_id] = { name: name || device_id, folder: device_id, files: [], current: { type: 'idle', file: null, state: 'idle' } };
  io.emit('devices/updated');
  saveDevicesJson();
  res.json({ ok: true });
});

// API: переименовать устройство (меняет только отображаемое имя)
app.post('/api/devices/:id/rename', (req, res) => {
  const id = sanitizeDeviceId(req.params.id); if(!id) return res.status(400).json({ error: 'invalid device id' });
  if (!devices[id]) return res.status(404).json({ error: 'not found' });
  devices[id].name = req.body.name || id;
  io.emit('devices/updated');
  saveDevicesJson();
  res.json({ ok: true });
});

// API: удалить устройство
app.delete('/api/devices/:id', (req, res) => {
  const id = sanitizeDeviceId(req.params.id); if(!id) return res.status(400).json({ error: 'invalid device id' });
  const d = devices[id];
  if (!d) return res.status(404).json({ error: 'not found' });
  fs.rmSync(path.join(DEVICES, d.folder), { recursive: true, force: true });
  // Note: PDF/PPTX folders are now in content directory, so they're removed with device folder
  delete devices[id];
  io.emit('devices/updated');
  saveDevicesJson();
  res.json({ ok: true });
});

// API: список файлов устройства (исключая default.*, показываем папки PDF/PPTX как файлы)
// Возвращает массив объектов { safeName, originalName } для поддержки русских букв
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
        // Regular files (excluding default.*)
        if (!/^default\.(mp4|webm|ogg|mkv|mov|avi|mp3|wav|m4a|png|jpg|jpeg|gif|webp|pdf|pptx)$/i.test(entry)) {
          result.push(entry);
          // Используем оригинальное имя если есть маппинг
          const originalName = fileNamesMap[id]?.[entry] || entry;
          fileNames.push(originalName);
        }
      } else if (stat.isDirectory()) {
        // Check if folder contains PDF/PPTX original file - if yes, show folder as "file"
        const folderContents = fs.readdirSync(entryPath);
        const hasPdfPptx = folderContents.some(f => /\.(pdf|pptx)$/i.test(f));
        if (hasPdfPptx) {
          // Find original file name
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
  }
  
  d.files = result;
  d.fileNames = fileNames;
  
  // Возвращаем массив объектов с оригинальными именами для отображения
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

// Helper: Convert PPTX to PNG images using LibreOffice
async function convertPptxToImages(pptxPath, outputDir) {
  try {
    // Сначала конвертируем PPTX → PDF
    const fileNameWithoutExt = path.basename(pptxPath, path.extname(pptxPath));
    const pdfPath = path.join(outputDir, `${fileNameWithoutExt}.pdf`);
    await execAsync(`soffice --headless --convert-to pdf --outdir "${outputDir}" "${pptxPath}"`);

    const numPages = await convertPdfToImages(pdfPath, outputDir);

    fs.unlinkSync(pdfPath);

    return numPages;
  } catch (error) {
    console.error("Error converting PPTX:", error);
    throw error;
  }
}

// Helper: Convert PDF to PNG images using LibreOffice (1080p resolution)
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

  const pageCount = await getPdfPageCount(pdfPath); // Нужно определить
  for (let i = 1; i <= pageCount; i++) {
    await convert(i); // ✅ сохраняет page_1.png, page_2.png и т.д.
  }

  return pageCount;
}

// Auto-convert PDF/PPTX after upload - creates folder with images in content directory
async function autoConvertFile(deviceId, fileName) {
  const d = devices[deviceId];
  if (!d) return 0;
  const deviceFolder = path.join(DEVICES, d.folder);
  const filePath = path.join(deviceFolder, fileName);
  if (!fs.existsSync(filePath)) return 0;
  
  const ext = path.extname(fileName).toLowerCase();
  if (ext !== '.pdf' && ext !== '.pptx') return 0;
  
  // Create folder with same name as file (without extension) in content directory
  const folderName = fileName.replace(/\.(pdf|pptx)$/i, '');
  const convertedDir = path.join(deviceFolder, folderName);
  
  // Проверяем, есть ли маппинг оригинального имени для fileName
  const originalName = fileNamesMap[deviceId]?.[fileName] || fileName;
  
  // Check if folder already exists and has images
  const existing = fs.existsSync(convertedDir) && fs.statSync(convertedDir).isDirectory()
    ? fs.readdirSync(convertedDir).filter(f => f.toLowerCase().endsWith('.png')).length
    : 0;
  
  if (existing > 0) {
    console.log(`File ${fileName} already converted (${existing} pages/slides)`);
    // Сохраняем маппинг для имени папки, если его еще нет
    if (!fileNamesMap[deviceId]) fileNamesMap[deviceId] = {};
    if (!fileNamesMap[deviceId][folderName]) {
      fileNamesMap[deviceId][folderName] = originalName;
      saveFileNamesMap();
    }
    return existing;
  }
  
  try {
    console.log(`Auto-converting ${fileName} to folder ${folderName}...`);
    
    // Create folder
    if (!fs.existsSync(convertedDir)) {
      fs.mkdirSync(convertedDir, { recursive: true });
    }
    
    // Move original file into folder (keep it for reference)
    const movedFilePath = path.join(convertedDir, fileName);
    if (!fs.existsSync(movedFilePath)) {
      fs.renameSync(filePath, movedFilePath);
    }
    
    // Сохраняем маппинг для имени папки (используется при отображении)
    if (!fileNamesMap[deviceId]) fileNamesMap[deviceId] = {};
    // Если маппинг уже есть для fileName, используем его для folderName
    fileNamesMap[deviceId][folderName] = originalName;
    // Также сохраняем маппинг для fileName в папке (на случай если нужно)
    fileNamesMap[deviceId][fileName] = originalName;
    saveFileNamesMap();
    
    // Convert to images
    let count = 0;
    if (ext === '.pptx') {
      count = await convertPptxToImages(movedFilePath, convertedDir);
    } else if (ext === '.pdf') {
      count = await convertPdfToImages(movedFilePath, convertedDir);
    }
    
    console.log(`Converted ${fileName}: ${count} pages/slides in folder ${folderName}`);
    return count;
  } catch (error) {
    console.error(`Auto-conversion failed for ${fileName}:`, error);
    // Restore file if conversion failed
    const movedFilePath = path.join(convertedDir, fileName);
    if (fs.existsSync(movedFilePath) && !fs.existsSync(filePath)) {
      try {
        fs.renameSync(movedFilePath, filePath);
      } catch {}
    }
    return 0;
  }
}

// Helper: Find folder containing PDF/PPTX file
function findFileFolder(deviceId, fileName) {
  const deviceFolder = path.join(DEVICES, deviceId);
  if (!fs.existsSync(deviceFolder)) return null;
  
  // Check if it's a folder (PDF/PPTX converted to folder)
  const folderName = fileName.replace(/\.(pdf|pptx)$/i, '');
  const possibleFolder = path.join(deviceFolder, folderName);
  if (fs.existsSync(possibleFolder) && fs.statSync(possibleFolder).isDirectory()) {
    const folderContents = fs.readdirSync(possibleFolder);
    if (folderContents.includes(fileName)) {
      return possibleFolder;
    }
  }
  
  // Check if file exists directly (old format or not converted yet)
  const filePath = path.join(deviceFolder, fileName);
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    return null; // File is not in folder yet
  }
  
  return null;
}

// API: Get converted page/slide image (PDF or PPTX)
app.get('/api/devices/:id/converted/:file/:type/:num', async (req, res) => {
  const id = sanitizeDeviceId(req.params.id); if(!id) return res.status(400).json({ error: 'invalid device id' });
  const d = devices[id];
  if (!d) return res.status(404).json({ error: 'device not found' });
  const fileName = req.params.file;
  const type = req.params.type; // 'page' or 'slide'
  const num = parseInt(req.params.num) || 1;
  
  const ext = path.extname(fileName).toLowerCase();
  if ((ext === '.pdf' && type !== 'page') || (ext === '.pptx' && type !== 'slide')) {
    return res.status(400).json({ error: 'invalid type for file' });
  }
  
  // Find folder containing the file
  let convertedDir = findFileFolder(id, fileName);
  
  // If not found, check if file exists and convert it
  if (!convertedDir) {
    const filePath = path.join(DEVICES, id, fileName);
    if (fs.existsSync(filePath)) {
      // Auto-convert (this will move file to folder)
      const count = await autoConvertFile(id, fileName);
      if (count === 0) {
        return res.status(500).json({ error: 'Conversion failed or in progress' });
      }
      convertedDir = findFileFolder(id, fileName);
    }
    if (!convertedDir) {
      return res.status(404).json({ error: 'file not found' });
    }
  }
  
  try {
    // Get all PNG files from folder
    const pngFiles = fs.readdirSync(convertedDir)
      .filter(f => f.toLowerCase().endsWith('.png'))
      .sort();
    
    if (pngFiles.length === 0) {
      return res.status(500).json({ error: 'No pages/slides available' });
    }
    
    // Select page/slide (1-indexed, convert to 0-indexed)
    const index = Math.max(0, Math.min(num - 1, pngFiles.length - 1));
    const imageFile = pngFiles[index];
    const imagePath = path.join(convertedDir, imageFile);
    
    if (!fs.existsSync(imagePath)) {
      return res.status(404).json({ error: 'page/slide not found' });
    }
    
    // Send image
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 24 hours
    res.sendFile(imagePath);
    
  } catch (error) {
    console.error('Image retrieval error:', error);
    res.status(500).json({ error: `Failed: ${error.message}` });
  }
});

// manual /content route removed; static handler above covers content serving

// Сокеты
  // Храним активные соединения: socket.id -> device_id
  const activeConnections = new Map(); // socket.id -> device_id
  const deviceSockets = new Map(); // device_id -> Set<socket.id>
  
  // Функция для обновления статуса устройства
  function updateDeviceStatus(device_id) {
    const sockets = deviceSockets.get(device_id);
    const isOnline = sockets && sockets.size > 0;
    // Можно добавить дополнительную логику для синхронизации статуса
    return isOnline;
  }
  
  // Получить список онлайн устройств
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
      // Send current online devices snapshot to the newly connected client
      try {
        const snapshot = getOnlineDevices();
        socket.emit('players/onlineSnapshot', snapshot);
      } catch {}
      
    socket.on('player/register', ({ device_id }) => {
      if (!device_id || !devices[device_id]) {
        socket.emit('player/reject', { reason: 'unknown_device' });
        return;
      }
      
      // Если этот socket уже был зарегистрирован для другого устройства - очищаем
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
      
      // Если этот socket уже зарегистрирован для этого устройства - просто обновляем время активности
      if (prevDevice === device_id) {
        const sockets = deviceSockets.get(device_id);
        if (sockets && sockets.has(socket.id)) {
          // Уже зарегистрирован - только обновляем время активности
          if (socket.data) socket.data.lastPing = Date.now();
          socket.emit('player/state', devices[device_id].current);
          return;
        }
      }
      
      // Регистрация для нового устройства
      socket.join(`device:${device_id}`);
      socket.data.device_id = device_id;
      socket.data.lastPing = Date.now(); // Инициализируем время последней активности
      activeConnections.set(socket.id, device_id);
      
      // Добавляем socket в Set для этого устройства
      if (!deviceSockets.has(device_id)) {
        deviceSockets.set(device_id, new Set());
      }
      const wasOffline = deviceSockets.get(device_id).size === 0;
      deviceSockets.get(device_id).add(socket.id);
      
      // Если устройство было оффлайн, отправляем событие "онлайн"
      if (wasOffline) {
        io.emit('player/online', { device_id });
      }
      
      socket.emit('player/state', devices[device_id].current);
    });
    
    // Heartbeat для проверки активности соединения
    socket.on('player/ping', () => {
      if (socket.data.device_id) {
        socket.emit('player/pong');
        // Обновляем время последней активности
        if (socket.data) socket.data.lastPing = Date.now();
      }
    });
    
    // Таймаут для неактивных соединений (30 секунд без ping)
    // Инициализируем время активности при создании соединения
    socket.data.lastPing = Date.now();
    
    socket.data.inactivityTimeout = setInterval(() => {
      if (!socket.connected || !socket.data.device_id) {
        clearInterval(socket.data.inactivityTimeout);
        socket.data.inactivityTimeout = null;
        return;
      }
      
      const timeSinceLastPing = Date.now() - (socket.data.lastPing || 0);
      if (timeSinceLastPing > 30000) {
        // Соединение неактивно более 30 секунд - считаем его разорванным
        console.warn(`⚠️ Inactive connection timeout for device ${socket.data.device_id}, socket ${socket.id}`);
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
    }, 10000); // Проверяем каждые 10 секунд

  socket.on('control/play', ({ device_id, file }) => {
    const d = devices[device_id];
    if (!d) return;
    if (file) {
      const ext = file.split('.').pop().toLowerCase();
      const type = ext === 'pdf' ? 'pdf' : ext === 'pptx' ? 'pptx' : ['png','jpg','jpeg','gif','webp'].includes(ext) ? 'image' : 'video';
      if (type !== 'pdf' && (!Array.isArray(d.files) || !d.files.includes(file))) return;
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
    // Removed preview/refresh - no need to refresh file list on page navigation
  });

  // Функция для получения количества страниц/слайдов
  async function getPageSlideCount(deviceId, fileName, type) {
    try {
      const convertedDir = findFileFolder(deviceId, fileName);
      if (!convertedDir) return 0;
      
      const pngFiles = fs.readdirSync(convertedDir)
        .filter(f => f.toLowerCase().endsWith('.png'))
        .sort();
      
      return pngFiles.length;
    } catch (e) {
      console.warn('Failed to get page/slide count:', e);
      return 0;
    }
  }

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
    // Removed preview/refresh - no need to refresh file list on page navigation
  });
    // Обработка отключения (вызывается перед disconnect)
    socket.on('disconnecting', () => {
      const did = socket.data?.device_id;
      
      // Очищаем таймаут неактивности если есть
      if (socket.data.inactivityTimeout) {
        clearInterval(socket.data.inactivityTimeout);
        socket.data.inactivityTimeout = null;
      }
      
      if (!did) return;
      
      // Удаляем socket из Set устройства
      const sockets = deviceSockets.get(did);
      if (sockets) {
        sockets.delete(socket.id);
        
        // Если больше нет активных соединений для этого устройства
        if (sockets.size === 0) {
          deviceSockets.delete(did);
          io.emit('player/offline', { device_id: did });
        }
      }
      
      // Удаляем из активных соединений
      activeConnections.delete(socket.id);
    });
    
    socket.on('disconnect', () => {
      // Очищаем таймаут неактивности если есть
      if (socket.data.inactivityTimeout) {
        clearInterval(socket.data.inactivityTimeout);
        socket.data.inactivityTimeout = null;
      }
      
      // Дополнительная проверка на случай, если disconnecting не сработал
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
server.listen(PORT, () => console.log('Server on', PORT));
