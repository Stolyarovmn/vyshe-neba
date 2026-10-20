// Раскладки экранов: портрет и ландшафт, безопасные зоны, цели нажатия ≥ 48 CSS px.
// Чистые функции без DOM. Все размеры — в CSS-пикселях; масштаб интерфейса ui = clamp(min(w,h)/420, 1, 3).

export const MIN_TOUCH = 48;
const NO_SAFE = { t: 0, r: 0, b: 0, l: 0 };

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const R = Math.round;
const rect = (x, y, w, h) => ({ x: R(x), y: R(y), w: R(w), h: R(h) });

export const right = (r) => r.x + r.w;
export const bottom = (r) => r.y + r.h;
export const center = (r) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
export const contains = (r, x, y) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
export const inset = (r, dx, dy = dx) => rect(r.x + dx, r.y + dy, Math.max(0, r.w - dx * 2), Math.max(0, r.h - dy * 2));

export function intersect(a, b) {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w);
  const y2 = Math.min(a.y + a.h, b.y + b.h);
  return x2 > x && y2 > y ? { x, y, w: x2 - x, h: y2 - y } : null;
}

/** Базовые метрики окна. safe — отступы безопасной зоны в CSS-пикселях. */
export function computeLayout(w, h, dpr = 1, safe = NO_SAFE) {
  const s = { t: safe?.t || 0, r: safe?.r || 0, b: safe?.b || 0, l: safe?.l || 0 };
  const ui = clamp(Math.min(w, h) / 420, 1, 3);
  const portrait = h > w;
  const area = rect(s.l, s.t, w - s.l - s.r, h - s.t - s.b);
  return {
    w,
    h,
    dpr,
    orientation: portrait ? 'portrait' : 'landscape',
    portrait,
    ui,
    px: Math.max(2, R(ui * 2)),
    safe: s,
    area,
    gap: R(8 * ui),
    pad: R(12 * ui),
    u: (n) => n * ui,
    touch: (n) => Math.max(MIN_TOUCH, R(n * ui)),
  };
}

/** Прикрепить UI-геометрию к раскладке рендера, сохранив его поля (rocketAnchor и т. п.). */
export function mergeLayouts(base, renderLayout, opts = {}) {
  const hud = hudLayout(base, opts);
  if (!renderLayout) return { ...base, hud, rocketAnchor: defaultAnchor(base) };
  return {
    ...renderLayout,
    ...base,
    hud: { ...(renderLayout.hud || {}), ...hud },
    rocketAnchor: renderLayout.rocketAnchor || defaultAnchor(base),
  };
}

function defaultAnchor(L) {
  return L.portrait ? { x: L.w / 2, y: L.h * 0.68 } : { x: L.w * 0.33, y: L.h * 0.62 };
}

// --- общая рамка экрана ---

export function headerHeight(L) {
  return Math.max(MIN_TOUCH, R(44 * L.ui));
}

export function dockHeight(L) {
  return Math.max(64, R(62 * L.ui));
}

/** Шапка (ресурсы, «назад»), тело и (опционально) док. */
export function screenFrame(L, { header = true, dock = false } = {}) {
  const a = L.area;
  const hh = header ? headerHeight(L) : 0;
  const headerR = rect(a.x + L.gap, a.y + L.gap, a.w - L.gap * 2, hh);
  const top = header ? bottom(headerR) + L.gap : a.y + L.gap;
  const dockR = dock ? dockLayout(L).bar : null;
  const bottomEdge = dockR ? dockR.y - L.gap : bottom(a) - L.gap;
  return {
    header: headerR,
    body: rect(a.x + L.gap, top, a.w - L.gap * 2, Math.max(0, bottomEdge - top)),
    dock: dockR,
  };
}

/** Деление области на две: в портрете сверху/снизу, в ландшафте слева/справа. ratio — доля первой. */
export function splitBody(L, body, ratio = 0.5, gap = L.gap) {
  if (L.portrait) {
    const h1 = R((body.h - gap) * ratio);
    return { a: rect(body.x, body.y, body.w, h1), b: rect(body.x, body.y + h1 + gap, body.w, body.h - h1 - gap) };
  }
  const w1 = R((body.w - gap) * ratio);
  return { a: rect(body.x, body.y, w1, body.h), b: rect(body.x + w1 + gap, body.y, body.w - w1 - gap, body.h) };
}

/** Центрированная карточка с ограничением ширины. */
export function centerCard(L, area, maxW = 560, maxH = 760) {
  const w = Math.min(area.w, R(maxW * L.ui));
  const h = Math.min(area.h, R(maxH * L.ui));
  return rect(area.x + (area.w - w) / 2, area.y + (area.h - h) / 2, w, h);
}

/** Раскладка ряда одинаковых элементов. */
export function row(r, count, gap = 0) {
  const w = (r.w - gap * (count - 1)) / count;
  return Array.from({ length: count }, (_, i) => rect(r.x + i * (w + gap), r.y, w, r.h));
}

export function column(r, count, gap = 0) {
  const h = (r.h - gap * (count - 1)) / count;
  return Array.from({ length: count }, (_, i) => rect(r.x, r.y + i * (h + gap), r.w, h));
}

// --- хаб ---

export const DOCK_ITEMS = ['launch', 'rocket', 'base', 'journal', 'more'];

export function dockLayout(L) {
  const a = L.area;
  const h = dockHeight(L);
  const w = L.portrait ? a.w - L.gap * 2 : clamp(R(a.w * 0.6), Math.min(a.w - L.gap * 2, R(420 * L.ui)), R(760 * L.ui));
  const bar = rect(a.x + (a.w - w) / 2, bottom(a) - L.gap - h, w, h);
  const innerPad = L.px * 2;
  const slots = row(inset(bar, innerPad, innerPad), DOCK_ITEMS.length, L.px);
  return { bar, items: Object.fromEntries(DOCK_ITEMS.map((k, i) => [k, slots[i]])) };
}

/** Боковая/нижняя карточка (постройка, модуль): снизу над доком в портрете, справа в ландшафте. */
export function sheetRect(L, { dock = true } = {}) {
  const a = L.area;
  const frame = screenFrame(L, { header: true, dock });
  if (L.portrait) {
    const h = Math.min(R(frame.body.h * 0.62), R(380 * L.ui));
    return rect(frame.body.x, bottom(frame.body) - h, frame.body.w, h);
  }
  const w = clamp(R(a.w * 0.34), R(300 * L.ui), R(460 * L.ui));
  return rect(right(frame.body) - w, frame.body.y, w, frame.body.h);
}

// --- ракета ---

/** Девять горячих точек вдоль силуэта. t — положение по высоте (0 — верх), side — сторона подписи. */
export const ROCKET_SPOTS = [
  { id: 'parachute', t: 0.06, side: 1 },
  { id: 'capsule', t: 0.2, side: -1 },
  { id: 'avionics', t: 0.3, side: 1 },
  { id: 'tank', t: 0.46, side: -1 },
  { id: 'hull', t: 0.52, side: 1 },
  { id: 'booster', t: 0.72, side: 1 },
  { id: 'engine', t: 0.74, side: -1 },
  { id: 'legs', t: 0.92, side: 1 },
  { id: 'fins', t: 0.92, side: -1 },
];

export function rocketLayout(L) {
  const { body } = screenFrame(L, { header: true });
  const spot = MIN_TOUCH + (L.portrait || L.h < 420 ? 0 : R(4 * L.ui));
  const needH = 5 * spot + 4 * R(L.gap * 0.4) + L.gap * 3;
  const ratio = L.portrait ? clamp(needH / Math.max(1, body.h), 0.5, 0.62) : 0.56;
  const { a: schematic, b: panel } = splitBody(L, body, ratio);
  const standH = L.touch(46);
  const stripH = standH + L.gap * 2;
  const rocketH = Math.min(schematic.h - stripH - L.gap * 2, R(schematic.w * (L.portrait ? 1.05 : 1.2)), R(400 * L.ui));
  const rocketW = R(rocketH * 0.26);
  const cx = schematic.x + schematic.w / 2;
  const roomy = schematic.h > 5 * spot + 4 * L.gap + L.gap * 3;
  const top = schematic.y + (roomy ? L.gap * 1.5 : 1);
  const limit = schematic.y + schematic.h - (roomy ? L.gap : 1);
  const perCol = Math.max(3, Math.floor((limit - top + 2) / (spot + 2)));
  let colGap = L.gap * 1.5;
  if (perCol < 5) colGap = clamp(Math.floor(schematic.w / 2 - 2 - rocketW / 2 - 2 * spot - R(L.gap * 0.5)), 2, colGap);
  const spacing = clamp((limit - top - spot) / (Math.min(5, perCol) - 1), spot, spot + R(L.gap * 0.4));
  const spots = {};
  let compact = false;
  const bySide = { '-1': [], 1: [] };
  for (const s of ROCKET_SPOTS) bySide[s.side].push(s);
  for (const list of Object.values(bySide)) {
    // в тесной раскладке лишние точки уходят во второй столбец дальше от ракеты (без подписей)
    for (let start = 0, col = 0; start < list.length; start += perCol, col++) {
      const chunk = list.slice(start, start + perCol);
      if (col > 0) compact = true;
      const ys = chunk.map((s) => Math.max(top, top + s.t * rocketH - spot / 2));
      for (let i = 1; i < ys.length; i++) ys[i] = Math.max(ys[i], ys[i - 1] + spacing);
      const last = ys.length - 1;
      ys[last] = Math.min(ys[last], limit - spot);
      for (let i = last - 1; i >= 0; i--) ys[i] = Math.min(ys[i], ys[i + 1] - spacing);
      chunk.forEach((s, i) => {
        const off = col * (spot + R(L.gap * 0.5));
        const x = s.side < 0 ? cx - rocketW / 2 - colGap - spot - off : cx + rocketW / 2 + colGap + off;
        spots[s.id] = { ...rect(x, ys[i], spot, spot), side: s.side, col };
      });
    }
  }
  const centerGap = rocketW + colGap * 2;
  const standW = Math.max(MIN_TOUCH, Math.min(L.touch(112), centerGap));
  return {
    schematic,
    panel,
    spot,
    rocket: rect(cx - rocketW / 2, top, rocketW, rocketH),
    spots,
    compact,
    stand: rect(cx - standW / 2, limit - standH, standW, standH),
  };
}

// --- база ---

export function baseLayout(L) {
  const { body } = screenFrame(L, { header: true });
  const { a: map, b: side } = splitBody(L, body, L.portrait ? 0.46 : 0.52);
  const tabsH = L.touch(44);
  return { map, side, tabs: rect(side.x, side.y, side.w, tabsH), list: rect(side.x, side.y + tabsH + L.gap, side.w, side.h - tabsH - L.gap) };
}

// --- журнал / настройки ---

export function journalLayout(L) {
  const { body } = screenFrame(L, { header: true });
  const card = centerCard(L, body, 720, 2000);
  const tabsH = L.touch(44);
  return { card, tabs: rect(card.x, card.y, card.w, tabsH), list: rect(card.x, card.y + tabsH + L.gap, card.w, card.h - tabsH - L.gap) };
}

export function settingsLayout(L) {
  const { body } = screenFrame(L, { header: true });
  return { card: centerCard(L, body, 640, 2000) };
}

// --- запуск ---

export function launchLayout(L) {
  const { body } = screenFrame(L, { header: true });
  const startH = L.touch(64);
  const consH = L.touch(112);
  if (L.portrait) {
    const start = rect(body.x, bottom(body) - startH, body.w, startH);
    const cons = rect(body.x, start.y - L.gap - consH, body.w, consH);
    const dest = rect(body.x, body.y, body.w, cons.y - L.gap - body.y);
    return { dest, cons, start, destCards: column(dest, 3, L.gap) };
  }
  const colW = R(body.w * 0.64);
  const dest = rect(body.x, body.y, colW, body.h);
  const rightCol = rect(body.x + colW + L.gap, body.y, body.w - colW - L.gap, body.h);
  const start = rect(rightCol.x, bottom(rightCol) - startH, rightCol.w, startH);
  const cons = rect(rightCol.x, body.y, rightCol.w, start.y - L.gap - body.y);
  return { dest, cons, start, destCards: row(dest, 3, L.gap) };
}

// --- итоги ---

export function resultsLayout(L) {
  const a = L.area;
  const card = centerCard(L, rect(a.x + L.gap, a.y + L.gap, a.w - L.gap * 2, a.h - L.gap * 2), 600, 780);
  const btnH = L.touch(56);
  const buttons = rect(card.x + L.pad, bottom(card) - L.pad - btnH, card.w - L.pad * 2, btnH);
  return { card, buttons, content: rect(card.x + L.pad, card.y + L.pad, card.w - L.pad * 2, buttons.y - L.gap - card.y - L.pad) };
}

// --- HUD полёта ---

/**
 * Геометрия полётного интерфейса: приборы (постоянные), касательные элементы управления и вспомогательные зоны.
 * Приборы вместе занимают меньше 10% кадра (проверяется тестом).
 */
export function hudLayout(L, opts = {}) {
  const a = L.area;
  const g = L.gap;
  const u = L.ui;
  const btn = R(Math.max(52, 54 * u));
  const pause = rect(right(a) - g - L.touch(48), a.y + g, L.touch(48), L.touch(48));
  const discR = R(Math.max(52, 62 * u));
  const leverW = R(Math.max(56, 60 * u));
  const leverH = R(clamp(L.h * (L.portrait ? 0.24 : 0.46), 150, 190 * u));
  const lever = rect(right(a) - g - leverW, bottom(a) - g - leverH, leverW, leverH);
  const disc = { cx: a.x + g + discR, cy: bottom(a) - g - discR, r: discR };

  const buttons = { pause };
  const instruments = {};
  let strip;
  let radar;
  let hint;

  const gridRight = lever.x - g;
  if (L.portrait) {
    const rowH = R(30 * u);
    const barH = R(16 * u);
    const left = a.x + g;
    const span = pause.x - g - left;
    instruments.alt = rect(left, a.y + g, R(span * 0.4), rowH);
    instruments.vspeed = rect(instruments.alt.x + instruments.alt.w + g, a.y + g, R(span * 0.3), rowH);
    instruments.coins = rect(instruments.vspeed.x + instruments.vspeed.w + g, a.y + g, span - instruments.alt.w - instruments.vspeed.w - g * 2, rowH);
    const barsY = a.y + g + rowH + g;
    const barW = R((span - g) / 2);
    instruments.fuel = rect(left, barsY, barW, barH);
    instruments.hull = rect(left + barW + g, barsY, span - barW - g, barH);
    const topBlock = bottom(instruments.hull);
    hint = rect(a.x + R(a.w * 0.12), topBlock + g * 2, R(a.w * 0.76), R(34 * u));
    radar = { cx: right(a) - g - R(34 * u), cy: bottom(pause) + g + R(34 * u) + g, r: R(34 * u) };
    if (radar.cy - radar.r < topBlock + g) radar.cy = topBlock + g + radar.r;
    // кнопки: два столбца между диском и рычагом
    const colX = [disc.cx + discR + g, 0];
    const free = gridRight - colX[0];
    const bw = Math.min(btn, R((free - g) / 2));
    colX[1] = colX[0] + bw + g;
    const rowY = [bottom(a) - g - bw * 2 - g, bottom(a) - g - bw];
    buttons.boost = rect(colX[0], rowY[0], bw, bw);
    buttons.parachute = rect(colX[1], rowY[0], bw, bw);
    buttons.canister = rect(colX[0], rowY[1], bw, bw);
    buttons.repair = rect(colX[1], rowY[1], bw, bw);
    buttons.transfer = rect(colX[0], rowY[0] - g - bw, bw * 2 + g, bw);
    const controlsTop = Math.min(lever.y, disc.cy - discR, buttons.transfer.y);
    strip = rect(a.x + g, hint.y + hint.h + g, R(12 * u), Math.max(0, controlsTop - g - (hint.y + hint.h + g)));
  } else {
    const rowH = R(32 * u);
    const left = a.x + g;
    instruments.alt = rect(left, a.y + g, R(120 * u), rowH);
    instruments.vspeed = rect(left, bottom(instruments.alt) + g * 0.5, R(120 * u), R(22 * u));
    instruments.coins = rect(pause.x - g - R(104 * u), a.y + g, R(104 * u), rowH);
    const barW = R(14 * u);
    const barsTop = bottom(instruments.vspeed) + g * 2;
    const barsH = Math.max(R(60 * u), disc.cy - discR - g * 2 - barsTop);
    instruments.fuel = rect(left, barsTop, barW, barsH);
    instruments.hull = rect(left + barW + g * 2, barsTop, barW, barsH);
    hint = rect(a.x + R(a.w * 0.3), a.y + g, R(a.w * 0.4), R(34 * u));
    radar = { cx: right(a) - g - R(12 * u) - g - R(34 * u), cy: bottom(pause) + g + R(34 * u), r: R(34 * u) };
    strip = rect(right(a) - g - R(12 * u), bottom(pause) + g, R(12 * u), Math.max(0, lever.y - g - bottom(pause) - g));
    const bw = Math.min(btn, R((gridRight - (disc.cx + discR + g * 2) - g * 2) / 3));
    const startX = gridRight - bw * 3 - g * 2;
    const rowY = [bottom(a) - g - bw * 2 - g, bottom(a) - g - bw];
    buttons.boost = rect(startX + (bw + g) * 2, rowY[1], bw, bw);
    buttons.parachute = rect(startX + (bw + g), rowY[1], bw, bw);
    buttons.canister = rect(startX + (bw + g) * 2, rowY[0], bw, bw);
    buttons.repair = rect(startX + (bw + g), rowY[0], bw, bw);
    buttons.transfer = rect(startX, rowY[0], bw, bw * 2 + g);
  }

  if (opts.mirror) mirrorControls({ a, buttons, disc, lever, pause });

  const instrumentArea = Object.values(instruments).reduce((sum, r) => sum + r.w * r.h, 0) + strip.w * strip.h + Math.PI * radar.r ** 2;
  return { instruments, buttons, disc, lever, strip, radar, hint, instrumentArea, instrumentShare: instrumentArea / (L.w * L.h) };
}

/** Все интерактивные прямоугольники HUD (для проверки размера целей нажатия). */
export function hudTouchTargets(hud) {
  const out = { lever: hud.lever, disc: { x: hud.disc.cx - hud.disc.r, y: hud.disc.cy - hud.disc.r, w: hud.disc.r * 2, h: hud.disc.r * 2 } };
  for (const [k, r] of Object.entries(hud.buttons)) out[k] = r;
  return out;
}

// Зеркало для левшей: диск и рычаг меняются местами, кнопки отражаются; пауза остаётся в правом верхнем углу.
function mirrorControls({ a, buttons, disc, lever, pause }) {
  const flip = (r) => {
    r.x = a.x + a.w - (r.x - a.x) - r.w;
  };
  flip(lever);
  disc.cx = a.x + a.w - (disc.cx - a.x);
  for (const [name, r] of Object.entries(buttons)) if (r !== pause) flip(r);
}

// --- карта базы ---

/**
 * Раскладка маркеров по полосам, чтобы соседние не перекрывались: возвращает lane для каждого элемента.
 * items: [{ key, x }] в экранных координатах, size — ширина маркера, lanes — число полос.
 */
export function assignLanes(items, size, lanes) {
  const order = [...items].sort((a, b) => a.x - b.x);
  const last = Array(lanes).fill(-Infinity);
  const out = {};
  for (const it of order) {
    let best = 0;
    let bestGap = -Infinity;
    for (let l = 0; l < lanes; l++) {
      const gap = it.x - last[l];
      if (gap > bestGap + 0.001) {
        best = l;
        bestGap = gap;
      }
      if (gap >= size * 1.05) {
        best = l;
        bestGap = gap;
        break;
      }
    }
    last[best] = it.x;
    out[it.key] = best;
  }
  return out;
}
