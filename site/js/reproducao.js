import { byId as $ } from './ui.js';

const PLAY = '<path d="M8 5l12 7-12 7z"/>';
const PAUSE = '<path d="M6 5h4v14H6zm8 0h4v14h-4z"/>';
const MONTH_DURATION = 1250;

export function mountPlayback(names, periods, selectPeriod) {
  const rail = $('monthRail');
  const play = $('play');
  const restart = $('restartPlay');
  const range = $('playRange');
  const speed = $('playSpeed');
  const seek = $('playSeek');
  const status = $('playStatus');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const dates = periods.map(period => {
    const [year, month] = period.split('-').map(Number);
    return { year, month, label: `${names[month - 1]} de ${year}`, short: `${names[month - 1].slice(0, 3)} ${year}` };
  });
  let index = 0;
  let frame = null;
  let lastTick = 0;
  let fraction = 0;
  let phase = 'ready';

  const months = names.map((name, offset) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.month = String(offset + 1);
    button.innerHTML = `<span>${name.slice(0, 3)}</span><i aria-hidden="true"></i>`;
    button.addEventListener('click', () => {
      stop();
      selectPeriod(periods[index - dates[index].month + 1 + offset]);
    });
    rail.append(button);
    return button;
  });

  function bounds() {
    const first = index - dates[index].month + 1;
    return range.value === 'all' ? [0, periods.length - 1] : [first, first + names.length - 1];
  }

  function drawProgress() {
    const [first, last] = bounds();
    const progress = Math.min(1, (index - first + (reducedMotion.matches ? 0 : fraction)) / (last - first));
    seek.style.setProperty('--time-progress', `${progress * 100}%`);
  }

  function setPhase(next) {
    phase = next;
    const playing = phase === 'playing';
    $('territorio').classList.toggle('is-playing', playing);
    $('playIcon').innerHTML = playing ? PAUSE : PLAY;
    $('playLabel').textContent = { ready: 'Reproduzir', paused: 'Continuar', playing: 'Pausar', ended: 'Rever sequência' }[phase];
    restart.disabled = index === bounds()[0] && !fraction;
  }

  function halt(next, message = '') {
    cancelAnimationFrame(frame);
    frame = null;
    lastTick = 0;
    setPhase(next);
    drawProgress();
    if (message) status.textContent = message;
  }

  function stop() {
    fraction = 0;
    halt('ready');
  }

  function tick(now) {
    if (lastTick) fraction += (now - lastTick) * Number(speed.value) / MONTH_DURATION;
    lastTick = now;
    if (fraction >= 1) {
      if (index === bounds()[1]) {
        fraction = 0;
        halt('ended', `Reprodução concluída em ${dates[index].label}.`);
        return;
      }
      fraction = 0;
      selectPeriod(periods[index + 1]);
    }
    drawProgress();
    frame = requestAnimationFrame(tick);
  }

  play.addEventListener('click', () => {
    if (phase === 'playing') {
      halt('paused', `Pausado em ${dates[index].label}.`);
      return;
    }
    if (phase === 'ended') selectPeriod(periods[bounds()[0]]);
    setPhase('playing');
    status.textContent = `Reproduzindo a partir de ${dates[index].label}.`;
    frame = requestAnimationFrame(tick);
  });
  restart.addEventListener('click', () => {
    const first = bounds()[0];
    const playing = phase === 'playing';
    fraction = 0;
    lastTick = 0;
    if (!playing) stop();
    selectPeriod(periods[first]);
    status.textContent = `Início da reprodução, ${dates[first].label}.`;
  });
  range.addEventListener('change', () => {
    stop();
    drawTimeline();
    status.textContent = range.value === 'all' ? 'Reprodução da série completa.' : 'Reprodução do ano selecionado.';
  });
  seek.addEventListener('input', () => {
    const target = Number(seek.value);
    stop();
    selectPeriod(periods[target]);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && phase === 'playing') halt('paused', `Pausado em ${dates[index].label}.`);
  });

  function drawTimeline() {
    const [first, last] = bounds();
    const date = dates[index];
    seek.min = first;
    seek.max = last;
    seek.step = 1;
    seek.value = index;
    seek.setAttribute('aria-valuetext', date.label);
    $('playStart').textContent = dates[first].short;
    $('playEnd').textContent = dates[last].short;
    $('playPosition').textContent = `${index - first + 1} de ${last - first + 1} meses`;
    $('period').textContent = date.label;
    setPhase(phase);
    drawProgress();
  }

  function render(period, entries) {
    index = periods.indexOf(period);
    const { year, month } = dates[index];
    drawTimeline();
    months.forEach((button, offset) => {
      const entry = entries[offset];
      button.classList.toggle('has-record', entry.available);
      button.classList.toggle('elapsed', offset + 1 < month);
      button.setAttribute('aria-pressed', String(offset + 1 === month));
      button.setAttribute('aria-label', `${names[offset]} de ${year} · ${entry.label}`);
      button.title = entry.label;
    });
  }

  return { render, stop };
}
