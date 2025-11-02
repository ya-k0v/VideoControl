// Service Worker для кэширования заглушки плеера
const CACHE_NAME = 'videocontrol-player-v1';
const PLACEHOLDER_CACHE_NAME = 'videocontrol-placeholder-v1';

// Регистрация кэша при установке
self.addEventListener('install', (event) => {
  console.log('[SW] Installing Service Worker');
  self.skipWaiting();
});

// Активация и очистка старых кэшей
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating Service Worker');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME && cacheName !== PLACEHOLDER_CACHE_NAME) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  return self.clients.claim();
});

// Перехват запросов
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // Кэшируем заглушку (default.* файлы) для автономной работы
  if (url.pathname.match(/\/content\/[^\/]+\/default\.(mp4|webm|ogg|mkv|mov|avi|mp3|wav|m4a|png|jpg|jpeg|gif|webp)$/i)) {
    event.respondWith(
      caches.open(PLACEHOLDER_CACHE_NAME).then(async (cache) => {
        // Проверяем, есть ли в кэше
        const cached = await cache.match(event.request);
        if (cached) {
          // Возвращаем из кэша, но также обновляем кэш в фоне
          fetch(event.request).then((response) => {
            if (response.ok) {
              cache.put(event.request, response.clone());
            }
          }).catch(() => {});
          return cached;
        }
        
        // Если нет в кэше - загружаем и кэшируем
        try {
          const response = await fetch(event.request);
          if (response.ok) {
            cache.put(event.request, response.clone());
          }
          return response;
        } catch (error) {
          console.error('[SW] Failed to fetch placeholder:', error);
          return new Response('Placeholder not available', { status: 404 });
        }
      })
    );
    return;
  }
  
  // Кэшируем статические ресурсы (JS, CSS, HTML)
  if (url.pathname.match(/\.(js|css|html|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot)$/i)) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(event.request);
        if (cached) {
          return cached;
        }
        try {
          const response = await fetch(event.request);
          if (response.ok) {
            cache.put(event.request, response.clone());
          }
          return response;
        } catch (error) {
          console.error('[SW] Failed to fetch resource:', error);
          return fetch(event.request);
        }
      })
    );
    return;
  }
  
  // Для всех остальных запросов (контент, API) - обычная загрузка без кэширования
  // Не перехватываем эти запросы, чтобы они шли напрямую к серверу
  // Это позволяет плееру работать автономно с заглушкой, но получать новый контент от сервера
});

