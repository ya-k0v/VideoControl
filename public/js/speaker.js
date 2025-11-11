import { initThemeToggle } from './theme.js';
import { sortDevices, debounce, getPageSize, loadNodeNames } from './utils.js';
import { ensureAuth, speakerFetch, logout } from './speaker/auth.js';

const socket = io();

const tvList = document.getElementById('tvList');
const fileList = document.getElementById('fileList');
const filePreview = document.getElementById('filePreview');

let readyDevices = new Set();
let devices = [];
let currentDevice = null;  // device_id
let currentFile = null;    // имя файла из /api/devices/:id/files
let tvPage = 0;
let filePage = 0;
let nodeNames = {}; // { device_id: name }

// Обрезка текста с многоточием (адаптивно для мобильных)
function truncateText(text, maxLength = 40) {
  if (!text) return text;
  
  // Для мобильных устройств (включая iPad) - короче
  const isMobile = window.innerWidth <= 1024;
  const limit = isMobile ? 25 : maxLength;
  
  if (text.length <= limit) return text;
  return text.substring(0, limit) + '...';
}

document.addEventListener('DOMContentLoaded', async () => {
  initThemeToggle(document.getElementById('themeBtn'), 'vc_theme_speaker');
  
  try {
    const authorized = await ensureAuth();
    if (!authorized) return;
  } catch (err) {
    return;
  }
  
  // Показываем имя пользователя
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const userInfo = document.getElementById('userInfo');
  if (userInfo && user.username) {
    userInfo.textContent = `👤 ${user.username}`;
  }
  
  // Обработчик кнопки logout
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.onclick = logout;
  }
  
  nodeNames = await loadNodeNames();
  await loadDevices();
  attachTouchGestures();

  // Автовыбор из URL, если есть
  const url = new URL(location.href);
  const qid = url.searchParams.get('device_id');
  if (qid && devices.find(d => d.device_id === qid)) {
    await selectDevice(qid);
  } else if (devices[0]) {
    await selectDevice(devices[0].device_id);
  }
});

/* Загрузка списка устройств */
async function loadDevices() {
  try {
    const res = await speakerFetch('/api/devices');
    if (!res.ok) {
      console.error('Failed to load devices:', res.status);
      return;
    }
    const newDevices = await res.json();
    
    // КРИТИЧНО: Сохраняем локальное состояние устройств (current) при обновлении списка
    // чтобы не потерять информацию о паузе/воспроизведении при переключении
    if (devices.length > 0) {
      newDevices.forEach(newDev => {
        const oldDev = devices.find(d => d.device_id === newDev.device_id);
        if (oldDev && oldDev.current) {
          // Сохраняем локальное состояние (state, file, type)
          newDev.current = oldDev.current;
        }
      });
    }
    
    devices = newDevices;
    // Сортируем устройства по алфавиту: А-Я, A-Z, 0-9
    devices = sortDevices(devices, nodeNames);
    const pageSize = getPageSize();
    const totalPages = Math.max(1, Math.ceil(devices.length / pageSize));
    if (tvPage >= totalPages) tvPage = totalPages - 1;
    renderTVList();
  } catch (error) {
    console.error('Failed to load devices:', error);
  }
}

/* Рендер списка ТВ (информативный, с подсветкой выбранного) */
function renderTVList() {
  // Сортируем устройства перед отображением (на случай если список обновился)
  const sortedDevices = sortDevices(devices);
  const pageSize = getPageSize();
  const totalPages = Math.max(1, Math.ceil(sortedDevices.length / pageSize));
  if (tvPage >= totalPages) tvPage = totalPages - 1;
  const start = tvPage * pageSize;
  const end = Math.min(start + pageSize, sortedDevices.length);
  const pageItems = sortedDevices.slice(start, end);

  // Рендерим устройства (стили задаются в CSS)
  tvList.innerHTML = pageItems.map(d => {
    const name = d.name || nodeNames[d.device_id] || d.device_id;
    const filesCount = d.files?.length ?? 0;
    const isActive = d.device_id === currentDevice;
    const isReady = readyDevices.has(d.device_id);
    return `
      <li class="tvTile${isActive ? ' active' : ''}" data-id="${d.device_id}">
        <div class="tvTile-content">
          <div class="tvTile-header">
            <div class="title tvTile-name">${name}</div>
            <span class="tvTile-status ${isReady ? 'online' : 'offline'}" 
                  title="${isReady ? 'Готов' : 'Не готов'}" 
                  aria-label="${isReady ? 'online' : 'offline'}"></span>
          </div>
          <div class="meta tvTile-meta">ID: ${d.device_id}</div>
          <div class="meta">Файлов: ${filesCount}</div>
        </div>
      </li>
    `;
  }).join('');

  tvList.querySelectorAll('.tvTile').forEach(item => {
    item.onclick = async () => { await selectDevice(item.dataset.id); };
  });

  // рендер пейджера под списком
  let pager = document.getElementById('tvPager');
  if (!pager) {
    pager = document.createElement('div');
    pager.id = 'tvPager';
    pager.className = 'meta';
    pager.style.display = 'flex';
    pager.style.justifyContent = 'space-between';
    pager.style.alignItems = 'center';
    pager.style.gap = '8px';
    tvList.parentElement && tvList.parentElement.appendChild(pager);
  }
  pager.innerHTML = `
    <button class="secondary" id="tvPrev" ${tvPage<=0?'disabled':''} style="min-width:80px">Назад</button>
    <span style="white-space:nowrap">Стр. ${tvPage+1} из ${totalPages}</span>
    <button class="secondary" id="tvNext" ${tvPage>=totalPages-1?'disabled':''} style="min-width:80px">Вперёд</button>
  `;
  const prev = document.getElementById('tvPrev');
  const next = document.getElementById('tvNext');
  if (prev) prev.onclick = () => { if (tvPage>0) { tvPage--; renderTVList(); } };
  if (next) next.onclick = () => { if (tvPage<totalPages-1) { tvPage++; renderTVList(); } };
}

// Update TV list on resize for responsive grid
let resizeTimeout;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimeout);
  resizeTimeout = setTimeout(() => {
    if (tvList) renderTVList();
    // Также перерисовываем список файлов если он открыт
    if (currentDevice && fileList) loadFiles();
  }, 250);
});

function showLivePreviewForTV(deviceId) {
  // НОВОЕ: Не переключаем превью если показана сетка миниатюр
  const hasThumbnails = filePreview.querySelector('.thumbnail-preview');
  if (hasThumbnails) {
    console.log('[Speaker] ℹ️ Превью показывает миниатюры, не переключаем на заглушку');
    return;
  }
  
  // Показываем превью с живым состоянием устройства (всегда без звука)
  const device = devices.find(d => d.device_id === deviceId);
  if (!device) {
    filePreview.innerHTML = `<iframe src="/player-videojs.html?device_id=${encodeURIComponent(deviceId)}&preview=1&muted=1" style="width:100%;height:100%;border:0"></iframe>`;
    return;
  }
  
  // ВСЕГДА показываем заглушку в live preview (не контент устройства)
  // Логика: Preview используется только для предпросмотра файлов (кнопка "Превью")
  // Когда устройство воспроизводит контент - показываем заглушку, избегая двойной загрузки
  const placeholderUrl = `/player-videojs.html?device_id=${encodeURIComponent(deviceId)}&preview=1&muted=1`;
  const frame = filePreview.querySelector('iframe');
  if (frame && !frame.src.includes(placeholderUrl)) {
    frame.src = placeholderUrl;
  } else if (!frame) {
    filePreview.innerHTML = `<iframe src="${placeholderUrl}" style="width:100%;height:100%;border:0"></iframe>`;
  }
}

/* Выбор устройства: обновляем подсветку и список файлов, не сбрасывая выбранный файл, если он ещё существует */
async function selectDevice(id) {
  currentDevice = id;
  filePage = 0; // Сброс пагинации файлов при смене устройства
  
  // Обновляем URL при переключении устройства
  const url = new URL(location.href);
  url.searchParams.set('device_id', id);
  history.replaceState(null, '', url.toString());
  
  tvList.querySelectorAll('.tvTile').forEach(li => li.classList.remove('active'));
  const item = tvList.querySelector(`.tvTile[data-id="${id}"]`);
  if (item) item.classList.add('active');
  await loadFiles();
  // Если конкретный файл не выбран – показываем живое превью ТВ
  if (!currentFile) showLivePreviewForTV(currentDevice);
}

/* Загрузка и рендер файлов для текущего ТВ */
async function loadFiles() {
  if (!currentDevice) return;
  
  try {
    // КРИТИЧНО: Используем files-with-status для получения разрешения видео
    const res = await speakerFetch(`/api/devices/${encodeURIComponent(currentDevice)}/files-with-status`);
    if (!res.ok) {
      console.error('Failed to load files:', res.status);
      fileList.innerHTML = '<li class="item" style="text-align:center; padding:var(--space-xl)"><div class="meta">Ошибка загрузки файлов</div></li>';
      return;
    }
    const filesData = await res.json();

  // Поддержка старого формата (массив строк) и нового формата (массив объектов)
  const allFiles = filesData.map(item => {
    if (typeof item === 'string') {
      return { safeName: item, originalName: item, resolution: null };
    }
    return { 
      safeName: item.name || item.safeName || item.originalName, 
      originalName: item.originalName || item.name || item.safeName,
      resolution: item.resolution || null
    };
  });

  if (!allFiles || allFiles.length === 0) {
    fileList.innerHTML = `
      <li class="item" style="text-align:center; padding:var(--space-xl)">
        <div class="meta">Нет файлов</div>
      </li>
    `;
    // Очистить пейджер файлов если есть
    const pager = document.getElementById('filePager');
    if (pager) pager.innerHTML = '';
    return;
  }

  // Пагинация файлов
  const pageSize = getPageSize();
  const totalPages = Math.max(1, Math.ceil(allFiles.length / pageSize));
  if (filePage >= totalPages) filePage = totalPages - 1;
  const start = filePage * pageSize;
  const end = Math.min(start + pageSize, allFiles.length);
  const files = allFiles.slice(start, end);

  fileList.innerHTML = files.map(({ safeName, originalName, resolution }) => {
    // Определяем расширение файла
    const hasExtension = safeName.includes('.');
    const ext = hasExtension ? safeName.split('.').pop().toLowerCase() : '';
    
    // Определяем тип файла (включая папки)
    let type = 'VID'; // По умолчанию
    if (ext === 'pdf') type = 'PDF';
    else if (ext === 'pptx') type = 'PPTX';
    else if (['png','jpg','jpeg','gif','webp'].includes(ext)) type = 'IMG';
    else if (ext === 'zip' || !hasExtension) {
      // ZIP или папка без расширения - это папка с изображениями
      type = 'FOLDER';
    }
    
    // НОВОЕ: Определяем разрешение для видео
    let resolutionLabel = '';
    if (type === 'VID' && resolution) {
      const width = resolution.width || 0;
      const height = resolution.height || 0;
      
      if (width >= 3840 || height >= 2160) {
        resolutionLabel = '4K';
      } else if (width >= 1920 || height >= 1080) {
        resolutionLabel = 'FHD';
      } else if (width >= 1280 || height >= 720) {
        resolutionLabel = 'HD';
      } else if (width > 0) {
        resolutionLabel = 'SD';
      }
    }
    
    // Используем safeName для сравнения с currentFile (для обратной совместимости)
    const active = currentFile === safeName || currentFile === originalName;
    // Убираем расширение из отображаемого имени (как в админке)
    const displayName = originalName.replace(/\.[^.]+$/, '');
    
    return `
      <li class="file-item ${active ? 'active' : ''}" style="max-width:100%;">
        <div class="file-item-header" style="max-width:100%;">
          <div style="flex:1; display:flex; align-items:stretch; gap:var(--space-xs); min-width:0; max-width:calc(100% - 80px);">
            <span class="file-item-name" title="${displayName}" style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; flex:1; min-width:0; display:block;">${displayName}</span>
          </div>
          <div style="display:flex; align-items:center; gap:4px; flex-shrink:0;">
            ${resolutionLabel ? `<span style="font-size:10px; opacity:0.7; white-space:nowrap;">${resolutionLabel}</span>` : ''}
            <span class="file-item-type" style="white-space:nowrap;">${type}</span>
          </div>
        </div>
        <div class="file-item-actions">
          <button class="secondary previewBtn" data-safe="${encodeURIComponent(safeName)}" data-original="${encodeURIComponent(originalName)}">Превью</button>
          <button class="primary playBtn" data-safe="${encodeURIComponent(safeName)}" data-original="${encodeURIComponent(originalName)}">▶ Воспроизвести</button>
        </div>
      </li>
    `;
  }).join('');

  // Если выбранного файла больше нет — сбросить выбор и показать живое превью ТВ
  const fileExists = allFiles.some(f => f.safeName === currentFile || f.originalName === currentFile);
  if (currentFile && !fileExists) {
    currentFile = null;
    showLivePreviewForTV(currentDevice);
  } else if (!allFiles.length && !currentFile) {
    showLivePreviewForTV(currentDevice);
  }

  // Рендер пейджера файлов
  let filePager = document.getElementById('filePager');
  if (!filePager) {
    filePager = document.createElement('div');
    filePager.id = 'filePager';
    filePager.className = 'meta';
    filePager.style.display = 'flex';
    filePager.style.justifyContent = 'space-between';
    filePager.style.alignItems = 'center';
    filePager.style.gap = '8px';
    filePager.style.marginTop = 'var(--space-md)';
    fileList.parentElement && fileList.parentElement.appendChild(filePager);
  }
  
  if (totalPages > 1) {
    filePager.innerHTML = `
      <button class="secondary" id="filePrev" ${filePage<=0?'disabled':''} style="min-width:80px">Назад</button>
      <span style="white-space:nowrap">Стр. ${filePage+1} из ${totalPages}</span>
      <button class="secondary" id="fileNext" ${filePage>=totalPages-1?'disabled':''} style="min-width:80px">Вперёд</button>
    `;
    const prev = document.getElementById('filePrev');
    const next = document.getElementById('fileNext');
    if (prev) prev.onclick = () => { if (filePage>0) { filePage--; loadFiles(); } };
    if (next) next.onclick = () => { if (filePage<totalPages-1) { filePage++; loadFiles(); } };
  } else {
    filePager.innerHTML = '';
  }

  fileList.querySelectorAll('.previewBtn').forEach(btn => {
    btn.onclick = async () => {
      const safeName = decodeURIComponent(btn.getAttribute('data-safe'));
      const originalName = decodeURIComponent(btn.getAttribute('data-original'));
      const itemEl = btn.closest('.file-item');
      // Сохраняем safeName для операций
      setCurrentFileSelection(safeName, itemEl);
      
      // Определяем тип файла
      const hasExtension = safeName.includes('.');
      const ext = hasExtension ? safeName.split('.').pop().toLowerCase() : '';
      
      // Для папок, PDF и PPTX показываем сетку миниатюр
      if (!hasExtension || ext === 'pdf' || ext === 'pptx') {
        let images = [];
        
        if (!hasExtension) {
          // Это папка с изображениями
          try {
            const res = await speakerFetch(`/api/devices/${encodeURIComponent(currentDevice)}/folder/${encodeURIComponent(safeName)}/images`);
            const data = await res.json();
            images = data.images || [];
            // Создаем URLs для изображений из папки
            images = images.map((_, idx) => 
              `/api/devices/${encodeURIComponent(currentDevice)}/folder/${encodeURIComponent(safeName)}/image/${idx + 1}`
            );
          } catch (e) {
            console.error('[Speaker] Ошибка загрузки изображений папки:', e);
          }
        } else if (ext === 'pdf' || ext === 'pptx') {
          // Это презентация
          try {
            const urlType = ext === 'pdf' ? 'page' : 'slide';
            const res = await speakerFetch(`/api/devices/${encodeURIComponent(currentDevice)}/slides-count?file=${encodeURIComponent(safeName)}`);
            const data = await res.json();
            const count = data.count || 0;
            // Создаем URLs для слайдов
            for (let i = 1; i <= Math.min(count, 20); i++) { // Максимум 20 миниатюр
              images.push(`/api/devices/${encodeURIComponent(currentDevice)}/converted/${encodeURIComponent(safeName)}/${urlType}/${i}`);
            }
          } catch (e) {
            console.error('[Speaker] Ошибка загрузки слайдов:', e);
          }
        }
        
        // Показываем сетку миниатюр
        if (images.length > 0) {
          filePreview.innerHTML = `
            <div style="width:100%; height:100%; overflow-y:auto; padding:var(--space-md); background:var(--panel)">
              <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(100px, 1fr)); gap:var(--space-sm)">
                ${images.map((url, idx) => `
                  <div class="thumbnail-preview" 
                       data-device-id="${currentDevice}"
                       data-file="${safeName}"
                       data-page="${idx + 1}"
                       data-type="${!hasExtension ? 'folder' : ext}"
                       style="aspect-ratio:16/9; background:var(--panel-2); border-radius:var(--radius-sm); overflow:hidden; position:relative; cursor:pointer; transition:transform 0.2s, box-shadow 0.2s"
                       onmouseover="this.style.transform='scale(1.05)'; this.style.boxShadow='0 4px 12px rgba(0,0,0,0.3)'"
                       onmouseout="this.style.transform='scale(1)'; this.style.boxShadow='none'">
                    <img src="${url}" 
                         alt="${idx + 1}" 
                         loading="lazy"
                         style="width:100%; height:100%; object-fit:cover; display:block; pointer-events:none"
                         onerror="this.parentElement.innerHTML='<div style=\\'display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-secondary);font-size:10px\\'>✗</div>'">
                    <div style="position:absolute; bottom:2px; right:4px; background:rgba(0,0,0,0.7); color:#fff; padding:2px 4px; border-radius:3px; font-size:10px; pointer-events:none">${idx + 1}</div>
                  </div>
                `).join('')}
              </div>
            </div>
          `;
          
          // Добавляем обработчики кликов на миниатюры
          filePreview.querySelectorAll('.thumbnail-preview').forEach(thumb => {
            thumb.addEventListener('click', () => {
              const deviceId = thumb.getAttribute('data-device-id');
              const fileName = thumb.getAttribute('data-file');
              const page = parseInt(thumb.getAttribute('data-page'), 10);
              const type = thumb.getAttribute('data-type');
              
              console.log(`[Speaker] 🎯 Клик на миниатюру: ${fileName}, страница ${page}, тип ${type}`);
              
              // Отправляем команду на воспроизведение конкретной страницы/изображения
              socket.emit('control/play', { 
                device_id: deviceId, 
                file: fileName,
                page: page
              });
              
              // Визуальная обратная связь - подсветка выбранной миниатюры
              filePreview.querySelectorAll('.thumbnail-preview').forEach(t => {
                t.style.border = '';
                t.style.outline = '';
              });
              thumb.style.border = '3px solid var(--brand)';
              thumb.style.outline = '2px solid rgba(59, 130, 246, 0.3)';
              
              // НЕ переключаем превью на плеер - оставляем сетку миниатюр!
              // Превью остается как есть, пользователь может выбрать другую миниатюру
            });
            
            // Показываем hint при наведении
            thumb.addEventListener('mouseenter', (e) => {
              const hint = e.currentTarget.querySelector('.play-hint');
              if (hint) hint.style.opacity = '1';
            });
            thumb.addEventListener('mouseleave', (e) => {
              const hint = e.currentTarget.querySelector('.play-hint');
              if (hint) hint.style.opacity = '0';
            });
          });
        } else {
          filePreview.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-secondary)">Нет изображений для превью</div>`;
        }
      } else {
        // Для видео и обычных изображений показываем в iframe
        let src = `/player-videojs.html?device_id=${encodeURIComponent(currentDevice)}&preview=1&muted=1&file=${encodeURIComponent(safeName)}`;
        
        if (['png','jpg','jpeg','gif','webp'].includes(ext)) {
          src += `&type=image&page=1`;
        }
        
        src += `&t=${Date.now()}`;
        
        const frame = filePreview.querySelector('iframe');
        if (frame) {
          frame.src = src;
        } else {
          filePreview.innerHTML = `<iframe src="${src}" style="width:100%;height:100%;border:0"></iframe>`;
        }
      }
    };
  });

  fileList.querySelectorAll('.playBtn').forEach(btn => {
    btn.onclick = () => {
      const safeName = decodeURIComponent(btn.getAttribute('data-safe'));
      setCurrentFileSelection(safeName, btn.closest('.file-item'));
      
      // КРИТИЧНО: Обновляем локальное состояние устройства
      const device = devices.find(d => d.device_id === currentDevice);
      if (device) {
        if (!device.current) device.current = {};
        device.current.file = safeName;
        device.current.state = 'playing';
        console.log(`[Speaker] ▶️ Воспроизведение: ${safeName} на ${currentDevice}`);
      }
      
      socket.emit('control/play', { device_id: currentDevice, file: safeName });
      
      // Определяем тип файла
      const hasExtension = safeName.includes('.');
      const ext = hasExtension ? safeName.split('.').pop().toLowerCase() : '';
      const isStaticContent = !hasExtension || ext === 'pdf' || ext === 'pptx';
      
      // Для видео и обычных изображений - показываем заглушку
      // Для папок и презентаций - оставляем превью как есть (сетка миниатюр)
      if (!isStaticContent) {
        // КРИТИЧНО: После запуска воспроизведения показываем заглушку в preview
        // Чтобы не было двойной загрузки (preview + основной плеер)
        setTimeout(() => {
          const placeholderUrl = `/player-videojs.html?device_id=${encodeURIComponent(currentDevice)}&preview=1&muted=1`;
          const frame = filePreview.querySelector('iframe');
          if (frame) {
            frame.src = placeholderUrl;
          } else {
            filePreview.innerHTML = `<iframe src="${placeholderUrl}" style="width:100%;height:100%;border:0"></iframe>`;
          }
        }, 300);
      }
      // Для папок и презентаций превью остается на сетке миниатюр
    };
  });
  
  } catch (error) {
    console.error('Failed to render files:', error);
    fileList.innerHTML = '<li class="item" style="text-align:center; padding:var(--space-xl)"><div class="meta">Ошибка загрузки файлов</div></li>';
  }
}

/* Установка выбранного файла и подсветка строки */
function setCurrentFileSelection(filename, itemEl) {
  currentFile = filename;
  // Убираем активное состояние у всех элементов
  fileList.querySelectorAll('.file-item').forEach(li => {
    li.classList.remove('active');
  });
  
  // Добавляем активное состояние выбранному элементу
  if (itemEl) {
    itemEl.classList.add('active');
  }
}

/* Верхняя панель управления */
document.getElementById('playBtn').onclick = () => {
  if (!currentDevice) return;
  
  const device = devices.find(d => d.device_id === currentDevice);
  
  // Если устройство на паузе - продолжаем воспроизведение (resume)
  if (device && device.current && device.current.state === 'paused') {
    console.log(`[Speaker] ▶️ Resume: ${currentDevice} (файл: ${device.current.file || 'unknown'})`);
    socket.emit('control/play', { device_id: currentDevice }); // Сервер отправит player/resume
    // Обновляем локальное состояние
    device.current.state = 'playing';
  } 
  // Если выбран файл из списка - воспроизводим его
  else if (currentFile) {
    console.log(`[Speaker] ▶️ Play файл: ${currentFile}`);
    socket.emit('control/play', { device_id: currentDevice, file: currentFile });
  }
  // Иначе пробуем resume (если было что-то до перезапуска сервера)
  else {
    console.log(`[Speaker] ▶️ Resume (нет currentFile)`);
    socket.emit('control/play', { device_id: currentDevice });
  }
};

document.getElementById('pauseBtn').onclick = () => {
  if (!currentDevice) return;
  
  const device = devices.find(d => d.device_id === currentDevice);
  
  // Обновляем локальное состояние устройства на "пауза"
  if (device && device.current) {
    device.current.state = 'paused';
    console.log(`[Speaker] ⏸️ Пауза: ${currentDevice} (файл: ${device.current.file || 'unknown'})`);
  }
  
  socket.emit('control/pause', { device_id: currentDevice });
};
document.getElementById('restartBtn').onclick = () => {
  if (!currentDevice) return;
  socket.emit('control/restart', { device_id: currentDevice });
};
document.getElementById('stopBtn').onclick = () => {
  if (!currentDevice) return;
  socket.emit('control/stop', { device_id: currentDevice });
};
document.getElementById('pdfPrevBtn').onclick = () => {
  if (!currentDevice) return;
  socket.emit('control/pdfPrev', { device_id: currentDevice });
};
document.getElementById('pdfNextBtn').onclick = () => {
  if (!currentDevice) return;
  socket.emit('control/pdfNext', { device_id: currentDevice });
};
document.getElementById('pdfCloseBtn').onclick = () => {
  if (!currentDevice) return;
  socket.emit('control/stop', { device_id: currentDevice });
};

/* Реакция на обновления с сервера — дебаунс + сохранение выбора */
const onDevicesUpdated = debounce(async () => {
  const prevDevice = currentDevice;
  const prevFile = currentFile;
  await loadDevices();
  if (prevDevice && devices.find(d => d.device_id === prevDevice)) {
    await selectDevice(prevDevice);
    if (prevFile) {
      const btn = fileList.querySelector(`.previewBtn[data-safe='${encodeURIComponent(prevFile)}']`);
      if (btn) {
        const itemEl = btn.closest('.file-item');
        if (itemEl) itemEl.classList.add('active');
        currentFile = prevFile;
      } else {
        currentFile = null;
        showLivePreviewForTV(prevDevice);
      }
    } else {
      showLivePreviewForTV(prevDevice);
    }
  }
}, 150);

// онлайн/офлайн статусы плееров
socket.on('player/online', ({ device_id }) => {
  readyDevices.add(device_id);
  renderTVList();
});
socket.on('player/offline', ({ device_id }) => {
  readyDevices.delete(device_id);
  renderTVList();
});

// Initialize online statuses on load/refresh
socket.on('players/onlineSnapshot', (list) => {
  try {
    readyDevices = new Set(Array.isArray(list) ? list : []);
  } catch {
    readyDevices = new Set();
  }
  renderTVList();
});

socket.on('devices/updated', onDevicesUpdated);
const onPreviewRefresh = debounce(async ({ device_id }) => {
  await speakerFetch('/api/devices')
    .then(res => res.json())
    .then(data => {
      devices = sortDevices(data);
      
      if (currentDevice && (device_id === currentDevice || !device_id)) {
        const device = devices.find(d => d.device_id === currentDevice);
        if (device && device.current && device.current.type) {
          // Для видео обновляем превью только при первом воспроизведении или смене файла
          // Для статичного контента обновляем всегда
          const isVideo = device.current.type === 'video';
          const frame = filePreview.querySelector('iframe');
          const currentUrl = frame ? new URL(frame.src).searchParams.get('file') : null;
          const currentFile = device.current.file;
          
          if (!isVideo || currentFile !== currentUrl) {
            showLivePreviewForTV(currentDevice);
          }
          // Для видео с тем же файлом - не обновляем превью, чтобы избежать множественных запросов
        } else {
          showLivePreviewForTV(currentDevice);
        }
      }
    })
    .catch(err => console.error('Failed to refresh devices:', err));
  
  const prevFile = currentFile;
  if (currentDevice) {
    await loadFiles();
    if (prevFile) {
      const btn = fileList.querySelector(`.previewBtn[data-safe='${encodeURIComponent(prevFile)}']`);
      if (btn) {
        const itemEl = btn.closest('.file-item');
        if (itemEl) itemEl.classList.add('active');
        currentFile = prevFile;
      } else {
        currentFile = null;
        showLivePreviewForTV(currentDevice);
      }
    }
  }
}, 300); // Увеличил задержку с 150 до 300ms для уменьшения частоты обновлений

socket.on('preview/refresh', onPreviewRefresh);

/* ===== Жесты для тач: свайп по превью PDF (Prev/Next) ===== */
function attachTouchGestures() {
  const area = document.getElementById('filePreview');
  if (!area) return;
  let startX = 0, startY = 0, active = false;
  area.addEventListener('touchstart', (e) => {
    if (!e.touches || !e.touches.length) return;
    const t = e.touches[0];
    startX = t.clientX; startY = t.clientY; active = true;
  }, { passive: true });
  area.addEventListener('touchend', (e) => {
    if (!active) return; active = false;
    const t = (e.changedTouches && e.changedTouches[0]) || null;
    if (!t) return;
    const dx = t.clientX - startX;
    const dy = t.clientY - startY;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {
      if (!currentDevice) return;
      if (dx < 0) socket.emit('control/pdfNext', { device_id: currentDevice });
      else socket.emit('control/pdfPrev', { device_id: currentDevice });
    }
  }, { passive: true });
}
