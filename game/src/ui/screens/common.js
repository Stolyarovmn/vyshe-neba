// Общие части сцен: угловые таблички, запасной фон, щитки-выноски модулей и построек, щиток эпохи, индикатор энергии.
// Всё рисуется пиксельным набором кита: рамки, лампы, сегментные полоски; текста мало.

import { t } from '../../i18n/index.js';
import { clamp, fmtCompact, fmtInt } from '../format.js';
import { chromeLayout } from '../layout.js';

const MIN_ROW = 44; // нижняя граница высоты нажимаемых строк и кнопок щитка

export const BUILDING_KEYS = ['beacons', 'gantry', 'deluge', 'service', 'rescue', 'fuel', 'logistics', 'factory', 'weather', 'control', 'radar', 'energy', 'observation', 'recovery'];
// восемь модулей: парашют стал расходником лавки и в прокачке не участвует
export const PART_KEYS = ['engine', 'tank', 'hull', 'booster', 'capsule', 'legs', 'fins', 'avionics'];

export const BUILDING_ICON = {
  beacons: 'target', gantry: 'building', deluge: 'fuel', service: 'repair', rescue: 'shield', fuel: 'canister', logistics: 'cart',
  factory: 'gear', weather: 'wind', control: 'avionics', radar: 'radar', energy: 'bolt', observation: 'eye', recovery: 'chute',
};

/** Имя иконки постройки: спрайт здания по эпохе/уровню (см. ui/icons.js), векторный запасной вариант — из BUILDING_ICON. */
export const buildingIcon = (key, level = 0) => `bld:${key}:${level}`;
export const partIcon = (id) => id;

export const STAT_BETTER_DOWN = new Set(['burnRate', 'consumption', 'drag', 'mass', 'cost', 'fuelBurn']);

export const statLabel = (key) => {
  const k = `stat.${key}`;
  const s = t(k);
  return s === k ? key : s;
};

/** Год эпохи. */
export const ERA_YEARS = [1978, 1986, 1998, 2015, 2035, 2060];

// Названия берутся из data/ (там же единицы измерения); короткие подписи и i18n — запасной вариант.
const fromKey = (key, fallback) => {
  const s = t(key);
  return s === key ? fallback : s;
};
export const partName = (app, id) => app.data.PARTS?.[id]?.name || fromKey(`part.${id}.name`, id);
export const partShort = (app, id) => fromKey(`part.short.${id}`, partName(app, id));
export const partDesc = (app, id) => app.data.PARTS?.[id]?.desc || fromKey(`part.${id}.desc`, '');
export const buildingName = (app, key) => app.data.BUILDINGS?.[key]?.name || fromKey(`building.${key}.name`, key);
export const buildingShort = (app, key) => fromKey(`building.short.${key}`, buildingName(app, key));
export const buildingDesc = (app, key) => app.data.BUILDINGS?.[key]?.desc || fromKey(`building.${key}.desc`, '');
export const eraName = (app, id) => app.data.ERAS?.[id]?.name || fromKey(`era.${id}.name`, '');
export const eraDesc = (app, id) => app.data.ERAS?.[id]?.desc || fromKey(`era.${id}.desc`, '');

/** Первое предложение без точки: описания для экранов — одна короткая строка. */
export const oneLine = (str) => String(str || '').split(/(?<=[.!?])\s/)[0].replace(/[.]$/, '');

/** Короткая подпись показателя: словарь stat.* или первые два слова названия. */
export function statShort(info) {
  const k = `stat.${info.key}`;
  const s = t(k);
  if (s !== k) return s;
  return String(info.label || info.key).split(/\s+/).slice(0, 2).join(' ');
}

/** Форматирование показателя по описанию { unit, digits }: доли — в процентах, «×» — множитель. */
export function fmtInfo(info, v) {
  if (typeof v !== 'number' || !Number.isFinite(v)) return '—';
  if (info.factor && info.factor !== 1) v *= info.factor; // например, радианы → градусы
  if (info.unit === '%') return `${Math.round(v * 100)}%`;
  if (info.unit === '°') return `${Math.round(v)}°`;
  const s = Number(v.toFixed(info.digits ?? 1)).toString().replace('.', ',');
  return info.unit === '×' ? `×${s}` : s;
}

/** Строки «было → станет» по описанию показателей и двум наборам значений. */
export function deltaRows(infos, before, after) {
  const rows = [];
  for (const info of infos || []) {
    const a = before?.[info.key] ?? 0;
    const b = after?.[info.key] ?? 0;
    if (typeof a !== 'number' || typeof b !== 'number') continue;
    rows.push({ key: info.key, label: statShort(info), before: a, after: b, better: info.dir < 0 ? 'down' : 'up', fmt: (v) => fmtInfo(info, v), changed: a !== b });
  }
  return rows;
}

export const isFundsReason = (r) => r.kind === 'coins' || r.kind === 'data';

// ---------- запасной фон (если арт недоступен) ----------

let bgCache = null;

/** Фон-запаска без сетки: тёмная ступенчатая заливка шашками двух тонов и несколько звёзд. */
export function drawFallbackBackground(ctx, L, kit) {
  const key = `${L.w}x${L.h}@${L.dpr}|${L.cell}`;
  if (!bgCache || bgCache.key !== key) {
    const cv = document.createElement('canvas');
    cv.width = Math.ceil(L.w * L.dpr);
    cv.height = Math.ceil(L.h * L.dpr);
    const g = cv.getContext('2d');
    g.scale(L.dpr, L.dpr);
    const c = kit.c;
    g.fillStyle = c.navy1;
    g.fillRect(0, 0, L.w, L.h);
    const band = Math.round(L.h / 5);
    const cc = L.cell * 2;
    for (let b = 1; b <= 3; b++) {
      g.fillStyle = b % 2 ? c.bg : c.navy1;
      for (let y = b * band; y < (b + 1) * band; y += cc) for (let x = ((y / cc) % 2) * cc; x < L.w; x += cc * 2) g.fillRect(x, y, cc, cc);
    }
    g.fillStyle = c.bg;
    g.fillRect(0, band * 4, L.w, L.h - band * 4);
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    g.fillStyle = c.steel3;
    for (let i = 0; i < 60; i++) g.fillRect(Math.floor((rnd() * L.w) / L.cell) * L.cell, Math.floor((rnd() * L.h) / L.cell) * L.cell, L.cell, L.cell);
    bgCache = { key, canvas: cv };
  }
  ctx.drawImage(bgCache.canvas, 0, 0, L.w, L.h);
}

// ---------- угловые таблички ----------

/**
 * Угловые элементы сцены: «назад» / табличка эпохи / шестерёнка слева, таблички данных и монет справа.
 * o: back, era, gear, coins, data (значения для анимации; по умолчанию из профиля).
 * Возвращает { G, era, gear } — раскладка и нажатия кнопок эпохи/шестерёнки.
 */
export function drawChrome(app, kit, o = {}) {
  const L = kit.L;
  const c = kit.c;
  const p = app.profile;
  const G = chromeLayout(L, o);
  const out = { G, era: false, gear: false };
  if (o.back && G.back && kit.iconButton('back', G.back, { icon: 'back', label: t('common.back'), variant: 'btn' })) app.back();
  if (o.era && G.era) {
    const cc = kit.cell();
    if (kit.button('plate-era', G.era, { variant: o.eraOpen ? 'cardOn' : 'raised', icon: 'era', label: String(ERA_YEARS[p.era] ?? ''), size: Math.round(G.era.h * 0.3), iconSize: Math.round(G.era.h * 0.46), lamp: false })) out.era = true;
    void cc;
  }
  if (o.gear && G.gear && kit.iconButton('hub-gear', G.gear, { icon: 'gear', label: t('more.settings'), variant: 'btn' })) out.gear = true;
  kit.plate(G.coins.x, G.coins.y, G.coins.w, G.coins.h, 'coin', o.coins ?? p.coins, c.gold);
  kit.plate(G.data.x, G.data.y, G.data.w, G.data.h, 'data', o.data ?? p.data, c.cyan);
  app.plateRects = { coins: G.coins, data: G.data };
  return out;
}

// ---------- индикаторы уровней ----------

/** Ряд сегментов уровня: янтарные — куплено, серые — доступно по эпохе, тёмные — закрыто эпохой. */
export function levelSegs(kit, r, level, max, cap) {
  const c = kit.c;
  const cc = kit.cell();
  const gap = Math.max(cc, Math.round(r.w / max / 8));
  const w = Math.max(cc * 2, Math.floor((r.w - gap * (max - 1)) / max));
  const total = w * max + gap * (max - 1);
  const x0 = Math.round(r.x + (r.w - total) / 2);
  for (let i = 0; i < max; i++) {
    const x = x0 + i * (w + gap);
    const filled = i < level;
    const reachable = cap === undefined || i < cap;
    kit.rect(x, r.y, w, r.h, c.ink);
    kit.rect(x + cc, r.y + cc, Math.max(1, w - cc * 2), Math.max(1, r.h - cc * 2), filled ? c.amber : reachable ? c.steel0 : c.navy2);
    if (filled) kit.rect(x + cc, r.y + cc, Math.max(1, w - cc * 2), cc, c.amberLight);
  }
}

// ---------- причины блокировки ----------

/**
 * Строки причин блокировки: замок, значок нужной постройки/модуля и два слова. Деньги здесь не показываются
 * (их недостаток красит цену). Возвращает высоту. o.goto(buildingKey) делает строку постройки кнопкой.
 */
export function lockRows(app, kit, x, y, w, reasons, o = {}) {
  const L = kit.L;
  const c = kit.c;
  const size = kit.fs(12);
  let cy = y;
  for (const r of reasons) {
    if (isFundsReason(r)) continue;
    const tappable = !!(o.goto && r.kind === 'building' && r.building);
    const rowH = tappable ? L.touch(44) : Math.round(28 * L.ui);
    const mid = cy + rowH / 2;
    const row = { x, y: cy, w, h: rowH };
    if (tappable && kit.button(`goto-${r.building}`, row, { variant: 'inset' })) o.goto(r.building);
    if (!o.compact) kit.icon('lock', x + size * 1.0, mid, Math.round(size * 1.4), c.amber);
    let ix = o.compact ? x + size * 0.6 : x + size * 2.2;
    let label;
    if (r.kind === 'building') {
      kit.icon(buildingIcon(r.building, 1), ix + size * 0.9, mid, Math.round(size * 2), c.text);
      label = `${buildingShort(app, r.building)} ${t('lvl.short', { n: r.level })}`;
    } else if (r.kind === 'part') {
      kit.icon(partIcon(r.part), ix + size * 0.9, mid, Math.round(size * 2), c.text);
      label = `${partShort(app, r.part)} ${t('lvl.short', { n: r.level })}`;
    } else if (r.kind === 'era') {
      kit.icon('era', ix + size * 0.9, mid, Math.round(size * 1.8), c.text);
      label = String(ERA_YEARS[r.era] ?? '');
    } else {
      label = app.reasonText(r).split(/\s+/).slice(0, 2).join(' ');
      ix -= size * 1.5;
    }
    ix += size * 2.3;
    kit.drawText(label, ix, mid, { size, color: c.red, maxWidth: x + w - ix - size * 0.4 });
    cy += rowH + Math.round(L.gap * 0.3);
  }
  return cy - y;
}

// ---------- щиток модуля и постройки ----------

// поля щитка уменьшаются вместе с масштабом: в тесном окне каждая строка на счету
const padOfL = (L, uu) => (uu < L.ui * 0.95 ? Math.round(L.pad * 0.6) : L.pad);

/**
 * Масштаб размеров щитка: если щиток не помещается в bounds, его строки ужимаются (но не меньше 0,62).
 * Если не помещается и так, щиток получает всю безопасную область окна: он важнее фона. Возвращает { u, bounds }.
 */
function fitScale(L, bounds, calcH) {
  const tryFit = (b) => {
    const avail = (b?.h ?? L.area.h) - L.gap * 2;
    let u = L.ui;
    for (let i = 0; i < 4; i++) {
      const h = calcH(u);
      if (h <= avail) return u;
      u = Math.max(L.ui * 0.62, u * Math.max(0.7, avail / h));
    }
    return calcH(u) <= avail ? u : null;
  };
  const u = tryFit(bounds);
  if (u !== null) return { u, bounds };
  // сначала вся область под угловыми табличками, и только если и там тесно — всё окно
  const row = chromeLayout(L, { back: true, era: true, gear: true }).row;
  const top = row.y + row.h + L.gap;
  const below = { x: L.area.x, y: top, w: L.area.w, h: L.area.y + L.area.h - top };
  const ub = tryFit(below);
  if (ub !== null) return { u: ub, bounds: below };
  const full = { x: L.area.x, y: L.area.y, w: L.area.w, h: L.area.h };
  return { u: tryFit(full) ?? L.ui * 0.62, bounds: full };
}

/**
 * Универсальный щиток-выноска: название, сегменты уровня, до трёх строк «было → станет», причины блокировки,
 * цена и кнопка. Прикреплён хвостиком к spec.target (рамка объекта) либо spec.anchor.
 * spec: id, target, anchor, bounds, side, name, iconName, iconAlpha, level, max, cap, rows, locks, goto,
 *       next (есть ли следующий уровень), cost { coins, data }, canBuy, buyLabel, buyId, onBuy, line, extra(rect) -> height.
 */
export function infoCallout(app, kit, spec) {
  const L = kit.L;
  const c = kit.c;
  const p = app.profile;
  const padOf = (uu) => padOfL(L, uu);
  const rows = (spec.rows || []).slice(0, 3);
  const locks = (spec.locks || []).filter((r) => !isFundsReason(r)).slice(0, 2);
  const dims = (uu) => {
    const touch = (n) => Math.max(MIN_ROW, Math.round(n * uu));
    // абсолютные минимумы: при сжатии щитка строки не должны слипаться (подпись, зазор, полоска помещаются всегда)
    const atLeast = (n, min) => Math.max(min, Math.round(n * uu));
    return {
      titleH: atLeast(34, 28),
      segH: atLeast(18, 16),
      rowH: atLeast(36, 30),
      lockH: (spec.goto ? touch(44) : atLeast(28, 26)) + Math.round(L.gap * 0.3),
      lineH: spec.line ? atLeast(24, 20) : 0,
      footH: spec.next === false || spec.noBuy ? atLeast(32, 28) : touch(52),
    };
  };
  const calcH = (uu) => {
    const d = dims(uu);
    const extra = typeof spec.extraH === 'function' ? spec.extraH(uu) : spec.extraH || 0;
    return padOf(uu) * 2 + d.titleH + (spec.max ? d.segH : 0) + d.lineH + rows.length * (d.rowH + Math.round(L.gap * 0.3)) + locks.length * d.lockH + extra + d.footH + L.gap;
  };
  const { u, bounds } = fitScale(L, spec.bounds, calcH);
  const w = Math.min(Math.round(310 * L.ui), 420, L.area.w - L.gap * 2);
  const { titleH, segH, rowH, lockH, lineH, footH } = dims(u);
  const h = calcH(u);
  const co = kit.callout(spec.id, spec.anchor || { x: L.w / 2, y: L.h / 2 }, { w, h }, { target: spec.target, bounds, side: spec.side, variant: 'panel', pad: padOf(u) });
  const r = co.inner;
  let y = r.y;
  // содержимое щитка лежит выше слоя самого щитка, иначе щиток перехватывает нажатия кнопок
  kit.withLayer(61, () => {
    const cc = kit.cell();
    const fy = r.y + r.h - footH;
    const hasButton = !spec.noBuy && spec.next !== false;
    const fr = co.rect;
    // экран эпохи (ЭЛТ, плоский дисплей…): название, шкала уровня, «было → станет», причины блокировки;
    // под ним на корпусе — табло цены и кнопка. Без кнопки экран занимает весь щиток.
    const scrBottom = hasButton ? fy - Math.round(L.gap * 0.4) : fr.y + fr.h - cc * 2;
    const scr = { x: fr.x + cc * 2, y: fr.y + cc * 2, w: fr.w - cc * 4, h: scrBottom - (fr.y + cc * 2) };
    kit.screen(`callout-${spec.id}`, scr, () => {
      let y = r.y;
      const icoS = Math.round(30 * u);
      kit.icon(spec.iconName, r.x + icoS / 2, y + titleH / 2, icoS, c.text, spec.iconAlpha ?? 1);
      const lvl = spec.tag ?? (spec.max ? `${spec.level}/${spec.max}` : '');
      const lvlW = lvl ? kit.text.measure(lvl, kit.fs(14)) + L.gap : 0;
      kit.drawText(spec.name, r.x + icoS + L.gap, y + titleH / 2, { size: kit.fs(14), color: c.text, maxWidth: r.w - icoS - L.gap - lvlW, shadow: true });
      if (lvl) kit.drawText(lvl, r.x + r.w, y + titleH / 2, { size: kit.fs(14), color: c.amber, align: 'right' });
      y += titleH;
      if (spec.max) {
        levelSegs(kit, { x: r.x, y: y + Math.round(2 * u), w: r.w, h: Math.round(10 * u) }, spec.level, spec.max, spec.cap);
        y += segH;
      }
      if (spec.line) {
        kit.drawText(spec.line, r.x, y + lineH / 2 - Math.round(2 * u), { size: kit.fs(11), color: c.textDim, maxWidth: r.w });
        y += lineH;
      }
      for (const row of rows) {
        kit.statDelta({ x: r.x, y, w: r.w, h: rowH }, row);
        y += rowH + Math.round(L.gap * 0.3);
      }
      if (locks.length) y += lockRows(app, kit, r.x, y, r.w, locks, { goto: spec.goto });
      if (spec.extra) y += spec.extra({ x: r.x, y, w: r.w }, u) || 0;
      // состояние без кнопки: «макс» / награда / «есть» — на самом экране внизу
      if (!hasButton) {
        const sy = r.y + r.h - footH + footH / 2;
        if (spec.noBuy) {
          if (spec.cost) kit.costChip(r.x, sy, spec.cost, { size: kit.fs(13) });
          if (spec.doneText) {
            kit.lamp(r.x + r.w - Math.round(10 * u), sy, Math.round(15 * u), c.green, true);
            kit.drawText(spec.doneText, r.x + r.w - Math.round(26 * u), sy, { size: kit.fs(13), color: c.green, align: 'right' });
          }
        } else {
          kit.lamp(r.x + Math.round(10 * u), sy, Math.round(15 * u), c.green, true);
          kit.drawText(spec.doneText || t('card.maxed'), r.x + Math.round(26 * u), sy, { size: kit.fs(14), color: c.green });
        }
      }
    }, { opaque: true });

    if (hasButton) {
      // подвал: табло цены (на экране эпохи) и кнопка; кнопка берёт сколько нужно подписи, не хватает места — значок убирается
      const bsize = kit.fs(15);
      const costW = spec.cost ? kit.costWidth(spec.cost, kit.fs(13)) : 0;
      const powSize = kit.fs(13);
      const powW = spec.power ? Math.round(powSize * 1.4) + kit.text.measure(spec.power.text, powSize) + L.gap : 0;
      const availBtn = r.w - costW - powW - L.gap * 2 - cc * 4;
      const want = kit.text.measure(spec.buyLabel, bsize) + Math.round(bsize * 1.9) + cc * 8;
      const withIcon = want <= availBtn;
      const btnW = Math.round(Math.max(Math.min(r.w * 0.52, availBtn), Math.min(want, availBtn)));
      const price = { x: r.x, y: fy + cc, w: Math.max(cc * 12, r.w - btnW - L.gap), h: footH - cc * 2 };
      kit.screen(`price-${spec.id}`, price, () => {
        if (spec.cost) kit.costChip(price.x + cc * 3, fy + footH / 2, spec.cost, { have: { coins: p.coins, data: p.data }, size: kit.fs(13) });
        if (spec.power) {
          const px = price.x + cc * 3 + costW + L.gap;
          kit.icon('bolt', px + powSize * 0.6, fy + footH / 2, Math.round(powSize * 1.4), spec.power.color);
          kit.drawText(spec.power.text, px + Math.round(powSize * 1.4), fy + footH / 2, { size: powSize, color: spec.power.color });
        }
      }, { opaque: true });
      if (kit.button(spec.buyId, { x: r.x + r.w - btnW, y: fy, w: btnW, h: footH }, { label: spec.buyLabel, variant: 'primary', disabled: !spec.canBuy, size: bsize, icon: withIcon ? 'plus' : undefined, lamp: spec.canBuy ? kit.c.green : false })) spec.onBuy?.();
    }
  });
  return co;
}

// ---------- щиток эпохи (Памятник эпох) ----------

/** Приводит условия перехода от rules к виду [{ ok, text, have, need, kind }]. */
export function eraConditions(es) {
  if (!es) return [];
  if (Array.isArray(es.conditions)) return es.conditions;
  const out = [];
  for (const [kind, v] of Object.entries(es)) {
    if (v && typeof v === 'object' && 'ok' in v) out.push({ kind, ...v });
  }
  return out;
}

/**
 * Памятник эпох: колонка ламп по эпохам, условия перехода лампами с числами и кнопка «Новая эпоха».
 * Закрывается тапом по миру. Возвращает true, если нажали кнопку (эпоха сменилась).
 */
export function eraCallout(app, kit, spec) {
  const L = kit.L;
  const c = kit.c;
  const p = app.profile;
  const es = app.rules.getEraState(p);
  const conds = eraConditions(es);
  const padOf = (uu) => padOfL(L, uu);
  const calcH = (uu) => padOf(uu) * 2 + Math.round(36 * uu) + Math.round(38 * uu) + (es.final ? 0 : conds.length * Math.round(28 * uu)) + (es.final ? Math.round(32 * uu) : Math.max(MIN_ROW, Math.round(52 * uu))) + L.gap * 1.5;
  const { u, bounds } = fitScale(L, spec.bounds, calcH);
  const w = Math.min(Math.round(310 * L.ui), 420, L.area.w - L.gap * 2);
  const titleH = Math.round(36 * u);
  const lampsH = Math.round(38 * u);
  const condH = Math.round(28 * u);
  const footH = es.final ? Math.round(32 * u) : Math.max(MIN_ROW, Math.round(52 * u));
  const h = calcH(u);
  const co = kit.callout(spec.id || 'era', spec.anchor || { x: L.w / 2, y: L.h / 2 }, { w, h }, { target: spec.target, bounds, side: spec.side, variant: 'panel', pad: padOf(u) });
  const r = co.inner;
  let y = r.y;
  let advanced = false;
  kit.withLayer(61, () => {
    const cc = kit.cell();
    const fr = co.rect;
    const fy = r.y + r.h - footH;
    // экран эпохи: год, лампы эпох и условия перехода; кнопка «Новая эпоха» — на корпусе под ним
    const scrBottom = es.final ? fr.y + fr.h - cc * 2 : fy - Math.round(L.gap * 0.4);
    const scr = { x: fr.x + cc * 2, y: fr.y + cc * 2, w: fr.w - cc * 4, h: scrBottom - (fr.y + cc * 2) };
    kit.screen(`callout-${spec.id || 'era'}`, scr, () => {
      let y = r.y;
      kit.icon('era', r.x + Math.round(15 * u), y + titleH / 2, Math.round(30 * u), c.amber);
      kit.drawText(String(ERA_YEARS[p.era]), r.x + Math.round(36 * u), y + titleH / 2, { size: kit.fs(21), color: c.amberLight, shadow: true });
      const yw = kit.text.measure(String(ERA_YEARS[p.era]), kit.fs(21));
      kit.drawText(eraName(app, p.era), r.x + Math.round(46 * u) + yw, y + titleH / 2, { size: kit.fs(12), color: c.textDim, maxWidth: r.w - Math.round(46 * u) - yw });
      y += titleH;
      // лампы эпох
      const step = r.w / 6;
      for (let i = 0; i < 6; i++) {
        const cx = r.x + step * (i + 0.5);
        const done = i < p.era;
        const now = i === p.era;
        kit.lamp(cx, y + Math.round(10 * u), Math.round(17 * u), done ? c.green : now ? c.amber : c.navy2, done || now, now);
        kit.drawText(String(ERA_YEARS[i]), cx, y + Math.round(30 * u), { size: Math.max(7, kit.fs(8)), color: now ? c.amberLight : done ? c.text : c.textMute, align: 'center' });
      }
      y += lampsH;
      if (!es.final) {
        for (const cd of conds) {
          const mid = y + condH / 2;
          kit.lamp(r.x + Math.round(8 * u), mid, Math.round(13 * u), cd.ok ? c.green : c.red, true);
          const iconName = cd.kind === 'coins' ? 'coin' : cd.kind === 'data' ? 'data' : cd.kind === 'buildings' ? 'building' : 'target';
          kit.icon(iconName, r.x + Math.round(30 * u), mid, Math.round(20 * u), cd.ok ? c.text : c.textDim);
          const tx = r.x + Math.round(46 * u);
          let str;
          if (cd.kind === 'coins' || cd.kind === 'data') str = `${fmtCompact(cd.have)} / ${fmtCompact(cd.need)}`;
          else if (cd.kind === 'buildings') str = t('era.cond.buildings', { have: cd.have, need: cd.need, level: cd.level });
          else str = cd.text || cd.kind;
          kit.drawText(str, tx, mid, { size: kit.fs(12), color: cd.ok ? c.text : c.textDim, maxWidth: r.x + r.w - tx });
          y += condH;
        }
      }
      if (es.final) {
        kit.lamp(r.x + Math.round(10 * u), fy + footH / 2, Math.round(15 * u), c.green, true);
        kit.drawText(t('card.maxed'), r.x + Math.round(26 * u), fy + footH / 2, { size: kit.fs(14), color: c.green });
      }
    }, { opaque: true });
    if (!es.final && kit.button('era-advance', { x: r.x, y: fy, w: r.w, h: footH }, { label: t('era.advance'), variant: 'primary', disabled: !es.ok, icon: 'era', size: kit.fs(15), lamp: es.ok ? c.green : false })) {
      const res = app.advanceEra();
      if (res.ok) {
        advanced = true;
        kit.toast(t('era.done', { year: ERA_YEARS[res.profile.era] }), { kind: 'good', icon: 'era' });
      }
    }
  });
  return advanced;
}

// ---------- аналоговый индикатор энергии ----------

/** Табличка со стрелочным индикатором баланса мощности: красная зона — энергии не хватает. */
export function drawEnergyPlate(app, kit, r) {
  const c = kit.c;
  const cc = kit.cell();
  const pb = app.rules.powerBalance(app.profile);
  const low = pb.ratio < 1;
  kit.nine('raised', r.x, r.y, r.w, r.h);
  kit.hit('base-energy', r, {});
  const dial = { x: r.x + cc * 3, y: r.y + cc * 3, w: Math.round(r.w * 0.58), h: r.h - cc * 6 };
  kit.dial(dial, clamp(pb.ratio, 0, 1), { zones: [{ to: 0.55, color: c.red }, { to: 0.8, color: c.amber }, { to: 1, color: c.green }] });
  const tx = dial.x + dial.w + cc * 2;
  kit.icon('bolt', tx + (r.x + r.w - tx - cc * 2) / 2, r.y + r.h * 0.32, Math.round(r.h * 0.36), low ? c.red : c.green);
  kit.drawText(`${Math.round(pb.demand)}/${Math.round(pb.supply)}`, tx + (r.x + r.w - tx - cc * 2) / 2, r.y + r.h * 0.74, { size: Math.max(8, kit.fs(9)), color: low ? c.red : c.textDim, align: 'center', maxWidth: r.x + r.w - tx - cc * 2 });
  kit.lamp(r.x + r.w - cc * 5, r.y + cc * 5, cc * 4, low ? c.red : c.green, true, low);
}

export const coinsText = (n) => fmtInt(n);
