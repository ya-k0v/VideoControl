/**
 * Главный модуль Socket.IO обработчиков
 * @module socket/index
 */

import { getOnlineDevices } from './connection-manager.js';
import { setupDeviceHandlers, handleDisconnect } from './device-handlers.js';
import { setupControlHandlers } from './control-handlers.js';

/**
 * Настраивает все Socket.IO обработчики
 * @param {Server} io - Socket.IO сервер
 * @param {Object} deps - Зависимости {devices, getPageSlideCount}
 */
export function setupSocketHandlers(io, deps) {
  const { devices, getPageSlideCount } = deps;
  
  io.on('connection', socket => {
    const transport = socket.conn?.transport?.name;
    console.log(`[Socket.IO] 🔌 connection id=${socket.id} transport=${transport}`);

    // Логирование transport events
    if (socket.conn) {
      socket.conn.on('upgrade', () => {
        console.log(`[Socket.IO] 🚀 transport upgraded for ${socket.id} → ${socket.conn.transport.name}`);
      });
      
      socket.conn.on('close', (reason) => {
        console.warn(`[Socket.IO] 🔌 connection closed id=${socket.id} reason=${reason}`);
      });
    }

    // Отправляем snapshot онлайн устройств при подключении
    try {
      const snapshot = getOnlineDevices();
      socket.emit('players/onlineSnapshot', snapshot);
    } catch (e) {
      console.error(`[Socket.IO] ❌ Ошибка отправки snapshot:`, e);
    }
    
    // Настраиваем обработчики
    setupDeviceHandlers(socket, { devices, io });
    setupControlHandlers(socket, { devices, io, getPageSlideCount });
    handleDisconnect(socket, { io });
  });
}

