/**
 * Константы конфигурации приложения
 * @module config/constants
 */

import path from 'path';
import fs from 'fs';

// Базовые пути
export const ROOT = process.cwd();
export const PUBLIC = path.join(ROOT, 'public');

// Пути к данным - поддержка отдельного диска через переменные окружения
// DATA_ROOT - корневая папка для данных (по умолчанию: /mnt/videocontrol-data)
// Если не задана или не существует - используем локальные папки
const DATA_ROOT = process.env.DATA_ROOT || '/mnt/videocontrol-data';
const useExternalDataDisk = fs.existsSync(DATA_ROOT);

if (useExternalDataDisk) {
  console.log(`[Config] ✅ Using external data disk: ${DATA_ROOT}`);
} else {
  console.log(`[Config] ℹ️ Using local storage (DATA_ROOT not found: ${DATA_ROOT})`);
}

// DEVICES - папка с контентом устройств
export const DEVICES = useExternalDataDisk 
  ? path.join(DATA_ROOT, 'content')
  : path.join(PUBLIC, 'content');

// CONVERTED_CACHE - кэш конвертированных PDF/PPTX
export const CONVERTED_CACHE = useExternalDataDisk
  ? path.join(DATA_ROOT, 'converted')
  : path.join(ROOT, '.converted');

// Пути к конфигурационным файлам
export const NAMES_PATH = path.join(ROOT, 'config', 'devices.json');
export const FILE_NAMES_MAP_PATH = path.join(ROOT, 'config', 'file-names-map.json');
export const VIDEO_OPTIMIZATION_CONFIG_PATH = path.join(ROOT, 'config', 'video-optimization.json');

// Лимиты файлов
export const MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024; // 2GB
export const ALLOWED_EXT = /\.(mp4|webm|ogg|mkv|mov|avi|mp3|wav|m4a|png|jpg|jpeg|gif|webp|pdf|pptx|zip)$/i;

// Сетевые настройки
export const PORT = process.env.PORT || 3000;
export const HOST = '127.0.0.1'; // Слушаем только localhost, доступ только через Nginx

