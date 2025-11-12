/**
 * Управление устройствами через SQLite
 * @module storage/devices-storage-sqlite
 */

import fs from 'fs';
import path from 'path';
import { 
  getAllDevices, 
  saveDevice, 
  deleteDevice,
  getAllFileNames,
  saveFileName,
  deleteDeviceFileNames
} from '../database/database.js';
import { DEVICES } from '../config/constants.js';
import { isSystemFile } from '../utils/sanitize.js';

/**
 * Загрузить устройства из БД
 * @returns {Object} devices
 */
export function loadDevicesFromDB() {
  console.log('[DB] 📂 Loading devices from SQLite...');
  const devices = getAllDevices();
  console.log(`[DB] ✅ Loaded ${Object.keys(devices).length} devices`);
  return devices;
}

/**
 * Сохранить устройства в БД
 * @param {Object} devices 
 */
export function saveDevicesToDB(devices) {
  for (const [deviceId, data] of Object.entries(devices)) {
    saveDevice(deviceId, data);
  }
  console.log(`[DB] ✅ Saved ${Object.keys(devices).length} devices`);
}

/**
 * Загрузить маппинг имен файлов из БД
 * @returns {Object} fileNamesMap
 */
export function loadFileNamesFromDB() {
  console.log('[DB] 📂 Loading file names from SQLite...');
  const fileNamesMap = getAllFileNames();
  const totalFiles = Object.values(fileNamesMap).reduce((sum, dev) => sum + Object.keys(dev).length, 0);
  console.log(`[DB] ✅ Loaded ${totalFiles} file name mappings`);
  return fileNamesMap;
}

/**
 * Сохранить маппинг имен файлов в БД
 * @param {Object} fileNamesMap 
 */
export function saveFileNamesToDB(fileNamesMap) {
  let total = 0;
  for (const [deviceId, mappings] of Object.entries(fileNamesMap)) {
    for (const [safeName, originalName] of Object.entries(mappings)) {
      saveFileName(deviceId, safeName, originalName);
      total++;
    }
  }
  console.log(`[DB] ✅ Saved ${total} file name mappings`);
}

/**
 * Сканировать файлы устройства
 * @param {string} deviceId 
 * @param {string} deviceFolder 
 * @param {Object} fileNamesMap 
 * @returns {Object} {files, fileNames}
 */
export function scanDeviceFiles(deviceId, deviceFolder, fileNamesMap) {
  const files = [];
  const fileNames = [];
  
  if (!fs.existsSync(deviceFolder)) {
    return { files, fileNames };
  }
  
  const entries = fs.readdirSync(deviceFolder);
  
  for (const entry of entries) {
    const entryPath = path.join(deviceFolder, entry);
    const stat = fs.statSync(entryPath);
    
    if (stat.isFile()) {
      if (!isSystemFile(entry)) {
        files.push(entry);
        const originalName = fileNamesMap[deviceId]?.[entry] || entry;
        fileNames.push(originalName);
      }
    } else if (stat.isDirectory()) {
      // Папки (PDF/PPTX конвертированные или папки с изображениями)
      const folderContents = fs.readdirSync(entryPath);
      const originalFile = folderContents.find(f => /\.(pdf|pptx)$/i.test(f));
      
      if (originalFile) {
        // PDF/PPTX папка - добавляем с расширением
        const fullName = entry + path.extname(originalFile);
        files.push(fullName);
        const originalName = fileNamesMap[deviceId]?.[entry] || fullName;
        fileNames.push(originalName);
      } else {
        // Проверяем, есть ли изображения в папке (папка изображений)
        const hasImages = folderContents.some(f => /\.(png|jpg|jpeg|gif|webp)$/i.test(f));
        if (hasImages) {
          // Это папка с изображениями - добавляем её как файл
          files.push(entry); // Добавляем имя папки
        const originalName = fileNamesMap[deviceId]?.[entry] || entry;
        fileNames.push(originalName);
        }
      }
    }
  }
  
  return { files, fileNames };
}

/**
 * Сканировать все устройства
 * @param {Object} devices 
 * @param {Object} fileNamesMap 
 */
export function scanAllDevices(devices, fileNamesMap) {
  console.log('[Scan] 🔍 Scanning all device folders...');
  
  for (const [deviceId, device] of Object.entries(devices)) {
    const deviceFolder = path.join(DEVICES, device.folder);
    const result = scanDeviceFiles(deviceId, deviceFolder, fileNamesMap);
    
    device.files = result.files;
    device.fileNames = result.fileNames;
    
    console.log(`[Scan] ✅ ${deviceId}: ${result.files.length} files`);
  }
  
  console.log('[Scan] ✅ All devices scanned');
}

