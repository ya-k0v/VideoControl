/**
 * Конвертация ZIP архивов в папки с изображениями
 * @module converters/folder-converter
 */

import fs from 'fs';
import path from 'path';
import { exec as execCallback } from 'child_process';
import util from 'util';
import { DEVICES, CONVERTED_CACHE } from '../config/constants.js';
import { makeSafeFolderName } from '../utils/transliterate.js';

const exec = util.promisify(execCallback);

/**
 * Распаковать ZIP архив с изображениями в папку
 * @param {string} deviceId - ID устройства
 * @param {string} zipFileName - Имя ZIP файла
 * @returns {Promise<{success: boolean, error?: string, imagesCount?: number}>}
 */
export async function extractZipToFolder(deviceId, zipFileName) {
  try {
    const deviceFolder = path.join(DEVICES, deviceId);
    const zipPath = path.join(deviceFolder, zipFileName);
    
    if (!fs.existsSync(zipPath)) {
      return { success: false, error: 'ZIP file not found' };
    }
    
    // Создаем папку для изображений (без расширения .zip)
    const originalFolderName = zipFileName.replace(/\.zip$/i, '');
    const folderName = makeSafeFolderName(originalFolderName); // Транслитерация
    const outputFolder = path.join(deviceFolder, folderName);
    
    console.log(`[FolderConverter] 📝 Имя папки: "${originalFolderName}" → "${folderName}"`);
    
    // Если папка уже существует, удаляем её
    if (fs.existsSync(outputFolder)) {
      fs.rmSync(outputFolder, { recursive: true, force: true });
    }
    
    // Создаем новую папку
    fs.mkdirSync(outputFolder, { recursive: true });
    
    console.log(`[FolderConverter] 📦 Распаковка ZIP: ${zipFileName} -> ${folderName}/`);
    
    // Распаковываем ZIP с помощью unzip (доступен на большинстве Linux систем)
    try {
      await exec(`unzip -q "${zipPath}" -d "${outputFolder}"`);
    } catch (err) {
      // Если unzip недоступен, пробуем 7z
      console.log('[FolderConverter] unzip недоступен, пробую 7z...');
      await exec(`7z x "${zipPath}" -o"${outputFolder}" -y`);
    }
    
    // Проверяем, что внутри есть изображения
    const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp'];
    const allFiles = [];
    
    function scanDirectory(dir) {
      const items = fs.readdirSync(dir);
      for (const item of items) {
        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory()) {
          scanDirectory(fullPath);
        } else if (stat.isFile()) {
          const ext = path.extname(item).toLowerCase();
          if (imageExtensions.includes(ext)) {
            allFiles.push(fullPath);
          }
        }
      }
    }
    
    scanDirectory(outputFolder);
    
    if (allFiles.length === 0) {
      // Если изображений нет, удаляем папку и ZIP
      fs.rmSync(outputFolder, { recursive: true, force: true });
      fs.unlinkSync(zipPath);
      return { success: false, error: 'No images found in ZIP archive' };
    }
    
    // Сортируем изображения по имени
    allFiles.sort((a, b) => {
      const nameA = path.basename(a).toLowerCase();
      const nameB = path.basename(b).toLowerCase();
      return nameA.localeCompare(nameB, undefined, { numeric: true });
    });
    
    // КРИТИЧНО: Если изображения находятся в подпапках, перемещаем их в корень папки
    let movedCount = 0;
    for (let i = 0; i < allFiles.length; i++) {
      const file = allFiles[i];
      const relativePath = path.relative(outputFolder, file);
      
      // Если файл в подпапке
      if (relativePath.includes(path.sep)) {
        const ext = path.extname(file);
        const newName = `image_${String(i + 1).padStart(4, '0')}${ext}`;
        const newPath = path.join(outputFolder, newName);
        
        fs.renameSync(file, newPath);
        allFiles[i] = newPath;
        movedCount++;
      }
    }
    
    if (movedCount > 0) {
      console.log(`[FolderConverter] 📁 Перемещено файлов из подпапок: ${movedCount}`);
      
      // Удаляем пустые подпапки
      const subdirs = fs.readdirSync(outputFolder, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => path.join(outputFolder, dirent.name));
      
      for (const subdir of subdirs) {
        try {
          fs.rmSync(subdir, { recursive: true, force: true });
        } catch (e) {
          console.warn(`[FolderConverter] ⚠️ Не удалось удалить подпапку ${subdir}:`, e);
        }
      }
    }
    
    // Устанавливаем права на папку и все файлы внутри
    fs.chmodSync(outputFolder, 0o755);
    allFiles.forEach(file => {
      try {
        fs.chmodSync(file, 0o644);
      } catch (e) {
        console.warn(`[FolderConverter] ⚠️ Не удалось установить права на ${file}:`, e);
      }
    });
    
    // Удаляем исходный ZIP файл
    fs.unlinkSync(zipPath);
    
    console.log(`[FolderConverter] ✅ ZIP распакован: ${allFiles.length} изображений`);
    
    return { 
      success: true, 
      imagesCount: allFiles.length,
      folderName: folderName,
      originalFolderName: originalFolderName
    };
    
  } catch (error) {
    console.error('[FolderConverter] ❌ Ошибка распаковки ZIP:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Получить список изображений в папке
 * @param {string} deviceId - ID устройства
 * @param {string} folderName - Имя папки
 * @returns {Promise<string[]>} Список файлов изображений
 */
export async function getFolderImages(deviceId, folderName) {
  try {
    const folderPath = path.join(DEVICES, deviceId, folderName);
    
    if (!fs.existsSync(folderPath)) {
      return [];
    }
    
    const stat = fs.statSync(folderPath);
    if (!stat.isDirectory()) {
      return [];
    }
    
    const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp'];
    const files = fs.readdirSync(folderPath)
      .filter(file => {
        const ext = path.extname(file).toLowerCase();
        return imageExtensions.includes(ext);
      })
      .sort((a, b) => {
        // Сортировка с учетом чисел
        return a.localeCompare(b, undefined, { numeric: true });
      });
    
    return files;
  } catch (error) {
    console.error('[FolderConverter] ❌ Ошибка чтения папки:', error);
    return [];
  }
}

/**
 * Получить количество изображений в папке
 * @param {string} deviceId - ID устройства
 * @param {string} folderName - Имя папки
 * @returns {Promise<number>} Количество изображений
 */
export async function getFolderImagesCount(deviceId, folderName) {
  const images = await getFolderImages(deviceId, folderName);
  return images.length;
}

/**
 * Найти папку для файла (если это папка с изображениями)
 * @param {string} deviceId - ID устройства
 * @param {string} fileName - Имя файла или папки
 * @returns {string|null} Путь к папке или null
 */
export function findImageFolder(deviceId, fileName) {
  try {
    // Убираем расширение .zip если есть
    const baseName = fileName.replace(/\.zip$/i, '');
    const folderPath = path.join(DEVICES, deviceId, baseName);
    
    if (fs.existsSync(folderPath)) {
      const stat = fs.statSync(folderPath);
      if (stat.isDirectory()) {
        return folderPath;
      }
    }
    
    return null;
  } catch (error) {
    return null;
  }
}

