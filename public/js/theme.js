export function initThemeToggle(btn, storageKey) {
  const key = storageKey || (location.pathname.includes('speaker') ? 'vc_theme_speaker' : location.pathname.includes('admin') ? 'vc_theme_admin' : 'vc_theme');
  const apply = (light) => {
    document.body.classList.toggle('light', light);
    if (btn) btn.textContent = light ? 'Light' : 'Dark';
    try { localStorage.setItem(key, light ? 'light' : 'dark'); } catch {}
  };
  const saved = (localStorage.getItem(key) || 'dark') === 'light';
  apply(saved);
  if (btn) btn.onclick = () => apply(!document.body.classList.contains('light'));
}