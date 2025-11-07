// VideoControl Player - Video.js версия (упрощенная и надежная)

const socket = io('/', {
  transports: ['websocket', 'polling'],
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 2000,
  reconnectionDelayMax: 10000,
  timeout: 20000,
  forceNew: false,
  upgrade: true,
  autoConnect: true
});
const url = new URL(location.href);
const device_id = url.searchParams.get('device_id');
const preview = url.searchParams.get('preview') === '1';
const forceMuted = url.searchParams.get('muted') === '1';
const forceSound = (url.searchParams.get('sound') === '1') || (url.searchParams.get('autoplay') === '1');
const previewFile = url.searchParams.get('file');

const idle = document.getElementById('idle');
const v = document.getElementById('v');
const videoContainer = document.getElementById('videoContainer'); // Контейнер для Video.js
const img1 = document.getElementById('img1');
const img2 = document.getElementById('img2');
const img = img1; // Для обратной совместимости со старым кодом
const pdf = document.getElementById('pdf');
const unmuteBtn = document.getElementById('unmute');
const pauseCanvas = document.getElementById('pauseCanvas');
const pauseSnapshot = document.getElementById('pauseSnapshot');

let currentFileState = { type: null, file: null, page: 1 };
let soundUnlocked = false;
let vjsPlayer = null;
let isLoadingPlaceholder = false; // Флаг для предотвращения двойной загрузки
let registerInFlight = false; // Предотвращаем одновременные попытки регистрации
let slidesCache = {}; // Кэш предзагруженных слайдов PPTX/PDF: { 'filename': { count: N, images: [Image, ...] } }
let currentImgBuffer = 1; // Текущий активный буфер изображений (1 или 2) для двойной буферизации

function ensureSocketConnected(reason = 'manual') {
  const isActive = typeof socket.active === 'boolean' ? socket.active : false;
  if (socket.connected || isActive) {
    return;
  }
  console.log(`[Player] 🔄 ensureSocketConnected → connect (${reason})`);
  try {
    socket.connect();
  } catch (err) {
    console.error(`[Player] ❌ ensureSocketConnected error (${reason}):`, err);
  }
}

// Функция для принудительного скрытия всех контролов Video.js
function hideVideoJsControls() {
  if (!vjsPlayer) return;
  
  try {
    // Скрываем big play button
    const bigPlayButton = vjsPlayer.getChild('bigPlayButton');
    if (bigPlayButton) {
      bigPlayButton.hide();
      bigPlayButton.el().style.display = 'none';
    }
    
    // Скрываем control bar
    const controlBar = vjsPlayer.getChild('controlBar');
    if (controlBar) {
      controlBar.hide();
      controlBar.el().style.display = 'none';
    }
    
    // Скрываем loading spinner
    const loadingSpinner = vjsPlayer.getChild('loadingSpinner');
    if (loadingSpinner) {
      loadingSpinner.hide();
      loadingSpinner.el().style.display = 'none';
    }
    
    console.log('[Player] 🚫 Все контролы Video.js скрыты');
  } catch (e) {
    console.warn('[Player] ⚠️ Ошибка скрытия контролов:', e);
  }
}

if (!device_id || !device_id.trim()) {
  [idle, v, img1, img2, pdf].forEach(el => el && el.classList.remove('visible'));
  document.documentElement.style.background = '#000 !important';
  document.body.style.background = '#000 !important';
  if (unmuteBtn) unmuteBtn.style.display = 'none';
} else {
  // Инициализация Video.js
  document.addEventListener('DOMContentLoaded', () => {
    if (typeof videojs !== 'undefined') {
      try {
        vjsPlayer = videojs('v', {
          controls: false,
          autoplay: false,
          preload: 'metadata',
          muted: true,
          loop: false,
          playsinline: true,
          disablePictureInPicture: true,
          nativeControlsForTouch: false
        });
        
        // Ждем полной готовности Video.js
        vjsPlayer.ready(function() {
          console.log('[Player] ✅ Video.js готов к работе');
          
          // КРИТИЧНО: Скрываем все контролы при инициализации
          hideVideoJsControls();
          
          // Автовключение звука ПОСЛЕ готовности Video.js
          if (!preview && forceSound && !forceMuted) {
            console.log('[Player] 🔊 Автовключение звука (sound=1)');
            setTimeout(() => enableSound(), 500);
            if (unmuteBtn) unmuteBtn.style.display = 'none';
          } else if (!preview && localStorage.getItem('vc_sound') === '1' && !forceMuted) {
            console.log('[Player] 🔊 Автовключение звука (из localStorage)');
            setTimeout(() => enableSound(), 500);
            if (unmuteBtn) unmuteBtn.style.display = 'none';
          } else if (unmuteBtn && !forceMuted && !preview) {
            // Показываем unmute кнопку если звук не включен автоматически
            unmuteBtn.style.display = 'inline-block';
          }
          
          // Обработчик окончания видео
          vjsPlayer.on('ended', () => {
            console.log('[Player] 🎬 Video.js ended event');
            
            // КРИТИЧНО: Android WebView может генерировать 'ended' при паузе (баг)
            // Проверяем, что видео ДЕЙСТВИТЕЛЬНО закончилось
            const currentTime = vjsPlayer.currentTime();
            const duration = vjsPlayer.duration();
            const isActuallyEnded = duration > 0 && currentTime >= duration - 0.5; // 0.5s запас
            
            console.log('[Player] 🔍 Проверка ended:', { currentTime, duration, isActuallyEnded, paused: vjsPlayer.paused() });
            
            if (!preview && isActuallyEnded && (currentFileState.type === null || currentFileState.type === 'video')) {
              showPlaceholder();
            } else if (!isActuallyEnded) {
              console.log('[Player] ⚠️ Ложное ended событие (Android WebView bug), игнорируем');
            }
          });
          
          // Обработчик ошибок
          vjsPlayer.on('error', function() {
            const error = vjsPlayer.error();
            console.error('[Player] ❌ Video.js error:', error);
          });
          
          // Загружаем заглушку или preview файл после готовности
          if (preview && previewFile) {
            // Preview режим - показываем указанный файл
            setTimeout(() => {
              const previewType = url.searchParams.get('type');
              const previewPage = url.searchParams.get('page');
              const ext = previewFile.split('.').pop().toLowerCase();
              
              console.log('[Player] 🔍 Preview режим:', { previewFile, previewType, previewPage, ext });
              
              if (previewType === 'pdf' && previewPage) {
                // PDF preview
                const imageUrl = `/api/devices/${encodeURIComponent(device_id)}/converted/${encodeURIComponent(previewFile)}/page/${previewPage}`;
                console.log('[Player] 📄 Preview PDF:', imageUrl);
                img.src = imageUrl;
                show(img);
              } else if (previewType === 'pptx' && previewPage) {
                // PPTX preview
                const imageUrl = `/api/devices/${encodeURIComponent(device_id)}/converted/${encodeURIComponent(previewFile)}/slide/${previewPage}`;
                console.log('[Player] 📊 Preview PPTX:', imageUrl);
                img.src = imageUrl;
                show(img);
              } else if (previewType === 'image' || ['png','jpg','jpeg','gif','webp'].includes(ext)) {
                // Изображение preview
                console.log('[Player] 🖼️ Preview изображение:', previewFile);
                img.src = content(previewFile);
                show(img);
              } else if (['mp4','webm','ogg','mkv','mov','avi'].includes(ext) || previewType === 'video') {
                // Видео preview
                console.log('[Player] 🎬 Preview видео:', previewFile);
                vjsPlayer.loop(true);
                vjsPlayer.muted(true);
                vjsPlayer.volume(0);
                vjsPlayer.src({ src: content(previewFile), type: 'video/mp4' });
                show(videoContainer);
                
                // Даем время для загрузки src
                setTimeout(() => {
                  vjsPlayer.play().then(() => {
                    console.log('[Player] ✅ Preview видео запущено:', previewFile);
                  }).catch(err => {
                    console.error('[Player] ❌ Preview ошибка:', err);
                  });
                }, 150);
              } else {
                console.warn('[Player] ⚠️ Неизвестный тип preview:', ext, previewType);
              }
            }, 100);
          } else {
            // Обычный режим - показываем заглушку
            setTimeout(() => showPlaceholder(), 100);
          }
        });
      } catch (e) {
        console.error('[Player] ❌ Ошибка инициализации Video.js:', e);
      }
    } else {
      console.error('[Player] ❌ Video.js library не загружена!');
    }
  });
  
  // Функция для получения текущего и следующего буфера изображений
  function getImageBuffers() {
    const current = currentImgBuffer === 1 ? img1 : img2;
    const next = currentImgBuffer === 1 ? img2 : img1;
    return { current, next };
  }
  
  // Плавный показ элемента с ОБЯЗАТЕЛЬНЫМ переходом через черный экран
  function show(el, skipTransition = false) {
    if (!el) return;
    
    console.log('[Player] 🎬 show() с плавным переходом для:', el.id || el.className);
    
    // Убедимся что body черный
    document.body.style.background = '#000';
    document.documentElement.style.background = '#000';
    
    // Если нужен мгновенный показ (например для слайдов презентации)
    if (skipTransition) {
      // Сначала показываем новый
      el.classList.add('visible');
      el.classList.remove('preloading');
      
      // Потом скрываем остальные (включая оба буфера)
      [idle, videoContainer, img1, img2, pdf].forEach(e => {
        if (e && e !== el) {
          e.classList.remove('visible', 'preloading');
        }
      });
      
      console.log('[Player] ⚡ Мгновенный показ (без transition)');
      return;
    }
    
    // ПЕРЕХОД ЧЕРЕЗ ЧЕРНЫЙ: Сначала показываем черный экран
    console.log('[Player] 🖤 Переход через черный экран...');
    
    // 1. Скрываем все кроме idle
    [videoContainer, img1, img2, pdf].forEach(e => {
      if (e) {
        e.classList.remove('visible', 'preloading');
      }
    });
    
    // 2. Показываем черный экран (idle)
    idle.classList.add('visible');
    
    // 3. После fade in черного (0.5s) - показываем новый контент
    setTimeout(() => {
      // Если новый контент это не сам idle
      if (el !== idle) {
        el.classList.remove('preloading');
        el.style.zIndex = '3';
        
        requestAnimationFrame(() => {
          el.classList.add('visible'); // Fade in нового контента
          idle.classList.remove('visible'); // Fade out черного экрана
          
          console.log('[Player] ✅ Переход из черного в контент');
          
          setTimeout(() => {
            if (el) el.style.zIndex = '';
          }, 500);
        });
      }
    }, 500); // Время показа черного экрана
  }
  
  // Предзагрузка элемента (скрыто)
  function preload(el) {
    if (!el) return;
    console.log('[Player] 📥 Предзагрузка:', el.id || el.className);
    el.classList.remove('visible');
    el.classList.add('preloading');
  }

  function content(file){ 
    return `/content/${encodeURIComponent(device_id)}/${encodeURIComponent(file)}`; 
  }

  function enableSound(){
    if (forceMuted) return;
    soundUnlocked = true;
    try { localStorage.setItem('vc_sound', '1'); } catch {}
    if (vjsPlayer) {
      vjsPlayer.muted(false);
      vjsPlayer.volume(1.0);
      vjsPlayer.play();
    }
    if (unmuteBtn) unmuteBtn.style.display = 'none';
  }

  // Обработчики unmute кнопки
  if (unmuteBtn && !forceMuted) {
    unmuteBtn.addEventListener('click', enableSound);
  }
  
  if (!forceMuted) {
    document.addEventListener('click', () => { if (!soundUnlocked) enableSound(); }, { once:true });
  }

  // Поиск заглушки
  async function resolvePlaceholder(force = false) {
    // КРИТИЧНО: При force=true генерируем timestamp для полного обхода кэша
    const cacheBuster = force ? `?t=${Date.now()}` : '';
    
    try {
      // API запрос тоже с cache-busting при force=true
      const apiUrl = `/api/devices/${encodeURIComponent(device_id)}/placeholder${cacheBuster}`;
      const apiRes = await fetch(apiUrl, {
        cache: force ? 'no-store' : 'default' // Запрещаем браузеру использовать HTTP кэш при force=true
      });
      
      if (apiRes.ok) {
        const data = await apiRes.json();
        if (data.placeholder) {
          let url = `/content/${encodeURIComponent(device_id)}/${data.placeholder}`;
          
          // КРИТИЧНО: Проверяем что файл реально доступен (может быть удален после создания записи в API)
          // При force=true проверка тоже идет с cache-busting
          try {
            const checkUrl = url + cacheBuster;
            const checkRes = await fetch(checkUrl, { 
              method: 'HEAD',
              cache: force ? 'no-store' : 'default' // Обход HTTP кэша браузера
            });
            
            if (checkRes.ok) {
              // Возвращаем URL с cache-busting если force=true
              return url + cacheBuster;
            } else {
              console.warn(`[Player] ⚠️ API вернул ${data.placeholder}, но файл недоступен (${checkRes.status})`);
            }
          } catch (e) {
            console.warn(`[Player] ⚠️ Ошибка проверки файла ${url}:`, e);
          }
        }
      }
    } catch (e) {
      console.warn('[Player] ⚠️ Ошибка запроса placeholder API:', e);
    }
    
    // Fallback: пробуем найти default.* файлы напрямую
    console.log('[Player] 🔍 Пробуем найти default.* файлы напрямую...');
    const tryList = ['mp4','webm','ogg'];
    for (const ext of tryList) {
      let url = `/content/${encodeURIComponent(device_id)}/default.${ext}`;
      try {
        // КРИТИЧНО: HEAD запрос с cache-busting при force=true
        const checkUrl = url + cacheBuster;
        const r = await fetch(checkUrl, { 
          method: 'HEAD',
          cache: force ? 'no-store' : 'default' // Обход HTTP кэша браузера
        });
        
        if (r.ok) {
          console.log(`[Player] ✅ Найден файл: default.${ext} ${force ? '(с cache-busting)' : ''}`);
          // Возвращаем URL с cache-busting если force=true
          return url + cacheBuster;
        }
      } catch {}
    }
    
    console.warn('[Player] ❌ Ни один default.* файл не найден');
    return null;
  }

  let currentPlaceholderSrc = null; // Отслеживаем текущую заглушку
  
  async function showPlaceholder(forceRefresh = false) {
    console.log('[Player] 🔍 showPlaceholder вызван, forceRefresh=', forceRefresh);
    
    // При force refresh сбрасываем текущую заглушку для принудительной перезагрузки
    if (forceRefresh) {
      currentPlaceholderSrc = null;
      console.log('[Player] 🔄 Force refresh: сбросили currentPlaceholderSrc');
    }
    
    const src = await resolvePlaceholder(forceRefresh);
    console.log('[Player] 🔍 Заглушка найдена:', src);
    
    if (!src) {
      console.warn('[Player] ⚠️ Заглушка не найдена!');
      
      // Показываем сообщение об отсутствии заглушки
      if (preview) {
        // В preview режиме показываем сообщение в PDF элементе
        pdf.srcdoc = `
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width,initial-scale=1">
              <style>
                body { 
                  margin:0; padding:0; 
                  display:flex; align-items:center; justify-content:center; 
                  min-height:100vh; 
                  background:#1e293b; color:#fff; 
                  font-family:sans-serif; text-align:center;
                }
                .message {
                  padding: 2rem;
                  max-width: 400px;
                }
                h2 { margin: 0 0 1rem 0; color: #fbbf24; }
                p { margin: 0.5rem 0; color: #cbd5e1; line-height: 1.5; }
              </style>
            </head>
            <body>
              <div class="message">
                <h2>⚠️ Заглушка не найдена</h2>
                <p>Для этого устройства не установлена заглушка.</p>
                <p>Загрузите видео файл и установите его как заглушку через кнопку "Заглушка".</p>
              </div>
            </body>
          </html>
        `;
        show(pdf);
      } else {
        // В обычном плеере просто скрываем все (включая оба буфера)
        [idle, v, img1, img2, pdf].forEach(el => el && el.classList.remove('visible'));
      }
      return;
    }
    
    // КРИТИЧНО: Если та же заглушка уже играет - не перезагружаем (кроме force refresh)
    if (!forceRefresh && currentPlaceholderSrc === src && vjsPlayer && !vjsPlayer.paused()) {
      console.log('[Player] ℹ️ Та же заглушка уже играет, пропускаем');
      return;
    }
    
    currentPlaceholderSrc = src;
    
    const isImage = /\.(png|jpg|jpeg|gif|webp)$/i.test(src);
    console.log('[Player] 🔍 Тип заглушки:', isImage ? 'изображение' : 'видео');
    
    if (isImage) {
      console.log('[Player] 🖼️ Загрузка изображения заглушки');
      if (vjsPlayer) vjsPlayer.pause();
      pdf.removeAttribute('src');
      img.src = src;
      show(img);
    } else {
      // Видео заглушка через Video.js
      console.log('[Player] 🎬 Загрузка видео заглушки через Video.js');
      console.log('[Player] 🔍 vjsPlayer существует:', !!vjsPlayer);
      
      if (vjsPlayer) {
        // КРИТИЧНО: Финальная проверка доступности ПЕРЕД установкой src в Video.js
        // Избегаем ошибок "no supported source" для несуществующих файлов
        (async () => {
          try {
            const finalCheck = await fetch(src, { method: 'HEAD' });
            if (!finalCheck.ok) {
              console.error(`[Player] ❌ Файл заглушки недоступен: ${finalCheck.status}`);
              // Показываем предупреждение вместо ошибки Video.js
              if (preview) {
                pdf.srcdoc = `
                  <!DOCTYPE html>
                  <html>
                    <head>
                      <meta charset="utf-8">
                      <style>
                        body { 
                          margin:0; padding:2rem; 
                          display:flex; align-items:center; justify-content:center; 
                          min-height:100vh; 
                          background:#1e293b; color:#fff; 
                          font-family:sans-serif; text-align:center;
                        }
                        h2 { color: #fbbf24; margin-bottom: 1rem; }
                        p { color: #cbd5e1; line-height: 1.5; margin: 0.5rem 0; }
                      </style>
                    </head>
                    <body>
                      <div>
                        <h2>⚠️ Заглушка недоступна</h2>
                      </div>
                    </body>
                  </html>
                `;
                show(pdf);
              }
              return;
            }
            
            console.log('[Player] ✅ Финальная проверка пройдена, файл доступен');
            
            console.log('[Player] 🔍 Установка параметров Video.js...');
            vjsPlayer.loop(true);
            vjsPlayer.muted(true);
            vjsPlayer.volume(0);
            
            // КРИТИЧНО: Скрываем контролы
            hideVideoJsControls();
            
            // Переводим в режим предзагрузки
            preload(videoContainer);
            
            console.log('[Player] 🔍 Установка src:', src);
            vjsPlayer.src({ src: src, type: 'video/mp4' });
            
            // Ждем готовности метаданных
            vjsPlayer.one('loadedmetadata', () => {
              console.log('[Player] 📊 Заглушка: метаданные готовы, показываем с fade in');
              hideVideoJsControls();
              
              // Показываем с плавным появлением
              show(videoContainer);
              
              // Запускаем воспроизведение
              vjsPlayer.play().then(() => {
                console.log('[Player] ✅ Заглушка запущена успешно!');
              }).catch(err => {
                console.error('[Player] ❌ Ошибка запуска заглушки:', err);
              });
            });
          } catch (e) {
            console.error('[Player] ❌ Ошибка проверки или загрузки заглушки:', e);
          }
        })();
      } else {
        console.error('[Player] ❌ vjsPlayer не инициализирован!');
      }
    }
  }

  // Предзагрузка всех слайдов PPTX/PDF в кэш
  async function preloadAllSlides(file, type) {
    try {
      console.log(`[Player] 🔄 Предзагрузка слайдов: ${file}`);
      
      // Получаем количество слайдов через API (используем query параметр для поддержки пробелов в именах)
      const response = await fetch(`/api/devices/${encodeURIComponent(device_id)}/slides-count?file=${encodeURIComponent(file)}`);
      if (!response.ok) {
        console.warn('[Player] ⚠️ Не удалось получить количество слайдов');
        return;
      }
      
      const data = await response.json();
      const count = data.count || 0;
      
      if (count === 0) {
        console.warn('[Player] ⚠️ Нет слайдов для предзагрузки');
        return;
      }
      
      console.log(`[Player] 📊 Найдено слайдов: ${count}. Начинаем предзагрузку...`);
      
      // Создаем массив Image объектов
      const images = [];
      const urlType = type === 'pdf' ? 'page' : 'slide';
      
      // Предзагружаем все слайды параллельно
      const preloadPromises = [];
      for (let i = 1; i <= count; i++) {
        const imageUrl = `/api/devices/${encodeURIComponent(device_id)}/converted/${encodeURIComponent(file)}/${urlType}/${i}`;
        const imgObj = new Image();
        images[i - 1] = imgObj;
        
        const promise = new Promise((resolve, reject) => {
          imgObj.onload = () => {
            console.log(`[Player] ✅ Слайд ${i}/${count} загружен`);
            resolve();
          };
          imgObj.onerror = () => {
            console.warn(`[Player] ⚠️ Ошибка загрузки слайда ${i}/${count}`);
            resolve(); // Не прерываем весь процесс из-за одного слайда
          };
          imgObj.src = imageUrl;
        });
        
        preloadPromises.push(promise);
      }
      
      // Ждем загрузки всех слайдов
      await Promise.all(preloadPromises);
      
      // Сохраняем в кэш
      slidesCache[file] = { count, images, type };
      console.log(`[Player] 🎉 Все слайды загружены в кэш: ${file} (${count} слайдов)`);
      
    } catch (error) {
      console.error('[Player] ❌ Ошибка предзагрузки слайдов:', error);
    }
  }

  function showConvertedPage(file, type, num) {
    if (vjsPlayer) vjsPlayer.pause();
    pdf.removeAttribute('src');
    
    const { current, next } = getImageBuffers();
    
    // Определяем, это первый показ презентации или переключение слайдов
    const isFirstShow = !current.classList.contains('visible') && !next.classList.contains('visible');
    
    // Проверяем кэш
    if (slidesCache[file] && slidesCache[file].images) {
      const cached = slidesCache[file];
      const index = Math.max(0, Math.min(num - 1, cached.count - 1));
      const cachedImage = cached.images[index];
      
      if (cachedImage && cachedImage.complete && cachedImage.naturalWidth > 0) {
        console.log(`[Player] ⚡ Слайд ${num} из кэша (двойная буферизация)`);
        
        // Загружаем в следующий буфер
        next.src = cachedImage.src;
        
        // Первый показ - сразу черный, потом fade in; переключение слайдов - мгновенно
        if (isFirstShow) {
          console.log(`[Player] 🎬 Первый показ презентации - через черный`);
          // Сразу черный экран
          [videoContainer, img1, img2, pdf].forEach(e => {
            if (e) e.classList.remove('visible', 'preloading');
          });
          idle.classList.add('visible');
          
          // Затем fade in слайда
          setTimeout(() => {
            next.classList.add('visible');
            idle.classList.remove('visible');
          }, 300);
        } else {
          console.log(`[Player] ⚡ Переключение слайда - мгновенно`);
          show(next, true); // skipTransition = true для мгновенной смены
        }
        
        // Переключаем активный буфер
        currentImgBuffer = currentImgBuffer === 1 ? 2 : 1;
        console.log(`[Player] 🔄 Переключен буфер на: ${currentImgBuffer}`);
        return;
      }
    }
    
    // Fallback: загружаем через API если нет в кэше
    console.log(`[Player] 🌐 Слайд ${num} загружается через API (двойная буферизация)`);
    const imageUrl = `/api/devices/${encodeURIComponent(device_id)}/converted/${encodeURIComponent(file)}/${type}/${num}`;
    
    // Предзагружаем в следующий буфер
    const tempImg = new Image();
    tempImg.onload = () => {
      console.log(`[Player] ✅ Слайд ${num} загружен в буфер ${currentImgBuffer === 1 ? 2 : 1}`);
      
      // Устанавливаем в следующий буфер
      next.src = imageUrl;
      
      // Первый показ - сразу черный, потом fade in; переключение слайдов - мгновенно
      if (isFirstShow) {
        console.log(`[Player] 🎬 Первый показ презентации - через черный`);
        // Сразу черный экран
        [videoContainer, img1, img2, pdf].forEach(e => {
          if (e) e.classList.remove('visible', 'preloading');
        });
        idle.classList.add('visible');
        
        // Затем fade in слайда
        setTimeout(() => {
          next.classList.add('visible');
          idle.classList.remove('visible');
        }, 300);
      } else {
        console.log(`[Player] ⚡ Переключение слайда - мгновенно`);
        show(next, true); // skipTransition = true для мгновенной смены
      }
      
      // Переключаем активный буфер
      currentImgBuffer = currentImgBuffer === 1 ? 2 : 1;
      console.log(`[Player] 🔄 Переключен буфер на: ${currentImgBuffer}`);
    };
    tempImg.onerror = () => {
      console.error(`[Player] ❌ Ошибка загрузки слайда ${num}`);
      next.src = imageUrl;
      show(next, isFirstShow ? false : true);
      currentImgBuffer = currentImgBuffer === 1 ? 2 : 1;
    };
    tempImg.src = imageUrl;
  }

  // WebSocket обработчики
  socket.on('player/play', ({ type, file, page }) => {
    console.log('[Player] 📡 player/play:', { type, file, page });
    
    // КРИТИЧНО: Убираем снимок паузы при возобновлении
    if (pauseSnapshot) {
      console.log('[Player] 🗑️ Удаляем снимок паузы');
      pauseSnapshot.style.display = 'none';
      pauseSnapshot.classList.remove('visible');
      pauseSnapshot.removeAttribute('src');
    }
    
    if (type === 'video') {
      img1.removeAttribute('src');
      img2.removeAttribute('src');
      pdf.removeAttribute('src');
      
      if (!file && vjsPlayer) {
        // Resume текущего видео (нет файла = продолжить с паузы)
        console.log('[Player] ⏯️ Resume с текущей позиции');
        currentFileState = { type: 'video', file: currentFileState.file, page: 1 };
        
        vjsPlayer.muted(soundUnlocked && !forceMuted ? false : true);
        vjsPlayer.volume(soundUnlocked && !forceMuted ? 1.0 : 0.0);
        
        // Не трогаем currentTime - продолжаем с места паузы
        vjsPlayer.play().then(() => {
          console.log('[Player] ✅ Resume успешен');
        }).catch(err => {
          console.error('[Player] ❌ Ошибка resume:', err);
        });
        return;
      }
      
      if (file) {
        const fileUrl = content(file);
        
        // Проверяем, не тот же ли файл уже загружен
        const currentSrc = vjsPlayer ? vjsPlayer.currentSrc() : '';
        const isSameFile = currentSrc.includes(encodeURIComponent(file)) || currentSrc.endsWith(fileUrl);
        
        console.log('[Player] 🔍 Проверка файла:', { file, currentSrc, isSameFile });
        
        if (isSameFile && vjsPlayer && !vjsPlayer.ended()) {
          // Тот же файл - просто возобновляем (это нажатие Play после паузы)
          console.log('[Player] ⏯️ Тот же файл, возобновляем с текущей позиции');
          currentFileState = { type: 'video', file, page: 1 };
          
          vjsPlayer.muted(soundUnlocked && !forceMuted ? false : true);
          vjsPlayer.volume(soundUnlocked && !forceMuted ? 1.0 : 0.0);
          
          // Показываем videoContainer если он скрыт
          if (!videoContainer.classList.contains('visible')) {
            show(videoContainer);
          }
          
          if (vjsPlayer.paused() || vjsPlayer.ended()) {
            if (vjsPlayer.ended()) {
              vjsPlayer.currentTime(0); // Если закончилось - начинаем с начала
            }
            // Иначе продолжаем с текущей позиции (currentTime сохраняется автоматически)
            vjsPlayer.play().then(() => {
              console.log('[Player] ✅ Resume того же файла успешен');
            }).catch(err => {
              console.error('[Player] ❌ Ошибка resume:', err);
            });
          }
          return;
        }
        
        // Новый файл - загружаем с начала
        console.log('[Player] 🎬 Загрузка НОВОГО видео:', fileUrl);
        currentFileState = { type: 'video', file, page: 1 };
        
        // КРИТИЧНО: СРАЗУ показываем черный экран (мгновенная реакция на кнопку)
        [videoContainer, img1, img2, pdf].forEach(e => {
          if (e) e.classList.remove('visible', 'preloading');
        });
        idle.classList.add('visible');
        console.log('[Player] 🖤 Черный экран - немедленная реакция на Play');
        
        if (vjsPlayer) {
          vjsPlayer.loop(false);
          vjsPlayer.muted(soundUnlocked && !forceMuted ? false : true);
          vjsPlayer.volume(soundUnlocked && !forceMuted ? 1.0 : 0.0);
          
          // КРИТИЧНО: Скрываем big play button ДО установки src
          hideVideoJsControls();
          
          // Загружаем src в фоне (пока показан черный)
          vjsPlayer.src({ src: fileUrl, type: 'video/mp4' });
          
          // Ждем готовности метаданных, затем показываем с fade in из черного
          vjsPlayer.one('loadedmetadata', () => {
            console.log('[Player] 📊 Метаданные загружены, показываем из черного');
            hideVideoJsControls();
            
            // Переводим в preloading для плавного перехода из черного
            videoContainer.classList.remove('visible');
            videoContainer.classList.add('preloading');
            
            // Небольшая задержка для гарантии что черный экран виден
            setTimeout(() => {
              // Fade out черного, fade in video (одновременно)
              videoContainer.classList.remove('preloading');
              videoContainer.classList.add('visible');
              idle.classList.remove('visible');
              
              console.log('[Player] ✅ Плавный переход: черный → видео');
              
              // Запускаем воспроизведение
              vjsPlayer.play().then(() => {
                console.log('[Player] ✅ Видео запущено');
                if (soundUnlocked && !forceMuted) {
                  setTimeout(() => {
                    vjsPlayer.muted(false);
                    vjsPlayer.volume(1.0);
                  }, 200);
                }
              }).catch(err => {
                console.error('[Player] ❌ Ошибка воспроизведения:', err);
                hideVideoJsControls();
              });
            }, 300); // Минимальная задержка для показа черного
          });
        }
      }
    } else if (type === 'image' && file) {
      currentFileState = { type: 'image', file, page: 1 };
      if (vjsPlayer) vjsPlayer.pause();
      pdf.removeAttribute('src');
      
      // СРАЗУ показываем черный экран (мгновенная реакция)
      [videoContainer, img1, img2, pdf].forEach(e => {
        if (e) e.classList.remove('visible', 'preloading');
      });
      idle.classList.add('visible');
      console.log('[Player] 🖤 Черный экран - загрузка изображения');
      
      const { next } = getImageBuffers();
      const imageUrl = content(file);
      
      // Предзагружаем в фоне (пока черный экран)
      const tempImg = new Image();
      tempImg.onload = () => {
        console.log('[Player] ✅ Изображение загружено, fade in из черного');
        next.src = imageUrl;
        
        // Плавный переход из черного в изображение
        setTimeout(() => {
          next.classList.add('visible');
          idle.classList.remove('visible');
          currentImgBuffer = currentImgBuffer === 1 ? 2 : 1;
        }, 300);
      };
      tempImg.onerror = () => {
        console.warn('[Player] ⚠️ Ошибка загрузки изображения');
        next.src = imageUrl;
        next.classList.add('visible');
        idle.classList.remove('visible');
        currentImgBuffer = currentImgBuffer === 1 ? 2 : 1;
      };
      tempImg.src = imageUrl;
    } else if (type === 'pdf' && file) {
      const pageNum = page || 1;
      currentFileState = { type: 'pdf', file, page: pageNum };
      showConvertedPage(file, 'page', pageNum);
      
      // КРИТИЧНО: Предзагружаем ВСЕ страницы в кэш для мгновенного переключения
      if (!slidesCache[file]) {
        preloadAllSlides(file, 'pdf');
      }
    } else if (type === 'pptx' && file) {
      const slideNum = page || 1;
      currentFileState = { type: 'pptx', file, page: slideNum };
      showConvertedPage(file, 'slide', slideNum);
      
      // КРИТИЧНО: Предзагружаем ВСЕ слайды в кэш для мгновенного переключения
      if (!slidesCache[file]) {
        preloadAllSlides(file, 'pptx');
      }
    }
  });

  socket.on('player/pause', () => {
    console.log('[Player] ⏸️ player/pause');
    if (vjsPlayer && !vjsPlayer.paused()) {
      // КРИТИЧНО: Захватываем текущий кадр ПЕРЕД паузой
      try {
        const videoEl = vjsPlayer.el().querySelector('video');
        if (videoEl && pauseCanvas && pauseSnapshot) {
          const ctx = pauseCanvas.getContext('2d');
          
          // Устанавливаем размер canvas = размеру видео
          pauseCanvas.width = videoEl.videoWidth;
          pauseCanvas.height = videoEl.videoHeight;
          
          // Рисуем текущий кадр на canvas
          ctx.drawImage(videoEl, 0, 0, pauseCanvas.width, pauseCanvas.height);
          
          // Конвертируем canvas в data URL и устанавливаем в img
          const frameDataURL = pauseCanvas.toDataURL('image/jpeg', 0.95);
          pauseSnapshot.src = frameDataURL;
          
          console.log('[Player] 📸 Снимок кадра сделан:', pauseCanvas.width + 'x' + pauseCanvas.height);
        }
      } catch (e) {
        console.warn('[Player] ⚠️ Не удалось захватить кадр:', e);
      }
      
      vjsPlayer.pause();
      
      // Показываем снимок поверх видео через 50ms (чтобы пауза успела примениться)
      setTimeout(() => {
        if (currentFileState.type === 'video' && pauseSnapshot) {
          console.log('[Player] 🖼️ Показываем снимок кадра поверх видео');
          pauseSnapshot.style.display = 'block';
          pauseSnapshot.classList.add('visible');
          pauseSnapshot.style.zIndex = '999999'; // Поверх всего
        }
      }, 50);
    }
  });

  socket.on('player/restart', () => {
    console.log('[Player] 🔄 player/restart');
    if (vjsPlayer) {
      vjsPlayer.currentTime(0);
      vjsPlayer.play();
    }
  });

  socket.on('player/stop', () => {
    console.log('[Player] ⏹️ player/stop');
    if (vjsPlayer) vjsPlayer.pause();
    img1.removeAttribute('src');
    img2.removeAttribute('src');
    pdf.removeAttribute('src');
    currentFileState = { type: null, file: null, page: 1 };
    currentImgBuffer = 1; // Сброс буфера при остановке
    
    // КРИТИЧНО: Сразу показываем черный экран (без дополнительного перехода)
    [videoContainer, img1, img2, pdf].forEach(e => {
      if (e) e.classList.remove('visible', 'preloading');
    });
    idle.classList.add('visible');
    console.log('[Player] 🖤 Черный экран показан мгновенно');
    
    // Затем загружаем заглушку в фоне
    setTimeout(() => showPlaceholder(true), 100);
  });

  socket.on('placeholder/refresh', () => {
    console.log('[Player] 🔄 placeholder/refresh - перезагрузка заглушки');
    
    // Очищаем slidesCache при смене заглушки
    slidesCache = {};
    
    // КРИТИЧНО: Очищаем текущую заглушку из памяти для принудительной перезагрузки
    currentPlaceholderSrc = null;
    
    // КРИТИЧНО: Сбрасываем currentFileState в idle (важно для перезагрузки заглушки)
    currentFileState = { type: null, file: null, page: 1 };
    
    // СРАЗУ показываем черный экран (мгновенная реакция)
    // Это предотвращает показ старой/поврежденной заглушки
    console.log('[Player] 🖤 Переход на черный экран...');
    [videoContainer, img1, img2, pdf].forEach(e => {
      if (e) e.classList.remove('visible', 'preloading');
    });
    idle.classList.add('visible');
    
    // Останавливаем плеер (НЕ очищаем src - это вызывает ошибку, просто паузим)
    if (vjsPlayer) {
      try {
        console.log('[Player] ⏸️ Остановка плеера...');
        vjsPlayer.pause();
        // НЕ вызываем vjsPlayer.src('') - это генерирует ошибку
        // Новый src установится автоматически при загрузке заглушки
        console.log('[Player] ✅ Плеер остановлен');
      } catch (e) {
        console.warn('[Player] ⚠️ Ошибка остановки плеера:', e);
      }
    }
    
    // Небольшая задержка, затем ВСЕГДА загружаем новую заглушку
    setTimeout(() => {
      // УБРАЛИ УСЛОВИЕ - всегда загружаем новую заглушку при placeholder/refresh
      console.log('[Player] 🔄 Загрузка новой заглушки с cache-busting...');
      showPlaceholder(true); // Принудительная перезагрузка с ?t=timestamp
    }, 300); // Даем время на переход к черному экрану
  });

  socket.on('player/pdfPage', (page) => {
    if (!currentFileState.file || currentFileState.type !== 'pdf') return;
    currentFileState.page = page;
    showConvertedPage(currentFileState.file, 'page', page);
  });

  socket.on('player/pptxPage', (slide) => {
    if (!currentFileState.file || currentFileState.type !== 'pptx') return;
    currentFileState.page = slide;
    showConvertedPage(currentFileState.file, 'slide', slide);
  });

  socket.on('player/state', (cur) => {
    if (!cur || cur.type === 'idle' || !cur.file) {
      showPlaceholder();
      currentFileState = { type: null, file: null, page: 1 };
      return;
    }
    // Применяем состояние (для переподключения)
    socket.emit('control/play', { device_id, file: cur.file });
  });

  // Регистрация плеера
  let isRegistered = false;
  let heartbeatInterval = null;
  let pingTimeout = null;
  let registrationTimeout = null;
  
  function registerPlayer() {
    if (preview || !device_id) return;
    if (!socket.connected) {
      console.warn('[Player] ⚠️ Нельзя зарегистрироваться: нет соединения');
      ensureSocketConnected('register');
      return;
    }
    if (registerInFlight) {
      console.log('[Player] ⏳ Регистрация уже выполняется, пропуск');
      return;
    }
    registerInFlight = true;
    console.log('[Player] 📡 Попытка регистрации устройства:', device_id);
    
    // Отправляем запрос на регистрацию
    socket.emit('player/register', { 
      device_id, 
      device_type: 'VJC', 
      platform: navigator.platform,
      capabilities: {
        video: true,
        audio: true,
        images: true,
        pdf: true,
        pptx: true,
        streaming: true
      }
    });
    
    // Если через 3 секунды нет подтверждения - повторяем попытку
    if (registrationTimeout) clearTimeout(registrationTimeout);
    registrationTimeout = setTimeout(() => {
      registerInFlight = false;
      if (!isRegistered && socket.connected && device_id && !preview) {
        console.warn('[Player] ⚠️ Нет подтверждения регистрации через 3с, повторная попытка...');
        registerPlayer();
      }
    }, 3000);
  }
  
  // КРИТИЧНО: Обработчик подтверждения регистрации от сервера
  socket.on('player/registered', ({ device_id: registeredId, current }) => {
    if (registrationTimeout) clearTimeout(registrationTimeout);
    registerInFlight = false;
    console.log('[Player] ✅ Регистрация ПОДТВЕРЖДЕНА сервером:', registeredId);
    isRegistered = true;
    startHeartbeat();
    console.log('[Player] 💓 Heartbeat запущен');
  });
  
  function startHeartbeat() {
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
      if (pingTimeout) clearTimeout(pingTimeout);
    }
    
    heartbeatInterval = setInterval(() => {
      if (!socket.connected || !isRegistered || preview) {
        clearInterval(heartbeatInterval);
        if (pingTimeout) clearTimeout(pingTimeout);
        heartbeatInterval = null;
        return;
      }
      
      socket.emit('player/ping');
      
      pingTimeout = setTimeout(() => {
        console.warn('⚠️ Heartbeat timeout');
        isRegistered = false;
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
      }, 5000);
    }, 15000);
  }
  
  socket.on('player/pong', () => {
    if (pingTimeout) {
      clearTimeout(pingTimeout);
      pingTimeout = null;
    }
    console.log('[Player] 💓 Pong получен, соединение активно');
  });
  
  socket.on('player/reject', ({ reason }) => {
    console.error('[Player] ❌ Регистрация отклонена:', reason);
    isRegistered = false;
    registerInFlight = false;
  });

  socket.on('connect', () => {
    console.log('✅ Connected');
    isRegistered = false; // Сбрасываем при каждом connect
    registerInFlight = false;
    registerPlayer();
  });

  socket.on('disconnect', (reason) => {
    console.warn('⚠️ Disconnected, reason:', reason);
    isRegistered = false;
    registerInFlight = false;
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
      heartbeatInterval = null;
    }
    if (pingTimeout) {
      clearTimeout(pingTimeout);
      pingTimeout = null;
    }
    if (registrationTimeout) {
      clearTimeout(registrationTimeout);
      registrationTimeout = null;
    }
    
    // КРИТИЧНО: Для Android - явное переподключение после disconnect
    if (reason === 'transport close' || reason === 'transport error') {
      console.log('🔄 Transport закрыт, попытка переподключения через 2с...');
      setTimeout(() => {
        if (!preview && device_id) {
          ensureSocketConnected('disconnect-transport');
        }
      }, 2000);
    }
    if (reason === 'ping timeout') {
      ensureSocketConnected('disconnect-ping-timeout');
    }
  });

  socket.on('reconnect', () => {
    console.log('🔄 Reconnected');
    isRegistered = false;
    registerInFlight = false;
    registerPlayer();
  });
  
  // НОВОЕ: Обработчики попыток переподключения
  socket.on('reconnect_attempt', (attemptNumber) => {
    console.log(`🔄 Попытка переподключения #${attemptNumber}`);
  });
  
  socket.on('reconnect_error', (error) => {
    console.warn('⚠️ Ошибка переподключения:', error);
  });
  
  socket.on('reconnect_failed', () => {
    console.error('❌ Переподключение не удалось');
    // Пробуем еще раз вручную через 5 секунд
    setTimeout(() => {
      if (!preview && device_id) {
        ensureSocketConnected('reconnect-failed');
      }
    }, 5000);
  });
  
  socket.on('connect_error', (error) => {
    console.error('[Player] ❌ connect_error:', error?.message || error, error?.code || '');
  });

  socket.on('error', (error) => {
    console.error('[Player] ❌ socket error:', error);
  });

  // Watchdog проверка каждые 5 секунд (чаще для надежности)
  setInterval(() => {
    if (!preview && device_id) {
      // Проверяем подключение
      if (!socket.connected) {
        console.warn('🔄 Watchdog: socket disconnected, пытаемся переподключиться...');
        ensureSocketConnected('watchdog-disconnected');
      } else if (!isRegistered && !registerInFlight) {
        // Подключены, но не зарегистрированы
        console.log('🔄 Watchdog: re-registering (device not registered)');
        registerPlayer();
      }
    }
  }, 5000);
}

