import { MODULE_VIEW, ASSEMBLY_WIDTH, ASSEMBLY_HEIGHT } from '../render/rocket-view.js';

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
    // клетка пиксельной графики интерфейса: 2 CSS px на телефоне, 3 на среднем окне, 4 на большом
    cell: ui < 1.5 ? 2 : ui < 2.3 ? 3 : 4,
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

// --- общая рамка экрана: угловые таблички ---

export function headerHeight(L) {
  return Math.max(MIN_TOUCH, R(44 * L.ui));
}

/**
 * Угловые элементы: слева «назад» / табличка эпохи / шестерёнка, справа таблички данных и монет.
 * o: back, era, gear. Возвращает прямоугольники и строку row, занятую всеми ими. Табличка сжимается на узких экранах.
 */
export function chromeLayout(L, o = {}) {
  const a = L.area;
  const g = L.gap;
  const h = headerHeight(L);
  const y = a.y + g;
  const left0 = a.x + g;
  const right0 = right(a) - g;
  const want = { back: o.back ? h : 0, era: o.era ? R(96 * L.ui) : 0, gear: o.gear ? h : 0, coins: R(120 * L.ui), data: R(96 * L.ui) };
  const min = { era: R(96 * L.ui), coins: R(108 * L.ui), data: R(84 * L.ui) };
  const total = () => Object.keys(want).filter((k) => want[k]).reduce((s, k, i, a2) => s + want[k] + (i ? g : 0), 0);
  const shrink = () => {
    let over = total() - (right0 - left0);
    for (const k of ['coins', 'era', 'data']) {
      if (over <= 0 || !want[k]) continue;
      const cut = Math.min(over, want[k] - min[k]);
      want[k] -= cut;
      over -= cut;
    }
    return over;
  };
  // на узком экране шестерёнка, а затем табличка эпохи уходят во второй ряд, иначе таблички пришлось бы сжимать до нечитаемых
  const row2 = [];
  const kept = {};
  for (const k of ['gear', 'era']) {
    if (shrink() > 0 && want[k]) {
      kept[k] = want[k];
      row2.unshift(k);
      want[k] = 0;
    }
  }
  shrink();
  const out = { y, h, row: rect(left0, y, right0 - left0, row2.length ? h * 2 + g : h) };
  let x = left0;
  for (const k of ['back', 'era', 'gear']) {
    if (!want[k]) continue;
    out[k] = rect(x, y, want[k], h);
    x += want[k] + g;
  }
  let x2 = left0;
  for (const k of row2) {
    out[k] = rect(x2, y + h + g, kept[k], h);
    x2 += kept[k] + g;
  }
  out.data = rect(right0 - want.data, y, want.data, h);
  out.coins = rect(out.data.x - g - want.coins, y, want.coins, h);
  out.left = x - g; // правая граница левой группы
  return out;
}

/** Шапка (угловые таблички) и тело; док — нижняя панель хаба. */
export function screenFrame(L, { header = true, dock = false, back = true, era = false, gear = false } = {}) {
  const a = L.area;
  const hh = header ? headerHeight(L) : 0;
  const headerR = header ? chromeLayout(L, { back, era, gear }).row : rect(a.x + L.gap, a.y + L.gap, a.w - L.gap * 2, 0);
  const top = header ? bottom(headerR) + L.gap : a.y + L.gap;
  const dockR = dock ? dockLayout(L).bar : null;
  const bottomEdge = dockR ? dockR.y - L.gap : bottom(a) - L.gap;
  void hh;
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

// --- хаб: нижняя панель с большой кнопкой «ПУСК» ---

export const DOCK_ITEMS = ['launch', 'rocket', 'base', 'journal', 'shop'];
const NAV_ITEMS = ['rocket', 'base', 'journal', 'shop'];

export function dockHeight(L) {
  return Math.max(64, R(68 * L.ui));
}

/**
 * Нижняя панель хаба: кнопка «ПУСК» по центру под защитной планкой (launch — вся планка, launchBtn — сама кнопка),
 * четыре кнопки-иконки: Мастерская, База, Доска, Лавка. В широком окне они в одном ряду с ПУСКом, в узком — над ним.
 */
export function dockLayout(L) {
  const a = L.area;
  const g = L.gap;
  const nav = Math.max(MIN_TOUCH + 4, R(60 * L.ui));
  const lh = dockHeight(L);
  const cc = L.cell;
  const lwMax = R(300 * L.ui);
  const wide = a.w - g * 2 >= nav * 4 + g * 4 + R(240 * L.ui);
  const lw = wide ? Math.min(lwMax, R((a.w - g * 2) - nav * 4 - g * 4) , R(a.w * 0.34)) : Math.min(lwMax, a.w - g * 2);
  const launch = rect(a.x + (a.w - lw) / 2, bottom(a) - g - lh, lw, lh);
  const items = { launch };
  const btn = Math.max(MIN_TOUCH, lh - cc * 4);
  const guard = rect(launch.x + cc * 2, launch.y + cc * 2, launch.w - cc * 4, launch.h - cc * 4);
  let bar;
  if (wide) {
    const y = launch.y + (launch.h - nav) / 2;
    items.rocket = rect(launch.x - g * 2 - nav * 2 - g, y, nav, nav);
    items.base = rect(launch.x - g - nav, y, nav, nav);
    items.journal = rect(right(launch) + g, y, nav, nav);
    items.shop = rect(right(launch) + g * 2 + nav, y, nav, nav);
    bar = rect(items.rocket.x, launch.y, items.shop.x + nav - items.rocket.x, launch.h);
  } else {
    const total = nav * 4 + g * 3;
    const y = launch.y - g * 1.5 - nav;
    const x0 = a.x + (a.w - total) / 2;
    NAV_ITEMS.forEach((k, i) => {
      items[k] = rect(x0 + i * (nav + g), y, nav, nav);
    });
    bar = rect(Math.min(launch.x, x0), y, Math.max(launch.w, total), bottom(launch) - y);
  }
  return { bar, items, launch, guard, button: guard, nav, btn };
}

/** Область сцены между угловыми табличками и нижней панелью: сюда ставятся выноски. */
export function sceneArea(L, { dock = false, header = true, ...opts } = {}) {
  const f = screenFrame(L, { header, dock, ...opts });
  return f.body;
}

/** Выноска: область, где щиток может стоять (под табличками, над панелью). */
export function sheetRect(L, { dock = true } = {}) {
  const b = sceneArea(L, { dock, back: false, era: true, gear: true });
  if (L.portrait) {
    const h = Math.min(R(b.h * 0.62), R(380 * L.ui));
    return rect(b.x, bottom(b) - h, b.w, h);
  }
  const w = clamp(R(L.area.w * 0.34), R(300 * L.ui), R(460 * L.ui));
  return rect(right(b) - w, b.y, w, b.h);
}

// --- ракета: мастерская ---

/** Девять горячих точек вдоль сборки. t — положение по высоте (0 — верх), берётся из render/rocket-view.js; side — сторона подписи. */
const SPOT_SIDE = { capsule: -1, avionics: 1, tank: -1, hull: 1, booster: 1, engine: -1, legs: 1, fins: -1 };
export const ROCKET_SPOTS = Object.entries(SPOT_SIDE)
  .map(([id, side]) => ({ id, side, t: MODULE_VIEW[id].tAnchor }))
  .sort((p, q) => p.t - q.t);

export function rocketLayout(L) {
  const { body } = screenFrame(L, { header: true });
  const spot = L.portrait || L.h < 420 ? MIN_TOUCH : R(MIN_TOUCH * Math.min(L.ui, 1.45));
  const schematic = rect(body.x, body.y, body.w, body.h);
  const standH = L.touch(46);
  const stripH = standH + L.gap * 2;
  const flameRoom = R(Math.min(schematic.h, schematic.w * 1.05) * 0.1);
  const rocketH = Math.min(schematic.h - stripH - flameRoom - L.gap * 2, R(schematic.w * (L.portrait ? 1.05 : 1.2)), R(400 * L.ui));
  const rocketW = R((rocketH * ASSEMBLY_WIDTH) / ASSEMBLY_HEIGHT);
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
    // в тесной раскладке лишние точки уходят во второй столбец дальше от ракеты
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
    spot,
    rocket: rect(cx - rocketW / 2, top, rocketW, rocketH),
    spots,
    compact,
    stand: rect(cx - standW / 2, limit - standH, standW, standH),
  };
}

// --- строительство: остров и стойка зданий ---

export const BUILD_COUNT = 14;

export function baseLayout(L) {
  const { body } = screenFrame(L, { header: true, era: true });
  const tile = Math.max(MIN_TOUCH + 4, R(58 * L.ui));
  const gap = R(L.gap * 0.6);
  const padR = R(L.pad * 0.7);
  const cols = Math.min(BUILD_COUNT, Math.max(1, Math.floor((body.w - padR * 2 + gap) / (tile + gap))));
  const rows = Math.ceil(BUILD_COUNT / cols);
  const rackH = rows * tile + (rows - 1) * gap + padR * 2;
  const rack = rect(body.x, bottom(body) - rackH, body.w, rackH);
  // последняя неполная строка центрируется
  const tiles = [];
  for (let i = 0; i < BUILD_COUNT; i++) {
    const rIdx = Math.floor(i / cols);
    const inRow = rIdx === rows - 1 ? BUILD_COUNT - rIdx * cols : cols;
    const rowW = inRow * tile + (inRow - 1) * gap;
    const x0 = rack.x + (rack.w - rowW) / 2;
    tiles.push(rect(x0 + (i - rIdx * cols) * (tile + gap), rack.y + padR + rIdx * (tile + gap), tile, tile));
  }
  const energy = rect(body.x, body.y, R(124 * L.ui), R(64 * L.ui));
  return { rack, tiles, energy, body, cols, rows, tile };
}

// --- доска и лавка ---

export function journalLayout(L) {
  const { body } = screenFrame(L, { header: true });
  if (L.portrait) {
    const hb = R(body.h * 0.56);
    return { board: rect(body.x, body.y, body.w, hb), shelf: rect(body.x, body.y + hb + L.gap, body.w, body.h - hb - L.gap), body };
  }
  const wb = R((body.w - L.gap) * 0.6);
  return { board: rect(body.x, body.y, wb, body.h), shelf: rect(body.x + wb + L.gap, body.y, body.w - wb - L.gap, body.h), body };
}

export function shopLayout(L) {
  const { body } = screenFrame(L, { header: true });
  const counterH = Math.max(MIN_TOUCH, R(46 * L.ui));
  const shelvesH = body.h - counterH - L.gap;
  const half = R((shelvesH - L.gap) / 2);
  return {
    body,
    shelf1: rect(body.x, body.y, body.w, half),
    shelf2: rect(body.x, body.y + half + L.gap, body.w, shelvesH - half - L.gap),
    counter: rect(body.x, bottom(body) - counterH, body.w, counterH),
  };
}

export function settingsLayout(L) {
  const { body } = screenFrame(L, { header: true });
  return { card: centerCard(L, body, 640, 2000) };
}

// --- запуск: пульт ---

export function launchLayout(L) {
  const { body } = screenFrame(L, { header: true });
  const p = R(L.pad * 0.9);
  const startH = Math.max(72, R(76 * L.ui));
  const lampsH = R(26 * L.ui);
  const consH = Math.max(MIN_TOUCH + 12, R(70 * L.ui));
  if (L.portrait) {
    // корпус пульта подгоняется под содержимое: ряд ламп, планеты на всю доступную высоту, гнёзда и ПУСК без пустот между ними
    const cw = Math.min(body.w, R(760 * L.ui));
    const fixedH = lampsH + consH + startH + L.gap * 4;
    const maxInnerH = body.h - p * 2;
    const destH = clamp(maxInnerH - fixedH, R(140 * L.ui), R(300 * L.ui));
    const innerH = Math.min(maxInnerH, fixedH + destH);
    const panelH = innerH + p * 2;
    const panel = rect(body.x + (body.w - cw) / 2, body.y + (body.h - panelH) / 2, cw, panelH);
    const inner = rect(panel.x + p, panel.y + p, panel.w - p * 2, innerH);
    const lamps = rect(inner.x, inner.y, inner.w, lampsH);
    const start = rect(inner.x, bottom(inner) - startH, inner.w, startH);
    const cons = rect(inner.x, start.y - L.gap - consH, inner.w, consH);
    const destArea = rect(inner.x, bottom(lamps) + L.gap, inner.w, Math.max(0, cons.y - L.gap - bottom(lamps) - L.gap));
    return { panel, inner, lamps, destArea, dest: row(destArea, 3, L.gap), cons, consSlots: row(cons, 4, L.gap), start };
  }
  const panel = centerCard(L, body, 760, 2000);
  const inner = rect(panel.x + p, panel.y + p, panel.w - p * 2, panel.h - p * 2);
  const rightW = clamp(R(inner.w * 0.3), R(180 * L.ui), R(280 * L.ui));
  const leftW = inner.w - rightW - L.gap;
  const lamps = rect(inner.x, inner.y, leftW, lampsH);
  const cons = rect(inner.x, bottom(inner) - consH, leftW, consH);
  const destArea = rect(inner.x, bottom(lamps) + L.gap, leftW, Math.max(0, cons.y - L.gap - bottom(lamps) - L.gap));
  const start = rect(inner.x + leftW + L.gap, inner.y + R(inner.h / 2 - startH * 0.9), rightW, startH * 1.8);
  return { panel, inner, lamps, destArea, dest: row(destArea, 3, L.gap), cons, consSlots: row(cons, 4, L.gap), start };
}

// --- итоги: бланк ---

export function resultsLayout(L) {
  const a = L.area;
  const top = a.y + L.gap * 2 + headerHeight(L);
  const card = centerCard(L, rect(a.x + L.gap, top, a.w - L.gap * 2, bottom(a) - L.gap - top), 600, 780);
  const btnH = L.portrait || L.h >= 460 ? L.touch(56) : MIN_TOUCH;
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
  // приборы на маленьких экранах чуть ужимаются (до 0,88), кнопки управления — нет
  const iu = clamp(Math.min(L.w, L.h) / 420, 0.88, 1.55);
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
    const rowH = R(36 * iu);
    const barH = R(16 * iu);
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
    hint = rect(a.x + R(a.w * 0.12), topBlock + g * 2, R(a.w * 0.76), R(34 * iu));
    // радар под подсказкой справа: длинная подсказка его не перекрывает
    radar = { cx: right(a) - g - R(34 * iu), cy: hint.y + hint.h + g + R(34 * iu), r: R(34 * iu) };
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
    strip = rect(a.x + g, hint.y + hint.h + g, R(16 * iu), Math.max(0, controlsTop - g - (hint.y + hint.h + g)));
  } else {
    const rowH = R(40 * iu);
    const left = a.x + g;
    instruments.alt = rect(left, a.y + g, R(140 * iu), rowH);
    instruments.vspeed = rect(left, bottom(instruments.alt) + g * 0.5, R(140 * iu), R(34 * iu));
    instruments.coins = rect(pause.x - g - R(104 * iu), a.y + g, R(104 * iu), rowH);
    const barW = R(18 * iu);
    const barsTop = bottom(instruments.vspeed) + g * 2;
    const barsH = Math.max(R(60 * iu), disc.cy - discR - g * 2 - barsTop);
    instruments.fuel = rect(left, barsTop, barW, barsH);
    instruments.hull = rect(left + barW + g * 2, barsTop, barW, barsH);
    hint = rect(a.x + R(a.w * 0.3), a.y + g, R(a.w * 0.4), R(34 * iu));
    radar = { cx: right(a) - g - R(16 * iu) - g - R(34 * iu), cy: bottom(pause) + g + R(34 * iu), r: R(34 * iu) };
    strip = rect(right(a) - g - R(16 * iu), bottom(pause) + g, R(16 * iu), Math.max(0, lever.y - g - bottom(pause) - g));
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
