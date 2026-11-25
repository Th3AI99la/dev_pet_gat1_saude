import { byId as $, escapeHtml as escape, mountTheme } from './ui.js';
import { isNumber, number as NUM, legend, lineChart, pieChart } from './graficos.js';
import { mountWorkbook } from './planilha.js';
import { mountMap } from './mapa.js';
import { mountMenu } from './navegacao.js';
import { mountPlayback } from './reproducao.js';
import { mountStateClimate } from './goias.js';

const MONTHS = 'Janeiro Fevereiro Março Abril Maio Junho Julho Agosto Setembro Outubro Novembro Dezembro'.split(' ');
const SHORT = MONTHS.map(month => month.slice(0, 3));
const METRICS = {
  rain: { title: 'Precipitação', option: 'Chuva', unit: 'mm', tone: '#3c8cbb', icon: 'M4 16a4 4 0 0 1 1-7.9 6 6 0 0 1 11-.7A4.5 4.5 0 0 1 19 16M7 17l-1 3m6-3-1 3m6-3-1 3' },
  humidity: { title: 'Umidade relativa média', option: 'Umidade', unit: '%', tone: '#32958d', icon: 'M12 3c2.6 4 6.5 8 6.5 12A6.5 6.5 0 0 1 5.5 15c0-4 3.9-8 6.5-12Zm-3 13a3 3 0 0 0 3 3' },
  fire: { title: 'Média de queimadas', option: 'Queimadas', unit: '', tone: '#be5b3a', icon: 'M12 3c1 5-3 6-3 9-1-1-2-2-2-4a8 8 0 0 0-2.5 6A7.5 7.5 0 0 0 12 21c4.1 0 7.5-2.8 7.5-7 0-3.3-2.3-6.7-4.7-8.5.2 2.8-1.3 4.8-2 5.2.1-2.8.2-4.6-.8-7.7Z' },
  drought: { title: 'Monitor de Secas', option: 'Seca', unit: '', tone: '#9d723a', icon: 'M3 19h18M5 15l4-4 4 2 5-5m-2 0h2v2M6 6h2m3 0h2m3 0h2' },
  events: { title: 'Eventos climáticos', option: 'Eventos', unit: '', tone: '#8d79ad', icon: 'M6 4h12v16H6zM9 8h6m-6 4h6m-6 4h4' },
};
const CATEGORIES = {
  mixed: ['Avanço e recuo', '#bdb0d7'], retreat: ['Recuo', '#a5d3bc'], advance: ['Avanço', '#e7b980'],
  stable: ['Estabilidade', '#abc5d8'], other: ['Outro registro', '#d3c4a1'],
  described: ['Descrição disponível', '#aad0b5'], limited: ['Dados limitados', '#ecd7a9'],
};
const monthDate = (year, month) => `${year}-${String(month).padStart(2, '0')}`;
const numberMonth = period => Number(period.slice(5));
const yearOf = period => Number(period.slice(0, 4));
const labelDate = period => `${MONTHS[numberMonth(period) - 1]} de ${yearOf(period)}`;
const statusText = record => record?.status || '';
const categorical = metric => ['events', 'drought'].includes(metric);
const coverage = entry => entry.value !== null ? 'used' : entry.record ? 'limited' : 'missing';
const COVERAGE = { used: ['Valor disponível', '#70a98c'], limited: ['Linha sem valor para o indicador', '#d5ac71'], missing: ['Sem linha identificada', '#abb6b4'] };

let data;
let map;
let periods;
let years;
const INITIAL_PERIOD = '2025-04';
const state = {
  metric: 'rain', city: 'posse', mapFocus: null, chart: 'line', range: 'year',
  period: INITIAL_PERIOD, chartPeriod: INITIAL_PERIOD, recurrencePeriod: INITIAL_PERIOD,
};
let player;
let drawMap;
let openWorkbookRow;
let chartKey = '';
let recurrencePlotKey = '';
let summaryKey = '';
let recurrenceDetailKey = '';
const mapScales = new Map();
const wholeState = () => state.mapFocus === null;
const analysisPlace = () => state.metric === 'drought' ? 'Goiás' : data.municipalities[state.city].name;

function reading(period = state.period, city = state.city) {
  const month = data.municipalities[city]?.months[period];
  const { metric } = state;
  if (metric === 'drought') {
    const record = data.drought[period];
    return { value: record?.movement ?? null, category: record?.category, record };
  }
  if (metric === 'fire') return { value: month?.fire?.value ?? null, record: month?.fire };
  const record = month?.weather;
  if (metric === 'events') {
    return { value: record?.event ?? null, category: record?.event && (statusText(record) ? 'limited' : 'described'), record };
  }
  return { value: record?.values?.[metric] ?? null, record };
}

function display(value) {
  if (value === null) return 'Sem valor disponível';
  const unit = METRICS[state.metric].unit;
  return isNumber(value) ? `${NUM.format(value)}${unit ? ' ' + unit : ''}` : value;
}

function missingLabel(entry) {
  const reason = statusText(entry.record);
  return reason ? `Sem valor disponível. ${reason}` : 'Sem valor disponível para este indicador e período.';
}

function mapEntries(period) {
  return Object.keys(data.municipalities).map(id => ({ id, ...reading(period, id) }));
}

function mapMonth(period) {
  if (wholeState() && state.metric !== 'drought') {
    const entries = mapEntries(period);
    const count = entries.filter(entry => entry.value !== null).length;
    return { period, label: count ? `${count}/${entries.length} locais` : 'Sem dados', available: count > 0 };
  }
  const entry = reading(period);
  return { period, label: entry.value === null ? missingLabel(entry) : isNumber(entry.value) ? display(entry.value) : 'Registro', available: entry.value !== null };
}

function seriesMaximum(periodList) {
  return Math.max(0, ...periodList.map(period => reading(period).value).filter(isNumber));
}

function niceMax(value) {
  if (value === 0) return 1;
  const interval = value / 4;
  const magnitude = 10 ** Math.floor(Math.log10(interval));
  const factor = [1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find(candidate => candidate >= interval / magnitude);
  return factor * magnitude * 4;
}

function kindColor(entry, maximum = 1) {
  if (entry.category && CATEGORIES[entry.category]) return CATEGORIES[entry.category][1];
  if (!isNumber(entry.value)) return '#e1e8de';
  const intensity = 25 + (entry.value / (maximum || 1)) * 70;
  return `color-mix(in srgb, var(--tone) ${intensity.toFixed(2)}%, #f4f7ef)`;
}

function mapMaximum() {
  if (!mapScales.has(state.metric)) {
    let maximum = 0;
    for (const city of Object.keys(data.municipalities)) {
      for (const period of periods) {
        const { value } = reading(period, city);
        if (isNumber(value)) maximum = Math.max(maximum, value);
      }
    }
    mapScales.set(state.metric, maximum);
  }
  return mapScales.get(state.metric);
}

function showOverview() {
  const statewide = state.metric === 'drought';
  const info = METRICS[state.metric];
  const selected = reading();
  const entries = mapEntries(state.period);
  const present = entries.filter(entry => entry.value !== null).length;
  const stateOverview = wholeState() && !statewide;
  const year = yearOf(state.period);
  const valid = MONTHS.reduce((total, _, index) => total + Number(mapMonth(monthDate(year, index + 1)).available), 0);
  $('statMetric').textContent = info.title;
  $('statValue').textContent = stateOverview ? (present ? `${present}/${entries.length}` : 'Sem dados') : selected.value === null ? 'Sem valor' : isNumber(selected.value) ? display(selected.value) : statewide ? display(selected.value) : 'Com registro';
  $('statPlace').textContent = `${wholeState() ? 'Goiás' : analysisPlace()} · ${labelDate(state.period)}`;
  $('statMapLabel').textContent = statewide || stateOverview ? 'Escala da leitura' : 'Cobertura no mapa';
  $('statMapValue').textContent = statewide ? 'Estadual' : stateOverview ? 'Municipal' : `${present}/${entries.length}`;
  $('statMapDetail').textContent = statewide ? 'Monitor de Secas' : stateOverview ? 'Municípios da planilha' : 'Municípios com registro';
  $('statYearLabel').textContent = `Cobertura em ${year}`;
  $('statYearValue').textContent = `${valid}/12`;
  drawMap({ scope: statewide ? 'state' : 'municipal', city: state.city, mapFocus: state.mapFocus, entries, selected, maximum: mapMaximum(), display, tone: info.tone, categories: CATEGORIES, numeric: !categorical(state.metric), date: labelDate(state.period), metric: info.option });
}

function showReading() {
  const { metric, period, city } = state;
  const statewide = metric === 'drought';
  if (wholeState() && !statewide) {
    const entries = mapEntries(period);
    const count = entries.filter(entry => entry.value !== null).length;
    $('placeRegion').textContent = 'Visão geral';
    $('placeName').textContent = 'Estado de Goiás';
    $('placeStation').textContent = labelDate(period);
    $('valueCard').innerHTML = `<p class="eyebrow">${escape(METRICS[metric].title)}</p><p class="reading">${count}/${entries.length}</p><p class="context">Municípios da planilha com dados neste mês</p>`;
    $('monthDetail').textContent = count ? 'Selecione um município para consultar seu registro.' : 'Nenhum dos municípios da planilha tem valor neste mês.';
    return;
  }
  const municipality = data.municipalities[city];
  $('placeRegion').textContent = statewide ? 'Escala estadual' : `Região ${municipality.region}`;
  $('placeName').textContent = statewide ? 'Goiás' : municipality.name;
  $('placeStation').textContent = statewide ? 'Monitor de Secas · ANA / CIMEHGO' : metric === 'fire' ? 'BDQueimadas · valores da planilha' : `INMET · referência ${municipality.station}`;
  const { value, record } = reading();
  const unit = METRICS[metric].unit;
  const previousPeriod = periods[periods.indexOf(period) - 1];
  const previous = previousPeriod ? reading(previousPeriod).value : null;
  const difference = isNumber(value) && isNumber(previous) ? value - previous : null;
  const changeUnit = metric === 'humidity' ? ' p.p.' : unit ? ` ${unit}` : '';
  const change = difference === null ? '' : `<p class="month-change"><strong>${difference > 0 ? '+' : ''}${escape(NUM.format(difference))}${changeUnit}</strong> em relação a ${escape(labelDate(previousPeriod).toLowerCase())}</p>`;
  const wideLabel = !isNumber(value);
  let context = '';
  if (metric === 'rain') context = 'Acumulado mensal registrado';
  if (metric === 'humidity') context = 'Média mensal registrada';
  if (metric === 'fire') context = 'Valor informado na coluna de média. Unidade a confirmar.';
  if (metric === 'drought') context = 'Movimento descrito para o estado';
  if (metric === 'events') context = 'Classificação ou descrição registrada na planilha';
  if (value === null) context = statusText(record) || (metric === 'fire' && record?.original ? `Registro na planilha: ${record.original}` : 'A planilha não traz um valor utilizável neste mês.');
  const numeric = isNumber(value) ? `${NUM.format(value)}${unit ? ` <span>${escape(unit)}</span>` : ''}` : escape(display(value));
  $('valueCard').innerHTML = `<p class="eyebrow">${escape(METRICS[metric].title)}</p><p class="reading${wideLabel ? ' label' : ''}">${numeric}</p><p class="context">${escape(context)}</p>${change}`;
  const { event, detail, source, row, rows, note } = record ?? {};
  const citedRows = row ? `Linha ${row} · ${data.sheet}` : rows?.length ? `Linhas ${rows.join(', ')} · ${data.sheet}` : '';
  const frame = $('monthDetail');
  const wasOpen = frame.querySelector('details')?.open;
  const sourceLine = [citedRows, source].filter(Boolean).join(' · ');
  frame.innerHTML = record ? `${sourceLine ? `<p>${escape(sourceLine)}</p>` : ''}
    ${record.status && value !== null ? `<p>${escape(record.status)}</p>` : ''}
    ${event || detail || note ? `<details${wasOpen ? ' open' : ''}><summary>Ver resumo do registro</summary>
      ${event && metric !== 'events' ? `<p>${escape(event)}</p>` : ''}${detail ? `<p>${escape(detail)}</p>` : ''}${note ? `<p>${escape(note)}</p>` : ''}
    </details>` : ''}
    ${(row ? [row] : rows ?? []).map(number => `<button type="button" class="source-jump" data-source-row="${number}">Abrir linha ${number} na planilha</button>`).join('')}` : '<p>Sem linha correspondente para o indicador e o mês selecionados.</p>';
}

function chartMode() {
  return categorical(state.metric) && state.chart === 'line' ? 'column' : state.chart;
}

function chartPeriods(year) {
  return state.range === 'all' ? periods : SHORT.map((_, i) => monthDate(year, i + 1));
}

function historicalMedian(month, excludedYear) {
  const values = years.filter(year => year !== excludedYear).map(year => reading(monthDate(year, month)).value).filter(isNumber).sort((a, b) => a - b);
  if (values.length < 2) return null;
  const center = Math.floor(values.length / 2);
  return values.length % 2 ? values[center] : (values[center] + values[center - 1]) / 2;
}

function renderAnnual(year) {
  const mode = chartMode();
  const key = [state.range === 'year' ? year : 'all', state.metric, state.city, mode].join(':');
  if (chartKey === key) return;
  chartKey = key;
  const noUnits = categorical(state.metric);
  const wholePeriod = state.range === 'all';
  const samples = chartPeriods(year).map(period => ({ ...reading(period), period, date: labelDate(period) }));
  const annual = $('annualChart');
  const valid = samples.filter(sample => sample.value !== null).length;
  const rangeTitle = wholePeriod ? `${data.start}–${data.end}` : year;
  $('chartTitle').textContent = `${METRICS[state.metric].title} · ${rangeTitle}`;
  $('chartCaption').textContent = `${analysisPlace()} · ${valid} de ${samples.length} meses com ${noUnits ? 'descrição' : 'valor numérico'}${wholePeriod || year === data.end ? ' · 2026 parcial' : ''}`;
  if (mode === 'pie') {
    const slice = entry => state.metric === 'drought'
      ? entry.category ?? 'missing' : state.metric === 'events' ? entry.category ?? (entry.record ? 'limited' : 'missing') : coverage(entry);
    const labels = state.metric === 'drought'
      ? { advance: CATEGORIES.advance, retreat: CATEGORIES.retreat, mixed: CATEGORIES.mixed, stable: CATEGORIES.stable, other: CATEGORIES.other, missing: COVERAGE.missing }
      : state.metric === 'events' ? { described: CATEGORIES.described, limited: CATEGORIES.limited, missing: COVERAGE.missing } : COVERAGE;
    annual.innerHTML = pieChart(samples, slice, labels);
    $('chartLegend').textContent = 'Cada parcela representa a proporção de meses da categoria.';
    return;
  }
  if (!valid && !noUnits) {
    annual.innerHTML = '<p class="empty-series">Nenhum valor disponível para este recorte. Use a grade para consultar outros anos e meses.</p>';
    $('chartLegend').textContent = '';
    return;
  }
  const tick = (period, compact) => compact ? numberMonth(period) === 1 ? String(yearOf(period)) : '' : SHORT[numberMonth(period) - 1];
  const slot = (entry, content, classes, css = '') => {
    const available = entry.value !== null;
    const label = escape(`${entry.date} · ${available ? display(entry.value) : missingLabel(entry)}`);
    return `<button type="button" class="${classes}${available ? '' : ' unavailable'}" ${available ? `data-period="${entry.period}" aria-pressed="false"` : 'disabled'} aria-label="${label}" title="${label}"${css ? ` style="${css}"` : ''}>${content}<span>${tick(entry.period, wholePeriod)}</span></button>`;
  };
  const wrap = markup => wholePeriod ? `<div class="plot-scroll" tabindex="0" aria-label="Área de rolagem do gráfico"><div class="long-series">${markup}</div></div>` : markup;
  if (noUnits) {
    annual.innerHTML = wrap(`<div class="event-strip" style="--slots:${samples.length}" aria-label="Registros mensais de ${rangeTitle}">${samples.map(entry => slot(entry, '<i></i>', 'event-slot', `--cell-color:${kindColor(entry)}`)).join('')}</div>`);
    $('chartLegend').innerHTML = (state.metric === 'drought' ? ['advance', 'retreat', 'mixed', 'stable', 'other'] : ['described', 'limited']).map(key => legend(CATEGORIES[key][0], CATEGORIES[key][1])).join('') + legend('Cinza · sem dados', 'var(--gap-fill)');
    return;
  }
  const maximum = state.metric === 'humidity' ? 100 : niceMax(seriesMaximum(periods));
  const unit = METRICS[state.metric].unit;
  if (mode === 'line') {
    const benchmark = wholePeriod ? [] : MONTHS.map((_, index) => historicalMedian(index + 1, year));
    annual.innerHTML = lineChart(samples, maximum, wholePeriod, tick, display, benchmark);
    $('chartLegend').innerHTML = `${unit ? `<span>Unidade: ${escape(unit)}</span>` : ''}<span class="line-key"><i></i> Série selecionada</span>${benchmark.some(isNumber) ? '<span class="line-key reference"><i></i> Mediana do mês nos outros anos com valor, mínimo de 2 registros</span>' : ''}<span>Intervalos na linha indicam meses sem valor.</span>`;
    return;
  }
  const scale = Array.from({ length: 5 }, (_, i) => `<span style="top:${i * 25}%">${NUM.format(maximum * (1 - i / 4))}</span>`).join('');
  const bars = samples.map(entry => {
    const gap = !isNumber(entry.value);
    const height = gap ? 0 : Math.max(3, entry.value / maximum * 164);
    return slot(entry, '<span aria-hidden="true"></span>', `bar-slot${gap ? ' gap' : ''}`, `--bar-size:${height}px`);
  }).join('');
  annual.innerHTML = wrap(`<div class="bar-chart"><div class="y-axis" aria-hidden="true">${scale}</div><div class="bar-grid" style="--slots:${samples.length}" aria-label="Gráfico mensal de ${rangeTitle}">${bars}</div></div>`);
  $('chartLegend').textContent = `${unit ? `Unidade: ${unit} · ` : ''}Traço pontilhado: sem valor.`;
}

function showChartSummary() {
  const key = [state.chartPeriod, state.city, state.metric, state.range].join('/');
  if (key === summaryKey) return;
  summaryKey = key;
  const selected = reading(state.chartPeriod);
  const flat = chartPeriods(yearOf(state.chartPeriod)).map(period => [period, reading(period).value]);
  const valid = flat.filter(([, value]) => isNumber(value));
  const best = valid.reduce((peak, item) => peak === null || item[1] > peak[1] ? item : peak, null);
  const caption = categorical(state.metric) ? 'Registro selecionado' : 'Mês selecionado';
  const rows = selected.record?.row ? [selected.record.row] : selected.record?.rows ?? [];
  $('chartSummary').innerHTML = `<p class="eyebrow">${caption}</p><strong>${escape(display(selected.value))}</strong><p>${escape(labelDate(state.chartPeriod))}</p>${selected.value === null ? '' : rows.map(row => `<button type="button" class="source-jump" data-source-row="${row}">Abrir linha ${row}</button>`).join('')}${best ? `<hr><p class="eyebrow">Maior valor no recorte</p><strong>${escape(display(best[1]))}</strong><p>${escape(labelDate(best[0]))}</p>` : ''}`;
}

function showRecurrence() {
  const month = numberMonth(state.recurrencePeriod);
  const key = [month, state.city, state.metric].join('/');
  const numeric = !categorical(state.metric);
  if (key !== recurrencePlotKey) {
    recurrencePlotKey = key;
    const samples = years.map(year => {
      const period = monthDate(year, month);
      return { year, period, ...reading(period) };
    });
    const maximum = Math.max(0, ...samples.map(entry => entry.value).filter(isNumber)) || 1;
    $('recurrenceMonthTitle').textContent = `${MONTHS[month - 1]} · ${years[0]}–${years.at(-1)}`;
    $('recurrenceRows').classList.toggle('recurrence-categories', !numeric);
    $('recurrenceRows').innerHTML = samples.map(entry => {
      const available = entry.value !== null;
      const label = !available ? 'Sem dados' : numeric ? display(entry.value) : CATEGORIES[entry.category]?.[0] ?? 'Com registro';
      const detail = escape(`${labelDate(entry.period)} · ${available ? display(entry.value) : missingLabel(entry)}`);
      const value = isNumber(entry.value) ? Math.max(0, entry.value / maximum * 100) : 0;
      const track = numeric ? `<span class="recurrence-track" aria-hidden="true"><i style="--amount:${value}%"></i></span>` : '';
      return `<li><button type="button" class="recurrence-row${available ? '' : ' unavailable'}" ${available ? `data-period="${entry.period}" aria-pressed="false"` : 'disabled'} data-recurrence-year="${entry.year}" aria-label="${detail}" title="${detail}"><span>${entry.year}</span>${track}<strong>${escape(label)}</strong></button></li>`;
    }).join('');
  }
  const year = yearOf(state.recurrencePeriod);
  const list = $('recurrenceRows');
  list.querySelector('[aria-current="true"]')?.removeAttribute('aria-current');
  list.querySelector('[aria-pressed="true"]')?.setAttribute('aria-pressed', 'false');
  const current = list.querySelector(`[data-recurrence-year="${year}"]`);
  current?.setAttribute('aria-current', 'true');
  if (current?.dataset.period) current.setAttribute('aria-pressed', 'true');

  const detailKey = `${key}/${year}`;
  if (detailKey === recurrenceDetailKey) return;
  recurrenceDetailKey = detailKey;
  const entry = reading(state.recurrencePeriod);
  const rows = entry.record?.row ? [entry.record.row] : entry.record?.rows ?? [];
  const links = entry.value === null ? '' : rows.map(row => `<button type="button" class="source-jump" data-source-row="${row}">Abrir linha ${row} na planilha</button>`).join('');
  const summary = data.recurring[state.metric === 'drought' ? 'goias' : state.city]?.[month];
  const synthesis = summary && state.metric !== 'fire' ? `<details><summary>Síntese da planilha</summary><p><strong>${escape(summary.label)}</strong></p><p>${escape(summary.note)} ${summary.years ? `Anos informados: ${escape(summary.years)}.` : ''}</p><button type="button" class="source-jump" data-source-row="${month + 1}" data-source-sheet="${escape(summary.sheet)}">Abrir síntese na planilha</button></details>` : '';
  const detail = entry.value === null ? `<p>${escape(missingLabel(entry))}</p>` : links;
  $('recurrenceDetail').innerHTML = `<h3>${escape(labelDate(state.recurrencePeriod))}</h3><p class="recurrence-value">${escape(entry.value === null ? 'Sem dados' : display(entry.value))}</p>${detail}${synthesis}`;
}

function showSelection() {
  const year = yearOf(state.period);
  $('year').value = year;
  $('chartYear').value = yearOf(state.chartPeriod);
  $('recurrenceMonth').value = numberMonth(state.recurrencePeriod);
  const chartRange = $('chartRange');
  chartRange.setAttribute('aria-pressed', String(state.range === 'all'));
  chartRange.textContent = state.range === 'all' ? `Voltar para ${yearOf(state.chartPeriod)}` : 'Ver série 2017–2026';
  player.render(state.period, MONTHS.map((_, index) => mapMonth(monthDate(year, index + 1))), wholeState(), `${state.metric}/${state.mapFocus ?? 'goias'}`);
  $('city').value = state.mapFocus ?? 'goias';
  $('city').disabled = state.metric === 'drought';
  for (const button of $('metrics').querySelectorAll('[data-metric]')) button.setAttribute('aria-pressed', button.dataset.metric === state.metric);
  for (const button of document.querySelectorAll('[data-chart]')) {
    button.disabled = button.dataset.chart === 'line' && categorical(state.metric);
    if (button.dataset.chart === 'column') button.textContent = categorical(state.metric) ? 'Faixas mensais' : 'Colunas';
    button.setAttribute('aria-pressed', button.dataset.chart === chartMode());
  }
  $('annualChart').querySelector('[aria-pressed="true"]')?.setAttribute('aria-pressed', 'false');
  $('annualChart').querySelector(`[data-period="${state.chartPeriod}"]`)?.setAttribute('aria-pressed', 'true');
}

function render() {
  $('painel').style.setProperty('--tone', METRICS[state.metric].tone);
  showOverview();
  showReading();
  renderAnnual(yearOf(state.chartPeriod));
  showChartSummary();
  showRecurrence();
  showSelection();
  $('recurrencePlace').textContent = `${analysisPlace()} · ${METRICS[state.metric].title}`;
  $('exportLabel').textContent = `${state.metric === 'drought' ? 'Goiás' : data.municipalities[state.city].name} · ${METRICS[state.metric].title} · 2017–2026`;
}

function setPeriod(period) {
  if (!periods.includes(period)) return;
  state.period = period;
  render();
  const card = $('valueCard');
  card.getAnimations().forEach(animation => animation.cancel());
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
    card.animate([{ opacity: .7, transform: 'translateY(2px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 240, easing: 'ease-out' });
  }
}

function stop() {
  player.stop();
}

function closestRecordedPeriod(period) {
  if (reading(period).value !== null) return period;
  const year = yearOf(period);
  const month = numberMonth(period);
  return SHORT.map((_, index) => index + 1)
    .filter(candidate => reading(monthDate(year, candidate)).value !== null)
    .sort((a, b) => Math.abs(a - month) - Math.abs(b - month))
    .map(candidate => monthDate(year, candidate))[0] ?? period;
}

function csvCell(value) {
  const text = String(value ?? '');
  // Prefixa texto que o Excel interpretaria como fórmula.
  const safe = /^\s*[=+@-]/.test(text) ? "'" + text : text;
  return '"' + safe.replaceAll('"', '""') + '"';
}

function download() {
  const { metric, city } = state;
  const where = metric === 'drought' ? 'Goiás' : data.municipalities[city].name;
  const rows = [['Período', 'Local', 'Indicador', 'Valor', 'Unidade', 'Situação', 'Aba', 'Linha', 'Fonte informada']];
  for (const period of periods) {
    const { value, record } = reading(period);
    rows.push([period, where, METRICS[metric].title, isNumber(value) ? String(value).replace('.', ',') : value,
      METRICS[metric].unit, statusText(record) || (value === null ? 'Sem valor disponível' : 'Registro disponível'),
      record ? data.sheet : '', record?.row ?? record?.rows?.join(', ') ?? '', record?.source ?? '']);
  }
  const contents = rows.map(row => row.map(csvCell).join(';')).join('\r\n');
  const url = URL.createObjectURL(new Blob(['\uFEFF', contents], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `gat1-${metric === 'drought' ? 'goias' : city}-${metric}-2017-2026.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function selectCity(city) {
  if (!data.municipalities[city] || state.metric === 'drought') return;
  stop();
  state.city = city;
  state.mapFocus = city;
  state.chartPeriod = closestRecordedPeriod(state.chartPeriod);
  setPeriod(closestRecordedPeriod(state.period));
}

function selectMetric(metric) {
  if (metric === state.metric) return;
  stop();
  state.metric = metric;
  if (metric === 'drought') state.mapFocus = null;
  state.chartPeriod = closestRecordedPeriod(state.chartPeriod);
  setPeriod(wholeState() ? state.period : closestRecordedPeriod(state.period));
}

function mount() {
  years = Array.from({ length: data.end - data.start + 1 }, (_, index) => data.start + index);
  periods = years.flatMap(year => SHORT.map((_, index) => monthDate(year, index + 1)));
  drawMap = mountMap(map, data.municipalities, selectCity);
  player = mountPlayback(MONTHS, periods, mapMonth, setPeriod);
  const watchPeriod = mountStateClimate(data.drought, MONTHS, labelDate, INITIAL_PERIOD);
  $('metrics').innerHTML = Object.entries(METRICS).map(([id, info]) => `<button type="button" class="metric" data-metric="${id}" aria-pressed="false"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="${info.icon}"></path></svg>${info.option}</button>`).join('');
  $('metrics').addEventListener('click', event => {
    const button = event.target.closest('[data-metric]');
    if (button) selectMetric(button.dataset.metric);
  });
  $('showStateDrought').addEventListener('click', () => {
    selectMetric('drought');
    stop();
    setPeriod(watchPeriod());
  });
  $('mapResetView').addEventListener('click', () => {
    if (!state.mapFocus) return;
    stop();
    state.mapFocus = null;
    render();
  });
  const byRegion = new Map();
  for (const [key, value] of Object.entries(data.municipalities)) {
    const options = byRegion.get(value.region) ?? [];
    options.push(`<option value="${key}">${escape(value.name)}</option>`);
    byRegion.set(value.region, options);
  }
  $('city').innerHTML = '<option value="goias">Estado de Goiás</option>' +
    Array.from(byRegion, ([region, options]) => `<optgroup label="${escape(region)}">${options.join('')}</optgroup>`).join('');
  $('city').addEventListener('change', event => {
    if (event.target.value === 'goias') $('mapResetView').click();
    else selectCity(event.target.value);
  });
  const yearOptions = years.map(year => `<option value="${year}">${year}${year === data.end ? ' (parcial)' : ''}</option>`).join('');
  for (const field of document.querySelectorAll('[data-panel-year]')) field.innerHTML = yearOptions;
  $('year').addEventListener('change', event => {
    const next = monthDate(event.target.value, numberMonth(state.period));
    setPeriod(wholeState() ? next : closestRecordedPeriod(next));
    player.resumeFromSelection();
  });
  $('chartYear').addEventListener('change', event => {
    state.range = 'year';
    state.chartPeriod = closestRecordedPeriod(monthDate(event.target.value, numberMonth(state.chartPeriod)));
    render();
  });
  const monthOptions = MONTHS.map((month, index) => `<option value="${index + 1}">${month}</option>`).join('');
  $('recurrenceMonth').innerHTML = monthOptions;
  $('recurrenceMonth').addEventListener('change', event => {
    state.recurrencePeriod = monthDate(yearOf(state.recurrencePeriod), event.target.value);
    render();
  });
  $('chartRange').addEventListener('click', () => { state.range = state.range === 'year' ? 'all' : 'year'; render(); });
  for (const button of document.querySelectorAll('[data-chart]')) {
    button.addEventListener('click', () => { state.chart = button.dataset.chart; render(); });
  }
  $('painel').addEventListener('click', event => {
    const source = event.target.closest('[data-source-row]');
    if (source && openWorkbookRow) { stop(); openWorkbookRow(source.dataset.sourceSheet || data.sheet, Number(source.dataset.sourceRow)); }
  });
  $('annualChart').addEventListener('keydown', event => {
    const point = event.target.closest('.chart-point');
    if (point?.dataset.period && ['Enter', ' '].includes(event.key)) {
      event.preventDefault();
      state.chartPeriod = point.dataset.period;
      render();
    }
  });
  for (const [container, key] of [[$('annualChart'), 'chartPeriod'], [$('recurrenceRows'), 'recurrencePeriod']]) {
    container.addEventListener('click', event => {
      const period = event.target.closest('[data-period]')?.dataset.period;
      if (period) {
        state[key] = period;
        render();
      }
    });
  }
  $('exportCsv').addEventListener('click', download);
  render();
  $('painel').hidden = false;
  $('loading').hidden = true;
  const initialSection = $(location.hash.slice(1));
  if (initialSection && $('painel').contains(initialSection)) initialSection.scrollIntoView({ behavior: 'instant' });
  mountMenu();
}

async function json(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${path}`);
  return response.json();
}

try {
  mountTheme();
  [data, map] = await Promise.all([json('assets/dados.json'), json('assets/mapa.json')]);
  mount();
  try {
    openWorkbookRow = await mountWorkbook(data.workbookSha256);
  } catch (error) {
    $('sourceIntro').textContent = `${error.message} Gere o arquivo integral a partir do XLSX usado no painel.`;
  }
} catch (error) {
  console.error(error);
  $('loading').textContent = 'Não foi possível carregar os dados. Abra o painel pelo servidor local ou confira os arquivos da pasta site.';
}
