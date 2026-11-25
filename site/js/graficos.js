import { escapeHtml as escape } from './ui.js';

export const isNumber = value => typeof value === 'number' && Number.isFinite(value);
export const number = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });
const percent = new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 1 });

export function legend(label, color) {
  return `<span class="legend-key"><i style="--cell-color:${color}"></i>${escape(label)}</span>`;
}

export function lineChart(entries, maximum, compact, label, textValue) {
  const width = compact ? 880 : 540;
  const height = 237, left = 45, right = width - 20, top = 19, bottom = 181;
  const spacing = (right - left) / Math.max(1, entries.length - 1);
  const x = index => left + index * spacing;
  const y = value => bottom - value / maximum * (bottom - top);
  let path = '', connected = false;
  const points = entries.map((entry, index) => {
    const valid = isNumber(entry.value);
    const xPos = x(index), yPos = valid ? y(entry.value) : bottom;
    if (valid) path += `${connected ? 'L' : 'M'}${xPos.toFixed(2)} ${yPos.toFixed(2)}`;
    connected = valid;
    const position = index === 0 ? 'start' : index === entries.length - 1 ? 'end' : 'middle';
    const tick = !compact || index % 12 === 0 ? `<text class="chart-axis" x="${xPos}" y="213" text-anchor="${position}">${escape(label(entry.period, compact))}</text>` : '';
    const accessible = escape(`${entry.date}: ${textValue(entry.value)}`);
    const radius = compact ? Math.max(4, spacing * .55) : 12;
    return `<g class="chart-point${valid ? '' : ' chart-gap'}" role="button" tabindex="0" data-period="${entry.period}" aria-pressed="false" aria-label="${accessible}">
      <title>${accessible}</title><line class="chart-cursor" x1="${xPos}" x2="${xPos}" y1="${top}" y2="${bottom}"></line>
      <circle cx="${xPos}" cy="${yPos}" r="${radius}" fill="transparent"></circle>
      ${valid ? `<circle class="chart-dot" cx="${xPos}" cy="${yPos}" r="${compact ? 2.6 : 4}"></circle>` : `<line class="chart-missing" x1="${xPos - 3}" x2="${xPos + 3}" y1="${yPos}" y2="${yPos}"></line>`}${tick}</g>`;
  });
  const ticks = Array.from({ length: 5 }, (_, i) => {
    const value = maximum * (1 - i / 4);
    const position = y(value);
    return `<line class="chart-grid-line" x1="${left}" x2="${right}" y1="${position}" y2="${position}"></line><text class="chart-axis" x="${left - 8}" y="${position + 4}" text-anchor="end">${number.format(value)}</text>`;
  });
  return `<div class="plot-scroll" tabindex="0" aria-label="Área de rolagem do gráfico"><svg class="line-chart${compact ? ' long-series' : ''}" viewBox="0 0 ${width} ${height}" aria-label="Série mensal em linha">${ticks.join('')}<path class="chart-trace" d="${path}"></path>${points.join('')}</svg></div>`;
}

export function pieChart(entries, category, labels) {
  const counts = new Map();
  for (const entry of entries) {
    const key = category(entry);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const slices = Object.entries(labels).filter(([key]) => counts.has(key));
  const total = entries.length;
  let progress = 0;
  const stops = slices.map(([key, [, color]]) => {
    const start = progress;
    progress += counts.get(key) / total * 100;
    return `${color} ${start.toFixed(4)}% ${progress.toFixed(4)}%`;
  });
  const descriptions = slices.map(([key, [description, color]]) => {
    const value = counts.get(key);
    return `<li>${legend(description, color)} <strong>${value} · ${percent.format(value / total)}</strong></li>`;
  });
  return `<div class="pie-content"><div class="dial-chart" style="background:conic-gradient(${stops.join(',')})" aria-hidden="true"><div><strong>${total}</strong><span>meses</span></div></div><ul class="pie-list" aria-label="Distribuição mensal">${descriptions.join('')}</ul></div>`;
}
