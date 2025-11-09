/**
 * Конфигурация Multer для загрузки файлов
 * @module middleware/multer-config
 */

import multer from 'multer';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { DEVICES, MAX_FILE_SIZE, ALLOWED_EXT } from '../config/constants.js';
import { sanitizeDeviceId } from '../utils/sanitize.js';
import { fixEncoding } from '../utils/encoding.js';
import { makeSafeFilename } from '../utils/transliterate.js';

/**
 * Создает настроенный Multer middleware для загрузки файлов
 * @param {Object} devices - Объект devices
 * @returns {multer} Настроенный multer instance
 */
export function createUploadMiddleware(devices) {
  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      const id = sanitizeDeviceId(req.params.id);
      if (!id) return cb(new Error('invalid device id'));
      
      const d = devices[id];
      if (!d) return cb(new Error('device not found'));
      
      const folder = path.join(DEVICES, d.folder);
      if (!fs.existsSync(folder)) {
        fs.mkdirSync(folder, { recursive: true });
      }
      
      cb(null, folder);
    },
    
    filename: (req, file, cb) => {
      // Запрещаем загрузку файлов с зарезервированными именами
      if (file.originalname.toLowerCase() === 'default.mp4') {
        return cb(new Error('reserved filename'));
      }
      
      const id = sanitizeDeviceId(req.params.id);
      if (!id || !devices[id]) {
        return cb(new Error('device not found'));
      }
      
      let originalName = file.originalname;
      
      // Исправляем кодировку имени файла
      try {
        if (Buffer.isBuffer(originalName)) {
          originalName = originalName.toString('utf-8');
        } else if (typeof originalName === 'string') {
          const fixed = fixEncoding(originalName);
          if (fixed !== originalName) originalName = fixed;
        }
      } catch (e) {
        console.warn(`[Multer] ⚠️ Ошибка исправления кодировки: ${e.message}`);
      }
      
      const base = path.basename(originalName);
      
      // Сохраняем маппинг оригинального имени
      req.originalFileNames = req.originalFileNames || new Map();
      
      // Создаем безопасное имя файла через транслитерацию
      const safe = makeSafeFilename(base);
      const folder = path.join(DEVICES, devices[id].folder);
      const dest = path.join(folder, safe);
      
      let finalSafeName = safe;
      
      // Если файл с таким именем существует - добавляем случайный суффикс
      if (fs.existsSync(dest)) {
        const ext = path.extname(safe);
        const name = path.basename(safe, ext);
        const suffix = '_' + crypto.randomBytes(3).toString('hex');
        finalSafeName = `${name}${suffix}${ext}`;
      }
      
      req.originalFileNames.set(finalSafeName, base);
      console.log(`[Multer] 📝 "${base}" → "${finalSafeName}"`);
      cb(null, finalSafeName);
    }
  });

  const upload = multer({
    storage,
    limits: { fileSize: MAX_FILE_SIZE },
    fileFilter: (req, file, cb) => {
      if (!ALLOWED_EXT.test(file.originalname)) {
        return cb(new Error('unsupported type'));
      }
      cb(null, true);
    }
  });

  return upload;
}

