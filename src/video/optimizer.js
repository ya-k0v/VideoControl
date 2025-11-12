/**
 * Оптимизация видео для Android TV
 * @module video/optimizer
 */

import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { DEVICES, VIDEO_OPTIMIZATION_CONFIG_PATH } from '../config/constants.js';
import { checkVideoParameters } from './ffmpeg-wrapper.js';
import { setFileStatus, deleteFileStatus } from './file-status.js';

// Загрузка конфигурации оптимизации
let videoOptConfig = {};
try {
  if (fs.existsSync(VIDEO_OPTIMIZATION_CONFIG_PATH)) {
    videoOptConfig = JSON.parse(fs.readFileSync(VIDEO_OPTIMIZATION_CONFIG_PATH, 'utf-8'));
    console.log('[VideoOpt] ✅ Конфигурация загружена');
  }
} catch (e) {
  console.warn('[VideoOpt] ⚠️ Ошибка загрузки конфигурации, используем defaults');
  videoOptConfig = { enabled: false };
}

/**
 * Получить конфигурацию оптимизации
 * @returns {Object} Конфигурация
 */
export function getVideoOptConfig() {
  return videoOptConfig;
}

/**
 * Проверяем нужна ли оптимизация видео
 * @param {Object} params - Параметры видео {codec, width, height, fps, bitrate, profile}
 * @returns {boolean} true если требуется оптимизация
 */
export function needsOptimization(params) {
  if (!params || !videoOptConfig.enabled) return false;
  
  const thresholds = videoOptConfig.thresholds || {};
  
  const needsOpt = 
    params.width > (thresholds.maxWidth || 1920) ||
    params.height > (thresholds.maxHeight || 1080) ||
    params.fps > (thresholds.maxFps || 30) ||
    params.bitrate > (thresholds.maxBitrate || 6000000) ||
    params.profile === 'High 10' ||
    params.profile === 'High 4:2:2' ||  // ИСПРАВЛЕНО: Добавлена проверка High 4:2:2
    params.profile === 'High 4:4:4 Predictive' ||
    (params.codec !== 'h264' && params.codec !== 'H.264');
  
  return needsOpt;
}

/**
 * Автоматическая оптимизация видео для Android TV
 * @param {string} deviceId - ID устройства
 * @param {string} fileName - Имя файла
 * @param {Object} devices - Объект devices
 * @param {Object} io - Socket.IO instance
 * @param {Object} fileNamesMap - Маппинг имен файлов
 * @param {Function} saveFileNamesMapFn - Функция сохранения маппинга
 * @returns {Promise<Object>} Результат оптимизации
 */
export async function autoOptimizeVideo(deviceId, fileName, devices, io, fileNamesMap, saveFileNamesMapFn) {
  const d = devices[deviceId];
  if (!d) return { success: false, message: 'Device not found' };
  
  if (!videoOptConfig.enabled) {
    return { success: false, message: 'Video optimization disabled' };
  }
  
  // ИСПРАВЛЕНО: Получаем путь из БД для новой архитектуры storage
  const { getFileMetadata } = await import('../database/files-metadata.js');
  const metadata = getFileMetadata(deviceId, fileName);
  
  let filePath;
  if (metadata && metadata.file_path) {
    // Медиафайл из БД (в /content/)
    filePath = metadata.file_path;
  } else {
    // Fallback для PDF/PPTX/folders (в /content/{device}/)
    const deviceFolder = path.join(DEVICES, d.folder);
    filePath = path.join(deviceFolder, fileName);
  }
  
  if (!fs.existsSync(filePath)) {
    return { success: false, message: 'File not found' };
  }
  
  const ext = path.extname(fileName).toLowerCase();
  if (!['.mp4', '.webm', '.ogg', '.mkv', '.mov', '.avi'].includes(ext)) {
    return { success: false, message: 'Not a video file' };
  }
  
  console.log(`[VideoOpt] 🔍 Проверка: ${fileName}`);
  
  // Устанавливаем статус "проверка"
  setFileStatus(deviceId, fileName, { status: 'checking', progress: 0, canPlay: false });
  
  // НОВОЕ: Сначала проверяем метаданные из БД (быстрее чем FFmpeg!)
  let params;
  if (metadata && metadata.video_width && metadata.video_profile) {
    params = {
      codec: metadata.video_codec,
      width: metadata.video_width,
      height: metadata.video_height,
      fps: 30,  // Приблизительно
      bitrate: metadata.video_bitrate || 0,
      profile: metadata.video_profile  // КРИТИЧНО!
    };
    console.log(`[VideoOpt] 📊 Параметры из БД: ${params.width}x${params.height}, ${params.codec}/${params.profile}`);
  } else {
    // Fallback: получаем через FFmpeg если нет в БД
    params = await checkVideoParameters(filePath);
    if (!params) {
      deleteFileStatus(deviceId, fileName);
      return { success: false, message: 'Cannot read video parameters' };
    }
    console.log(`[VideoOpt] 📊 Параметры через FFmpeg: ${params.width}x${params.height} @ ${params.fps}fps, ${Math.round(params.bitrate/1000)}kbps, ${params.codec}/${params.profile}`);
  }
  
  // Проверяем нужна ли оптимизация
  if (!needsOptimization(params)) {
    console.log(`[VideoOpt] ✅ Видео оптимально: ${fileName}`);
    setFileStatus(deviceId, fileName, { status: 'ready', progress: 100, canPlay: true });
    
    // КРИТИЧНО: Отправляем событие клиентам даже если оптимизация не требуется
    io.emit('devices/updated');
    io.emit('file/ready', { device_id: deviceId, file: fileName });
    
    return { success: true, message: 'Already optimized', optimized: false };
  }
  
  console.log(`[VideoOpt] ⚠️ Требуется оптимизация: ${fileName}`);
  
  // Устанавливаем статус "обработка"
  setFileStatus(deviceId, fileName, { status: 'processing', progress: 5, canPlay: false });
  io.emit('file/processing', { device_id: deviceId, file: fileName });
  
  // Определяем целевой профиль
  const profiles = videoOptConfig.profiles || {};
  let targetProfile = profiles['1080p'];
  
  // Если видео меньше 1080p - используем 720p
  if (params.width <= 1280 && params.height <= 720) {
    targetProfile = profiles['720p'];
  }
  
  // Если видео больше 1080p (4K) - конвертируем в 1080p
  if (params.width > 1920 || params.height > 1080) {
    targetProfile = profiles['1080p'];
    console.log(`[VideoOpt] 📉 4K → 1080p конвертация`);
  }
  
  const optConfig = videoOptConfig.optimization || {};
  
  // КРИТИЧНО: Всегда конвертируем в MP4 (даже если оригинал WebM/MKV/AVI)
  const outputExt = '.mp4';
  
  // ИСПРАВЛЕНО: Временный файл сохраняем в той же папке что и оригинал
  const fileDir = path.dirname(filePath);
  const tempPath = path.join(fileDir, `.optimizing_${Date.now()}${outputExt}`);
  
  // Определяем финальное имя файла
  const baseFileName = path.basename(fileName, ext);
  const finalFileName = ext === '.mp4' ? fileName : `${baseFileName}.mp4`;
  const finalPath = path.join(fileDir, finalFileName);
  
  console.log(`[VideoOpt] 🎬 Начало конвертации: ${fileName}`);
  if (ext !== '.mp4') {
    console.log(`[VideoOpt] 🔄 Конвертация ${ext} → .mp4: ${finalFileName}`);
  }
  console.log(`[VideoOpt] 🎯 Профиль: ${targetProfile.width}x${targetProfile.height} @ ${targetProfile.fps}fps, ${targetProfile.bitrate}`);
  
  try {
    // FFmpeg аргументы
    const ffmpegArgs = [
      '-i', filePath,
      '-c:v', 'libx264',
      '-profile:v', targetProfile.profile,
      '-level', String(targetProfile.level),
      '-vf', `scale=${targetProfile.width}:${targetProfile.height}`,
      '-r', String(targetProfile.fps),
      '-b:v', targetProfile.bitrate,
      '-maxrate', targetProfile.maxrate,
      '-bufsize', targetProfile.bufsize,
      '-g', String(targetProfile.fps * 2),
      '-preset', optConfig.preset || 'medium',
      '-pix_fmt', optConfig.pixelFormat || 'yuv420p',
      '-c:a', optConfig.audioCodec || 'aac',
      '-b:a', targetProfile.audioBitrate,
      '-ar', String(optConfig.audioSampleRate || '44100'),
      '-ac', String(optConfig.audioChannels || 2),
      '-movflags', '+faststart',
      '-y', tempPath
    ];
    
    console.log(`[VideoOpt] 🔧 FFmpeg команда: ffmpeg ${ffmpegArgs.join(' ')}`);
    
    // Запускаем FFmpeg с отслеживанием прогресса
    await new Promise((resolve, reject) => {
      const ffmpegProcess = spawn('ffmpeg', ffmpegArgs);
      
      let duration = 0;
      let stderr = '';
      
      // Парсим вывод FFmpeg для прогресса
      ffmpegProcess.stderr.on('data', (data) => {
        const output = data.toString();
        stderr += output;
        
        // Извлекаем длительность видео (только один раз)
        if (duration === 0) {
          const durationMatch = output.match(/Duration: (\d{2}):(\d{2}):(\d{2}\.\d{2})/);
          if (durationMatch) {
            const hours = parseInt(durationMatch[1]);
            const minutes = parseInt(durationMatch[2]);
            const seconds = parseFloat(durationMatch[3]);
            duration = hours * 3600 + minutes * 60 + seconds;
            console.log(`[VideoOpt] ⏱️ Длительность видео: ${duration.toFixed(1)}s`);
          }
        }
        
        // Извлекаем текущее время обработки
        if (duration > 0) {
          const timeMatch = output.match(/time=(\d{2}):(\d{2}):(\d{2}\.\d{2})/);
          if (timeMatch) {
            const hours = parseInt(timeMatch[1]);
            const minutes = parseInt(timeMatch[2]);
            const seconds = parseFloat(timeMatch[3]);
            const currentTime = hours * 3600 + minutes * 60 + seconds;
            
            // Вычисляем прогресс (10% - 90%)
            const rawProgress = (currentTime / duration) * 100;
            const progress = Math.min(90, Math.max(10, 10 + Math.round(rawProgress * 0.8)));
            
            // Обновляем статус
            setFileStatus(deviceId, fileName, { status: 'processing', progress, canPlay: false });
            
            // Отправляем событие клиентам каждые 5%
            if (progress % 5 === 0) {
              io.emit('file/progress', { device_id: deviceId, file: fileName, progress });
              console.log(`[VideoOpt] 📊 Прогресс: ${progress}% (${currentTime.toFixed(1)}s / ${duration.toFixed(1)}s)`);
            }
          }
        }
      });
      
      ffmpegProcess.on('close', (code) => {
        if (code === 0) {
          console.log(`[VideoOpt] ✅ FFmpeg завершен успешно`);
          resolve();
        } else {
          console.error(`[VideoOpt] ❌ FFmpeg завершен с кодом ${code}`);
          console.error(`[VideoOpt] Stderr: ${stderr.substring(stderr.length - 500)}`); // Последние 500 символов
          reject(new Error(`FFmpeg exited with code ${code}`));
        }
      });
      
      ffmpegProcess.on('error', (err) => {
        console.error(`[VideoOpt] ❌ Ошибка запуска FFmpeg: ${err}`);
        reject(err);
      });
    });
    
    setFileStatus(deviceId, fileName, { status: 'processing', progress: 90, canPlay: false });
    console.log(`[VideoOpt] ✅ Конвертация завершена: ${fileName}`);
    
    // Проверяем что файл создан и не пустой
    const stats = fs.statSync(tempPath);
    if (stats.size === 0) {
      throw new Error('Converted file is empty');
    }
    
    // КРИТИЧНО: Удаляем оригинал и заменяем оптимизированным
    // Если конвертация изменила формат (webm→mp4) - переименовываем файл
    if (ext !== '.mp4') {
      console.log(`[VideoOpt] 🔄 Замена формата: ${fileName} → ${finalFileName}`);
      
      // Удаляем оригинал (.webm, .mkv, etc)
      fs.unlinkSync(filePath);
      
      // Переименовываем временный → финальное имя с .mp4
      fs.renameSync(tempPath, finalPath);
      
      // Обновляем маппинг имен (оригинальное имя сохраняем)
      if (fileNamesMap[deviceId] && fileNamesMap[deviceId][fileName]) {
        const originalName = fileNamesMap[deviceId][fileName];
        delete fileNamesMap[deviceId][fileName];
        fileNamesMap[deviceId][finalFileName] = originalName;
        saveFileNamesMapFn(fileNamesMap);
        console.log(`[VideoOpt] 📝 Маппинг обновлен: ${fileName} → ${finalFileName}`);
      }
      
      // Устанавливаем права
      fs.chmodSync(finalPath, 0o644);
      
      // НОВОЕ: Обновляем метаданные в БД (удаляем старую запись, создаем новую)
      if (metadata) {
        const { deleteFileMetadata, saveFileMetadata } = await import('../database/files-metadata.js');
        const newStats = fs.statSync(finalPath);
        const newParams = await checkVideoParameters(finalPath);
        
        // Удаляем старую запись (.webm)
        deleteFileMetadata(deviceId, fileName);
        
        // Создаем новую запись (.mp4)
        saveFileMetadata({
          deviceId,
          safeName: finalFileName,
          originalName: fileNamesMap[deviceId]?.[finalFileName] || finalFileName,
          filePath: finalPath,
          fileSize: newStats.size,
          md5Hash: metadata.md5_hash,
          partialMd5: metadata.partial_md5,
          mimeType: 'video/mp4',
          videoParams: {
            width: newParams.width,
            height: newParams.height,
            duration: newParams.duration,
            codec: newParams.codec,
            profile: newParams.profile,  // КРИТИЧНО: Сохраняем новый profile!
            bitrate: newParams.bitrate
          },
          audioParams: {
            codec: metadata.audio_codec,
            bitrate: metadata.audio_bitrate,
            channels: metadata.audio_channels
          },
          fileMtime: newStats.mtimeMs
        });
        
        console.log(`[VideoOpt] 📊 Метаданные обновлены в БД (${fileName} → ${finalFileName})`);
      }
      
      // Обновляем список файлов устройства
      const fileIndex = d.files.indexOf(fileName);
      if (fileIndex >= 0) {
        d.files[fileIndex] = finalFileName;
        if (d.fileNames && d.fileNames[fileIndex]) {
          // fileNames уже правильное из маппинга
        }
      }
      
      console.log(`[VideoOpt] 🎉 Видео конвертировано: ${fileName} → ${finalFileName}`);
      console.log(`[VideoOpt] 📊 Размер: ${Math.round(stats.size / 1024 / 1024)}MB`);
      
      // Статус для НОВОГО имени файла (.mp4)
      deleteFileStatus(deviceId, fileName); // Удаляем статус старого файла (.webm)
      setFileStatus(deviceId, finalFileName, { status: 'ready', progress: 100, canPlay: true });
      
      // КРИТИЧНО: Сначала обновляем devices, затем уведомляем о готовности файла
      io.emit('devices/updated');
      io.emit('file/ready', { device_id: deviceId, file: finalFileName });
      
    } else {
      // MP4 → MP4 (просто замена на оптимизированный)
      fs.unlinkSync(filePath);
      fs.renameSync(tempPath, filePath);
      
      // Устанавливаем права
      fs.chmodSync(filePath, 0o644);
      
      // НОВОЕ: Обновляем метаданные в БД после оптимизации
      if (metadata) {
        const { saveFileMetadata } = await import('../database/files-metadata.js');
        const newStats = fs.statSync(filePath);
        const newParams = await checkVideoParameters(filePath);
        
        saveFileMetadata({
          deviceId,
          safeName: fileName,
          originalName: metadata.original_name,
          filePath,
          fileSize: newStats.size,
          md5Hash: metadata.md5_hash,  // MD5 сохраняем старый (т.к. для дедупликации)
          partialMd5: metadata.partial_md5,
          mimeType: 'video/mp4',
          videoParams: {
            width: newParams.width,
            height: newParams.height,
            duration: newParams.duration,
            codec: newParams.codec,
            profile: newParams.profile,  // КРИТИЧНО: Сохраняем новый profile!
            bitrate: newParams.bitrate
          },
          audioParams: {
            codec: metadata.audio_codec,
            bitrate: metadata.audio_bitrate,
            channels: metadata.audio_channels
          },
          fileMtime: newStats.mtimeMs
        });
        
        console.log(`[VideoOpt] 📊 Метаданные обновлены в БД`);
      }
      
      // Устанавливаем статус "готово"
      setFileStatus(deviceId, fileName, { status: 'ready', progress: 100, canPlay: true });
      
      // КРИТИЧНО: Сначала обновляем devices, затем уведомляем о готовности файла
      io.emit('devices/updated');
      io.emit('file/ready', { device_id: deviceId, file: fileName });
      
      console.log(`[VideoOpt] 🎉 Видео оптимизировано: ${fileName}`);
      console.log(`[VideoOpt] 📊 Размер: ${Math.round(stats.size / 1024 / 1024)}MB`);
    }
    
    return { 
      success: true, 
      message: 'Optimized successfully', 
      optimized: true,
      originalFile: fileName,
      finalFile: ext !== '.mp4' ? finalFileName : fileName,
      formatChanged: ext !== '.mp4',
      sizeBytes: stats.size,
      params: {
        before: params,
        after: {
          width: targetProfile.width,
          height: targetProfile.height,
          fps: targetProfile.fps,
          bitrate: targetProfile.bitrate
        }
      }
    };
    
  } catch (error) {
    console.error(`[VideoOpt] ❌ Ошибка конвертации: ${error.message}`);
    
    // Очищаем временный файл
    if (fs.existsSync(tempPath)) {
      fs.unlinkSync(tempPath);
    }
    
    // Определяем причину ошибки для понятного сообщения
    let errorMessage = error.message;
    
    if (params && params.codec && params.codec.toLowerCase() === 'av1') {
      errorMessage = `Кодек AV1 не поддерживается вашей версией FFmpeg. Файл воспроизводится как WebM, но может тормозить на Android. Рекомендация: конвертируйте файл в H.264 вручную или обновите FFmpeg.`;
      console.warn(`[VideoOpt] ⚠️ AV1 кодек не поддерживается`);
    } else if (params && params.codec && params.codec.toLowerCase() === 'vp9') {
      errorMessage = `Кодек VP9 может не поддерживаться. Файл воспроизводится как WebM, но может тормозить на Android.`;
    }
    
    // Устанавливаем статус "ошибка" но файл можно воспроизвести (оригинал)
    setFileStatus(deviceId, fileName, { 
      status: 'error', 
      progress: 0, 
      canPlay: true,  // Оригинал можно воспроизвести
      error: errorMessage 
    });
    io.emit('file/error', { device_id: deviceId, file: fileName, error: errorMessage });
    
    return { success: false, message: errorMessage };
  }
}

