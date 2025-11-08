import { initThemeToggle } from './theme.js';
import { sortDevices, debounce, getPageSize, loadNodeNames } from './utils.js';
import { DEVICE_ICONS, DEVICE_TYPE_NAMES } from './shared/constants.js';
import { ensureAuth, adminFetch, setXhrAuth } from './admin/auth.js';
import { setupSocketListeners } from './admin/socket-listeners.js';
import { loadDevices as loadDevicesModule, renderTVList as renderTVListModule } from './admin/devices-manager.js';
import { createDevice, renameDevice, deleteDevice } from './admin/device-crud.js';
import { loadFilesWithStatus, refreshFilesPanel } from './admin/files-manager.js';
import { previewFile, makeDefault, renameFile, deleteFile } from './admin/file-actions.js';
import { uploadFiles, copyFile } from './admin/upload-manager.js';
import { clearDetail, clearFilesPane, openDevice as openDeviceHelper } from './admin/ui-helpers.js';
import { renderDeviceCard as renderDeviceCardModule } from './admin/device-card.js';
import { setupUploadUI as setupUploadUIModule } from './admin/upload-ui.js';

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
      if (panel) refreshFilesPanel(device_id, panel);
    }
  },
  onFileProgress: (device_id, file, progress) => {
    if (currentDeviceId === device_id) {
      const panel = document.getElementById('filesPanel');
      if (panel) refreshFilesPanel(device_id, panel);
    }
  },
  onFileReady: (device_id, file) => {
    if (currentDeviceId === device_id) {
      const panel = document.getElementById('filesPanel');
      if (panel) refreshFilesPanel(device_id, panel);
    }
  },
  onFileError: (device_id, file, error) => {
    if (currentDeviceId === device_id) {
      const panel = document.getElementById('filesPanel');
      if (panel) refreshFilesPanel(device_id, panel);
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

async function refreshFilesPanel(deviceId, panelEl) {
  // НОВОЕ: Используем API с статусами файлов
  const res = await adminFetch(`/api/devices/${encodeURIComponent(deviceId)}/files-with-status`);
  const filesData = await res.json();
  
  // Файлы уже в формате { name, originalName, status, progress, canPlay, error }
  const allFiles = filesData.map(item => {
    if (typeof item === 'string') {
      // Старый формат (для обратной совместимости)
      return { safeName: item, originalName: item, status: 'ready', progress: 100, canPlay: true, resolution: null };
    }
    return { 
      safeName: item.name, 
      originalName: item.originalName,
      status: item.status || 'ready',
      progress: item.progress || 100,
      canPlay: item.canPlay !== false,
      error: item.error || null,
      resolution: item.resolution || null
    };
  });
  
  if (!allFiles || allFiles.length === 0) {
    panelEl.innerHTML = `
      <div class="meta" style="text-align:center; padding:var(--space-xl)">
        Нет файлов. Загрузите файлы через панель слева.
      </div>
    `;
    // Очистить пейджер файлов если есть
    const pager = panelEl.querySelector('#filePagerAdmin');
    if (pager) pager.remove();
    return;
  }
  
  // Пагинация файлов
  const pageSize = getPageSize();
  const totalPages = Math.max(1, Math.ceil(allFiles.length / pageSize));
  if (filePage >= totalPages) filePage = totalPages - 1;
  const start = filePage * pageSize;
  const end = Math.min(start + pageSize, allFiles.length);
  const files = allFiles.slice(start, end);
  
  panelEl.innerHTML = `
    <ul class="list" style="display:grid; gap:var(--space-sm)">
      ${files.map(({ safeName, originalName, status, progress, canPlay, error, resolution }) => {
        // placeholders allowed only for image/video (no pdf/pptx)
        const isEligible = /\.(mp4|webm|ogg|mkv|mov|avi|mp3|wav|m4a|png|jpg|jpeg|gif|webp)$/i.test(safeName);
        const ext = safeName.split('.').pop().toLowerCase();
        const typeLabel = ext === 'pdf' ? 'PDF' : ext === 'pptx' ? 'PPTX' : ['png','jpg','jpeg','gif','webp'].includes(ext) ? 'IMG' : 'VID';
        
        // НОВОЕ: Определяем статус для видео
        const isVideo = ['mp4','webm','ogg','mkv','mov','avi'].includes(ext);
        const fileStatus = status || 'ready';
        const isProcessing = fileStatus === 'processing' || fileStatus === 'checking';
        const hasError = fileStatus === 'error';
        const fileProgress = progress || 100;
        
        // Определяем разрешение для видео
        let resolutionLabel = '';
        if (isVideo && resolution) {
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
        
        // Иконки статуса
        let statusIcon = '';
        let statusText = '';
        let statusColor = '';
        
        if (isVideo) {
          if (isProcessing) {
            statusIcon = '⏳';
            statusText = `Обработка... ${fileProgress}%`;
            statusColor = 'var(--warning)';
          } else if (hasError) {
            statusIcon = '✗';
            statusText = 'Ошибка обработки';
            statusColor = 'var(--danger)';
          } else if (fileStatus === 'ready') {
            statusIcon = '✓';
            statusText = 'Готов';
            statusColor = 'var(--success)';
          }
        }
        
        return `
          <li class="file-item" 
              draggable="${canPlay ? 'true' : 'false'}" 
              data-device-id="${deviceId}"
              data-file-name="${encodeURIComponent(safeName)}"
              style="border:var(--border); background:var(--panel-2); ${isProcessing ? 'opacity:0.7;' : ''} ${canPlay ? 'cursor:move;' : ''}">
            <div class="file-item-header">
              <div style="flex:1; display:flex; align-items:stretch; gap:var(--space-xs); min-width:0;">
                <span class="file-item-name fileName-editable" data-safe="${encodeURIComponent(safeName)}" style="cursor:pointer; padding:var(--space-xs) var(--space-sm); border-radius:var(--radius-sm); transition:all 0.2s; flex:1; min-width:0;" contenteditable="false">${originalName}</span>
                <button class="primary fileRenameSaveBtn" style="display:none; min-width:28px; width:28px; height:28px; padding:0; border-radius:var(--radius-sm); flex-shrink:0" title="Сохранить">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:block">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                </button>
              </div>
              <div style="display:flex; align-items:center; gap:var(--space-sm);">
                ${statusText ? `<span style="font-size:var(--font-size-sm); color:${statusColor}; white-space:nowrap; display:flex; align-items:center; gap:var(--space-xs);">${statusIcon} ${statusText}</span>` : ''}
                <div style="display:flex; align-items:center; gap:4px;">
                  ${resolutionLabel ? `<span style="font-size:10px; opacity:0.7;">${resolutionLabel}</span>` : ''}
                  <span class="file-item-type">${typeLabel}</span>
                </div>
              </div>
            </div>
            <div class="file-item-actions">
              <button class="secondary previewFileBtn" data-safe="${encodeURIComponent(safeName)}" data-original="${encodeURIComponent(originalName)}" title="Предпросмотр" ${!canPlay ? 'disabled' : ''}>Превью</button>
              ${isEligible ? `<button class="secondary makeDefaultBtn" data-safe="${encodeURIComponent(safeName)}" data-original="${encodeURIComponent(originalName)}" title="Сделать заглушкой" ${!canPlay ? 'disabled' : ''}>Заглушка</button>` : ``}
              <button class="danger delFileBtn" data-safe="${encodeURIComponent(safeName)}" data-original="${encodeURIComponent(originalName)}" title="Удалить">Удалить</button>
            </div>
          </li>
        `;
      }).join('')}
    </ul>
  `;
  
  // Рендер пейджера файлов
  let filePagerAdmin = panelEl.querySelector('#filePagerAdmin');
  if (!filePagerAdmin) {
    filePagerAdmin = document.createElement('div');
    filePagerAdmin.id = 'filePagerAdmin';
    filePagerAdmin.className = 'meta';
    filePagerAdmin.style.display = 'flex';
    filePagerAdmin.style.justifyContent = 'space-between';
    filePagerAdmin.style.alignItems = 'center';
    filePagerAdmin.style.gap = '8px';
    panelEl.appendChild(filePagerAdmin);
  }
  
  
  if (totalPages > 1) {
    filePagerAdmin.innerHTML = `
      <button class="secondary" id="filePrevAdmin" ${filePage<=0?'disabled':''} style="min-width:80px">Назад</button>
      <span style="white-space:nowrap">Стр. ${filePage+1} из ${totalPages}</span>
      <button class="secondary" id="fileNextAdmin" ${filePage>=totalPages-1?'disabled':''} style="min-width:80px">Вперёд</button>
    `;
    const prev = filePagerAdmin.querySelector('#filePrevAdmin');
    const next = filePagerAdmin.querySelector('#fileNextAdmin');
    if (prev) prev.onclick = () => { if (filePage>0) { filePage--; refreshFilesPanel(deviceId, panelEl); } };
    if (next) next.onclick = () => { if (filePage<totalPages-1) { filePage++; refreshFilesPanel(deviceId, panelEl); } };
  } else if (filePagerAdmin) {
    filePagerAdmin.innerHTML = '';
  }

  panelEl.querySelectorAll('.previewFileBtn').forEach(btn => {
    btn.onclick = () => {
      const safeName = decodeURIComponent(btn.getAttribute('data-safe'));
      const frame = document.querySelector('#detailPane iframe');
      if (frame) {
        // Определяем тип файла по расширению
        const ext = safeName.split('.').pop().toLowerCase();
        let u = `/player-videojs.html?device_id=${encodeURIComponent(deviceId)}&preview=1&muted=1&file=${encodeURIComponent(safeName)}`;
        
        // КРИТИЧНО: Для PPTX, PDF и изображений добавляем параметры type и page
        if (ext === 'pdf') {
          u += `&type=pdf&page=1`;
        } else if (ext === 'pptx') {
          u += `&type=pptx&page=1`;
        } else if (['png','jpg','jpeg','gif','webp'].includes(ext)) {
          u += `&type=image&page=1`;
        }
        
        // Добавляем timestamp для обхода кэша iframe
        u += `&t=${Date.now()}`;
        
        console.log('[Admin] 📋 Preview URL:', u);
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
        
        // КРИТИЧНО: Задержка перед обновлением UI
        // Даем серверу время скопировать файл и установить права
        // Preview iframe обновится через событие placeholder/refresh от сервера
        await new Promise(resolve => setTimeout(resolve, 600));
        
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
  
  // НОВОЕ: Drag & Drop для перемещения файлов между устройствами
  panelEl.querySelectorAll('.file-item[draggable="true"]').forEach(fileItem => {
    fileItem.addEventListener('dragstart', (e) => {
      const sourceDeviceId = fileItem.getAttribute('data-device-id');
      const fileName = decodeURIComponent(fileItem.getAttribute('data-file-name'));
      
      e.dataTransfer.effectAllowed = 'copyMove';
      e.dataTransfer.setData('text/plain', JSON.stringify({
        sourceDeviceId,
        fileName
      }));
      
      fileItem.style.opacity = '0.5';
      console.log(`[DragDrop] 🎬 Начало перетаскивания: ${fileName} (${sourceDeviceId})`);
    });
    
    fileItem.addEventListener('dragend', (e) => {
      fileItem.style.opacity = '1';
    });
  });
  
  // Переименование файлов - аналогично переименованию устройств
  panelEl.querySelectorAll('.fileName-editable').forEach(nameEl => {
    const fileItem = nameEl.closest('.file-item');
    const saveBtn = fileItem.querySelector('.fileRenameSaveBtn');
    let originalName = nameEl.textContent.trim();
    let isEditing = false;
    let savingFromButton = false;
    const safeName = decodeURIComponent(nameEl.getAttribute('data-safe'));
    
    nameEl.addEventListener('click', () => {
      if (!isEditing) {
        isEditing = true;
        originalName = nameEl.textContent.trim();
        nameEl.contentEditable = 'true';
        nameEl.style.background = 'var(--panel)';
        nameEl.style.border = 'var(--border)';
        nameEl.focus();
        
        // Выделяем весь текст
        const range = document.createRange();
        range.selectNodeContents(nameEl);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        
        if (saveBtn) saveBtn.style.display = 'flex';
      }
    });
    
    nameEl.addEventListener('blur', () => {
      if (isEditing && !savingFromButton) {
        const newName = nameEl.textContent.trim();
        if (newName && newName !== originalName) {
          saveFileName(newName);
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
          saveFileName(newName);
        } else {
          cancelEdit();
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cancelEdit();
      }
    });
    
    const saveFileName = async (newName) => {
      try {
        const response = await adminFetch(`/api/devices/${encodeURIComponent(deviceId)}/files/${encodeURIComponent(safeName)}/rename`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ newName })
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
          isEditing = false;
          nameEl.contentEditable = 'false';
          if (saveBtn) saveBtn.style.display = 'none';
          await refreshFilesPanel(deviceId, panelEl);
          socket.emit('devices/updated');
        } else {
          alert(`Ошибка переименования: ${data.error || 'Неизвестная ошибка'}`);
          cancelEdit();
        }
      } catch (err) {
        console.error('Failed to rename file:', err);
        alert('Не удалось переименовать файл');
        cancelEdit();
      }
    };
    
    const cancelEdit = () => {
      isEditing = false;
      nameEl.contentEditable = 'false';
      nameEl.textContent = originalName;
      nameEl.style.background = 'transparent';
      nameEl.style.border = 'none';
      if (saveBtn) saveBtn.style.display = 'none';
    };
    
    if (saveBtn) {
      saveBtn.addEventListener('mousedown', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        savingFromButton = true;
        const newName = nameEl.textContent.trim();
        if (newName && newName !== originalName) {
          await saveFileName(newName);
        } else {
          cancelEdit();
        }
      });
    }
  });
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
