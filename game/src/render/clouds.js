// Облака полёта. Источник правды — sim: state.clouds = [{ id, kind, x, alt, w, h, density, storm, vx }]
// (положение уже включает снос ветром, рендер облака не двигает и не качает).
//
// kind: cumulus (средние кучевые), stratus (широкие тонкие слои), cirrus (высокие перистые), storm (тёмные
// грозовые с дождём и подсветкой молний). density 0..1 задаёт прозрачность и число «слоёв» спрайта.

import { clamp, hash2 } from './util.js';

const STORM_TINT = { r: 40, g: 48, b: 66, a: 0.62 };
const FLASH_TINT = { r: 245, g: 248, b: 255, a: 0.9 };

/** Какая половина слоёв (0 — позади ракеты, 1 — поверх неё): часть облаков перед ракетой для глубины. */
export function cloudPass(cloud) {
  const roll = hash2(cloud.id | 0, 7, 3);
  if (cloud.kind === 'cirrus') return 0;
  return roll < 0.3 ? 1 : 0;
}

/** Число слоёв спрайта: плотнее облако — пышнее. */
export function cloudLayers(cloud) {
  const d = clamp(cloud.density ?? 0.5, 0, 1);
  return cloud.kind === 'cumulus' || cloud.kind === 'storm' ? 1 + Math.round(d * 2) : 1 + Math.round(d);
}

function spriteFor(cloud) {
  return `cloud_${Math.floor(hash2(cloud.id | 0, 5, 9) * 4)}`;
}

/**
 * Ширина и высота прорисовки (ед. мира) по виду облака: cumulus сохраняют пропорции спрайта,
 * stratus и cirrus — вытянутые тонкие полосы, storm — высокие массивы.
 */
export function cloudSize(cloud, aspect) {
  const w = Math.max(40, cloud.w || 200);
  const shape = { cumulus: 1, stratus: 0.3, cirrus: 0.18, storm: 1.25 }[cloud.kind] ?? 1;
  // Высота sim учитывается (облака плоские или высокие), но в пределах, где спрайт ещё похож на облако.
  const h = cloud.h || w * aspect * shape;
  switch (cloud.kind) {
    case 'stratus':
      return [w, clamp(h, w * 0.03, w * 0.25)];
    case 'cirrus':
      return [w, clamp(h, w * 0.02, w * 0.15)];
    case 'storm':
      return [w, clamp(h, w * 0.4, w * 1.6)];
    default:
      return [w, clamp(h, w * 0.22, w * 0.9)];
  }
}

function baseAlpha(cloud) {
  const d = clamp(cloud.density ?? 0.5, 0, 1);
  switch (cloud.kind) {
    case 'stratus':
      return 0.22 + 0.4 * d;
    case 'cirrus':
      return 0.16 + 0.3 * d;
    case 'storm':
      return 0.55 + 0.4 * d;
    default:
      return 0.4 + 0.5 * d;
  }
}

/** Максимальная ширина одного куска спрайта (ед.): шире облако собирается из нескольких, а не растягивается. */
const MAX_PIECE = { cumulus: 360, stratus: 520, cirrus: 520, storm: 420 };

/** Куски облака-«банка»: центр, ширина и высота каждого (чистая функция для тестов). */
export function cloudPieces(cloud, w, h, out = []) {
  out.length = 0;
  const maxPiece = MAX_PIECE[cloud.kind] || 360;
  const pieceW = Math.min(w, maxPiece);
  const count = w <= maxPiece ? 1 : Math.ceil((w - pieceW) / (pieceW * 0.55)) + 1;
  const pieceH = pieceW * (h / w);
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0.5 : i / (count - 1);
    const jitter = (hash2(cloud.id | 0, i, 17) - 0.5) * h * 0.14;
    out.push({ dx: (t - 0.5) * (w - pieceW), dy: jitter, w: pieceW * (0.9 + 0.2 * hash2(cloud.id | 0, i, 19)), h: pieceH });
  }
  return out;
}

const pieceBuffer = [];

function drawOne(ctx, painter, view, cloud, flashing) {
  const asset = painter.assets.get(spriteFor(cloud));
  if (!asset) return;
  const aspect = asset.h / asset.w;
  const [w, h] = cloudSize(cloud, aspect);
  const x = cloud.x;
  const y = -cloud.alt;
  if (x + w * 0.6 < view.left || x - w * 0.6 > view.right || y + h < view.top || y - h > view.bottom) return;
  const layers = cloudLayers(cloud);
  const baseA = baseAlpha(cloud);
  const storm = cloud.kind === 'storm' || cloud.storm;
  const angle = cloud.kind === 'cirrus' ? -0.045 : 0;
  const pieces = cloudPieces(cloud, w, h, pieceBuffer);
  // Куски перекрываются: общую прозрачность снижаем, чтобы банк не «горел» белым.
  const alpha = pieces.length > 1 ? baseA * 0.72 : baseA;
  for (let p = 0; p < pieces.length; p++) {
    const piece = pieces[p];
    const name = pieces.length > 1 ? `cloud_${Math.floor(hash2(cloud.id | 0, p, 23) * 4)}` : spriteFor(cloud);
    for (let i = 0; i < layers; i++) {
      const t = layers === 1 ? 0 : i / (layers - 1) - 0.5;
      painter.sprite(ctx, view, name, x + piece.dx + t * piece.w * 0.14, y + piece.dy - Math.abs(t) * piece.h * 0.12 + t * piece.h * 0.06, {
        w: piece.w * (1 - Math.abs(t) * 0.18),
        h: piece.h * (1 - Math.abs(t) * 0.16),
        alpha: alpha * (i === 0 ? 1 : 0.62),
        tint: storm ? STORM_TINT : undefined,
        angle,
        smooth: true,
      });
    }
    if (storm && flashing) {
      painter.sprite(ctx, view, name, x + piece.dx, y + piece.dy, {
        w: piece.w, h: piece.h, alpha: 0.5 * clamp(flashing, 0, 1), tint: FLASH_TINT, smooth: true,
      });
    }
  }
}

/** Дождь под грозовыми облаками: штрихи от нижней кромки вниз; одним путём. */
function drawStormRain(ctx, view, cloud, wind, time) {
  const w = cloud.w || 200;
  const x0 = cloud.x - w * 0.4;
  const y0 = -cloud.alt + (cloud.h || 90) * 0.35;
  const count = Math.round(10 + 22 * clamp(cloud.density ?? 0.6, 0, 1));
  const slant = clamp(wind * 0.015, -0.35, 0.35) + 0.12;
  const length = 150;
  ctx.beginPath();
  for (let i = 0; i < count; i++) {
    const phase = (time * (1.4 + hash2(i, cloud.id | 0, 3)) + hash2(i, cloud.id | 0, 4)) % 1;
    const sx = x0 + hash2(i, cloud.id | 0, 5) * w * 0.8;
    const sy = y0 + phase * length;
    ctx.moveTo(view.sx(sx + slant * phase * length), view.sy(sy));
    ctx.lineTo(view.sx(sx + slant * (phase * length + 14)), view.sy(sy + 14));
  }
  ctx.stroke();
}

/**
 * Рисует облака одного прохода: pass 0 — позади ракеты, 1 — поверх (с прозрачностью).
 * flash — вспышка молнии (0..1, weather.flash/0.08), wind — ед./с для наклона дождя.
 */
export function drawCloudField(ctx, painter, view, clouds, pass, time, flash, wind, fade = 1) {
  if (!clouds || !clouds.length || fade <= 0.01) return;
  ctx.save();
  if (fade < 1) ctx.globalAlpha *= fade;
  for (const cloud of clouds) {
    if (cloudPass(cloud) !== pass) continue;
    drawOne(ctx, painter, view, cloud, flash);
  }
  if (pass === 0) {
    ctx.strokeStyle = 'rgba(190,206,226,0.34)';
    ctx.lineWidth = Math.max(1, view.px * 0.9);
    for (const cloud of clouds) {
      if (cloud.kind !== 'storm' && !cloud.storm) continue;
      if (cloud.x + (cloud.w || 200) < view.left || cloud.x - (cloud.w || 200) > view.right) continue;
      if (-cloud.alt - 100 > view.bottom || -cloud.alt + 300 < view.top) continue;
      drawStormRain(ctx, view, cloud, wind, time);
    }
  }
  ctx.restore();
}

// --- запасное поле облаков (если sim не прислала state.clouds) ------------------------------

const FALLBACK_CELL = [560, 300];
const FALLBACK_MAX = 48;
const fallbackPool = Array.from({ length: FALLBACK_MAX }, (_, index) => ({
  id: index, kind: 'cumulus', x: 0, alt: 0, w: 0, h: 0, density: 0.5, storm: false, vx: 0,
}));
const fallbackList = [];

/**
 * Детерминированное неподвижное облачное поле по сетке (только для тестов и заглушек):
 * одно облако на ячейку, виды по высоте. Без дрейфа и качаний.
 */
export function fallbackClouds(view, density, stormy) {
  fallbackList.length = 0;
  const ix0 = Math.floor((view.left - 300) / FALLBACK_CELL[0]);
  const ix1 = Math.floor((view.right + 300) / FALLBACK_CELL[0]);
  const iy0 = Math.floor(Math.max(0, -view.bottom - 200) / FALLBACK_CELL[1]);
  const iy1 = Math.floor(Math.max(0, -view.top + 200) / FALLBACK_CELL[1]);
  for (let iy = iy0; iy <= iy1; iy++) {
    for (let ix = ix0; ix <= ix1; ix++) {
      if (fallbackList.length >= FALLBACK_MAX) return fallbackList;
      if (hash2(ix, iy, 41) > density) continue;
      const alt = (iy + 0.2 + 0.6 * hash2(ix, iy, 42)) * FALLBACK_CELL[1];
      if (alt < 90 || alt > 4200) continue;
      const cloud = fallbackPool[fallbackList.length];
      const roll = hash2(ix, iy, 43);
      cloud.id = ix * 131 + iy * 17 + 1000;
      cloud.kind = alt > 2600 ? 'cirrus' : roll < 0.2 ? 'stratus' : stormy && roll > 0.65 ? 'storm' : 'cumulus';
      cloud.x = (ix + 0.15 + 0.7 * hash2(ix, iy, 44)) * FALLBACK_CELL[0];
      cloud.alt = alt;
      cloud.w = cloud.kind === 'stratus' ? 520 : cloud.kind === 'cirrus' ? 420 : 180 + 120 * hash2(ix, iy, 45);
      cloud.h = 0;
      cloud.density = 0.3 + 0.6 * hash2(ix, iy, 46);
      cloud.storm = cloud.kind === 'storm';
      fallbackList.push(cloud);
    }
  }
  return fallbackList;
}

