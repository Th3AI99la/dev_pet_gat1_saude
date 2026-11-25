import { byId as $ } from './ui.js';

const PLAY = '<path d="M8 5l12 7-12 7z"/>';
const PAUSE = '<path d="M6 5h4v14H6zm8 0h4v14h-4z"/>';
const SPEEDS = [1, 2, .5];

export function mountPlayback(names, selectMonth) {
  const rail = $('monthRail');
  const play = $('play');
  const status = $('playStatus');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const buttons = names.map((name, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.month = String(index + 1);
    button.innerHTML = `<span>${name.slice(0, 3)}</span><i aria-hidden="true"></i>`;
    button.addEventListener('click', () => { stop(); selectMonth(index + 1); });
    rail.append(button);
    return button;
  });
  let month = 1, year, frame, started, speedIndex = 0, playing = false;

  function progress(fraction) {
    $('playbackFill').style.transform = `scaleX(${((month - 1) + fraction) / names.length})`;
  }

  function setPlaying(active) {
    playing = active;
    $('timeline').classList.toggle('is-playing', active);
    $('playIcon').innerHTML = active ? PAUSE : PLAY;
    $('playLabel').textContent = active ? 'Pausar' : month === names.length ? 'Reproduzir de novo' : 'Reproduzir ano';
  }

  function stop(message = '') {
    if (frame) cancelAnimationFrame(frame);
    frame = null;
    setPlaying(false);
    progress(1);
    if (typeof message === 'string' && message) status.textContent = message;
  }

  function advance(now) {
    if (!playing) return;
    const duration = 1350 / SPEEDS[speedIndex];
    const elapsed = (now - started) / duration;
    if (elapsed >= 1) {
      if (month === names.length) { stop(`Reprodução de ${year} concluída.`); return; }
      started = now;
      selectMonth(month + 1);
    } else if (!reducedMotion.matches) {
      progress(elapsed);
    }
    frame = requestAnimationFrame(advance);
  }

  play.addEventListener('click', () => {
    if (playing) { stop(`Pausado em ${names[month - 1]} de ${year}.`); return; }
    if (month === names.length) selectMonth(1);
    setPlaying(true);
    started = performance.now();
    status.textContent = `Reproduzindo a partir de ${names[month - 1]} de ${year}.`;
    frame = requestAnimationFrame(advance);
  });
  $('playSpeed').addEventListener('click', () => {
    const previousSpeed = SPEEDS[speedIndex];
    speedIndex = (speedIndex + 1) % SPEEDS.length;
    const speed = SPEEDS[speedIndex];
    if (playing) {
      const now = performance.now();
      started = now - (now - started) * previousSpeed / speed;
    }
    $('playSpeed').textContent = `${String(speed).replace('.', ',')}×`;
    $('playSpeed').setAttribute('aria-label', `Velocidade da reprodução: ${speed} vezes. Clique para alterar.`);
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden && playing) stop(); });

  function render(selectedYear, selectedMonth, entries) {
    year = selectedYear;
    month = selectedMonth;
    $('period').textContent = `${names[month - 1]} de ${year}`;
    if (!playing) setPlaying(false);
    progress(playing && !reducedMotion.matches ? 0 : 1);
    buttons.forEach((button, index) => {
      const entry = entries[index];
      button.classList.toggle('has-record', entry.available);
      button.classList.toggle('elapsed', index + 1 < month);
      button.setAttribute('aria-pressed', String(index + 1 === month));
      button.setAttribute('aria-label', `${names[index]} de ${year} · ${entry.label}`);
      button.title = entry.label;
    });
  }

  return { render, stop };
}
