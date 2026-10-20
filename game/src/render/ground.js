// Поверхность: море с волнами, стартовый остров, грунт и площадки Луны/Марса.
// Координаты мира как в sim: ось Y вниз, поверхность у стола — y = 0, горизонт моря — y = -150.

import { ISLAND, PAD_LANDING_ANCHOR_Y, TERRAIN_LANDING_ANCHOR_Y, eraYear } from './manifest.js';
import { clamp, hash2, mixColor, rgbString } from './util.js';
import { fillWorldRect } from './painter.js';

export const HORIZON_Y = -ISLAND.waterSurfaceY;
const ISLAND_Y_TOP = -ISLAND.top;

const HORIZON_CLEAR = [65, 176, 207];
const HORIZON_STORM = [43, 78, 105];
const DEEP_CLEAR = [18, 102, 156];
const DEEP_STORM = [18, 39, 62];
const LINE_CLEAR = [149, 221, 225];
const LINE_STORM = [118, 151, 161];
const FOAM_CLEAR = [205, 239, 226];
const FOAM_STORM = [176, 199, 199];

const horizonColor = [0, 0, 0];
const deepColor = [0, 0, 0];
const lineColor = [0, 0, 0];
const foamColor = [0, 0, 0];

export function waterMood(mood) {
  return clamp(mood.cloud * 0.45 + mood.rain * 0.3 + mood.storm * 0.65, 0, 1);
}

/** Море от линии горизонта вниз; волны движутся и зависят от погоды. */
export function drawOcean(ctx, view, time, mood) {
  const hy = view.sy(HORIZON_Y);
  if (hy >= view.devH) return;
  const m = waterMood(mood);
  mixColor(HORIZON_CLEAR, HORIZON_STORM, m, horizonColor);
  mixColor(DEEP_CLEAR, DEEP_STORM, m, deepColor);
  mixColor(LINE_CLEAR, LINE_STORM, clamp(m + 0.12, 0, 1), lineColor);
  mixColor(FOAM_CLEAR, FOAM_STORM, m, foamColor);
  const rough = 1 + mood.rain * 1.5 + mood.storm * 3.5;
  const y0 = Math.max(0, hy);
  const depthPx = Math.max(40, 330 * view.S);
  const gradient = ctx.createLinearGradient(0, hy, 0, hy + depthPx);
  gradient.addColorStop(0, rgbString(horizonColor));
  gradient.addColorStop(1, rgbString(deepColor));
  ctx.fillStyle = gradient;
  ctx.fillRect(0, y0, view.devW, view.devH - y0 + 1);
  drawWaves(ctx, view, time, rough, mood.storm);
  drawGlints(ctx, view, time, mood);
}

function drawWaves(ctx, view, time, rough, storm) {
  const rows = 26;
  const px = view.px;
  ctx.save();
  ctx.globalAlpha = 0.36 + 0.1 * Math.min(1, rough / 3);
  const lineStyle = rgbString(lineColor);
  const foamStyle = rgbString(foamColor);
  for (let i = 0; i < rows; i++) {
    const depth = 4 + i * i * 0.75;
    const rowY = view.sy(HORIZON_Y + depth);
    if (rowY < -4 * px) continue;
    if (rowY > view.devH) break;
    const span = 10 + i * 1.6;
    const parallax = 0.35 + i * 0.026;
    const speed = (3 + i * 0.5) * (1 + storm);
    const phase = -view.camX * parallax + time * speed;
    const period = span * 2;
    const left = view.left;
    const right = view.right;
    const start = Math.floor((left - phase) / period) - 1;
    const thickness = Math.max(1, Math.round(px * (0.7 + i * 0.045)));
    ctx.fillStyle = i % 4 === 0 ? foamStyle : lineStyle;
    for (let k = start; ; k++) {
      const wx = k * period + phase;
      if (wx > right) break;
      const bob = Math.round(Math.sin((wx + time * 22) * 0.04 + i) * rough * 0.5) * px;
      const sx = view.sx(wx);
      const width = Math.round(span * view.S);
      ctx.fillRect(sx, rowY + bob, width, thickness);
    }
  }
  ctx.restore();
}

/** Блики на воде: короткие светлые штрихи, мерцающие по сетке. */
function drawGlints(ctx, view, time, mood) {
  const strength = 1 - mood.cloud * 0.7;
  if (strength < 0.1) return;
  const px = view.px;
  const cell = 46;
  const step = Math.floor(time * 1.5);
  const x0 = Math.floor(view.left / cell);
  const x1 = Math.floor(view.right / cell);
  ctx.save();
  ctx.fillStyle = '#e9fbff';
  for (let ix = x0; ix <= x1; ix++) {
    for (let r = 0; r < 12; r++) {
      const h = hash2(ix, r + step * 3, 91);
      if (h > 0.35 * strength) continue;
      const depth = 6 + hash2(ix, r, 3) * 360;
      const wy = HORIZON_Y + depth;
      const sy = view.sy(wy);
      if (sy < 0 || sy > view.devH) continue;
      const sx = view.sx((ix + hash2(ix, r, 5)) * cell);
      ctx.globalAlpha = 0.5 + 0.4 * hash2(ix, r + step, 17);
      ctx.fillRect(sx, sy, 3 * px, px);
    }
  }
  ctx.restore();
}

const ISLAND_PREUPSCALE = 4;
const islandSharp = new WeakMap();

/**
 * «Резкая билинейная» версия острова: сначала целочисленный увеличенный повтор пикселей, затем
 * плавное приведение к экранному размеру. Края пикселей остаются чёткими при любом масштабе,
 * а крупные неровные «кирпичи» от нецелого коэффициента (4,3 ед. на пиксель) пропадают.
 */
function sharpIsland(asset, makeCanvas) {
  let canvas = islandSharp.get(asset);
  if (!canvas) {
    const w = asset.w * ISLAND_PREUPSCALE;
    const h = asset.h * ISLAND_PREUPSCALE;
    canvas = makeCanvas(w, h);
    const g = canvas.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.drawImage(asset.img, 0, 0, w, h);
    islandSharp.set(asset, canvas);
  }
  return canvas;
}

/** Остров-арт на своём месте; false, если ассета нет или остров вне кадра. */
export function drawIsland(ctx, painter, view) {
  const x0 = view.sx(ISLAND.left);
  const x1 = view.sx(ISLAND.left + ISLAND.width);
  if (x1 < 0 || x0 > view.devW) return false;
  const asset = painter.assets.get('island_start');
  if (!asset) return false;
  const height = ISLAND.width * asset.h / asset.w;
  const y0 = view.sy(ISLAND_Y_TOP);
  const y1 = view.sy(ISLAND_Y_TOP + height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'low';
  ctx.drawImage(sharpIsland(asset, painter.makeCanvas), x0, y0, x1 - x0, y1 - y0);
  ctx.imageSmoothingEnabled = false;
  return true;
}

// --- Луна и Марс -----------------------------------------------------------------

const TERRAIN_TILE_W = 360;
const TERRAIN_TRIM = 24;
const TERRAIN_BASE_COLOR = { moon: '#2d3138', mars: '#3a2018' };

/**
 * Грунт и площадка. pad = { x, w } (ед. мира); era 0..5 — вариант площадки.
 * Грунт — перекрывающиеся плитки арта, а ниже — повтор нарисованной внутренней части камня,
 * чтобы не было плоской программной полосы.
 */
export function drawTerrain(ctx, painter, view, body, era, pad, time) {
  const name = body === 'mars' ? 'terrain_mars' : 'terrain_moon';
  const asset = painter.assets.get(name);
  if (view.sy(-30) > view.devH) return;
  if (!asset) {
    fallbackGround(ctx, view, body);
  } else {
    const scale = TERRAIN_TILE_W / asset.w;
    const spanUnits = (asset.w - TERRAIN_TRIM * 2) * scale;
    const topUnits = -TERRAIN_LANDING_ANCHOR_Y[name] * asset.h * scale;
    const src = painter.source(asset, TERRAIN_TILE_W * view.px, asset.h * scale * view.px);
    const k = (src.naturalWidth || src.width) / asset.w;
    const sx0 = TERRAIN_TRIM * k;
    const sw = (asset.w - TERRAIN_TRIM * 2) * k;
    const sh = (asset.h - 8) * k;
    const first = Math.floor(view.left / spanUnits) - 1;
    const last = Math.ceil(view.right / spanUnits) + 1;
    const bandTop = topUnits + (asset.h - 8) * scale * 0.5;
    const stripSy = Math.floor(asset.h * 0.63) * k;
    const stripSh = Math.floor(asset.h * 0.25) * k;
    const stripUnits = Math.floor(asset.h * 0.25) * scale;
    ctx.imageSmoothingEnabled = false;
    for (let ix = first; ix <= last; ix++) {
      const x0 = view.sx(ix * spanUnits);
      const x1 = view.sx((ix + 1) * spanUnits) + 1;
      for (let wy = bandTop + stripUnits; view.sy(wy) < view.devH + 4; wy += stripUnits) {
        const y0 = view.sy(wy);
        const y1 = view.sy(wy + stripUnits) + 1;
        ctx.drawImage(src, sx0, stripSy, sw, stripSh, x0, y0, x1 - x0, y1 - y0);
      }
      const ty0 = view.sy(topUnits);
      const ty1 = view.sy(topUnits + (asset.h - 8) * scale);
      ctx.drawImage(src, sx0, 0, sw, sh, x0, ty0, x1 - x0, ty1 - ty0);
    }
  }
  if (pad) drawPad(ctx, painter, view, body, era, pad, time);
}

function fallbackGround(ctx, view, body) {
  const y = view.sy(0);
  ctx.fillStyle = TERRAIN_BASE_COLOR[body] || '#333';
  ctx.fillRect(0, y, view.devW, view.devH - y + 1);
  ctx.fillStyle = body === 'mars' ? '#c0805a' : '#a7abb0';
  ctx.fillRect(0, y, view.devW, Math.max(1, view.px));
}

function drawPad(ctx, painter, view, body, era, pad, time) {
  const base = body === 'mars' ? 'pad_mars' : 'pad_moon';
  const name = `${base}_${eraYear(era)}`;
  const width = pad.w || 170;
  const asset = painter.assets.get(name);
  if (asset) {
    painter.sprite(ctx, view, name, pad.x, 0, { w: width, ay: PAD_LANDING_ANCHOR_Y[base][clamp(era | 0, 0, 5)] });
  } else {
    fillWorldRect(ctx, view, pad.x - width / 2, -3, width, 6, body === 'mars' ? '#713f35' : '#616d80');
  }
  const blink = Math.floor(time * 3) % 4 === 0;
  for (const side of [-1, 1]) {
    fillWorldRect(ctx, view, pad.x + side * width * 0.42 - 1, -9, 2, 2, blink ? '#c9efcf' : '#586f73');
  }
}
