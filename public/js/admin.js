import { initThemeToggle } from './theme.js';
import { sortDevices, debounce, getPageSize, loadNodeNames } from './utils.js';
import { DEVICE_ICONS, DEVICE_TYPE_NAMES } from './shared/constants.js';
import { ensureAuth, adminFetch, setXhrAuth } from './admin/auth.js';
import { setupSocketListeners } from './admin/socket-listeners.js';
import { loadDevices as loadDevicesModule, renderTVList as renderTVListModule } from './admin/devices-manager.js';
import { createDevice, renameDevice, deleteDevice } from './admin/device-crud.js';
import { loadFilesWithStatus, refreshFilesPanel as refreshFilesPanelModule } from './admin/files-manager.js';
import { previewFile, makeDefault, renameFile, deleteFile } from './admin/file-actions.js';
import { uploadFiles, copyFile } from './admin/upload-manager.js';
import { clearDetail, clearFilesPane, openDevice as openDeviceHelper } from './admin/ui-helpers.js';
import { renderDeviceCard as renderDeviceCardModule } from './admin/device-card.js';
import { setupUploadUI as setupUploadUIModule } from './admin/upload-ui.js';
import { initSystemMonitor } from './admin/system-monitor.js';

const socket = io();
const grid = document.getElementById('grid');

let readyDevices = new Set();
let devicesCache = [];
let currentDeviceId = null;
let tvPage = 0;
let filePage = 0;
let nodeNames = {};

// Настройка Socket.IO обработчиков
setupSocketListeners(socket, {
  onDevicesUpdated: async () => {
    const prev = currentDeviceId;
    await loadDevices();
    const pageSize = getPageSize();
    const totalPages = Math.max(1, Math.ceil(devicesCache.length / pageSize));
    if (tvPage >= totalPages) tvPage = totalPages - 1;
    if (prev && devicesCache.find(d => d.device_id === prev)) {
      openDevice(prev);
    } else {
      clearDetail();
      clearFilesPane();
    }
    renderTVList();
  },
  onFileProcessing: (device_id, file) => {
    if (currentDeviceId === device_id) {
      const panel = document.getElementById('filesPanel');
      if (panel) refreshFilesPanel(device_id, panel, adminFetch, getPageSize, filePage, socket);
    }
  },
  onFileProgress: (device_id, file, progress) => {
    if (currentDeviceId === device_id) {
      const panel = document.getElementById('filesPanel');
      if (panel) refreshFilesPanel(device_id, panel, adminFetch, getPageSize, filePage, socket);
    }
  },
  onFileReady: (device_id, file) => {
    if (currentDeviceId === device_id) {
      const panel = document.getElementById('filesPanel');
      if (panel) refreshFilesPanel(device_id, panel, adminFetch, getPageSize, filePage, socket);
    }
  },
  onFileError: (device_id, file, error) => {
    if (currentDeviceId === device_id) {
      const panel = document.getElementById('filesPanel');
      if (panel) refreshFilesPanel(device_id, panel, adminFetch, getPageSize, filePage, socket);
    }
  },
  onPreviewRefresh: async () => {
    if (currentDeviceId) await renderFilesPane(currentDeviceId);
  },
  onPlayerOnline: (device_id) => {
    readyDevices.add(device_id);
    renderTVList();
    if (currentDeviceId === device_id) openDevice(device_id);
  },
  onPlayerOffline: (device_id) => {
    readyDevices.delete(device_id);
    renderTVList();
    if (currentDeviceId === device_id) openDevice(device_id);
  },
  onPlayersSnapshot: (list) => {
    try {
      readyDevices = new Set(Array.isArray(list) ? list : []);
    } catch {
      readyDevices = new Set();
    }
    renderTVList();
    if (currentDeviceId) openDevice(currentDeviceId);
  }
});

document.addEventListener('DOMContentLoaded', async () => {
  initThemeToggle(document.getElementById('themeBtn'), 'vc_theme_admin');
  try {
    const authorized = await ensureAuth();
    if (!authorized) return;
  } catch (err) {
    return;
  }
  await loadAndSetNodeNames();
  await loadDevices();
  renderLayout();
  initSelectionFromUrl();
  
  // Инициализируем системный монитор
  initSystemMonitor();
});

async function loadDevices() {
  devicesCache = await loadDevicesModule(adminFetch, sortDevices, nodeNames);
}

// renderTVList перенесена в devices-manager.js  
function renderTVList() {
  return renderTVListModule(devicesCache, readyDevices, currentDeviceId, nodeNames, tvPage, getPageSize, sortDevices, openDevice, renderFilesPane, adminFetch);
}

// Пересчет пагинации при изменении размера экрана (desktop/mobile)
let resizeTimeout;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimeout);
  resizeTimeout = setTimeout(() => {
    if (tvList) renderTVList();
    // Также перерисовываем список файлов если он открыт
    if (currentDeviceId) renderFilesPane(currentDeviceId);
  }, 250);
});

async function loadAndSetNodeNames() {
  nodeNames = await loadNodeNames();
}
function renderLayout() {
  grid.innerHTML = `
    <div class="card" style="display:flex; flex-direction:column; min-height:0">
      <div class="header">
        <div class="title">Устройства</div>
      </div>
      <div style="display:flex; flex-direction:column; gap:var(--space-md); flex:1 1 auto; min-height:0">
        <ul id="tvList" class="list" style="flex:1 1 auto; min-height:0; overflow-y:auto; overflow-x:hidden; display:flex; flex-direction:column; gap:var(--space-sm)"></ul>
        <div id="tvPager" class="meta" style="display:flex; justify-content:space-between; align-items:center; gap:var(--space-sm); flex-wrap:wrap"></div>
      </div>
    </div>

    <div id="detailPane" style="min-height:0; display:flex; flex-direction:column"></div>

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

// clearDetail, clearFilesPane перенесены в ui-helpers.js

// ------ Открыть выбранную ноду ------
function openDevice(id) {
  currentDeviceId = id;
  filePage = 0; // Сброс пагинации файлов при смене устройства
  const d = devicesCache.find(x => x.device_id === id);
  const pane = document.getElementById('detailPane');
  if (!pane) return;
  if (!d) { clearDetail(); return; }
  pane.innerHTML = '';
  pane.appendChild(renderDeviceCard(d));
}

// renderDeviceCard перенесена в device-card.js
function renderDeviceCard(d) {
  return renderDeviceCardModule(d, nodeNames, readyDevices, loadDevices, renderTVList, openDevice, renderFilesPane, socket);
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


// refreshFilesPanel перенесена в files-manager.js
async function refreshFilesPanel(deviceId, panelEl) {
  return await refreshFilesPanelModule(deviceId, panelEl, adminFetch, getPageSize, filePage, socket);
}

// setupUploadUI перенесена в upload-ui.js
function setupUploadUI(card, deviceId, filesPanelEl) {
  return setupUploadUIModule(card, deviceId, filesPanelEl, renderFilesPane, socket);
}

// ------ Периодическая проверка статусов файлов в обработке ------
setInterval(async () => {
  if (!currentDeviceId) return;
  
  try {
    // Получаем статусы всех файлов текущего устройства
    const res = await adminFetch(`/api/devices/${encodeURIComponent(currentDeviceId)}/files-with-status`);
    const filesData = await res.json();
    
    // Проверяем есть ли файлы в обработке
    const hasProcessing = filesData.some(f => 
      f.status === 'processing' || f.status === 'checking'
    );
    
    // Если есть файлы в обработке - обновляем панель
    if (hasProcessing) {
      const panel = document.getElementById('filesPanel');
      if (panel) {
        await refreshFilesPanel(currentDeviceId, panel);
      }
    }
  } catch (e) {
    // Игнорируем ошибки (например если устройство удалено)
    console.debug('[Admin] Ошибка проверки статусов (игнорируем):', e);
  }
}, 3000); // Проверяем каждые 3 секунды
