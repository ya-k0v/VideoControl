/**
 * Клиент для работы с API
 * @module shared/api-client
 */

/**
 * Обертка для fetch с обработкой ошибок
 * @param {string} url - URL для запроса
 * @param {Object} options - Опции fetch
 * @returns {Promise<any>} Результат запроса
 */
export async function apiFetch(url, options = {}) {
  try {
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      },
      ...options
    });
    
    if (!response.ok) {
      const errorText = await response.text().catch(() => response.statusText);
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }
    
    // Проверяем есть ли content
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      return await response.json();
    }
    
    return await response.text();
    
  } catch (error) {
    console.error(`[API] Ошибка запроса ${url}:`, error);
    throw error;
  }
}

/**
 * GET запрос
 * @param {string} url - URL
 * @param {Object} options - Опции
 * @returns {Promise<any>} Результат
 */
export async function apiGet(url, options = {}) {
  return apiFetch(url, { ...options, method: 'GET' });
}

/**
 * POST запрос
 * @param {string} url - URL
 * @param {any} data - Данные для отправки
 * @param {Object} options - Опции
 * @returns {Promise<any>} Результат
 */
export async function apiPost(url, data, options = {}) {
  return apiFetch(url, {
    ...options,
    method: 'POST',
    body: JSON.stringify(data)
  });
}

/**
 * DELETE запрос
 * @param {string} url - URL
 * @param {Object} options - Опции
 * @returns {Promise<any>} Результат
 */
export async function apiDelete(url, options = {}) {
  return apiFetch(url, { ...options, method: 'DELETE' });
}

/**
 * Загрузка файлов через FormData
 * @param {string} url - URL для загрузки
 * @param {FormData} formData - Данные формы
 * @param {Function} onProgress - Callback для прогресса (необязательно)
 * @returns {Promise<any>} Результат
 */
export async function apiUpload(url, formData, onProgress = null) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    
    if (onProgress) {
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const percentComplete = Math.round((e.loaded / e.total) * 100);
          onProgress(percentComplete);
        }
      });
    }
    
    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const result = JSON.parse(xhr.responseText);
          resolve(result);
        } catch (e) {
          resolve(xhr.responseText);
        }
      } else {
        reject(new Error(`HTTP ${xhr.status}: ${xhr.statusText}`));
      }
    });
    
    xhr.addEventListener('error', () => {
      reject(new Error('Network error'));
    });
    
    xhr.open('POST', url);
    xhr.send(formData);
  });
}

