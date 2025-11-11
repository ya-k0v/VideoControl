/**
 * Модальные окна для admin панели
 * @module admin/modal
 */

export function showModal(title, content) {
  const overlay = document.getElementById('modalOverlay');
  const modalContent = document.getElementById('modalContent');
  
  if (!overlay || !modalContent) return;
  
  modalContent.innerHTML = `
    <div class="header" style="display:flex; justify-content:space-between; align-items:center;">
      <div class="title">${title}</div>
      <button class="secondary" onclick="closeModal()" style="min-width:auto; padding:8px;">✕</button>
    </div>
    <div style="margin-top:var(--space-md);">
      ${content}
    </div>
  `;
  
  overlay.style.display = 'flex';
  
  // Закрытие по клику на overlay
  overlay.onclick = (e) => {
    if (e.target === overlay) {
      closeModal();
    }
  };
  
  // Закрытие по ESC
  const escHandler = (e) => {
    if (e.key === 'Escape') {
      closeModal();
      document.removeEventListener('keydown', escHandler);
    }
  };
  document.addEventListener('keydown', escHandler);
}

export function closeModal() {
  const overlay = document.getElementById('modalOverlay');
  if (overlay) {
    overlay.style.display = 'none';
  }
}

// Глобальная функция для onclick
window.closeModal = closeModal;

export function showDevicesModal(adminFetch, loadDevices, renderTVList, openDevice, renderFilesPane) {
  const content = `
    <div style="display:flex; flex-direction:column; gap:var(--space-md);">
      <div>
        <label style="display:block; margin-bottom:4px; font-weight:500;">ID устройства</label>
        <input id="modalDeviceId" class="input" placeholder="tv-001" required />
      </div>
      
      <div>
        <label style="display:block; margin-bottom:4px; font-weight:500;">Имя устройства</label>
        <input id="modalDeviceName" class="input" placeholder="Living Room TV" />
      </div>
      
      <div id="modalError" style="color:var(--danger); font-size:0.875rem; display:none;"></div>
      
      <button id="modalCreateDevice" class="primary" style="width:100%;">Создать устройство</button>
    </div>
  `;
  
  showModal('📱 Новое устройство', content);
  
  // Обработчики
  setTimeout(() => {
    const deviceIdInput = document.getElementById('modalDeviceId');
    const deviceNameInput = document.getElementById('modalDeviceName');
    const createBtn = document.getElementById('modalCreateDevice');
    const errorEl = document.getElementById('modalError');
    
    if (!deviceIdInput || !createBtn) return;
    
    const doCreate = async () => {
      const device_id = deviceIdInput.value.trim();
      const name = deviceNameInput.value.trim();
      
      if (!device_id) {
        errorEl.textContent = 'Введите ID устройства';
        errorEl.style.display = 'block';
        return;
      }
      
      createBtn.disabled = true;
      createBtn.textContent = 'Создание...';
      errorEl.style.display = 'none';
      
      try {
        const res = await adminFetch('/api/devices', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ device_id, name })
        });
        
        if (res.ok) {
          closeModal();
          await loadDevices();
          renderTVList();
          openDevice(device_id);
          renderFilesPane(device_id);
        } else {
          const error = await res.json();
          errorEl.textContent = error.error || 'Ошибка создания';
          errorEl.style.display = 'block';
          createBtn.disabled = false;
          createBtn.textContent = 'Создать устройство';
        }
      } catch (err) {
        errorEl.textContent = 'Ошибка подключения';
        errorEl.style.display = 'block';
        createBtn.disabled = false;
        createBtn.textContent = 'Создать устройство';
      }
    };
    
    createBtn.onclick = doCreate;
    deviceIdInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') doCreate(); });
    deviceNameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') doCreate(); });
    deviceIdInput.focus();
  }, 100);
}

export async function showUsersModal(adminFetch) {
  const content = `
    <div style="display:flex; flex-direction:column; gap:var(--space-lg);">
      <!-- Форма создания пользователя -->
      <div style="padding:var(--space-md); background:var(--panel-2); border-radius:var(--radius-sm);">
        <div style="margin-bottom:var(--space-md); font-weight:600;">Создать пользователя</div>
        <div style="display:flex; flex-direction:column; gap:var(--space-sm);">
          <input id="modalUsername" class="input" placeholder="Логин" />
          <input id="modalFullName" class="input" placeholder="ФИО" />
          <input id="modalPassword" class="input" type="password" placeholder="Пароль (мин. 8 символов)" />
          <select id="modalRole" class="input">
            <option value="speaker">Speaker (управление контентом)</option>
            <option value="admin">Admin (полный доступ)</option>
          </select>
          <div id="modalUserError" style="color:var(--danger); font-size:0.875rem; display:none;"></div>
          <button id="modalCreateUser" class="primary">Создать пользователя</button>
        </div>
      </div>
      
      <!-- Список пользователей -->
      <div>
        <div style="margin-bottom:var(--space-md); font-weight:600;">Список пользователей</div>
        <div id="modalUsersList" style="display:flex; flex-direction:column; gap:var(--space-sm);">
          <div class="meta" style="text-align:center; padding:var(--space-lg);">Загрузка...</div>
        </div>
      </div>
    </div>
  `;
  
  showModal('👥 Управление пользователями', content);
  
  // Загружаем список пользователей
  setTimeout(() => loadModalUsersList(adminFetch), 100);
  
  // Обработчик создания
  setTimeout(() => {
    const usernameInput = document.getElementById('modalUsername');
    const fullNameInput = document.getElementById('modalFullName');
    const passwordInput = document.getElementById('modalPassword');
    const roleSelect = document.getElementById('modalRole');
    const createBtn = document.getElementById('modalCreateUser');
    const errorEl = document.getElementById('modalUserError');
    
    if (!createBtn) return;
    
    const doCreate = async () => {
      const username = usernameInput.value.trim();
      const full_name = fullNameInput.value.trim();
      const password = passwordInput.value;
      const role = roleSelect.value;
      
      if (!username || !full_name || !password) {
        errorEl.textContent = 'Заполните все поля';
        errorEl.style.display = 'block';
        return;
      }
      
      if (password.length < 8) {
        errorEl.textContent = 'Пароль минимум 8 символов';
        errorEl.style.display = 'block';
        return;
      }
      
      createBtn.disabled = true;
      createBtn.textContent = 'Создание...';
      errorEl.style.display = 'none';
      
      try {
        const res = await adminFetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, full_name, password, role })
        });
        
        if (res.ok) {
          usernameInput.value = '';
          fullNameInput.value = '';
          passwordInput.value = '';
          roleSelect.value = 'speaker';
          await loadModalUsersList(adminFetch);
        } else {
          const error = await res.json();
          errorEl.textContent = error.error || 'Ошибка создания';
          errorEl.style.display = 'block';
        }
      } catch (err) {
        errorEl.textContent = 'Ошибка подключения';
        errorEl.style.display = 'block';
      } finally {
        createBtn.disabled = false;
        createBtn.textContent = 'Создать пользователя';
      }
    };
    
    createBtn.onclick = doCreate;
    usernameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') doCreate(); });
    fullNameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') doCreate(); });
    passwordInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') doCreate(); });
    usernameInput.focus();
  }, 100);
}

async function loadModalUsersList(adminFetch) {
  const container = document.getElementById('modalUsersList');
  if (!container) return;
  
  try {
    const res = await adminFetch('/api/auth/users');
    const users = await res.json();
    
    if (users.length === 0) {
      container.innerHTML = '<div class="meta" style="text-align:center; padding:var(--space-lg);">Нет пользователей</div>';
      return;
    }
    
    container.innerHTML = users.map(u => `
      <div class="item" style="display:flex; justify-content:space-between; align-items:center; gap:var(--space-sm);">
        <div style="flex:1; min-width:0;">
          <div style="display:flex; align-items:center; gap:var(--space-xs); flex-wrap:wrap;">
            <strong>${u.username}</strong>
            ${u.role === 'admin' ? '<span style="background:var(--brand); color:white; padding:2px 6px; border-radius:4px; font-size:0.7rem;">ADMIN</span>' : ''}
            ${u.role === 'speaker' ? '<span style="background:var(--success); color:white; padding:2px 6px; border-radius:4px; font-size:0.7rem;">SPEAKER</span>' : ''}
            ${!u.is_active ? '<span style="background:var(--danger); color:white; padding:2px 6px; border-radius:4px; font-size:0.7rem;">OFF</span>' : ''}
          </div>
          <div class="meta">${u.full_name}</div>
        </div>
        <div style="display:flex; gap:4px; flex-shrink:0;">
          ${u.is_active 
            ? `<button class="secondary" style="min-width:auto; padding:6px 10px;" onclick="toggleUserInModal(${u.id}, false, ${adminFetch})" title="Отключить">🔒</button>`
            : `<button class="secondary" style="min-width:auto; padding:6px 10px;" onclick="toggleUserInModal(${u.id}, true, ${adminFetch})" title="Включить">🔓</button>`
          }
          ${u.id !== 1 ? `<button class="danger" style="min-width:auto; padding:6px 10px;" onclick="deleteUserInModal(${u.id}, '${u.username}', ${adminFetch})" title="Удалить">🗑️</button>` : ''}
        </div>
      </div>
    `).join('');
    
    // Глобальные функции для onclick
    window.toggleUserInModal = async (userId, activate) => {
      try {
        const res = await adminFetch(`/api/auth/users/${userId}/toggle`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ is_active: activate })
        });
        
        if (res.ok) {
          await loadModalUsersList(adminFetch);
        }
      } catch (err) {
        alert('Ошибка');
      }
    };
    
    window.deleteUserInModal = async (userId, username) => {
      if (!confirm(`Удалить "${username}"?`)) return;
      
      try {
        const res = await adminFetch(`/api/auth/users/${userId}`, {
          method: 'DELETE'
        });
        
        if (res.ok) {
          await loadModalUsersList(adminFetch);
        }
      } catch (err) {
        alert('Ошибка');
      }
    };
    
  } catch (err) {
    container.innerHTML = '<div class="meta" style="color:var(--danger); text-align:center;">Ошибка загрузки</div>';
  }
}

