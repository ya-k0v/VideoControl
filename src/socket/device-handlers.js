/**
 * Обработчики устройств (player/register, player/ping)
 * @module socket/device-handlers
 */

import { getActiveConnections, getDeviceSockets } from './connection-manager.js';

/**
 * Настраивает обработчики регистрации и пингов устройств
 * @param {Socket} socket - Socket.IO сокет
 * @param {Object} deps - Зависимости {devices, io}
 */
export function setupDeviceHandlers(socket, deps) {
  const { devices, io } = deps;
  const activeConnections = getActiveConnections();
  const deviceSockets = getDeviceSockets();
  
  // player/register - Регистрация устройства
  socket.on('player/register', ({ device_id, device_type, capabilities, platform }) => {
    if (!device_id || !devices[device_id]) {
      socket.emit('player/reject', { reason: 'unknown_device' });
      return;
    }
    
    const defaultCapabilities = {
      video: true,
      audio: true,
      images: true,
      pdf: true,
      pptx: true,
      streaming: true
    };
    
    // Обновляем информацию об устройстве
    devices[device_id].deviceType = device_type || 'browser';
    devices[device_id].capabilities = capabilities || defaultCapabilities;
    devices[device_id].platform = platform || 'Unknown';
    devices[device_id].lastSeen = new Date().toISOString();
    
    // Проверяем было ли устройство подключено ранее
    const prevDevice = activeConnections.get(socket.id);
    
    if (prevDevice && prevDevice !== device_id) {
      // Отключаем от предыдущего устройства
      const prevSockets = deviceSockets.get(prevDevice);
      if (prevSockets) {
        prevSockets.delete(socket.id);
        if (prevSockets.size === 0) {
          deviceSockets.delete(prevDevice);
          io.emit('player/offline', { device_id: prevDevice });
        }
      }
    }
    
    // Проверяем повторную регистрацию того же устройства
    if (prevDevice === device_id) {
      const sockets = deviceSockets.get(device_id);
      if (sockets && sockets.has(socket.id)) {
        // Обновляем ping
        if (socket.data) socket.data.lastPing = Date.now();
        
        // Сбрасываем состояние
        devices[device_id].current = { type: 'idle', file: null, state: 'idle' };
        socket.emit('player/state', devices[device_id].current);
        return;
      }
    }
    
    // Регистрируем новое подключение
    socket.join(`device:${device_id}`);
    socket.data.device_id = device_id;
    socket.data.lastPing = Date.now();
    activeConnections.set(socket.id, device_id);
    
    if (!deviceSockets.has(device_id)) {
      deviceSockets.set(device_id, new Set());
    }
    
    const wasOffline = deviceSockets.get(device_id).size === 0;
    deviceSockets.get(device_id).add(socket.id);
    
    if (wasOffline) {
      io.emit('player/online', { device_id });
    }
    
    // Сбрасываем состояние устройства
    devices[device_id].current = { type: 'idle', file: null, state: 'idle' };
    socket.emit('player/state', devices[device_id].current);
    
    // КРИТИЧНО: Отправляем подтверждение успешной регистрации
    socket.emit('player/registered', { 
      device_id, 
      current: devices[device_id].current,
      timestamp: Date.now()
    });
    
    console.log(`[Server] ✅ Player registered: ${device_id} (socket: ${socket.id}, transport: ${socket.conn.transport.name})`);
  });
    
  // player/ping - Keep-alive пинг
  socket.on('player/ping', () => {
    if (socket.data.device_id) {
      socket.emit('player/pong');
      if (socket.data) socket.data.lastPing = Date.now();
      console.log(`[Server] 🏓 Ping from ${socket.data.device_id} (socket: ${socket.id})`);
    }
  });
  
  // Таймер неактивности для автоматического отключения
  socket.data.lastPing = Date.now();
  socket.data.inactivityTimeout = setInterval(() => {
    if (!socket.connected || !socket.data.device_id) {
      clearInterval(socket.data.inactivityTimeout);
      socket.data.inactivityTimeout = null;
      return;
    }
    
    const timeSinceLastPing = Date.now() - (socket.data.lastPing || 0);
    
    // Отключаем если нет активности 30 секунд
    if (timeSinceLastPing > 30000) {
      const did = socket.data.device_id;
      const sockets = deviceSockets.get(did);
      
      if (sockets) {
        sockets.delete(socket.id);
        if (sockets.size === 0) {
          deviceSockets.delete(did);
          io.emit('player/offline', { device_id: did });
        }
      }
      
      activeConnections.delete(socket.id);
      clearInterval(socket.data.inactivityTimeout);
      socket.data.inactivityTimeout = null;
      socket.disconnect(true);
    }
  }, 10000); // Проверяем каждые 10 секунд
}

/**
 * Обработчик отключения сокета
 * @param {Socket} socket - Socket.IO сокет
 * @param {Object} deps - Зависимости {io}
 */
export function handleDisconnect(socket, deps) {
  const { io } = deps;
  const activeConnections = getActiveConnections();
  const deviceSockets = getDeviceSockets();
  
  // disconnecting - сокет отключается (до полного разрыва)
  socket.on('disconnecting', () => {
    const did = socket.data?.device_id;
    
    if (socket.data.inactivityTimeout) {
      clearInterval(socket.data.inactivityTimeout);
      socket.data.inactivityTimeout = null;
    }
    
    if (!did) return;
    
    const sockets = deviceSockets.get(did);
    if (sockets) {
      sockets.delete(socket.id);
      if (sockets.size === 0) {
        deviceSockets.delete(did);
        io.emit('player/offline', { device_id: did });
      }
    }
    
    activeConnections.delete(socket.id);
  });
  
  // disconnect - сокет полностью отключен
  socket.on('disconnect', () => {
    if (socket.data.inactivityTimeout) {
      clearInterval(socket.data.inactivityTimeout);
      socket.data.inactivityTimeout = null;
    }
    
    const did = socket.data?.device_id;
    
    if (did && activeConnections.get(socket.id) === did) {
      const sockets = deviceSockets.get(did);
      if (sockets) {
        sockets.delete(socket.id);
        if (sockets.size === 0) {
          deviceSockets.delete(did);
          io.emit('player/offline', { device_id: did });
        }
      }
      activeConnections.delete(socket.id);
    }
  });
}

