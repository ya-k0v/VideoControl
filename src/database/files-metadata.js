/**
 * Files Metadata - работа с метаданными файлов в БД
 * @module database/files-metadata
 */

import crypto from 'crypto';
import fs from 'fs';
import { getDatabase } from './database.js';
import logger, { logFile } from '../utils/logger.js';

/**
 * Вычислить MD5 хэш файла
 * @param {string} filePath - Путь к файлу
 * @returns {Promise<string>} - MD5 хэш
 */
export async function calculateMD5(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('md5');
    const stream = fs.createReadStream(filePath);
    
    stream.on('data', data => hash.update(data));
    stream.on('end', () => resolve(hash.digest('hex')));
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
 * @param {string} params.md5Hash - MD5 хэш
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
  mimeType = null,
  videoParams = {},
  audioParams = {},
  fileMtime
}) {
  try {
    const db = getDatabase();
    
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO files_metadata (
        device_id, safe_name, original_name, file_path, file_size, md5_hash, mime_type,
        video_width, video_height, video_duration, video_codec, video_bitrate,
        audio_codec, audio_bitrate, audio_channels, file_mtime
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      deviceId,
      safeName,
      originalName,
      filePath,
      fileSize,
      md5Hash,
      mimeType,
      videoParams.width || null,
      videoParams.height || null,
      videoParams.duration || null,
      videoParams.codec || null,
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
 * @param {string} md5Hash
 * @param {number} fileSize
 * @param {string} excludeDeviceId - Исключить это устройство из поиска
 * @returns {Object|null} - { device_id, safe_name, file_path }
 */
export function findDuplicateFile(md5Hash, fileSize, excludeDeviceId = null) {
  try {
    const db = getDatabase();
    
    let query = `
      SELECT device_id, safe_name, file_path, original_name
      FROM files_metadata 
      WHERE md5_hash = ? AND file_size = ?
    `;
    
    const params = [md5Hash, fileSize];
    
    if (excludeDeviceId) {
      query += ` AND device_id != ?`;
      params.push(excludeDeviceId);
    }
    
    query += ` LIMIT 1`;
    
    const stmt = db.prepare(query);
    return stmt.get(...params);
    
  } catch (error) {
    logger.error('Failed to find duplicate file', { error: error.message, md5Hash });
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

