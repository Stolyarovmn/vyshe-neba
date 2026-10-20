// Объекты-входы на острове: Мастерская, Доска контрактов, Лавка, Памятник эпох.
// Мастерская — спрайт сервисного подъёмника эпохи (placeables/workshop/service_lift); остальные нарисованы кодом
// в пиксельном стиле интерфейса. Все рисуются в дизайн-пикселях острова (ноль — низ по центру) через designView.

import { ISLAND, WORLD_ENTRIES, eraYear } from './manifest.js';
import { designRect, designView } from './design.js';
import { clamp, hash2 } from './util.js';

const WOOD = { dark: '#3b2a1a', mid: '#6b4a2c', light: '#9a7242', edge: '#241a10' };
const CORK = { base: '#b98a52', dark: '#8f6a3c', spot: '#d1a468' };
const PAPER = ['#f1e6c3', '#d9e8f2', '#f3e2a8'];
const INK = '#4a4338';
const STONE = { light: '#a6a9ae', mid: '#7a7d84', dark: '#55585f', edge: '#2a2c31' };
const AMBER = '#efc263';
const AMBER_DARK = '#7a5a22';
const LAMP_OFF = '#2a2418';

/** Размер объекта-входа в единицах мира [ширина, высота] по sprite_px. */
export function entrySize(key, painter, era) {
  const spec = WORLD_ENTRIES[key];
  if (!spec) return [40, 40];
  const height = spec.size[1] * ISLAND.unitsPerPx;
  if (key === 'workshop' && painter) {
    const asset = painter.assets.get(`station_service_lift_${eraYear(era)}`);
    if (asset) return [(height * asset.w) / asset.h, height];
  }
  return [spec.size[0] * ISLAND.unitsPerPx, height];
}

/** Мировая точка якоря (ед. мира, ось Y вниз) объекта-входа. */
export function entryWorld(key) {
  const [px, py] = WORLD_ENTRIES[key].anchors[0];
  return [(px - ISLAND.launchOrigin[0]) * ISLAND.unitsPerPx, (py - ISLAND.launchOrigin[1]) * ISLAND.unitsPerPx];
}

function groundShadow(ctx, view, wx, wy, widthUnits, depthUnits) {
  ctx.fillStyle = 'rgba(8,16,24,0.3)';
  ctx.beginPath();
  ctx.ellipse(view.sx(wx), view.sy(wy - depthUnits * 0.1), Math.max(2, (widthUnits * view.S) / 2), Math.max(2, depthUnits * view.S * 0.5), 0, 0, Math.PI * 2);
  ctx.fill();
}

// --- Мастерская ----------------------------------------------------------------------------------

function drawWorkshop(ctx, painter, view, wx, wy, time, era) {
  const [width, height] = entrySize('workshop', painter, era);
  groundShadow(ctx, view, wx, wy, width * 0.95, 12);
  const drawn = painter.sprite(ctx, view, `station_service_lift_${eraYear(era)}`, wx, wy, { h: height, ax: 0.5, ay: 1, smooth: true });
  if (!drawn) {
    const dv = designView(view, wx, wy, ISLAND.unitsPerPx);
    designRect(ctx, dv, -34, -150, 68, 150, '#5a626b');
    designRect(ctx, dv, -34, -150, 68, 6, '#8a929b');
  }
  // сигнальная лампа на верху подъёмника: мастерская «работает»
  const lit = Math.floor(time * 1.6) % 2 === 0;
  const s = view.S;
  ctx.fillStyle = lit ? '#ff6a4a' : '#5a2a22';
  const d = Math.max(2, Math.round(2.4 * s));
  ctx.fillRect(view.sx(wx + width * 0.02) - (d >> 1), view.sy(wy - height * 0.97), d, d);
  return width;
}

// --- Доска контрактов ------------------------------------------------------------------------------

const SHEETS = [
  { x: -25, y: -57, w: 19, h: 15, c: 0, phase: 0.2, lines: 3 },
  { x: -3, y: -58, w: 23, h: 17, c: 1, phase: 1.7, lines: 4 },
  { x: -22, y: -38, w: 17, h: 13, c: 2, phase: 3.1, lines: 3 },
  { x: 1, y: -37, w: 20, h: 14, c: 0, phase: 4.3, lines: 3 },
  { x: 17, y: -55, w: 10, h: 11, c: 2, phase: 5.2, lines: 2 },
];

/** Лист на пробке: покачивается на булавке (угол мал и плавен), строки текста — штрихи. */
function drawSheet(ctx, dv, sheet, time, sway) {
  const pinX = dv.sx(sheet.x + sheet.w / 2);
  const pinY = dv.sy(sheet.y + 2);
  const angle = sway ? Math.sin(time * 1.25 + sheet.phase) * 0.04 : 0;
  const s = dv.S;
  ctx.save();
  ctx.translate(pinX, pinY);
  ctx.rotate(angle);
  const w = Math.max(2, Math.round(sheet.w * s));
  const h = Math.max(2, Math.round(sheet.h * s));
  const x = -Math.round(w / 2);
  const top = -Math.round(2 * s);
  ctx.fillStyle = 'rgba(40,24,10,0.35)';
  ctx.fillRect(x + Math.round(s), top + Math.round(s), w, h);
  ctx.fillStyle = PAPER[sheet.c];
  ctx.fillRect(x, top, w, h);
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  ctx.fillRect(x, top + h - Math.max(1, Math.round(s)), w, Math.max(1, Math.round(s)));
  ctx.fillStyle = INK;
  for (let i = 0; i < sheet.lines; i++) {
    const lineW = Math.round((sheet.w - 6 - (i === sheet.lines - 1 ? 5 : 0)) * s);
    ctx.fillRect(x + Math.round(3 * s), top + Math.round((3.5 + i * 3.2) * s), Math.max(2, lineW), Math.max(1, Math.round(0.9 * s)));
  }
  ctx.fillStyle = sheet.c === 1 ? '#4a7fd0' : '#d04b3f';
  const pin = Math.max(2, Math.round(2.2 * s));
  ctx.fillRect(-(pin >> 1), -(pin >> 1), pin, pin);
  ctx.restore();
}

function drawBoard(ctx, view, wx, wy, time, sheets, sway) {
  const k = ISLAND.unitsPerPx;
  const dv = designView(view, wx, wy, k);
  groundShadow(ctx, view, wx, wy, 78 * k, 14 * k);
  const R = (x, y, w, h, color) => designRect(ctx, dv, x, y, w, h, color);
  // стойки и кровелька
  for (const side of [-1, 1]) {
    R(side * 33 - 3, -66, 6, 66, WOOD.mid);
    R(side * 33 - 3, -66, 2, 66, WOOD.light);
    R(side * 33 + 1, -66, 2, 66, WOOD.dark);
  }
  R(-38, -73, 76, 5, WOOD.dark);
  R(-38, -73, 76, 2, WOOD.mid);
  R(-36, -77, 72, 4, WOOD.mid);
  R(-36, -77, 72, 1, WOOD.light);
  // рама и пробка
  R(-32, -64, 64, 50, WOOD.edge);
  R(-31, -63, 62, 48, WOOD.mid);
  R(-31, -63, 62, 2, WOOD.light);
  R(-28, -60, 56, 42, CORK.base);
  for (let i = 0; i < 40; i++) {
    const rx = -27 + Math.floor(hash2(i, 3, 5) * 54);
    const ry = -59 + Math.floor(hash2(i, 4, 5) * 40);
    R(rx, ry, 1.4, 1.4, hash2(i, 6, 5) > 0.5 ? CORK.dark : CORK.spot);
  }
  R(-28, -20, 56, 2, CORK.dark);
  // лист-«выполнено» внизу доски и листы контрактов
  for (let i = 0; i < clamp(sheets, 0, SHEETS.length); i++) drawSheet(ctx, dv, SHEETS[i], time, sway);
}

// --- Лавка ---------------------------------------------------------------------------------------------

function drawShop(ctx, painter, view, wx, wy, time, era) {
  const k = ISLAND.unitsPerPx;
  const dv = designView(view, wx, wy, k);
  const year = eraYear(era);
  groundShadow(ctx, view, wx, wy, 118 * k, 18 * k);
  const R = (x, y, w, h, color) => designRect(ctx, dv, x, y, w, h, color);
  // стойки, задняя стена и стеллаж
  for (const side of [-1, 1]) {
    R(side * 52 - 2.5, -76, 5, 76, WOOD.mid);
    R(side * 52 - 2.5, -76, 1.6, 76, WOOD.light);
  }
  R(-50, -72, 100, 52, '#2b2118');
  for (const y of [-32, -52]) {
    R(-48, y, 96, 3.5, WOOD.light);
    R(-48, y + 3.5, 96, 1.6, WOOD.dark);
  }
  // ящики на нижней полке и спрайты расходников на верхних
  const crates = [['#c3473a', -44], ['#d9a640', -31], ['#5b7a8c', -18]];
  for (const [color, x] of crates) {
    R(x, -43, 11, 11, WOOD.edge);
    R(x + 1, -42, 9, 9, color);
    R(x + 1, -42, 9, 2, 'rgba(255,255,255,0.25)');
    R(x + 4.5, -42, 2, 9, 'rgba(0,0,0,0.25)');
  }
  const item = (name, x, y, h) => painter.sprite(ctx, view, `${name}_${year}`, wx + x * k, wy + y * k, { h: h * k, smooth: true });
  item('fuel', 22, -52.8, 17);
  item('repair', 38, -52.8, 15);
  item('pack', -34, -52.8, 15);
  item('fuel', -10, -32.2, 15);
  item('repair', 8, -32.2, 13);
  // прилавок
  R(-54, -24, 108, 24, WOOD.edge);
  R(-53, -23, 106, 22, WOOD.mid);
  for (let x = -48; x < 52; x += 12) R(x, -20, 1.4, 19, WOOD.dark);
  R(-55, -27, 110, 5, WOOD.light);
  R(-55, -23, 110, 1.4, WOOD.dark);
  item('coin', -20, -26.5, 9);
  item('coin', -12, -26.5, 9);
  // полосатый навес с фестонами
  const stripes = 12;
  const width = 118 / stripes;
  for (let i = 0; i < stripes; i++) {
    const x = -59 + i * width;
    const color = i % 2 === 0 ? '#c3473a' : '#eadfc0';
    R(x, -90, width + 0.4, 15, color);
    R(x, -90, width + 0.4, 3, 'rgba(255,255,255,0.18)');
    R(x + width * 0.15, -75, width * 0.7, 3, color);
    R(x + width * 0.3, -72, width * 0.4, 2, color);
  }
  R(-60, -92, 120, 3, WOOD.dark);
  // лампа под навесом
  const flicker = 0.8 + 0.2 * Math.sin(time * 3.1);
  R(-1.5, -70, 3, 4, AMBER_DARK);
  R(-2, -66, 4, 4, `rgba(239,194,99,${flicker.toFixed(2)})`);
}

// --- Памятник эпох ---------------------------------------------------------------------------------

const DIGITS = {
  0: ['111', '101', '101', '101', '111'],
  1: ['010', '110', '010', '010', '111'],
  2: ['111', '001', '111', '100', '111'],
  3: ['111', '001', '111', '001', '111'],
  4: ['101', '101', '111', '001', '001'],
  5: ['111', '100', '111', '001', '111'],
  6: ['111', '100', '111', '101', '111'],
  7: ['111', '001', '001', '001', '001'],
  8: ['111', '101', '111', '101', '111'],
  9: ['111', '101', '111', '001', '111'],
};

function drawYear(R, text, x, y, scale, color) {
  for (let d = 0; d < text.length; d++) {
    const glyph = DIGITS[text[d]];
    if (!glyph) continue;
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col < 3; col++) {
        if (glyph[row][col] === '1') R(x + (d * 4 + col) * scale, y + row * scale, scale, scale, color);
      }
    }
  }
}

/** Лампа памятника: lit — пройденная эпоха; glow — вспышка при новой эпохе. */
function lamp(ctx, R, dv, x, y, lit, glow) {
  R(x - 2.5, y - 2.5, 5, 5, STONE.edge);
  R(x - 1.8, y - 1.8, 3.6, 3.6, lit ? AMBER : LAMP_OFF);
  if (lit) R(x - 1.8, y - 1.8, 3.6, 1.4, '#fff3c2');
  if (lit && glow > 0) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const cx = dv.sx(x);
    const cy = dv.sy(y);
    const r = (6 + 8 * glow) * dv.S;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, `rgba(255,214,120,${0.55 * glow})`);
    g.addColorStop(1, 'rgba(255,214,120,0)');
    ctx.fillStyle = g;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    ctx.restore();
  }
}

function drawMonument(ctx, view, wx, wy, time, era, pulse) {
  const k = ISLAND.unitsPerPx;
  const dv = designView(view, wx, wy, k);
  groundShadow(ctx, view, wx, wy, 52 * k, 12 * k);
  const R = (x, y, w, h, color) => designRect(ctx, dv, x, y, w, h, color);
  // ступенчатое основание
  R(-27, -9, 54, 9, STONE.edge);
  R(-26, -8, 52, 7, STONE.mid);
  R(-26, -8, 52, 2, STONE.light);
  R(-21, -17, 42, 9, STONE.edge);
  R(-20, -16, 40, 7, STONE.mid);
  R(-20, -16, 40, 2, STONE.light);
  R(-16, -24, 32, 8, STONE.edge);
  R(-15, -23, 30, 6, STONE.mid);
  R(-15, -23, 30, 2, STONE.light);
  // колонна: сужается кверху ступенями, свет сверху-слева
  for (let y = -25, row = 0; y > -104; y -= 4, row++) {
    const half = 12 - row * 0.22;
    R(-half - 1, y - 4, half * 2 + 2, 4, STONE.edge);
    R(-half, y - 4, half * 2, 4, STONE.mid);
    R(-half, y - 4, half * 0.55, 4, STONE.light);
    R(half - half * 0.4, y - 4, half * 0.4, 4, STONE.dark);
  }
  // навершие
  R(-8, -112, 16, 8, STONE.edge);
  R(-6, -116, 12, 4, STONE.edge);
  R(-3, -120, 6, 4, STONE.edge);
  R(-7, -111, 14, 6, STONE.mid);
  R(-5, -115, 10, 4, STONE.light);
  R(-2, -119, 4, 4, STONE.light);
  // табло с годом эпохи
  R(-13, -86, 26, 17, STONE.edge);
  R(-12, -85, 24, 15, '#0b1420');
  drawYear(R, String(eraYear(era)), -8, -82, 1.5, AMBER);
  R(-12, -85, 24, 1.2, 'rgba(255,255,255,0.1)');
  // лампы по числу пройденных эпох (шесть мест)
  const glow = clamp(pulse, 0, 1);
  for (let i = 0; i < 6; i++) {
    lamp(ctx, R, dv, -11.5 + i * 4.6, -62, i <= era, i === era ? 0.4 + 0.3 * Math.sin(time * 2.4) + glow : glow);
  }
  lamp(ctx, R, dv, 0, -122, true, 0.4 + 0.3 * Math.sin(time * 2.4 + 1) + glow);
}

// --- общий вход ---------------------------------------------------------------------------------------

/**
 * Рисует объект-вход key в мировой точке (wx, wy). ctxInfo: { era, contracts (число активных), pulse, sway }.
 */
export function drawEntry(ctx, painter, view, key, wx, wy, time, info) {
  const era = clamp(info.era | 0, 0, 5);
  switch (key) {
    case 'workshop':
      drawWorkshop(ctx, painter, view, wx, wy, time, era);
      break;
    case 'board':
      drawBoard(ctx, view, wx, wy, time, clamp((info.contracts | 0) + 2, 3, SHEETS.length), info.sway !== false);
      break;
    case 'shop':
      drawShop(ctx, painter, view, wx, wy, time, era);
      break;
    case 'monument':
      drawMonument(ctx, view, wx, wy, time, era, info.pulse || 0);
      break;
    default:
      break;
  }
}

/** Пульсирующий контур-подсказка (угловые скобки) вокруг рамки в пикселях устройства. */
export function drawEntryHint(ctx, rect, time, scale) {
  const pulse = 0.5 + 0.5 * Math.sin(time * 3.2);
  const pad = Math.max(3, 2.5 * scale);
  const x0 = rect.x0 - pad;
  const y0 = rect.y0 - pad;
  const x1 = rect.x1 + pad;
  const y1 = rect.y1 + pad;
  const arm = Math.max(8, Math.min(x1 - x0, y1 - y0) * 0.22);
  const t = Math.max(2, Math.round(scale * 1.2));
  ctx.save();
  ctx.fillStyle = `rgba(239,194,99,${(0.35 + 0.55 * pulse).toFixed(2)})`;
  for (const [cx, cy, sx, sy] of [[x0, y0, 1, 1], [x1, y0, -1, 1], [x0, y1, 1, -1], [x1, y1, -1, -1]]) {
    ctx.fillRect(sx > 0 ? cx : cx - arm, sy > 0 ? cy : cy - t, arm, t);
    ctx.fillRect(sx > 0 ? cx : cx - t, sy > 0 ? cy : cy - arm, t, arm);
  }
  ctx.restore();
}
