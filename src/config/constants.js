/**
 * Константы конфигурации приложения
 * @module config/constants
 */

import path from 'path';

// Базовые пути
export const ROOT = process.cwd();
export const PUBLIC = path.join(ROOT, 'public');
export const DEVICES = path.join(PUBLIC, 'content');
export const CONVERTED_CACHE = path.join(ROOT, '.converted');

// Пути к конфигурационным файлам
export const NAMES_PATH = path.join(ROOT, 'config', 'devices.json');
export const FILE_NAMES_MAP_PATH = path.join(ROOT, 'config', 'file-names-map.json');
export const VIDEO_OPTIMIZATION_CONFIG_PATH = path.join(ROOT, 'config', 'video-optimization.json');

// Лимиты файлов
export const MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024; // 2GB
export const ALLOWED_EXT = /\.(mp4|webm|ogg|mkv|mov|avi|mp3|wav|m4a|png|jpg|jpeg|gif|webp|pdf|pptx)$/i;

// Сетевые настройки
export const PORT = process.env.PORT || 3000;
export const HOST = '127.0.0.1'; // Слушаем только localhost, доступ только через Nginx

