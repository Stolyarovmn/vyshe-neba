// Небо и дальний план: градиент по высоте, звёзды, солнце, Луна/Земля, дуга планеты, облака, дождь.
// Всё считается от камеры (view) и высоты; состояния нет, поэтому слои детерминированы.

import { clamp, hash2, mixColor, rgbString, rgbaString, sampleStops, smoothstep } from './util.js';

const EARTH_STOPS = [
  [0, [62, 178, 228]], [1200, [38, 130, 208]], [2600, [18, 82, 164]], [4500, [6, 24, 76]], [6400, [3, 8, 24]],
];
const MARS_STOPS = [
  [0, [208, 150, 112]], [900, [172, 106, 88]], [2600, [98, 58, 68]], [5200, [26, 14, 24]],
];
const SPACE = [3, 8, 24];
const STORM_SKY = [76, 86, 100];
const HAZE = [176, 226, 240];

const colorA = [0, 0, 0];
const colorB = [0, 0, 0];

/** Цвет неба на высоте alt (ед. мира) для тела; mood = { storm }. */
export function skyColor(body, alt, mood, out) {
  const target = out || [0, 0, 0];
  if (body === 'moon') {
    target[0] = SPACE[0];
    target[1] = SPACE[1];
    target[2] = SPACE[2];
    return target;
  }
  sampleStops(body === 'mars' ? MARS_STOPS : EARTH_STOPS, alt, target);
  if (mood && mood.storm > 0) {
    const low = 1 - smoothstep(1500, 4200, alt);
    mixColor(target, STORM_SKY, mood.storm * 0.75 * low, target);
  }
  return target;
}

/** Рисует небо полосами по высоте. horizonAlt — высота линии моря (для дымки у горизонта), либо null. */
export function drawSky(ctx, view, body, mood, horizonAlt) {
  const band = Math.max(2, view.px * 2);
  let runStart = 0;
  let runColor = null;
  for (let y = 0; y <= view.devH; y += band) {
    const alt = -view.wy(y + band / 2);
    skyColor(body, alt, mood, colorA);
    if (horizonAlt !== null && horizonAlt !== undefined) {
      const above = alt - horizonAlt;
      if (above >= -2 && above < 260) {
        const haze = 0.55 * Math.exp(-Math.max(0, above) / 55) * (1 - mood.storm * 0.6);
        mixColor(colorA, HAZE, haze, colorA);
      }
    }
    const color = rgbString(colorA);
    if (color !== runColor) {
      if (runColor !== null) {
        ctx.fillStyle = runColor;
        ctx.fillRect(0, runStart, view.devW, y - runStart);
      }
      runColor = color;
      runStart = y;
    }
  }
  if (runColor !== null) {
    ctx.fillStyle = runColor;
    ctx.fillRect(0, runStart, view.devW, view.devH - runStart + band);
  }
}

// --- звёзды -----------------------------------------------------------------

const STAR_LAYERS = [
  { pf: 0.04, cell: 110, count: 3, size: 1, bright: 0.55, salt: 1 },
  { pf: 0.09, cell: 130, count: 3, size: 1, bright: 0.8, salt: 2 },
  { pf: 0.16, cell: 170, count: 2, size: 2, bright: 1, salt: 3 },
];
const STAR_SHADES = Array.from({ length: 16 }, (_, i) => {
  const v = 110 + i * 10;
  return `rgb(${v - 12},${v},${Math.min(255, v + 26)})`;
});

/** Звёзды с параллаксом и мерцанием; alpha 0..1 — общая видимость. */
export function drawStars(ctx, view, alpha, time) {
  if (alpha <= 0.01) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  for (const layer of STAR_LAYERS) {
    const camX = view.camX * layer.pf;
    const camY = view.camY * layer.pf;
    const x0 = camX - view.ax / view.S;
    const y0 = camY - view.ay / view.S;
    const x1 = camX + (view.devW - view.ax) / view.S;
    const y1 = camY + (view.devH - view.ay) / view.S;
    const px = Math.max(1, Math.round(layer.size * view.px));
    for (let iy = Math.floor(y0 / layer.cell); iy <= Math.floor(y1 / layer.cell); iy++) {
      for (let ix = Math.floor(x0 / layer.cell); ix <= Math.floor(x1 / layer.cell); ix++) {
        for (let n = 0; n < layer.count; n++) {
          const h1 = hash2(ix * 7 + n, iy * 13 + layer.salt, 11);
          const h2 = hash2(ix * 5 + n * 3, iy * 3 + layer.salt, 29);
          const lx = (ix + h1) * layer.cell;
          const ly = (iy + h2) * layer.cell;
          const shade = hash2(ix + n, iy, layer.salt + 40);
          const twinkle = 0.5 + 0.5 * Math.sin(time * (0.8 + shade * 1.6) + shade * 40);
          const level = Math.floor(clamp(layer.bright * (0.45 + 0.55 * twinkle) * 15.99, 0, 15));
          ctx.fillStyle = STAR_SHADES[level];
          const sx = Math.round(view.ax + (lx - camX) * view.S);
          const sy = Math.round(view.ay + (ly - camY) * view.S);
          ctx.fillRect(sx, sy, px, px);
        }
      }
    }
  }
  ctx.restore();
}

// --- светила -----------------------------------------------------------------

/** Пиксельное солнце: ступенчатое свечение и диск. Экранная позиция в долях кадра. */
export function drawSun(ctx, view, fx, fy, alpha) {
  if (alpha <= 0.01) return;
  const p = view.px;
  const cx = Math.round(view.devW * fx);
  const cy = Math.round(view.devH * fy);
  ctx.save();
  const glow = ctx.createRadialGradient(cx, cy, 6 * p, cx, cy, 70 * p);
  glow.addColorStop(0, `rgba(255,244,200,${0.55 * alpha})`);
  glow.addColorStop(1, 'rgba(255,244,200,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(cx - 70 * p, cy - 70 * p, 140 * p, 140 * p);
  ctx.globalAlpha = alpha;
  ctx.fillStyle = '#fff6cf';
  const r = 11;
  for (let dy = -r; dy <= r; dy += 2) {
    const half = Math.floor(Math.sqrt(r * r - dy * dy) / 2) * 2;
    ctx.fillRect(cx - half * p, cy + dy * p, half * 2 * p, 2 * p);
  }
  ctx.restore();
}

/**
 * Луна (при полёте с Земли) или Земля (с Луны/Марса) на небе.
 * Размер растёт с высотой на Земле; позиция в экране с лёгким параллаксом.
 */
export function drawSkyBodies(ctx, painter, view, body, alt) {
  let name = null;
  let sizeUnits = 0;
  let alpha = 1;
  let fx = 0.82;
  let fy = 0.17;
  if (body === 'earth') {
    const t = clamp((alt - 2500) / 15500, 0, 1);
    if (t <= 0) return;
    name = 'moon';
    sizeUnits = 2 * t * (12 + t * 54);
    fy = 0.16 + 0.04 * Math.sin(alt * 0.00011);
  } else if (body === 'moon') {
    name = 'earth';
    sizeUnits = 66;
  } else if (body === 'mars') {
    name = 'earth';
    sizeUnits = 14;
    alpha = 0.9;
  }
  if (!name || sizeUnits < 3) return;
  const sx = Math.round(view.devW * fx - view.camX * 0.03 * view.S);
  const sy = Math.round(view.devH * fy);
  const devH = sizeUnits * view.px;
  if (!painter.spriteScreen(ctx, view, name, sx, sy, devH, { alpha })) {
    ctx.fillStyle = name === 'moon' ? '#929dab' : '#477cb9';
    ctx.beginPath();
    ctx.arc(sx, sy, devH / 2, 0, Math.PI * 2);
    ctx.fill();
  }
}

// --- дуга планеты внизу кадра при большой высоте ----------------------------------

const LIMB = {
  earth: { from: 2200, to: 9000, body: [22, 74, 142], rim: [138, 202, 248], haze: [96, 168, 240], radius: 1.7 },
  moon: { from: 450, to: 3200, body: [96, 100, 110], rim: [168, 172, 182], haze: [120, 126, 140], radius: 1.15 },
  mars: { from: 450, to: 3800, body: [124, 66, 48], rim: [226, 152, 108], haze: [196, 112, 82], radius: 1.3 },
};

/** Дуга поверхности внизу кадра: появляется, когда земля уже ушла вниз. */
export function drawLimb(ctx, view, body, alt) {
  const spec = LIMB[body];
  if (!spec) return;
  const t = smoothstep(spec.from, spec.to, alt);
  if (t <= 0.001) return;
  const p = view.px;
  const radius = view.devW * spec.radius;
  const top = view.devH * (1 - (0.03 + 0.19 * t));
  const cx = view.devW * 0.5 - view.camX * 0.02 * view.S;
  const cy = top + radius;
  ctx.save();
  ctx.globalAlpha = Math.min(1, t * 3);
  ctx.fillStyle = rgbaString(spec.haze, 0.28);
  ctx.beginPath();
  ctx.arc(cx, cy, radius + 7 * p, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = rgbString(spec.body);
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 2 * p;
  ctx.strokeStyle = rgbString(spec.rim);
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.stroke();
  // Лёгкие полосы облаков/рельефа вдоль дуги.
  ctx.clip();
  ctx.fillStyle = 'rgba(255,255,255,0.10)';
  for (let i = 0; i < 6; i++) {
    const w = (60 + hash2(i, 3) * 120) * p;
    const x = view.devW * hash2(i, 5) - view.camX * 0.02 * view.S;
    ctx.fillRect(x, top + (6 + i * 7) * p, w, 3 * p);
  }
  ctx.restore();
}

// --- облака -----------------------------------------------------------------

/**
 * Слои облаков. pf — параллакс; width — базовая ширина (ед.); altMin/altMax — реальный
 * диапазон высот; cell — размер ячейки сетки в слое; alpha — прозрачность.
 */
export const CLOUD_LAYERS_FLIGHT = [
  { pf: 0.45, width: 120, altMin: 140, altMax: 2600, cell: [380, 260], alpha: 0.62, seed: 1, speed: 1.2 },
  { pf: 0.7, width: 170, altMin: 120, altMax: 2400, cell: [460, 300], alpha: 0.78, seed: 2, speed: 2 },
  { pf: 1, width: 230, altMin: 100, altMax: 2200, cell: [620, 380], alpha: 0.9, seed: 3, speed: 3 },
];
// В хабе камера неподвижна на земле, поэтому высоты слоёв подобраны так, чтобы облака (alt * pf)
// оказывались в небе над линией моря (150 ед.).
export const CLOUD_LAYERS_HUB = [
  { pf: 0.25, width: 150, altMin: 760, altMax: 1500, cell: [340, 150], alpha: 0.65, seed: 5, speed: 1.2 },
  { pf: 0.5, width: 210, altMin: 400, altMax: 760, cell: [440, 190], alpha: 0.82, seed: 6, speed: 2 },
];
const CLOUD_SCALES = [0.8, 1, 1.25];
const stormTint = { r: 58, g: 66, b: 82, a: 0 };

/** Рисует слои облаков; density 0..1, wind — ед./с (со знаком), storm затемняет. */
export function drawClouds(ctx, painter, view, layers, time, density, wind, storm, alphaScale = 1) {
  if (density <= 0.02 || alphaScale <= 0.01) return;
  stormTint.a = clamp(storm * 0.7, 0, 0.8);
  for (const layer of layers) {
    const pf = layer.pf;
    const drift = time * (layer.speed + wind * 0.6) * pf;
    const camX = view.camX * pf - drift;
    const camY = view.camY * pf;
    const [cw, ch] = layer.cell;
    const x0 = camX - view.ax / view.S - layer.width * 1.6;
    const x1 = camX + (view.devW - view.ax) / view.S + layer.width * 1.6;
    const y0 = camY - view.ay / view.S - layer.width;
    const y1 = camY + (view.devH - view.ay) / view.S + layer.width;
    const lyMin = -layer.altMax * pf;
    const lyMax = -layer.altMin * pf;
    const iyFrom = Math.max(Math.floor(y0 / ch), Math.floor(lyMin / ch));
    const iyTo = Math.min(Math.floor(y1 / ch), Math.floor(lyMax / ch));
    for (let iy = iyFrom; iy <= iyTo; iy++) {
      for (let ix = Math.floor(x0 / cw); ix <= Math.floor(x1 / cw); ix++) {
        const chance = hash2(ix, iy, layer.seed * 31);
        if (chance > density * 0.85) continue;
        const lx = (ix + 0.15 + 0.7 * hash2(ix, iy, layer.seed * 31 + 1)) * cw;
        const ly = (iy + 0.2 + 0.6 * hash2(ix, iy, layer.seed * 31 + 2)) * ch;
        if (ly < lyMin || ly > lyMax) continue;
        const kind = Math.floor(hash2(ix, iy, layer.seed * 31 + 3) * 4);
        const scale = CLOUD_SCALES[Math.floor(hash2(ix, iy, layer.seed * 31 + 4) * 3)];
        const sx = Math.round(view.ax + (lx - camX) * view.S);
        const sy = Math.round(view.ay + (ly - camY) * view.S);
        const alt = -ly / pf;
        const fade = smoothstep(layer.altMin, layer.altMin + 80, alt) * (1 - smoothstep(layer.altMax - 260, layer.altMax, alt));
        const alpha = layer.alpha * alphaScale * fade;
        if (alpha <= 0.01) continue;
        const asset = painter.assets.get(`cloud_${kind}`);
        if (!asset) continue;
        const w = layer.width * scale;
        const h = w * asset.h / asset.w;
        const src = painter.source(asset, w * view.px, h * view.px, stormTint.a > 0.05 ? stormTint : null);
        ctx.globalAlpha = alpha;
        ctx.drawImage(src, sx - Math.round(w * view.S / 2), sy - Math.round(h * view.S / 2), Math.round(w * view.S), Math.round(h * view.S));
      }
    }
  }
  ctx.globalAlpha = 1;
}

// --- дождь ---------------------------------------------------------------------

/** Диагональные штрихи дождя в экранном пространстве; одним путём. */
export function drawRain(ctx, view, time, rain, wind) {
  const count = Math.round(rain * 120);
  if (count <= 0) return;
  const p = view.px;
  const slant = clamp(0.28 + wind * 0.04, -0.2, 0.9);
  const len = 12 * p;
  const speed = 520 * p;
  ctx.save();
  ctx.strokeStyle = 'rgba(205,220,240,0.38)';
  ctx.lineWidth = Math.max(1, Math.round(p * 0.7));
  ctx.beginPath();
  for (let i = 0; i < count; i++) {
    const phase = hash2(i, 1, 7);
    const speedMul = 0.7 + hash2(i, 2, 7) * 0.6;
    const x = ((hash2(i, 3, 7) * (view.devW + 200 * p) + time * speed * slant * speedMul) % (view.devW + 200 * p)) - 100 * p;
    const y = ((phase * view.devH + time * speed * speedMul) % (view.devH + len)) - len;
    ctx.moveTo(Math.round(x), Math.round(y));
    ctx.lineTo(Math.round(x + len * slant), Math.round(y + len));
  }
  ctx.stroke();
  ctx.restore();
}
