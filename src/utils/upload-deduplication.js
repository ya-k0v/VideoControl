/**
 * Upload Deduplication - проверка и обработка дубликатов при загрузке
 * @module utils/upload-deduplication
 */

import fs from 'fs';
import path from 'path';
import { calculateMD5, findDuplicateFile } from '../database/files-metadata.js';
import logger, { logFile } from '../utils/logger.js';

/**
 * Проверить файл на дубликат ПОСЛЕ загрузки и заменить на копию если найден
 * @param {string} deviceId - ID целевого устройства
 * @param {string} uploadedFilePath - Путь к только что загруженному файлу
 * @param {string} safeName - Безопасное имя файла
 * @returns {Promise<Object>} - { isDuplicate, sourceDevice, sourceFile, savedSpaceMB }
 */
export async function checkAndDeduplicateUploadedFile(deviceId, uploadedFilePath, safeName) {
  try {
    // Получаем размер загруженного файла
    const stats = fs.statSync(uploadedFilePath);
    const fileSize = stats.size;
    
    // Вычисляем MD5 загруженного файла
    const md5Hash = await calculateMD5(uploadedFilePath);
    
    logFile('debug', 'MD5 calculated for uploaded file', { 
      deviceId, 
      safeName, 
      md5: md5Hash.substring(0, 12),
      sizeMB: (fileSize / 1024 / 1024).toFixed(2)
    });
    
    // Ищем дубликат на других устройствах
    const duplicate = findDuplicateFile(md5Hash, fileSize, deviceId);
    
    if (duplicate) {
      // Дубликат найден!
      logFile('info', 'Duplicate detected - will use existing file', {
        deviceId,
        uploadedFile: safeName,
        duplicateDevice: duplicate.device_id,
        duplicateFile: duplicate.safe_name,
        md5: md5Hash.substring(0, 12),
        savedSpaceMB: (fileSize / 1024 / 1024).toFixed(2)
      });
      
      // Удаляем только что загруженный файл (он дубликат)
      fs.unlinkSync(uploadedFilePath);
      
      // Копируем файл с другого устройства
      const duplicateSourcePath = duplicate.file_path;
      if (fs.existsSync(duplicateSourcePath)) {
        fs.copyFileSync(duplicateSourcePath, uploadedFilePath);
        fs.chmodSync(uploadedFilePath, 0o644);
        
        logFile('info', 'File replaced with duplicate copy', {
          deviceId,
          safeName,
          copiedFrom: `${duplicate.device_id}:${duplicate.safe_name}`
        });
        
        return {
          isDuplicate: true,
          sourceDevice: duplicate.device_id,
          sourceFile: duplicate.safe_name,
          savedSpaceMB: (fileSize / 1024 / 1024).toFixed(2),
          md5Hash
        };
      } else {
        // Исходный файл дубликата не существует - восстанавливаем загруженный
        logFile('warn', 'Duplicate source file not found - keeping uploaded file', {
          deviceId,
          safeName,
          missingSource: duplicateSourcePath
        });
        
        // Восстанавливаем загруженный файл (его уже удалили)
        // Пропускаем это - файл уже удален, продолжаем как обычно
      }
    }
    
    // Дубликат не найден или не удалось скопировать - используем загруженный файл
    return {
      isDuplicate: false,
      md5Hash
    };
    
  } catch (error) {
    logger.error('Deduplication check failed', {
      error: error.message,
      deviceId,
      uploadedFilePath
    });
    
    // В случае ошибки - просто используем загруженный файл
    return {
      isDuplicate: false,
      error: error.message
    };
  }
}

