/**
 * Утилиты для работы с файлами
 * @module shared/file-utils
 */

import { FILE_EXTENSIONS, getResolutionLabel, getFileTypeLabel } from './constants.js';

/**
 * Проверить является ли файл видео
 * @param {string} fileName - Имя файла
 * @returns {boolean} true если видео
 */
export function isVideoFile(fileName) {
  const ext = fileName.split('.').pop().toLowerCase();
  return FILE_EXTENSIONS.video.includes(ext);
}

/**
 * Проверить является ли файл изображением
 * @param {string} fileName - Имя файла
 * @returns {boolean} true если изображение
 */
export function isImageFile(fileName) {
  const ext = fileName.split('.').pop().toLowerCase();
  return FILE_EXTENSIONS.image.includes(ext);
}

/**
 * Проверить является ли файл документом
 * @param {string} fileName - Имя файла
 * @returns {boolean} true если документ
 */
export function isDocumentFile(fileName) {
  const ext = fileName.split('.').pop().toLowerCase();
  return FILE_EXTENSIONS.document.includes(ext);
}

/**
 * Проверить можно ли файл использовать как заглушку
 * @param {string} fileName - Имя файла
 * @returns {boolean} true если можно
 */
export function canBeDefaultFile(fileName) {
  const ext = fileName.split('.').pop().toLowerCase();
  return [...FILE_EXTENSIONS.video, ...FILE_EXTENSIONS.audio, ...FILE_EXTENSIONS.image].includes(ext);
}

/**
 * Форматировать размер файла
 * @param {number} bytes - Размер в байтах
 * @returns {string} Отформатированный размер
 */
export function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

/**
 * Получить информацию о файле для UI
 * @param {string} safeName - Безопасное имя файла
 * @param {string} originalName - Оригинальное имя файла
 * @param {Object} resolution - Разрешение видео {width, height}
 * @returns {Object} Информация о файле
 */
export function getFileDisplayInfo(safeName, originalName, resolution = null) {
  const ext = safeName.split('.').pop().toLowerCase();
  const typeLabel = getFileTypeLabel(safeName);
  const isVideo = isVideoFile(safeName);
  
  let resolutionLabel = '';
  if (isVideo && resolution) {
    resolutionLabel = getResolutionLabel(resolution.width, resolution.height);
  }
  
  const displayName = originalName.replace(/\.[^.]+$/, ''); // Убираем расширение
  
  return {
    safeName,
    originalName,
    displayName,
    ext,
    typeLabel,
    resolutionLabel,
    isVideo,
    isImage: isImageFile(safeName),
    isDocument: isDocumentFile(safeName),
    canBeDefault: canBeDefaultFile(safeName)
  };
}

// Экспортируем также для удобства
export { getResolutionLabel, getFileTypeLabel };

