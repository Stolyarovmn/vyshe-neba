// Стенд предпросмотра рендера: хаб и полёт на синтетических данных (stub-flight.js).
// Параметры адреса: mode, frame, era, buildings (all|none|a,b), level, selected, weather, reduce,
// body, scenario, alt, thr, ang, stage, objs, t (заморозить время), dpr.

import { createRenderer, loadAssets, manifest } from '../index.js';
import { createStubFlight } from './stub-flight.js';

const params = new URLSearchParams(location.search);
const $ = (id) => document.getElementById(id);
const BUILDINGS = manifest.BUILDING_KEYS;

const ui = {
  mode: $('mode'), frameSel: $('frameSel'), era: $('era'), weather: $('weather'), reduce: $('reduce'),
  selected: $('selected'), level: $('level'), booster: $('booster'), capsuleP: $('capsuleP'),
  body: $('body'), scenario: $('scenario'), alt: $('alt'), altv: $('altv'), thr: $('thr'), ang: $('ang'),
  objs: $('objs'), stage: $('stage'),
};

const owned = new Set(params.get('buildings') === 'none' ? [] : params.get('buildings') === 'all' || !params.get('buildings') ? BUILDINGS.slice(0, 6) : params.get('buildings').split(','));
for (const key of ['mode', 'era', 'weather', 'level', 'body', 'scenario', 'alt', 'thr', 'ang', 'stage']) {
  if (params.has(key)) ui[key].value = params.get(key);
}
if (params.has('frame')) ui.frameSel.value = params.get('frame');
if (params.has('reduce')) ui.reduce.checked = params.get('reduce') === '1';
if (params.has('booster')) ui.booster.checked = params.get('booster') === '1';
if (params.has('capsule')) ui.capsuleP.checked = params.get('capsule') === '1';
if (params.get('objs') === '0') ui.objs.checked = false;

for (const key of BUILDINGS) {
  const label = document.createElement('label');
  const box = document.createElement('input');
  box.type = 'checkbox';
  box.checked = owned.has(key);
  box.addEventListener('change', () => (box.checked ? owned.add(key) : owned.delete(key)));
  label.append(box, key);
  $('buildings').append(label);
  const option = document.createElement('option');
  option.value = key;
  option.textContent = key;
  ui.selected.append(option);
}
if (params.has('selected')) ui.selected.value = params.get('selected');
$('allB').onclick = () => setAllBuildings(true);
$('noB').onclick = () => setAllBuildings(false);

function setAllBuildings(on) {
  owned.clear();
  if (on) BUILDINGS.forEach((key) => owned.add(key));
  [...$('buildings').querySelectorAll('input')].forEach((box, i) => (box.checked = on && !!BUILDINGS[i]));
}

if (params.get('buildings') === 'all') setAllBuildings(true);
else if (params.get('buildings') && params.get('buildings') !== 'none') {
  [...$('buildings').querySelectorAll('input')].forEach((box, i) => (box.checked = owned.has(BUILDINGS[i])));
}

const canvas = $('canvas');
const hud = $('hud');
let renderer = null;
let layout = null;
let frame = { w: 960, h: 540, dpr: 2 };
const stub = createStubFlight();
const pendingEvents = [];

function applyFrame() {
  const [size, dprText] = ui.frameSel.value.split('@');
  const [w, h] = size.split('x').map(Number);
  const dpr = params.has('dpr') ? Number(params.get('dpr')) : Number(dprText);
  frame = { w, h, dpr };
  $('frame').style.width = `${w}px`;
  $('frame').style.height = `${h}px`;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  if (renderer) layout = renderer.layout(w, h, dpr, { t: 0, r: 0, b: 0, l: 0 });
}

function profileFromUi() {
  const era = Number(ui.era.value);
  const level = ui.level.value === 'auto' ? era + 1 : Number(ui.level.value);
  const buildings = {};
  for (const key of BUILDINGS) buildings[key] = owned.has(key) ? level : 0;
  return {
    era,
    skin: params.get('skin') || 'classic',
    buildings,
    parts: { booster: ui.booster.checked ? 1 : 0, capsule: ui.capsuleP.checked ? 1 : 0 },
  };
}

function settings() {
  return { reduceMotion: ui.reduce.checked };
}

let frozen = params.has('t') ? Number(params.get('t')) : null;
let last = performance.now();
let clock = 0;

function tick(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  clock += dt;
  const time = frozen !== null ? frozen : clock;
  if (renderer && layout) {
    const ctx = canvas.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const weather = { kind: ui.weather.value, wind: ui.weather.value === 'storm' ? 6 : 2, storm: ui.weather.value === 'storm' ? 1 : 0 };
    if (ui.mode.value === 'hub') {
      renderer.hub.draw(ctx, { profile: profileFromUi(), time, layout, weather, selected: ui.selected.value || null });
      hud.textContent = `hub px=${layout.world.hubPx} ${layout.orientation} ${layout.w}x${layout.h}@${layout.dpr}`;
    } else if (renderer.flight) {
      const scenario = ui.scenario.value;
      const state = stub.update(frozen !== null ? 1 / 60 : dt, {
        scenario, body: ui.body.value, era: Number(ui.era.value), alt: Number(ui.alt.value), throttle: Number(ui.thr.value),
        angle: Number(ui.ang.value), stage: ui.stage.value, weather, objects: ui.objs.checked, time,
      });
      ui.altv.textContent = Math.round(state.flight.alt);
      if (pendingEvents.length) renderer.events(pendingEvents.splice(0), state.flight);
      if (state.events.length) renderer.events(state.events, state.flight);
      renderer.flight.draw(ctx, {
        flight: state.flight, config: state.config, time, layout, settings: settings(), profile: profileFromUi(), dt: frozen !== null ? 1 / 60 : undefined,
      });
      hud.textContent = `flight ${state.flight.body} ${state.flight.phase} alt=${Math.round(state.flight.alt)} v=${state.flight.speed.toFixed(1)} px=${layout.world.px}`;
    }
  }
  requestAnimationFrame(tick);
}

$('evBtn').onclick = () => pendingEvents.push({ type: 'hit' });
$('sepBtn').onclick = () => pendingEvents.push({ type: 'stage-sep', stage: 'booster' });

function attachDrag() {
  let drag = null;
  canvas.addEventListener('pointerdown', (e) => {
    drag = { x: e.clientX, moved: 0 };
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag || ui.mode.value !== 'hub') return;
    renderer.hub.pan(e.clientX - drag.x);
    drag.moved += Math.abs(e.clientX - drag.x);
    drag.x = e.clientX;
  });
  canvas.addEventListener('pointerup', (e) => {
    if (drag && drag.moved < 4 && ui.mode.value === 'hub') {
      const rect = canvas.getBoundingClientRect();
      const hit = renderer.hub.hitTest(e.clientX - rect.left, e.clientY - rect.top);
      ui.selected.value = hit && hit !== 'rocket' ? hit : '';
      $('status').textContent = `тап: ${hit}`;
    }
    drag = null;
  });
}

function syncPanels() {
  const flight = ui.mode.value === 'flight';
  $('hubControls').hidden = flight;
  $('flightControls').hidden = !flight;
}

async function start() {
  $('status').textContent = 'загрузка…';
  const assets = await loadAssets(manifest);
  $('status').textContent = assets.errors.length ? `ошибок ассетов: ${assets.errors.length}` : `ассетов: ${assets.size}`;
  renderer = createRenderer(canvas, assets);
  window.__preview = { renderer, assets, ui, owned, stub, state: () => stub.last, events: (list) => pendingEvents.push(...list), setFrozen: (t) => { frozen = t; } };
  applyFrame();
  syncPanels();
  if (params.has('focus')) renderer.hub.focus(params.get('focus').match(/^-?\d+(\.\d+)?$/) ? Number(params.get('focus')) : params.get('focus'), true);
  attachDrag();
  requestAnimationFrame(tick);
  document.title = 'Render preview ready';
}

ui.frameSel.addEventListener('change', applyFrame);
ui.mode.addEventListener('change', syncPanels);
ui.scenario.addEventListener('change', () => stub.reset());
ui.body.addEventListener('change', () => stub.reset());
ui.stage.addEventListener('change', () => stub.reset());
window.addEventListener('error', (e) => {
  $('status').textContent = `ОШИБКА: ${e.message}`;
});
window.addEventListener('unhandledrejection', (e) => {
  $('status').textContent = `ОШИБКА: ${e.reason && e.reason.message ? e.reason.message : e.reason}`;
});
start();
