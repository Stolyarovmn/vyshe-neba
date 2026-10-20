// Общие части экранов: шапка с ресурсами, фон-чертёж, карточки построек, индикаторы уровней, подсказка «что дальше».

import { t } from '../../i18n/index.js';
import { fmtInt } from '../format.js';
import { right } from '../layout.js';

export const BUILDING_KEYS = ['beacons', 'gantry', 'deluge', 'service', 'rescue', 'fuel', 'logistics', 'factory', 'weather', 'control', 'radar', 'energy', 'observation', 'recovery'];
export const PART_KEYS = ['engine', 'tank', 'hull', 'booster', 'capsule', 'legs', 'fins', 'parachute', 'avionics'];

export const BUILDING_ICON = {
  beacons: 'target', gantry: 'building', deluge: 'fuel', service: 'repair', rescue: 'shield', fuel: 'canister', logistics: 'cart',
  factory: 'gear', weather: 'wind', control: 'avionics', radar: 'radar', energy: 'bolt', observation: 'eye', recovery: 'chute',
};

export const buildingIcon = (key) => BUILDING_ICON[key] || 'building';
export const partIcon = (id) => id;

export const STAT_BETTER_DOWN = new Set(['burnRate', 'consumption', 'drag', 'mass', 'cost', 'fuelBurn']);

export const statLabel = (key) => {
  const k = `stat.${key}`;
  const s = t(k);
  return s === k ? key : s;
};

/** Название эпохи: «1978». */
export const ERA_YEARS = [1978, 1986, 1998, 2015, 2035, 2060];

// Названия и описания берутся из data/ (там же единицы измерения); i18n — запасной вариант.
const fromKey = (key, fallback) => {
  const s = t(key);
  return s === key ? fallback : s;
};
export const partName = (app, id) => app.data.PARTS?.[id]?.name || fromKey(`part.${id}.name`, id);
export const partShort = (app, id) => fromKey(`part.short.${id}`, partName(app, id));
export const partDesc = (app, id) => app.data.PARTS?.[id]?.desc || fromKey(`part.${id}.desc`, '');
export const buildingName = (app, key) => app.data.BUILDINGS?.[key]?.name || fromKey(`building.${key}.name`, key);
export const buildingDesc = (app, key) => app.data.BUILDINGS?.[key]?.desc || fromKey(`building.${key}.desc`, '');
export const eraName = (app, id) => app.data.ERAS?.[id]?.name || fromKey(`era.${id}.name`, '');
export const eraDesc = (app, id) => app.data.ERAS?.[id]?.desc || fromKey(`era.${id}.desc`, '');

/** Форматирование показателя по описанию { unit, digits }: доли — в процентах, «×» — множитель. */
export function fmtInfo(info, v) {
  if (typeof v !== 'number' || !Number.isFinite(v)) return '—';
  if (info.unit === '%') return `${Math.round(v * 100)}%`;
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
    const unitLabel = info.unit && info.unit !== '%' && info.unit !== '×' ? `${info.label}, ${info.unit}` : info.label;
    rows.push({ key: info.key, label: unitLabel, before: a, after: b, better: info.dir < 0 ? 'down' : 'up', fmt: (v) => fmtInfo(info, v), changed: a !== b });
  }
  return rows;
}

// ---------- фон-чертёж ----------

let bpCache = null;

export function drawBlueprint(ctx, L, time, era = 0) {
  const key = `${L.w}x${L.h}@${L.dpr}`;
  if (!bpCache || bpCache.key !== key) {
    const c = document.createElement('canvas');
    c.width = Math.ceil(L.w * L.dpr);
    c.height = Math.ceil(L.h * L.dpr);
    const g = c.getContext('2d');
    g.scale(L.dpr, L.dpr);
    const grad = g.createLinearGradient(0, 0, 0, L.h);
    grad.addColorStop(0, '#0c1630');
    grad.addColorStop(0.6, '#0a1226');
    grad.addColorStop(1, '#070c1a');
    g.fillStyle = grad;
    g.fillRect(0, 0, L.w, L.h);
    const step = Math.round(24 * L.ui);
    g.strokeStyle = 'rgba(82,216,255,0.07)';
    g.lineWidth = 1;
    g.beginPath();
    for (let x = 0; x < L.w; x += step) {
      g.moveTo(x + 0.5, 0);
      g.lineTo(x + 0.5, L.h);
    }
    for (let y = 0; y < L.h; y += step) {
      g.moveTo(0, y + 0.5);
      g.lineTo(L.w, y + 0.5);
    }
    g.stroke();
    g.strokeStyle = 'rgba(82,216,255,0.13)';
    g.beginPath();
    for (let x = 0; x < L.w; x += step * 4) {
      g.moveTo(x + 0.5, 0);
      g.lineTo(x + 0.5, L.h);
    }
    for (let y = 0; y < L.h; y += step * 4) {
      g.moveTo(0, y + 0.5);
      g.lineTo(L.w, y + 0.5);
    }
    g.stroke();
    // звёздная пыль
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    g.fillStyle = 'rgba(255,255,255,0.35)';
    for (let i = 0; i < 70; i++) g.fillRect(Math.floor(rnd() * L.w), Math.floor(rnd() * L.h), 2, 2);
    bpCache = { key, canvas: c };
  }
  ctx.drawImage(bpCache.canvas, 0, 0, L.w, L.h);
  // медленная «развёртка»
  const y = ((time * 40) % (L.h + 80)) - 40;
  const g2 = ctx.createLinearGradient(0, y - 30, 0, y + 30);
  g2.addColorStop(0, 'rgba(82,216,255,0)');
  g2.addColorStop(0.5, 'rgba(82,216,255,0.05)');
  g2.addColorStop(1, 'rgba(82,216,255,0)');
  ctx.fillStyle = g2;
  ctx.fillRect(0, y - 30, L.w, 60);
}

// ---------- шапка ----------

/**
 * Шапка: слева «назад» (или эпоха в хабе), справа монеты и данные.
 * o: title, back (bool), era (bool — показать чип эпохи вместо «назад»)
 */
export function drawHeader(app, kit, hdr, o = {}) {
  const L = kit.L;
  const c = kit.c;
  const p = app.profile;
  const h = hdr.h;
  let x = hdr.x;
  const chipH = Math.min(h, Math.round(40 * L.ui));
  const chipY = hdr.y + (h - chipH) / 2;
  if (o.back) {
    if (kit.iconButton('back', { x, y: hdr.y, w: h, h }, { icon: 'back', label: t('common.back'), variant: 'btn' })) app.back();
    x += h + L.gap;
  } else if (o.era) {
    const w = Math.round(104 * L.ui);
    if (kit.button('era-chip', { x, y: hdr.y, w, h }, { icon: 'era', label: String(ERA_YEARS[p.era] ?? ''), variant: 'btn', size: kit.fs(16), sub: t('hub.era') })) app.go('base', { tab: 'era' }, { push: true });
    x += w + L.gap;
  }
  const dataW = Math.round(88 * L.ui);
  const coinW = Math.round(104 * L.ui);
  let rx = right(hdr);
  kit.resourceChip(rx - dataW, chipY, dataW, chipH, 'data', p.data, kit.c.cyan);
  rx -= dataW + L.gap;
  kit.resourceChip(rx - coinW, chipY, coinW, chipH, 'coin', p.coins, kit.c.gold);
  rx -= coinW + L.gap;
  if (o.title) {
    const avail = rx - x;
    if (avail > 60) kit.drawText(o.title, x + L.gap, hdr.y + h / 2, { size: kit.fs(18), color: c.text, maxWidth: avail - L.gap, shadow: 'rgba(0,0,0,0.6)' });
  }
}

// ---------- индикаторы ----------

/** Ряд ячеек уровня: заполнено — куплено, пунктир — доступно по эпохе, тёмное — закрыто эпохой. */
export function levelPips(kit, r, level, max, cap) {
  const c = kit.c;
  const gap = Math.max(1, Math.round(kit.L.px / 2));
  const w = (r.w - gap * (max - 1)) / max;
  for (let i = 0; i < max; i++) {
    const x = Math.round(r.x + i * (w + gap));
    const ww = Math.max(2, Math.round(w));
    const filled = i < level;
    const reachable = cap === undefined || i < cap;
    kit.rect(x, r.y, ww, r.h, c.edge);
    kit.rect(x + 1, r.y + 1, ww - 2, r.h - 2, filled ? c.amber : reachable ? '#2b3b5e' : '#121a2c');
    if (filled) kit.rect(x + 1, r.y + 1, ww - 2, Math.max(1, Math.round(r.h * 0.3)), '#ffe9a8');
  }
}

/** Строка причин блокировки. Возвращает высоту. */
export function drawReasons(app, kit, x, y, w, reasons, o = {}) {
  const c = kit.c;
  const L = kit.L;
  const size = kit.fs(13);
  let cy = y;
  for (const r of reasons) {
    const txt = app.reasonText(r);
    if (!txt) continue;
    const isBuilding = r.kind === 'building' && r.building;
    const rowH = isBuilding && o.goto ? L.touch(48) : Math.max(size * 1.4, 0);
    const iconName = r.kind === 'coins' ? 'coin' : r.kind === 'data' ? 'data' : r.kind === 'era' ? 'era' : isBuilding ? 'building' : 'lock';
    const color = r.kind === 'coins' ? c.gold : r.kind === 'data' ? c.cyan : c.red;
    kit.icon(iconName, x + size * 0.7, cy + rowH / 2, size * 1.2, color);
    const btnW = isBuilding && o.goto ? Math.round(112 * L.ui) : 0;
    const textW = w - size * 1.8 - btnW - (btnW ? L.gap : 0);
    const used = kit.text.blockHeight(txt, textW, size, 1.2);
    kit.paragraph(txt, x + size * 1.6, cy + (rowH - used) / 2, textW, { size, color: c.text, lineHeight: 1.2, maxLines: 3 });
    if (isBuilding && o.goto) {
      const b = { x: x + w - btnW, y: cy + (rowH - L.touch(44)) / 2, w: btnW, h: L.touch(44) };
      if (kit.button(`goto-${r.building}`, b, { label: t('rocket.goto'), variant: 'btn', size: kit.fs(12), icon: 'arrow' })) o.goto(r.building);
    }
    cy += Math.max(rowH, used) + L.gap * 0.5;
  }
  return cy - y;
}

export const isFundsReason = (r) => r.kind === 'coins' || r.kind === 'data';

// ---------- карточка постройки ----------

/**
 * Карточка постройки (хаб и экран базы). Возвращает true, если нажали «закрыть».
 * Содержимое прокручивается, если не помещается.
 */
export function drawBuildingCard(app, kit, r, key, o = {}) {
  const L = kit.L;
  const c = kit.c;
  const p = app.profile;
  const st = app.rules.getBuildingState(p, key);
  const pb = app.rules.powerBalance ? app.rules.powerBalance(p) : null;
  const inner = kit.panel(r, { title: buildingName(app, key), titleIcon: buildingIcon(key), variant: 'panel' });
  let closed = false;
  if (o.close) {
    const bs = L.touch(40);
    if (kit.iconButton('card-close', { x: right(r) - bs - L.px * 2, y: r.y + L.px * 2, w: bs, h: bs }, { icon: 'close', label: t('common.close'), variant: 'btn' })) closed = true;
  }
  const footerH = L.touch(56) + L.gap;
  const bodyRect = { x: inner.x, y: inner.y, w: inner.w, h: inner.h - footerH };
  const funds = st.locked.filter(isFundsReason);
  const blocking = st.locked.filter((x) => !isFundsReason(x));
  const nextLevel = st.level + 1;
  const size = kit.fs(13);

  kit.scrollArea(`card-scroll-${key}`, bodyRect, undefined, (top) => {
    let y = top;
    kit.drawText(t('card.level', { n: st.level, max: st.max }), bodyRect.x, y + size * 0.7, { size: kit.fs(14), color: c.amber });
    y += size * 1.6;
    levelPips(kit, { x: bodyRect.x, y, w: bodyRect.w - L.px * 3, h: Math.round(L.ui * 8) }, st.level, st.max, st.cap);
    y += Math.round(L.ui * 8) + L.gap;
    y += kit.paragraph(buildingDesc(app, key), bodyRect.x, y, bodyRect.w - L.px * 3, { size, color: c.textDim, lineHeight: 1.25 }) + L.gap;
    const infos = app.data.BUILDINGS?.[key]?.effectInfo || [];
    const effRows = st.next ? deltaRows(infos, st.effects, st.next.effects) : [];
    if (effRows.length) {
      kit.drawText(t('card.effects'), bodyRect.x, y + size * 0.6, { size: kit.fs(12), color: c.textMute });
      y += size * 1.4;
      const rowH = Math.round(40 * L.ui);
      for (const row of effRows) {
        kit.statDelta({ x: bodyRect.x, y, w: bodyRect.w - L.px * 3, h: rowH }, row);
        y += rowH + L.gap * 0.5;
      }
    }
    if (st.next && st.next.power) {
      kit.icon('bolt', bodyRect.x + size * 0.7, y + size * 0.7, size * 1.2, c.green);
      kit.drawText(st.next.power.supply ? t('card.powerSupply', { supply: st.next.power.supply }) : t('card.power', { n: st.next.power.use }), bodyRect.x + size * 1.7, y + size * 0.7, { size, color: c.green, maxWidth: bodyRect.w - size * 2 });
      y += size * 1.8;
    }
    if (pb && pb.ratio < 1 && st.level > 0) {
      y += kit.paragraph(t('card.lowPower', { pct: Math.round((1 - pb.ratio) * 100) }), bodyRect.x, y, bodyRect.w - L.px * 3, { size, color: c.red }) + L.gap;
    }
    if (st.next) {
      if (blocking.length) y += drawReasons(app, kit, bodyRect.x, y, bodyRect.w - L.px * 3, blocking, { goto: o.goto });
    } else {
      kit.drawText(t('card.maxed'), bodyRect.x, y + size * 0.7, { size: kit.fs(14), color: c.green });
      y += size * 1.8;
    }
    return y - top + L.gap;
  });

  // подвал: цена и кнопка
  const fy = inner.y + inner.h - footerH + L.gap;
  const have = { coins: p.coins, data: p.data };
  const btnW = Math.round(inner.w * 0.5);
  if (st.next) {
    kit.costChip(inner.x, fy + L.touch(56) / 2, { coins: st.next.cost, data: st.next.data }, { have });
    const label = st.level === 0 ? t('card.build') : t('card.upgrade');
    const canBuy = st.locked.length === 0;
    const sub = !canBuy ? app.reasonText(st.locked.find((x) => !isFundsReason(x)) || st.locked[0]) : undefined;
    if (kit.button(`build-${key}`, { x: inner.x + inner.w - btnW, y: fy, w: btnW, h: L.touch(56) }, { label, variant: 'primary', disabled: !canBuy, sub: funds.length && !blocking.length ? t('card.needFunds') : sub && blocking.length ? t('card.locked') : undefined, size: kit.fs(16), icon: 'plus' })) {
      const res = app.buyBuilding(key);
      if (!res.ok) kit.toast(t('card.cannot'), { kind: 'bad' });
      else kit.toast(t('card.built', { name: buildingName(app, key) }), { kind: 'good', icon: buildingIcon(key) });
    }
  }
  return closed;
}

// ---------- что дальше ----------

/** Одна рекомендация для хаба: { text, icon, action }. */
export function suggestNext(app) {
  const p = app.profile;
  if (p.stats.flights === 0) return { text: t('hub.goal.first'), icon: 'launch', action: () => app.go('launch', {}, { push: true }) };
  for (const id of PART_KEYS) {
    const st = app.rules.getPartState(p, id);
    if (st.next && !st.locked.length) return { text: t('hub.goal.part', { name: partName(app, id) }), icon: partIcon(id), action: () => app.go('rocket', { select: id }, { push: true }) };
  }
  for (const key of BUILDING_KEYS) {
    const st = app.rules.getBuildingState(p, key);
    if (st.next && !st.locked.length) return { text: t('hub.goal.building', { name: buildingName(app, key) }), icon: buildingIcon(key), action: () => app.go('base', { select: key }, { push: true }) };
  }
  const era = app.rules.getEraState(p);
  if (era.ok) return { text: t('hub.goal.era'), icon: 'era', action: () => app.go('base', { tab: 'era' }, { push: true }) };
  return { text: t('hub.goal.fly'), icon: 'launch', action: () => app.go('launch', {}, { push: true }) };
}

export const coinsText = (n) => fmtInt(n);
