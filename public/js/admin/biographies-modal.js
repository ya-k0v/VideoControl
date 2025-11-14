/**
 * Biography Module - Admin Management
 * Управление биографиями через админ панель
 */

import { adminFetch } from './auth.js';

let biographiesCache = [];

/**
 * Показать модальное окно со списком биографий
 */
export async function showBiographiesModal() {
  try {
    const response = await adminFetch('/api/biographies');
    const biographies = await response.json();
    
    console.log('[Biographies] Loaded:', biographies);
    
    biographiesCache = Array.isArray(biographies) ? biographies : [];
    
    const modalContent = document.createElement('div');
    modalContent.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
        <h2 style="margin:0;">Управление биографиями</h2>
        <button class="primary" id="addBioBtn">+ Добавить</button>
      </div>
      <div style="margin-bottom:16px;">
        <input id="bioSearch" class="input" placeholder="Поиск по ФИО..." style="width:100%;padding:10px 12px;font-size:1rem;"/>
      </div>
      <div id="bioList" style="display:grid;gap:16px;max-height:60vh;overflow-y:auto;"></div>
    `;
    
    showModalRaw(modalContent.innerHTML);
    
    renderBiographiesList(biographiesCache);
    
    const searchInput = document.getElementById('bioSearch');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        const term = e.target.value.trim().toLowerCase();
        const filtered = !term
          ? biographiesCache
          : biographiesCache.filter(bio => (bio.full_name || '').toLowerCase().includes(term));
        renderBiographiesList(filtered);
      });
    }
    
    // Обработчики после вставки в DOM
    document.getElementById('addBioBtn').onclick = () => showBioForm();
    
  } catch (error) {
    console.error('[Biographies] Error loading list:', error);
    alert('Ошибка загрузки биографий: ' + error.message);
  }
}

function renderBiographiesList(list) {
  const container = document.getElementById('bioList');
  if (!container) return;
  
  if (!list.length) {
    container.innerHTML = '<p style="color:var(--muted);text-align:center;padding:32px;">Ничего не найдено</p>';
    return;
  }
  
  container.innerHTML = list.map(renderBioCard).join('');
  
  list.forEach(bio => {
    const editBtn = document.getElementById(`edit-${bio.id}`);
    const deleteBtn = document.getElementById(`delete-${bio.id}`);
    if (editBtn) editBtn.onclick = () => openBiographyEditor(bio.id);
    if (deleteBtn) deleteBtn.onclick = () => deleteBio(bio.id);
  });
}

async function openBiographyEditor(id) {
  try {
    const response = await adminFetch(`/api/biographies/${id}`);
    const data = await response.json();
    showBioForm(data);
  } catch (error) {
    console.error('[Biographies] Error loading biography:', error);
    alert('Не удалось загрузить биографию');
  }
}

/**
 * Рендер карточки биографии
 */
function renderBioCard(bio) {
  return `
    <div style="display:grid;grid-template-columns:100px 1fr auto;gap:16px;padding:16px;border:1px solid var(--border);border-radius:var(--radius-md);background:var(--panel);">
      <img src="${bio.photo_base64 || '/icon.svg'}" 
           style="width:100px;height:130px;object-fit:cover;border-radius:var(--radius-sm);"
           onerror="this.src='/icon.svg'"/>
      <div>
        <div style="font-weight:600;margin-bottom:4px;font-size:1.0625rem;">${bio.full_name}</div>
        <div style="color:var(--muted);font-size:0.875rem;">
          ${bio.birth_year || '?'} - ${bio.death_year || 'н.в.'}
        </div>
        ${bio.rank ? `<div style="color:var(--muted);font-size:0.875rem;margin-top:2px;">${bio.rank}</div>` : ''}
      </div>
      <div style="display:flex;gap:8px;align-items:flex-start;">
        <button id="edit-${bio.id}" class="secondary" title="Редактировать">✏️</button>
        <button id="delete-${bio.id}" class="secondary" title="Удалить">🗑️</button>
      </div>
    </div>
  `;
}

/**
 * Показать форму добавления/редактирования
 */
function showBioForm(bio = null) {
  const formHTML = `
  <form id="biographyForm" onsubmit="return false;">
    <h2 style="margin:0 0 24px;font-size:1.5rem;">${bio ? 'Редактировать' : 'Добавить'} биографию</h2>
    
    <!-- Фото и основная информация -->
    <div style="display:grid;grid-template-columns:200px 1fr;gap:24px;margin-bottom:24px;">
      
      <!-- Левая часть: фото -->
      <div>
        <div id="photoPreview" style="
          width:200px;
          height:260px;
          border:2px dashed var(--border);
          border-radius:var(--radius-md);
          display:flex;
          align-items:center;
          justify-content:center;
          cursor:pointer;
          overflow:hidden;
          background:var(--panel-2);
          position:relative;
          transition:border-color 0.2s;
        " onclick="document.getElementById('photoInput').click()"></div>
        <input type="file" id="photoInput" accept="image/*" style="display:none;"/>
        <input type="hidden" name="photo_base64" value="${bio?.photo_base64 || ''}"/>
      </div>
      
      <!-- Правая часть: поля -->
      <div style="display:flex;flex-direction:column;gap:16px;">
        <div>
          <label style="display:block;margin-bottom:6px;font-weight:500;font-size:0.875rem;color:var(--muted);">ФИО *</label>
          <input name="full_name" value="${bio?.full_name || ''}" required 
                 placeholder="Иванов Иван Иванович"
                 style="width:100%;padding:10px 12px;font-size:1rem;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--panel);color:var(--text);"/>
        </div>
        
        <div>
          <label style="display:block;margin-bottom:6px;font-weight:500;font-size:0.875rem;color:var(--muted);">Звание</label>
          <input name="rank" value="${bio?.rank || ''}" 
                 placeholder="Гвардии старший лейтенант"
                 style="width:100%;padding:10px 12px;font-size:1rem;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--panel);color:var(--text);"/>
        </div>
        
        <div style="display:grid;grid-template-columns:1fr auto 1fr;gap:8px;align-items:end;">
          <div>
            <label style="display:block;margin-bottom:6px;font-weight:500;font-size:0.875rem;color:var(--muted);">Год рождения</label>
            <input name="birth_year" type="number" value="${bio?.birth_year || ''}" 
                   placeholder="1920"
                   min="1800" max="2100" 
                   style="width:100%;padding:10px 12px;font-size:1rem;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--panel);color:var(--text);"/>
          </div>
          <div style="padding:10px 0;color:var(--muted);font-size:1.25rem;">—</div>
          <div>
            <label style="display:block;margin-bottom:6px;font-weight:500;font-size:0.875rem;color:var(--muted);">Год смерти <span style="color:var(--muted);font-weight:400;">(н.в. если пусто)</span></label>
            <input name="death_year" type="number" value="${bio?.death_year || ''}" 
                   placeholder="н.в."
                   min="1800" max="2100" 
                   style="width:100%;padding:10px 12px;font-size:1rem;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--panel);color:var(--text);"/>
          </div>
        </div>
      </div>
    </div>
    
    <!-- Биография -->
    <div style="margin-bottom:24px;">
      <label style="display:block;margin-bottom:6px;font-weight:500;font-size:0.875rem;color:var(--muted);">Биография</label>
      <textarea name="biography" rows="8" 
                placeholder="Родился в... Участвовал в..."
                style="width:100%;padding:12px;font-size:1rem;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--panel);color:var(--text);font-family:inherit;resize:vertical;line-height:1.6;">${bio?.biography || ''}</textarea>
    </div>
    
    <!-- Дополнительные материалы -->
    <div style="border-top:1px solid var(--border);padding-top:24px;margin-bottom:24px;">
      <h3 style="margin:0 0 16px;font-size:1.125rem;">Дополнительные материалы</h3>
      <div id="mediaUploadArea" style="
        border:2px dashed var(--border);
        border-radius:var(--radius-md);
        padding:24px;
        text-align:center;
        background:var(--panel-2);
        cursor:pointer;
        transition:border-color 0.2s;
      " onclick="document.getElementById('mediaInput').click()">
        <div style="font-size:2rem;margin-bottom:8px;">📷 🎬</div>
        <div style="color:var(--text);margin-bottom:4px;">Добавить фото или видео</div>
        <div style="font-size:0.875rem;color:var(--muted);">Фото до 10MB, видео до 200MB</div>
        <input type="file" id="mediaInput" accept="image/*,video/*" multiple style="display:none;"/>
      </div>
      <div id="mediaList" style="margin-top:16px;display:grid;gap:12px;"></div>
    </div>
    
    <!-- Кнопки -->
    <div style="display:flex;gap:12px;justify-content:flex-end;">
      <button type="button" class="secondary" onclick="closeModal()">Отмена</button>
      <button type="submit" class="primary">💾 Сохранить</button>
    </div>
  </form>`;
  
  showModalRaw(formHTML);
  
  // Обработчики после вставки в DOM
  setTimeout(() => {
    const formElement = document.getElementById('biographyForm');
    const photoInput = document.getElementById('photoInput');
    const photoPreview = document.getElementById('photoPreview');
    const hiddenPhotoInput = document.querySelector('[name="photo_base64"]');
    const mediaInput = document.getElementById('mediaInput');
    const mediaList = document.getElementById('mediaList');
    
    let pendingMedia = Array.isArray(bio?.media)
      ? bio.media.map(item => ({
          id: item.id,
          type: item.type,
          media_base64: item.media_base64,
          caption: item.caption || '',
          existing: true
        }))
      : [];
    
    renderPhotoPreview(bio?.photo_base64 || null);
    renderMediaList();
    
    if (formElement) {
      formElement.onsubmit = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        console.log('[Biographies] Form submit triggered');
        
        const data = Object.fromEntries(new FormData(formElement));
        data.media = pendingMedia.map(item => ({
          type: item.type,
          media_base64: item.media_base64,
          caption: item.caption || ''
        }));
        
        try {
          let response;
          if (bio) {
            response = await adminFetch(`/api/biographies/${bio.id}`, { 
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(data) 
            });
          } else {
            response = await adminFetch('/api/biographies', { 
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(data) 
            });
          }
          
          const result = await response.json();
          console.log('[Biographies] Saved:', result);
          
          // Обновить список
          showBiographiesModal();
          
        } catch (err) {
          console.error('[Biographies] Save error:', err);
          alert('Ошибка сохранения: ' + err.message);
        }
      };
    }
    
    if (photoInput) {
      photoInput.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (file.size > 10 * 1024 * 1024) {
          alert('Фото слишком большое (максимум 10MB)');
          e.target.value = '';
          return;
        }
        const base64 = await fileToBase64(file);
        if (hiddenPhotoInput) hiddenPhotoInput.value = base64;
        renderPhotoPreview(base64);
        e.target.value = '';
      };
    }
    
    if (mediaInput) {
      mediaInput.onchange = async (e) => {
        const files = Array.from(e.target.files);
        for (const file of files) {
          const isVideo = file.type.startsWith('video');
          const limit = isVideo ? 200 * 1024 * 1024 : 10 * 1024 * 1024;
          if (file.size > limit) {
            alert(`Файл ${file.name} слишком большой (максимум ${isVideo ? '200MB' : '10MB'})`);
            continue;
          }
          const base64 = await fileToBase64(file);
          pendingMedia.push({
            id: `tmp-${Date.now()}-${Math.random()}`,
            type: isVideo ? 'video' : 'photo',
            media_base64: base64,
            caption: file.name.replace(/\.[^.]+$/, ''),
            existing: false
          });
        }
        renderMediaList();
        e.target.value = '';
      };
    }
    
    function renderPhotoPreview(base64) {
      if (!photoPreview) return;
      if (base64) {
        photoPreview.innerHTML = `
          <img src="${base64}" style="width:100%;height:100%;object-fit:cover;"/>
          <div style="position:absolute;bottom:8px;right:8px;background:var(--brand);color:white;width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:1.25rem;">✏️</div>
        `;
      } else {
        photoPreview.innerHTML = `
          <div style="text-align:center;color:var(--muted);">
            <div style="font-size:3rem;margin-bottom:8px;">+</div>
            <div style="font-size:0.875rem;">Добавить фото</div>
            <div style="font-size:0.75rem;margin-top:4px;">до 10MB</div>
          </div>
        `;
      }
    }

    function renderMediaList() {
      if (!mediaList) return;
      if (!pendingMedia.length) {
        mediaList.innerHTML = '<p style="color:var(--muted);text-align:center;">Материалы не добавлены</p>';
        return;
      }
      mediaList.innerHTML = pendingMedia.map((item, index) => `
        <div class="media-card" data-index="${index}" style="display:flex;gap:12px;padding:12px;border:1px solid var(--border);border-radius:var(--radius-md);background:var(--panel);align-items:center;">
          <div style="width:80px;height:60px;border-radius:var(--radius-sm);overflow:hidden;background:var(--panel-2);display:flex;align-items:center;justify-content:center;">
            ${item.type === 'photo'
              ? `<img src="${item.media_base64}" style="width:100%;height:100%;object-fit:cover;"/>`
              : `<video src="${item.media_base64}" style="width:100%;height:100%;object-fit:cover;" muted></video>`}
          </div>
          <div style="flex:1;display:flex;flex-direction:column;gap:4px;">
            <input type="text" data-caption="${index}" value="${item.caption || ''}" placeholder="Описание"
                   style="width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--panel-2);color:var(--text);" ${item.existing ? 'readonly' : ''}/>
            <div style="font-size:0.75rem;color:var(--muted);">${item.type === 'photo' ? 'Фото' : 'Видео'} ${item.existing ? '(существующее)' : ''}</div>
          </div>
          ${item.existing ? '' : `<button class="secondary" data-remove="${index}" title="Удалить" style="min-width:auto;padding:8px;">🗑️</button>`}
        </div>
      `).join('');

      mediaList.querySelectorAll('input[data-caption]').forEach(input => {
        input.addEventListener('input', (e) => {
          const idx = Number(e.target.dataset.caption);
          pendingMedia[idx].caption = e.target.value;
        });
      });

      mediaList.querySelectorAll('button[data-remove]').forEach(btn => {
        btn.addEventListener('click', () => {
          const idx = Number(btn.dataset.remove);
          pendingMedia.splice(idx, 1);
          renderMediaList();
        });
      });
    }
  }, 100);
}

/**
 * Удалить биографию
 */
async function deleteBio(id) {
  if (!confirm('Удалить биографию? Это действие необратимо.')) return;
  
  try {
    const response = await adminFetch(`/api/biographies/${id}`, { method: 'DELETE' });
    const result = await response.json();
    console.log('[Biographies] Deleted:', result);
    showBiographiesModal();
  } catch (error) {
    console.error('[Biographies] Delete error:', error);
    alert('Ошибка удаления');
  }
}

/**
 * Конвертация файла в base64
 */
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Показать модальное окно (без заголовка)
 */
function showModalRaw(content) {
  const overlay = document.getElementById('modalOverlay');
  const modalContent = document.getElementById('modalContent');
  
  if (!overlay || !modalContent) {
    console.error('[Biographies] Modal elements not found');
    return;
  }
  
  modalContent.innerHTML = content;
  overlay.style.display = 'flex';
  
  // Закрытие по клику на overlay
  overlay.onclick = (e) => {
    if (e.target === overlay) {
      closeModalLocal();
    }
  };
}

/**
 * Закрыть модальное окно
 */
function closeModalLocal() {
  const overlay = document.getElementById('modalOverlay');
  if (overlay) {
    overlay.style.display = 'none';
  }
}

// Глобальный доступ для кнопок
window.closeModal = closeModalLocal;

console.log('[Biographies] ✅ Admin module loaded');

