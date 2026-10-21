// Карта острова: вид сверху-3/4. Общая для хаба и начала полёта.
//
// Карта живёт в мировых единицах (1 ед. = 10 м), ноль — центр стартовой площадки, ось Y вниз.
// MapView связывает карту с экраном: пиксели устройства = ox + x * s. В хабе s задаёт зум, в полёте
// масштаб уменьшается с высотой, а карта «уходит» вниз (см. flight.js).

import { ISLAND } from './manifest.js';
import { clamp, hash2, mixColor, rgbString } from './util.js';

/** Преобразование карта -> экран; интерфейс совместим с view из camera.js, чтобы использовать painter. */
export function createMapView() {
  const mv = {
    s: 1,
    px: 1,
    S: 1,
    zoom: 1,
    ox: 0,
    oy: 0,
    devW: 0,
    devH: 0,
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    quantizeScale: true,
    smooth: true,

    set(ox, oy, s, devW, devH) {
      mv.ox = ox;
      mv.oy = oy;
      mv.s = s;
      mv.px = s;
      mv.S = s;
      mv.devW = devW;
      mv.devH = devH;
      mv.left = -ox / s;
      mv.right = (devW - ox) / s;
      mv.top = -oy / s;
      mv.bottom = (devH - oy) / s;
      return mv;
    },

    sx(x) {
      return Math.round(mv.ox + x * mv.s);
    },
    sy(y) {
      return Math.round(mv.oy + y * mv.s);
    },
    wx(sx) {
      return (sx - mv.ox) / mv.s;
    },
    wy(sy) {
      return (sy - mv.oy) / mv.s;
    },
  };
  return mv;
}

// --- параллакс земли в полёте -------------------------------------------------------------

/** Высота (ед.), на которой карта вдвое меньше: чем выше ракета, тем мельче остров. */
export const GROUND_DISTANCE = 900;

/** Относительный масштаб карты на высоте: 1 на земле, убывает к нулю. */
export function groundScale(altitude) {
  return 1 / (1 + Math.max(0, altitude) / GROUND_DISTANCE);
}

/**
 * Смещение карты вниз относительно ракеты (ед. мира): у земли быстро (чтобы по тени было видно высоту),
 * выше медленнее — дальний план отстаёт от ракеты, это и есть параллакс.
 */
export function groundDrop(altitude) {
  const a = Math.max(0, altitude);
  return 0.6 * Math.min(a, 250) + 0.25 * Math.max(0, a - 250);
}

/**
 * Преобразование карты для вида полёта: S — пикселей на единицу в основном виде, feetY — экранная y низа ракеты,
 * ax/camX — экранный якорь и мировая x камеры. Записывает { s, ox, oy } в out и возвращает его.
 */
export function groundTransform(out, altitude, S, feetY, ax, camX) {
  out.s = S * groundScale(altitude);
  out.ox = ax - camX * out.s;
  out.oy = feetY + S * groundDrop(altitude);
  return out;
}

// --- море --------------------------------------------------------------------------------

const SEA_CLEAR = [30, 90, 140];
const SEA_STORM = [20, 52, 82];
const LINE_CLEAR = [150, 214, 226];
const LINE_STORM = [112, 148, 164];
const seaColor = [0, 0, 0];

/** Спокойствие воды по погоде: 0 ясно, 1 шторм. */
export function seaMood(mood) {
  return clamp(mood.cloud * 0.4 + mood.rain * 0.3 + mood.storm * 0.65, 0, 1);
}

/**
 * Море под островом: заливка и волны на карте (двигаются с картой, медленно сносятся).
 * haze 0..1 затягивает верх кадра небесным цветом (высота), alpha — общая видимость слоя.
 */
export function drawSea(ctx, mv, time, mood, haze = 0, hazeColor = null) {
  const m = seaMood(mood);
  mixColor(SEA_CLEAR, SEA_STORM, m, seaColor);
  ctx.fillStyle = rgbString(seaColor);
  ctx.fillRect(0, 0, mv.devW, mv.devH);
  drawWaves(ctx, mv, time, mood, m);
  if (haze > 0.01 && hazeColor) {
    const gradient = ctx.createLinearGradient(0, 0, 0, mv.devH);
    gradient.addColorStop(0, `rgba(${hazeColor[0]},${hazeColor[1]},${hazeColor[2]},${haze.toFixed(3)})`);
    gradient.addColorStop(1, `rgba(${hazeColor[0]},${hazeColor[1]},${hazeColor[2]},${(haze * 0.25).toFixed(3)})`);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, mv.devW, mv.devH);
  }
}

const WAVE_CELL = 46;

function drawWaves(ctx, mv, time, mood, calm) {
  const rough = 1 + mood.rain * 1.2 + mood.storm * 2.5;
  const s = mv.s;
  const thickness = Math.max(1, Math.round(s * 1.1));
  const drift = time * (2.4 + mood.storm * 3);
  const x0 = Math.floor((mv.left - drift - 40) / WAVE_CELL);
  const x1 = Math.floor((mv.right - drift + 40) / WAVE_CELL);
  const y0 = Math.floor(mv.top / WAVE_CELL);
  const y1 = Math.floor(mv.bottom / WAVE_CELL);
  const mixed = mixColor(LINE_CLEAR, LINE_STORM, calm, [0, 0, 0]);
  ctx.save();
  ctx.fillStyle = rgbString(mixed);
  for (let iy = y0; iy <= y1; iy++) {
    for (let ix = x0; ix <= x1; ix++) {
      const h = hash2(ix, iy, 21);
      if (h > 0.62) continue;
      const wx = (ix + hash2(ix, iy, 22)) * WAVE_CELL + drift;
      const wy = (iy + hash2(ix, iy, 23)) * WAVE_CELL + Math.sin(time * 0.8 + h * 20) * 0.8 * rough;
      const length = (9 + 16 * hash2(ix, iy, 24)) * (0.8 + 0.2 * rough);
      ctx.globalAlpha = 0.16 + 0.2 * hash2(ix, iy, 25);
      ctx.fillRect(mv.sx(wx), mv.sy(wy), Math.max(2, Math.round(length * s)), thickness);
    }
  }
  ctx.restore();
}

// --- остров ------------------------------------------------------------------------------

/** Рамка острова на экране в пикселях устройства: { x0, y0, x1, y1 }. */
export function islandRect(mv) {
  return {
    x0: mv.sx(ISLAND.leftUnits),
    y0: mv.sy(ISLAND.topUnits),
    x1: mv.sx(ISLAND.leftUnits + ISLAND.widthUnits),
    y1: mv.sy(ISLAND.topUnits + ISLAND.heightUnits),
  };
}

/** Рисует HD-остров; false, если ассета нет или остров вне кадра. */
export function drawIslandHd(ctx, painter, mv, alpha = 1) {
  const r = islandRect(mv);
  if (r.x1 < 0 || r.x0 > mv.devW || r.y1 < 0 || r.y0 > mv.devH) return false;
  const asset = painter.assets.get('island_start');
  if (!asset || alpha <= 0.01) return false;
  const was = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  const prev = ctx.globalAlpha;
  ctx.globalAlpha = prev * alpha;
  ctx.drawImage(asset.img, r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0);
  ctx.globalAlpha = prev;
  ctx.imageSmoothingEnabled = was;
  return true;
}

/** Мягкая тень предмета на земле (эллипс) в картовых координатах. */
export function drawGroundShadow(ctx, mv, x, y, radiusX, radiusY, alpha) {
  if (alpha <= 0.01) return;
  ctx.fillStyle = `rgba(6,12,20,${alpha.toFixed(3)})`;
  ctx.beginPath();
  ctx.ellipse(mv.sx(x), mv.sy(y), Math.max(1, radiusX * mv.s), Math.max(1, radiusY * mv.s), 0, 0, Math.PI * 2);
  ctx.fill();
}

