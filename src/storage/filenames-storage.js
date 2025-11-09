/**
 * Управление маппингом имен файлов (file-names-map.json)
 * @module storage/filenames-storage
 */

import fs from 'fs';
import { FILE_NAMES_MAP_PATH } from '../config/constants.js';
import { fixEncoding } from '../utils/encoding.js';

/**
 * Загружает маппинг имен файлов из JSON
 * @param {Object} fileNamesMap - Текущий объект маппинга (будет обновлен если нужно)
 * @param {Function} saveFn - Функция для сохранения (передается для избежания циклических зависимостей)
 * @returns {Object} Маппинг имен файлов
 */
export function loadFileNamesMap(fileNamesMap = {}, saveFn = null) {
  try {
    if (!fs.existsSync(FILE_NAMES_MAP_PATH)) return {};
    
    const raw = fs.readFileSync(FILE_NAMES_MAP_PATH, 'utf-8');
    const parsed = JSON.parse(raw || '{}');
    
    if (parsed && typeof parsed === 'object') {
      // Исправляем кодировки в именах файлов
      const fixed = {};
      for (const [deviceId, fileMap] of Object.entries(parsed)) {
        if (fileMap && typeof fileMap === 'object') {
          fixed[deviceId] = {};
          for (const [safeName, originalName] of Object.entries(fileMap)) {
            fixed[deviceId][safeName] = fixEncoding(originalName);
          }
        }
      }
      
      // Проверяем нужно ли пересохранить с исправленными кодировками
      let needsSave = false;
      for (const [deviceId, fileMap] of Object.entries(parsed)) {
        if (fileMap && typeof fileMap === 'object') {
          for (const [safeName, originalName] of Object.entries(fileMap)) {
            if (fixEncoding(originalName) !== originalName) {
              needsSave = true;
              break;
            }
          }
          if (needsSave) break;
        }
      }
      
      // Автоматически сохраняем исправленные данные
      if (needsSave && saveFn) {
        Object.assign(fileNamesMap, fixed);
        saveFn(fileNamesMap);
      }
      
      return fixed;
    }
  } catch (e) {
    console.error(`[FileNamesMap] ❌ Ошибка загрузки: ${e.message}`);
  }
  return {};
}

/**
 * Сохраняет маппинг имен файлов в JSON
 * @param {Object} fileNamesMap - Объект маппинга для сохранения
 */
export function saveFileNamesMap(fileNamesMap) {
  try {
    fs.writeFileSync(FILE_NAMES_MAP_PATH, JSON.stringify(fileNamesMap, null, 2), 'utf-8');
    console.log(`[FileNamesMap] ✅ Сохранено в ${FILE_NAMES_MAP_PATH}`);
  } catch (e) {
    console.error(`[FileNamesMap] ❌ Ошибка сохранения: ${e}`);
  }
}

