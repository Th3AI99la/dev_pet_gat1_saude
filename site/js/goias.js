import { byId as $, escapeHtml as escape } from './ui.js';
import { number as format } from './graficos.js';

const LABELS = { temperature: 'Temperatura média', rain: 'Precipitação acumulada' };
const BASELINE = '1991-2020';
const EARLIER = '1961-1990';
const signed = value => (value > 0 ? '+' : '') + format.format(value);

function buildClimateChart(data) {
  const controls = $('stateClimate').querySelector('.state-metrics');
  const chart = $('stateClimateChart');
  let metric = 'temperature';
  let selected = data.years.length - 1;

  function selectYear(index, focus = false) {
    selected = Math.min(data.years.length - 1, Math.max(0, index));
    const { baselines, unit, values } = data.metrics[metric];
    const year = data.years[selected];
    const value = values[selected];
    const anomaly = value - baselines[BASELINE];
    const bars = chart.querySelectorAll('[data-state-year]');
    const earlier = chart.querySelector('[aria-pressed="true"]');
    if (earlier) {
      earlier.tabIndex = -1;
      earlier.setAttribute('aria-pressed', 'false');
    }
    const current = bars[selected];
    current.tabIndex = 0;
    current.setAttribute('aria-pressed', 'true');
    if (focus) current.focus();
    $('stateYear').textContent = year;
    $('stateYearValue').textContent = `${format.format(value)} ${unit}`;
    $('stateAnomaly').textContent = `${signed(anomaly)} ${unit} ante 1991–2020`;
    $('statePreviousYear').disabled = selected === 0;
    $('stateNextYear').disabled = selected === data.years.length - 1;
  }

  function render() {
    const { baselines, unit, values } = data.metrics[metric];
    const first = data.years[0];
    const last = data.years.at(-1);
    const reference = baselines[BASELINE];
    const anomalies = values.map(value => value - reference);
    const difference = reference - baselines[EARLIER];
    const largest = Math.max(...anomalies.map(Math.abs));
    const scaleStep = metric === 'rain' ? 100 : .5;
    const scale = Math.ceil(largest / scaleStep) * scaleStep;
    const bars = anomalies.map((anomaly, index) => {
      const year = data.years[index];
      const height = Math.abs(anomaly) / scale * 50;
      const label = `${year} · ${format.format(values[index])} ${unit} · ${signed(anomaly)} ${unit} ante 1991–2020`;
      return `<button type="button" data-state-year="${index}" class="${anomaly >= 0 ? 'above' : 'below'}" tabindex="-1" aria-pressed="false" aria-label="${escape(label)}" title="${escape(label)}" style="--bar-height:${height}%"><i aria-hidden="true"></i></button>`;
    }).join('');
    const ticks = data.years.map((year, index) => {
      const edge = index === 0 || index === data.years.length - 1;
      if (!edge && (year % 20 || last - year <= 7)) return '';
      return `<span class="${!edge && year % 40 ? 'climate-tick-detail' : ''}" style="--tick:${(index + .5) / data.years.length * 100}%">${year}</span>`;
    }).join('');
    $('stateClimateNote').textContent = `${LABELS[metric]} anual em Goiás · ${first}–${last}`;
    chart.dataset.stateMetric = metric;
    chart.innerHTML = `
      <div class="climate-normals">
        <div><span>Média 1961–1990</span><strong>${format.format(baselines[EARLIER])} <small>${unit}</small></strong></div>
        <div><span>Média 1991–2020</span><strong>${format.format(reference)} <small>${unit}</small></strong></div>
        <div><span>Diferença entre períodos</span><strong>${signed(difference)} <small>${unit}</small></strong></div>
      </div>
      <div class="climate-year">
        <div class="date-navigation" role="group" aria-label="Ano do gráfico estadual">
          <button type="button" class="date-arrow" id="statePreviousYear" data-year-step="-1" aria-label="Ano anterior no gráfico">‹</button>
          <strong id="stateYear"></strong>
          <button type="button" class="date-arrow" id="stateNextYear" data-year-step="1" aria-label="Próximo ano no gráfico">›</button>
        </div>
        <div aria-live="polite"><strong id="stateYearValue"></strong><span id="stateAnomaly"></span></div>
      </div>
      <div class="climate-anomaly" aria-label="Desvio anual em relação a 1991–2020">
        <div class="climate-axis" aria-hidden="true"><span>+${format.format(scale)}</span><span>0 ${unit}</span><span>−${format.format(scale)}</span></div>
        <div class="climate-plot"><div class="climate-bars" role="group" aria-label="Anos da série estadual. Use as setas para navegar." style="--years:${data.years.length}">${bars}</div>
        <div class="climate-ticks" aria-hidden="true">${ticks}</div></div>
      </div>
      <p class="climate-method">Média ponderada pela área das células de 0,5° dentro de Goiás. <a href="https://catalogue.ceda.ac.uk/uuid/9cf07e92afaa405da4f40b6733f362d3" target="_blank" rel="noopener noreferrer">CRU TS 4.09</a> via <a href="https://registry.opendata.aws/wbg-cckp/" target="_blank" rel="noopener noreferrer">CCKP</a> · <a href="assets/clima-goias.json" download>Baixar a série e suas fontes</a></p>`;
    for (const button of controls.querySelectorAll('[data-state-metric]')) {
      button.setAttribute('aria-pressed', String(button.dataset.stateMetric === metric));
    }
    selectYear(selected);
  }

  controls.hidden = false;
  controls.addEventListener('click', event => {
    const button = event.target.closest('[data-state-metric]');
    if (!button || button.dataset.stateMetric === metric) return;
    metric = button.dataset.stateMetric;
    render();
  });
  chart.addEventListener('click', event => {
    const button = event.target.closest('[data-state-year]');
    if (button) selectYear(Number(button.dataset.stateYear));
    const yearStep = event.target.closest('[data-year-step]');
    if (yearStep) selectYear(selected + Number(yearStep.dataset.yearStep));
  });
  chart.addEventListener('keydown', event => {
    if (!event.target.matches('[data-state-year]')) return;
    const moves = { ArrowLeft: selected - 1, ArrowRight: selected + 1, Home: 0, End: data.years.length - 1 };
    if (!(event.key in moves)) return;
    event.preventDefault();
    selectYear(moves[event.key], true);
  });
  render();
}

export function mountStateClimate(drought, names, labelDate, initialPeriod) {
  const observation = $('stateObservation');
  $('stateClimateNote').textContent = 'Carregando a série estadual…';
  fetch('assets/clima-goias.json')
    .then(response => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    })
    .then(buildClimateChart)
    .catch(error => {
      console.error('Série estadual de Goiás', error);
      $('stateClimateNote').textContent = 'Série anual temporariamente indisponível.';
    });

  const dates = Object.keys(drought).sort();
  const years = [...new Set(dates.map(period => period.slice(0, 4)))];
  let current = drought[initialPeriod] ? initialPeriod : dates[0] ?? initialPeriod;
  const previous = $('watchPreviousYear');
  const next = $('watchNextYear');
  const buttons = names.map((name, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.watchMonth = String(index + 1);
    button.textContent = name.slice(0, 3);
    $('watchMonths').append(button);
    return button;
  });
  const periodFor = (year, month) => `${year}-${String(month).padStart(2, '0')}`;
  for (const [offset, button] of [[-1, previous], [1, next]]) {
    button.addEventListener('click', () => {
      const year = years[years.indexOf(current.slice(0, 4)) + offset];
      if (!year) return;
      const sameMonth = year + current.slice(4);
      const reference = Number(current.slice(5));
      current = drought[sameMonth] ? sameMonth : dates.filter(period => period.startsWith(year))
        .reduce((closest, candidate) => Math.abs(Number(candidate.slice(5)) - reference) < Math.abs(Number(closest.slice(5)) - reference) ? candidate : closest);
      drawCalendar();
    });
  }
  buttons.forEach((button, index) => button.addEventListener('click', () => {
    current = periodFor(current.slice(0, 4), index + 1);
    drawCalendar();
  }));

  function drawCalendar() {
    const year = current.slice(0, 4);
    $('watchYear').textContent = year;
    const position = years.indexOf(year);
    previous.disabled = position <= 0;
    next.disabled = position < 0 || position === years.length - 1;
    buttons.forEach((button, index) => {
      const period = periodFor(year, index + 1);
      const available = Boolean(drought[period]);
      button.disabled = !available;
      button.setAttribute('aria-pressed', String(period === current));
      const label = labelDate(period) + (available ? '' : ' · Sem boletim registrado');
      button.setAttribute('aria-label', label);
      button.title = label;
    });
    showStateObservation(current);
  }

  function showStateObservation(period) {
    const record = drought[period];
    const attention = record?.category === 'advance' || record?.category === 'mixed';
    observation.dataset.attention = String(attention);
    observation.innerHTML = `
      <p class="eyebrow">${escape(labelDate(period))}</p>
      ${attention ? '<span class="state-attention">Sinal histórico de atenção</span>' : ''}
      <strong>${escape(record?.movement ?? 'Sem registro estadual na planilha')}</strong>
      ${record ? `<p>${escape(record.source)}</p>
      <details><summary>Resumo do boletim registrado</summary><p>${escape(record.detail)}</p></details>
      <button type="button" class="source-jump" data-source-row="${record.row}">Abrir linha ${record.row} na planilha</button>` : ''}`;
  }
  drawCalendar();
  return () => current;
}
