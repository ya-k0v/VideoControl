/**
 * JWT Authentication для speaker панели
 * @module speaker/auth
 */

export async function ensureAuth() {
  const token = localStorage.getItem('accessToken');
  
  if (!token) {
    localStorage.clear(); // Очищаем возможный мусор
    window.location.href = '/';
    return false;
  }
  
  // Speaker и Admin могут на speaker панель
  try {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    if (!user.role || (user.role !== 'admin' && user.role !== 'speaker')) {
      localStorage.clear(); // Очищаем невалидные данные
      window.location.href = '/';
      return false;
    }
  } catch (e) {
    localStorage.clear(); // Битые данные
    window.location.href = '/';
    return false;
  }
  
  return true;
}

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

export async function speakerFetch(url, opts = {}) {
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
  
  if (res.status === 401) {
    const refreshed = await refreshAccessToken();
    
    if (refreshed) {
      return speakerFetch(url, opts);
    } else {
      localStorage.clear();
      window.location.href = '/';
      throw new Error('Session expired');
    }
  }
  
  return res;
}

export async function logout() {
  const refreshToken = localStorage.getItem('refreshToken');
  
  try {
    await speakerFetch('/api/auth/logout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken })
    });
  } catch (err) {
    // Ignore
  }
  
  localStorage.clear();
  window.location.href = '/';
}

