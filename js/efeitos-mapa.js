import { byId as $ } from './ui.js';

const PARTICLES = { rain: 33, humidity: 5, fire: 26, drought: 21, events: 0 };

export function mountMapEffects() {
  const stage = $('mapStage');
  const effects = $('mapWeather');
  const toggle = $('toggleWeather');
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  let enabled = localStorage.getItem('gat1-map-effects') !== 'off';
  let indicator;

  function applyPreference() {
    effects.hidden = !enabled || motion.matches;
    toggle.disabled = motion.matches;
    toggle.setAttribute('aria-pressed', String(!effects.hidden));
    toggle.title = motion.matches ? 'Movimento reduzido ativo no dispositivo' : 'Ativar ou pausar os efeitos temáticos';
  }

  toggle.addEventListener('click', () => {
    enabled = !enabled;
    localStorage.setItem('gat1-map-effects', enabled ? 'on' : 'off');
    applyPreference();
  });
  motion.addEventListener('change', applyPreference);
  new IntersectionObserver(([entry]) => {
    stage.classList.toggle('weather-visible', entry.isIntersecting);
  }).observe(stage);
  applyPreference();

  return function setWeather(metric) {
    if (metric === indicator) return;
    indicator = metric;
    stage.dataset.weather = metric;
    toggle.hidden = !PARTICLES[metric];
    effects.innerHTML = Array.from({ length: PARTICLES[metric] }, (_, index) => {
      const x = (index * 43 + 12) % 103;
      const y = (index * 31 + 18) % 93;
      const drift = 17 + index * 13 % 37;
      const size = 1 + index * 7 % 9;
      const pace = 1 + index * 37 % 82 / 100;
      const delay = -index * .37;
      return `<i style="--x:${x}%;--y:${y}%;--drift:${drift}px;--size:${size};--pace:${pace};--delay:${delay}s"></i>`;
    }).join('');
  };
}
