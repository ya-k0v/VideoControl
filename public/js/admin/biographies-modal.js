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
    const biographies = await adminFetch('/api/biographies');
    
    const modalContent = document.createElement('div');
    modalContent.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
        <h2 style="margin:0;">Управление биографиями</h2>
        <button class="primary" id="addBioBtn">+ Добавить</button>
      </div>
      <div id="bioList" style="display:grid;gap:16px;max-height:60vh;overflow-y:auto;">
        ${biographies.length > 0 
          ? biographies.map(renderBioCard).join('') 
          : '<p style="color:var(--muted);text-align:center;padding:32px;">Биографий пока нет</p>'}
      </div>
    `;
    
    showModal(modalContent.innerHTML);
    
    // Обработчики после вставки в DOM
    document.getElementById('addBioBtn').onclick = () => showBioForm();
    
    biographies.forEach(bio => {
      document.getElementById(`edit-${bio.id}`).onclick = () => showBioForm(bio);
      document.getElementById(`delete-${bio.id}`).onclick = () => deleteBio(bio.id);
    });
    
  } catch (error) {
    console.error('[Biographies] Error loading list:', error);
    alert('Ошибка загрузки биографий');
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
  const form = document.createElement('form');
  form.innerHTML = `
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
  `;
  
  form.onsubmit = async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    
    try {
      if (bio) {
        await adminFetch(`/api/biographies/${bio.id}`, { 
          method: 'PUT', 
          body: JSON.stringify(data) 
        });
      } else {
        await adminFetch('/api/biographies', { 
          method: 'POST', 
          body: JSON.stringify(data) 
        });
      }
      
      // Обновить список
      showBiographiesModal();
      
    } catch (err) {
      console.error('[Biographies] Save error:', err);
      alert('Ошибка сохранения: ' + err.message);
    }
  };
  
  showModal(form.outerHTML);
  
  // Обработчик загрузки фото после вставки в DOM
  setTimeout(() => {
    const photoInput = document.getElementById('photoInput');
    if (photoInput) {
      photoInput.onchange = async (e) => {
        const file = e.target.files[0];
        if (file) {
          // Проверка размера (5GB)
          if (file.size > 5 * 1024 * 1024 * 1024) {
            alert('Файл слишком большой (максимум 5GB)');
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
    await adminFetch(`/api/biographies/${id}`, { method: 'DELETE' });
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
 * Показать модальное окно
 */
function showModal(content) {
  const overlay = document.getElementById('modalOverlay');
  const modalContent = document.getElementById('modalContent');
  
  if (!overlay || !modalContent) {
    console.error('[Biographies] Modal elements not found');
    return;
  }
  
  modalContent.innerHTML = content;
  overlay.style.display = 'flex';
}

/**
 * Закрыть модальное окно
 */
function closeModal() {
  const overlay = document.getElementById('modalOverlay');
  if (overlay) {
    overlay.style.display = 'none';
  }
}

// Глобальный доступ для кнопок
window.closeModal = closeModal;

console.log('[Biographies] ✅ Admin module loaded');

