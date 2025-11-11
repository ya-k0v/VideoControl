export function initThemeToggle(btn, storageKey) {
  const key = storageKey || (location.pathname.includes('speaker') ? 'vc_theme_speaker' : location.pathname.includes('admin') ? 'vc_theme_admin' : 'vc_theme');
  
  const sunIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2"></path><path d="M12 20v2"></path><path d="m4.93 4.93 1.41 1.41"></path><path d="m17.66 17.66 1.41 1.41"></path><path d="M2 12h2"></path><path d="M20 12h2"></path><path d="m6.34 17.66-1.41 1.41"></path><path d="m19.07 4.93-1.41 1.41"></path></svg>`;
  
  const moonIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"></path></svg>`;
  
  const apply = (light) => {
    document.body.classList.toggle('light', light);
    if (btn) {
      btn.innerHTML = light ? sunIcon : moonIcon;
      btn.setAttribute('title', light ? 'Переключить на тёмную тему' : 'Переключить на светлую тему');
    }
    try { localStorage.setItem(key, light ? 'light' : 'dark'); } catch {}
  };
  const saved = (localStorage.getItem(key) || 'dark') === 'light';
  apply(saved);
  if (btn) btn.onclick = () => apply(!document.body.classList.contains('light'));
}