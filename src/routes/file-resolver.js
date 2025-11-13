/**
 * File Resolver - резолвинг путей файлов для единого хранилища
 * @module routes/file-resolver
 */

import express from 'express';
import fs from 'fs';
import path from 'path';
import { getFileMetadata } from '../database/files-metadata.js';
import { sanitizeDeviceId } from '../utils/sanitize.js';
import logger from '../utils/logger.js';

const router = express.Router();

/**
 * GET /api/files/resolve/:deviceId/:fileName
 * Резолвит виртуальный путь в физический и отдает файл
 */
router.get('/resolve/:deviceId/:fileName(*)', (req, res) => {
  const deviceId = sanitizeDeviceId(req.params.deviceId);
  const fileName = req.params.fileName;
  
  if (!deviceId || !fileName) {
    return res.status(400).send('Invalid parameters');
  }
  
  // Ищем файл в БД
  const metadata = getFileMetadata(deviceId, fileName);
  
  if (!metadata) {
    logger.warn('[Resolver] File not found in DB', { deviceId, fileName });
    return res.status(404).send('File not found');
  }
  
  // Проверяем существование физического файла
  if (!fs.existsSync(metadata.file_path)) {
    logger.error('[Resolver] Physical file missing', { 
      deviceId, 
      fileName, 
      expectedPath: metadata.file_path 
    });
    return res.status(404).send('Physical file not found');
  }
  
  // Отдаем файл с поддержкой Range requests (для seek в видео)
  const options = {
    root: '/',  // Абсолютный путь
    headers: {
      'Content-Type': metadata.mime_type || 'application/octet-stream',
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'public, max-age=3600',
      'X-File-Hash': metadata.md5_hash?.substring(0, 12) || 'unknown'
    }
  };
  
  logger.debug('[Resolver] Serving file', { 
    deviceId, 
    requestedName: fileName,
    physicalPath: metadata.file_path,
    size: metadata.file_size
  });
  
  // Логируем Range запрос (если есть)
  if (req.headers.range) {
    logger.debug('[Resolver] Range request', {
      deviceId,
      fileName,
      range: req.headers.range,
      fileSize: metadata.file_size
    });
  }
  
  // Отправляем файл (Express автоматически обрабатывает Range requests)
  res.sendFile(metadata.file_path, options, (err) => {
    if (err) {
      // ИСПРАВЛЕНО: Правильно обрабатываем ошибку Range Not Satisfiable
      if (err.message === 'Range Not Satisfiable') {
        logger.warn('[Resolver] Range not satisfiable', { 
          deviceId, 
          fileName,
          range: req.headers.range,
          fileSize: metadata.file_size
        });
        if (!res.headersSent) {
          res.status(416).set('Content-Range', `bytes */${metadata.file_size}`).send('Range Not Satisfiable');
        }
      } else {
        logger.error('[Resolver] Error sending file', { 
          error: err.message, 
          deviceId, 
          fileName,
          statusCode: err.statusCode || err.status
        });
        if (!res.headersSent) {
          res.status(err.statusCode || err.status || 500).send('Error sending file');
        }
      }
    }
  });
});

export default router;

