export const byId = id => document.getElementById(id);

export function escapeHtml(value) {
  const chars = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(value ?? '').replace(/[&<>"']/g, character => chars[character]);
}

export function mountTheme() {
  const toggle = byId('themeToggle');
  const preference = window.matchMedia('(prefers-color-scheme: dark)');
  let saved;
  try { saved = localStorage.getItem('gat1-theme'); } catch { /* Browser storage may be unavailable. */ }
  const apply = theme => {
    const dark = theme === 'dark';
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    toggle.setAttribute('aria-pressed', String(dark));
    toggle.setAttribute('aria-label', dark ? 'Ativar modo claro' : 'Ativar modo escuro');
    byId('themeIcon').textContent = dark ? '☀' : '☾';
    byId('themeLabel').textContent = dark ? 'Claro' : 'Escuro';
  };
  apply(saved ?? (preference.matches ? 'dark' : 'light'));
  preference.addEventListener('change', event => { if (!saved) apply(event.matches ? 'dark' : 'light'); });
  toggle.addEventListener('click', () => {
    saved = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem('gat1-theme', saved); } catch { /* Keep the choice for this page. */ }
    apply(saved);
  });
}
