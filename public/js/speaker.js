import { initThemeToggle } from './theme.js';

const socket = io();

const tvList = document.getElementById('tvList');
const fileList = document.getElementById('fileList');
const filePreview = document.getElementById('filePreview');

let readyDevices = new Set();
let devices = [];
let currentDevice = null;  // device_id
let currentFile = null;    // имя файла из /api/devices/:id/files
let tvPage = 0;
const TV_PAGE_SIZE = 5;

// Утилита-дебаунс для сглаживания частых обновлений
const debounce = (fn, ms = 200) => {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
};

let nodeNames = {}; // { device_id: name }

async function loadNodeNames() {
  try {
    const res = await fetch('/devices.json');
    nodeNames = await res.json();
  } catch (e) {
    console.warn('Не удалось загрузить devices.json', e);
    nodeNames = {};
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  initThemeToggle(document.getElementById('themeBtn'), 'vc_theme_speaker');
  await loadNodeNames();
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

// Функция для получения приоритета символа при сортировке
// Порядок: русские буквы (А-Я) -> латинские буквы (A-Z) -> цифры (0-9)
function getCharPriority(char) {
  const code = char.charCodeAt(0);
  // Русские буквы: А-Я (1040-1071), а-я (1072-1103)
  if ((code >= 1040 && code <= 1103) || (code >= 1072 && code <= 1103)) {
    // Нормализуем к верхнему регистру для сравнения
    const upper = char.toUpperCase();
    const upperCode = upper.charCodeAt(0);
    return 1000 + (upperCode - 1040); // А = 1000, Я = 1063
  }
  // Латинские буквы: A-Z (65-90), a-z (97-122)
  if ((code >= 65 && code <= 90) || (code >= 97 && code <= 122)) {
    return 2000 + (char.toUpperCase().charCodeAt(0) - 65); // A = 2000, Z = 2025
  }
  // Цифры: 0-9 (48-57)
  if (code >= 48 && code <= 57) {
    return 3000 + (code - 48); // 0 = 3000, 9 = 3009
  }
  // Остальные символы идут в конец
  return 4000 + code;
}

// Функция для получения приоритета строки (по первому символу)
function getStringPriority(str) {
  if (!str || str.length === 0) return 5000;
  const firstChar = str[0];
  return getCharPriority(firstChar);
}

// Функция сортировки устройств: сначала по приоритету первого символа, затем по алфавиту
function sortDevices(devices) {
  return [...devices].sort((a, b) => {
    const nameA = (a.name || nodeNames[a.device_id] || a.device_id).trim();
    const nameB = (b.name || nodeNames[b.device_id] || b.device_id).trim();
    
    // Сначала сравниваем по приоритету первого символа
    const priorityA = getStringPriority(nameA);
    const priorityB = getStringPriority(nameB);
    
    if (priorityA !== priorityB) {
      return priorityA - priorityB;
    }
    
    // Если приоритет одинаковый, сортируем по алфавиту
    // Для правильной сортировки используем localeCompare с русской локалью
    return nameA.localeCompare(nameB, 'ru', { numeric: true, sensitivity: 'base' });
  });
}

/* Загрузка списка устройств */
async function loadDevices() {
  const res = await fetch('/api/devices');
  devices = await res.json();
  // Сортируем устройства по алфавиту: А-Я, A-Z, 0-9
  devices = sortDevices(devices);
  const totalPages = Math.max(1, Math.ceil(devices.length / TV_PAGE_SIZE));
  if (tvPage >= totalPages) tvPage = totalPages - 1;
  renderTVList();
}

/* Рендер списка ТВ (информативный, с подсветкой выбранного) */
function renderTVList() {
  // Сортируем устройства перед отображением (на случай если список обновился)
  const sortedDevices = sortDevices(devices);
  const totalPages = Math.max(1, Math.ceil(sortedDevices.length / TV_PAGE_SIZE));
  if (tvPage >= totalPages) tvPage = totalPages - 1;
  const start = tvPage * TV_PAGE_SIZE;
  const end = Math.min(start + TV_PAGE_SIZE, sortedDevices.length);
  const pageItems = sortedDevices.slice(start, end);

  // Устройства всегда отображаются в одну колонку (друг над другом)
  tvList.style.display = 'flex';
  tvList.style.flexDirection = 'column';
  tvList.style.gap = 'var(--space-sm)';

  tvList.innerHTML = pageItems.map(d => {
    const name = d.name || nodeNames[d.device_id] || d.device_id;
    const filesCount = d.files?.length ?? 0;
    const isActive = d.device_id === currentDevice;
    const isReady = readyDevices.has(d.device_id);
    return `
      <li class="tvTile${isActive ? ' active' : ''}" data-id="${d.device_id}" style="cursor:pointer">
        <div style="display:flex; flex-direction:column; gap:var(--space-xs)">
          <div style="display:flex; align-items:center; gap:var(--space-sm); justify-content:space-between">
            <div class="title" style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; flex:1; min-width:0">${name}</div>
            <span title="${isReady ? 'Готов' : 'Не готов'}" aria-label="${isReady ? 'online' : 'offline'}" style="flex:0 0 auto; width:10px; height:10px; border-radius:50%; background:${isReady ? 'var(--success)' : 'var(--danger)'}; box-shadow: 0 0 0 2px rgba(0,0,0,0.15) inset;"></span>
          </div>
          <div class="meta" style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap">ID: ${d.device_id}</div>
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
  }, 250);
});

function showLivePreviewForTV(deviceId) {
  // Показываем превью с живым состоянием устройства
  const device = devices.find(d => d.device_id === deviceId);
  if (!device) {
    filePreview.innerHTML = `<iframe src="/player.html?device_id=${encodeURIComponent(deviceId)}&preview=1" style="width:100%;height:100%;border:0"></iframe>`;
    return;
  }
  
  // Если устройство воспроизводит контент (не idle), показываем его в превью
  const current = device.current || {};
  if (current.type && current.type !== 'idle' && current.file) {
    // Для презентаций и картинок показываем текущий файл и страницу/слайд
    if (current.type === 'pdf' || current.type === 'pptx' || current.type === 'image') {
      const url = `/player.html?device_id=${encodeURIComponent(deviceId)}&preview=1&file=${encodeURIComponent(current.file)}&type=${current.type}&page=${current.page || 1}`;
      const frame = filePreview.querySelector('iframe');
      if (frame && frame.src !== url) {
        frame.src = url;
      } else if (!frame) {
        filePreview.innerHTML = `<iframe src="${url}" style="width:100%;height:100%;border:0"></iframe>`;
      }
      // Для видео НЕ показываем превью в реальном времени (чтобы избежать множественных запросов)
      // Показываем только для статичного контента
    } else if (current.type === 'video') {
      // Для видео показываем превью только если iframe еще не создан или отличается
      const url = `/player.html?device_id=${encodeURIComponent(deviceId)}&preview=1&file=${encodeURIComponent(current.file)}`;
      const frame = filePreview.querySelector('iframe');
      if (!frame) {
        filePreview.innerHTML = `<iframe src="${url}" style="width:100%;height:100%;border:0"></iframe>`;
      } else if (frame.src !== url) {
        // Обновляем только если URL изменился
        frame.src = url;
      }
      // Если уже есть iframe с правильным URL - не трогаем его
    }
  } else {
    // Если idle - показываем заглушку
    const placeholderUrl = `/player.html?device_id=${encodeURIComponent(deviceId)}&preview=1`;
    const frame = filePreview.querySelector('iframe');
    if (frame && frame.src !== placeholderUrl) {
      frame.src = placeholderUrl;
    } else if (!frame) {
      filePreview.innerHTML = `<iframe src="${placeholderUrl}" style="width:100%;height:100%;border:0"></iframe>`;
    }
  }
}

/* Выбор устройства: обновляем подсветку и список файлов, не сбрасывая выбранный файл, если он ещё существует */
async function selectDevice(id) {
  currentDevice = id;
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
  const res = await fetch(`/api/devices/${encodeURIComponent(currentDevice)}/files`);
  const filesData = await res.json();

  // Поддержка старого формата (массив строк) и нового формата (массив объектов)
  const files = filesData.map(item => {
    if (typeof item === 'string') {
      return { safeName: item, originalName: item };
    }
    return { safeName: item.safeName || item.originalName, originalName: item.originalName || item.safeName };
  });

  if (!files || files.length === 0) {
    fileList.innerHTML = `
      <li class="item" style="text-align:center; padding:var(--space-xl)">
        <div class="meta">Нет файлов</div>
      </li>
    `;
    return;
  }

  fileList.innerHTML = files.map(({ safeName, originalName }) => {
    const ext = safeName.split('.').pop().toLowerCase();
    const type = ext === 'pdf' ? 'PDF' : ext === 'pptx' ? 'PPTX' : ['png','jpg','jpeg','gif','webp'].includes(ext) ? 'IMG' : 'VID';
    // Используем safeName для сравнения с currentFile (для обратной совместимости)
    const active = currentFile === safeName || currentFile === originalName;
    // Убираем расширение из отображаемого имени
    const displayName = originalName.replace(/\.[^.]+$/, '');
    return `
      <li class="item ${active ? 'active' : ''}" style="display:flex; flex-direction:column; gap:var(--space-sm); padding:var(--space-md); ${active ? 'background:var(--brand-light);' : ''} border-radius:var(--radius-sm)">
        <div style="display:flex; align-items:center; gap:var(--space-sm); width:100%; min-width:0">
          <div style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; flex:1; font-weight:var(--font-weight-medium)">${displayName}</div>
          <span class="meta" style="white-space:nowrap; flex:0 0 auto">${type}</span>
        </div>
        <div style="display:flex; gap:var(--space-sm); flex-wrap:wrap; width:100%">
          <button class="secondary previewBtn" data-safe="${encodeURIComponent(safeName)}" data-original="${encodeURIComponent(originalName)}" style="flex:1; min-width:100px">Превью</button>
          <button class="primary playBtn" data-safe="${encodeURIComponent(safeName)}" data-original="${encodeURIComponent(originalName)}" style="flex:1; min-width:100px">▶ Воспроизвести</button>
        </div>
      </li>
    `;
  }).join('');

  // Если выбранного файла больше нет — сбросить выбор и показать живое превью ТВ
  const fileExists = files.some(f => f.safeName === currentFile || f.originalName === currentFile);
  if (currentFile && !fileExists) {
    currentFile = null;
    showLivePreviewForTV(currentDevice);
  } else if (!files.length && !currentFile) {
    showLivePreviewForTV(currentDevice);
  }

  fileList.querySelectorAll('.previewBtn').forEach(btn => {
    btn.onclick = () => {
      const safeName = decodeURIComponent(btn.getAttribute('data-safe'));
      const originalName = decodeURIComponent(btn.getAttribute('data-original'));
      const itemEl = btn.closest('.item');
      // Сохраняем safeName для операций
      setCurrentFileSelection(safeName, itemEl);
      // Превью через плеер (iframe), без запуска на ТВ
      const src = `/player.html?device_id=${encodeURIComponent(currentDevice)}&preview=1&file=${encodeURIComponent(safeName)}`;
      const frame = filePreview.querySelector('iframe');
      if (frame) {
        frame.src = src;
      } else {
        filePreview.innerHTML = `<iframe src="${src}" style="width:100%;height:100%;border:0"></iframe>`;
      }
    };
  });

  fileList.querySelectorAll('.playBtn').forEach(btn => {
    btn.onclick = () => {
      const safeName = decodeURIComponent(btn.getAttribute('data-safe'));
      setCurrentFileSelection(safeName, btn.closest('.item'));
      socket.emit('control/play', { device_id: currentDevice, file: safeName });
    };
  });
}

/* Установка выбранного файла и подсветка строки */
function setCurrentFileSelection(filename, itemEl) {
  currentFile = filename;
  // Убираем активное состояние у всех элементов, сохраняя их базовые стили
  fileList.querySelectorAll('.item').forEach(li => {
    if (li.style.background) {
      li.style.background = '';
    }
    // Убираем класс активного состояния если используется
    li.classList.remove('active');
  });
  
  // Добавляем активное состояние выбранному элементу
  if (itemEl) {
    itemEl.style.background = 'var(--brand-light)';
    itemEl.classList.add('active');
  }
}

/* Верхняя панель управления */
document.getElementById('playBtn').onclick = () => {
  if (!currentDevice) return;
  socket.emit('control/play', { device_id: currentDevice }); // resume
};
document.getElementById('pauseBtn').onclick = () => {
  if (!currentDevice) return;
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
      const btn = fileList.querySelector(`.previewBtn[data-file='${encodeURIComponent(prevFile)}']`);
      if (btn) {
        btn.closest('.item').setAttribute('style','background:rgba(0,0,0,0.04)');
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
  // Обновляем список устройств для получения актуального состояния
  await fetch('/api/devices')
    .then(res => res.json())
    .then(data => {
      devices = sortDevices(data); // Сортируем устройства по алфавиту
      readyDevices = new Set(data.filter(d => d.device_id && d.name).map(d => d.device_id));
      
      // Если обновление касается текущего устройства, обновляем превью
      // Но только для статичного контента (image, pdf, pptx) или если изменился файл
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
      const btn = fileList.querySelector(`.previewBtn[data-file='${encodeURIComponent(prevFile)}']`);
      if (btn) {
        btn.closest('.item').setAttribute('style','background:rgba(0,0,0,0.04)');
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
