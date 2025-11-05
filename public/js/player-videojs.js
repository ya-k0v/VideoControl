// VideoControl Player - Video.js версия (упрощенная и надежная)

const socket = io();
const url = new URL(location.href);
const device_id = url.searchParams.get('device_id');
const preview = url.searchParams.get('preview') === '1';
const forceMuted = url.searchParams.get('muted') === '1';
const forceSound = (url.searchParams.get('sound') === '1') || (url.searchParams.get('autoplay') === '1');
const previewFile = url.searchParams.get('file');

const idle = document.getElementById('idle');
const v = document.getElementById('v');
const videoContainer = document.getElementById('videoContainer'); // Контейнер для Video.js
const img = document.getElementById('img');
const pdf = document.getElementById('pdf');
const unmuteBtn = document.getElementById('unmute');

let currentFileState = { type: null, file: null, page: 1 };
let soundUnlocked = false;
let vjsPlayer = null;
let isLoadingPlaceholder = false; // Флаг для предотвращения двойной загрузки
let slidesCache = {}; // Кэш предзагруженных слайдов PPTX/PDF: { 'filename': { count: N, images: [Image, ...] } }

if (!device_id || !device_id.trim()) {
  [idle, v, img, pdf].forEach(el => el && el.classList.remove('visible'));
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
            if (!preview && (currentFileState.type === null || currentFileState.type === 'video')) {
              showPlaceholder();
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
  
  function show(el) {
    if (!el) return;
    
    console.log('[Player] 🔍 show() вызван для:', el.id || el.className);
    
    el.classList.add('visible');
    el.style.visibility = 'visible';
    
    // Скрываем остальные layer элементы
    [idle, videoContainer, img, pdf].forEach(e => {
      if (e && e !== el) {
        e.classList.remove('visible');
        e.style.visibility = 'hidden';
      }
    });
    
    // Убедимся что body черный
    document.body.style.background = '#000';
    document.documentElement.style.background = '#000';
    
    console.log('[Player] ✅ show() завершен, visible элемент:', el.id);
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
    try {
      const apiRes = await fetch(`/api/devices/${encodeURIComponent(device_id)}/placeholder`);
      if (apiRes.ok) {
        const data = await apiRes.json();
        if (data.placeholder) {
          let url = `/content/${encodeURIComponent(device_id)}/${data.placeholder}`;
          
          // КРИТИЧНО: Проверяем что файл реально доступен (может быть удален после создания записи в API)
          try {
            const checkRes = await fetch(url, { method: 'HEAD' });
            if (checkRes.ok) {
              // При force=true добавляем cache-busting параметр для обхода кэша браузера
              if (force) {
                url += `?t=${Date.now()}`;
              }
              return url;
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
        const r = await fetch(url, { method: 'HEAD' });
        if (r.ok) {
          console.log(`[Player] ✅ Найден файл: default.${ext}`);
          // При force=true добавляем cache-busting параметр для обхода кэша браузера
          if (force) {
            url += `?t=${Date.now()}`;
          }
          return url;
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
        // В обычном плеере просто скрываем все
        [idle, v, img, pdf].forEach(el => el && el.classList.remove('visible'));
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
        try {
          console.log('[Player] 🔍 Установка параметров Video.js...');
          vjsPlayer.loop(true);
          vjsPlayer.muted(true);
          vjsPlayer.volume(0);
          
          console.log('[Player] 🔍 Установка src:', src);
          vjsPlayer.src({ src: src, type: 'video/mp4' });
          
          console.log('[Player] 🔍 show(videoContainer) вызов...');
          show(videoContainer);
          
          // Ждем немного перед play() чтобы src успел установиться
          setTimeout(() => {
            console.log('[Player] 🔍 vjsPlayer.play() вызов...');
            vjsPlayer.play().then(() => {
              console.log('[Player] ✅ Заглушка запущена успешно!');
            }).catch(err => {
              console.error('[Player] ❌ Ошибка запуска заглушки:', err);
              console.error('[Player] Error details:', err.message, err.code);
            });
          }, 100);
        } catch (e) {
          console.error('[Player] ❌ Критическая ошибка в showPlaceholder:', e);
        }
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
    // Проверяем кэш
    if (slidesCache[file] && slidesCache[file].images) {
      const cached = slidesCache[file];
      const index = Math.max(0, Math.min(num - 1, cached.count - 1));
      const cachedImage = cached.images[index];
      
      if (cachedImage && cachedImage.complete && cachedImage.naturalWidth > 0) {
        console.log(`[Player] ⚡ Слайд ${num} из кэша (мгновенно)`);
        if (vjsPlayer) vjsPlayer.pause();
        pdf.removeAttribute('src');
        img.src = cachedImage.src;
        show(img);
        return;
      }
    }
    
    // Fallback: загружаем через API если нет в кэше
    console.log(`[Player] 🌐 Слайд ${num} загружается через API`);
    const imageUrl = `/api/devices/${encodeURIComponent(device_id)}/converted/${encodeURIComponent(file)}/${type}/${num}`;
    if (vjsPlayer) vjsPlayer.pause();
    pdf.removeAttribute('src');
    img.src = imageUrl;
    show(img);
  }

  // WebSocket обработчики
  socket.on('player/play', ({ type, file, page }) => {
    console.log('[Player] 📡 player/play:', { type, file, page });
    
    if (type === 'video') {
      img.removeAttribute('src'); 
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
        
        if (vjsPlayer) {
          vjsPlayer.loop(false);
          vjsPlayer.muted(soundUnlocked && !forceMuted ? false : true);
          vjsPlayer.volume(soundUnlocked && !forceMuted ? 1.0 : 0.0);
          vjsPlayer.src({ src: fileUrl, type: 'video/mp4' });
          
          show(videoContainer);
          
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
          });
        }
      }
    } else if (type === 'image' && file) {
      currentFileState = { type: 'image', file, page: 1 };
      if (vjsPlayer) vjsPlayer.pause();
      pdf.removeAttribute('src');
      img.src = content(file);
      show(img);
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
      vjsPlayer.pause();
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
    img.removeAttribute('src'); 
    pdf.removeAttribute('src');
    currentFileState = { type: null, file: null, page: 1 };
    showPlaceholder(true);
  });

  socket.on('placeholder/refresh', () => {
    console.log('[Player] 🔄 placeholder/refresh - перезагрузка заглушки');
    // Очищаем slidesCache при смене заглушки
    slidesCache = {};
    // Если сейчас показывается заглушка (idle) - перезагружаем её
    if (!currentFileState.type || currentFileState.type === null) {
      showPlaceholder(true); // Принудительная перезагрузка
    }
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
  
  function registerPlayer() {
    if (!preview && device_id && socket.connected) {
      console.log('[Player] 📡 Регистрация устройства:', device_id);
      socket.emit('player/register', { 
        device_id, 
        device_type: 'browser-videojs', 
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
      // Отложенный старт heartbeat - даем серверу время обработать регистрацию
      setTimeout(() => {
        isRegistered = true;
        startHeartbeat();
        console.log('[Player] 💓 Heartbeat запущен');
      }, 1000);
    }
  }
  
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
  });

  socket.on('connect', () => {
    console.log('✅ Connected');
    registerPlayer();
  });

  socket.on('disconnect', () => {
    console.warn('⚠️ Disconnected');
    isRegistered = false;
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
      heartbeatInterval = null;
    }
    if (pingTimeout) {
      clearTimeout(pingTimeout);
      pingTimeout = null;
    }
  });

  socket.on('reconnect', () => {
    console.log('🔄 Reconnected');
    if (!isRegistered) {
      registerPlayer();
    }
  });
  
  // Watchdog проверка каждые 10 секунд
  setInterval(() => {
    if (socket.connected && !isRegistered) {
      console.log('🔄 Watchdog: re-registering');
      registerPlayer();
    }
  }, 10000);
}

