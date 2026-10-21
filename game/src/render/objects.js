// Объекты полёта: самолёты, шары, камни, спутники, монеты, топливо, ремкомплекты, кольца.
// Опираются на поля sim: kind, lineage, gen (поколение техники 0..5), r, dir, phase, id, marked.

import {
  AIRCRAFT_DISPLAY_WIDTH, BALLOON_FULL_SIZES, BALLOON_PART_BOXES, BALLOON_PART_SIZES, SATELLITE_PANELS, eraYear, spriteName,
} from './manifest.js';
import { drawAircraft } from './traffic.js';
import { createRingCache, drawRingGhosts, drawRingLayer, ringGlow } from './rings.js';
import { clamp, hash2, TAU } from './util.js';

const BALLOON_HEIGHT = { low: 84, mid: 96, high: 108 };
const SATELLITE_WIDTH = 56;
const PANEL_WIDTH_RATIO = 46 / 38;

function cull(view, x, y, margin) {
  return x < view.left - margin || x > view.right + margin || y < view.top - margin || y > view.bottom + margin;
}

function generation(o, era) {
  return Number.isInteger(o.gen) ? clamp(o.gen, 0, 5) : era;
}

/**
 * Поза шара: оболочка слегка качается, гондола висит как маятник на стропах и запаздывает по фазе.
 * Углы в радианах (положительный — по часовой стрелке), чистая функция для тестов.
 */
export function balloonSwing(o, time, out = { envelope: 0, pod: 0 }) {
  const sway = Math.sin(time * 1.6 + (o.phase || 0) * TAU) * 0.045;
  out.envelope = sway * 0.5;
  out.pod = sway + Math.sin(time * 2.1 + (o.phase || 0) * TAU - 0.9) * 0.1;
  return out;
}

/** Геометрия частей шара эры g при высоте целого спрайта h (ед. мира): размеры, зазор подвеса и сдвиг гондолы. */
export function balloonRig(g, h, out = {}) {
  const [fullW, fullH] = BALLOON_FULL_SIZES[g];
  const k = h / fullH;
  const env = BALLOON_PART_BOXES.envelope[g];
  const pod = BALLOON_PART_BOXES.pod[g];
  const [envW, envH] = BALLOON_PART_SIZES.envelope[g];
  const [podW, podH] = BALLOON_PART_SIZES.pod[g];
  out.k = k;
  out.width = fullW * k;
  out.height = h;
  out.envW = envW * k;
  out.envH = envH * k;
  out.podW = podW * k;
  out.podH = podH * k;
  out.pivotX = ((env[0] + env[2]) / 2 - 0.5) * fullW * k; // низ оболочки по центру, от центра целого спрайта
  out.pivotY = (env[3] - 0.5) * h;
  out.gap = (pod[1] - env[3]) * h; // длина строп
  out.podShift = ((pod[0] + pod[2]) / 2 - (env[0] + env[2]) / 2) * fullW * k;
  return out;
}

const swing = { envelope: 0, pod: 0 };
const rig = {};
const ROPE_COLOR = 'rgba(58,52,48,0.9)';

function rotatePoint(x, y, angle, ox, oy, out) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  out[0] = ox + x * c - y * s;
  out[1] = oy + x * s + y * c;
  return out;
}

const ropeA = [0, 0];
const ropeB = [0, 0];

/** Запасной вид шара без арта: светлая оболочка, стропы и тёмная гондола (качается как маятник). */
function drawBalloonFallback(ctx, view, o, h, time) {
  const sway = balloonSwing(o, time, swing);
  const cx = view.sx(o.x);
  const top = view.sy(o.y - h * 0.5);
  const envelopeH = h * 0.58;
  const envelopeW = h * 0.52;
  ctx.save();
  ctx.fillStyle = '#e9e4da';
  ctx.beginPath();
  ctx.ellipse(cx, top + (envelopeH * view.S) / 2, (envelopeW * view.S) / 2, (envelopeH * view.S) / 2, sway.envelope, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = ROPE_COLOR;
  ctx.lineWidth = Math.max(1, view.px);
  ctx.beginPath();
  const podX = cx + Math.sin(sway.pod) * h * 0.35 * view.S;
  const podY = top + envelopeH * view.S + h * 0.28 * view.S;
  ctx.moveTo(cx - envelopeW * 0.2 * view.S, top + envelopeH * view.S * 0.92);
  ctx.lineTo(podX, podY);
  ctx.moveTo(cx + envelopeW * 0.2 * view.S, top + envelopeH * view.S * 0.92);
  ctx.lineTo(podX, podY);
  ctx.stroke();
  ctx.fillStyle = '#2a2c31';
  ctx.fillRect(podX - h * 0.07 * view.S, podY, h * 0.14 * view.S, h * 0.12 * view.S);
  ctx.restore();
}

function drawBalloon(ctx, painter, view, o, era, time) {
  const g = generation(o, era);
  const year = eraYear(g);
  const envelope = `balloon_${year}_envelope`;
  const pod = `balloon_${year}_pod`;
  const h = BALLOON_HEIGHT[o.lineage] || 90;
  if (!painter.has(envelope) || !painter.has(pod)) {
    drawBalloonFallback(ctx, view, o, h, time);
    return;
  }
  balloonRig(g, h, rig);
  balloonSwing(o, time, swing);
  const px = o.x + rig.pivotX;
  const py = o.y + rig.pivotY;
  // стропы: три линии от нижнего кольца оболочки к верху гондолы (оба конца качаются со своими телами)
  ctx.save();
  ctx.strokeStyle = ROPE_COLOR;
  ctx.lineWidth = Math.max(1, Math.round(view.px * 0.9));
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (const side of [-1, 0, 1]) {
    rotatePoint(side * rig.envW * 0.17, -rig.envH * 0.02, swing.envelope, px, py, ropeA);
    rotatePoint(rig.podShift + side * rig.podW * 0.32, rig.gap, swing.pod, px, py, ropeB);
    ctx.moveTo(view.sx(ropeA[0]), view.sy(ropeA[1]));
    ctx.lineTo(view.sx(ropeB[0]), view.sy(ropeB[1]));
  }
  ctx.stroke();
  ctx.restore();
  painter.sprite(ctx, view, envelope, px, py, { w: rig.envW, ax: 0.5, ay: 1, angle: swing.envelope, smooth: true });
  painter.sprite(ctx, view, pod, px, py, {
    w: rig.podW, ax: 0.5 - rig.podShift / rig.podW, ay: -rig.gap / rig.podH, angle: swing.pod, smooth: true,
  });
}

/** Множитель диаметра камня к радиусу по классу размера sim. */
const ROCK_SCALE = { medium: 2.5, large: 2.7, huge: 2.9 };
/** Минимальный видимый диаметр астероида (ед. мира = игровые пиксели на базовом зуме). */
export const ROCK_MIN_DIAMETER = 60;

/** Диаметр прорисовки камня (ед. мира) по классу размера и радиусу sim; не меньше ROCK_MIN_DIAMETER. */
export function rockDiameter(o) {
  const radius = o.radius ?? o.r ?? 28;
  const scale = ROCK_SCALE[o.size] || ROCK_SCALE.medium;
  return Math.max(ROCK_MIN_DIAMETER, radius * scale);
}

/** Высота космоса в ед. мира: как SPACE_ALT в sim/bodies.js (тест сверяет значения). */
export const SPACE_ALT_UNITS = 10000;

/**
 * Материал астероида — индекс спрайта rock_N: 0 серый кратерный (Луна, космос), 1 тёмный железный с оранжевыми вкраплениями,
 * 2 красный марсианский, 3 ледяной. Луна — серый, Марс — красный, открытый космос Земли — железный или ледяной,
 * атмосфера Земли — по seed объекта.
 */
export function rockMaterial(o, body = 'earth') {
  if (body === 'moon') return 0;
  if (body === 'mars') return 2;
  const roll = hash2(o.id | 0, 5);
  if (-(o.y || 0) >= SPACE_ALT_UNITS) return roll < 0.5 ? 1 : 3;
  return Math.floor(roll * 4);
}

function drawAsteroid(ctx, painter, view, o, time, body) {
  const variant = rockMaterial(o, body);
  const spin = (variant % 2 ? 1 : -1) * time * 0.22 + (o.phase || 0) * TAU;
  painter.sprite(ctx, view, `rock_${variant}`, o.x, o.y, { w: rockDiameter(o), angle: spin });
}

function drawSatellite(ctx, painter, view, o, era, time) {
  const year = eraYear(generation(o, era));
  const index = clamp(generation(o, era), 0, 5);
  const body = painter.assets.get(`satellite_${year}`);
  if (!body) return;
  const data = SATELLITE_PANELS[index];
  const h = SATELLITE_WIDTH * body.h / body.w;
  const panelW = SATELLITE_WIDTH * PANEL_WIDTH_RATIO;
  for (const side of [-1, 1]) {
    const joint = data.joints[side < 0 ? 0 : 1];
    painter.sprite(ctx, view, `panel_${year}`, o.x + (joint[0] - 0.5) * SATELLITE_WIDTH, o.y + (joint[1] - 0.5) * h, {
      w: panelW, ax: data.root[0], ay: data.root[1], angle: side * (0.08 + 0.11 * Math.sin(time * 0.65)), flipX: side < 0,
    });
  }
  painter.sprite(ctx, view, `satellite_${year}`, o.x, o.y, { w: SATELLITE_WIDTH });
  const blink = Math.floor(time * 3) % 4 === 0;
  ctx.fillStyle = blink ? '#e8f3d2' : '#5c6a74';
  const sx = view.sx(o.x);
  const sy = view.sy(o.y - h * 0.4);
  const d = Math.max(2, Math.round(2 * view.S));
  ctx.fillRect(sx - (d >> 1), sy, d, d);
}

function drawCoin(ctx, painter, view, o, era, time) {
  const spin = 0.24 + 0.76 * Math.abs(Math.cos(time * 3 + (o.id | 0) * 0.7));
  const bob = Math.sin(time * 2.4 + (o.id | 0)) * 1.5;
  painter.sprite(ctx, view, spriteName('coin', era), o.x, o.y + bob, { w: 17 * spin, h: 18 });
}

function drawItem(ctx, painter, view, o, era, time) {
  const bob = Math.sin(time * 2.1 + (o.id | 0) * 1.3) * 2;
  const name = spriteName(o.kind, era);
  const asset = painter.assets.get(name);
  if (!asset) return;
  const bound = 40;
  const k = bound / Math.max(asset.w, asset.h);
  painter.sprite(ctx, view, name, o.x, o.y + bob, { w: asset.w * k, h: asset.h * k });
  // Лёгкий блик-подсказка: предмет можно взять.
  const twinkle = Math.sin(time * 4 + (o.id | 0)) > 0.8;
  if (twinkle) {
    ctx.fillStyle = '#ffffff';
    const sx = view.sx(o.x + 9);
    const sy = view.sy(o.y + bob - 12);
    const d = Math.max(2, Math.round(2 * view.S));
    ctx.fillRect(sx - d, sy, d * 3, d >> 1 || 1);
    ctx.fillRect(sx, sy - d, d >> 1 || 1, d * 3);
  }
}

function isHorizontalRing(o) {
  return o.orient === 'horizontal' || o.halfWidth > 0;
}

const ringCaches = new WeakMap();

/** Кэш мастер-текстур колец этого painter (строится при первом обращении по эпохе). */
export function ringCacheFor(painter) {
  let cache = ringCaches.get(painter);
  if (!cache) {
    cache = createRingCache(painter.makeCanvas);
    ringCaches.set(painter, cache);
  }
  return cache;
}

/** Заранее строит текстуру колец эпохи (вызывать при старте полёта, чтобы не было задержки в кадре). */
export function warmRings(painter, era) {
  ringCacheFor(painter).get(era);
}

/** Мягкое свечение вокруг вертикального кольца (запасной вид без orient: horizontal). */
function verticalGlow(ctx, view, o, time) {
  const pulse = 0.5 + 0.5 * Math.sin(time * 3.2 + (o.id | 0));
  const sx = view.sx(o.x);
  const sy = view.sy(o.y);
  const rx = 40 * view.S;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const glow = ctx.createRadialGradient(sx, sy, rx * 0.35, sx, sy, rx);
  glow.addColorStop(0, `rgba(120,220,255,${0.05 + 0.08 * pulse})`);
  glow.addColorStop(1, 'rgba(120,220,255,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(sx - rx, sy - rx, rx * 2, rx * 2);
  ctx.restore();
}

function drawVerticalRing(ctx, painter, view, o, era, time) {
  const name = spriteName('ring', era);
  const asset = painter.assets.get(name);
  const bound = 76;
  const k = asset ? bound / Math.max(asset.w, asset.h) : 1;
  verticalGlow(ctx, view, o, time);
  if (asset) painter.sprite(ctx, view, name, o.x, o.y, { w: asset.w * k, h: asset.h * k });
}

function drawRing(ctx, painter, view, o, era, time) {
  if (isHorizontalRing(o)) {
    ringGlow(ctx, view, o, time);
    drawRingLayer(ctx, painter, view, ringCacheFor(painter), o, era, time, 'back');
  } else {
    drawVerticalRing(ctx, painter, view, o, era, time);
  }
}

/**
 * Передние половины горизонтальных колец и вспышки пролёта (ringFx): рисуются поверх ракеты, чтобы она
 * пролетала «сквозь» отверстие. time нужен для огней.
 */
export function drawObjectsFront(ctx, painter, view, objects, era, ringFx, time = 0) {
  const cache = ringCacheFor(painter);
  if (objects && objects.length) {
    for (const o of objects) {
      if (!o.active || o.kind !== 'ring' || !isHorizontalRing(o) || cull(view, o.x, o.y, 140)) continue;
      drawRingLayer(ctx, painter, view, cache, o, era, time, 'front');
    }
  }
  if (ringFx && ringFx.ghosts.length) drawRingGhosts(ctx, painter, view, cache, ringFx, 'front', time);
}

/** Рисует все видимые объекты полёта (сзади вперёд: самолёты, шары, камни, спутники, предметы, кольца). */
export function drawObjects(ctx, painter, view, objects, era, time, ringFx, scene) {
  const body = (scene && scene.body) || 'earth';
  if (!objects || !objects.length) {
    if (ringFx && ringFx.ghosts.length) drawRingGhosts(ctx, painter, view, ringCacheFor(painter), ringFx, 'back', time);
    return;
  }
  for (let pass = 0; pass < 3; pass++) {
    if (pass === 1 && ringFx && ringFx.ghosts.length) drawRingGhosts(ctx, painter, view, ringCacheFor(painter), ringFx, 'back', time);
    for (const o of objects) {
      if (!o.active || cull(view, o.x, o.y, 140)) continue;
      switch (o.kind) {
        case 'plane':
          if (pass === 0) {
            const name = `${o.lineage}_${eraYear(generation(o, era))}`;
            drawAircraft(ctx, painter, view, name, o.lineage, o.x, o.y, o.dir || 1, time, AIRCRAFT_DISPLAY_WIDTH[o.lineage]);
          }
          break;
        case 'balloon':
          if (pass === 0) drawBalloon(ctx, painter, view, o, era, time);
          break;
        case 'asteroid':
          if (pass === 1) drawAsteroid(ctx, painter, view, o, time, body);
          break;
        case 'debris':
          if (pass === 1) drawSatellite(ctx, painter, view, o, era, time);
          break;
        case 'ring':
          if (pass === 1) drawRing(ctx, painter, view, o, era, time);
          break;
        case 'coin':
          if (pass === 2) drawCoin(ctx, painter, view, o, era, time);
          break;
        case 'fuel':
        case 'repair':
          if (pass === 2) drawItem(ctx, painter, view, o, era, time);
          break;
        default:
          break;
      }
    }
  }
}

const POINTER_LIMIT = 5;
const POINTER_RANGE = 700;
const nearest = { d: new Float32Array(POINTER_LIMIT), x: new Float32Array(POINTER_LIMIT), y: new Float32Array(POINTER_LIMIT), count: 0 };

function keepNearest(distance, sx, sy) {
  let i;
  if (nearest.count < POINTER_LIMIT) i = nearest.count++;
  else if (distance < nearest.d[POINTER_LIMIT - 1]) i = POINTER_LIMIT - 1;
  else return;
  while (i > 0 && nearest.d[i - 1] > distance) {
    nearest.d[i] = nearest.d[i - 1];
    nearest.x[i] = nearest.x[i - 1];
    nearest.y[i] = nearest.y[i - 1];
    i--;
  }
  nearest.d[i] = distance;
  nearest.x[i] = sx;
  nearest.y[i] = sy;
}

/**
 * Подсветка радаром: кольцо вокруг помеченных опасных объектов на экране и стрелки на краю кадра
 * для ближайших (не более пяти) за краем. Радар строится на базе: sim выставляет o.marked.
 */
export function drawRadarMarks(ctx, view, objects, time, anchorDev) {
  if (!objects) return;
  const px = view.px;
  const pulse = 0.55 + 0.45 * Math.sin(time * 6);
  nearest.count = 0;
  ctx.save();
  ctx.lineWidth = Math.max(1, px);
  ctx.strokeStyle = `rgba(255,170,60,${(0.45 + 0.4 * pulse).toFixed(2)})`;
  ctx.setLineDash([3 * px, 3 * px]);
  ctx.beginPath();
  for (const o of objects) {
    if (!o.active || !o.hazard || !o.marked) continue;
    const sx = view.sx(o.x);
    const sy = view.sy(o.y);
    const inside = sx > 0 && sx < view.devW && sy > 0 && sy < view.devH;
    if (inside) {
      ctx.moveTo(sx + (o.r + 8) * view.S, sy);
      ctx.arc(sx, sy, (o.r + 8) * view.S, 0, TAU);
    } else {
      const wx = o.x - view.camX;
      const wy = o.y - view.camY;
      const distance = Math.hypot(wx, wy);
      if (distance < POINTER_RANGE) keepNearest(distance, sx, sy);
    }
  }
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = `rgba(255,170,60,${(0.55 + 0.4 * pulse).toFixed(2)})`;
  for (let k = 0; k < nearest.count; k++) drawPointer(ctx, view, nearest.x[k], nearest.y[k], anchorDev, px);
  ctx.restore();
}

function drawPointer(ctx, view, sx, sy, anchorDev, px) {
  const dx = sx - anchorDev.x;
  const dy = sy - anchorDev.y;
  const len = Math.hypot(dx, dy) || 1;
  const margin = 22 * px;
  const scaleX = dx > 0 ? (view.devW - margin - anchorDev.x) / dx : dx < 0 ? (margin - anchorDev.x) / dx : Infinity;
  const scaleY = dy > 0 ? (view.devH - margin - anchorDev.y) / dy : dy < 0 ? (margin - anchorDev.y) / dy : Infinity;
  const scale = Math.min(scaleX, scaleY);
  const ex = anchorDev.x + dx * scale;
  const ey = anchorDev.y + dy * scale;
  const ux = dx / len;
  const uy = dy / len;
  ctx.beginPath();
  ctx.moveTo(ex + ux * 7 * px, ey + uy * 7 * px);
  ctx.lineTo(ex - ux * 5 * px - uy * 5 * px, ey - uy * 5 * px + ux * 5 * px);
  ctx.lineTo(ex - ux * 5 * px + uy * 5 * px, ey - uy * 5 * px - ux * 5 * px);
  ctx.closePath();
  ctx.fill();
}
