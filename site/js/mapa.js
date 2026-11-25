import { byId as $, escapeHtml as escape } from './ui.js';
import { isNumber } from './graficos.js';

const LABELS = {
  goiania: { dx: -15, dy: -12, anchor: 'end' }, luziania: { dx: 15, dy: -7 },
  posse: { dx: 15, dy: 0 }, 'sao-miguel': { dx: -14, dy: -14, anchor: 'end' },
  catalao: { dx: 15, dy: 4 }, mineiros: { dx: -14, dy: 0, anchor: 'end' }, 'rio-verde': { dx: -5, dy: 26, anchor: 'middle' },
};

export function mountMap(geometry, cities, selectCity) {
  const svg = $('map');
  const overview = [0, 0, geometry.width, geometry.height];
  const markers = Object.entries(geometry.municipalities).map(([id, item]) => {
    const [x, y] = item.position;
    const { dx, dy, anchor = 'start' } = LABELS[id];
    return `<g class="marker" role="button" tabindex="0" data-map-city="${id}" aria-label="Selecionar ${escape(cities[id].name)}" aria-pressed="false">
      <title></title><path class="municipal-fill" d="${escape(item.path)}" fill-rule="evenodd"></path>
      <g transform="translate(${x} ${y})"><g class="marker-symbols">
        <circle class="hit" r="16"></circle>
        <line x2="${dx}" y2="${dy - 3}"></line>
        <circle class="map-pulse" r="10" aria-hidden="true"></circle>
        <circle class="pin-ring" r="13"></circle>
        <circle class="pin" r="6"></circle>
        <text x="${dx}" y="${dy}" text-anchor="${anchor}" dominant-baseline="middle">${escape(cities[id].name)}</text>
      </g></g>
    </g>`;
  });
  svg.setAttribute('viewBox', overview.join(' '));
  svg.innerHTML = `<title id="mapSvgTitle">Municípios do painel em Goiás</title>
    <defs><pattern id="mapGap" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(38)"><path d="M0 0v5" stroke="#a8bbb3" stroke-width="1.1" opacity=".65"/></pattern></defs>
    <path class="map-shadow" d="${escape(geometry.state)}" fill-rule="evenodd"></path>
    <path class="map-base" d="${escape(geometry.state)}" fill-rule="evenodd"></path>
    <path class="map-mesh" d="${escape(geometry.mesh)}"></path>
    <g class="municipal-group">${markers.join('')}</g>
    <g class="map-north" transform="translate(536 68)" aria-hidden="true"><path d="M0 11 5 -2 10 11 5 7Z"></path><text x="5" y="-9" text-anchor="middle">N</text></g>`;
  const groups = new Map([...svg.querySelectorAll('[data-map-city]')].map(marker => [marker.dataset.mapCity, marker]));
  const anchors = [...svg.querySelectorAll('.marker-symbols')];
  const hatch = $('mapGap');
  const preview = $('mapPreview');
  const stamp = $('mapDate');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let camera = overview;
  let destination = overview;
  let cameraCity = null;
  let cameraFrame = null;
  let hovered, focused, lastReading, effectKey;

  function drawCamera(bounds) {
    camera = bounds;
    svg.setAttribute('viewBox', bounds.join(' '));
    const scale = bounds[2] / geometry.width;
    for (const anchor of anchors) anchor.setAttribute('transform', `scale(${scale})`);
    hatch.setAttribute('patternTransform', `rotate(38) scale(${scale})`);
  }

  function moveCamera(id, immediate) {
    if (id === cameraCity && !(immediate && cameraFrame !== null)) return;
    cameraCity = id;
    cancelAnimationFrame(cameraFrame);
    cameraFrame = null;
    destination = overview;
    if (id) {
      const { x, y, width, height } = groups.get(id).querySelector('.municipal-fill').getBBox();
      const ratio = geometry.width / geometry.height;
      const frameWidth = Math.min(geometry.width, Math.max(100, 1.62 * width, 1.62 * height * ratio));
      const frameHeight = frameWidth / ratio;
      destination = [
        Math.max(0, Math.min(x + (width - frameWidth) / 2, geometry.width - frameWidth)),
        Math.max(0, Math.min(y + (height - frameHeight) / 2, geometry.height - frameHeight)),
        frameWidth, frameHeight,
      ];
    }
    $('mapViewStatus').textContent = id ? `Mapa aproximado em ${cities[id].name}.` : 'Mapa enquadrado em Goiás inteiro.';
    if (immediate || reducedMotion.matches) {
      drawCamera(destination);
      return;
    }
    const from = camera;
    const started = performance.now();
    function advance(now) {
      const portion = Math.min(1, Math.max(0, (now - started) / 520));
      const eased = 1 - (1 - portion) ** 3;
      drawCamera(portion === 1 ? destination : from.map((value, i) => value + (destination[i] - value) * eased));
      cameraFrame = portion < 1 ? requestAnimationFrame(advance) : null;
    }
    cameraFrame = requestAnimationFrame(advance);
  }

  reducedMotion.addEventListener('change', event => {
    if (event.matches) {
      for (const animation of [...stamp.getAnimations(), ...svg.getAnimations({ subtree: true })]) animation.cancel();
      if (cameraFrame !== null) {
        cancelAnimationFrame(cameraFrame);
        cameraFrame = null;
        drawCamera(destination);
      }
    }
  });

  function showPreview() {
    const { statewide, city, mapFocus, entries, selected, display } = lastReading;
    const id = mapFocus || hovered || focused || city;
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

  return function draw({ scope, city, mapFocus, entries, selected, maximum, tone, display, categories, numeric, date, metric }) {
    const statewide = scope === 'state';
    const key = `${date}/${metric}/${city}`;
    const changed = key !== effectKey;
    const animate = changed && !reducedMotion.matches;
    effectKey = key;
    lastReading = { statewide, city, mapFocus, entries, selected, display };
    svg.classList.toggle('map-state-only', statewide);
    svg.classList.toggle('map-zoomed', Boolean(mapFocus));
    svg.querySelector('.municipal-group').classList.toggle('map-group-hidden', statewide);
    $('mapComparison').hidden = statewide;
    $('map-title').textContent = statewide ? 'Goiás · escala estadual' : mapFocus ? cities[mapFocus].name : 'Mapa de Goiás';
    $('mapSvgTitle').textContent = mapFocus ? `${cities[mapFocus].name} e arredores` : 'Mapa de Goiás';
    $('mapResetView').setAttribute('aria-pressed', String(!mapFocus));
    moveCamera(mapFocus, statewide);
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
      const outsideFocus = mapFocus && mapFocus !== entry.id;
      node.tabIndex = outsideFocus ? -1 : 0;
      if (outsideFocus) node.setAttribute('aria-hidden', 'true');
      else node.removeAttribute('aria-hidden');
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
