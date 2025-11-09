/**
 * Socket.IO обработчики для админ-панели
 * @module admin/socket-listeners
 */

import { debounce } from '../shared/socket-base.js';

/**
 * Настраивает все Socket.IO обработчики для админки
 * @param {Socket} socket - Socket.IO instance
 * @param {Object} callbacks - Callback функции
 */
export function setupSocketListeners(socket, callbacks) {
  const {
    onDevicesUpdated,
    onFileProcessing,
    onFileProgress,
    onFileReady,
    onFileError,
    onPreviewRefresh,
    onPlayerOnline,
    onPlayerOffline,
    onPlayersSnapshot
  } = callbacks;
  
  // devices/updated - Обновление списка устройств
  socket.on('devices/updated', debounce(async () => {
    console.log('[Admin] 🔄 Устройства обновлены');
    if (onDevicesUpdated) await onDevicesUpdated();
  }, 150));
  
  // file/processing - Файл начал обработку
  socket.on('file/processing', ({ device_id, file }) => {
    console.log(`[Admin] ⏳ Файл в обработке: ${file} (${device_id})`);
    if (onFileProcessing) onFileProcessing(device_id, file);
  });
  
  // file/progress - Прогресс обработки файла
  socket.on('file/progress', ({ device_id, file, progress }) => {
    console.log(`[Admin] 📊 Прогресс: ${file} - ${progress}% (${device_id})`);
    if (onFileProgress) onFileProgress(device_id, file, progress);
  });
  
  // file/ready - Файл готов
  socket.on('file/ready', ({ device_id, file }) => {
    console.log(`[Admin] ✅ Файл готов: ${file} (${device_id})`);
    if (onFileReady) onFileReady(device_id, file);
  });
  
  // file/error - Ошибка обработки файла
  socket.on('file/error', ({ device_id, file, error }) => {
    console.error(`[Admin] ❌ Ошибка обработки: ${file} (${device_id}):`, error);
    if (onFileError) onFileError(device_id, file, error);
  });
  
  // preview/refresh - Обновить превью
  socket.on('preview/refresh', debounce(async () => {
    console.log('[Admin] 🔄 Обновление превью');
    if (onPreviewRefresh) await onPreviewRefresh();
  }, 150));
  
  // player/online - Устройство онлайн
  socket.on('player/online', ({ device_id }) => {
    console.log(`[Admin] 🟢 Устройство онлайн: ${device_id}`);
    if (onPlayerOnline) onPlayerOnline(device_id);
  });
  
  // player/offline - Устройство офлайн
  socket.on('player/offline', ({ device_id }) => {
    console.log(`[Admin] 🔴 Устройство офлайн: ${device_id}`);
    if (onPlayerOffline) onPlayerOffline(device_id);
  });
  
  // players/onlineSnapshot - Снимок онлайн устройств
  socket.on('players/onlineSnapshot', (list) => {
    console.log('[Admin] 📸 Snapshot онлайн устройств:', list);
    if (onPlayersSnapshot) onPlayersSnapshot(list);
  });
}

