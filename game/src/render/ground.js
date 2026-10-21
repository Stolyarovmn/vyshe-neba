// Поверхность Луны и Марса: плитки грунта и посадочная площадка. Ось Y вниз, поверхность — y = 0.
// Море и остров Земли теперь рисует islandmap.js (вид сверху-3/4).

import { TERRAIN_LANDING_ANCHOR_Y, outpostSpriteName, padLandingAnchor, padSpriteName } from './manifest.js';
import { smoothstep } from './util.js';
import { fillWorldRect } from './painter.js';

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
  if (pad) drawOutpost(ctx, painter, view, body, era, pad);
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

// --- станция-база на дальнем плане -------------------------------------------------------------

export const OUTPOST_PARALLAX = 0.6; // дальний план смещается по X медленнее камеры
export const OUTPOST_DISTANCE = 270; // ед. мира от площадки (в сторону от ракеты — Луна справа, Марс слева)
export const OUTPOST_FEET_Y = 2; // ед. мира: ноги чуть ниже линии поверхности, грунт перекрывает основания
export const OUTPOST_SCALE = 0.55; // ед. мира на пиксель спрайта: база меньше площадки, она далеко
const OUTPOST_TINT = { moon: { r: 10, g: 14, b: 26, a: 0.3 }, mars: { r: 70, g: 30, b: 20, a: 0.28 } };

/** Положение базы на дальнем плане: мировая x с параллаксом и прозрачность по высоте камеры (у земли 1, выше растворяется). */
export function outpostPlacement(padX, side, camX, camAlt, out = { x: 0, alpha: 1 }) {
  const baseX = padX + side * OUTPOST_DISTANCE;
  out.x = camX + (baseX - camX) * OUTPOST_PARALLAX;
  out.alpha = 1 - smoothstep(40, 320, camAlt);
  return out;
}

const placement = { x: 0, alpha: 1 };

function drawOutpost(ctx, painter, view, body, era, pad) {
  const name = outpostSpriteName(body, era);
  const asset = painter.assets.get(name);
  if (!asset) return;
  outpostPlacement(pad.x, body === 'mars' ? -1 : 1, view.camX, -view.camY, placement);
  if (placement.alpha <= 0.02) return;
  const w = asset.w * OUTPOST_SCALE;
  const h = asset.h * OUTPOST_SCALE;
  if (placement.x + w / 2 < view.left || placement.x - w / 2 > view.right) return;
  // ноги базы прячутся за гребнем грунта: низ чуть ниже линии поверхности (y = 0)
  painter.sprite(ctx, view, name, placement.x, OUTPOST_FEET_Y, { w, h, ax: 0.5, ay: 1, alpha: placement.alpha * 0.96, tint: OUTPOST_TINT[body === 'mars' ? 'mars' : 'moon'], smooth: true });
}

function drawPad(ctx, painter, view, body, era, pad, time) {
  const base = body === 'mars' ? 'pad_mars' : 'pad_moon';
  const name = padSpriteName(base, era);
  const width = pad.w || 170;
  const asset = painter.assets.get(name);
  if (asset) {
    painter.sprite(ctx, view, name, pad.x, 0, { w: width, ay: padLandingAnchor(base, era) });
  } else {
    fillWorldRect(ctx, view, pad.x - width / 2, -3, width, 6, body === 'mars' ? '#713f35' : '#616d80');
  }
  const blink = Math.floor(time * 3) % 4 === 0;
  for (const side of [-1, 1]) {
    fillWorldRect(ctx, view, pad.x + side * width * 0.42 - 1, -9, 2, 2, blink ? '#c9efcf' : '#586f73');
  }
}
