// upload-ui.js - ПОЛНЫЙ код setupUploadUI из admin.js
import { setXhrAuth } from './auth.js';

export function setupUploadUI(card, deviceId, filesPanelEl, renderFilesPane, socket) {
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

