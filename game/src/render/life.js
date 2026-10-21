// «Жизнь» острова: смена дня и ночи, огни, машины на дороге, птицы, пена прибоя. Всё дёшево:
// несколько десятков простых примитивов за кадр, без аллокаций в горячих циклах.

import { ISLAND, ISLAND_ROADS } from './manifest.js';
import { clamp, hash2, lerp, smoothstep } from './util.js';

// --- день и ночь -----------------------------------------------------------------------------------

export const DAY_CYCLE_SECONDS = 420;

/** Освещённость 0..1 по времени: длинный день, закат, короткая ночь, рассвет. Старт — день. */
export function daylightAt(time) {
  const p = ((time / DAY_CYCLE_SECONDS) % 1 + 1) % 1;
  if (p < 0.55) return 1;
  if (p < 0.72) return lerp(1, 0.2, smoothstep(0.55, 0.72, p));
  if (p < 0.82) return 0.2;
  if (p < 0.95) return lerp(0.2, 1, smoothstep(0.82, 0.95, p));
  return 1;
}

const NIGHT_COLOR = [10, 18, 48];
const DUSK_COLOR = [255, 140, 70];

/** Цвет и прозрачность затемнения по освещённости: тёплый закат переходит в синюю ночь. */
export function dayOverlay(daylight, out = { r: 0, g: 0, b: 0, a: 0 }) {
  const dark = clamp(1 - daylight, 0, 1);
  const warm = smoothstep(0.08, 0.35, dark) * (1 - smoothstep(0.5, 0.8, dark)) * 0.85;
  out.r = Math.round(lerp(NIGHT_COLOR[0], DUSK_COLOR[0], warm));
  out.g = Math.round(lerp(NIGHT_COLOR[1], DUSK_COLOR[1], warm));
  out.b = Math.round(lerp(NIGHT_COLOR[2], DUSK_COLOR[2], warm));
  out.a = 0.52 * dark * (1 - 0.3 * warm);
  return out;
}

/** Огни включаются, когда темнеет: 0 днём, 1 ночью. */
export function lightsAt(daylight) {
  return smoothstep(0.85, 0.35, daylight);
}

// --- дороги и машины -----------------------------------------------------------------------------------

function roadLength(road) {
  let total = 0;
  for (let i = 1; i < road.points.length; i++) {
    total += Math.hypot(road.points[i][0] - road.points[i - 1][0], road.points[i][1] - road.points[i - 1][1]);
  }
  return total;
}

export const ROAD_LENGTHS = ISLAND_ROADS.map(roadLength);

/** Расстояние «туда-обратно»: 0..L..0 при равномерном росте distance. */
export function pingPong(distance, length) {
  const period = length * 2;
  const m = ((distance % period) + period) % period;
  return m <= length ? m : period - m;
}

/** Точка дороги в пикселях острова на расстоянии d от начала; heading — направление движения вперёд. */
export function roadPoint(road, d, out = { x: 0, y: 0, dx: 1, dy: 0 }) {
  let left = d;
  for (let i = 1; i < road.points.length; i++) {
    const a = road.points[i - 1];
    const b = road.points[i];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (left <= len || i === road.points.length - 1) {
      const t = len > 0 ? clamp(left / len, 0, 1) : 0;
      out.x = lerp(a[0], b[0], t);
      out.y = lerp(a[1], b[1], t);
      out.dx = len > 0 ? (b[0] - a[0]) / len : 1;
      out.dy = len > 0 ? (b[1] - a[1]) / len : 0;
      return out;
    }
    left -= len;
  }
  return out;
}

export const VEHICLES = [
  { road: 0, speed: 16, offset: 0, body: '#d8d6cf', cab: '#6b8ea6', stripe: '#c3473a', length: 15 },
  { road: 0, speed: 11, offset: 140, body: '#c98a2e', cab: '#31404d', stripe: '#2a2c31', length: 17 },
  { road: 0, speed: 21, offset: 60, body: '#9aa3a8', cab: '#4c7a62', stripe: '#efc263', length: 13 },
];

const roadScratch = { x: 0, y: 0, dx: 1, dy: 0 };

/** Положение машины в пикселях острова и знак движения (+1 вперёд по дороге, -1 назад). */
export function vehiclePosition(vehicle, time, out = roadScratch) {
  const length = ROAD_LENGTHS[vehicle.road];
  const raw = time * vehicle.speed + vehicle.offset;
  const d = pingPong(raw, length);
  const forward = (((raw % (length * 2)) + length * 2) % (length * 2)) <= length;
  roadPoint(ISLAND_ROADS[vehicle.road], d, out);
  if (!forward) {
    out.dx = -out.dx;
    out.dy = -out.dy;
  }
  return out;
}

/** Рисует машины на дорогах: простые пиксельные грузовички; count — сколько из списка. */
export function drawVehicles(ctx, mv, time, count) {
  const k = ISLAND.unitsPerPx;
  for (let i = 0; i < Math.min(count, VEHICLES.length); i++) {
    const v = VEHICLES[i];
    const p = vehiclePosition(v, time);
    const x = (p.x - ISLAND.launchOrigin[0]) * k;
    const y = (p.y - ISLAND.launchOrigin[1]) * k;
    if (x < mv.left - 30 || x > mv.right + 30 || y < mv.top - 30 || y > mv.bottom + 30) continue;
    const horizontal = Math.abs(p.dx) >= Math.abs(p.dy);
    const w = (horizontal ? v.length : 8) * k;
    const h = (horizontal ? 8 : v.length) * k;
    const sx = mv.sx(x - w / 2);
    const sy = mv.sy(y - h / 2);
    const sw = Math.max(3, Math.round(w * mv.s));
    const sh = Math.max(3, Math.round(h * mv.s));
    ctx.fillStyle = 'rgba(8,14,20,0.3)';
    ctx.fillRect(sx + Math.round(mv.s), sy + Math.round(mv.s * 1.4), sw, sh);
    ctx.fillStyle = '#23272d';
    ctx.fillRect(sx - 1, sy - 1, sw + 2, sh + 2);
    ctx.fillStyle = v.body;
    ctx.fillRect(sx, sy, sw, sh);
    // кабина — в передней части по ходу движения
    ctx.fillStyle = v.cab;
    if (horizontal) {
      const cab = Math.round(sw * 0.34);
      ctx.fillRect(p.dx > 0 ? sx + sw - cab : sx, sy + 1, cab, sh - 2);
    } else {
      const cab = Math.round(sh * 0.34);
      ctx.fillRect(sx + 1, p.dy > 0 ? sy + sh - cab : sy, sw - 2, cab);
    }
    ctx.fillStyle = v.stripe;
    if (horizontal) ctx.fillRect(sx + Math.round(sw * 0.2), sy + Math.round(sh * 0.4), Math.round(sw * 0.3), Math.max(1, Math.round(sh * 0.16)));
    else ctx.fillRect(sx + Math.round(sw * 0.4), sy + Math.round(sh * 0.2), Math.max(1, Math.round(sw * 0.16)), Math.round(sh * 0.3));
  }
}

/** Фары машин ночью: тёплые пятна впереди по ходу. */
export function drawHeadlights(ctx, mv, time, count, night) {
  if (night <= 0.05) return;
  const k = ISLAND.unitsPerPx;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < Math.min(count, VEHICLES.length); i++) {
    const v = VEHICLES[i];
    const p = vehiclePosition(v, time);
    const x = (p.x - ISLAND.launchOrigin[0]) * k + p.dx * v.length * 0.5 * k;
    const y = (p.y - ISLAND.launchOrigin[1]) * k + p.dy * v.length * 0.5 * k;
    const r = 26 * k * mv.s;
    const cx = mv.sx(x + p.dx * 12 * k);
    const cy = mv.sy(y + p.dy * 12 * k);
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, `rgba(255,236,170,${(0.5 * night).toFixed(2)})`);
    g.addColorStop(1, 'rgba(255,236,170,0)');
    ctx.fillStyle = g;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  }
  ctx.restore();
}

// --- птицы ---------------------------------------------------------------------------------------------

const FLOCKS = [
  { y: -95, speed: 24, count: 4, dir: 1, offset: 0, wobble: 0.6 },
  { y: 60, speed: 17, count: 3, dir: -1, offset: 900, wobble: 0.9 },
  { y: -10, speed: 30, count: 2, dir: 1, offset: 1500, wobble: 0.4 },
];
const FLOCK_SPAN = 2400; // ед.: птицы пролетают остров и уходят за кадр

/** Положение птицы i стаи f (ед. мира): чистая функция для тестов. */
export function birdPosition(flock, index, time, out = { x: 0, y: 0, flap: 0 }) {
  const travel = (time * flock.speed + flock.offset) % FLOCK_SPAN;
  const along = flock.dir > 0 ? travel - FLOCK_SPAN / 2 + 200 : FLOCK_SPAN / 2 + 200 - travel;
  out.x = along - flock.dir * (index * 9 + (index % 2) * 4);
  out.y = flock.y + (index % 2 ? 7 : -5) * (index > 0 ? 1 : 0) + Math.sin(time * 0.6 + index) * 6 * flock.wobble;
  out.flap = Math.sin(time * 9 + index * 1.7);
  return out;
}

const birdScratch = { x: 0, y: 0, flap: 0 };

export function drawBirds(ctx, mv, time) {
  ctx.save();
  ctx.lineCap = 'round';
  for (const flock of FLOCKS) {
    for (let i = 0; i < flock.count; i++) {
      const b = birdPosition(flock, i, time, birdScratch);
      if (b.x < mv.left - 20 || b.x > mv.right + 20 || b.y < mv.top - 20 || b.y > mv.bottom + 20) continue;
      const wing = 5.2 * mv.s;
      const flap = b.flap * 3.4 * mv.s;
      for (const shadow of [true, false]) {
        const sx = mv.sx(b.x + (shadow ? 30 : 0));
        const sy = mv.sy(b.y + (shadow ? 52 : 0));
        ctx.strokeStyle = shadow ? 'rgba(6,12,20,0.2)' : '#1f242c';
        ctx.lineWidth = Math.max(1.4, mv.s * (shadow ? 1.5 : 1.2));
        ctx.beginPath();
        ctx.moveTo(sx - wing, sy + flap * (shadow ? 0.5 : 1));
        ctx.lineTo(sx, sy);
        ctx.lineTo(sx + wing, sy + flap * (shadow ? 0.5 : 1));
        ctx.stroke();
      }
    }
  }
  ctx.restore();
}

// --- пена прибоя ------------------------------------------------------------------------------------

/**
 * Точки берега по маске суши (ячейки суши, рядом с которыми вода): { x, y (px острова), nx, ny (наружу), phase }.
 * Выборка детерминирована и редкая — пена рисуется сотнями штрихов, а не по каждой ячейке.
 */
export function shorePoints(land, density = 0.5) {
  const points = [];
  if (!land || !land.land_hex_rows) return points;
  const { cols, rows, cell_px: cell } = land;
  const grid = land.land_hex_rows.map((row) => {
    const bits = [...row].map((c) => parseInt(c, 16).toString(2).padStart(4, '0')).join('');
    return [...bits.slice(0, cols)].map((b) => b === '1');
  });
  const at = (x, y) => y >= 0 && y < rows && x >= 0 && x < cols && grid[y][x];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (!grid[y][x]) continue;
      let nx = 0;
      let ny = 0;
      if (!at(x - 1, y)) nx -= 1;
      if (!at(x + 1, y)) nx += 1;
      if (!at(x, y - 1)) ny -= 1;
      if (!at(x, y + 1)) ny += 1;
      if (nx === 0 && ny === 0) continue;
      if (hash2(x, y, 71) > density) continue;
      const len = Math.hypot(nx, ny);
      points.push({ x: (x + 0.5) * cell, y: (y + 0.5) * cell, nx: nx / len, ny: ny / len, phase: hash2(x, y, 72) * 6.28 });
    }
  }
  return points;
}

/** Анимированная пена: белые штрихи вдоль берега мерцают волнами; тонкая, чтобы не спорить с нарисованной. */
export function drawFoam(ctx, mv, points, time) {
  if (!points.length) return;
  const k = ISLAND.unitsPerPx;
  ctx.save();
  ctx.fillStyle = '#f2fbff';
  const thickness = Math.max(1, Math.round(mv.s * 1.1));
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const wave = Math.sin(time * 1.15 + p.phase);
    if (wave < 0.1) continue;
    const reach = 3 + 4 * wave;
    const x = (p.x + p.nx * reach - ISLAND.launchOrigin[0]) * k;
    const y = (p.y + p.ny * reach - ISLAND.launchOrigin[1]) * k;
    if (x < mv.left - 8 || x > mv.right + 8 || y < mv.top - 8 || y > mv.bottom + 8) continue;
    ctx.globalAlpha = 0.5 * wave * wave;
    const length = Math.max(2, Math.round(7 * k * mv.s));
    // штрих вдоль берега: перпендикулярно нормали
    if (Math.abs(p.nx) > Math.abs(p.ny)) ctx.fillRect(mv.sx(x), mv.sy(y) - (length >> 1), thickness, length);
    else ctx.fillRect(mv.sx(x) - (length >> 1), mv.sy(y), length, thickness);
  }
  ctx.restore();
}

// --- ночные огни -----------------------------------------------------------------------------------------

/** Тёплое свечение огня в точке карты (ед. мира): radius — ед. мира; blink — 0/1 для мигающих. */
export function drawGlow(ctx, mv, x, y, radius, color, strength) {
  if (strength <= 0.02) return;
  const cx = mv.sx(x);
  const cy = mv.sy(y);
  const r = radius * mv.s;
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  g.addColorStop(0, `rgba(${color},${(0.65 * strength).toFixed(3)})`);
  g.addColorStop(0.35, `rgba(${color},${(0.22 * strength).toFixed(3)})`);
  g.addColorStop(1, `rgba(${color},0)`);
  ctx.fillStyle = g;
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
}
