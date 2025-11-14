/**
 * Biography Module - Admin Management
 * Управление биографиями через админ панель
 */

import { adminFetch } from './auth.js';

/**
 * Показать модальное окно со списком биографий
 */
export async function showBiographiesModal() {
  try {
    const response = await adminFetch('/api/biographies');
    const biographies = await response.json();
    
    console.log('[Biographies] Loaded:', biographies);
    
    const modalContent = document.createElement('div');
    modalContent.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
        <h2 style="margin:0;">Управление биографиями</h2>
        <button class="primary" id="addBioBtn">+ Добавить</button>
      </div>
      <div id="bioList" style="display:grid;gap:16px;max-height:60vh;overflow-y:auto;">
        ${Array.isArray(biographies) && biographies.length > 0 
          ? biographies.map(renderBioCard).join('') 
          : '<p style="color:var(--muted);text-align:center;padding:32px;">Биографий пока нет</p>'}
      </div>
    `;
    
    showModalRaw(modalContent.innerHTML);
    
    // Обработчики после вставки в DOM
    document.getElementById('addBioBtn').onclick = () => showBioForm();
    
    if (Array.isArray(biographies)) {
      biographies.forEach(bio => {
        const editBtn = document.getElementById(`edit-${bio.id}`);
        const deleteBtn = document.getElementById(`delete-${bio.id}`);
        if (editBtn) editBtn.onclick = () => showBioForm(bio);
        if (deleteBtn) deleteBtn.onclick = () => deleteBio(bio.id);
      });
    }
    
  } catch (error) {
    console.error('[Biographies] Error loading list:', error);
    alert('Ошибка загрузки биографий: ' + error.message);
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
        " onclick="document.getElementById('photoInput').click()">
          ${bio?.photo_base64 ? `
            <img src="${bio.photo_base64}" style="width:100%;height:100%;object-fit:cover;"/>
            <div style="position:absolute;bottom:8px;right:8px;background:var(--brand);color:white;width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:1.25rem;">✏️</div>
          ` : `
            <div style="text-align:center;color:var(--muted);">
              <div style="font-size:3rem;margin-bottom:8px;">+</div>
              <div style="font-size:0.875rem;">Добавить фото</div>
              <div style="font-size:0.75rem;margin-top:4px;">до 1GB</div>
            </div>
          `}
        </div>
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
        <div style="font-size:0.875rem;color:var(--muted);">Нажмите для выбора файлов (до 1GB каждый)</div>
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
    
    console.log('[Biographies] Form element:', formElement);
    
    if (formElement) {
      formElement.onsubmit = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        console.log('[Biographies] Form submit triggered');
        
        const data = Object.fromEntries(new FormData(formElement));
        
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
        if (file) {
          // Проверка размера (1GB)
          if (file.size > 1024 * 1024 * 1024) {
            alert('Файл слишком большой (максимум 1GB)');
            e.target.value = '';
            return;
          }
          
          const base64 = await fileToBase64(file);
          const hiddenInput = document.querySelector('[name="photo_base64"]');
          if (hiddenInput) {
            hiddenInput.value = base64;
          }
        }
      };
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

