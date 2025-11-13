/**
 * Files Metadata - работа с метаданными файлов в БД
 * @module database/files-metadata
 */

import crypto from 'crypto';
import fs from 'fs';
import { getDatabase } from './database.js';
import logger, { logFile } from '../utils/logger.js';

/**
 * Вычислить MD5 хэш файла (полный или частичный)
 * @param {string} filePath - Путь к файлу
 * @param {boolean} partial - Если true, хэшируем только первые 10MB (для больших файлов)
 * @returns {Promise<string>} - MD5 хэш
 */
export async function calculateMD5(filePath, partial = false) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('md5');
    
    // Определяем сколько байт читать
    const stats = fs.statSync(filePath);
    const fileSize = stats.size;
    const isBigFile = fileSize > 100 * 1024 * 1024; // >100MB
    const maxBytes = (partial && isBigFile) ? (10 * 1024 * 1024) : fileSize; // 10MB или весь файл
    
    const stream = fs.createReadStream(filePath, { 
      start: 0, 
      end: maxBytes - 1 
    });
    
    let bytesRead = 0;
    
    stream.on('data', data => {
      hash.update(data);
      bytesRead += data.length;
    });
    
    stream.on('end', () => {
      const md5 = hash.digest('hex');
      resolve(md5);
    });
    
    stream.on('error', reject);
  });
}

/**
 * Сохранить метаданные файла в БД
 * @param {Object} params
 * @param {string} params.deviceId - ID устройства
 * @param {string} params.safeName - Безопасное имя файла
 * @param {string} params.originalName - Оригинальное имя файла
 * @param {string} params.filePath - Полный путь к файлу
 * @param {number} params.fileSize - Размер файла
 * @param {string} params.md5Hash - MD5 хэш (полный)
 * @param {string} params.partialMd5 - MD5 первых 10MB (для быстрой проверки дубликатов)
 * @param {string} params.mimeType - MIME тип
 * @param {Object} params.videoParams - Параметры видео (width, height, duration, codec, bitrate)
 * @param {Object} params.audioParams - Параметры аудио (codec, bitrate, channels)
 */
export function saveFileMetadata({
  deviceId,
  safeName,
  originalName,
  filePath,
  fileSize,
  md5Hash,
  partialMd5 = null,
  mimeType = null,
  videoParams = {},
  audioParams = {},
  fileMtime
}) {
  try {
    const db = getDatabase();
    
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO files_metadata (
        device_id, safe_name, original_name, file_path, file_size, md5_hash, partial_md5, mime_type,
        video_width, video_height, video_duration, video_codec, video_profile, video_bitrate,
        audio_codec, audio_bitrate, audio_channels, file_mtime
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      deviceId,
      safeName,
      originalName,
      filePath,
      fileSize,
      md5Hash,
      partialMd5,
      mimeType,
      videoParams.width || null,
      videoParams.height || null,
      videoParams.duration || null,
      videoParams.codec || null,
      videoParams.profile || null,  // НОВОЕ: Сохраняем profile
      videoParams.bitrate || null,
      audioParams.codec || null,
      audioParams.bitrate || null,
      audioParams.channels || null,
      fileMtime
    );
    
    logFile('debug', 'File metadata saved', { deviceId, safeName, md5Hash });
    
  } catch (error) {
    logger.error('Failed to save file metadata', { 
      error: error.message, 
      deviceId, 
      safeName 
    });
  }
}

/**
 * Получить метаданные файла из БД
 * @param {string} deviceId
 * @param {string} safeName
 * @returns {Object|null}
 */
export function getFileMetadata(deviceId, safeName) {
  try {
    const db = getDatabase();
    const stmt = db.prepare(`
      SELECT * FROM files_metadata 
      WHERE device_id = ? AND safe_name = ?
    `);
    
    return stmt.get(deviceId, safeName);
  } catch (error) {
    logger.error('Failed to get file metadata', { error: error.message, deviceId, safeName });
    return null;
  }
}

/**
 * Получить все метаданные для устройства
 * @param {string} deviceId
 * @returns {Array}
 */
export function getDeviceFilesMetadata(deviceId) {
  try {
    const db = getDatabase();
    const stmt = db.prepare(`
      SELECT * FROM files_metadata 
      WHERE device_id = ?
      ORDER BY created_at DESC
    `);
    
    return stmt.all(deviceId);
  } catch (error) {
    logger.error('Failed to get device files metadata', { error: error.message, deviceId });
    return [];
  }
}

/**
 * Найти файл с таким же MD5 на другом устройстве (дедупликация)
 * @param {string} md5Hash - MD5 хэш (может быть partial или full)
 * @param {number} fileSize
 * @param {string} excludeDeviceId - Исключить это устройство из поиска
 * @param {boolean} isPartial - Является ли MD5 частичным (первые 10MB)
 * @returns {Object|null} - { device_id, safe_name, file_path }
 */
export function findDuplicateFile(md5Hash, fileSize, excludeDeviceId = null, isPartial = false) {
  try {
    const db = getDatabase();
    
    // Для больших файлов используем partial_md5, для маленьких - md5_hash
    const isBigFile = fileSize > 100 * 1024 * 1024;
    const md5Column = (isPartial || isBigFile) ? 'partial_md5' : 'md5_hash';
    
    let query = `
      SELECT device_id, safe_name, file_path, original_name, md5_hash, partial_md5
      FROM files_metadata 
      WHERE ${md5Column} = ? AND file_size = ?
    `;
    
    const params = [md5Hash, fileSize];
    
    if (excludeDeviceId) {
      query += ` AND device_id != ?`;
      params.push(excludeDeviceId);
    }
    
    query += ` LIMIT 1`;
    
    const stmt = db.prepare(query);
    const result = stmt.get(...params);
    
    if (result) {
      logger.info('Duplicate found', { 
        md5: md5Hash.substring(0, 12), 
        isPartial,
        sourceDevice: result.device_id,
        sourceFile: result.safe_name
      });
    }
    
    return result;
    
  } catch (error) {
    logger.error('Failed to find duplicate file', { error: error.message, md5Hash: md5Hash.substring(0, 12) });
    return null;
  }
}

/**
 * Удалить метаданные файла
 * @param {string} deviceId
 * @param {string} safeName
 */
export function deleteFileMetadata(deviceId, safeName) {
  try {
    const db = getDatabase();
    const stmt = db.prepare(`
      DELETE FROM files_metadata 
      WHERE device_id = ? AND safe_name = ?
    `);
    
    stmt.run(deviceId, safeName);
    logFile('debug', 'File metadata deleted', { deviceId, safeName });
    
  } catch (error) {
    logger.error('Failed to delete file metadata', { error: error.message, deviceId, safeName });
  }
}

/**
 * Удалить все метаданные устройства
 * @param {string} deviceId
 */
export function deleteDeviceFilesMetadata(deviceId) {
  try {
    const db = getDatabase();
    const stmt = db.prepare(`
      DELETE FROM files_metadata 
      WHERE device_id = ?
    `);
    
    const result = stmt.run(deviceId);
    logFile('info', 'Device files metadata deleted', { deviceId, deletedCount: result.changes });
    
    return result.changes;
  } catch (error) {
    logger.error('Failed to delete device files metadata', { error: error.message, deviceId });
    return 0;
  }
}

/**
 * Получить статистику хранилища
 * @returns {Array} - Статистика по устройствам
 */
export function getStorageStats() {
  try {
    const db = getDatabase();
    const stmt = db.prepare(`
      SELECT * FROM device_storage_stats
    `);
    
    return stmt.all();
  } catch (error) {
    logger.error('Failed to get storage stats', { error: error.message });
    return [];
  }
}

/**
 * Получить список дубликатов файлов
 * @returns {Array} - Список файлов с дубликатами
 */
export function getDuplicateFiles() {
  try {
    const db = getDatabase();
    const stmt = db.prepare(`
      SELECT * FROM file_duplicates
    `);
    
    return stmt.all();
  } catch (error) {
    logger.error('Failed to get duplicate files', { error: error.message });
    return [];
  }
}

/**
 * Проверить нужно ли обновить метаданные файла
 * (файл изменился с момента последнего сохранения)
 * @param {string} deviceId
 * @param {string} safeName
 * @param {number} currentMtime - Текущий mtime файла
 * @returns {boolean}
 */
export function needsMetadataUpdate(deviceId, safeName, currentMtime) {
  const metadata = getFileMetadata(deviceId, safeName);
  if (!metadata) return true; // Нет метаданных - нужно создать
  
  return metadata.file_mtime !== currentMtime; // Файл изменился
}

/**
 * Подсчитать количество ссылок на физический файл
 * @param {string} filePath - Путь к физическому файлу
 * @returns {number} Количество устройств использующих этот файл
 */
export function countFileReferences(filePath) {
  try {
    const db = getDatabase();
    const stmt = db.prepare(`
      SELECT COUNT(*) as count FROM files_metadata 
      WHERE file_path = ?
    `);
    
    const result = stmt.get(filePath);
    const count = result?.count || 0;
    
    logFile('debug', 'File references counted', { filePath, count });
    return count;
  } catch (error) {
    logger.error('Failed to count file references', { error: error.message, filePath });
    return 0;
  }
}

