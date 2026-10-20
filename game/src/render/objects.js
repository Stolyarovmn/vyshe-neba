// Объекты полёта: самолёты, шары, камни, спутники, монеты, топливо, ремкомплекты, кольца.
// Опираются на поля sim: kind, lineage, gen (поколение техники 0..5), r, dir, phase, id, marked.

import { AIRCRAFT_DISPLAY_WIDTH, SATELLITE_PANELS, eraYear, spriteName } from './manifest.js';
import { drawAircraft } from './traffic.js';
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

function drawBalloon(ctx, painter, view, o, era, time) {
  const name = spriteName('balloon', generation(o, era));
  const h = BALLOON_HEIGHT[o.lineage] || 90;
  const sway = Math.sin(time * 1.6 + o.phase * TAU) * 0.045;
  // Опора выше центра: корзина раскачивается как маятник от оболочки.
  painter.sprite(ctx, view, name, o.x, o.y - h * 0.3, { h, ay: 0.2, angle: sway });
}

function drawAsteroid(ctx, painter, view, o, time) {
  const variant = Math.floor(hash2(o.id | 0, 5) * 4);
  const spin = (variant % 2 ? 1 : -1) * time * 0.22 + o.phase * TAU;
  painter.sprite(ctx, view, `rock_${variant}`, o.x, o.y, { w: o.r * 2.6, angle: spin });
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

function drawRing(ctx, painter, view, o, era, time) {
  const name = spriteName('ring', era);
  const asset = painter.assets.get(name);
  const bound = 76;
  const k = asset ? bound / Math.max(asset.w, asset.h) : 1;
  const pulse = 0.5 + 0.5 * Math.sin(time * 3.2 + (o.id | 0));
  // Мягкое свечение: кольцо — ворота, которые хочется пролететь.
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const sx = view.sx(o.x);
  const sy = view.sy(o.y);
  const radius = 40 * view.S;
  const glow = ctx.createRadialGradient(sx, sy, radius * 0.4, sx, sy, radius);
  glow.addColorStop(0, `rgba(120,220,255,${0.05 + 0.08 * pulse})`);
  glow.addColorStop(1, 'rgba(120,220,255,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(sx - radius, sy - radius, radius * 2, radius * 2);
  ctx.restore();
  if (asset) painter.sprite(ctx, view, name, o.x, o.y, { w: asset.w * k, h: asset.h * k });
}

/** Рисует все видимые объекты полёта (сзади вперёд: самолёты, шары, камни, спутники, предметы, кольца). */
export function drawObjects(ctx, painter, view, objects, era, time) {
  if (!objects || !objects.length) return;
  for (let pass = 0; pass < 3; pass++) {
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
          if (pass === 1) drawAsteroid(ctx, painter, view, o, time);
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
