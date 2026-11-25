import { byId as $, escapeHtml as escape } from './ui.js';
import { isNumber } from './graficos.js';

const LABELS = {
  goiania: { dx: -15, dy: -12, anchor: 'end' }, luziania: { dx: 15, dy: -7 },
  posse: { dx: 15, dy: 0 }, 'sao-miguel': { dx: -14, dy: -14, anchor: 'end' },
  catalao: { dx: 15, dy: 4 }, mineiros: { dx: -14, dy: 0, anchor: 'end' }, 'rio-verde': { dx: -5, dy: 26, anchor: 'middle' },
};

const STEPS = 5;        // classes da escala do mapa
const MAX_ZOOM = 12;    // enquadramento mais fechado = Goiás inteiro ÷ 12
const ZOOM_STEP = 1.6;  // fator dos botões + e −
const DRAG_THRESHOLD = 6;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const tint = index => Math.round(18 + index * 82 / (STEPS - 1));

export function mountMap(geometry, cities, selectCity) {
  const svg = $('map');
  const stage = $('mapStage');
  const overview = [0, 0, geometry.width, geometry.height];
  const markers = Object.entries(geometry.municipalities).map(([id, item]) => {
    const [x, y] = item.position;
    const { dx, dy, anchor = 'start' } = LABELS[id];
    return `<g class="marker" role="button" tabindex="0" data-map-city="${id}" aria-label="Selecionar ${escape(cities[id].name)}" aria-pressed="false">
      <title></title><path class="municipal-fill" d="${escape(item.path)}" fill-rule="evenodd"></path>
      <g transform="translate(${x} ${y})"><g class="marker-symbols">
        <circle class="hit" r="16"></circle>
        <line x2="${dx}" y2="${dy - 3}"></line>
        <rect class="pin-ring" x="-9" y="-8" width="18" height="16" rx="5"></rect>
        <rect class="pin" x="-5.5" y="-4.5" width="11" height="9" rx="2"></rect>
        <path class="missing-symbol" d="M-2.5 0h5"></path>
        <text x="${dx}" y="${dy}" text-anchor="${anchor}" dominant-baseline="middle">${escape(cities[id].name)}</text>
        <text class="marker-reading" x="${dx}" y="${dy + 14}" text-anchor="${anchor}" dominant-baseline="middle" aria-hidden="true"></text>
      </g></g>
    </g>`;
  });
  svg.setAttribute('viewBox', overview.join(' '));
  svg.style.aspectRatio = `${geometry.width} / ${geometry.height}`;
  svg.innerHTML = `<title id="mapSvgTitle">Municípios do painel em Goiás</title>
    <defs><pattern id="mapGap" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(38)"><path d="M0 0v5" stroke="currentColor" stroke-width="1.1" opacity=".7"/></pattern></defs>
    <path class="map-shadow" d="${escape(geometry.state)}" fill-rule="evenodd"></path>
    <path class="map-base" d="${escape(geometry.state)}" fill-rule="evenodd"></path>
    <path class="state-selection-outline" d="${escape(geometry.state)}" aria-hidden="true"></path>
    <path class="map-mesh" d="${escape(geometry.mesh)}"></path>
    <g class="municipal-group">${markers.join('')}</g>
    <g class="map-north" transform="translate(536 68)" aria-hidden="true"><path d="M0 11 5 -2 10 11 5 7Z"></path><text x="5" y="-9" text-anchor="middle">N</text></g>`;

  const groups = new Map([...svg.querySelectorAll('[data-map-city]')].map(marker => [marker.dataset.mapCity, marker]));
  const anchors = [...svg.querySelectorAll('.marker-symbols')];
  const hatch = $('mapGap');
  const preview = $('mapPreview');
  const stamp = $('mapDate');
  const zoomIn = $('mapZoomIn');
  const zoomOut = $('mapZoomOut');
  const reset = $('mapResetView');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const pointers = new Map();
  let camera = overview;
  let destination = overview;
  let cameraCity = null;
  let cameraFrame = null;
  let hovered, focused, lastReading, effectKey;
  let pinch = null;
  let drag = null;
  let dragged = false;
  let hintCount = 0;
  let hintTimer;

  /* ---------- Câmera ---------- */

  // Quantos pixels da tela cabem em uma unidade do SVG (viewBox com "meet").
  function pixelScale(bounds = camera) {
    const { width, height } = svg.getBoundingClientRect();
    return width && height ? Math.min(width / bounds[2], height / bounds[3]) : 1;
  }

  function toSvg(clientX, clientY) {
    const rect = svg.getBoundingClientRect();
    const scale = pixelScale();
    const left = (rect.width - camera[2] * scale) / 2;
    const top = (rect.height - camera[3] * scale) / 2;
    return [camera[0] + (clientX - rect.left - left) / scale, camera[1] + (clientY - rect.top - top) / scale];
  }

  // Rótulos, pinos e hachura mantêm o tamanho em pixels em qualquer tela e zoom.
  function syncScale() {
    const scale = pixelScale();
    const inverse = 1 / scale;
    for (const anchor of anchors) anchor.setAttribute('transform', `scale(${inverse})`);
    hatch.setAttribute('patternTransform', `rotate(38) scale(${inverse})`);
    const crowded = scale < .72 && camera[2] > geometry.width * .85;
    svg.classList.toggle('map-labels-minimal', crowded);
  }

  function syncTools() {
    const whole = camera[2] >= geometry.width - .5;
    zoomOut.disabled = whole;
    zoomIn.disabled = camera[2] <= geometry.width / MAX_ZOOM + .5;
    svg.classList.toggle('map-pannable', !whole);
    svg.style.touchAction = whole ? '' : 'none';
  }

  function drawCamera(bounds) {
    camera = bounds;
    svg.setAttribute('viewBox', bounds.join(' '));
    syncScale();
    syncTools();
  }

  function flyTo(target, immediate = false, duration = 460) {
    cancelAnimationFrame(cameraFrame);
    cameraFrame = null;
    destination = target;
    if (immediate || reducedMotion.matches) {
      drawCamera(target);
      return;
    }
    const from = camera;
    const started = performance.now();
    function advance(now) {
      const portion = Math.min(1, Math.max(0, (now - started) / duration));
      const eased = 1 - (1 - portion) ** 3;
      drawCamera(portion === 1 ? target : from.map((value, i) => value + (target[i] - value) * eased));
      cameraFrame = portion < 1 ? requestAnimationFrame(advance) : null;
    }
    cameraFrame = requestAnimationFrame(advance);
  }

  function place(x, y, width, animate) {
    const height = width * geometry.height / geometry.width;
    const next = [clamp(x, 0, geometry.width - width), clamp(y, 0, geometry.height - height), width, height];
    if (animate) flyTo(next, false, 260);
    else {
      cancelAnimationFrame(cameraFrame);
      cameraFrame = null;
      destination = next;
      drawCamera(next);
    }
  }

  function zoomBy(factor, focus, animate = true) {
    const [x, y, width, height] = camera;
    const target = clamp(width / factor, geometry.width / MAX_ZOOM, geometry.width);
    const ratio = target / width;
    const [fx, fy] = focus ?? [x + width / 2, y + height / 2];
    place(fx - (fx - x) * ratio, fy - (fy - y) * ratio, target, animate);
  }

  function panBy(dx, dy) {
    const scale = pixelScale();
    place(camera[0] - dx / scale, camera[1] - dy / scale, camera[2], false);
  }

  function moveCamera(id) {
    if (id === cameraCity) return;
    cameraCity = id;
    let target = overview;
    if (id) {
      const { x, y, width, height } = groups.get(id).querySelector('.municipal-fill').getBBox();
      const ratio = geometry.width / geometry.height;
      const frameWidth = Math.min(geometry.width, Math.max(100, 1.62 * width, 1.62 * height * ratio));
      const frameHeight = frameWidth / ratio;
      target = [
        clamp(x + (width - frameWidth) / 2, 0, geometry.width - frameWidth),
        clamp(y + (height - frameHeight) / 2, 0, geometry.height - frameHeight),
        frameWidth, frameHeight,
      ];
    }
    $('mapViewStatus').textContent = id ? `Mapa aproximado em ${cities[id].name}.` : 'Mapa enquadrado em Goiás inteiro.';
    flyTo(target);
  }

  const hint = document.createElement('p');
  hint.className = 'map-hint';
  hint.setAttribute('aria-hidden', 'true');
  stage.append(hint);

  function showHint() {
    if (hintCount >= 3) return;
    hintCount += 1;
    const key = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl';
    hint.textContent = `Use ${key} + rolagem para ampliar o mapa`;
    hint.classList.add('is-visible');
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => hint.classList.remove('is-visible'), 1500);
  }

  new ResizeObserver(syncScale).observe(svg);
  syncScale();
  syncTools();

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

  /* ---------- Leitura em destaque (canto do mapa) ---------- */

  function showPreview() {
    const { statewide, city, mapFocus, entries, selected, display } = lastReading;
    const inspected = hovered || focused || mapFocus;
    const id = inspected || city;
    const entry = statewide ? selected : entries.find(item => item.id === id);
    const showState = !statewide && !inspected;
    const place = statewide || showState ? 'Estado de Goiás' : cities[id].name;
    const context = statewide ? 'Monitor de Secas' : showState ? 'Municípios da planilha' : `Região ${cities[id].region}`;
    const invite = statewide || showState ? '' : entry.value === null
      ? '<small>Sem dados neste mês</small>'
      : hovered && hovered !== mapFocus ? '<small>Clique para ampliar</small>' : '';
    const present = entries.filter(item => item.value !== null).length;
    const label = showState ? (present ? `${present} de ${entries.length} com dados` : 'Sem dados') : display(entry.value);
    preview.innerHTML = `<div><strong>${escape(place)}</strong><span>${escape(context)}</span>${invite}</div>
      <p>${escape(label)}</p>`;
  }

  /* ---------- Seleção ---------- */

  function choose(id) {
    if (groups.get(id).getAttribute('aria-disabled') === 'true') return;
    cameraCity = null; // força o reenquadramento mesmo se o município já estava em foco
    selectCity(id);
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
    if (dragged) {
      dragged = false;
      return;
    }
    const marker = event.target.closest('[data-map-city]');
    if (marker) choose(marker.dataset.mapCity);
  });
  svg.addEventListener('dblclick', event => {
    if (event.target.closest('[data-map-city]')) return;
    zoomBy(2, toSvg(event.clientX, event.clientY));
  });
  $('mapRanking').addEventListener('click', event => {
    const button = event.target.closest('[data-rank-city]');
    if (button) choose(button.dataset.rankCity);
  });

  /* ---------- Zoom, arrastar e atalhos ---------- */

  zoomIn.addEventListener('click', () => zoomBy(ZOOM_STEP));
  zoomOut.addEventListener('click', () => zoomBy(1 / ZOOM_STEP));
  reset.addEventListener('click', () => {
    cameraCity = null;
    $('mapViewStatus').textContent = 'Mapa enquadrado em Goiás inteiro.';
    flyTo(overview);
  });

  svg.addEventListener('wheel', event => {
    if (!(event.ctrlKey || event.metaKey)) {
      showHint();
      return;
    }
    event.preventDefault();
    const speed = event.deltaMode === 1 ? .05 : .0022;
    zoomBy(Math.exp(-event.deltaY * speed), toSvg(event.clientX, event.clientY), false);
  }, { passive: false });

  function pinchState() {
    const [a, b] = [...pointers.values()];
    return { distance: Math.hypot(a.x - b.x, a.y - b.y), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }

  svg.addEventListener('pointerdown', event => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    dragged = false;
    if (pointers.size === 1) drag = { x: event.clientX, y: event.clientY, active: false };
    if (pointers.size === 2) {
      pinch = pinchState();
      drag = null;
    }
  });

  svg.addEventListener('pointermove', event => {
    const previous = pointers.get(event.pointerId);
    if (!previous) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 2 && pinch) {
      const now = pinchState();
      if (pinch.distance) zoomBy(now.distance / pinch.distance, toSvg(now.x, now.y), false);
      panBy(now.x - pinch.x, now.y - pinch.y);
      pinch = now;
      dragged = true;
      return;
    }
    if (!drag || camera[2] >= geometry.width - .5) return;
    if (!drag.active) {
      if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < DRAG_THRESHOLD) return;
      drag.active = true;
      svg.setPointerCapture(event.pointerId);
      svg.classList.add('map-dragging');
    }
    dragged = true;
    panBy(event.clientX - previous.x, event.clientY - previous.y);
  });

  function release(event) {
    pointers.delete(event.pointerId);
    if (pointers.size < 2) pinch = null;
    if (!pointers.size) {
      drag = null;
      svg.classList.remove('map-dragging');
      if (dragged) setTimeout(() => { dragged = false; }, 60);
    }
  }
  svg.addEventListener('pointerup', release);
  svg.addEventListener('pointercancel', release);
  svg.addEventListener('lostpointercapture', release);
  svg.addEventListener('pointerleave', event => {
    if (!svg.hasPointerCapture(event.pointerId)) release(event);
  });

  svg.addEventListener('keydown', event => {
    if (event.target.dataset.mapCity && ['Enter', ' '].includes(event.key)) {
      event.preventDefault();
      choose(event.target.dataset.mapCity);
      return;
    }
    const pan = { ArrowLeft: [100, 0], ArrowRight: [-100, 0], ArrowUp: [0, 100], ArrowDown: [0, -100] }[event.key];
    if (pan && camera[2] < geometry.width - .5) {
      event.preventDefault();
      panBy(...pan);
    } else if (event.key === '+' || event.key === '=') {
      event.preventDefault();
      zoomBy(ZOOM_STEP);
    } else if (event.key === '-' || event.key === '_') {
      event.preventDefault();
      zoomBy(1 / ZOOM_STEP);
    } else if (event.key === '0' || event.key === 'Escape') {
      reset.click();
    }
  });

  /* ---------- Desenho ---------- */

  return function draw({ scope, city, mapFocus, entries, selected, maximum, tone, display, categories, numeric, date, metric }) {
    const statewide = scope === 'state';
    const entersStatewide = statewide && !lastReading?.statewide;
    const key = `${date}/${metric}/${city}`;
    const changed = key !== effectKey;
    const animate = changed && !reducedMotion.matches;
    effectKey = key;
    lastReading = { statewide, city, mapFocus, entries, selected, display };
    svg.classList.toggle('map-state-only', statewide);
    svg.classList.toggle('map-zoomed', Boolean(mapFocus));
    svg.classList.toggle('map-state-selected', !mapFocus);
    reset.setAttribute('aria-pressed', String(!mapFocus));
    svg.querySelector('.municipal-group').classList.toggle('map-group-hidden', statewide);
    $('mapComparison').hidden = statewide;
    $('map-title').textContent = statewide ? 'Goiás · escala estadual' : mapFocus ? cities[mapFocus].name : 'Mapa de Goiás';
    $('mapSvgTitle').textContent = mapFocus ? `${cities[mapFocus].name} e arredores` : 'Mapa de Goiás';
    if (entersStatewide) {
      cameraCity = null;
      flyTo(overview, true);
    } else {
      moveCamera(mapFocus);
    }
    $('mapMetric').textContent = metric;
    stamp.textContent = date;
    $('mapScope').textContent = statewide ? 'Classificação estadual' : `${entries.filter(entry => entry.value !== null).length} de ${entries.length} municípios com registro`;
    showPreview();
    if (changed) stamp.getAnimations().forEach(animation => animation.cancel());
    if (animate) {
      stamp.animate([{ opacity: .55, transform: 'translateY(3px)' }, { opacity: 1, transform: 'none' }], { duration: 240, easing: 'ease-out' });
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
    const classOf = value => hasNumeric ? Math.min(STEPS - 1, Math.floor(value / maximum * STEPS)) : 0;
    const ranking = [...entries].sort((a, b) => {
      if (isNumber(a.value) && isNumber(b.value)) return b.value - a.value;
      return Number(a.value === null) - Number(b.value === null);
    });

    const steps = Array.from({ length: STEPS }, (_, i) =>
      `<b style="--step:${tint(i)}%" title="${escape(display(maximum * i / STEPS))} a ${escape(display(maximum * (i + 1) / STEPS))}"></b>`).join('');
    $('mapLegend').innerHTML = hasNumeric
      ? `<span class="map-scale" style="--map-tone:${tone}"><span>0</span><span class="map-steps">${steps}</span><span>${escape(display(maximum))}</span></span><span class="map-key"><i></i> Sem valor</span>`
      : ['described', 'limited'].map(item => `<span class="map-key" style="--swatch:${categories[item][1]}"><i></i> ${escape(categories[item][0])}</span>`).join('') + '<span class="map-key"><i></i> Sem registro</span>';

    $('mapRanking').innerHTML = ranking.map(entry => {
      const value = entry.value === null ? 'Sem dados' : isNumber(entry.value) ? display(entry.value) : 'Com registro';
      const fill = isNumber(entry.value) && hasNumeric ? entry.value / maximum * 100 : 0;
      return `<button type="button" data-rank-city="${entry.id}" aria-pressed="${entry.id === mapFocus}"${entry.value === null ? ' class="unavailable" disabled title="Sem valor disponível neste mês"' : ''}><span>${escape(cities[entry.id].name)}</span><strong>${escape(value)}</strong><i aria-hidden="true" style="--fill:${fill}%"></i></button>`;
    }).join('');
    if (focus) $('mapRanking').querySelector(`[data-rank-city="${focus}"]`)?.focus({ preventScroll: true });

    for (const entry of entries) {
      const node = groups.get(entry.id);
      const measured = isNumber(entry.value);
      const available = entry.value !== null;
      const fill = !available ? 'url(#mapGap)'
        : measured ? `color-mix(in srgb, ${tone} ${tint(classOf(entry.value))}%, var(--map-ramp-base))`
          : categories[entry.category]?.[1] ?? '#b5d8c1';
      node.setAttribute('aria-pressed', String(entry.id === mapFocus));
      node.classList.toggle('map-reference', !mapFocus && entry.id === city);
      const outsideFocus = mapFocus && mapFocus !== entry.id;
      node.tabIndex = outsideFocus || !available ? -1 : 0;
      node.setAttribute('aria-disabled', String(!available));
      if (outsideFocus) node.setAttribute('aria-hidden', 'true');
      else node.removeAttribute('aria-hidden');
      node.classList.toggle('map-marker-missing', !available);
      node.style.setProperty('--city-fill', fill);
      node.style.setProperty('--marker-tone', tone);
      node.querySelector('.marker-reading').textContent = !available ? 'Sem dados' : measured ? display(entry.value) : 'Registro';
      node.querySelector('title').textContent = `${cities[entry.id].name} · ${display(entry.value)}`;
      node.setAttribute('aria-label', `${cities[entry.id].name} · ${display(entry.value)}${available ? '. Selecionar município.' : ''}`);
    }
  };
}
