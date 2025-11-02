import { initThemeToggle } from './theme.js';

const socket = io();
const grid = document.getElementById('grid');

// ======== Авторизация (Basic Auth) ========
const ADMIN_AUTH_KEY = 'adminBasicAuth';
let adminAuth = sessionStorage.getItem(ADMIN_AUTH_KEY) || null;

async function askLogin(retry = false) {
  const u = prompt('Логин администратора:');
  const p = prompt('Пароль администратора:');
  if (u && p) {
    adminAuth = 'Basic ' + btoa(`${u}:${p}`);
    sessionStorage.setItem(ADMIN_AUTH_KEY, adminAuth);
    return true;
  }
  if (!retry) alert('Требуется авторизация для доступа к админке');
  return false;
}

async function ensureAuth() {
  if (!adminAuth) return askLogin();
  return true;
}

async function adminFetch(url, opts = {}) {
  await ensureAuth();
  const init = {
    ...opts,
    headers: {
      ...(opts.headers || {}),
      Authorization: adminAuth
    }
  };
  const res = await fetch(url, init);
  if (res.status === 401) {
    sessionStorage.removeItem(ADMIN_AUTH_KEY);
    adminAuth = null;
    const ok = await askLogin(true);
    if (!ok) throw new Error('Unauthorized');
    return adminFetch(url, opts);
  }
  return res;
}

function setXhrAuth(xhr) {
  if (adminAuth) xhr.setRequestHeader('Authorization', adminAuth);
}
// ==========================================

let readyDevices = new Set(); // device_id активных плееров
let devicesCache = [];
let currentDeviceId = null;
let tvPage = 0;
const TV_PAGE_SIZE = 10;

// Debounce
const debounce = (fn, ms = 200) => { let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms); }; };

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

// Сокет-обновления
socket.on('devices/updated', debounce(async () => {
  const prev = currentDeviceId;
  await loadDevices();
  // корректируем текущую страницу при изменении количества устройств
  const totalPages = Math.max(1, Math.ceil(devicesCache.length / TV_PAGE_SIZE));
  if (tvPage >= totalPages) tvPage = totalPages - 1;
  if (prev && devicesCache.find(d => d.device_id === prev)) {
    openDevice(prev);
  } else {
    clearDetail();
    clearFilesPane();
  }
  renderTVList();
}, 150));

socket.on('preview/refresh', debounce(async () => {
  if (currentDeviceId) {
    // не перерисовываем карточку, чтобы не перезагружать iframe превью
    await renderFilesPane(currentDeviceId);
  }
}, 150));

// Онлайн/офлайн плееров
socket.on('player/online', ({ device_id }) => {
  readyDevices.add(device_id);
  renderTVList();
  if (currentDeviceId === device_id) openDevice(device_id);
});
socket.on('player/offline', ({ device_id }) => {
  readyDevices.delete(device_id);
  renderTVList();
  if (currentDeviceId === device_id) openDevice(device_id);
});

// Initialize online status on first connect/refresh
socket.on('players/onlineSnapshot', (list) => {
  try {
    readyDevices = new Set(Array.isArray(list) ? list : []);
  } catch {
    readyDevices = new Set();
  }
  renderTVList();
  if (currentDeviceId) openDevice(currentDeviceId);
});

document.addEventListener('DOMContentLoaded', async () => {
  initThemeToggle(document.getElementById('themeBtn'), 'vc_theme_admin');
  await ensureAuth();
  await loadNodeNames(); // <--- добавили
  await loadDevices();
  renderLayout();
  initSelectionFromUrl();
});

// ------ Загрузка списка устройств ------
async function loadDevices() {
  const res = await adminFetch('/api/devices');
  devicesCache = await res.json();
  // Сортируем устройства по алфавиту: А-Я, A-Z, 0-9
  devicesCache = sortDevices(devicesCache);
}

function renderTVList() {
  const tvList = document.getElementById('tvList');
  if (!tvList) return;

  if (!devicesCache.length) {
    tvList.innerHTML = `
      <li class="item" style="text-align:center; padding:var(--space-xl)">
        <div style="width:100%">
          <div class="title">Нет устройств</div>
          <div class="meta">Откройте плеер или добавьте устройство</div>
        </div>
      </li>
    `;
    // Очищаем пейджер если есть
    const pager = document.getElementById('tvPager');
    if (pager) pager.innerHTML = '';
    return;
  }

  // Сортируем устройства перед отображением (на случай если список обновился)
  const sortedDevices = sortDevices(devicesCache);
  const totalPages = Math.max(1, Math.ceil(sortedDevices.length / TV_PAGE_SIZE));
  if (tvPage >= totalPages) tvPage = totalPages - 1;
  const start = tvPage * TV_PAGE_SIZE;
  const end = Math.min(start + TV_PAGE_SIZE, sortedDevices.length);
  const pageItems = sortedDevices.slice(start, end);

  // Устройства всегда отображаются в одну колонку (друг над другом) - как в спикере
  tvList.style.display = 'flex';
  tvList.style.flexDirection = 'column';
  tvList.style.gap = 'var(--space-sm)';

  tvList.innerHTML = pageItems.map(d => {
    const name = d.name || nodeNames[d.device_id] || d.device_id;
    const filesCount = d.files?.length ?? 0;
    const isActive = d.device_id === currentDeviceId;
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
    item.onclick = async () => {
      currentDeviceId = item.dataset.id;
      openDevice(currentDeviceId);
      renderFilesPane(currentDeviceId);
      renderTVList();
    };
  });

  // рендер пейджера под списком - как в спикере
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

// Убрали resize listener, так как список теперь фиксированный (flex column)

let nodeNames = {}; // { device_id: name }

async function loadNodeNames() {
  try {
    const res = await fetch('/devices.json'); // путь к файлу
    nodeNames = await res.json();
  } catch (e) {
    console.warn('Не удалось загрузить devices.json', e);
    nodeNames = {};
  }
}

// ------ Рендер 3-колоночного layout ------
function renderLayout() {
  grid.innerHTML = `
    <!-- Левая колонка: список ТВ -->
    <div class="card" style="display:flex; flex-direction:column; min-height:0">
      <div class="header">
        <div class="title">Устройства</div>
      </div>
      <div style="display:flex; flex-direction:column; gap:var(--space-md); flex:1 1 auto; min-height:0">
        <ul id="tvList" class="list" style="flex:1 1 auto; min-height:0; overflow-y:auto; overflow-x:hidden; display:grid; gap:var(--space-sm)"></ul>
        <div id="tvPager" class="meta" style="display:flex; justify-content:space-between; align-items:center; gap:var(--space-sm); flex-wrap:wrap"></div>
      </div>
    </div>

    <!-- Центральная колонка -->
    <div id="detailPane" style="min-height:0; display:flex; flex-direction:column"></div>

    <!-- Правая колонка: файлы выбранной ноды -->
    <div id="filesPane" class="card" style="min-height:0; display:flex; flex-direction:column">
      <div class="header" style="display:flex; justify-content:space-between; align-items:center; gap:var(--space-sm); margin-bottom:var(--space-sm)">
        <div class="title" style="margin:0; font-size:var(--font-size-base)">Файлы</div>
        <div class="meta" id="filesPaneMeta" style="margin:0; white-space:nowrap">Выберите устройство слева</div>
      </div>
      <div id="filesPanel" style="flex:1 1 auto; min-height:0; overflow-y:auto; overflow-x:hidden"></div>
    </div>
  `;

  renderTVList();
  initDeviceSelectHandlers();
}

// ------ Привязка выбора ноды ------
function initDeviceSelectHandlers() {
  const createBtn = document.getElementById('createBtn');
  const newIdEl = document.getElementById('newId');
  const newNameEl = document.getElementById('newName');

  if (createBtn && newIdEl) {
    const doCreate = async () => {
      const device_id = (newIdEl.value || '').trim();
      const name = (newNameEl && newNameEl.value || '').trim();
      if (!device_id) return;
      await adminFetch('/api/devices', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ device_id, name })
      });
      if (newIdEl) newIdEl.value = '';
      if (newNameEl) newNameEl.value = '';
      await loadDevices();
      currentDeviceId = device_id;
      renderTVList();
      openDevice(device_id);
      renderFilesPane(device_id);
    };
    createBtn.onclick = doCreate;
    newIdEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') doCreate(); });
    if (newNameEl) newNameEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') doCreate(); });
  }
}

// ------ Заполнение select ------
/* removed obsolete populateSelect (dropdown was removed) */

// ------ Старт из URL ?device_id ------
function initSelectionFromUrl() {
  const url = new URL(location.href);
  let q = url.searchParams.get('device_id');

  if (!q && devicesCache.length > 0) {
    // Если device_id нет в URL, берем первую ноду
    q = devicesCache[0].device_id;
    url.searchParams.set('device_id', q);
    history.replaceState(null, '', url.toString());
  }

  if (q && devicesCache.find(d => d.device_id === q)) {
    openDevice(q);
    renderFilesPane(q);
  }
}

// ------ Очистка центральной и правой панелей ------
function clearDetail() {
  const pane = document.getElementById('detailPane');
  if (!pane) return;
  pane.innerHTML = `
    <div class="card" style="min-height:200px">
      <div class="header">
        <div>
          <div class="title">Не выбрано</div>
          <div class="meta">Выберите слева</div>
        </div>
      </div>
    </div>
  `;
}

function clearFilesPane() {
  const meta = document.getElementById('filesPaneMeta');
  const panel = document.getElementById('filesPanel');
  if (meta) meta.textContent = 'Выберите слева';
  if (panel) panel.innerHTML = '';
}

// ------ Открыть выбранную ноду ------
function openDevice(id) {
  currentDeviceId = id;
  const d = devicesCache.find(x => x.device_id === id);
  const pane = document.getElementById('detailPane');
  if (!pane) return;
  if (!d) { clearDetail(); return; }
  pane.innerHTML = '';
  pane.appendChild(renderDeviceCard(d));
}

// ------ Рендер карточки выбранной ноды (центр) ------
function renderDeviceCard(d) {
  const did = encodeURIComponent(d.device_id);
  const card = document.createElement('div');
  card.className = 'card';
  card.style.display = 'flex';
  card.style.flexDirection = 'column';
  card.style.height = '100%';
  card.style.minHeight = '0';
  const name = d.name || nodeNames[d.device_id] || d.device_id;
  card.innerHTML = `
    <div class="header" style="margin-bottom:var(--space-sm)">
      <div style="flex:1; display:flex; align-items:stretch; gap:var(--space-sm)">
        <div class="title" id="deviceName" style="flex:1; cursor:pointer; padding:var(--space-sm) var(--space-md); border-radius:var(--radius-sm); transition:all 0.2s; display:flex; align-items:center; min-height:36px; font-size:var(--font-size-base); margin:0" contenteditable="false">${name}</div>
        <button class="primary" id="renameSaveBtn" style="display:none; min-width:36px; width:36px; height:36px; padding:0; border-radius:var(--radius-sm); flex-shrink:0; align-items:center; justify-content:center; font-size:var(--font-size-lg); line-height:1; transition:all 0.2s; box-shadow:var(--shadow-sm)" title="Сохранить">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:block">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
        </button>
      </div>
      <div class="meta" style="margin-top:var(--space-xs); margin-bottom:0">ID: ${d.device_id} • Файлов: ${d.files?.length || 0} • ${readyDevices.has(d.device_id) ? '✓ Готов' : '✗ Не готов'}</div>
    </div>

    <div style="display:flex; flex-wrap:wrap; gap:var(--space-sm); align-items:center; margin-top:var(--space-md)">
      <button class="secondary playerBtn" style="flex:1; min-width:90px">Плеер</button>
      <button class="secondary speakerBtn" style="flex:1; min-width:90px">Спикер</button>
      <button class="danger delBtn" style="flex:1; min-width:90px">Удалить</button>
    </div>

    <div class="preview panel" style="margin-top:var(--space-md); display:block; flex:1 1 auto; min-height:0; aspect-ratio:16/9; max-height:380px">
      <div class="previewHolder" style="width:100%; height:100%; background:rgba(0,0,0,.06); border-radius:var(--radius-md); overflow:hidden">
        <iframe src="/player.html?device_id=${did}&preview=1" style="width:100%; height:100%; border:0"></iframe>
      </div>
    </div>

    <div class="uploadBox card" style="margin-top:var(--space-md)">
      <div class="header">
        <div style="display:flex; gap:var(--space-sm); flex-wrap:wrap; width:100%">
          <input type="file" class="fileInput" multiple accept=".mp4,.webm,.ogg,.mkv,.mov,.avi,.mp3,.wav,.m4a,.png,.jpg,.jpeg,.gif,.webp,.pdf,.pptx" style="display:none"/>
          <button class="secondary pickBtn" style="flex:1; min-width:120px">Выбрать файлы</button>
          <button class="secondary clearBtn" style="flex:1; min-width:120px">Очистить</button>
          <button class="primary uploadBtn" style="flex:1; min-width:120px">Загрузить</button>
        </div>
      </div>
      <div class="dropZone">
        Перетащите файлы сюда или нажмите "Выбрать файлы"
      </div>
      <ul class="queue"></ul>
    </div>
  `;

  // Действия
  card.querySelector('.playerBtn').onclick = () => window.open(`/player.html?device_id=${did}`, '_blank');
  card.querySelector('.speakerBtn').onclick = () => window.open(`/speaker.html?device_id=${did}`, '_blank');
  card.querySelector('.delBtn').onclick = async () => {
    if (!confirm(`Удалить устройство ${d.device_id}?`)) return;
    await adminFetch(`/api/devices/${encodeURIComponent(d.device_id)}`, { method:'DELETE' });
    await loadDevices();
    clearDetail();
    clearFilesPane();
    renderTVList();
  };

  // Inline редактирование имени устройства
  const nameEl = card.querySelector('#deviceName');
  const saveBtn = card.querySelector('#renameSaveBtn');
  let originalName = name;
  let isEditing = false;
  let savingFromButton = false; // Флаг для предотвращения blur при сохранении через кнопку

  if (nameEl) {
    nameEl.addEventListener('click', () => {
      if (!isEditing) {
        isEditing = true;
        originalName = nameEl.textContent.trim();
        nameEl.contentEditable = 'true';
        nameEl.style.background = 'var(--bg-input)';
        nameEl.style.border = 'var(--border)';
        nameEl.style.padding = 'var(--space-sm) var(--space-md)';
        nameEl.focus();
        // Выделяем весь текст
        const range = document.createRange();
        range.selectNodeContents(nameEl);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        saveBtn.style.display = 'flex';
      }
    });

    nameEl.addEventListener('blur', () => {
      if (isEditing && !savingFromButton) {
        // Сохраняем при потере фокуса, если текст изменился
        const newName = nameEl.textContent.trim();
        if (newName && newName !== originalName) {
          saveName(newName);
        } else {
          cancelEdit();
        }
      }
      savingFromButton = false;
    });

    nameEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const newName = nameEl.textContent.trim();
        if (newName && newName !== originalName) {
          saveName(newName);
        } else {
          cancelEdit();
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cancelEdit();
      }
    });

    const saveName = async (newName) => {
      try {
        await adminFetch(`/api/devices/${encodeURIComponent(d.device_id)}/rename`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: newName })
        });
        await loadDevices();
        renderTVList();
        openDevice(d.device_id);
      } catch (err) {
        console.error('Failed to rename device:', err);
        cancelEdit();
      }
    };

    const cancelEdit = () => {
      isEditing = false;
      nameEl.contentEditable = 'false';
      nameEl.textContent = originalName;
      nameEl.style.background = 'transparent';
      nameEl.style.border = 'none';
      nameEl.style.padding = 'var(--space-sm) var(--space-md)';
      saveBtn.style.display = 'none';
    };

    if (saveBtn) {
      // Используем mousedown чтобы предотвратить blur перед кликом
      saveBtn.addEventListener('mousedown', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        savingFromButton = true; // Устанавливаем флаг перед сохранением
        const newName = nameEl.textContent.trim();
        if (newName && newName !== originalName) {
          await saveName(newName);
        } else {
          cancelEdit();
        }
      });
    }
  }

  // Инициализация загрузки (после загрузки — обновить правую колонку)
  setupUploadUI(card, d.device_id, document.getElementById('filesPanel'));

  return card;
}

// ------ Правая колонка: файлы выбранной ноды ------
async function renderFilesPane(deviceId) {
  const meta = document.getElementById('filesPaneMeta');
  const panel = document.getElementById('filesPanel');
  if (!panel) return;
  if (meta) meta.textContent = `ID: ${deviceId}`;
  panel.innerHTML = `<div class="meta">Загрузка списка...</div>`;
  await refreshFilesPanel(deviceId, panel);
}

async function refreshFilesPanel(deviceId, panelEl) {
  const res = await adminFetch(`/api/devices/${encodeURIComponent(deviceId)}/files`);
  const filesData = await res.json();
  
  // Поддержка старого формата (массив строк) и нового формата (массив объектов)
  const files = filesData.map(item => {
    if (typeof item === 'string') {
      return { safeName: item, originalName: item };
    }
    return { safeName: item.safeName || item.originalName, originalName: item.originalName || item.safeName };
  });
  
  if (!files || files.length === 0) {
    panelEl.innerHTML = `
      <div class="meta" style="text-align:center; padding:var(--space-xl)">
        Нет файлов. Загрузите файлы через панель слева.
      </div>
    `;
    return;
  }
  
  panelEl.innerHTML = `
    <ul class="list" style="display:grid; gap:var(--space-sm)">
      ${files.map(({ safeName, originalName }) => {
        // placeholders allowed only for image/video (no pdf/pptx)
        const isEligible = /\.(mp4|webm|ogg|mkv|mov|avi|mp3|wav|m4a|png|jpg|jpeg|gif|webp)$/i.test(safeName);
        const ext = safeName.split('.').pop().toLowerCase();
        const typeLabel = ext === 'pdf' ? 'PDF' : ext === 'pptx' ? 'PPTX' : ['png','jpg','jpeg','gif','webp'].includes(ext) ? 'IMG' : 'VID';
        return `
          <li class="item" style="display:flex; flex-direction:column; gap:var(--space-sm); padding:var(--space-md); border:var(--border); border-radius:var(--radius-sm); background:var(--panel-2)">
            <div style="display:flex; align-items:center; gap:var(--space-sm); width:100%; min-width:0">
              <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; flex:1; font-weight:var(--font-weight-medium)">${originalName}</span>
              <span class="meta" style="white-space:nowrap; flex:0 0 auto">${typeLabel}</span>
            </div>
            <div style="display:flex; gap:var(--space-sm); flex-wrap:wrap; width:100%">
              <button class="secondary previewFileBtn" data-safe="${encodeURIComponent(safeName)}" data-original="${encodeURIComponent(originalName)}" title="Предпросмотр" style="flex:1; min-width:100px">Превью</button>
              ${isEligible ? `<button class="secondary makeDefaultBtn" data-safe="${encodeURIComponent(safeName)}" data-original="${encodeURIComponent(originalName)}" title="Сделать заглушкой" style="flex:1; min-width:100px">Заглушка</button>` : ``}
              <button class="danger delFileBtn" data-safe="${encodeURIComponent(safeName)}" data-original="${encodeURIComponent(originalName)}" title="Удалить" style="flex:1; min-width:100px">Удалить</button>
            </div>
          </li>
        `;
      }).join('')}
    </ul>
  `;

  panelEl.querySelectorAll('.previewFileBtn').forEach(btn => {
    btn.onclick = () => {
      const safeName = decodeURIComponent(btn.getAttribute('data-safe'));
      const frame = document.querySelector('#detailPane iframe');
      if (frame) {
        const u = `/player.html?device_id=${encodeURIComponent(deviceId)}&preview=1&file=${encodeURIComponent(safeName)}`;
        frame.src = u;
      }
    };
  });

  panelEl.querySelectorAll('.makeDefaultBtn').forEach(btn => {
    btn.onclick = async () => {
      const safeName = decodeURIComponent(btn.getAttribute('data-safe'));
      const originalName = decodeURIComponent(btn.getAttribute('data-original'));
      try {
        await adminFetch(`/api/devices/${encodeURIComponent(deviceId)}/make-default`, {
          method: 'POST',
          headers: { 'Content-Type':'application/json' },
          body: JSON.stringify({ file: safeName })
        });
        await refreshFilesPanel(deviceId, panelEl);
        socket.emit('devices/updated');
      } catch (e) { console.error(e); }
    };
  });

  panelEl.querySelectorAll('.delFileBtn').forEach(btn => {
    btn.onclick = async () => {
      const safeName = decodeURIComponent(btn.getAttribute('data-safe'));
      const originalName = decodeURIComponent(btn.getAttribute('data-original'));
      if (!confirm(`Удалить файл ${originalName}?`)) return;
      await adminFetch(`/api/devices/${encodeURIComponent(deviceId)}/files/${encodeURIComponent(safeName)}`, { method: 'DELETE' });
      await refreshFilesPanel(deviceId, panelEl);
      socket.emit('devices/updated');
    };
  });
}

// ------ Загрузка файлов ------
function setupUploadUI(card, deviceId, filesPanelEl) {
  const dropZone = card.querySelector('.dropZone');
  const fileInput = card.querySelector('.fileInput');
  const pickBtn = card.querySelector('.pickBtn');
  const clearBtn = card.querySelector('.clearBtn');
  const uploadBtn = card.querySelector('.uploadBtn');
  const queue = card.querySelector('.queue');
  if (!fileInput || !pickBtn || !clearBtn || !uploadBtn || !queue) return;

  let pending = [];
  const allowed = /\.(mp4|webm|ogg|mkv|mov|avi|mp3|wav|m4a|png|jpg|jpeg|gif|webp|pdf|pptx)$/i;

  function renderQueue() {
    if (!pending.length) { queue.innerHTML = ''; return; }
    queue.innerHTML = pending.map((f,i) => `
      <li style="display:flex; justify-content:space-between; align-items:center; padding:6px 0">
        <span>${f.name} <span class="meta">(${(f.size/1024/1024).toFixed(2)} MB)</span></span>
        <span class="meta" id="p_${deviceId}_${i}">0%</span>
      </li>
    `).join('');
  }

  function addToQueue(files) {
    for (const f of files) {
      if (!allowed.test(f.name)) continue;
      pending.push(f);
    }
    renderQueue();
  }

  pickBtn.onclick = () => fileInput.click();
  clearBtn.onclick = () => { pending = []; renderQueue(); };
  fileInput.onchange = e => { addToQueue(Array.from(e.target.files || [])); fileInput.value=''; };

  if (dropZone) {
    ['dragenter','dragover','dragleave','drop'].forEach(ev => {
      dropZone.addEventListener(ev, e => { e.preventDefault(); e.stopPropagation(); });
    });
    dropZone.addEventListener('dragenter', () => dropZone.classList.add('hover'));
    dropZone.addEventListener('dragover', () => dropZone.classList.add('hover'));
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('hover'));
    dropZone.addEventListener('drop', e => {
      const dt = e.dataTransfer;
      if (!dt) return;
      addToQueue(Array.from(dt.files || []));
    });
  }

  uploadBtn.onclick = async () => {
    if (!pending.length) return;
    const form = new FormData();
    pending.forEach(f => form.append('files', f));

    await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `/api/devices/${encodeURIComponent(deviceId)}/upload`);
      setXhrAuth(xhr);
      xhr.upload.onprogress = e => {
        if (!e.lengthComputable) return;
        const percent = Math.round((e.loaded / e.total) * 100);
        queue.querySelectorAll(`[id^="p_${deviceId}_"]`).forEach(el => el.textContent = `${percent}%`);
      };
      xhr.onload = () => xhr.status<300 ? resolve() : reject(new Error(xhr.statusText));
      xhr.onerror = () => reject(new Error('Network error'));
      xhr.send(form);
    });

    pending = [];
    renderQueue();
    // После загрузки — обновить правую колонку файлов
    await renderFilesPane(deviceId);
    socket.emit('devices/updated');
  };
}
