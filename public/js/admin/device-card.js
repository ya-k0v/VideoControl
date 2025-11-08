// device-card.js - ПОЛНЫЙ код renderDeviceCard из admin.js
import { DEVICE_ICONS, DEVICE_TYPE_NAMES } from '../shared/constants.js';
import { adminFetch } from './auth.js';
import { clearDetail, clearFilesPane } from './ui-helpers.js';

export function renderDeviceCard(d, nodeNames, readyDevices, loadDevices, renderTVList, openDevice, setupUploadUI) {
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
      <div class="meta" style="margin-top:var(--space-xs); margin-bottom:0">
        ${DEVICE_ICONS[d.deviceType] || '📺'} <strong>${DEVICE_TYPE_NAMES[d.deviceType] || d.deviceType || 'Browser'}</strong>
        ${d.platform && d.platform !== 'Unknown' ? `• ${d.platform}` : ''}
        • ID: ${d.device_id}
        • Файлов: ${d.files?.length || 0}
        • ${readyDevices.has(d.device_id) ? '✓ Готов' : '✗ Не готов'}
      </div>
    </div>

    <div style="display:flex; flex-wrap:wrap; gap:var(--space-sm); align-items:center; margin-top:var(--space-md)">
      <button class="secondary playerBtn" style="flex:1; min-width:90px">Плеер</button>
      <button class="secondary speakerBtn" style="flex:1; min-width:90px">Спикер</button>
      <button class="danger delBtn" style="flex:1; min-width:90px">Удалить</button>
    </div>

    <div class="preview panel" style="margin-top:var(--space-md); display:block; flex:1 1 auto; min-height:0; aspect-ratio:16/9; max-height:380px">
      <div class="previewHolder" style="width:100%; height:100%; background:rgba(0,0,0,.06); border-radius:var(--radius-md); overflow:hidden">
        <iframe src="/player-videojs.html?device_id=${did}&preview=1&muted=1" style="width:100%; height:100%; border:0"></iframe>
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
  card.querySelector('.playerBtn').onclick = () => window.open(`/player-videojs.html?device_id=${did}`, '_blank');
  card.querySelector('.speakerBtn').onclick = () => window.open(`/speaker.html`, '_blank');
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
  let savingFromButton = false;

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
      saveBtn.addEventListener('mousedown', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        savingFromButton = true;
        const newName = nameEl.textContent.trim();
        if (newName && newName !== originalName) {
          await saveName(newName);
        } else {
          cancelEdit();
        }
      });
    }
  }

  // Инициализация загрузки
  setupUploadUI(card, d.device_id, document.getElementById('filesPanel'));

  return card;
}

