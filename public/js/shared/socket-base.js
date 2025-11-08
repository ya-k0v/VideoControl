/**
 * Базовая логика Socket.IO для Frontend
 * @module shared/socket-base
 */

/**
 * Создать Socket.IO подключение с настройками
 * @param {string} path - Путь для подключения (по умолчанию '/')
 * @param {Object} options - Дополнительные опции
 * @returns {Socket} Socket.IO instance
 */
export function createSocket(path = '/', options = {}) {
  const socket = io(path, {
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 20000,
    ...options
  });
  
  // Базовое логирование соединения
  socket.on('connect', () => {
    console.log('[Socket] ✅ Подключено, ID:', socket.id);
  });
  
  socket.on('disconnect', (reason) => {
    console.log('[Socket] ⚠️ Отключено:', reason);
  });
  
  socket.on('reconnect', (attemptNumber) => {
    console.log('[Socket] 🔄 Переподключено после', attemptNumber, 'попыток');
  });
  
  socket.on('reconnect_error', (error) => {
    console.warn('[Socket] ❌ Ошибка переподключения:', error.message);
  });
  
  return socket;
}

/**
 * Debounce для обработчиков событий
 * @param {Function} fn - Функция
 * @param {number} delay - Задержка в мс
 * @returns {Function} Debounced функция
 */
export function debounce(fn, delay = 300) {
  let timer;
  return function(...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

