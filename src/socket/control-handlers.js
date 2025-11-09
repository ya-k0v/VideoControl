/**
 * Обработчики управления плеером (control/*)
 * @module socket/control-handlers
 */

import { getFolderImagesCount } from '../converters/folder-converter.js';

/**
 * Настраивает обработчики управления плеером
 * @param {Socket} socket - Socket.IO сокет
 * @param {Object} deps - Зависимости {devices, io, getPageSlideCount}
 */
export function setupControlHandlers(socket, deps) {
  const { devices, io, getPageSlideCount } = deps;
  
  // control/play - Запустить воспроизведение
  socket.on('control/play', ({ device_id, file }) => {
    const d = devices[device_id];
    if (!d) return;
    
    if (file) {
      const ext = file.split('.').pop().toLowerCase();
      
      // Определяем тип контента
      let type = 'video'; // По умолчанию
      if (ext === 'pdf') type = 'pdf';
      else if (ext === 'pptx') type = 'pptx';
      else if (['png','jpg','jpeg','gif','webp'].includes(ext)) type = 'image';
      else if (ext === 'zip') type = 'folder'; // ZIP = папка с изображениями
      // Если файла с расширением нет, проверяем, может это папка
      else if (!ext || ext === file) {
        // Это может быть папка (имя без расширения)
        type = 'folder';
      }
      
      d.current = { 
        type, 
        file, 
        state: 'playing', 
        page: (type === 'pdf' || type === 'pptx' || type === 'folder') ? 1 : undefined 
      };
      
      io.to(`device:${device_id}`).emit('player/play', d.current);
    } else {
      // ИСПРАВЛЕНИЕ: Если файл не указан (resume после паузы)
      // Отправляем команду resume на устройство
      // Android клиент сам знает, что воспроизводить с сохраненной позиции
      if (d.current && d.current.type !== 'idle') {
        // Есть информация о текущем файле - отправляем
        d.current.state = 'playing';
        io.to(`device:${device_id}`).emit('player/play', d.current);
      } else {
        // Нет информации (после перезапуска) - просто отправляем команду resume
        // Android клиент продолжит с последней позиции
        io.to(`device:${device_id}`).emit('player/resume');
      }
    }
    
    io.emit('preview/refresh', { device_id });
  });

  // control/pause - Пауза
  socket.on('control/pause', ({ device_id }) => {
    const d = devices[device_id];
    if (!d) return;
    
    d.current.state = 'paused';
    io.to(`device:${device_id}`).emit('player/pause');
    io.emit('preview/refresh', { device_id });
  });

  // control/restart - Перезапуск
  socket.on('control/restart', ({ device_id }) => {
    const d = devices[device_id];
    if (!d) return;
    
    d.current.state = 'playing';
    io.to(`device:${device_id}`).emit('player/restart');
    io.emit('preview/refresh', { device_id });
  });

  // control/stop - Остановка
  socket.on('control/stop', ({ device_id }) => {
    const d = devices[device_id];
    if (!d) return;
    
    d.current = { type: 'idle', file: null, state: 'idle' };
    io.to(`device:${device_id}`).emit('player/stop');
    io.emit('preview/refresh', { device_id });
  });

  // control/pdfPrev - Предыдущая страница/слайд/изображение
  socket.on('control/pdfPrev', ({ device_id }) => {
    const d = devices[device_id];
    if (!d) return;
    
    if (d.current.type === 'pdf') {
      d.current.page = Math.max(1, (d.current.page || 1) - 1);
      io.to(`device:${device_id}`).emit('player/pdfPage', d.current.page);
    } else if (d.current.type === 'pptx') {
      d.current.page = Math.max(1, (d.current.page || 1) - 1);
      io.to(`device:${device_id}`).emit('player/pptxPage', d.current.page);
    } else if (d.current.type === 'folder') {
      d.current.page = Math.max(1, (d.current.page || 1) - 1);
      io.to(`device:${device_id}`).emit('player/folderPage', d.current.page);
    }
  });

  // control/pdfNext - Следующая страница/слайд/изображение
  socket.on('control/pdfNext', async ({ device_id }) => {
    const d = devices[device_id];
    if (!d) return;
    
    if (d.current.type === 'pdf' && d.current.file) {
      const maxPages = await getPageSlideCount(device_id, d.current.file, 'page');
      if (maxPages > 0) {
        const nextPage = Math.min((d.current.page || 1) + 1, maxPages);
        if (nextPage !== d.current.page) {
          d.current.page = nextPage;
          io.to(`device:${device_id}`).emit('player/pdfPage', d.current.page);
        }
      }
    } else if (d.current.type === 'pptx' && d.current.file) {
      const maxSlides = await getPageSlideCount(device_id, d.current.file, 'slide');
      if (maxSlides > 0) {
        const nextSlide = Math.min((d.current.page || 1) + 1, maxSlides);
        if (nextSlide !== d.current.page) {
          d.current.page = nextSlide;
          io.to(`device:${device_id}`).emit('player/pptxPage', d.current.page);
        }
      }
    } else if (d.current.type === 'folder' && d.current.file) {
      // Получаем количество изображений в папке
      const folderName = d.current.file.replace(/\.zip$/i, ''); // Убираем .zip если есть
      const maxImages = await getFolderImagesCount(device_id, folderName);
      if (maxImages > 0) {
        const nextImage = Math.min((d.current.page || 1) + 1, maxImages);
        if (nextImage !== d.current.page) {
          d.current.page = nextImage;
          io.to(`device:${device_id}`).emit('player/folderPage', d.current.page);
        }
      }
    }
  });
}

