// Service Worker для VideoControl - Production Ready
// Версия 2.0 - с ограничением кэша и автообновлениями

const VERSION = 'v2';
const CACHE_NAME = `videocontrol-static-${VERSION}`;
const PLACEHOLDER_CACHE_NAME = `videocontrol-placeholder-${VERSION}`;
const CONTENT_CACHE_NAME = `videocontrol-content-${VERSION}`;

// Лимиты кэша
const MAX_STATIC_ITEMS = 50;      // Максимум 50 статических файлов
const MAX_PLACEHOLDER_SIZE = 100; // 100MB для заглушек
const MAX_CONTENT_ITEMS = 10;     // Последние 10 видео/изображений

// Критичные ресурсы для предзагрузки
const CRITICAL_RESOURCES = [
  '/player.html',
  '/speaker.html',
  '/admin.html',
  '/css/app.css',
  '/js/player.js',
  '/js/speaker.js',
  '/js/admin.js',
  '/js/theme.js',
  '/manifest.json',
  '/manifest-speaker.json',
  '/manifest-admin.json'
];

// Установка Service Worker
self.addEventListener('install', (event) => {
  console.log('[SW] Installing Service Worker', VERSION);
  
  event.waitUntil(
    // Предзагружаем критичные ресурсы
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Precaching critical resources');
      return cache.addAll(CRITICAL_RESOURCES).catch(err => {
        console.warn('[SW] Some critical resources failed to cache:', err);
      });
    }).then(() => {
      // Принудительная активация новой версии
      return self.skipWaiting();
    })
  );
});

// Активация и очистка старых кэшей
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating Service Worker', VERSION);
  
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          // Удаляем все кэши кроме текущей версии
          if (!cacheName.includes(VERSION)) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      // Активируем немедленно для всех клиентов
      return self.clients.claim();
    })
  );
});

// Ограничение размера кэша
async function limitCacheSize(cacheName, maxItems) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  
  if (keys.length > maxItems) {
    // Удаляем старые элементы (FIFO)
    const toDelete = keys.length - maxItems;
    for (let i = 0; i < toDelete; i++) {
      await cache.delete(keys[i]);
    }
    console.log(`[SW] Cache ${cacheName} limited: removed ${toDelete} old items`);
  }
}

// Проверка размера кэша в байтах
async function getCacheSize(cacheName) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  let totalSize = 0;
  
  for (const request of keys) {
    const response = await cache.match(request);
    if (response) {
      const blob = await response.blob();
      totalSize += blob.size;
    }
  }
  
  return totalSize;
}

// Ограничение по размеру
async function limitCacheSizeBytes(cacheName, maxBytes) {
  const size = await getCacheSize(cacheName);
  
  if (size > maxBytes) {
    const cache = await caches.open(cacheName);
    const keys = await cache.keys();
    
    // Удаляем старые файлы пока не достигнем лимита
    for (const key of keys) {
      await cache.delete(key);
      const newSize = await getCacheSize(cacheName);
      if (newSize <= maxBytes) break;
    }
    
    console.log(`[SW] Cache ${cacheName} size limited: ${(size/1024/1024).toFixed(1)}MB → ${(await getCacheSize(cacheName)/1024/1024).toFixed(1)}MB`);
  }
}

// Перехват запросов
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // Кэшируем заглушку (default.* файлы) - Stale-While-Revalidate
  if (url.pathname.match(/\/content\/[^\/]+\/default\.(mp4|webm|ogg|mkv|mov|avi|mp3|wav|m4a|png|jpg|jpeg|gif|webp)$/i)) {
    event.respondWith(
      caches.open(PLACEHOLDER_CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(event.request);
        
        // Network fetch
        const fetchPromise = fetch(event.request).then(async (response) => {
          if (response.ok) {
            // Кэшируем новую версию
            cache.put(event.request, response.clone());
            
            // Ограничиваем размер кэша заглушек (100MB)
            limitCacheSizeBytes(PLACEHOLDER_CACHE_NAME, MAX_PLACEHOLDER_SIZE * 1024 * 1024).catch(err => {
              console.warn('[SW] Cache size limit failed:', err);
            });
          }
          return response;
        }).catch(() => {
          // Сеть недоступна - вернем из кэша если есть
          return cached || new Response('Placeholder not available offline', { status: 503 });
        });
        
        // Stale-While-Revalidate: отдаем кэш мгновенно, обновляем в фоне
        if (cached) {
          return cached;
        }
        
        return fetchPromise;
      })
    );
    return;
  }
  
  // Кэшируем статические ресурсы (JS, CSS, HTML) - Stale-While-Revalidate
  if (url.pathname.match(/\.(js|css|html|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot)$/i) ||
      url.pathname.match(/\/(player|speaker|admin)\.html$/)) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(event.request);
        
        // Fetch в фоне для обновления
        const fetchPromise = fetch(event.request).then(async (response) => {
          if (response.ok) {
            cache.put(event.request, response.clone());
            
            // Ограничиваем количество статических файлов
            limitCacheSize(CACHE_NAME, MAX_STATIC_ITEMS).catch(err => {
              console.warn('[SW] Cache limit failed:', err);
            });
          }
          return response;
        }).catch(() => {
          // Offline - возвращаем из кэша или офлайн страницу
          if (cached) return cached;
          
          // Офлайн страница для HTML
          if (event.request.headers.get('accept')?.includes('text/html')) {
            return new Response(`
              <!DOCTYPE html>
              <html lang="ru">
              <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width,initial-scale=1">
                <title>Офлайн - VideoControl</title>
                <style>
                  body {
                    margin:0; padding:0; height:100vh;
                    display:flex; align-items:center; justify-content:center;
                    background:#1a1a1a; color:#fff;
                    font-family:system-ui,-apple-system,sans-serif;
                    text-align:center;
                  }
                  h1 { font-size:2em; margin:0 0 1em; }
                  p { opacity:0.8; margin:0.5em 0; }
                  .status { margin-top:2em; font-size:0.9em; opacity:0.6; }
                </style>
              </head>
              <body>
                <div>
                  <h1>📡 Офлайн режим</h1>
                  <p>Сервер VideoControl недоступен</p>
                  <p>Ожидание подключения...</p>
                  <div class="status">Service Worker v${VERSION}</div>
                </div>
              </body>
              </html>
            `, {
              headers: { 'Content-Type': 'text/html; charset=utf-8' }
            });
          }
          
          return new Response('Offline', { status: 503 });
        });
        
        // Stale-While-Revalidate: отдаем кэш сразу, обновляем в фоне
        if (cached) {
          return cached;
        }
        
        return fetchPromise;
      })
    );
    return;
  }
  
  // Контент (видео/изображения кроме default.*) - кэшируем последние 10
  if (url.pathname.match(/\/content\/.*\.(mp4|webm|ogg|mkv|mov|avi|png|jpg|jpeg|gif|webp)$/i) &&
      !url.pathname.match(/default\./i)) {
    event.respondWith(
      caches.open(CONTENT_CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(event.request);
        
        const fetchPromise = fetch(event.request).then(async (response) => {
          if (response.ok) {
            // Кэшируем только файлы < 50MB
            const contentLength = response.headers.get('content-length');
            const size = contentLength ? parseInt(contentLength) : 0;
            
            if (size < 50 * 1024 * 1024) { // < 50MB
              cache.put(event.request, response.clone());
              
              // Ограничиваем количество закэшированных файлов
              limitCacheSize(CONTENT_CACHE_NAME, MAX_CONTENT_ITEMS).catch(err => {
                console.warn('[SW] Content cache limit failed:', err);
              });
            }
          }
          return response;
        });
        
        // Cache-first для контента: если есть в кэше - отдаем сразу
        return cached || fetchPromise;
      })
    );
    return;
  }
  
  // Для всех остальных запросов (API, WebSocket, и т.д.) - без кэширования
  // Пропускаем к серверу напрямую
});

// Обработка сообщений от клиента
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  // Команда очистки кэша
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.keys().then(cacheNames => {
        return Promise.all(
          cacheNames.map(cacheName => caches.delete(cacheName))
        );
      }).then(() => {
        console.log('[SW] All caches cleared');
      })
    );
  }
});
