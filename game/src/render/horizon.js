// Дальний план Земли в полёте: за островом лежит далёкий берег, на нём стоит город нужной эпохи (city_ГОД,
// для крайних эпох ещё и панорама city_early / city_future). Слой живёт в плоскости карты, но смещается вниз
// медленнее самой карты (малый коэффициент параллакса), поэтому читается как горизонт.

import { GROUND_EXPONENT } from './islandmap.js';
import { citySpriteNames } from './manifest.js';
import { clamp, mixColor, rgbString, smoothstep } from './util.js';

export const FAR_COAST_Y = -372; // ед. карты: берег лежит севернее острова (его северный край около -249)
/** Высота (ед.), на которой дальний слой вдвое меньше: он мельчает в ~2,6 раза медленнее острова (малый параллакс). */
export const FAR_SCALE_DISTANCE = 175;
/** Куда опускается береговая линия при подъёме: доля высоты кадра от верха. */
export const FAR_COAST_SCREEN = 0.3;
/** Высота (ед.), к которой дальний слой доходит до своего места на экране. */
export const FAR_SETTLE_ALT = 120;

const LAND_NEAR = [96, 120, 88];
const FOREST = [38, 74, 52];
const FADE_UNITS = 240; // на этой глубине (к северу от берега) суша растворяется в дымке неба
const SAND = [204, 192, 150];
const FOAM = [240, 250, 255];

/** Линия берега: плавная изрезанность, детерминирована. */
export function coastY(x) {
  return FAR_COAST_Y + 16 * Math.sin(x * 0.011) + 10 * Math.sin(x * 0.027 + 1.7) + 6 * Math.sin(x * 0.063 + 0.4);
}

/**
 * Раскладка города на горизонте: [{ name, x, row, width, alpha, mirror }]. row 0 — передний ряд у берега, 1 — глубже
 * (мельче и бледнее). Панорама крайних эпох стоит позади основных силуэтов.
 */
export function farCityLayout(era, out = []) {
  out.length = 0;
  const { main, panorama } = citySpriteNames(era);
  if (panorama) out.push({ name: panorama, x: 10, row: 2, width: 620, alpha: 0.86, mirror: false });
  // два крупных силуэта около оси старта (видны и в узком портретном кадре), остальные — шире, для ландшафта
  out.push({ name: main, x: 70, row: 0, width: 170, alpha: 1, mirror: false });
  out.push({ name: main, x: -150, row: 0, width: 132, alpha: 0.97, mirror: true });
  out.push({ name: main, x: -470, row: 1, width: 118, alpha: 0.88, mirror: false });
  out.push({ name: main, x: 380, row: 1, width: 112, alpha: 0.88, mirror: true });
  out.push({ name: main, x: 740, row: 1, width: 100, alpha: 0.85, mirror: false });
  return out;
}

const ROW_DEPTH = [8, 30, 52]; // насколько силуэт отодвинут от берега вглубь суши (ед. карты)

/** Прозрачность дальнего берега по высоте: у земли 1, растворяется в дымке к ~9 км (900 ед.). */
export function farCoastAlpha(altitude) {
  return 1 - smoothstep(300, 900, Math.max(0, altitude));
}

/**
 * Преобразование дальнего слоя { s, ox, oy } для карты mv: масштаб убывает медленнее, чем у острова, а береговая линия
 * плавно спускается от своего места на старте к FAR_COAST_SCREEN высоты кадра, так что горизонт остаётся над островом.
 * S, ax, camX — как в groundTransform; startY — экранная y береговой линии при нулевой высоте (по карте острова).
 */
export function farTransform(out, altitude, S, devH, ax, camX, startY) {
  const a = Math.max(0, altitude);
  out.s = S / (1 + Math.pow(a / FAR_SCALE_DISTANCE, GROUND_EXPONENT));
  out.ox = ax - camX * out.s;
  const target = devH * FAR_COAST_SCREEN;
  const k = smoothstep(0, FAR_SETTLE_ALT, a);
  const coastScreen = startY + (target - startY) * k;
  out.oy = coastScreen - FAR_COAST_Y * out.s;
  return out;
}

const landColor = [0, 0, 0];
const forestColor = [0, 0, 0];

/** Тёмные пятна леса и холмов вдоль берега: детерминированная сетка, густота падает вглубь суши. */
function drawForest(ctx, mv, x0, x1, hazeColor, haze) {
  const cell = 22;
  const rows = 6;
  const size = Math.max(2, Math.round(mv.s * 5));
  const prior = ctx.globalAlpha;
  for (let row = 0; row < rows; row++) {
    const depth = (row + 0.5) * cell;
    const fade = 1 - depth / (rows * cell);
    mixColor(FOREST, hazeColor, clamp(haze + (1 - fade) * 0.45, 0, 0.9), forestColor);
    ctx.fillStyle = rgbString(forestColor);
    ctx.globalAlpha = prior * (0.3 * fade + 0.08);
    for (let x = Math.floor(x0 / cell) * cell; x <= x1; x += cell) {
      const h = hashCell(Math.round(x / cell), row);
      if (h < 0.42) continue;
      const wx = x + (h - 0.7) * cell * 1.6;
      const wy = coastY(wx) - depth - h * 6;
      ctx.fillRect(mv.sx(wx), mv.sy(wy), size + ((h * 5) | 0), Math.max(2, size - 1));
    }
  }
  ctx.globalAlpha = prior;
}

function hashCell(ix, iy) {
  let n = Math.imul(ix | 0, 0x27d4eb2d) ^ Math.imul((iy | 0) + 0x165667b1, 0x85ebca6b);
  n = Math.imul(n ^ (n >>> 15), 0x2c1b3c6d);
  return ((n ^ (n >>> 12)) >>> 0) / 4294967296;
}
const hazeMixed = [0, 0, 0];
const tint = { r: 0, g: 0, b: 0, a: 0 };
const layoutBuffer = [];

/**
 * Рисует берег и город в карте mv (интерфейс createMapView). altitude — высота ракеты, hazeColor — цвет дымки неба,
 * mood — погода (шторм темнит сушу), alpha — общая прозрачность слоя.
 */
export function drawFarCoast(ctx, painter, mv, era, altitude, mood, hazeColor, alpha) {
  if (alpha <= 0.01) return;
  const coastTop = mv.sy(FAR_COAST_Y - 60);
  if (coastTop > mv.devH + 40) return;
  const haze = clamp(0.28 + 0.5 * smoothstep(60, 700, altitude), 0, 0.85);
  const dark = clamp((mood.storm || 0) * 0.35 + (mood.rain || 0) * 0.15, 0, 0.5);
  mixColor(LAND_NEAR, [30, 40, 46], dark, landColor);
  mixColor(landColor, hazeColor, haze, hazeMixed);

  ctx.save();
  ctx.globalAlpha *= alpha;
  // суша: заливка от берега вверх (на север) с растворением в дымке
  const step = 28;
  const x0 = Math.floor((mv.left - 60) / step) * step;
  const x1 = mv.right + 60;
  ctx.beginPath();
  let first = true;
  for (let x = x0; x <= x1; x += step) {
    const sx = mv.sx(x);
    const sy = mv.sy(coastY(x));
    if (first) {
      ctx.moveTo(sx, sy);
      first = false;
    } else {
      ctx.lineTo(sx, sy);
    }
  }
  const topEdge = Math.min(0, mv.sy(FAR_COAST_Y - 700)) - 8;
  ctx.lineTo(mv.sx(x1), topEdge);
  ctx.lineTo(mv.sx(x0), topEdge);
  ctx.closePath();
  const gradient = ctx.createLinearGradient(0, mv.sy(FAR_COAST_Y), 0, mv.sy(FAR_COAST_Y - FADE_UNITS));
  gradient.addColorStop(0, rgbString(hazeMixed));
  gradient.addColorStop(0.45, rgbString(mixColor(hazeMixed, hazeColor, 0.55, landColor)));
  gradient.addColorStop(1, rgbString(hazeColor));
  ctx.fillStyle = gradient;
  ctx.fill();
  drawForest(ctx, mv, x0, x1, hazeColor, haze);

  // кромка берега: песок и пена
  const px = Math.max(1, Math.round(mv.s * 1.4));
  ctx.lineJoin = 'round';
  ctx.lineWidth = px * 2;
  ctx.strokeStyle = rgbString(mixColor(SAND, hazeColor, haze * 0.8, landColor));
  ctx.beginPath();
  first = true;
  for (let x = x0; x <= x1; x += step) {
    const sx = mv.sx(x);
    const sy = mv.sy(coastY(x)) + px;
    if (first) {
      ctx.moveTo(sx, sy);
      first = false;
    } else {
      ctx.lineTo(sx, sy);
    }
  }
  ctx.stroke();
  ctx.lineWidth = px;
  ctx.strokeStyle = rgbString(mixColor(FOAM, hazeColor, haze * 0.5, landColor));
  ctx.globalAlpha *= 0.65;
  ctx.beginPath();
  first = true;
  for (let x = x0; x <= x1; x += step) {
    const sx = mv.sx(x);
    const sy = mv.sy(coastY(x)) + px * 3;
    if (first) {
      ctx.moveTo(sx, sy);
      first = false;
    } else {
      ctx.lineTo(sx, sy);
    }
  }
  ctx.stroke();
  ctx.globalAlpha /= 0.65;

  // город: панорама позади, затем ряды силуэтов (дальний ряд бледнее)
  const items = farCityLayout(era, layoutBuffer);
  items.sort((a, b) => b.row - a.row);
  for (const item of items) {
    const asset = painter.assets.get(item.name);
    if (!asset) continue;
    const feetY = coastY(item.x) - ROW_DEPTH[item.row];
    const w = item.width;
    const h = (asset.h * w) / asset.w;
    if (item.x + w / 2 < mv.left || item.x - w / 2 > mv.right || feetY - h > mv.bottom || feetY < mv.top) continue;
    const hz = clamp(haze + item.row * 0.1, 0, 0.9);
    tint.r = hazeColor[0];
    tint.g = hazeColor[1];
    tint.b = hazeColor[2];
    tint.a = 0.12 + 0.5 * hz;
    painter.sprite(ctx, mv, item.name, item.x, feetY, {
      w, h, ax: 0.5, ay: 1, alpha: item.alpha * (1 - dark * 0.3), tint, flipX: item.mirror, smooth: true,
    });
  }
  ctx.restore();
}
