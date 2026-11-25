import { byId as $ } from './ui.js';

const PLAY = '<path d="M8 5l12 7-12 7z"/>';
const PAUSE = '<path d="M6 5h4v14H6zm8 0h4v14h-4z"/>';
const MONTH_DURATION = 1250;

export function mountPlayback(names, periods, getMonth, selectPeriod) {
  const play = $('play');
  let currentPeriod, entries, timer, includeGaps, playable, contextKey;
  const months = names.map((name, index) => {
    const button = document.createElement('button');
    const label = document.createElement('span');
    const value = document.createElement('small');
    button.type = 'button';
    button.dataset.month = String(index + 1);
    label.textContent = name.slice(0, 3);
    button.append(label, value);
    button.addEventListener('click', () => {
      stop();
      selectPeriod(entries[index].period);
    });
    $('monthRail').append(button);
    return { button, value };
  });

  function setPlaying(playing) {
    $('territorio').classList.toggle('is-playing', playing);
    $('playIcon').innerHTML = playing ? PAUSE : PLAY;
    $('playLabel').textContent = playing ? 'Pausar' : 'Reproduzir';
  }

  function stop() {
    clearTimeout(timer);
    timer = undefined;
    setPlaying(false);
    updatePlayButton();
  }

  function updatePlayButton() {
    play.disabled = timer === undefined && Boolean(entries) &&
      (playable.length < 2 || (!includeGaps && !entries.some(entry => entry.available)));
    play.title = play.disabled ? 'Este ano não tem registros suficientes para iniciar a reprodução.' : 'Reproduzir a série até o último mês disponível';
  }

  function advance() {
    const next = playable.find(period => period > currentPeriod);
    if (!next) {
      stop();
      return;
    }
    selectPeriod(next);
    timer = setTimeout(advance, MONTH_DURATION);
  }

  function resumeFromSelection() {
    if (timer === undefined) return;
    clearTimeout(timer);
    timer = setTimeout(advance, MONTH_DURATION);
  }

  play.addEventListener('click', () => {
    if (timer !== undefined) {
      stop();
      return;
    }
    if (!playable || play.disabled) return;
    const next = playable.find(period => period > currentPeriod);
    if (!next) {
      const first = playable.find(period => period.slice(0, 4) === currentPeriod.slice(0, 4));
      selectPeriod(first && first !== currentPeriod ? first : playable[0]);
    } else if (!playable.includes(currentPeriod)) {
      selectPeriod(next);
    }
    setPlaying(true);
    timer = setTimeout(advance, MONTH_DURATION);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop();
  });

  function render(period, records, playWithoutData, key) {
    currentPeriod = period;
    const [year, monthNumber] = period.split('-').map(Number);
    const month = monthNumber - 1;
    entries = records;
    includeGaps = playWithoutData;
    if (key !== contextKey) {
      contextKey = key;
      playable = includeGaps ? periods : periods.filter(item => getMonth(item).available);
    }
    $('period').textContent = `${names[month]} de ${year}`;
    updatePlayButton();
    months.forEach(({ button, value }, index) => {
      const entry = entries[index];
      button.disabled = !entry.available;
      button.classList.toggle('current-gap', includeGaps && !entry.available && index === month);
      button.setAttribute('aria-pressed', String(entry.available && index === month));
      button.setAttribute('aria-label', `${names[index]} de ${year} · ${entry.label}`);
      button.title = entry.label;
      value.textContent = entry.available ? entry.label : 'Sem dados';
    });
  }

  return { render, stop, resumeFromSelection };
}
