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
    <h2 style="margin:0 0 20px;">${bio ? 'Редактировать' : 'Добавить'} биографию</h2>
    
    <label style="display:block;margin-bottom:8px;font-weight:500;">ФИО *</label>
    <input name="full_name" value="${bio?.full_name || ''}" required 
           style="width:100%;margin-bottom:16px;"/>
    
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;">
      <div>
        <label style="display:block;margin-bottom:8px;font-weight:500;">Год рождения</label>
        <input name="birth_year" type="number" value="${bio?.birth_year || ''}" 
               min="1800" max="2100" style="width:100%;"/>
      </div>
      <div>
        <label style="display:block;margin-bottom:8px;font-weight:500;">Год смерти</label>
        <input name="death_year" type="number" value="${bio?.death_year || ''}" 
               min="1800" max="2100" style="width:100%;"/>
      </div>
    </div>
    
    <label style="display:block;margin-bottom:8px;font-weight:500;">Звание</label>
    <input name="rank" value="${bio?.rank || ''}" 
           style="width:100%;margin-bottom:16px;"/>
    
    <label style="display:block;margin-bottom:8px;font-weight:500;">Фото</label>
    <input type="file" id="photoInput" accept="image/*" style="margin-bottom:8px;"/>
    <input type="hidden" name="photo_base64" value="${bio?.photo_base64 || ''}"/>
    ${bio?.photo_base64 ? `
      <div style="margin-bottom:16px;">
        <img src="${bio.photo_base64}" style="width:200px;height:auto;border-radius:var(--radius-sm);"/>
      </div>
    ` : ''}
    
    <label style="display:block;margin-bottom:8px;font-weight:500;">Биография</label>
    <textarea name="biography" rows="10" 
              style="width:100%;margin-bottom:16px;font-family:inherit;resize:vertical;">${bio?.biography || ''}</textarea>
    
    <div style="display:flex;gap:12px;margin-top:16px;">
      <button type="submit" class="primary">Сохранить</button>
      <button type="button" class="secondary" onclick="closeModal()">Отмена</button>
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

