// Ракета «в сборе» для экрана сборки: настоящие спрайты ступеней эпохи (те же имена и размеры, что у хаба и полёта),
// разнесённая схема (капсула — ядро — разгонный блок), пламя стенда и привязка горячих точек модулей к частям.
// Общие правила выбора: имя спрайта — spriteName(часть, эпоха); размеры частей — ROCKET_SIZE из rocket.js.

import { spriteName } from './manifest.js';
import { LEG_SPRITES, ROCKET_SIZE, SKIN_HUE, drawLegPair, flameShape, legSprite, stackParts } from './rocket.js';
import { clamp } from './util.js';

const GAP = 6; // зазор между ступенями на схеме, единицы мира

/** Высота разнесённой сборки в единицах мира: капсула + ядро + разгонный блок и два зазора. */
export const ASSEMBLY_HEIGHT = ROCKET_SIZE.capsuleH + GAP + ROCKET_SIZE.coreH + GAP + ROCKET_SIZE.boosterH;
/** Ширина самой широкой ступени (по пропорциям PNG ядра и разгонного блока), единицы мира. */
export const ASSEMBLY_WIDTH = 36;

/** Какая ступень стоит на столе хаба: с разгонным блоком или без. Общее правило для хаба и сборки. */
export function rocketKind(parts) {
  return parts && (parts.booster | 0) > 0 ? 'booster' : 'core';
}

/** Ступени снизу вверх: { base, h, bottom (от низа сборки), owned }. Не купленные рисуются «призраком». */
export function assemblyParts(parts = {}, assets, era = 0) {
  const stack = stackParts('booster', assets, era);
  if (stack[0].name) return stack.map((part) => ({
    ...part, bottom: -part.bottom, owned: part.base !== 'booster' || (parts.booster | 0) > 0,
  }));
  const core = ROCKET_SIZE.boosterH + GAP;
  return [
    { base: 'booster', h: ROCKET_SIZE.boosterH, bottom: 0, owned: (parts.booster | 0) > 0 },
    { base: 'core', h: ROCKET_SIZE.coreH, bottom: core, owned: true },
    { base: 'capsule', h: ROCKET_SIZE.capsuleH, bottom: core + ROCKET_SIZE.coreH + GAP, owned: (parts.capsule | 0) > 0 },
  ];
}

const T = (unitsFromBottom) => 1 - unitsFromBottom / ASSEMBLY_HEIGHT;
const CORE_BOTTOM = ROCKET_SIZE.boosterH + GAP;
const CORE_TOP = CORE_BOTTOM + ROCKET_SIZE.coreH;
const CAPSULE_BOTTOM = CORE_TOP + GAP;

/**
 * Где каждый модуль на схеме: tAnchor — точка привязки (0 — верх сборки, 1 — низ),
 * region — вертикальный диапазон подсветки [t0, t1]. Горячие точки в layout берут отсюда положение по высоте.
 */
export const MODULE_VIEW = {
  parachute: { tAnchor: T(CAPSULE_BOTTOM + ROCKET_SIZE.capsuleH - 3), region: [0, 0.07] },
  avionics: { tAnchor: T(CAPSULE_BOTTOM + ROCKET_SIZE.capsuleH - 11), region: [0.04, 0.15] },
  capsule: { tAnchor: T(CAPSULE_BOTTOM + ROCKET_SIZE.capsuleH * 0.45), region: [0, T(CAPSULE_BOTTOM)] },
  tank: { tAnchor: T(CORE_TOP - ROCKET_SIZE.coreH * 0.3), region: [T(CORE_TOP), T(CORE_TOP - ROCKET_SIZE.coreH * 0.55)] },
  hull: { tAnchor: T(CORE_TOP - ROCKET_SIZE.coreH * 0.5), region: [T(CORE_TOP), T(CORE_BOTTOM)] },
  engine: { tAnchor: T(CORE_BOTTOM + ROCKET_SIZE.coreH * 0.2), region: [T(CORE_BOTTOM + ROCKET_SIZE.coreH * 0.3), T(CORE_BOTTOM)] },
  fins: { tAnchor: T(CORE_BOTTOM + ROCKET_SIZE.coreH * 0.12), region: [T(CORE_BOTTOM + ROCKET_SIZE.coreH * 0.3), T(CORE_BOTTOM)] },
  legs: { tAnchor: T(CORE_BOTTOM + 4), region: [T(CORE_BOTTOM + 8), T(CORE_BOTTOM)] },
  booster: { tAnchor: T(ROCKET_SIZE.boosterH * 0.5), region: [T(ROCKET_SIZE.boosterH), 1] },
};

/** Общая геометрия превью и рамок модулей; без нового арта возвращает прежние размеры. */
export function assemblyLayout(assets, era = 0, owned = {}) {
  const parts = assemblyParts(owned, assets, era);
  if (!parts[0].name) return { parts, height: ASSEMBLY_HEIGHT, width: ASSEMBLY_WIDTH, modules: MODULE_VIEW };
  const top = parts[parts.length - 1];
  const height = top.bottom + top.h;
  const legacy = assemblyParts();
  const modules = {};
  for (const [id, view] of Object.entries(MODULE_VIEW)) {
    const base = id === 'booster' ? 'booster' : ['capsule', 'parachute', 'avionics'].includes(id) ? 'capsule' : 'core';
    const old = legacy.find((p) => p.base === base);
    const part = parts.find((p) => p.base === base);
    const map = (t) => clamp(1 - (part.bottom + ((1 - t) * ASSEMBLY_HEIGHT - old.bottom) / old.h * part.h) / height, 0, 1);
    modules[id] = { tAnchor: map(view.tAnchor), region: view.region.map(map) };
  }
  return { parts, height, width: parts[0].w, modules };
}

const FLAME_COLORS = [
  { outer: '#e4753f', mid: '#f4a64a', core: '#ffe1a0', glow: '255,160,80' },
  { outer: '#e86a3a', mid: '#ffb85a', core: '#fff0c0', glow: '255,170,90' },
  { outer: '#4aa8e8', mid: '#8fe0ff', core: '#ecfbff', glow: '110,200,255' },
];
const flameColors = (era) => FLAME_COLORS[era >= 4 ? 2 : era >= 2 ? 1 : 0];

/**
 * Рисует сборку. o: { era, parts, skin, cx, bottom, height (CSS px всей сборки), dpr, time, throttle, alpha }.
 * Контекст в CSS-пикселях (с масштабом dpr); внутри рисует в пикселях устройства, чтобы спрайты были чёткими.
 * Возвращает { scale (CSS px на единицу), rects: { base: { x, y, w, h } } } — рамки ступеней в CSS-пикселях.
 */
export function drawAssembly(ctx, painter, o) {
  const dpr = o.dpr || 1;
  const era = clamp(o.era | 0, 0, 5);
  const layout = assemblyLayout(painter?.assets, era, o.parts);
  const scale = o.height / layout.height;
  const hue = SKIN_HUE[o.skin] || 0;
  const rects = {};
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = false;
  const stack = layout.parts;
  const lowestOwned = stack.find((p) => p.owned);
  if ((o.throttle || 0) > 0.02 && lowestOwned) drawStandFlame(ctx, o.cx * dpr, (o.bottom - lowestOwned.bottom * scale) * dpr, scale * dpr, o.throttle, era, o.time || 0);
  // посадочные опоры под низом ракеты (как в полёте: у среза сопла нижней ступени), раскрытые: видно, что модуль «Опоры»
  // куплен и каким уровнем; без опор — бледный силуэт ур. 1
  const foot = lowestOwned || stack[0];
  const legLevel = (o.parts?.legs | 0);
  const legs = stack[0].name && foot ? legSprite(Math.max(1, legLevel), painter?.assets) : null;
  if (legs && LEG_SPRITES[Math.max(1, legLevel)]) {
    const s = scale * dpr;
    const ox = o.cx * dpr;
    const oy = (o.bottom - foot.bottom * scale) * dpr;
    drawLegPair(legs, painter.assets.get(legs.name), s, 1, (asset, sx, sy, w, h, ax, ay, opts) => {
      painter.blitDev(ctx, asset, ox + sx, oy + sy, w * s, h * s, ax, ay, { ...opts, hue });
    }, (legLevel > 0 ? 1 : 0.22) * (o.alpha ?? 1));
  }
  for (const part of stack[0].name ? [...stack].reverse() : stack) {
    const asset = painter?.assets?.get(part.name || spriteName(part.base, era));
    const h = part.h * scale;
    const w = part.w ? part.w * scale : asset ? (h * asset.w) / asset.h : h * 0.5;
    const y = o.bottom - part.bottom * scale;
    rects[part.base] = { x: o.cx - w / 2, y: y - h, w, h };
    const alpha = (part.owned ? 1 : 0.2) * (o.alpha ?? 1);
    if (asset) painter.blitDev(ctx, asset, o.cx * dpr, y * dpr, w * dpr, h * dpr, 0.5, 1, { hue, alpha });
    else fallbackPart(ctx, o.cx * dpr, y * dpr, w * dpr, h * dpr, alpha);
    if (!part.owned) dashedFrame(ctx, rects[part.base], dpr);
  }
  ctx.restore();
  return { scale, rects };
}

function fallbackPart(ctx, cx, y, w, h, alpha) {
  ctx.globalAlpha = alpha;
  ctx.fillStyle = '#d9ddd2';
  ctx.fillRect(Math.round(cx - w / 2), Math.round(y - h), Math.round(w), Math.round(h));
  ctx.globalAlpha = 1;
}

function dashedFrame(ctx, r, dpr) {
  ctx.strokeStyle = 'rgba(82,216,255,0.55)';
  ctx.lineWidth = Math.max(1, Math.round(dpr));
  ctx.setLineDash([4 * dpr, 4 * dpr]);
  ctx.strokeRect(Math.round(r.x * dpr) + 0.5, Math.round(r.y * dpr) + 0.5, Math.round(r.w * dpr), Math.round(r.h * dpr));
  ctx.setLineDash([]);
}

/** Пламя стенда: ступенчатые ряды, как у полётного пламени; (x, y) — сопло в пикселях устройства, s — пикселей устройства на единицу. */
function drawStandFlame(ctx, x, y, s, throttle, era, time) {
  const palette = flameColors(era);
  const shape = flameShape(throttle, 1, false, 'core');
  const flick = 1 + 0.12 * Math.sin(time * 43) + 0.05 * Math.sin(time * 71);
  const length = shape.length * flick * 0.62;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const glowR = (9 + 14 * throttle) * s;
  const grad = ctx.createRadialGradient(x, y + 3 * s, 0, x, y + 3 * s, glowR);
  grad.addColorStop(0, `rgba(${palette.glow},${0.45 * throttle})`);
  grad.addColorStop(1, `rgba(${palette.glow},0)`);
  ctx.fillStyle = grad;
  ctx.fillRect(x - glowR, y + 3 * s - glowR, glowR * 2, glowR * 2);
  ctx.restore();
  const step = 2;
  const row = (half, d, color) => {
    const w = Math.max(1, Math.round(half * 2 * s));
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x - w / 2), Math.round(y + d * s), w, Math.max(1, Math.round(step * s)));
  };
  for (let d = 0; d < length; d += step) {
    const taper = 1 - d / length;
    const half = Math.max(0.5, shape.half * 0.8 * taper + 0.5 * Math.sin(time * 61 + d * 1.4));
    row(half, d, palette.outer);
    if (d < length * 0.8) row(half * 0.62, d, palette.mid);
    if (d < length * 0.55) row(Math.max(0.5, half * 0.32), d, palette.core);
  }
}
