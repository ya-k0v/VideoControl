/**
 * API Routes для управления файлами устройств
 * @module routes/files
 */

import express from 'express';
import fs from 'fs';
import path from 'path';
import { DEVICES, ALLOWED_EXT } from '../config/constants.js';
import { sanitizeDeviceId, isSystemFile } from '../utils/sanitize.js';

const router = express.Router();

/**
 * Настройка роутера для файлов
 * @param {Object} deps - Зависимости
 * @returns {express.Router} Настроенный роутер
 */
export function createFilesRouter(deps) {
  const { 
    devices, 
    io, 
    fileNamesMap, 
    saveFileNamesMap, 
    upload,
    autoConvertFileWrapper,
    autoOptimizeVideoWrapper,
    checkVideoParameters,
    getFileStatus
  } = deps;
  
  // POST /api/devices/:id/upload - Загрузка файлов
  router.post('/:id/upload', async (req, res, next) => {
    const id = sanitizeDeviceId(req.params.id);
    
    if (!id) {
      return res.status(400).json({ error: 'invalid device id' });
    }
    
    if (!devices[id]) {
      return res.status(404).json({ error: 'device not found' });
    }
    
    upload.array('files', 50)(req, res, async (err) => {
      if (err) {
        return res.status(400).json({ error: err.message });
      }
      
      const uploaded = (req.files || []).map(f => f.filename);
      
      // КРИТИЧНО: Устанавливаем права 644 на все загруженные файлы
      // Чтобы Nginx (www-data) мог их прочитать
      const folder = path.join(DEVICES, devices[id].folder);
      for (const file of (req.files || [])) {
        try {
          const filePath = path.join(folder, file.filename);
          fs.chmodSync(filePath, 0o644);
          console.log(`[upload] ✅ Права 644 установлены: ${file.filename}`);
        } catch (e) {
          console.warn(`[upload] ⚠️ Не удалось установить права на ${file.filename}: ${e}`);
        }
      }
      
      if (req.originalFileNames && req.originalFileNames.size > 0) {
        if (!fileNamesMap[id]) fileNamesMap[id] = {};
        for (const [safeName, originalName] of req.originalFileNames) {
          fileNamesMap[id][safeName] = originalName;
        }
        saveFileNamesMap(fileNamesMap);
      }
      
      for (const fileName of uploaded) {
        const ext = path.extname(fileName).toLowerCase();
        if (ext === '.pdf' || ext === '.pptx') {
          autoConvertFileWrapper(id, fileName).catch(() => {});
        }
        // Автоматическая оптимизация видео
        else if (['.mp4', '.webm', '.ogg', '.mkv', '.mov', '.avi'].includes(ext)) {
          autoOptimizeVideoWrapper(id, fileName).then(result => {
            if (result.success) {
              console.log(`[upload] 🎬 Видео обработано: ${fileName} (optimized=${result.optimized})`);
            }
          }).catch(err => {
            console.error(`[upload] ❌ Ошибка оптимизации ${fileName}:`, err);
          });
        }
      }
      
      // Обновляем список файлов
      const result = [];
      const fileNames = [];
      if (fs.existsSync(folder)) {
        const entries = fs.readdirSync(folder);
        for (const entry of entries) {
          const entryPath = path.join(folder, entry);
          const stat = fs.statSync(entryPath);
          
          if (stat.isFile()) {
            if (!isSystemFile(entry)) {
              result.push(entry);
              const originalName = fileNamesMap[id]?.[entry] || entry;
              fileNames.push(originalName);
            }
          } else if (stat.isDirectory()) {
            const folderContents = fs.readdirSync(entryPath);
            const originalFile = folderContents.find(f => /\.(pdf|pptx)$/i.test(f));
            if (originalFile) {
              result.push(originalFile);
              const originalName = fileNamesMap[id]?.[entry] || originalFile;
              fileNames.push(originalName);
            }
          }
        }
      }
      
      devices[id].files = result;
      devices[id].fileNames = fileNames;
      io.emit('devices/updated');
      res.json({ ok: true, files: result, uploaded });
    });
  });
  
  // POST /api/devices/:targetId/copy-file - Копирование/перемещение файла между устройствами
  router.post('/:targetId/copy-file', async (req, res) => {
    const targetId = sanitizeDeviceId(req.params.targetId);
    const { sourceDeviceId, fileName, move } = req.body;
    const sourceId = sanitizeDeviceId(sourceDeviceId);
    
    if (!targetId || !sourceId) {
      return res.status(400).json({ error: 'invalid device ids' });
    }
    
    if (!devices[targetId] || !devices[sourceId]) {
      return res.status(404).json({ error: 'device not found' });
    }
    
    if (!fileName) {
      return res.status(400).json({ error: 'fileName required' });
    }
    
    const sourceFolder = path.join(DEVICES, devices[sourceId].folder);
    const targetFolder = path.join(DEVICES, devices[targetId].folder);
    
    let sourceFile = path.join(sourceFolder, fileName);
    let isDirectory = false;
    
    // Проверяем PDF/PPTX папки
    const folderName = fileName.replace(/\.(pdf|pptx)$/i, '');
    const possibleFolder = path.join(sourceFolder, folderName);
    
    if (fs.existsSync(possibleFolder) && fs.statSync(possibleFolder).isDirectory()) {
      sourceFile = possibleFolder;
      isDirectory = true;
    }
    
    if (!fs.existsSync(sourceFile)) {
      return res.status(404).json({ error: 'source file not found' });
    }
    
    try {
      const targetFile = isDirectory 
        ? path.join(targetFolder, folderName)
        : path.join(targetFolder, fileName);
      
      if (isDirectory) {
        // Копируем всю папку (для PDF/PPTX)
        if (!fs.existsSync(targetFolder)) {
          fs.mkdirSync(targetFolder, { recursive: true });
        }
        
        if (fs.existsSync(targetFile)) {
          return res.status(409).json({ error: 'target already exists' });
        }
        
        fs.cpSync(sourceFile, targetFile, { recursive: true });
        fs.chmodSync(targetFile, 0o755);
      } else {
        // Копируем обычный файл
        fs.copyFileSync(sourceFile, targetFile);
        fs.chmodSync(targetFile, 0o644);
      }
      
      // Копируем маппинг имени (если есть)
      if (fileNamesMap[sourceId] && fileNamesMap[sourceId][fileName]) {
        if (!fileNamesMap[targetId]) fileNamesMap[targetId] = {};
        fileNamesMap[targetId][fileName] = fileNamesMap[sourceId][fileName];
        saveFileNamesMap(fileNamesMap);
      }
      
      // Если перемещение - удаляем из источника
      if (move) {
        if (isDirectory) {
          fs.rmSync(sourceFile, { recursive: true, force: true });
        } else {
          fs.unlinkSync(sourceFile);
        }
        
        // Удаляем маппинг из источника
        if (fileNamesMap[sourceId] && fileNamesMap[sourceId][fileName]) {
          delete fileNamesMap[sourceId][fileName];
          if (Object.keys(fileNamesMap[sourceId]).length === 0) {
            delete fileNamesMap[sourceId];
          }
          saveFileNamesMap(fileNamesMap);
        }
        
        console.log(`[copy-file] 🗑️ Файл удален из источника: ${fileName} (${sourceId})`);
      }
      
      // КРИТИЧНО: Обновляем devices.files для обоих устройств ВСЕГДА
      console.log(`[copy-file] 🔄 Начинаем обновление devices.files...`);
      
      const scanDeviceFiles = (deviceId) => {
        const folder = path.join(DEVICES, devices[deviceId].folder);
        const result = [];
        console.log(`[copy-file] 📂 Сканируем: ${folder}`);
        if (fs.existsSync(folder)) {
          const entries = fs.readdirSync(folder);
          for (const entry of entries) {
            const entryPath = path.join(folder, entry);
            const stat = fs.statSync(entryPath);
            if (stat.isFile() && !isSystemFile(entry)) {
              result.push(entry);
            } else if (stat.isDirectory()) {
              const folderContents = fs.readdirSync(entryPath);
              const originalFile = folderContents.find(f => /\.(pdf|pptx)$/i.test(f));
              if (originalFile) result.push(originalFile);
            }
          }
        }
        console.log(`[copy-file] 📊 Найдено ${result.length} файлов в ${deviceId}`);
        return result;
      };
      
      devices[sourceId].files = scanDeviceFiles(sourceId);
      devices[targetId].files = scanDeviceFiles(targetId);
      
      // Обновляем fileNames
      devices[sourceId].fileNames = devices[sourceId].files.map(f => fileNamesMap[sourceId]?.[f] || f);
      devices[targetId].fileNames = devices[targetId].files.map(f => fileNamesMap[targetId]?.[f] || f);
      
      console.log(`[copy-file] ✅ Файлы обновлены: source=${devices[sourceId].files.length}, target=${devices[targetId].files.length}`);
      console.log(`[copy-file] 📡 Отправляем devices/updated...`);
      
      io.emit('devices/updated');
      
      console.log(`[copy-file] ✅ Успешно завершено: ${move ? 'moved' : 'copied'} ${fileName}`);
      res.json({ ok: true, action: move ? 'moved' : 'copied', file: fileName, from: sourceId, to: targetId });
      
    } catch (e) {
      console.error(`[copy-file] ❌ Ошибка: ${e}`);
      return res.status(500).json({ error: 'copy/move failed', detail: String(e) });
    }
  });
  
  // POST /api/devices/:id/files/:name/rename - Переименование файла
  router.post('/:id/files/:name/rename', express.json(), (req, res) => {
    const id = sanitizeDeviceId(req.params.id);
    
    if (!id) {
      return res.status(400).json({ error: 'invalid device id' });
    }
    
    const oldName = req.params.name;
    const { newName } = req.body;
    
    if (!newName) {
      return res.status(400).json({ error: 'newName required' });
    }
    
    const d = devices[id];
    if (!d) {
      return res.status(404).json({ error: 'device not found' });
    }
    
    const deviceFolder = path.join(DEVICES, d.folder);
    const oldPath = path.join(deviceFolder, oldName);
    const newPath = path.join(deviceFolder, newName);
    
    if (!fs.existsSync(oldPath)) {
      return res.status(404).json({ error: 'file not found' });
    }
    
    if (fs.existsSync(newPath) && oldPath !== newPath) {
      return res.status(409).json({ error: 'file with this name already exists' });
    }
    
    try {
      fs.renameSync(oldPath, newPath);
      if (!fileNamesMap[id]) fileNamesMap[id] = {};
      if (fileNamesMap[id][oldName]) delete fileNamesMap[id][oldName];
      saveFileNamesMap(fileNamesMap);
      
      // КРИТИЧНО: Фильтруем системные файлы
      d.files = fs.readdirSync(deviceFolder).filter(f => ALLOWED_EXT.test(f) && !isSystemFile(f));
      d.fileNames = d.files.map(f => fileNamesMap[id]?.[f] || f);
      
      io.emit('devices/updated');
      res.json({ ok: true });
    } catch (e) {
      console.error(`[rename] Ошибка:`, e);
      res.status(500).json({ error: 'rename failed' });
    }
  });
  
  // DELETE /api/devices/:id/files/:name - Удаление файла
  router.delete('/:id/files/:name', (req, res) => {
    const id = sanitizeDeviceId(req.params.id);
    
    if (!id) {
      return res.status(400).json({ error: 'invalid device id' });
    }
    
    const name = req.params.name;
    const d = devices[id];
    
    if (!d) {
      return res.status(404).json({ error: 'device not found' });
    }
    
    const deviceFolder = path.join(DEVICES, d.folder);
    const folderName = name.replace(/\.(pdf|pptx)$/i, '');
    const possibleFolder = path.join(deviceFolder, folderName);
    
    let deletedFileName = name;
    
    // Проверяем PDF/PPTX папку
    if (fs.existsSync(possibleFolder) && fs.statSync(possibleFolder).isDirectory()) {
      try {
        fs.rmSync(possibleFolder, { recursive: true, force: true });
        console.log(`[DELETE file] Удалена папка: ${folderName}`);
      } catch (e) {
        console.error(`[DELETE file] Ошибка удаления папки ${folderName}:`, e);
        return res.status(500).json({ error: 'failed to delete folder' });
      }
    } else {
      // Обычный файл
      const abs = path.join(deviceFolder, name);
      if (!fs.existsSync(abs)) {
        return res.status(404).json({ error: 'not found' });
      }
      fs.unlinkSync(abs);
    }
    
    // Удаляем из маппинга
    if (fileNamesMap[id]) {
      if (fileNamesMap[id][name]) delete fileNamesMap[id][name];
      if (fileNamesMap[id][deletedFileName] && deletedFileName !== name) {
        delete fileNamesMap[id][deletedFileName];
      }
      if (Object.keys(fileNamesMap[id]).length === 0) delete fileNamesMap[id];
      saveFileNamesMap(fileNamesMap);
    }
    
    // Обновляем список файлов
    const result = [];
    const fileNames = [];
    if (fs.existsSync(deviceFolder)) {
      const entries = fs.readdirSync(deviceFolder);
      for (const entry of entries) {
        const entryPath = path.join(deviceFolder, entry);
        const stat = fs.statSync(entryPath);
        
        if (stat.isFile()) {
          if (!isSystemFile(entry)) {
            result.push(entry);
            const originalName = fileNamesMap[id]?.[entry] || entry;
            fileNames.push(originalName);
          }
        } else if (stat.isDirectory()) {
          const folderContents = fs.readdirSync(entryPath);
          const originalFile = folderContents.find(f => /\.(pdf|pptx)$/i.test(f));
          if (originalFile) {
            result.push(originalFile);
            const originalName = fileNamesMap[id]?.[entry] || originalFile;
            fileNames.push(originalName);
          }
        }
      }
    }
    
    d.files = result;
    d.fileNames = fileNames;
    io.emit('devices/updated');
    res.json({ ok: true });
  });
  
  // GET /api/devices/:id/files - Получить список файлов устройства
  router.get('/:id/files', (req, res) => {
    const id = sanitizeDeviceId(req.params.id);
    
    if (!id) {
      return res.status(400).json({ error: 'invalid device id' });
    }
    
    const d = devices[id];
    if (!d) {
      return res.status(404).json({ error: 'not found' });
    }
    
    const folder = path.join(DEVICES, d.folder);
    const files = d.files || [];
    const fileNames = d.fileNames || files;
    
    const response = files.map((safeName, index) => ({
      safeName,
      originalName: fileNames[index] || safeName
    }));
    
    res.json(response);
  });
  
  // GET /api/devices/:id/files-with-status - Получить список файлов со статусами
  router.get('/:id/files-with-status', async (req, res) => {
    const id = sanitizeDeviceId(req.params.id);
    
    if (!id) {
      return res.status(400).json({ error: 'invalid device id' });
    }
    
    const d = devices[id];
    if (!d) {
      return res.status(404).json({ error: 'not found' });
    }
    
    const files = d.files || [];
    const fileNames = d.fileNames || files;
    
    const filesData = [];
    
    for (let i = 0; i < files.length; i++) {
      const safeName = files[i];
      const originalName = fileNames[i] || safeName;
      
      const fileStatus = getFileStatus(id, safeName) || { status: 'ready', progress: 100, canPlay: true };
      
      let resolution = null;
      
      // Получаем разрешение для видео файлов
      const ext = path.extname(safeName).toLowerCase();
      if (['.mp4', '.webm', '.ogg', '.mkv', '.mov', '.avi'].includes(ext)) {
        if (fileStatus.status !== 'processing' && fileStatus.status !== 'checking') {
          try {
            const filePath = path.join(DEVICES, d.folder, safeName);
            if (fs.existsSync(filePath)) {
              const params = await checkVideoParameters(filePath);
              if (params) {
                resolution = {
                  width: params.width,
                  height: params.height
                };
              }
            }
          } catch (e) {
            console.error(`[files-with-status] ❌ Ошибка получения разрешения для ${safeName}:`, e);
          }
        }
      }
      
      filesData.push({
        safeName,
        originalName,
        status: fileStatus.status || 'ready',
        progress: fileStatus.progress || 100,
        canPlay: fileStatus.canPlay !== false,
        error: fileStatus.error || null,
        resolution
      });
    }
    
    res.json(filesData);
  });
  
  return router;
}

