/**
 * Управление устройствами и сканирование контента (devices.json)
 * @module storage/devices-storage
 */

import fs from 'fs';
import path from 'path';
import { NAMES_PATH, DEVICES } from '../config/constants.js';
import { isSystemFile } from '../utils/sanitize.js';

/**
 * Загружает маппинг ID устройств к именам из devices.json
 * @returns {Object} Объект {deviceId: deviceName}
 */
export function loadDevicesJson() {
  try {
    const raw = fs.readFileSync(NAMES_PATH, 'utf-8');
    const parsed = JSON.parse(raw || '{}');
    if (parsed && typeof parsed === 'object') return parsed;
  } catch {}
  return {};
}

/**
 * Сохраняет маппинг ID устройств к именам в devices.json
 * @param {Object} devices - Объект devices (содержит все устройства с данными)
 */
export function saveDevicesJson(devices) {
  try {
    const mapping = Object.fromEntries(
      Object.entries(devices).map(([id, d]) => [id, d.name || id])
    );
    fs.writeFileSync(NAMES_PATH, JSON.stringify(mapping, null, 2));
  } catch (e) {
    try {
      console.warn('Failed to write devices.json', e);
    } catch {}
  }
}

/**
 * Очищает временные файлы в папках устройств
 * @param {string[]} dirs - Список директорий устройств
 */
function cleanupTempFiles(dirs) {
  console.log('[Cleanup] 🧹 Очистка временных файлов...');
  
  for (const d of dirs) {
    const folder = path.join(DEVICES, d);
    try {
      const entries = fs.readdirSync(folder);
      for (const entry of entries) {
        // Удаляем все временные файлы оптимизации и смены заглушки
        if (/^\.optimizing_/i.test(entry) || /^\.tmp_default_/i.test(entry)) {
          const tmpFile = path.join(folder, entry);
          try {
            fs.unlinkSync(tmpFile);
            console.log(`[Cleanup] 🗑️ Удален временный файл: ${entry}`);
          } catch (e) {
            console.warn(`[Cleanup] ⚠️ Не удалось удалить ${entry}: ${e.message}`);
          }
        }
      }
    } catch (e) {
      console.warn(`[Cleanup] ⚠️ Ошибка очистки папки ${d}: ${e.message}`);
    }
  }
  
  console.log('[Cleanup] ✅ Очистка завершена');
}

/**
 * Сканирует папки устройств и обновляет объект devices
 * @param {Object} devices - Объект devices (будет обновлен)
 * @param {Object} savedNames - Сохраненные имена устройств из devices.json
 * @param {Object} fileNamesMap - Маппинг оригинальных имен файлов
 * @returns {Object} Обновленный объект devices
 */
export function scan(devices, savedNames, fileNamesMap) {
  const dirs = fs.readdirSync(DEVICES).filter(d => 
    fs.statSync(path.join(DEVICES, d)).isDirectory()
  );
  
  // КРИТИЧНО: Очистка временных файлов оптимизации при запуске сервера
  cleanupTempFiles(dirs);
  
  // Сканируем каждую папку устройства
  for (const d of dirs) {
    const id = d;
    const folder = path.join(DEVICES, d);
    
    // Сканируем файлы (включая PDF/PPTX папки показываемые как файлы)
    const result = [];
    const fileNames = [];
    
    if (fs.existsSync(folder)) {
      const entries = fs.readdirSync(folder);
      
      for (const entry of entries) {
        const entryPath = path.join(folder, entry);
        const stat = fs.statSync(entryPath);
        
        if (stat.isFile()) {
          // Пропускаем системные файлы (default.*, .optimizing_*, .tmp_*, etc.)
          if (!isSystemFile(entry)) {
            result.push(entry);
            // Используем оригинальное имя если есть маппинг
            const originalName = fileNamesMap[id]?.[entry] || entry;
            fileNames.push(originalName);
          }
        } else if (stat.isDirectory()) {
          // Обрабатываем папки PDF/PPTX
          const folderContents = fs.readdirSync(entryPath);
          const originalFile = folderContents.find(f => /\.(pdf|pptx)$/i.test(f));
          
          if (originalFile) {
            result.push(originalFile);
            // Для PDF/PPTX используем имя папки или оригинальное имя
            const originalName = fileNamesMap[id]?.[entry] || originalFile;
            fileNames.push(originalName);
          } else {
            // Проверяем, есть ли изображения в папке (папка изображений)
            const hasImages = folderContents.some(f => /\.(png|jpg|jpeg|gif|webp)$/i.test(f));
            if (hasImages) {
              // Это папка с изображениями - добавляем её как файл
              result.push(entry); // Добавляем имя папки
              // Используем оригинальное имя если есть маппинг
              const originalName = fileNamesMap[id]?.[entry] || entry;
              fileNames.push(originalName);
            }
          }
        }
      }
    }
    
    const name = savedNames[id] || id;
    
    // Инициализируем или обновляем устройство
    devices[id] ??= {
      name,
      folder: d,
      files: result,
      fileNames: fileNames,
      current: { type: 'idle', file: null, state: 'idle' }
    };
    
    // Сохраняем имя если уже существует, но предпочитаем сохраненное значение
    if (savedNames[id]) {
      devices[id].name = savedNames[id];
    }
    
    devices[id].files = result;
    devices[id].fileNames = fileNames;
  }
  
  return devices;
}

