/**
 * Модуль аутентификации для админ-панели
 * @module admin/auth
 */

const ADMIN_AUTH_KEY = 'adminBasicAuth';
let adminAuth = sessionStorage.getItem(ADMIN_AUTH_KEY) || null;

/**
 * Запросить логин и пароль у пользователя
 * @param {boolean} retry - Повторная попытка
 * @returns {Promise<boolean>} true если успешно
 */
export async function askLogin(retry = false) {
  const u = prompt('Логин администратора:');
  const p = prompt('Пароль администратора:');
  
  if (u && p) {
    adminAuth = 'Basic ' + btoa(`${u}:${p}`);
    sessionStorage.setItem(ADMIN_AUTH_KEY, adminAuth);
    return true;
  }
  
  if (!retry) {
    alert('Требуется авторизация для доступа к админке');
  }
  
  return false;
}

/**
 * Проверить авторизацию (запросить если нужно)
 * @returns {Promise<boolean>} true если авторизован
 */
export async function ensureAuth() {
  if (!adminAuth) {
    const ok = await askLogin();
    
    if (!ok) {
      document.body.innerHTML = `
        <div style="display:flex; align-items:center; justify-content:center; height:100vh; background:var(--bg); color:var(--text); font-family:var(--font-family); font-size:var(--font-size-lg); text-align:center; padding:var(--space-xl)">
          <div>
            <h1 style="color:var(--danger); margin-bottom:var(--space-md)">Доступ запрещен</h1>
            <p>Требуется авторизация для доступа к админ-панели.</p>
            <p style="margin-top:var(--space-md)">
              <button onclick="location.reload()" class="primary">Повторить</button>
            </p>
          </div>
        </div>
      `;
      throw new Error('Authorization required');
    }
    
    return ok;
  }
  
  return true;
}

/**
 * Fetch с автоматической авторизацией
 * @param {string} url - URL для запроса
 * @param {Object} opts - Опции fetch
 * @returns {Promise<Response>} Response объект
 */
export async function adminFetch(url, opts = {}) {
  await ensureAuth();
  
  const init = {
    ...opts,
    headers: {
      ...(opts.headers || {}),
      Authorization: adminAuth
    }
  };
  
  const res = await fetch(url, init);
  
  // Если 401 - запрашиваем авторизацию заново
  if (res.status === 401) {
    sessionStorage.removeItem(ADMIN_AUTH_KEY);
    adminAuth = null;
    const ok = await askLogin(true);
    if (!ok) throw new Error('Unauthorized');
    return adminFetch(url, opts); // Повторяем запрос
  }
  
  return res;
}

/**
 * Установить заголовки авторизации для XMLHttpRequest
 * @param {XMLHttpRequest} xhr - XMLHttpRequest объект
 */
export function setXhrAuth(xhr) {
  if (adminAuth) {
    xhr.setRequestHeader('Authorization', adminAuth);
  }
}


