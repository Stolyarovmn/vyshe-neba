// Постройки космодрома: спрайты утверждённого арта по уровню/эпохе и единый программный силуэт
// для построек, у которых арта ещё нет (logistics, factory, control, radar, energy, observation, recovery).
//
// Все функции рисуют в единицах мира через view; (wx, wy) — точка опоры (низ по центру).

import {
  ART_BUILDINGS, BUILDING_ANCHORS, BUILDING_KEYS, ISLAND, PLACEABLE_BUILDINGS, PROCEDURAL_BUILDINGS, buildingSpriteName,
} from './manifest.js';
import { clamp, hash2 } from './util.js';
import { fillWorldRect } from './painter.js';

/** Размер дизайн-коробки программных силуэтов (ед. мира): силуэт масштабируется под sprite_px раскладки. */
export const PROCEDURAL_DESIGN = {
  logistics: { w: 100, h: 56 },
  factory: { w: 112, h: 74 },
  control: { w: 88, h: 76 },
  radar: { w: 62, h: 82 },
  energy: { w: 84, h: 50 },
  observation: { w: 70, h: 84 },
  recovery: { w: 98, h: 88 },
};

const PALETTES = [
  { dark: '#4d4337', mid: '#756a55', metal: '#a59675', accent: '#c65d45', light: '#ddd0a3' },
  { dark: '#3d4650', mid: '#68737a', metal: '#a7a9a0', accent: '#cb5b48', light: '#dfd9bc' },
  { dark: '#2c3c48', mid: '#526675', metal: '#a9b1ae', accent: '#d35445', light: '#e1dec8' },
  { dark: '#223745', mid: '#4f6974', metal: '#b7c0ba', accent: '#db594a', light: '#ece5cf' },
  { dark: '#183240', mid: '#3f6670', metal: '#b9c7c4', accent: '#d84f48', light: '#e8ead8' },
  { dark: '#102d39', mid: '#39717a', metal: '#c4d2cd', accent: '#d84b45', light: '#eef4e2' },
];
const CYAN = '#70dfd0';
const GOLD = '#efc263';
const RED = '#ed7770';
const GREEN = '#87c99c';
const WINDOW_OFF = '#172536';

export function isArtBuilding(key) {
  return ART_BUILDINGS.includes(key) || key in PLACEABLE_BUILDINGS;
}

export function isProceduralBuilding(key) {
  return PROCEDURAL_BUILDINGS.includes(key);
}

/** Целевой размер спрайта постройки в единицах мира [ширина, высота] (по sprite_px раскладки острова). */
export function buildingSize(painter, key, level) {
  const layout = BUILDING_ANCHORS[key];
  const [px, py] = layout ? layout.size : [100, 100];
  const height = py * ISLAND.unitsPerPx;
  const asset = painter.assets.get(buildingSpriteName(key, level));
  const width = asset ? (height * asset.w) / asset.h : px * ISLAND.unitsPerPx;
  return [width, height];
}

/**
 * Рисует постройку: (wx, wy) — низ спрайта по центру, ед. мира. opts: { mirror }.
 * Возвращает true, если использован спрайт арта, false — программный силуэт.
 */
export function drawBuilding(ctx, painter, view, key, level, wx, wy, time, opts = {}) {
  const lv = clamp(level | 0, 1, 6);
  const [width, height] = buildingSize(painter, key, lv);
  drawShadow(ctx, view, wx, wy, BUILDING_ANCHORS[key], width);
  const name = buildingSpriteName(key, lv);
  const building = opts.reveal !== undefined && opts.reveal < 1;
  if (building) {
    // стройка: здание «вырастает» снизу вверх — видна только нижняя часть спрайта
    ctx.save();
    ctx.beginPath();
    const top = view.sy(wy - height * clamp(opts.reveal, 0, 1));
    ctx.rect(view.sx(wx - width), top, view.sx(wx + width) - view.sx(wx - width), view.sy(wy) + 8 - top);
    ctx.clip();
  }
  let drawn = false;
  if (painter.has(name)) {
    drawn = painter.sprite(ctx, view, name, wx, wy, { h: height, flipX: !!opts.mirror, smooth: true });
  } else {
    drawProcedural(ctx, view, key, lv, wx, wy, time, width);
  }
  if (building) ctx.restore();
  return drawn;
}

function drawShadow(ctx, view, wx, wy, layout, width) {
  const w = width * 0.92;
  const depth = layout ? layout.footprint[1] * ISLAND.unitsPerPx : 20;
  const x0 = view.sx(wx - w / 2);
  const x1 = view.sx(wx + w / 2);
  const y = view.sy(wy - depth * 0.15);
  const half = Math.max(2, Math.round(view.S * depth * 0.5));
  ctx.fillStyle = 'rgba(8,16,24,0.28)';
  ctx.beginPath();
  ctx.ellipse((x0 + x1) / 2, y, (x1 - x0) / 2, half, 0, 0, Math.PI * 2);
  ctx.fill();
}

// --- программные силуэты ---------------------------------------------------------

function drawProcedural(ctx, view, key, level, wx, wy, time, widthUnits) {
  const design = PROCEDURAL_DESIGN[key];
  if (!design) return;
  const c = PALETTES[level - 1];
  // Силуэт нарисован в дизайн-координатах (низ по центру в нуле) и масштабируется в k раз.
  const k = widthUnits / design.w;
  const dv = {
    S: view.S * k,
    px: view.px,
    sx: (x) => view.sx(wx + x * k),
    sy: (y) => view.sy(wy + y * k),
  };
  const R = (x, y, w, h, color) => fillWorldRect(ctx, dv, x, y, w, h, color);
  const painters = { logistics, factory, control, radar, energy, observation, recovery };
  painters[key](R, c, level, time, ctx, dv, 0, 0);
}

function windows(R, x, y, count, step, on, c) {
  for (let i = 0; i < count; i++) R(x + i * step, y, 5, 5, on(i) ? c : WINDOW_OFF);
}

function blink(time, period, phase = 0) {
  return Math.floor(time / period + phase) % 2 === 0;
}

function logistics(R, c, level, time) {
  R(-46, -30, 66, 30, c.dark);
  R(-48, -33, 70, 4, c.light);
  for (const x of [-40, -18]) {
    R(x, -22, 16, 22, c.mid);
    for (let y = -20; y < 0; y += 4) R(x + 1, y, 14, 1, c.metal);
  }
  R(22, -8, 26, 8, c.metal);
  R(24, -16, 10, 8, c.accent);
  R(36, -14, 10, 6, level > 2 ? CYAN : c.light);
  R(-48, -3, 18, 3, c.mid);
  if (level >= 4) {
    R(30, -44, 3, 36, c.metal);
    R(30, -44, 20, 3, c.metal);
    R(46, -41, 1, 14 + Math.round(Math.sin(time * 0.8) * 3), c.light);
  }
  R(-6, -38, 4, 4, blink(time, 0.5) ? GOLD : c.mid);
  if (level >= 3) R(-46, -36, 66, 2, CYAN);
}

function factory(R, c, level, time) {
  R(-50, -34, 76, 34, c.dark);
  for (let i = 0; i < 3; i++) {
    R(-50 + i * 25, -44 + (i % 2) * 2, 22, 12, c.mid);
    R(-50 + i * 25, -46 + (i % 2) * 2, 22, 3, c.metal);
  }
  windows(R, -44, -22, 5, 12, (i) => (i + Math.floor(time * 2)) % 3 !== 0, GOLD);
  R(30, -62, 9, 62, c.mid);
  R(28, -64, 13, 4, c.metal);
  R(30, -50, 9, 3, c.accent);
  const smoke = (time * 0.7) % 1;
  for (let i = 0; i < 3; i++) {
    const t = (smoke + i / 3) % 1;
    R(32 + t * 14 - 3, -66 - t * 34, 6 + t * 6, 5 + t * 5, `rgba(214,220,224,${(0.55 * (1 - t)).toFixed(2)})`);
  }
  const arm = (Math.sin(time * 0.7) + 1) * 6;
  R(-50, -64, 2, 30, c.metal);
  R(-50, -64, 22 + arm, 3, c.metal);
  R(-28 + arm, -61, 1, 14, c.light);
  R(-31 + arm, -47, 7, 4, c.accent);
  if (level >= 3) R(-52, -36, 80, 2, CYAN);
  const belt = (time * 14) % 12;
  R(-50, -3, 76, 3, c.mid);
  for (let x = -50 + belt; x < 24; x += 12) R(x, -5, 5, 2, c.accent);
}

function control(R, c, level, time, ctx, view, wx, wy) {
  R(-38, -30, 76, 30, c.dark);
  R(-22, -50, 44, 20, c.mid);
  R(-24, -53, 48, 4, c.metal);
  windows(R, -32, -22, 6, 11, (i) => (i + Math.floor(time * 1.5)) % 4 !== 0, c.light);
  windows(R, -16, -44, 4, 9, () => true, level >= 3 ? CYAN : c.light);
  R(-3, -78, 6, 26, c.metal);
  R(-6, -81, 12, 3, c.metal);
  R(-2, -84, 4, 4, blink(time, 0.45) ? RED : c.dark);
  dish(ctx, view, wx - 28, wy - 56, 11, time * 0.5, c.light, c.metal);
  if (level >= 3) dish(ctx, view, wx + 30, wy - 40, 8, -time * 0.6 + 1, c.light, c.metal);
}

function radar(R, c, level, time, ctx, view, wx, wy) {
  R(-28, -10, 56, 10, c.dark);
  R(-30, -12, 60, 3, c.mid);
  R(-4, -44, 8, 34, c.mid);
  R(-6, -46, 12, 4, c.metal);
  const angle = time * (level >= 4 ? 0.9 : 0.5);
  dish(ctx, view, wx, wy - 58, 26, angle, c.light, c.metal, true);
  R(-2, -82, 4, 4, blink(time, 0.5) ? RED : c.dark);
  if (level >= 4) {
    R(-34, -34, 6, 34, CYAN);
    R(28, -34, 6, 34, CYAN);
  }
}

/** Тарелка антенны: эллипс, раскрытие которого меняется при повороте. */
function dish(ctx, view, wx, wy, radius, angle, light, metal, big) {
  const cx = view.sx(wx);
  const cy = view.sy(wy);
  const rx = Math.max(2, Math.abs(Math.cos(angle)) * radius * view.S);
  const ry = radius * view.S * 0.62;
  const tilt = -0.35;
  const line = Math.max(1, Math.round(view.px * (big ? 2 : 1.5)));
  ctx.save();
  ctx.lineWidth = line;
  // обод, вогнутая внутренность и мачта облучателя: тарелка читается как антенна, а не как диск
  ctx.fillStyle = light;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, tilt, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = metal;
  ctx.beginPath();
  ctx.ellipse(cx + rx * 0.06, cy + ry * 0.08, rx * 0.82, ry * 0.8, tilt, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(8,16,24,0.55)';
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, tilt, 0, Math.PI * 2);
  ctx.stroke();
  const feedX = cx + Math.sin(angle) * radius * view.S * 0.55;
  const feedY = cy - ry * 1.5;
  ctx.strokeStyle = light;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(feedX, feedY);
  ctx.stroke();
  ctx.fillStyle = light;
  ctx.fillRect(Math.round(feedX - line), Math.round(feedY - line), line * 2, line * 2);
  ctx.restore();
}

function energy(R, c, level, time, ctx, view, wx, wy) {
  R(-40, -18, 80, 18, c.dark);
  R(-38, -20, 76, 3, c.mid);
  if (level < 3) {
    for (let i = -2; i <= 2; i++) R(i * 12 - 4, -34, 8, 14, c.mid);
    R(-10, -42, 20, 8, c.accent);
  } else {
    for (let i = -2; i <= 2; i++) {
      R(i * 12 - 5, -32 + Math.abs(i) * 2, 10, 14 - Math.abs(i) * 2, i % 2 ? c.mid : CYAN);
    }
    R(-12, -16, 24, 10, c.metal);
  }
  R(-2, -26, 4, 4, blink(time, 0.7) ? GREEN : c.dark);
  if (level >= 5) {
    R(-1, -70, 3, 52, c.metal);
    const a = time * 2.2;
    ctx.save();
    ctx.strokeStyle = c.light;
    ctx.lineWidth = Math.max(1, Math.round(view.px * 1.5));
    ctx.beginPath();
    const hx = view.sx(wx);
    const hy = view.sy(wy - 70);
    for (let k = 0; k < 3; k++) {
      const ang = a + (k * Math.PI * 2) / 3;
      ctx.moveTo(hx, hy);
      ctx.lineTo(hx + Math.cos(ang) * 22 * view.S, hy + Math.sin(ang) * 22 * view.S);
    }
    ctx.stroke();
    ctx.restore();
  }
}

function observation(R, c, level, time, ctx, view, wx, wy) {
  R(-24, -18, 48, 18, c.dark);
  R(-26, -20, 52, 3, c.mid);
  R(-18, -34, 36, 16, c.mid);
  const cx = view.sx(wx);
  const cy = view.sy(wy - 34);
  ctx.fillStyle = c.light;
  ctx.beginPath();
  ctx.ellipse(cx, cy, 18 * view.S, 20 * view.S, 0, Math.PI, 0);
  ctx.fill();
  ctx.fillStyle = c.metal;
  ctx.beginPath();
  ctx.ellipse(cx, cy, 18 * view.S, 20 * view.S, 0, Math.PI * 1.02, Math.PI * 1.5);
  ctx.fill();
  const slit = Math.sin(time * 0.4) * 5;
  R(slit - 3, -52, 6, 18, level >= 3 ? CYAN : '#101b25');
  R(26, -44, 3, 26, c.metal);
  R(26, -48, 14, 3, c.light);
  R(-22, -26, 4, 4, blink(time, 0.6, 0.5) ? GOLD : c.dark);
  windows(R, -16, -12, 4, 9, (i) => (i + Math.floor(time)) % 3 !== 0, c.light);
}

function recovery(R, c, level, time, ctx, view, wx, wy) {
  R(-48, -12, 96, 12, c.dark);
  R(-48, -14, 96, 3, c.mid);
  R(-36, -24, 24, 10, c.mid);
  R(-32, -28, 8, 5, c.accent);
  R(12, -78, 6, 66, c.metal);
  R(12, -78, 38, 5, c.metal);
  R(44, -75, 2, 8, c.mid);
  const hook = -34 + Math.sin(time * 0.6) * 7;
  R(47, -73, 1, hook + 73, c.light);
  R(44, hook - 2, 8, 6, c.accent);
  if (level >= 4) {
    R(-14, -62, 4, 50, c.metal);
    R(-34, -62, 24, 4, c.metal);
    R(-32, -59, 1, 20, c.light);
  }
  R(-44, -18, 5, 5, blink(time, 0.55) ? GOLD : c.dark);
}

// --- значки-подписи ------------------------------------------------------------------

const ICON_DRAW = {
  logistics: (g, s) => {
    g.strokeRect(-4 * s, -3 * s, 8 * s, 6 * s);
    g.beginPath();
    g.moveTo(-4 * s, 0);
    g.lineTo(4 * s, 0);
    g.stroke();
  },
  factory: (g, s) => {
    g.beginPath();
    g.moveTo(-5 * s, 4 * s);
    g.lineTo(-5 * s, -1 * s);
    g.lineTo(-1 * s, -3 * s);
    g.lineTo(-1 * s, -1 * s);
    g.lineTo(3 * s, -3 * s);
    g.lineTo(3 * s, -5 * s);
    g.lineTo(5 * s, -5 * s);
    g.lineTo(5 * s, 4 * s);
    g.closePath();
    g.stroke();
  },
  control: (g, s) => {
    g.strokeRect(-5 * s, -4 * s, 10 * s, 6 * s);
    g.beginPath();
    g.moveTo(0, 2 * s);
    g.lineTo(0, 5 * s);
    g.moveTo(-3 * s, 5 * s);
    g.lineTo(3 * s, 5 * s);
    g.stroke();
  },
  radar: (g, s) => {
    g.beginPath();
    g.arc(0, 2 * s, 5 * s, Math.PI * 1.1, Math.PI * 1.9);
    g.moveTo(0, 2 * s);
    g.lineTo(0, -4 * s);
    g.stroke();
    g.beginPath();
    g.arc(0, 2 * s, 2 * s, Math.PI * 1.2, Math.PI * 1.8);
    g.stroke();
  },
  energy: (g, s) => {
    g.beginPath();
    g.moveTo(1 * s, -5 * s);
    g.lineTo(-3 * s, 1 * s);
    g.lineTo(0, 1 * s);
    g.lineTo(-1 * s, 5 * s);
    g.lineTo(3 * s, -1 * s);
    g.lineTo(0, -1 * s);
    g.closePath();
    g.stroke();
  },
  observation: (g, s) => {
    g.beginPath();
    g.arc(0, 1 * s, 5 * s, Math.PI, 0);
    g.moveTo(-5 * s, 1 * s);
    g.lineTo(5 * s, 1 * s);
    g.moveTo(0, -4 * s);
    g.lineTo(0, 1 * s);
    g.stroke();
  },
  recovery: (g, s) => {
    g.beginPath();
    g.moveTo(-4 * s, 5 * s);
    g.lineTo(-4 * s, -4 * s);
    g.lineTo(4 * s, -4 * s);
    g.lineTo(4 * s, 0);
    g.moveTo(4 * s, 0);
    g.arc(4 * s, 2 * s, 2 * s, -Math.PI / 2, Math.PI);
    g.stroke();
  },
};

/** Плашка-значок над программной постройкой: подпись, что это за объект, пока нет арта. */
export function drawBuildingBadge(ctx, view, key, wx, topY, time) {
  const icon = ICON_DRAW[key];
  if (!icon) return;
  const s = Math.max(1, view.S);
  const cx = view.sx(wx);
  const cy = view.sy(topY - 12 + Math.sin(time * 1.6 + hash2(key.length, 3) * 6) * 1.2);
  const r = 9 * s;
  ctx.save();
  ctx.fillStyle = 'rgba(11,20,32,0.82)';
  ctx.strokeStyle = 'rgba(239,194,99,0.9)';
  ctx.lineWidth = Math.max(1, Math.round(view.px));
  ctx.beginPath();
  ctx.roundRect(cx - r, cy - r, r * 2, r * 2, 3 * s);
  ctx.fill();
  ctx.stroke();
  ctx.translate(cx, cy);
  ctx.strokeStyle = '#f2e4b8';
  ctx.lineWidth = Math.max(1, Math.round(view.px * 1.1));
  ctx.lineJoin = 'round';
  icon(ctx, s);
  ctx.restore();
}

// --- расстановка по якорям ----------------------------------------------------------------

/** Мировая точка (ед. мира) якоря по пикселю HD-острова. */
export function islandToWorld(px, py) {
  return [(px - ISLAND.launchOrigin[0]) * ISLAND.unitsPerPx, (py - ISLAND.launchOrigin[1]) * ISLAND.unitsPerPx];
}

/** Купленные постройки с мировыми координатами; порядок рисования: дальние (севернее) раньше. */
export function buildingDrawOrder(profile) {
  const owned = [];
  for (const key of BUILDING_KEYS) {
    const level = profile && profile.buildings ? profile.buildings[key] | 0 : 0;
    if (level <= 0) continue;
    BUILDING_ANCHORS[key].anchors.forEach((anchor, index) => {
      const [x, y] = islandToWorld(anchor[0], anchor[1]);
      owned.push({ key, level, x, y, mirror: index > 0 });
    });
  }
  owned.sort((a, b) => a.y - b.y || a.x - b.x);
  return owned;
}

/**
 * Рисует купленные постройки по якорям острова (мировые единицы, ось Y вниз). onRect(key, x0, y0, x1, y1) —
 * рамка каждой постройки в пикселях устройства (для тапов). extras — [{ y, draw() }]: объекты, которые нужно
 * вставить в нужную глубину (например, ракета на площадке).
 */
export function drawPlacedBuildings(ctx, painter, view, profile, time, onRect, extras, hooks) {
  const items = buildingDrawOrder(profile);
  const queue = extras && extras.length ? [...items, ...extras].sort((a, b) => a.y - b.y) : items;
  for (const item of queue) {
    if (item.draw) {
      item.draw();
      continue;
    }
    const [w, h] = buildingSize(painter, item.key, item.level);
    if (item.x + w < view.left || item.x - w > view.right || item.y - h > view.bottom || item.y < view.top) continue;
    const build = hooks && hooks.build ? hooks.build(item.key) : null;
    drawBuilding(ctx, painter, view, item.key, item.level, item.x, item.y, time, { mirror: item.mirror, reveal: build ? build.reveal : undefined });
    if (isProceduralBuilding(item.key) && !painter.has(buildingSpriteName(item.key, item.level)) && (!build || build.reveal >= 1)) {
      drawBuildingBadge(ctx, view, item.key, item.x, item.y - h, time);
    }
    if (build && hooks.scaffold) hooks.scaffold(ctx, { x: item.x, y: item.y, w: w * 0.9, h }, build);
    if (onRect) onRect(item.key, view.sx(item.x - w / 2), view.sy(item.y - h), view.sx(item.x + w / 2), view.sy(item.y));
  }
}
