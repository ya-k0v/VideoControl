/**
 * API Routes для управления файлами устройств
 * @module routes/files
 */

import express from 'express';
import fs from 'fs';
import path from 'path';
import { DEVICES, ALLOWED_EXT } from '../config/constants.js';
import { sanitizeDeviceId, isSystemFile } from '../utils/sanitize.js';
import { extractZipToFolder } from '../converters/folder-converter.js';
import { makeSafeFolderName } from '../utils/transliterate.js';
import { scanDeviceFiles } from '../utils/file-scanner.js';
import { validatePath } from '../utils/path-validator.js';
import { uploadLimiter, deleteLimiter } from '../middleware/rate-limit.js';
import { auditLog, AuditAction } from '../utils/audit-logger.js';
import logger, { logFile, logSecurity } from '../utils/logger.js';
import { getCachedResolution, clearResolutionCache } from '../video/resolution-cache.js';
import { processUploadedFilesAsync } from '../utils/file-metadata-processor.js';
import { getFileMetadata, deleteFileMetadata } from '../database/files-metadata.js';

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
  router.post('/:id/upload', uploadLimiter, async (req, res, next) => {
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
      const folderName = req.body.folderName; // Имя папки если загружается через выбор папки
      
      const folder = path.join(DEVICES, devices[id].folder);
      
      // Если это загрузка папки, создаем структуру папки
      if (folderName && req.files && req.files.length > 0) {
        console.log(`[upload] 📁 Обнаружена загрузка папки: ${folderName}`);
        
        // Создаем безопасное имя папки через транслитерацию
        const safeFolderName = makeSafeFolderName(folderName);
        const targetFolder = path.join(folder, safeFolderName);
        
        console.log(`[upload] 📝 Имя папки: "${folderName}" → "${safeFolderName}"`);
        
        if (!fs.existsSync(targetFolder)) {
          fs.mkdirSync(targetFolder, { recursive: true });
          fs.chmodSync(targetFolder, 0o755);
        }
        
        // Перемещаем файлы из временной папки в целевую
        for (const file of req.files) {
          try {
            const sourcePath = path.join(folder, file.filename);
            
            // Получаем оригинальное имя файла из originalname
            // originalname может содержать путь "folder/subfolder/file.jpg"
            let targetFileName = file.originalname;
            if (targetFileName.includes('/')) {
              // Убираем путь папки, оставляем только имя файла
              const parts = targetFileName.split('/');
              targetFileName = parts[parts.length - 1];
            }
            
            const targetPath = path.join(targetFolder, targetFileName);
            
            // Перемещаем файл
            fs.renameSync(sourcePath, targetPath);
            fs.chmodSync(targetPath, 0o644);
            console.log(`[upload] ✅ Перемещен: ${file.filename} -> ${safeFolderName}/${targetFileName}`);
          } catch (e) {
            console.warn(`[upload] ⚠️ Ошибка перемещения ${file.filename}:`, e);
          }
        }
        
        console.log(`[upload] 📁 Папка создана: ${safeFolderName} (${req.files.length} файлов)`);
        
        // Сохраняем маппинг оригинального имени папки
        if (!fileNamesMap[id]) fileNamesMap[id] = {};
        fileNamesMap[id][safeFolderName] = folderName; // Оригинальное имя для отображения
        saveFileNamesMap(fileNamesMap);
      } else {
        // КРИТИЧНО: Устанавливаем права 644 на все загруженные файлы
        // Чтобы Nginx (www-data) мог их прочитать
        for (const file of (req.files || [])) {
          try {
            const filePath = path.join(folder, file.filename);
            fs.chmodSync(filePath, 0o644);
            console.log(`[upload] ✅ Права 644 установлены: ${file.filename}`);
          } catch (e) {
            console.warn(`[upload] ⚠️ Не удалось установить права на ${file.filename}: ${e}`);
          }
        }
      }
      
      if (req.originalFileNames && req.originalFileNames.size > 0) {
        if (!fileNamesMap[id]) fileNamesMap[id] = {};
        for (const [safeName, originalName] of req.originalFileNames) {
          fileNamesMap[id][safeName] = originalName;
        }
        saveFileNamesMap(fileNamesMap);
      }
      
      // Маппинг папки уже сохранен выше при создании папки
      
      // Обрабатываем файлы ТОЛЬКО если это не прямая загрузка папки
      if (!folderName) {
        for (const fileName of uploaded) {
          const ext = path.extname(fileName).toLowerCase();
          if (ext === '.pdf' || ext === '.pptx') {
            autoConvertFileWrapper(id, fileName).catch(() => {});
          }
        // Автоматическая обработка ZIP архивов с изображениями
        else if (ext === '.zip') {
          extractZipToFolder(id, fileName).then(result => {
            if (result.success) {
              console.log(`[upload] 📦 ZIP распакован: ${fileName} -> ${result.folderName}/ (${result.imagesCount} изображений)`);
              
              // Сохраняем маппинг оригинального имени папки
              if (result.originalFolderName && result.folderName !== result.originalFolderName) {
                if (!fileNamesMap[id]) fileNamesMap[id] = {};
                fileNamesMap[id][result.folderName] = result.originalFolderName;
                saveFileNamesMap(fileNamesMap);
                console.log(`[upload] 📝 Маппинг папки: "${result.folderName}" → "${result.originalFolderName}"`);
              }
              
              // Обновляем список файлов после распаковки
              io.emit('devices/updated');
            } else {
              console.error(`[upload] ❌ Ошибка распаковки ZIP ${fileName}:`, result.error);
            }
          }).catch(err => {
            console.error(`[upload] ❌ Ошибка обработки ZIP ${fileName}:`, err);
          });
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
      }
      
      // Обновляем список файлов через scanDeviceFiles (единая логика)
      const { files: scannedFiles, fileNames: scannedFileNames } = scanDeviceFiles(id, folder, fileNamesMap);
      
      devices[id].files = scannedFiles;
      devices[id].fileNames = scannedFileNames;
      io.emit('devices/updated');
      
      // Audit log
      if (uploaded.length > 0) {
        await auditLog({
          userId: req.user?.id || null,
          action: AuditAction.FILE_UPLOAD,
          resource: `device:${id}`,
          details: { 
            deviceId: id, 
            filesCount: uploaded.length,
            files: uploaded,
            folderName: folderName || null,
            uploadedBy: req.user?.username || 'anonymous'
          },
          ipAddress: req.ip,
          userAgent: req.get('user-agent'),
          status: 'success'
        });
        logFile('info', 'Files uploaded', { 
          deviceId: id, 
          filesCount: uploaded.length, 
          folderName: folderName || null,
          uploadedBy: req.user?.username || 'anonymous'
        });
        
        // Асинхронно обрабатываем метаданные (MD5, разрешение) - не блокируем ответ
        processUploadedFilesAsync(id, req.files || [], folder, fileNamesMap).catch(err => {
          logger.error('Background metadata processing failed', { 
            error: err.message, 
            deviceId: id 
          });
        });
      }
      
      res.json({ ok: true, files: scannedFiles, uploaded });
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
    let actualFileName = fileName;
    
    // Проверяем PDF/PPTX папки
    const folderName = fileName.replace(/\.(pdf|pptx)$/i, '');
    const possibleFolder = path.join(sourceFolder, folderName);
    
    if (fs.existsSync(possibleFolder) && fs.statSync(possibleFolder).isDirectory()) {
      sourceFile = possibleFolder;
      isDirectory = true;
      actualFileName = folderName;
    } 
    // Проверяем папки с изображениями (без расширения)
    else if (!fileName.includes('.')) {
      const folderPath = path.join(sourceFolder, fileName);
      if (fs.existsSync(folderPath) && fs.statSync(folderPath).isDirectory()) {
        sourceFile = folderPath;
        isDirectory = true;
        actualFileName = fileName;
      }
    }
    
    if (!fs.existsSync(sourceFile)) {
      return res.status(404).json({ error: 'source file not found' });
    }
    
    try {
      const targetFileName = isDirectory ? actualFileName : fileName;
      const targetFile = path.join(targetFolder, targetFileName);
      
      if (isDirectory) {
        // Копируем всю папку (для PDF/PPTX или папок с изображениями)
        if (!fs.existsSync(targetFolder)) {
          fs.mkdirSync(targetFolder, { recursive: true });
        }
        
        if (fs.existsSync(targetFile)) {
          return res.status(409).json({ error: 'target already exists' });
        }
        
        console.log(`[copy-file] 📁 Копирование папки: ${actualFileName} (${sourceId} -> ${targetId})`);
        fs.cpSync(sourceFile, targetFile, { recursive: true });
        fs.chmodSync(targetFile, 0o755);
        
        // Устанавливаем права на все файлы внутри папки
        const items = fs.readdirSync(targetFile);
        for (const item of items) {
          const itemPath = path.join(targetFile, item);
          const stat = fs.statSync(itemPath);
          if (stat.isFile()) {
            fs.chmodSync(itemPath, 0o644);
          }
        }
        
        console.log(`[copy-file] ✅ Папка скопирована: ${actualFileName}`);
      } else {
        // Копируем обычный файл
        fs.copyFileSync(sourceFile, targetFile);
        fs.chmodSync(targetFile, 0o644);
      }
      
      // Копируем маппинг имени (если есть)
      const sourceMappingKey = isDirectory ? actualFileName : fileName;
      if (fileNamesMap[sourceId] && fileNamesMap[sourceId][sourceMappingKey]) {
        if (!fileNamesMap[targetId]) fileNamesMap[targetId] = {};
        fileNamesMap[targetId][sourceMappingKey] = fileNamesMap[sourceId][sourceMappingKey];
        saveFileNamesMap(fileNamesMap);
      }
      
      // Если перемещение - удаляем из источника
      if (move) {
        if (isDirectory) {
          console.log(`[copy-file] 🗑️ Удаление папки из источника: ${actualFileName} (${sourceId})`);
          fs.rmSync(sourceFile, { recursive: true, force: true });
        } else {
          fs.unlinkSync(sourceFile);
        }
        
        // Удаляем маппинг из источника
        const sourceMappingKey = isDirectory ? actualFileName : fileName;
        if (fileNamesMap[sourceId] && fileNamesMap[sourceId][sourceMappingKey]) {
          delete fileNamesMap[sourceId][sourceMappingKey];
          if (Object.keys(fileNamesMap[sourceId]).length === 0) {
            delete fileNamesMap[sourceId];
          }
          saveFileNamesMap(fileNamesMap);
        }
        
        console.log(`[copy-file] 🗑️ Файл удален из источника: ${isDirectory ? actualFileName : fileName} (${sourceId})`);
      }
      
      // КРИТИЧНО: Обновляем devices.files для обоих устройств ВСЕГДА
      console.log(`[copy-file] 🔄 Начинаем обновление devices.files...`);
      
      // sourceFolder и targetFolder уже объявлены выше (строки 234-235)
      // Обновляем списки файлов обоих устройств используя общую утилиту
      
      console.log(`[copy-file] 📂 Сканируем source: ${sourceFolder}`);
      const sourceResult = scanDeviceFiles(sourceId, sourceFolder, fileNamesMap);
      devices[sourceId].files = sourceResult.files;
      devices[sourceId].fileNames = sourceResult.fileNames;
      
      console.log(`[copy-file] 📂 Сканируем target: ${targetFolder}`);
      const targetResult = scanDeviceFiles(targetId, targetFolder, fileNamesMap);
      devices[targetId].files = targetResult.files;
      devices[targetId].fileNames = targetResult.fileNames;
      
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
  
  // POST /api/devices/:id/files/:name/rename - Переименование файла или папки
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
    let oldPath = path.join(deviceFolder, oldName);
    let isFolder = false;
    let actualOldName = oldName;
    
    // Проверяем, может это PDF/PPTX файл с папкой
    const folderNamePdf = oldName.replace(/\.(pdf|pptx)$/i, '');
    const possiblePdfFolder = path.join(deviceFolder, folderNamePdf);
    
    if (fs.existsSync(possiblePdfFolder) && fs.statSync(possiblePdfFolder).isDirectory()) {
      // Это PDF/PPTX с папкой - переименовываем папку
      oldPath = possiblePdfFolder;
      isFolder = true;
      actualOldName = folderNamePdf;
      console.log(`[rename] 📁 Переименование папки PDF/PPTX: ${folderNamePdf}`);
    } 
    // Проверяем, может это папка с изображениями (без расширения)
    else if (!oldName.includes('.')) {
      const folderPath = path.join(deviceFolder, oldName);
      if (fs.existsSync(folderPath) && fs.statSync(folderPath).isDirectory()) {
        oldPath = folderPath;
        isFolder = true;
        actualOldName = oldName;
        console.log(`[rename] 📁 Переименование папки с изображениями: ${oldName}`);
      }
    }
    
    if (!fs.existsSync(oldPath)) {
      console.error(`[rename] ❌ Не найден: ${oldPath}`);
      return res.status(404).json({ error: 'file not found', path: oldPath });
    }
    
    // Определяем новый путь
    let newPath;
    if (isFolder) {
      // Для папок используем новое имя без расширения
      const newFolderName = newName.replace(/\.(pdf|pptx)$/i, '');
      newPath = path.join(deviceFolder, newFolderName);
    } else {
      newPath = path.join(deviceFolder, newName);
    }
    
    if (fs.existsSync(newPath) && oldPath !== newPath) {
      return res.status(409).json({ error: 'file with this name already exists' });
    }
    
    try {
      console.log(`[rename] 🔄 ${oldPath} -> ${newPath}`);
      fs.renameSync(oldPath, newPath);
      
      // Обновляем маппинг имен
      if (!fileNamesMap[id]) fileNamesMap[id] = {};
      
      // Удаляем старое имя из маппинга
      if (fileNamesMap[id][actualOldName]) {
        delete fileNamesMap[id][actualOldName];
      }
      // Для PDF/PPTX также удаляем маппинг файла
      if (isFolder && oldName.match(/\.(pdf|pptx)$/i)) {
        if (fileNamesMap[id][oldName]) {
          delete fileNamesMap[id][oldName];
        }
      }
      
      // Добавляем новое имя в маппинг
      const finalName = isFolder ? path.basename(newPath) : newName;
      fileNamesMap[id][finalName] = newName;
      
      // Для PDF/PPTX папки также добавляем маппинг для файла с расширением
      if (isFolder) {
        const pdfExt = oldName.match(/\.(pdf|pptx)$/i);
        if (pdfExt) {
          const newFileWithExt = newName;
          fileNamesMap[id][newFileWithExt] = newName;
        }
      }
      
      saveFileNamesMap(fileNamesMap);
      
      // Обновляем список файлов устройства используя общую утилиту
      const scanned = scanDeviceFiles(id, deviceFolder, fileNamesMap);
      d.files = scanned.files;
      d.fileNames = scanned.fileNames;
      
      io.emit('devices/updated');
      res.json({ success: true, oldName: actualOldName, newName: finalName });
    } catch (e) {
      console.error(`[rename] Ошибка:`, e);
      res.status(500).json({ error: 'rename failed', details: e.message });
    }
  });
  
  // DELETE /api/devices/:id/files/:name - Удаление файла или папки
  router.delete('/:id/files/:name', deleteLimiter, async (req, res) => {
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
    
    // ЗАЩИТА: Валидируем путь от path traversal
    try {
      validatePath(name, deviceFolder);
    } catch (e) {
      // Логируем подозрительную активность
      await auditLog({
        userId: req.user?.id || null,
        action: AuditAction.PATH_TRAVERSAL_ATTEMPT,
        resource: `device:${id}`,
        details: { attemptedPath: name, deviceId: id },
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
        status: 'failure'
      });
      logSecurity('warn', 'Path traversal attempt detected on file delete', { 
        deviceId: id, 
        attemptedPath: name, 
        ip: req.ip 
      });
      return res.status(400).json({ error: 'invalid file path' });
    }
    
    const folderName = name.replace(/\.(pdf|pptx)$/i, '');
    const possibleFolder = path.join(deviceFolder, folderName);
    
    let deletedFileName = name;
    let isFolder = false;
    
    // Проверяем PDF/PPTX папку
    if (fs.existsSync(possibleFolder) && fs.statSync(possibleFolder).isDirectory()) {
      try {
        fs.rmSync(possibleFolder, { recursive: true, force: true });
        deletedFileName = folderName;
        isFolder = true;
        console.log(`[DELETE file] Удалена папка PDF/PPTX: ${folderName}`);
      } catch (e) {
        console.error(`[DELETE file] Ошибка удаления папки ${folderName}:`, e);
        return res.status(500).json({ error: 'failed to delete folder' });
      }
    } 
    // Проверяем папку с изображениями (без расширения)
    else if (!name.includes('.')) {
      const imageFolderPath = path.join(deviceFolder, name);
      if (fs.existsSync(imageFolderPath) && fs.statSync(imageFolderPath).isDirectory()) {
        try {
          fs.rmSync(imageFolderPath, { recursive: true, force: true });
          deletedFileName = name;
          isFolder = true;
          console.log(`[DELETE file] Удалена папка с изображениями: ${name}`);
        } catch (e) {
          console.error(`[DELETE file] Ошибка удаления папки ${name}:`, e);
          return res.status(500).json({ error: 'failed to delete image folder' });
        }
      }
    } else {
      // Обычный файл
      const abs = path.join(deviceFolder, name);
      if (!fs.existsSync(abs)) {
        return res.status(404).json({ error: 'not found' });
      }
      fs.unlinkSync(abs);
      
      // Очищаем кэш разрешения для удаленного видео
      clearResolutionCache(abs);
      
      // Удаляем метаданные из БД
      deleteFileMetadata(id, name);
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
    
    // Обновляем список файлов через scanDeviceFiles (единая логика)
    const { files: scannedFiles, fileNames: scannedFileNames } = scanDeviceFiles(id, deviceFolder, fileNamesMap);
    
    d.files = scannedFiles;
    d.fileNames = scannedFileNames;
    io.emit('devices/updated');
    
    // Audit log
    await auditLog({
      userId: req.user?.id || null,
      action: AuditAction.FILE_DELETE,
      resource: `device:${id}`,
      details: { 
        deviceId: id, 
        fileName: deletedFileName, 
        isFolder, 
        deletedBy: req.user?.username || 'anonymous' 
      },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      status: 'success'
    });
    logFile('info', 'File deleted', { 
      deviceId: id, 
      fileName: deletedFileName, 
      isFolder, 
      deletedBy: req.user?.username || 'anonymous' 
    });
    
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
      
      // Получаем разрешение для видео файлов (из БД, не FFmpeg!)
      const ext = path.extname(safeName).toLowerCase();
      if (['.mp4', '.webm', '.ogg', '.mkv', '.mov', '.avi'].includes(ext)) {
        // Сначала пробуем из БД (быстро!)
        const metadata = getFileMetadata(id, safeName);
        if (metadata && metadata.video_width && metadata.video_height) {
          resolution = {
            width: metadata.video_width,
            height: metadata.video_height
          };
        } else if (fileStatus.status !== 'processing' && fileStatus.status !== 'checking') {
          // Fallback: если метаданных нет в БД - используем кэш с FFmpeg
          // (это может быть для старых файлов загруженных до миграции)
          try {
            const filePath = path.join(DEVICES, d.folder, safeName);
            resolution = await getCachedResolution(filePath, checkVideoParameters);
          } catch (e) {
            // Игнорируем ошибки
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

