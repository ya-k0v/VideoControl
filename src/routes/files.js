/**
 * API Routes для управления файлами устройств
 * @module routes/files
 */

import express from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
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
import { getFileMetadata, deleteFileMetadata, getDeviceFilesMetadata, saveFileMetadata, countFileReferences } from '../database/files-metadata.js';

const router = express.Router();

/**
 * Копировать папку физически (асинхронно через streams)
 * Для PPTX/PDF/изображений которые должны оставаться в /content/{device}/
 */
async function copyFolderPhysically(sourceId, targetId, folderName, move, devices, fileNamesMap, saveFileNamesMap, io, res) {
  const sourceFolder = path.join(DEVICES, devices[sourceId].folder);
  const targetFolder = path.join(DEVICES, devices[targetId].folder);
  
  const sourcePath = path.join(sourceFolder, folderName);
  const targetPath = path.join(targetFolder, folderName);
  
  if (fs.existsSync(targetPath)) {
    return res.status(409).json({ error: 'folder already exists on target' });
  }
  
  try {
    // Асинхронное копирование папки
    logFile('info', '📁 Copying folder (async)', { sourceId, targetId, folderName });
    
    await fs.promises.cp(sourcePath, targetPath, { recursive: true });
    
    // Устанавливаем права
    await fs.promises.chmod(targetPath, 0o755);
    
    // Копируем маппинг
    if (fileNamesMap[sourceId]?.[folderName]) {
      if (!fileNamesMap[targetId]) fileNamesMap[targetId] = {};
      fileNamesMap[targetId][folderName] = fileNamesMap[sourceId][folderName];
      saveFileNamesMap(fileNamesMap);
    }
    
    // Если move - удаляем из источника
    if (move) {
      await fs.promises.rm(sourcePath, { recursive: true, force: true });
      if (fileNamesMap[sourceId]?.[folderName]) {
        delete fileNamesMap[sourceId][folderName];
        saveFileNamesMap(fileNamesMap);
      }
    }
    
    // Обновляем оба устройства
    updateDeviceFilesFromDB(targetId, devices, fileNamesMap);
    if (move) updateDeviceFilesFromDB(sourceId, devices, fileNamesMap);
    
    io.emit('devices/updated');
    
    logFile('info', `✅ Folder ${move ? 'moved' : 'copied'} successfully`, {
      sourceDevice: sourceId,
      targetDevice: targetId,
      folderName
    });
    
    res.json({ 
      ok: true, 
      action: move ? 'moved' : 'copied', 
      file: folderName, 
      from: sourceId, 
      to: targetId,
      type: 'folder'
    });
    
  } catch (e) {
    logger.error('[copy-folder] Error', { error: e.message, sourceId, targetId, folderName });
    return res.status(500).json({ error: 'folder copy failed', detail: e.message });
  }
}

/**
 * Обновить список файлов устройства из БД + папки
 * @param {string} deviceId - ID устройства
 * @param {Object} devices - Объект devices
 * @param {Object} fileNamesMap - Маппинг имен
 */
function updateDeviceFilesFromDB(deviceId, devices, fileNamesMap) {
  const device = devices[deviceId];
  if (!device) return;
  
  // 1. Получаем файлы из БД (обычные файлы)
  const filesMetadata = getDeviceFilesMetadata(deviceId);
  let files = filesMetadata.map(f => f.safe_name);
  let fileNames = filesMetadata.map(f => f.original_name);
  
  // 2. Сканируем папку устройства для PDF/PPTX/image папок (они остаются в /content/{device}/)
  const deviceFolder = path.join(DEVICES, device.folder);
  if (fs.existsSync(deviceFolder)) {
    const folderEntries = fs.readdirSync(deviceFolder);
    for (const entry of folderEntries) {
      if (entry.startsWith('.')) continue; // Пропускаем скрытые
      
      const entryPath = path.join(deviceFolder, entry);
      try {
        const stat = fs.statSync(entryPath);
        
        if (stat.isDirectory()) {
          // Это папка (PPTX/PDF или изображения) - добавляем
          files.push(entry);
          fileNames.push(fileNamesMap[deviceId]?.[entry] || entry);
        }
      } catch (e) {
        // Игнорируем ошибки доступа к файлам
      }
    }
  }
  
  device.files = files;
  device.fileNames = fileNames;
  
  logFile('debug', 'Device files updated from DB + folders', {
    deviceId,
    dbFiles: filesMetadata.length,
    folders: files.length - filesMetadata.length,
    total: files.length
  });
}

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
      
      // Если это загрузка папки - создаем в /content/{device}/ (для PPTX/изображений)
      // Если обычные файлы - они уже в /content/ (через Multer)
      if (folderName && req.files && req.files.length > 0) {
        console.log(`[upload] 📁 Обнаружена загрузка папки: ${folderName}`);
        
        // Создаем безопасное имя папки через транслитерацию
        const safeFolderName = makeSafeFolderName(folderName);
        const deviceFolder = path.join(DEVICES, devices[id].folder);
        const targetFolder = path.join(deviceFolder, safeFolderName);
        
        console.log(`[upload] 📝 Имя папки: "${folderName}" → "${safeFolderName}"`);
        
        if (!fs.existsSync(targetFolder)) {
          fs.mkdirSync(targetFolder, { recursive: true });
          fs.chmodSync(targetFolder, 0o755);
        }
        
        // Перемещаем файлы из /content/ в /content/{device}/{folder}/
        for (const file of req.files) {
          try {
            const sourcePath = path.join(DEVICES, file.filename);  // Из /content/
            
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
            const filePath = path.join(DEVICES, file.filename);  // В /content/
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
      
      // НОВОЕ: Обновляем список файлов из БД (вместо сканирования файловой системы)
      updateDeviceFilesFromDB(id, devices, fileNamesMap);
      
      const updatedFiles = devices[id].files || [];
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
        // Обрабатываем только обычные файлы (не папки)
        if (!folderName) {
          processUploadedFilesAsync(id, req.files || [], DEVICES, fileNamesMap).catch(err => {
            logger.error('Background metadata processing failed', { 
              error: err.message, 
              deviceId: id 
            });
          });
        }
      }
      
      res.json({ ok: true, files: updatedFiles, uploaded });
    });
  });
  
  // POST /api/devices/:targetId/copy-file - Копирование/перемещение файла между устройствами
  // НОВОЕ: Мгновенное копирование через БД для файлов, физическое для папок
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
    
    try {
      // Проверяем это файл или папка
    const sourceFolder = path.join(DEVICES, devices[sourceId].folder);
      const sourcePath = path.join(sourceFolder, fileName);
      
      // Если это папка (PPTX/PDF/изображения) - используем физическое копирование
      if (fs.existsSync(sourcePath) && fs.statSync(sourcePath).isDirectory()) {
        return await copyFolderPhysically(sourceId, targetId, fileName, move, devices, fileNamesMap, saveFileNamesMap, io, res);
    } 
      
      // 1. Получаем метаданные файла из источника (обычный файл)
      const sourceMetadata = getFileMetadata(sourceId, fileName);
      
      if (!sourceMetadata) {
        return res.status(404).json({ error: 'source file not found in database' });
    }
    
      logFile('info', '📋 Copying file metadata', {
        sourceDevice: sourceId,
        targetDevice: targetId,
        fileName,
        filePath: sourceMetadata.file_path,
        md5: sourceMetadata.md5_hash?.substring(0, 12)
      });
      
      // 2. Проверяем не существует ли уже на целевом устройстве
      let targetSafeName = fileName;
      const existingOnTarget = getFileMetadata(targetId, fileName);
      
      if (existingOnTarget) {
        // Если файл существует - генерируем уникальное имя (как в Multer)
        const ext = path.extname(fileName);
        const name = path.basename(fileName, ext);
        const suffix = '_' + crypto.randomBytes(3).toString('hex');
        targetSafeName = `${name}${suffix}${ext}`;
        
        logFile('info', '⚠️ File exists on target, using unique name', {
          original: fileName,
          unique: targetSafeName
        });
        }
        
      // 3. ⚡ МГНОВЕННОЕ КОПИРОВАНИЕ: просто INSERT метаданных с тем же file_path!
      saveFileMetadata({
        deviceId: targetId,
        safeName: targetSafeName,
        originalName: sourceMetadata.original_name,
        filePath: sourceMetadata.file_path,  // ✅ ТОТ ЖЕ физический файл!
        fileSize: sourceMetadata.file_size,
        md5Hash: sourceMetadata.md5_hash,
        partialMd5: sourceMetadata.partial_md5,
        mimeType: sourceMetadata.mime_type,
        videoParams: {
          width: sourceMetadata.video_width,
          height: sourceMetadata.video_height,
          duration: sourceMetadata.video_duration,
          codec: sourceMetadata.video_codec,
          bitrate: sourceMetadata.video_bitrate
        },
        audioParams: {
          codec: sourceMetadata.audio_codec,
          bitrate: sourceMetadata.audio_bitrate,
          channels: sourceMetadata.audio_channels
        },
        fileMtime: sourceMetadata.file_mtime
      });
      
      // 4. Копируем маппинг имени
      if (fileNamesMap[sourceId] && fileNamesMap[sourceId][fileName]) {
        if (!fileNamesMap[targetId]) fileNamesMap[targetId] = {};
        fileNamesMap[targetId][targetSafeName] = fileNamesMap[sourceId][fileName];
        saveFileNamesMap(fileNamesMap);
      }
      
      // 5. Если move - удаляем из источника (только из БД!)
      if (move) {
        deleteFileMetadata(sourceId, fileName);
        
        if (fileNamesMap[sourceId] && fileNamesMap[sourceId][fileName]) {
          delete fileNamesMap[sourceId][fileName];
          if (Object.keys(fileNamesMap[sourceId]).length === 0) {
            delete fileNamesMap[sourceId];
          }
          saveFileNamesMap(fileNamesMap);
        }
        
        logFile('info', '🔄 File moved (metadata only)', {
          from: sourceId,
          to: targetId,
          fileName
        });
      }
      
      // 6. Обновляем devices.files из БД
      updateDeviceFilesFromDB(targetId, devices, fileNamesMap);
      if (move) {
        updateDeviceFilesFromDB(sourceId, devices, fileNamesMap);
      }
      
      io.emit('devices/updated');
      
      logFile('info', `✅ File ${move ? 'moved' : 'copied'} instantly via DB`, {
        sourceDevice: sourceId,
        targetDevice: targetId,
        fileName,
        sharedFilePath: sourceMetadata.file_path,
        timeTaken: '<1ms'
      });
      
      res.json({ 
        ok: true, 
        action: move ? 'moved' : 'copied', 
        file: fileName, 
        from: sourceId, 
        to: targetId,
        instant: true  // Мгновенное копирование!
      });
      
    } catch (e) {
      logger.error('[copy-file] Error', { 
        error: e.message, 
        sourceId, 
        targetId, 
        fileName 
      });
      return res.status(500).json({ error: 'copy/move failed', detail: e.message });
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
      // НОВОЕ: Обычный файл - умное удаление с подсчетом ссылок
      
      // 1. Получаем метаданные из БД
      const metadata = getFileMetadata(id, name);
      
      if (!metadata) {
        logFile('warn', 'File not found in DB', { deviceId: id, fileName: name });
        return res.status(404).json({ error: 'file not found' });
      }
      
      const physicalPath = metadata.file_path;
      
      // 2. Удаляем запись из БД
      deleteFileMetadata(id, name);
      
      // 3. Подсчитываем сколько еще устройств используют этот файл
      const refCount = countFileReferences(physicalPath);
      
      logFile('info', 'File reference removed', {
        deviceId: id,
        fileName: name,
        physicalPath,
        remainingReferences: refCount
      });
      
      // 4. Если никто не использует - удаляем физический файл
      if (refCount === 0) {
        try {
          if (fs.existsSync(physicalPath)) {
            fs.unlinkSync(physicalPath);
            logFile('info', '🗑️ Physical file deleted (no references)', {
              filePath: physicalPath,
              sizeMB: (metadata.file_size / 1024 / 1024).toFixed(2)
            });
          }
        } catch (e) {
          logger.error('Failed to delete physical file', {
            error: e.message,
            filePath: physicalPath
          });
        }
      } else {
        logFile('info', '✅ Physical file kept (still used)', {
          filePath: physicalPath,
          usedByDevices: refCount
        });
      }
      
      // Очищаем кэш разрешения
      clearResolutionCache(physicalPath);
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
    
    // НОВОЕ: Обновляем список файлов из БД (а не из файловой системы)
    updateDeviceFilesFromDB(id, devices, fileNamesMap);
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
          // (для файлов загруженных до миграции БД)
          try {
            const filePath = metadata?.file_path || path.join(DEVICES, safeName);
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

