// upload-ui.js - ПОЛНЫЙ код setupUploadUI из admin.js
import { setXhrAuth, adminFetch } from './auth.js';
import { calculateFileMD5 } from './md5-helper.js';

export function setupUploadUI(card, deviceId, filesPanelEl, renderFilesPane, socket) {
  const dropZone = card.querySelector('.dropZone');
  const fileInput = card.querySelector('.fileInput');
  const folderInput = card.querySelector('.folderInput');
  const pickBtn = card.querySelector('.pickBtn');
  const pickFolderBtn = card.querySelector('.pickFolderBtn');
  const clearBtn = card.querySelector('.clearBtn');
  const uploadBtn = card.querySelector('.uploadBtn');
  const queue = card.querySelector('.queue');
  if (!fileInput || !pickBtn || !clearBtn || !uploadBtn || !queue) return;

  let pending = [];
  let folderName = null; // Имя выбранной папки
  const allowed = /\.(mp4|webm|ogg|mkv|mov|avi|mp3|wav|m4a|png|jpg|jpeg|gif|webp|pdf|pptx|zip)$/i;
  const imageExtensions = /\.(png|jpg|jpeg|gif|webp)$/i;
  const MAX_FILE_SIZE = 5 * 1024 * 1024 * 1024; // 5GB

  function renderQueue() {
    if (!pending.length) { 
      queue.innerHTML = ''; 
      folderName = null;
      return; 
    }
    
    // Если это папка с изображениями, показываем специальное сообщение
    if (folderName) {
      const imageCount = pending.filter(f => imageExtensions.test(f.name)).length;
      const totalSize = pending.reduce((sum, f) => sum + f.size, 0);
      queue.innerHTML = `
        <li style="display:flex; justify-content:space-between; align-items:center; padding:8px; background:var(--panel-2); border-radius:var(--radius-sm)">
          <span>📁 <strong>${folderName}</strong> <span class="meta">(${imageCount} изображений, ${(totalSize/1024/1024).toFixed(2)} MB)</span></span>
          <span class="meta" id="p_${deviceId}_folder">0%</span>
        </li>
      `;
    } else {
      queue.innerHTML = pending.map((f,i) => `
        <li style="display:flex; justify-content:space-between; align-items:center; padding:6px 0">
          <span>${f.name} <span class="meta">(${(f.size/1024/1024).toFixed(2)} MB)</span></span>
          <span class="meta" id="p_${deviceId}_${i}">0%</span>
        </li>
      `).join('');
    }
  }

  function addToQueue(files) {
    const rejected = [];
    for (const f of files) {
      // Проверка расширения
      if (!allowed.test(f.name)) {
        rejected.push({ name: f.name, reason: 'Неподдерживаемый формат' });
        continue;
      }
      
      // Проверка размера файла
      if (f.size > MAX_FILE_SIZE) {
        rejected.push({ 
          name: f.name, 
          reason: `Размер ${(f.size/1024/1024/1024).toFixed(2)} GB превышает лимит 5 GB` 
        });
        continue;
      }
      
      pending.push(f);
    }
    
    // Показываем предупреждение о отклоненных файлах
    if (rejected.length > 0) {
      const messages = rejected.map(r => `• ${r.name}\n  ${r.reason}`).join('\n\n');
      alert(`⚠️ Следующие файлы не были добавлены:\n\n${messages}`);
    }
    
    renderQueue();
  }

  pickBtn.onclick = () => fileInput.click();
  pickFolderBtn.onclick = () => {
    if (folderInput) {
      folderInput.click();
    }
  };
  clearBtn.onclick = () => { 
    pending = []; 
    folderName = null;
    renderQueue(); 
  };
  fileInput.onchange = e => { 
    folderName = null; // Сбрасываем режим папки
    addToQueue(Array.from(e.target.files || [])); 
    fileInput.value=''; 
  };
  
  // Обработка выбора папки
  if (folderInput) {
    folderInput.onchange = e => {
      const files = Array.from(e.target.files || []);
      if (files.length === 0) return;
      
      // Фильтруем только изображения
      const imageFiles = files.filter(f => imageExtensions.test(f.name));
      
      if (imageFiles.length === 0) {
        alert('В выбранной папке нет изображений! Поддерживаются форматы: PNG, JPG, JPEG, GIF, WEBP');
        folderInput.value = '';
        return;
      }
      
      // Определяем имя папки из первого файла
      // webkitRelativePath имеет формат "folder/subfolder/file.jpg"
      const firstFile = imageFiles[0];
      if (firstFile.webkitRelativePath) {
        const pathParts = firstFile.webkitRelativePath.split('/');
        folderName = pathParts[0]; // Имя корневой папки
      } else {
        folderName = 'uploaded_folder';
      }
      
      // Проверка размера файлов в папке
      const rejected = [];
      const validFiles = [];
      for (const f of imageFiles) {
        if (f.size > MAX_FILE_SIZE) {
          rejected.push({ 
            name: f.name, 
            reason: `Размер ${(f.size/1024/1024/1024).toFixed(2)} GB превышает лимит 5 GB` 
          });
        } else {
          validFiles.push(f);
        }
      }
      
      if (rejected.length > 0) {
        const messages = rejected.map(r => `• ${r.name}\n  ${r.reason}`).join('\n\n');
        alert(`⚠️ Следующие файлы из папки не будут загружены:\n\n${messages}`);
      }
      
      if (validFiles.length === 0) {
        alert('❌ Нет файлов для загрузки (все файлы превышают лимит 5 GB)');
        folderInput.value = '';
        return;
      }
      
      pending = validFiles;
      renderQueue();
      folderInput.value = '';
    };
  }

  if (dropZone) {
    ['dragenter','dragover','dragleave','drop'].forEach(ev => {
      dropZone.addEventListener(ev, e => { e.preventDefault(); e.stopPropagation(); });
    });
    dropZone.addEventListener('dragenter', () => dropZone.classList.add('hover'));
    dropZone.addEventListener('dragover', () => dropZone.classList.add('hover'));
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('hover'));
    dropZone.addEventListener('drop', async e => {
      dropZone.classList.remove('hover');
      const dt = e.dataTransfer;
      if (!dt) return;
      
      const items = dt.items;
      if (items && items.length > 0) {
        // Проверяем, есть ли папки в перетаскиваемых элементах
        let hasFolder = false;
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          if (item.kind === 'file') {
            const entry = item.webkitGetAsEntry?.() || item.getAsEntry?.();
            if (entry && entry.isDirectory) {
              hasFolder = true;
              // Обрабатываем первую найденную папку с изображениями
              const files = await readDirectoryRecursive(entry);
              const imageFiles = files.filter(f => imageExtensions.test(f.name));
              
              if (imageFiles.length > 0) {
                folderName = entry.name;
                
                // Проверка размера файлов в папке
                const rejected = [];
                const validFiles = [];
                for (const f of imageFiles) {
                  if (f.size > MAX_FILE_SIZE) {
                    rejected.push({ 
                      name: f.name, 
                      reason: `Размер ${(f.size/1024/1024/1024).toFixed(2)} GB превышает лимит 5 GB` 
                    });
                  } else {
                    validFiles.push(f);
                  }
                }
                
                if (rejected.length > 0) {
                  const messages = rejected.map(r => `• ${r.name}\n  ${r.reason}`).join('\n\n');
                  alert(`⚠️ Следующие файлы из папки не будут загружены:\n\n${messages}`);
                }
                
                if (validFiles.length === 0) {
                  alert('❌ Нет файлов для загрузки (все файлы превышают лимит 5 GB)');
                  return;
                }
                
                pending = validFiles;
                renderQueue();
                return;
              }
            }
          }
        }
      }
      
      // Если папок не было, обрабатываем как обычные файлы
      folderName = null;
      addToQueue(Array.from(dt.files || []));
    });
  }
  
  // Рекурсивное чтение папки
  async function readDirectoryRecursive(dirEntry) {
    const files = [];
    const reader = dirEntry.createReader();
    
    const readEntries = () => new Promise((resolve, reject) => {
      reader.readEntries((entries) => resolve(entries), (error) => reject(error));
    });
    
    let entries = await readEntries();
    while (entries.length > 0) {
      for (const entry of entries) {
        if (entry.isFile) {
          const file = await new Promise((resolve, reject) => {
            entry.file((file) => resolve(file), (error) => reject(error));
          });
          files.push(file);
        } else if (entry.isDirectory) {
          const subFiles = await readDirectoryRecursive(entry);
          files.push(...subFiles);
        }
      }
      entries = await readEntries();
    }
    
    return files;
  }

  uploadBtn.onclick = async () => {
    if (!pending.length) return;
    
    uploadBtn.disabled = true;
    uploadBtn.textContent = 'Проверка...';
    
    try {
      // STEP 1: Проверяем дубликаты ДО загрузки (экономим трафик!)
      const filesToUpload = [];
      const duplicates = [];
      const fileIndexMap = new Map(); // Маппинг файл → индекс в pending
      
      for (let i = 0; i < pending.length; i++) {
        const file = pending[i];
        const progressEl = queue.querySelector(`#p_${deviceId}_${i}`);
        fileIndexMap.set(file, i); // Запоминаем индекс
        
        console.log(`[Upload] Processing file ${i+1}/${pending.length}: ${file.name} (${(file.size/1024/1024).toFixed(2)} MB)`);
        
        // Вычисляем MD5 (первые 10MB для больших файлов)
        if (progressEl) progressEl.textContent = 'MD5...';
        const startTime = Date.now();
        const md5 = await calculateFileMD5(file, (progress) => {
          if (progressEl) progressEl.textContent = `MD5: ${progress}%`;
        });
        const md5Time = Date.now() - startTime;
        
        console.log(`[Upload] MD5 calculated in ${md5Time}ms: ${md5} (file: ${file.name})`);
        
        // Проверяем дубликат на сервере
        if (progressEl) progressEl.textContent = 'Проверка...';
        console.log(`[Upload] Checking duplicate: md5=${md5}, size=${file.size}`);
        
        const checkRes = await adminFetch(`/api/devices/${encodeURIComponent(deviceId)}/check-duplicate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            md5, 
            size: file.size, 
            filename: file.name 
          })
        });
        
        const checkData = await checkRes.json();
        console.log(`[Upload] Server response:`, checkData);
        
        if (checkData.duplicate) {
          // Дубликат найден! Копируем с другого устройства
          if (progressEl) progressEl.textContent = 'Копирование...';
          
          const copyRes = await adminFetch(`/api/devices/${encodeURIComponent(deviceId)}/copy-from-duplicate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sourceDevice: checkData.sourceDevice,
              sourceFile: checkData.sourceFile,
              targetFilename: file.name,
              originalName: file.name,
              md5,
              size: file.size
            })
          });
          
          const copyData = await copyRes.json();
          
          if (copyData.ok) {
            duplicates.push({
              name: file.name,
              from: checkData.sourceDevice,
              savedMB: copyData.savedTrafficMB
            });
            if (progressEl) progressEl.textContent = '✅ Скопирован';
          }
        } else {
          // Уникальный файл - добавляем в очередь загрузки
          filesToUpload.push(file);
          if (progressEl) progressEl.textContent = '0%';
        }
      }
      
      // STEP 2: Загружаем только уникальные файлы
      if (filesToUpload.length > 0) {
        uploadBtn.textContent = `Загрузка (${filesToUpload.length})...`;
        
        const form = new FormData();
        
        // Если это папка, добавляем метаданные
        if (folderName) {
          form.append('folderName', folderName);
          filesToUpload.forEach(f => {
            const relativePath = f.webkitRelativePath || f.name;
            form.append('files', f, relativePath);
          });
        } else {
          filesToUpload.forEach(f => form.append('files', f));
        }

        await new Promise((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open('POST', `/api/devices/${encodeURIComponent(deviceId)}/upload`);
          setXhrAuth(xhr);
          xhr.upload.onprogress = e => {
            if (!e.lengthComputable) return;
            const percent = Math.round((e.loaded / e.total) * 100);
            if (folderName) {
              const el = queue.querySelector(`#p_${deviceId}_folder`);
              if (el) el.textContent = `${percent}%`;
            } else {
              // Обновляем только для файлов которые грузятся
              filesToUpload.forEach((f) => {
                const origIdx = fileIndexMap.get(f);
                const el = queue.querySelector(`#p_${deviceId}_${origIdx}`);
                if (el) el.textContent = `${percent}%`;
              });
            }
          };
          xhr.onload = () => xhr.status<300 ? resolve() : reject(new Error(xhr.statusText));
          xhr.onerror = () => reject(new Error('Network error'));
          xhr.send(form);
        });
      }
      
      // STEP 3: Показываем сводку дедупликации
      if (duplicates.length > 0) {
        const totalSavedMB = duplicates.reduce((sum, d) => sum + parseFloat(d.savedMB), 0);
        const message = duplicates.map(d => 
          `✅ ${d.name}\n   Скопирован с ${d.from} (${d.savedMB} MB)`
        ).join('\n\n');
      }
      
      pending = [];
      folderName = null;
      renderQueue();
      
      // После загрузки — обновить правую колонку файлов
      await renderFilesPane(deviceId);
      socket.emit('devices/updated');
      
    } catch (error) {
      console.error('[Upload] Error:', error);
      alert(`❌ Ошибка загрузки: ${error.message}`);
    } finally {
      uploadBtn.disabled = false;
      uploadBtn.textContent = 'Загрузить';
    }
  };
}

