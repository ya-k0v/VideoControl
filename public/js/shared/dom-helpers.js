/**
 * DOM утилиты и хелперы
 * @module shared/dom-helpers
 */

/**
 * Debounce функция (отложенное выполнение)
 * @param {Function} fn - Функция для выполнения
 * @param {number} delay - Задержка в миллисекундах
 * @returns {Function} Debounced функция
 */
export function debounce(fn, delay = 300) {
  let timer;
  return function(...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

/**
 * Создать элемент с классами и атрибутами
 * @param {string} tag - Тег элемента
 * @param {Object} options - Опции {className, attrs, text, html}
 * @returns {HTMLElement} Созданный элемент
 */
export function createElement(tag, options = {}) {
  const el = document.createElement(tag);
  
  if (options.className) {
    el.className = options.className;
  }
  
  if (options.attrs) {
    for (const [key, value] of Object.entries(options.attrs)) {
      el.setAttribute(key, value);
    }
  }
  
  if (options.text) {
    el.textContent = options.text;
  }
  
  if (options.html) {
    el.innerHTML = options.html;
  }
  
  return el;
}

/**
 * Безопасное кодирование для URL
 * @param {string} str - Строка для кодирования
 * @returns {string} Закодированная строка
 */
export function safeEncodeURIComponent(str) {
  try {
    return encodeURIComponent(str);
  } catch (e) {
    console.warn('[DOM] Ошибка кодирования:', e);
    return str;
  }
}

/**
 * Безопасное декодирование из URL
 * @param {string} str - Закодированная строка
 * @returns {string} Декодированная строка
 */
export function safeDecodeURIComponent(str) {
  try {
    return decodeURIComponent(str);
  } catch (e) {
    console.warn('[DOM] Ошибка декодирования:', e);
    return str;
  }
}

/**
 * Показать уведомление (можно расширить позже)
 * @param {string} message - Сообщение
 * @param {string} type - Тип (info, success, error, warning)
 */
export function showNotification(message, type = 'info') {
  console.log(`[${type.toUpperCase()}] ${message}`);
  // TODO: Можно добавить toast notifications
}

