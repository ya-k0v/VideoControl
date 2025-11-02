const socket = io();
const url = new URL(location.href);
const device_id = url.searchParams.get('device_id');
const preview = url.searchParams.get('preview') === '1';
const forceSound = (url.searchParams.get('sound') === '1') || (url.searchParams.get('autoplay') === '1');
const previewFile = url.searchParams.get('file');

const idle = document.getElementById('idle');
const v = document.getElementById('v');
const img = document.getElementById('img');
const pdf = document.getElementById('pdf');
const unmuteBtn = document.getElementById('unmute');

// Track current file state for navigation
let currentFileState = { type: null, file: null, page: 1 };

let soundUnlocked = false;

// Если нет device_id — чёрный экран
if (!device_id || !device_id.trim()) {
  [idle, v, img, pdf].forEach(el => el && el.classList.remove('visible'));
  document.documentElement.style.background = '#000 !important';
  document.body.style.background = '#000 !important';
  if (unmuteBtn) unmuteBtn.style.display = 'none';
} else {
  // Настройки video
  v.setAttribute('playsinline', '');
  v.setAttribute('webkit-playsinline', '');
  v.autoplay = true;
  v.muted = true;
  v.preload = 'metadata'; // 'metadata' - быстрая загрузка метаданных, видео загружается по требованию
  v.controls = false; // лучше убрать управление, если оно не нужно
  v.disablePictureInPicture = true; // если поддерживается, чтобы снизить нагрузку
  
  // Оптимизация для быстрого начала воспроизведения
  // Начинаем воспроизведение как можно раньше
  let playAttempted = false;
  let playStarted = false;
  
  // Самое раннее событие - начало загрузки метаданных
  v.addEventListener('loadedmetadata', () => {
    // Как только метаданные загружены - сразу пытаемся запустить
    if (!playAttempted && v.autoplay && !playStarted) {
      playAttempted = true;
      v.play().then(() => {
        playStarted = true;
      }).catch(() => {
        playAttempted = false;
      });
    }
  });
  
  // Более раннее событие - загрузка начала видео
  v.addEventListener('loadeddata', () => {
    // Когда загружены первые кадры - запускаем если еще не запустили
    if (!playStarted && v.autoplay && v.paused) {
      v.play().then(() => {
        playStarted = true;
      }).catch(() => {});
    }
  });
  
  v.addEventListener('canplay', () => {
    // Как только достаточно данных для воспроизведения - запускаем если еще не запустили
    if (!playStarted && v.autoplay && v.paused) {
      v.play().then(() => {
        playStarted = true;
      }).catch(() => {});
    }
  });
  
  v.addEventListener('canplaythrough', () => {
    // Когда видео полностью загружено - убеждаемся что оно играет
    if (v.paused && v.autoplay) {
      v.play().catch(() => {});
    }
  });

  // Оптимизированная функция переключения слоев - без белого экрана
  function show(el) {
    if (!el) return;
    
    // КРИТИЧНО: СНАЧАЛА добавляем visible новому слою (чтобы он появился мгновенно, до скрытия старого)
    // Это предотвращает момент когда все слои невидимы и показывается белый фон
    el.classList.add('visible');
    el.style.visibility = 'visible';
    
    // ЗАТЕМ убираем visible со всех остальных (чтобы не было конфликта opacity)
    [idle, v, img, pdf].forEach(e => {
      if (e && e !== el) {
        e.classList.remove('visible');
        e.style.visibility = 'hidden'; // Дополнительно скрываем через visibility
      }
    });
    
    // Убеждаемся что фон всегда черный во всех элементах
    if (document.body) {
      document.body.style.setProperty('background', '#000', 'important');
      document.body.style.setProperty('background-color', '#000', 'important');
    }
    if (document.documentElement) {
      document.documentElement.style.setProperty('background', '#000', 'important');
      document.documentElement.style.setProperty('background-color', '#000', 'important');
    }
    
    // Убеждаемся что stage тоже черный
    const stage = document.getElementById('stage');
    if (stage) {
      stage.style.setProperty('background', '#000', 'important');
      stage.style.setProperty('background-color', '#000', 'important');
    }
  }

  // ✅ теперь путь правильный
  function content(file){ 
    return `/content/${encodeURIComponent(device_id)}/${encodeURIComponent(file)}`; 
  }

  function enableSound(){
    soundUnlocked = true;
    try { localStorage.setItem('vc_sound', '1'); } catch {}
    v.muted = false;
    v.volume = 1.0;
    if (v.src) v.play().catch(()=>{});
    if (unmuteBtn) unmuteBtn.style.display = 'none';
  }

  document.addEventListener('DOMContentLoaded', () => {
    try {
      if (!preview && forceSound) {
        enableSound();
        try { localStorage.setItem('vc_sound', '1'); } catch {}
      } else if (localStorage.getItem('vc_sound') === '1') enableSound();
      else if (unmuteBtn) unmuteBtn.style.display = 'inline-block';
    } catch { if (unmuteBtn) unmuteBtn.style.display = 'inline-block'; }
    // Не показываем заглушку, если в превью запрошен конкретный файл
    if (!(preview && previewFile)) {
      showPlaceholder();
    }
  });

  if (unmuteBtn) {
    unmuteBtn.addEventListener('click', enableSound);
    unmuteBtn.addEventListener('keydown', (e)=>{ if (e.key==='Enter'||e.key===' ') { e.preventDefault(); enableSound(); } });
  }
  document.addEventListener('click', () => { if (!soundUnlocked) enableSound(); }, { once:true });

  // Кэш заглушки для автономной работы
  let cachedPlaceholder = null;
  let placeholderUrl = null;
  
  // Кэш для результата поиска заглушки, чтобы не делать множественные запросы одновременно
  let placeholderResolvePromise = null;
  
  // Заглушка - с кэшированием и оптимизацией запросов
  function resolvePlaceholder(force = false) {
    const tryList = ['mp4','webm','ogg','mkv','mov','avi','mp3','wav','m4a','png','jpg','jpeg','gif','webp'];
    
    // Если уже есть в кэше и не требуется принудительное обновление - возвращаем сразу
    if (cachedPlaceholder && placeholderUrl && !force) {
      return Promise.resolve(placeholderUrl);
    }
    
    // Если уже идет поиск заглушки - ждем результат (избегаем множественных запросов)
    if (placeholderResolvePromise && !force) {
      return placeholderResolvePromise;
    }
    
    // Если требуется принудительное обновление - сбрасываем промис
    if (force) {
      placeholderResolvePromise = null;
    }
    
    placeholderResolvePromise = new Promise((resolve) => {
      (async () => {
        // Проверяем кэш браузера через Cache API (Service Worker)
        if ('caches' in window) {
          try {
            const cache = await caches.open('videocontrol-placeholder-v1');
            for (const ext of tryList) {
              const url = `/content/${encodeURIComponent(device_id)}/default.${ext}`;
              const cached = await cache.match(url);
              if (cached && cached.ok) {
                cachedPlaceholder = cached;
                placeholderUrl = url;
                console.log('[Player] Using cached placeholder:', url);
                placeholderResolvePromise = null;
                return resolve(url);
              }
            }
          } catch (e) {
            console.warn('[Player] Cache check failed:', e);
          }
        }
        
        // Если нет в кэше - проверяем на сервере ПОСЛЕДОВАТЕЛЬНО (не параллельно)
        // Начинаем с наиболее вероятных форматов
        for (const ext of tryList) {
          const url = `/content/${encodeURIComponent(device_id)}/default.${ext}`;
          try {
            // Используем cache: 'force-cache' для использования HTTP кэша
            // Делаем HEAD запрос только один раз для каждого формата
            const r = await fetch(url, { method: 'HEAD', cache: 'force-cache' });
            if (r.ok) {
              placeholderUrl = url;
              cachedPlaceholder = url;
              console.log('[Player] Found placeholder on server:', url);
              placeholderResolvePromise = null;
              return resolve(url);
            }
          } catch (error) {
            // При ошибке сети продолжаем искать другие форматы (тихо, без логирования каждой ошибки)
          }
        }
        
        placeholderResolvePromise = null;
        resolve(null);
      })();
    });
    
    return placeholderResolvePromise;
  }

  async function showPlaceholder(forceRefresh = false) {
    const src = await resolvePlaceholder(forceRefresh);
    if (!src) {
      [idle, v, img, pdf].forEach(el => el && el.classList.remove('visible'));
      document.documentElement.style.background = '#000';
      document.body.style.background = '#000';
      return;
    }
    
    const isImage = /\.(png|jpg|jpeg|gif|webp)$/i.test(src);
    const isVideo = /\.(mp4|webm|ogg|mkv|mov|avi)$/i.test(src);
    const isAudio = /\.(mp3|wav|m4a)$/i.test(src);
    
    // Используем оригинальный URL без cache-bust для кэширования
    // Но добавляем параметр обновления только при принудительном обновлении
    const url = forceRefresh ? `${src}${src.includes('?') ? '&' : '?'}t=${Date.now()}` : src;
    
    if (isImage) {
      try { v.pause(); } catch {}
      v.removeAttribute('src'); v.load(); v.muted = true;
      pdf.removeAttribute('src');
      img.src = url;
      show(img);
    } else {
      try {
        v.src = url;
        v.loop = true;
        v.muted = true; 
        v.volume = 0.0;
        v.preload = 'metadata'; // Изменено с 'auto' на 'metadata'
        await v.play();
      } catch {
        v.muted = true;
        await v.play().catch(()=>{});
      }
      show(v);
    }
  }

  // Display converted PDF/PPTX page/slide as image
  function showConvertedPage(file, type, num) {
    // type: 'page' for PDF, 'slide' for PPTX
    const imageUrl = `/api/devices/${encodeURIComponent(device_id)}/converted/${encodeURIComponent(file)}/${type}/${num}`;
    
    // Hide video and pdf, show image
    try { v.pause(); } catch {}
    v.removeAttribute('src'); v.load(); v.muted = true;
    pdf.removeAttribute('src');
    pdf.removeAttribute('srcdoc');
    
    // Preload image to check if it exists
    const testImg = new Image();
    testImg.onerror = () => {
      // Conversion not ready or failed - show placeholder
      pdf.srcdoc = `
        <!DOCTYPE html>
        <html style="height:100%;margin:0;background:#000;color:#fff;display:flex;align-items:center;justify-content:center;font-family:system-ui">
          <body style="text-align:center;padding:20px">
            <h2>${type === 'page' ? 'PDF' : 'PPTX'} конвертация</h2>
            <p>Конвертация в процессе или не завершена.</p>
            <p>${type === 'page' ? 'Страница' : 'Слайд'}: ${num}</p>
            <p style="font-size:0.9em;color:#999">Подождите несколько секунд...</p>
          </body>
        </html>
      `;
      show(pdf);
    };
    testImg.onload = () => {
      // Image ready - show it
      pdf.removeAttribute('src');
      pdf.removeAttribute('srcdoc');
      img.src = imageUrl;
      show(img);
    };
    testImg.src = imageUrl;
  }

  // Render specific file in preview mode (admin file preview)
  function showPreviewFile(file, previewType = null, previewPage = null) {
    if (!file) return;
    const ext = (file.split('.').pop() || '').toLowerCase();
    // Используем тип из параметров URL если указан, иначе определяем по расширению
    const type = previewType || (ext === 'pdf' ? 'pdf' : ext === 'pptx' ? 'pptx' : ['png','jpg','jpeg','gif','webp'].includes(ext) ? 'image' : 'video');
    const page = previewPage ? parseInt(previewPage) : null;
    
    if (type === 'video') {
      img.removeAttribute('src'); pdf.removeAttribute('src');
      const fileUrl = content(file);
      // Не перезагружаем если уже загружен тот же файл
      if (v.src !== fileUrl) {
        v.src = fileUrl;
      }
      v.preload = 'metadata'; // В превью не нужно полное предзагрузка
      (async () => {
        v.muted = true; v.volume = 0.0; v.loop = true;
        try { await v.play(); } catch {}
        show(v);
      })();
    } else if (type === 'image') {
      try { v.pause(); } catch {}
      v.removeAttribute('src'); v.load(); v.muted = true;
      pdf.removeAttribute('src');
      img.src = content(file);
      show(img);
    } else if (type === 'pdf') {
      const pageNum = page || 1;
      showConvertedPage(file, 'page', pageNum);
    } else if (type === 'pptx') {
      const slideNum = page || 1;
      showConvertedPage(file, 'slide', slideNum);
    }
  }

  // If preview mode requests a specific file, render it without affecting TV
  if (preview && previewFile) {
    // Получаем параметры type и page из URL если они есть
    const previewType = url.searchParams.get('type');
    const previewPage = url.searchParams.get('page');
    showPreviewFile(previewFile, previewType, previewPage);
  }

  function currentFileName() {
    const cur = v.currentSrc || v.src || '';
    try {
      const u = new URL(cur, location.origin);
      return decodeURIComponent(u.pathname.split('/').pop() || '');
    } catch {
      const parts = cur.split('/');
      return decodeURIComponent(parts[parts.length - 1] || '');
    }
  }

  // Регистрация плеера будет выполнена через registerPlayer() при подключении сокета
  // Не регистрируем здесь, чтобы избежать множественных регистраций

  socket.on('player/reject', () => {
    [idle, v, img, pdf].forEach(el => el && el.classList.remove('visible'));
    document.documentElement.style.background = '#000';
    document.body.style.background = '#000';
    if (unmuteBtn) unmuteBtn.style.display = 'none';
  });

  // Воспроизведение (основная команда)
  socket.on('player/play', ({ type, file, page }) => {
    if (type === 'video') {
      img.removeAttribute('src'); pdf.removeAttribute('src');

      if (!file && v.src) {
        // Воспроизведение без указания файла - возобновляем текущее видео
        v.loop = false;
        currentFileState = { type: 'video', file: null, page: 1 };
        
        // КРИТИЧНО: Сохраняем currentTime ПЕРЕД любыми операциями
        let savedTime = 0;
        try {
          savedTime = v.currentTime || 0;
        } catch {}
        
        (async () => {
          // НЕ сбрасываем currentTime - продолжаем с места паузы
          v.muted = soundUnlocked ? false : true;
          v.volume = soundUnlocked ? 1.0 : 0.0;
          
          // Если видео закончилось - начинаем с начала, иначе продолжаем с текущей позиции
          if (v.ended) {
            try { v.currentTime = 0; } catch {}
            savedTime = 0;
          } else {
            // КРИТИЧНО: Восстанавливаем сохраненное время ПЕРЕД play
            try {
              if (savedTime > 0) {
                v.currentTime = savedTime;
              }
            } catch {}
          }
          
          // Добавляем обработчик для восстановления времени после play (если браузер сбросит)
          const playHandler = () => {
            try {
              if (savedTime > 0 && v.currentTime === 0 && !v.ended) {
                v.currentTime = savedTime;
              }
            } catch {}
            v.removeEventListener('play', playHandler);
          };
          v.addEventListener('play', playHandler, { once: true });
          
          try {
            await v.play();
            // Проверяем сразу после play и через небольшую задержку
            setTimeout(() => {
              try {
                if (savedTime > 0 && v.currentTime === 0 && !v.ended) {
                  v.currentTime = savedTime;
                }
              } catch {}
            }, 50);
          } catch {}
          
          show(v);
        })();
        return;
      }

      if (file) {
        v.loop = false;
        currentFileState = { type: 'video', file, page: 1 };
        const fileUrl = content(file);
        const currentFileNameFromSrc = currentFileName();
        const same = currentFileNameFromSrc === file;
        const currentSrc = v.src || v.currentSrc || '';
        
        // КРИТИЧНО: Сохраняем currentTime СРАЗУ, до любых проверок
        let savedTime = 0;
        try {
          savedTime = v.currentTime || 0;
        } catch {}
        
        // КРИТИЧНО: Если уже загружено ТО ЖЕ видео - просто возобновляем (это кнопка PLAY для возобновления после паузы)
        // Проверяем по имени файла И по URL (для надежности)
        const isSameFile = same || currentSrc === fileUrl || currentSrc.endsWith(file) || currentSrc.includes(file);
        
        if (isSameFile && v.src && !v.ended) {
          // Это возобновление того же видео - НЕ трогаем src, только возобновляем воспроизведение
          if (v.paused || v.ended) {
            (async () => {
              // Если видео закончилось, начинаем с начала, иначе продолжаем с текущей позиции
              if (v.ended) {
                try { v.currentTime = 0; } catch {}
                savedTime = 0;
              } else {
                // КРИТИЧНО: Восстанавливаем сохраненное время ПЕРЕД play
                try {
                  if (savedTime > 0) {
                    v.currentTime = savedTime;
                  }
                } catch {}
              }
              
              v.muted = soundUnlocked ? false : true;
              v.volume = soundUnlocked ? 1.0 : 0.0;
              
              // Добавляем обработчик для восстановления времени после play (если браузер сбросит)
              const playHandler = () => {
                try {
                  if (savedTime > 0 && v.currentTime === 0 && !v.ended) {
                    v.currentTime = savedTime;
                  }
                } catch {}
                v.removeEventListener('play', playHandler);
              };
              v.addEventListener('play', playHandler, { once: true });
              
              // Запускаем воспроизведение
              try {
                await v.play();
                // Проверяем сразу после play
                setTimeout(() => {
                  try {
                    if (savedTime > 0 && v.currentTime === 0 && !v.ended) {
                      v.currentTime = savedTime;
                    }
                  } catch {}
                }, 50);
              } catch {}
              
              show(v);
            })();
          } else {
            // Видео уже играет - просто показываем его
            show(v);
          }
          return;
        }

        // Устанавливаем src только если это действительно другой файл
        // Проверяем и currentSrc, чтобы избежать повторной загрузки
        if (currentSrc !== fileUrl && !currentSrc.endsWith(file)) {
          // Останавливаем предыдущее видео перед загрузкой нового
          try {
            v.pause();
            v.currentTime = 0;
          } catch {}
          playAttempted = false; // Сбрасываем флаги попытки воспроизведения
          playStarted = false;
          
          // ОПТИМИЗИРОВАННАЯ ЗАГРУЗКА: простая и быстрая
          // С Nginx статика раздается максимально быстро, множественные Range запросы не нужны
          v.src = fileUrl;
          v.preload = 'metadata'; // Загружаем только метаданные для быстрого старта
          v.muted = true; 
          v.volume = 0.0;
          show(v);
          
          // Запускаем воспроизведение сразу
          v.play().then(() => {
            playStarted = true;
            playAttempted = true;
            // Включаем звук если разрешено
            if (soundUnlocked) {
              setTimeout(() => { v.muted = false; v.volume = 1.0; }, 200);
            }
          }).catch(() => {
            playAttempted = false;
          });
        } else {
          // Если видео уже загружается - просто пытаемся запустить
          v.muted = true; 
          v.volume = 0.0;
          show(v);
          
          v.play().then(() => {
            playStarted = true;
            playAttempted = true;
          }).catch(() => {
            playAttempted = false;
          });
          
          if (soundUnlocked) {
            setTimeout(()=>{ v.muted = false; v.volume = 1.0; }, 200);
          }
        }
      }
    } else if (type === 'image') {
      // Устанавливаем состояние для статичного контента (картинки)
      currentFileState = { type: 'image', file, page: 1 };
      try { v.pause(); } catch {}
      v.removeAttribute('src'); v.load(); v.muted = true;
      pdf.removeAttribute('src');
      img.src = content(file);
      show(img);
      // Картинки не должны автоматически переключаться на заглушку
    } else if (type === 'pdf') {
      const pageNum = page || 1;
      currentFileState = { type: 'pdf', file, page: pageNum };
      showConvertedPage(file, 'page', pageNum);
    } else if (type === 'pptx') {
      const slideNum = page || 1;
      currentFileState = { type: 'pptx', file, page: slideNum };
      showConvertedPage(file, 'slide', slideNum);
    }
  });

  socket.on('player/pause', () => {
    // КРИТИЧНО: При паузе currentTime сохраняется автоматически браузером
    // НЕ трогаем currentTime - просто ставим на паузу
    if (!v.paused) {
      v.pause();
      // currentTime автоматически сохраняется браузером при паузе
    }
  });
  socket.on('player/restart', () => {
    if (!v.src) return;
    try { v.currentTime = 0; } catch {}
    (async () => {
      v.muted = soundUnlocked ? false : true;
      v.volume = soundUnlocked ? 1.0 : 0.0;
      try { await v.play(); } catch {}
      show(v);
    })();
  });
  socket.on('player/stop', () => {
    try { v.pause(); } catch {}
    v.removeAttribute('src'); v.load();
    img.removeAttribute('src'); 
    pdf.removeAttribute('src');
    currentFileState = { type: null, file: null, page: 1 };
    // Принудительно обновляем заглушку при команде stop (может быть изменена на сервере)
    showPlaceholder(true);
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

  // Apply current state on (re)register
  socket.on('player/state', (cur) => {
    if (!cur || cur.type === 'idle' || !cur.file) {
      showPlaceholder();
      currentFileState = { type: null, file: null, page: 1 };
      return;
    }
    const { type, file, state, page } = cur;
    if (type === 'video') {
      // Устанавливаем состояние для видео
      currentFileState = { type: 'video', file, page: 1 };
      img.removeAttribute('src'); pdf.removeAttribute('src');
      const fileUrl = content(file);
      const currentSrc = v.src || v.currentSrc || '';
      const same = currentFileName() === file;
      
      // КРИТИЧНО: Не перезагружаем если уже загружен тот же файл - сохраняем currentTime!
      if (same && (currentSrc === fileUrl || currentSrc.endsWith(file))) {
        // Файл тот же - НЕ трогаем src и currentTime! Просто обновляем состояние
      } else {
        // Это ДРУГОЙ файл - загружаем новое видео
        try {
          v.pause();
          v.currentTime = 0; // Сбрасываем только при загрузке НОВОГО файла
        } catch {}
        playAttempted = false;
        playStarted = false;
        v.src = fileUrl;
        v.preload = 'metadata'; // Быстрая загрузка метаданных
      }
      
      v.muted = soundUnlocked ? false : true;
      v.volume = soundUnlocked ? 1.0 : 0.0;
      show(v);
      
      // Обрабатываем состояние paused/playing правильно
      // КРИТИЧНО: Сохраняем currentTime ПЕРЕД любыми операциями
      let savedTime = 0;
      try {
        savedTime = v.currentTime || 0;
      } catch {}
      
      if (state === 'paused') {
        // Если состояние paused - НЕ запускаем воспроизведение, просто показываем видео
        // currentTime сохраняется автоматически при паузе
        try {
          if (!v.paused) {
            v.pause(); // Если видео играет - ставим на паузу
          }
          // ВАЖНО: Сохраняем currentTime если он был сброшен
          try {
            if (savedTime > 0 && v.currentTime === 0 && !v.ended) {
              v.currentTime = savedTime;
            }
          } catch {}
        } catch {}
      } else {
        // Если состояние playing или не указано - запускаем воспроизведение
        // currentTime сохраняется автоматически если файл тот же
        if (v.paused || v.ended) {
          // Только если на паузе или закончилось - запускаем
          if (v.ended) {
            try { v.currentTime = 0; } catch {} // Только если закончилось - начинаем с начала
            savedTime = 0;
          } else {
            // ВОССТАНАВЛИВАЕМ сохраненное время перед запуском
            try {
              if (savedTime > 0 && v.currentTime === 0) {
                v.currentTime = savedTime;
              }
            } catch {}
          }
          
          // Запускаем воспроизведение
          v.play().then(() => {
            playStarted = true;
            playAttempted = true;
            // После play проверяем - не сбросил ли браузер время
            try {
              if (savedTime > 0 && v.currentTime === 0 && !v.ended) {
                v.currentTime = savedTime;
              }
            } catch {}
          }).catch(() => {});
        }
      }
    } else if (type === 'image') {
      // Устанавливаем состояние для статичного контента (картинки)
      currentFileState = { type: 'image', file, page: 1 };
      try { v.pause(); } catch {}
      v.removeAttribute('src'); v.load(); v.muted = true;
      pdf.removeAttribute('src');
      img.src = content(file);
      show(img);
    } else if (type === 'pdf') {
      const pageNum = page || 1;
      currentFileState = { type: 'pdf', file, page: pageNum };
      showConvertedPage(file, 'page', pageNum);
    } else if (type === 'pptx') {
      const slideNum = page || 1;
      currentFileState = { type: 'pptx', file, page: slideNum };
      showConvertedPage(file, 'slide', slideNum);
    } else {
      showPlaceholder();
      currentFileState = { type: null, file: null, page: 1 };
    }
  });

// === Watchdog: поддержание статуса "готов" ===
let lastConnected = false;
let isRegistered = false;
let heartbeatInterval = null;
let pingTimeout = null;

function registerPlayer() {
  if (!preview && device_id && socket.connected) {
    socket.emit('player/register', { device_id });
    isRegistered = true;
    
    // Запускаем heartbeat после регистрации
    startHeartbeat();
  }
}

function startHeartbeat() {
  // Очищаем предыдущий интервал если есть
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    if (pingTimeout) clearTimeout(pingTimeout);
  }
  
  // Отправляем ping каждые 15 секунд
  heartbeatInterval = setInterval(() => {
    if (!socket.connected || !isRegistered || preview) {
      clearInterval(heartbeatInterval);
      if (pingTimeout) clearTimeout(pingTimeout);
      heartbeatInterval = null;
      return;
    }
    
    // Отправляем ping
    socket.emit('player/ping');
    
    // Таймаут на ответ - если нет ответа за 5 секунд, считаем соединение потерянным
    pingTimeout = setTimeout(() => {
      console.warn('⚠️ Heartbeat timeout - connection lost');
      isRegistered = false;
      clearInterval(heartbeatInterval);
      heartbeatInterval = null;
    }, 5000);
  }, 15000);
}

socket.on('player/pong', () => {
  // Получили ответ на ping - соединение активно
  if (pingTimeout) {
    clearTimeout(pingTimeout);
    pingTimeout = null;
  }
});

// 1. При каждом переподключении сокета
socket.on('connect', () => {
  console.log('✅ Socket connected');
  lastConnected = true;
  if (!isRegistered) {
    registerPlayer();
  }
});

// 2. При обрыве соединения
socket.on('disconnect', () => {
  console.warn('⚠️ Socket disconnected');
  lastConnected = false;
  isRegistered = false;
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
  if (pingTimeout) {
    clearTimeout(pingTimeout);
    pingTimeout = null;
  }
  // При потере соединения продолжаем показывать заглушку из кэша (автономная работа)
  if (!preview && currentFileState.type === null) {
    console.log('[Player] Continuing offline with cached placeholder');
    showPlaceholder();
  }
});

// 3. При успешном переподключении
socket.on('reconnect', () => {
  console.log('🔄 Socket reconnected');
  lastConnected = true;
  if (!isRegistered) {
    registerPlayer();
  }
});

// 4. Обработка обновления заглушки (при изменении default файла на сервере)
socket.on('placeholder/refresh', async () => {
  console.log('[Player] Placeholder refresh requested');
  // Очищаем кэш заглушки и загружаем новую
  cachedPlaceholder = null;
  placeholderUrl = null;
  placeholderResolvePromise = null; // Сбрасываем промис поиска
  if ('caches' in window) {
    try {
      const cache = await caches.open('videocontrol-placeholder-v1');
      const tryList = ['mp4','webm','ogg','mkv','mov','avi','mp3','wav','m4a','png','jpg','jpeg','gif','webp'];
      for (const ext of tryList) {
        const url = `/content/${encodeURIComponent(device_id)}/default.${ext}`;
        await cache.delete(url);
      }
    } catch (e) {
      console.warn('[Player] Failed to clear placeholder cache:', e);
    }
  }
  // Показываем обновленную заглушку, если нет активного контента
  if (currentFileState.type === null) {
    showPlaceholder(true);
  }
});

// 4. Watchdog-проверка каждые 10 секунд
setInterval(() => {
  if (!socket.connected && lastConnected) {
    console.warn('⚠️ Socket lost, waiting for reconnect...');
    lastConnected = false;
    isRegistered = false;
  }
  if (socket.connected && !lastConnected) {
    console.log('🔄 Reconnected, re-registering player');
    registerPlayer();
    lastConnected = true;
  }
}, 10000);

// 5. Обработка закрытия окна/вкладки
window.addEventListener('beforeunload', () => {
  // Пытаемся отправить событие отключения перед закрытием
  if (socket.connected && isRegistered) {
    // socket.io автоматически отправит disconnect при закрытии, но можем добавить явную очистку
    isRegistered = false;
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
      heartbeatInterval = null;
    }
    if (pingTimeout) {
      clearTimeout(pingTimeout);
      pingTimeout = null;
    }
  }
});

  if (!preview) {
    // При завершении видео возвращаемся на заглушку
    // Но только если это было видео, а не статичный контент (image, pdf, pptx)
    v.addEventListener('ended', () => {
      // Переключаемся на заглушку только если:
      // 1. Нет активного контента (type === null) ИЛИ
      // 2. Активное видео закончилось (type === 'video')
      // НЕ переключаемся для статичного контента: image, pdf, pptx
      if (currentFileState.type === null || currentFileState.type === 'video') {
        showPlaceholder();
      }
    });
    
    // Автономная работа: периодически проверяем состояние плеера
    setInterval(() => {
      // Если нет активного контента и видео не играет - показываем заглушку
      // НО НЕ переключаемся если активен статичный контент (image, pdf, pptx)
      const isStaticContent = currentFileState.type === 'image' || 
                               currentFileState.type === 'pdf' || 
                               currentFileState.type === 'pptx';
      
      if (!isStaticContent && currentFileState.type === null && (!v.src || v.ended)) {
        showPlaceholder();
      }
    }, 10000);
  }
}
