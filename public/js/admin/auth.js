/**
 * JWT Authentication для админ-панели
 * @module admin/auth
 */

/**
 * Проверить токен и редиректнуть на login если нужно
 */
export async function ensureAuth() {
  const token = localStorage.getItem('accessToken');
  const userStr = localStorage.getItem('user');
  
  console.log('[Admin Auth] Checking auth - token:', !!token, 'user:', !!userStr);
  
  // Если нет токена - редирект на login
  if (!token || !userStr) {
    console.log('[Admin Auth] No token or user - redirecting to /');
    localStorage.clear();
    window.location.href = '/';
    return false;
  }
  
  // Проверяем роль
  try {
    const user = JSON.parse(userStr);
    console.log('[Admin Auth] User role:', user.role);
  
    if (user.role === 'speaker') {
      console.log('[Admin Auth] Speaker trying to access admin - redirecting to /speaker.html');
      window.location.href = '/speaker.html';
      return false;
  }
  
    if (user.role !== 'admin') {
      console.log('[Admin Auth] Invalid role - clearing and redirecting');
      localStorage.clear();
      window.location.href = '/';
  return false;
}

    console.log('[Admin Auth] Access granted');
    return true;
  } catch (e) {
    console.error('[Admin Auth] Error parsing user data:', e);
    localStorage.clear();
    window.location.href = '/';
    return false;
  }
}

/**
 * Обновить access token через refresh token
 */
async function refreshAccessToken() {
  const refreshToken = localStorage.getItem('refreshToken');
    
  if (!refreshToken) {
    return false;
  }
  
  try {
    const response = await fetch('/api/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken })
    });
    
    if (response.ok) {
      const data = await response.json();
      localStorage.setItem('accessToken', data.accessToken);
      return true;
    }
  } catch (err) {
    console.error('Refresh token failed:', err);
  }
  
  return false;
}

/**
 * Fetch с автоматической JWT авторизацией
 */
export async function adminFetch(url, opts = {}) {
  const token = localStorage.getItem('accessToken');
  
  if (!token) {
    window.location.href = '/login.html';
    throw new Error('No token');
  }
  
  const init = {
    ...opts,
    headers: {
      ...(opts.headers || {}),
      'Authorization': `Bearer ${token}`
    }
  };
  
  const res = await fetch(url, init);
  
  // Если 401 - токен истек, пробуем refresh
  if (res.status === 401) {
    const refreshed = await refreshAccessToken();
    
    if (refreshed) {
      // Повторяем запрос с новым токеном
      return adminFetch(url, opts);
    } else {
      // Не удалось обновить - logout
      localStorage.clear();
      window.location.href = '/';
      throw new Error('Session expired');
    }
  }
  
  return res;
}

/**
 * Установить JWT токен для XMLHttpRequest (для upload)
 */
export function setXhrAuth(xhr) {
  const token = localStorage.getItem('accessToken');
  if (token) {
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
  }
}

/**
 * Logout
 */
export async function logout() {
  const refreshToken = localStorage.getItem('refreshToken');
  
  try {
    await adminFetch('/api/auth/logout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken })
    });
  } catch (err) {
    // Игнорируем ошибки при logout
  }
  
  localStorage.clear();
  window.location.href = '/';
}


