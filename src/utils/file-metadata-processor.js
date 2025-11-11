/**
 * File Metadata Processor - обработка и сохранение метаданных файлов
 * @module utils/file-metadata-processor
 */

import fs from 'fs';
import path from 'path';
import { calculateMD5, saveFileMetadata, findDuplicateFile } from '../database/files-metadata.js';
import { checkVideoParameters } from '../video/ffmpeg-wrapper.js';
import logger, { logFile } from '../utils/logger.js';

/**
 * Обработать загруженный файл: вычислить MD5, получить метаданные, сохранить в БД
 * @param {string} deviceId
 * @param {string} safeName
 * @param {string} originalName
 * @param {string} filePath
 * @param {string} folder - Папка устройства
 */
export async function processUploadedFile(deviceId, safeName, originalName, filePath, folder) {
  try {
    // Проверяем существование файла
    if (!fs.existsSync(filePath)) {
      logFile('warn', 'File not found for metadata processing', { deviceId, safeName, filePath });
      return;
    }
    
    const stats = fs.statSync(filePath);
    const fileSize = stats.size;
    const fileMtime = stats.mtimeMs;
    const ext = path.extname(safeName).toLowerCase();
    
    logFile('debug', 'Processing file metadata', { deviceId, safeName, fileSize });
    
    // Вычисляем MD5 (в фоне, не блокируем upload response)
    const md5Hash = await calculateMD5(filePath);
    
    logFile('debug', 'MD5 calculated', { deviceId, safeName, md5Hash });
    
    // Проверяем есть ли дубликат на других устройствах
    const duplicate = findDuplicateFile(md5Hash, fileSize, deviceId);
    if (duplicate) {
      logFile('info', 'Duplicate file detected', {
        deviceId,
        safeName,
        duplicateDevice: duplicate.device_id,
        duplicateFile: duplicate.safe_name,
        md5Hash
      });
    }
    
    let videoParams = {};
    let audioParams = {};
    let mimeType = null;
    
    // Получаем метаданные видео (если это видео)
    if (['.mp4', '.webm', '.ogg', '.mkv', '.mov', '.avi'].includes(ext)) {
      try {
        const params = await checkVideoParameters(filePath);
        if (params) {
          videoParams = {
            width: params.width,
            height: params.height,
            duration: params.duration,
            codec: params.videoCodec,
            bitrate: params.videoBitrate
          };
          audioParams = {
            codec: params.audioCodec,
            bitrate: params.audioBitrate,
            channels: params.audioChannels
          };
          mimeType = `video/${ext.substring(1)}`;
          
          logFile('debug', 'Video metadata extracted', { 
            deviceId, 
            safeName, 
            resolution: `${videoParams.width}x${videoParams.height}` 
          });
        }
      } catch (e) {
        logFile('warn', 'Failed to extract video metadata', { 
          deviceId, 
          safeName, 
          error: e.message 
        });
      }
    } else if (['.mp3', '.wav', '.m4a'].includes(ext)) {
      mimeType = `audio/${ext.substring(1)}`;
    } else if (['.png', '.jpg', '.jpeg', '.gif', '.webp'].includes(ext)) {
      mimeType = `image/${ext.substring(1).replace('jpg', 'jpeg')}`;
    } else if (ext === '.pdf') {
      mimeType = 'application/pdf';
    } else if (ext === '.pptx') {
      mimeType = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
    }
    
    // Сохраняем метаданные в БД
    saveFileMetadata({
      deviceId,
      safeName,
      originalName,
      filePath,
      fileSize,
      md5Hash,
      mimeType,
      videoParams,
      audioParams,
      fileMtime
    });
    
    logFile('info', 'File metadata saved to database', { 
      deviceId, 
      safeName, 
      md5Hash,
      duplicate: !!duplicate
    });
    
  } catch (error) {
    logger.error('Error processing file metadata', { 
      error: error.message, 
      stack: error.stack,
      deviceId, 
      safeName 
    });
  }
}

/**
 * Обработать массив загруженных файлов асинхронно
 * @param {string} deviceId
 * @param {Array} files - Массив { filename, originalname }
 * @param {string} folder - Папка устройства
 * @param {Object} fileNamesMap - Маппинг имен
 */
export async function processUploadedFilesAsync(deviceId, files, folder, fileNamesMap) {
  const promises = files.map(file => {
    const safeName = file.filename;
    const originalName = fileNamesMap[deviceId]?.[safeName] || file.originalname || safeName;
    const filePath = path.join(folder, safeName);
    
    return processUploadedFile(deviceId, safeName, originalName, filePath, folder);
  });
  
  // Обрабатываем все файлы параллельно
  await Promise.allSettled(promises);
  
  logFile('info', 'Batch file metadata processing completed', { 
    deviceId, 
    filesCount: files.length 
  });
}

