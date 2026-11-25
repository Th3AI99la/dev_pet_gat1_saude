import { byId as $, escapeHtml as escape } from './ui.js';
import { isNumber } from './graficos.js';

const LABELS = {
  goiania: { dx: -15, dy: -12, anchor: 'end' }, luziania: { dx: 15, dy: -7 },
  posse: { dx: 15, dy: 0 }, 'sao-miguel': { dx: -14, dy: -14, anchor: 'end' },
  catalao: { dx: 15, dy: 4 }, mineiros: { dx: -14, dy: 0, anchor: 'end' }, 'rio-verde': { dx: -5, dy: 26, anchor: 'middle' },
};

export function mountMap(geometry, cities, selectCity) {
  const svg = $('map');
  const markers = Object.entries(geometry.municipalities).map(([id, item]) => {
    const [x, y] = item.position;
    const { dx, dy, anchor = 'start' } = LABELS[id];
    return `<g class="marker" role="button" tabindex="0" data-map-city="${id}" aria-label="Selecionar ${escape(cities[id].name)}" aria-pressed="false">
      <title></title><path class="municipal-fill" d="${escape(item.path)}" fill-rule="evenodd"></path>
      <circle class="hit" cx="${x}" cy="${y}" r="16"></circle>
      <line x1="${x}" y1="${y}" x2="${x + dx}" y2="${y + dy - 3}"></line>
      <circle class="map-pulse" cx="${x}" cy="${y}" r="10" aria-hidden="true"></circle>
      <circle class="pin-ring" cx="${x}" cy="${y}" r="13"></circle>
      <circle class="pin" cx="${x}" cy="${y}" r="6"></circle>
      <text x="${x + dx}" y="${y + dy}" text-anchor="${anchor}" dominant-baseline="middle">${escape(cities[id].name)}</text>
    </g>`;
  });
  svg.setAttribute('viewBox', `0 0 ${geometry.width} ${geometry.height}`);
  svg.innerHTML = `<title id="mapSvgTitle">Municípios do painel em Goiás</title>
    <defs><pattern id="mapGap" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(38)"><path d="M0 0v5" stroke="#a8bbb3" stroke-width="1.1" opacity=".65"/></pattern></defs>
    <path class="map-shadow" d="${escape(geometry.state)}" fill-rule="evenodd"></path>
    <path class="map-base" d="${escape(geometry.state)}" fill-rule="evenodd"></path>
    <path class="map-mesh" d="${escape(geometry.mesh)}"></path>
    <g class="municipal-group">${markers.join('')}</g>
    <g class="map-north" transform="translate(536 68)" aria-hidden="true"><path d="M0 11 5 -2 10 11 5 7Z"></path><text x="5" y="-9" text-anchor="middle">N</text></g>`;
  const groups = new Map([...svg.querySelectorAll('[data-map-city]')].map(marker => [marker.dataset.mapCity, marker]));
  const preview = $('mapPreview');
  const stamp = $('mapDate');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  reducedMotion.addEventListener('change', event => {
    if (event.matches) {
      for (const animation of [...stamp.getAnimations(), ...svg.getAnimations({ subtree: true })]) animation.cancel();
    }
  });
  let hovered, focused, lastReading, effectKey;

  function showPreview() {
    const { statewide, city, entries, selected, display } = lastReading;
    const id = hovered || focused || city;
    const entry = statewide ? selected : entries.find(entry => entry.id === id);
    const place = statewide ? 'Goiás · escala estadual' : cities[id].name;
    const context = statewide ? 'Monitor de Secas' : `Região ${cities[id].region}`;
    preview.innerHTML = `<div><strong>${escape(place)}</strong><span>${escape(context)}</span></div>
      <p>${escape(display(entry.value))}</p>`;
  }

  for (const [id, marker] of groups) {
    marker.addEventListener('pointerenter', event => {
      if (event.pointerType === 'touch') return;
      hovered = id;
      showPreview();
    });
    marker.addEventListener('pointerleave', () => {
      if (hovered === id) hovered = null;
      showPreview();
    });
    marker.addEventListener('focus', () => { focused = id; showPreview(); });
    marker.addEventListener('blur', () => { focused = null; showPreview(); });
  }

  svg.addEventListener('click', event => {
    const marker = event.target.closest('[data-map-city]');
    if (marker) selectCity(marker.dataset.mapCity);
  });
  svg.addEventListener('keydown', event => {
    if (event.target.dataset.mapCity && ['Enter', ' '].includes(event.key)) {
      event.preventDefault(); selectCity(event.target.dataset.mapCity);
    }
  });
  $('mapRanking').addEventListener('click', event => {
    const button = event.target.closest('[data-rank-city]');
    if (button) selectCity(button.dataset.rankCity);
  });

  return function draw({ scope, city, entries, selected, maximum, tone, display, categories, numeric, date, metric }) {
    const statewide = scope === 'state';
    const key = `${date}/${metric}/${city}`;
    const changed = key !== effectKey;
    const animate = changed && !reducedMotion.matches;
    effectKey = key;
    lastReading = { statewide, city, entries, selected, display };
    svg.classList.toggle('map-state-only', statewide);
    svg.querySelector('.municipal-group').classList.toggle('map-group-hidden', statewide);
    $('mapComparison').hidden = statewide;
    $('map-title').textContent = statewide ? 'Goiás · escala estadual' : 'Mapa de Goiás';
    $('mapMetric').textContent = metric;
    stamp.textContent = date;
    $('mapScope').textContent = statewide ? 'Classificação estadual' : `${entries.filter(entry => entry.value !== null).length} de ${entries.length} municípios com registro`;
    showPreview();
    if (changed) stamp.getAnimations().forEach(animation => animation.cancel());
    if (animate) {
      stamp.animate([{ opacity: .55, transform: 'translateY(4px)' }, { opacity: 1, transform: 'none' }], { duration: 280, easing: 'ease-out' });
    }

    if (statewide) {
      const category = categories[selected.category];
      svg.style.setProperty('--state-fill', category?.[1] ?? 'url(#mapGap)');
      $('mapLegend').innerHTML = category
        ? `<span class="map-key" style="--swatch:${category[1]}"><i></i> ${escape(category[0])}</span>`
        : '<span class="map-key"><i></i> Sem registro</span>';
      return;
    }
    const focus = document.activeElement?.dataset?.rankCity;
    const hasNumeric = numeric && maximum > 0;
    const ranking = [...entries].sort((a, b) => {
      if (isNumber(a.value) && isNumber(b.value)) return b.value - a.value;
      return Number(a.value === null) - Number(b.value === null);
    });
    $('mapLegend').innerHTML = hasNumeric
      ? `<span class="map-scale" style="--map-tone:${tone}"><span>0</span><i></i><span>${escape(display(maximum))}</span></span><span class="map-key"><i></i> Sem valor</span>`
      : ['described', 'limited'].map(key => `<span class="map-key" style="--swatch:${categories[key][1]}"><i></i> ${escape(categories[key][0])}</span>`).join('') + '<span class="map-key"><i></i> Sem registro</span>';
    $('mapRanking').innerHTML = ranking.map(entry => {
      const value = entry.value === null ? 'Sem valor' : isNumber(entry.value) ? display(entry.value) : 'Com registro';
      const fill = isNumber(entry.value) && hasNumeric ? entry.value / maximum * 100 : 0;
      return `<button type="button" data-rank-city="${entry.id}" aria-pressed="${entry.id === city}"><span>${escape(cities[entry.id].name)}</span><strong>${escape(value)}</strong><i aria-hidden="true" style="--fill:${fill}%"></i></button>`;
    }).join('');
    if (focus) $('mapRanking').querySelector(`[data-rank-city="${focus}"]`)?.focus({ preventScroll: true });

    for (const entry of entries) {
      const node = groups.get(entry.id);
      const measured = isNumber(entry.value);
      const available = entry.value !== null;
      const intensity = measured && hasNumeric ? entry.value / maximum : 0;
      const fill = available ? measured ? `color-mix(in srgb, ${tone} ${40 + intensity * 60}%, #8faea1)` : categories[entry.category]?.[1] ?? '#b5d8c1' : 'url(#mapGap)';
      node.setAttribute('aria-pressed', String(entry.id === city));
      node.classList.toggle('map-marker-missing', !available);
      node.style.setProperty('--city-fill', fill);
      node.style.setProperty('--city-signal', String(.75 + Math.sqrt(intensity) * .9));
      node.querySelector('title').textContent = `${cities[entry.id].name} · ${display(entry.value)}`;
      node.setAttribute('aria-label', `Selecionar ${cities[entry.id].name} · ${display(entry.value)}`);
      if (animate && available) {
        const pulse = node.querySelector('.map-pulse');
        pulse.getAnimations().forEach(animation => animation.cancel());
        pulse.animate([{ opacity: .72, transform: 'scale(.66)' }, { opacity: 0, transform: 'scale(2.35)' }], { duration: 520, easing: 'cubic-bezier(.23,1,.36,1)' });
      }
    }
  };
}
