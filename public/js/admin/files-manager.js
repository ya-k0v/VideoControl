// files-manager.js - ПОЛНЫЙ код управления файлами из admin.js
import { adminFetch } from './auth.js';

export async function loadFilesWithStatus(deviceId) {
  const res = await adminFetch(`/api/devices/${deviceId}/files-with-status`);
  return await res.json();
}

export async function refreshFilesPanel(deviceId, panelEl, adminFetch, getPageSize, filePage, socket) {
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