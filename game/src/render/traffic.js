// Самолёты и дроны: стабильный выбор спрайта по точке рождения и лёгкая анимация (винты, двигатели, огни).
// Арт — физический объект; движение и свет принадлежат коду (уроки art/PROGRESS.md).

import {
  AIRCRAFT_DISPLAY_WIDTH, AIRCRAFT_LAYERS, AIRCRAFT_PREVIOUS_ERA_MIX, BASE_DRONES, eraYear,
} from './manifest.js';
import { hash2 } from './util.js';

function weighted(weights, r) {
  let acc = 0;
  let last = null;
  for (const [id, w] of Object.entries(weights)) {
    acc += w;
    last = id;
    if (r < acc) return id;
  }
  return last;
}

/** Слой самолётов для высоты (ед. мира) или null, если здесь самолётов нет. */
export function aircraftLayer(alt) {
  return AIRCRAFT_LAYERS.find((layer) => alt >= layer.min && alt < layer.max) || null;
}

/**
 * Стабильный выбор самолёта по точке рождения (origin) и эпохе: линейка (low_primary...) и год.
 * Перемещение самолёта не меняет выбор; доля предыдущей эпохи — 18 %.
 * Возвращает { lineage, era, name } или null.
 */
export function aircraftChoice(originX, originY, era) {
  const layer = aircraftLayer(originY);
  if (!layer) return null;
  const lineage = weighted(layer.weights, hash2(Math.floor(originX * 8), Math.floor(originY * 8), 13));
  const useEra = era > 0 && hash2(Math.floor(originX * 8), Math.floor(originY * 8), 77) < AIRCRAFT_PREVIOUS_ERA_MIX ? era - 1 : era;
  return { lineage, era: useEra, name: `${lineage}_${eraYear(useEra)}` };
}

/** Линейка самолёта по принудительному типу ('low'|'medium'|'high'|имя) и высоте. */
export function lineageFor(kindHint, originX, originY) {
  if (kindHint && AIRCRAFT_DISPLAY_WIDTH[kindHint]) return kindHint;
  const layer = aircraftLayer(originY) || AIRCRAFT_LAYERS[0];
  let weights = layer.weights;
  if (kindHint === 'low') weights = { low_primary: 0.7, low_multiwing: 0.3 };
  else if (kindHint === 'medium') weights = { medium_passenger: 0.55, medium_cargo: 0.45 };
  else if (kindHint === 'high') weights = { high_fighter: 0.65, high_experimental: 0.35 };
  return weighted(weights, hash2(Math.floor(originX * 8), Math.floor(originY * 8), 13));
}

function point(dx, dy, dw, dh, p) {
  return [dx + p[0] * dw, dy + p[1] * dh];
}

/**
 * Самолёт: спрайт и поверх код-эффекты (винты, струи двигателей, мигающие огни).
 * width — ширина в единицах мира (по умолчанию из AIRCRAFT_DISPLAY_WIDTH); dir = ±1.
 */
export function drawAircraft(ctx, painter, view, name, lineage, wx, wy, dir, time, width) {
  const asset = painter.assets.get(name);
  if (!asset) return false;
  const w = width || AIRCRAFT_DISPLAY_WIDTH[lineage] || 110;
  const h = w * asset.h / asset.w;
  const fx = painter.assets.json('aircraft_fx');
  const profile = fx && fx.profiles[fx.sprites[name]];
  const sx = view.sx(wx);
  const sy = view.sy(wy);
  ctx.save();
  ctx.translate(sx, sy);
  if (dir < 0) ctx.scale(-1, 1);
  const S = view.S;
  const dw = Math.round(w * S);
  const dh = Math.round(h * S);
  const dx = -Math.round(dw / 2);
  const dy = -Math.round(dh / 2);
  if (profile) drawBehind(ctx, profile, dx, dy, dw, dh, view, time, wy);
  ctx.drawImage(painter.source(asset, w * view.px, h * view.px), dx, dy, dw, dh);
  if (profile) drawFront(ctx, profile, dx, dy, dw, dh, view, time);
  ctx.restore();
  return true;
}

const ENGINE_FLAME = {
  earlyJet: ['#f2a253', '#ffe4a3', 10, 0.72],
  rocketWarm: ['#f2a253', '#ffe4a3', 18, 0.72],
  fighterJet: ['#e56d45', '#8fdff2', 12, 0.62],
  modernAfterburner: ['#e75b43', '#62d8f2', 22, 0.64],
  plasmaBlue: ['#3e9fe6', '#8ff2ff', 25, 0.58],
};

function drawBehind(ctx, profile, dx, dy, dw, dh, view, time, worldAlt) {
  const S = view.S;
  const type = profile.engineType || '';
  ctx.lineCap = 'round';
  if (worldAlt >= 600 && profile.contrailPoints && profile.contrailPoints.length) {
    ctx.globalAlpha = 0.12 + Math.min(0.18, (worldAlt - 600) / 8000);
    ctx.strokeStyle = '#e9f5f5';
    ctx.lineWidth = Math.max(1, view.px);
    ctx.beginPath();
    for (const p of profile.contrailPoints) {
      const [x, y] = point(dx, dy, dw, dh, p);
      const len = Math.min(55, 14 + (worldAlt - 600) / 90) * S;
      ctx.moveTo(x, y);
      ctx.lineTo(x - len, y);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  for (const p of profile.engines || []) {
    const [x, y] = point(dx, dy, dw, dh, p);
    const pulse = 0.85 + 0.15 * Math.sin(time * 18 + p[1] * 11);
    if (type === 'civilJet') {
      ctx.globalAlpha = 0.16;
      ctx.strokeStyle = '#b9d7df';
      ctx.lineWidth = Math.max(1, view.px);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - (10 + pulse * 3) * S, y);
      ctx.stroke();
      ctx.globalAlpha = 1;
      continue;
    }
    const spec = ENGINE_FLAME[type];
    if (!spec) continue;
    ctx.globalAlpha = spec[3];
    ctx.fillStyle = spec[0];
    ctx.beginPath();
    ctx.moveTo(x, y - 2 * S);
    ctx.lineTo(x - spec[2] * pulse * S, y);
    ctx.lineTo(x, y + 2 * S);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = spec[1];
    ctx.fillRect(Math.round(x - 5 * pulse * S), Math.round(y - S), Math.round(4 * S), Math.max(1, Math.round(2 * S)));
    ctx.globalAlpha = 1;
  }
}

function drawFront(ctx, profile, dx, dy, dw, dh, view, time) {
  const px = view.px;
  for (const p of profile.propellers || []) {
    const [x, y] = point(dx, dy, dw, dh, p);
    const r = Math.max(5 * px, p[2] * dh);
    const a = time * 35 + p[0] * 7;
    ctx.globalAlpha = 0.18;
    ctx.strokeStyle = '#e8dfbf';
    ctx.lineWidth = Math.max(1, px);
    ctx.beginPath();
    ctx.ellipse(x, y, Math.max(2, r * 0.22), r, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = '#b99a64';
    ctx.beginPath();
    for (const turn of [0, Math.PI / 2]) {
      ctx.moveTo(x + Math.cos(a + turn) * r * 0.22, y + Math.sin(a + turn) * r);
      ctx.lineTo(x - Math.cos(a + turn) * r * 0.22, y - Math.sin(a + turn) * r);
    }
    ctx.stroke();
  }
  for (const p of profile.fans || []) {
    const [x, y] = point(dx, dy, dw, dh, p);
    const r = Math.max(2 * px, dh * 0.045);
    const a = time * 50 + p[0] * 9;
    ctx.globalAlpha = 0.65;
    ctx.strokeStyle = '#b7c8c9';
    ctx.lineWidth = Math.max(1, px * 0.8);
    ctx.beginPath();
    for (let i = 0; i < 3; i++) {
      const aa = a + (i * Math.PI * 2) / 3;
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(aa) * r, y + Math.sin(aa) * r);
    }
    ctx.stroke();
  }
  const on = Math.floor(time * 1000 / 260) % 4 === 0;
  for (const p of profile.navLights || []) {
    const [x, y] = point(dx, dy, dw, dh, p);
    ctx.globalAlpha = on ? 1 : 0.22;
    ctx.fillStyle = p[2] === 'red' ? '#ff5b57' : p[2] === 'green' ? '#70ef9a' : '#eefcff';
    ctx.fillRect(Math.round(x) - px, Math.round(y) - px, 2 * px, 2 * px);
  }
  ctx.globalAlpha = 1;
}

/** Фоновый дрон хаба: неподвижный корпус арта, вентиляторы рисуются кодом. */
export function drawDrone(ctx, painter, view, index, wx, wy, widthUnits, time) {
  const part = BASE_DRONES[index % BASE_DRONES.length];
  const asset = painter.assets.get(part.name);
  if (!asset) return false;
  const h = widthUnits * part.size[1] / part.size[0];
  const sx = view.sx(wx);
  const sy = view.sy(wy);
  const dw = Math.round(widthUnits * view.S);
  const dh = Math.round(h * view.S);
  const left = sx - Math.round(dw / 2);
  const top = sy - Math.round(dh / 2);
  ctx.drawImage(painter.source(asset, widthUnits * view.px, h * view.px), left, top, dw, dh);
  const f = dw / part.size[0];
  ctx.save();
  ctx.strokeStyle = '#97aeb9';
  ctx.lineWidth = Math.max(1, view.px * 0.7);
  for (let i = 0; i < part.fans.length; i++) {
    const [fx, fy, r] = part.fans[i];
    ctx.save();
    ctx.translate(left + fx * f, top + fy * f);
    ctx.scale(1, 0.28);
    ctx.rotate(time * 37 + i * 1.7);
    ctx.beginPath();
    for (let k = 0; k < 3; k++) {
      const a = (k * Math.PI * 2) / 3;
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a) * r * f, Math.sin(a) * r * f);
    }
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
  return true;
}

