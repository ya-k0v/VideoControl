/**
 * MD5 Helper - вычисление MD5 хэша файла в браузере
 * Используется для дедупликации перед загрузкой
 */

/**
 * Вычислить MD5 хэш файла в браузере (с использованием Web Crypto API + fallback)
 * @param {File} file - Файл для хэширования
 * @param {Function} onProgress - Колбэк прогресса (0-100)
 * @returns {Promise<string>} - MD5 хэш в hex формате
 */
export async function calculateFileMD5(file, onProgress = null) {
  // Используем простой способ - читаем файл и вычисляем хэш через crypto-js (если доступен)
  // Или используем упрощенный хэш для быстрой проверки
  
  try {
    // Если файл большой (>100MB), используем упрощенное хэширование (первые 10MB)
    const chunkSize = 10 * 1024 * 1024; // 10 MB
    const isBigFile = file.size > 100 * 1024 * 1024;
    
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      const spark = new SparkMD5.ArrayBuffer();
      let currentChunk = 0;
      const chunks = isBigFile ? Math.ceil(chunkSize / (2 * 1024 * 1024)) : Math.ceil(file.size / (2 * 1024 * 1024));
      
      reader.onload = (e) => {
        spark.append(e.target.result);
        currentChunk++;
        
        if (onProgress) {
          const progress = Math.round((currentChunk / chunks) * 100);
          onProgress(progress);
        }
        
        if (currentChunk < chunks) {
          loadNext();
        } else {
          const md5 = spark.end();
          resolve(md5);
        }
      };
      
      reader.onerror = () => reject(new Error('Failed to read file'));
      
      function loadNext() {
        const start = currentChunk * (2 * 1024 * 1024);
        const end = Math.min(start + (2 * 1024 * 1024), isBigFile ? chunkSize : file.size);
        const slice = file.slice(start, end);
        reader.readAsArrayBuffer(slice);
      }
      
      loadNext();
    });
  } catch (e) {
    console.error('[MD5] Error calculating MD5:', e);
    // Fallback: используем простой хэш (размер + имя + timestamp)
    return Promise.resolve(simpleHash(file));
  }
}

/**
 * Простой хэш для fallback (если SparkMD5 не доступен)
 */
function simpleHash(file) {
  const str = `${file.name}-${file.size}-${file.lastModified}`;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(16).padStart(32, '0');
}

/**
 * Проверить доступна ли библиотека SparkMD5
 */
export function isMD5Available() {
  return typeof SparkMD5 !== 'undefined';
}

