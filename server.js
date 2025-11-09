import express from 'express';
import http from 'http';
import fs from 'fs';
import path from 'path';
import mime from 'mime';
import multer from 'multer';
import crypto from 'crypto';
import util from "util";
import { fromPath } from "pdf2pic";
import { exec as execCallback, spawn } from "child_process";
import { PDFDocument } from 'pdf-lib';

// Импорты из модулей
import { 
  ROOT, PUBLIC, DEVICES, CONVERTED_CACHE, NAMES_PATH, 
  FILE_NAMES_MAP_PATH, MAX_FILE_SIZE, ALLOWED_EXT, PORT, HOST 
} from './src/config/constants.js';
import { createSocketServer } from './src/config/socket-config.js';
import { sanitizeDeviceId, isSystemFile } from './src/utils/sanitize.js';
import { fixEncoding } from './src/utils/encoding.js';
import { loadDevicesJson, saveDevicesJson, scan } from './src/storage/devices-storage.js';
import { loadFileNamesMap, saveFileNamesMap } from './src/storage/filenames-storage.js';
import { getFileStatuses, getFileStatus, setFileStatus, deleteFileStatus } from './src/video/file-status.js';
import { checkVideoParameters } from './src/video/ffmpeg-wrapper.js';
import { getVideoOptConfig, needsOptimization, autoOptimizeVideo } from './src/video/optimizer.js';
import { 
  getPdfPageCount, convertPdfToImages, convertPptxToImages, 
  findFileFolder, getPageSlideCount, autoConvertFile 
} from './src/converters/document-converter.js';
import { createDevicesRouter } from './src/routes/devices.js';
import { createPlaceholderRouter } from './src/routes/placeholder.js';
import { createFilesRouter } from './src/routes/files.js';
import { createVideoInfoRouter } from './src/routes/video-info.js';
import { createConversionRouter } from './src/routes/conversion.js';
import { createSystemInfoRouter } from './src/routes/system-info.js';
import { createUploadMiddleware } from './src/middleware/multer-config.js';
import { setupExpressMiddleware, setupStaticFiles } from './src/middleware/express-config.js';
import { setupSocketHandlers } from './src/socket/index.js';

const execAsync = util.promisify(execCallback);

const app = express();
const server = http.createServer(app);
const io = createSocketServer(server);

// Создаем папки если не существуют
if (!fs.existsSync(CONVERTED_CACHE)) fs.mkdirSync(CONVERTED_CACHE, { recursive: true });
if (!fs.existsSync(DEVICES)) fs.mkdirSync(DEVICES, { recursive: true });

// ========================================
// EXPRESS MIDDLEWARE
// ========================================
// (Модули: src/middleware/express-config.js, src/middleware/multer-config.js)

setupExpressMiddleware(app);
setupStaticFiles(app);

// Инициализация данных
let devices = {};
let savedNames = {};
let fileNamesMap = {};

// Загружаем данные и сканируем папки устройств
savedNames = loadDevicesJson();
fileNamesMap = loadFileNamesMap(fileNamesMap, (map) => saveFileNamesMap(map));
scan(devices, savedNames, fileNamesMap);

// Сохраняем начальное состояние
saveDevicesJson(devices);

// ========================================
// UPLOAD MIDDLEWARE
// ========================================
// Создаем upload middleware после инициализации devices
const upload = createUploadMiddleware(devices);

// ========================================
// API ROUTES (Модульные роутеры)
// ========================================

// Подключаем роутеры с зависимостями
const devicesRouter = createDevicesRouter({ 
  devices, 
  io, 
  saveDevicesJson, 
  fileNamesMap, 
  saveFileNamesMap 
});

const placeholderRouter = createPlaceholderRouter({ 
  devices, 
  io 
});

const filesRouter = createFilesRouter({
  devices,
  io,
  fileNamesMap,
  saveFileNamesMap,
  upload,
  autoConvertFileWrapper,
  autoOptimizeVideoWrapper,
  checkVideoParameters,
  getFileStatus
});

const videoInfoRouter = createVideoInfoRouter({
  devices,
  getFileStatus,
  checkVideoParameters,
  autoOptimizeVideoWrapper
});

const conversionRouter = createConversionRouter({
  devices,
  getPageSlideCount,
  findFileFolder,
  autoConvertFileWrapper
});

app.use('/api/devices', devicesRouter);
app.use('/api/devices', placeholderRouter);
app.use('/api/devices', filesRouter);
app.use('/api/devices', videoInfoRouter);
app.use('/api/devices', conversionRouter);

// System info router
const systemInfoRouter = createSystemInfoRouter();
app.use('/api/system', systemInfoRouter);

// ========================================
// ВСЕ API ROUTES ПЕРЕНЕСЕНЫ В МОДУЛИ src/routes/
// ========================================
// - devices.js: CRUD операций с устройствами
// - placeholder.js: Управление заглушками
// - files.js: Upload, copy, rename, delete, list файлов
// - video-info.js: Статус, информация и оптимизация видео
// - conversion.js: PDF/PPTX конвертация

// ========================================
// DOCUMENT CONVERSION (PDF/PPTX)
// ========================================
// (Модуль: src/converters/document-converter.js)

// ========================================
// VIDEO OPTIMIZATION для Android TV
// ========================================
// (Модули: src/video/optimizer.js, src/video/ffmpeg-wrapper.js, src/video/file-status.js)

// Получаем ссылки на модули
const videoOptConfig = getVideoOptConfig();
const fileStatuses = getFileStatuses();

// Оберточные функции для совместимости с существующим кодом
async function autoOptimizeVideoWrapper(deviceId, fileName) {
  return await autoOptimizeVideo(deviceId, fileName, devices, io, fileNamesMap, (map) => saveFileNamesMap(map));
}

async function autoConvertFileWrapper(deviceId, fileName) {
  return await autoConvertFile(deviceId, fileName, devices, fileNamesMap, (map) => saveFileNamesMap(map));
}

// ========================================
// SOCKET.IO CONNECTION HANDLING
// ========================================

// Все Socket.IO handlers перенесены в модули src/socket/

// Настраиваем Socket.IO обработчики
setupSocketHandlers(io, { devices, getPageSlideCount });

// Запуск сервера
server.listen(PORT, HOST, () => {
  console.log(`Server on ${HOST}:${PORT} (доступен только через Nginx)`);
});
