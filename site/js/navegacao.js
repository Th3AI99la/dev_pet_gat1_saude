import { byId as $ } from './ui.js';

export function mountMenu() {
  const toggle = $('menuToggle');
  const menu = $('sideMenu');
  const backdrop = $('menuBackdrop');
  const content = document.querySelector('.dashboard-main');
  const mobile = matchMedia('(max-width: 880px)');
  const links = [...menu.querySelectorAll('a[href^="#"]')];

  function open(value, returnFocus = false) {
    menu.dataset.open = String(value);
    toggle.setAttribute('aria-expanded', String(value));
    toggle.setAttribute('aria-label', value ? 'Fechar menu lateral' : 'Abrir menu lateral');
    backdrop.hidden = !value;
    content.inert = value;
    if (value) links[0].focus();
    else if (returnFocus) toggle.focus();
  }
  toggle.addEventListener('click', () => open(toggle.getAttribute('aria-expanded') !== 'true'));
  backdrop.addEventListener('click', () => open(false, true));
  mobile.addEventListener('change', () => open(false));
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && menu.dataset.open === 'true') open(false, true);
  });
  for (const link of links) {
    link.addEventListener('click', () => {
      if (mobile.matches) open(false, true);
    });
  }
  function highlight() {
    const current = links.findLast(link => $(decodeURIComponent(link.hash.slice(1))).getBoundingClientRect().top <= 155) ?? links[0];
    for (const link of links) {
      if (link === current) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    }
  }
  let frame;
  window.addEventListener('scroll', () => {
    if (frame) return;
    frame = requestAnimationFrame(() => { frame = null; highlight(); });
  }, { passive: true });
  highlight();
}
