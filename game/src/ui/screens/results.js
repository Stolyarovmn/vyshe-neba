// Итоги полёта: бланк-отчёт на бумаге со штампом «ПОСАДКА» / «АВАРИЯ», сегментные счётчики с анимацией, монеты летят в табличку,
// значки наград. Без таблиц «название — значение»: числа и полоски. В ландшафте две колонки.

import { t } from '../../i18n/index.js';
import { resultsLayout } from '../layout.js';
import { clamp, easeOutCubic, fmtAlt, fmtClock, fmtCompact, fmtInt, fmtSpeed } from '../format.js';
import * as inst from '../skin/instruments.js';
import { drawChrome, partShort, buildingShort, partIcon, buildingIcon } from './common.js';

const FLY_COINS = 7;
/** Масштаб размеров бланка: на больших окнах строки компактнее, чтобы отчёт помещался целиком. */
const U = (L) => L.ui * (L.ui > 1.3 ? 0.78 : 1);

function state(app) {
  return ((app.ui ||= {}).results ||= { t0: 0, ticked: 0, fly: null, landed: 0 });
}

export default {
  id: 'results',
  background: 'hubdim',
  enter(app) {
    const st = state(app);
    st.t0 = app.time;
    st.ticked = 0;
    st.fly = null;
    st.arrived = 0;
    st.stamped = false;
  },
  onBack() {
    return true;
  },
  draw(app, kit, L, dt) {
    const st = state(app);
    const res = app.results;
    if (!res) {
      app.go('hub');
      return;
    }
    const c = kit.c;
    const { result } = res;
    const G = resultsLayout(L);
    const outcome = result.outcome;
    const landed = outcome === 'landed';
    const crashed = outcome === 'crashed';
    const elapsed = app.time - st.t0;
    const cc = kit.cell();

    // таблички: число монет догоняет итог по мере прилёта монет
    const coinsDelta = (res.after.coins || 0) - (res.before.coins || 0);
    const dataDelta = (res.after.data || 0) - (res.before.data || 0);
    const fk = st.fly ? clamp(st.arrived / FLY_COINS, 0, 1) : elapsed > 2.4 ? 1 : 0;
    const chrome = drawChrome(app, kit, { back: false, coins: Math.round(res.before.coins + coinsDelta * fk), data: Math.round(res.before.data + dataDelta * fk) });
    void chrome;

    // бланк: слегка «падает» сверху
    const drop = Math.round(clamp(1 - elapsed / 0.3, 0, 1) * 4) * cc * 4;
    const card = { x: G.card.x, y: G.card.y - drop, w: G.card.w, h: G.card.h };
    kit.rect(card.x + cc * 3, card.y + cc * 3, card.w, card.h, c.ink);
    kit.nine('paper', card.x, card.y, card.w, card.h);
    kit.hit('results-card', card, {});
    // скрепка
    kit.rect(card.x + card.w / 2 - cc * 6, card.y - cc * 2, cc * 12, cc * 6, c.steel2);
    kit.rect(card.x + card.w / 2 - cc * 4, card.y - cc, cc * 8, cc * 4, c.steel0);

    // шапка: куда летели и штамп
    const compact = !L.portrait && L.h < 460;
    const hdrH = Math.round((compact ? 44 : 56) * U(L));
    const bodyId = res.report.body || result.body || res.destination;
    const bodyName = t(`dest.${res.destination}`) !== `dest.${res.destination}` ? t(`dest.${res.destination}`) : app.data.DESTINATIONS?.[res.destination]?.name || app.data.BODIES?.[bodyId]?.name;
    const hx = card.x + L.pad;
    const hy = card.y + L.pad + hdrH / 2;
    kit.icon(bodyId === 'moon' || bodyId === 'mars' ? bodyId : 'earth', hx + Math.round(18 * U(L)), hy, Math.round(36 * U(L)), c.text);
    if (bodyName) kit.drawText(bodyName, hx + Math.round(42 * U(L)), hy, { size: kit.fs(16), color: c.ink, maxWidth: card.w * 0.34 });
    const stampLabel = landed ? (result.perfect ? t('results.perfect') : t('results.landed')) : crashed ? t('results.crashed') : t('results.abandoned');
    const stampColor = landed ? c.greenDark : crashed ? c.redDark : c.steel0;
    if (elapsed > 0.5) {
      const k = clamp((elapsed - 0.5) / 0.18, 0, 1);
      if (!st.stamped) {
        st.stamped = true;
        app.sfx(landed ? 'coin' : 'hit');
        if (!landed) app.shake?.(1);
      }
      const size = kit.fs(L.portrait ? 18 : 22);
      const off = Math.round((1 - k) * 4) * cc * 2;
      kit.S.ctx.globalAlpha = k;
      kit.stamp(stampLabel, card.x + card.w - L.pad - kit.text.measure(stampLabel, size) / 2 - cc * 6, hy + off, stampColor, size);
      kit.S.ctx.globalAlpha = 1;
    }

    const bodyTop = card.y + L.pad + hdrH + L.gap;
    const body = { x: G.content.x, y: bodyTop, w: G.content.w, h: G.content.y + G.content.h - bodyTop - drop * 0 };
    const wide = !L.portrait && body.w > 520 * U(L);
    kit.scrollArea('results-scroll', { x: body.x, y: body.y - drop, w: body.w, h: body.h }, undefined, (top) => {
      const w = body.w - cc * 4;
      const colW = wide ? Math.floor((w - L.gap * 2) / 2) : w;
      const left = { x: body.x, w: colW };
      const right = wide ? { x: body.x + colW + L.gap * 2, w: colW } : left;
      const y1 = drawFlightColumn(app, kit, L, left, top, res, elapsed);
      const y2 = drawRewardsColumn(app, kit, L, right, wide ? top : y1, res, st, elapsed, dt);
      return Math.max(y1, y2) - top + L.gap;
    });

    drawFlyingCoins(app, kit, st, dt);

    const half = (G.buttons.w - L.gap) / 2;
    const by = G.buttons.y - drop;
    if (kit.button('results-again', { x: G.buttons.x, y: by, w: half, h: G.buttons.h }, { label: t('results.again'), icon: 'launch', variant: 'primary', size: kit.fs(16) })) again(app, res);
    if (kit.button('results-base', { x: G.buttons.x + half + L.gap, y: by, w: half, h: G.buttons.h }, { label: t('results.base'), icon: 'base', variant: 'btn', size: kit.fs(16) })) {
      app.results = null;
      app.history.length = 0;
      app.go('hub');
    }
  },
};

function again(app, res) {
  const inv = app.profile.inventory;
  const consumables = Object.fromEntries(Object.entries(res.consumables || {}).map(([k, v]) => [k, !!v && (inv[k] || 0) > 0]));
  const open = app.rules.availableDestinations(app.profile).find((d) => d.id === res.destination && d.ok);
  app.results = null;
  app.history.length = 0;
  if (open) app.startLaunch({ destination: res.destination, consumables });
  else app.go('launch');
}

// ---------- левая колонка: полёт ----------

/** Причина аварии, допуски полосками, три сегментных табло. Возвращает нижнюю границу. */
function drawFlightColumn(app, kit, L, col, top, res, elapsed) {
  const c = kit.c;
  const cc = kit.cell();
  const { result, report } = res;
  const landed = result.outcome === 'landed';
  const crashed = result.outcome === 'crashed';
  const { x, w } = col;
  let y = top;
  const compact = !L.portrait && L.h < 460;
  if (crashed && report.hint) {
    y += kit.paragraph(report.hint.text, x, y, w, { size: kit.fs(12), color: c.ink, lineHeight: 1.25 }) + L.gap * 0.5;
  }
  const lg = result.landing;
  if ((crashed || landed) && lg && lg.vTol) y += drawTolerances(kit, L, x, y, w, lg) + L.gap * 0.5;
  if (crashed && report.hint) {
    const chips = [];
    if (report.hint.part && report.hint.part !== 'parachute') chips.push({ id: 'results-goto-part', label: partShort(app, report.hint.part), icon: partIcon(report.hint.part), go: () => app.go('rocket', { select: report.hint.part }, { push: true }) });
    // парашют теперь расходник: после аварии без него подсказываем лавку
    if (report.hint.part === 'parachute' || !res.consumables?.chute) chips.push({ id: 'results-goto-shop', label: t('dock.shop'), icon: 'chute', go: () => app.go('shop', {}, { push: true }) });
    if (report.hint.building) chips.push({ id: 'results-goto-building', label: buildingShort(app, report.hint.building), icon: buildingIcon(report.hint.building, 1), go: () => app.go('base', { select: report.hint.building }, { push: true }) });
    if (chips.length) {
      const bw = (w - L.gap * (chips.length - 1)) / chips.length;
      chips.forEach((ch, i) => {
        if (kit.button(ch.id, { x: x + i * (bw + L.gap), y, w: bw, h: L.touch(compact ? 44 : 46) }, { label: ch.label, icon: ch.icon, variant: 'btn', size: kit.fs(12), lamp: c.amberLight })) ch.go();
      });
      y += L.touch(compact ? 44 : 46) + L.gap * (compact ? 0.5 : 1);
    }
  }

  // табло: высота, путь, время — сегментные цифры, набираются по мере появления
  const alt = fmtAlt(result.maxAlt);
  const dist = fmtAlt(result.distance);
  const boards = [
    ['altitude', alt.value.replace(' ', ''), t(alt.unit === 'km' ? 'unit.km' : 'unit.m')],
    ['target', dist.value.replace(' ', ''), t(dist.unit === 'km' ? 'unit.km' : 'unit.m')],
    ['era', fmtClock(result.time), ''],
  ];
  const sh = Math.round((compact ? 36 : 44) * U(L));
  const stack = w < 420 * U(L) && L.portrait;
  boards.forEach(([icon, val, unit], i) => {
    const k = easeOutCubic(clamp((elapsed - 0.35 - i * 0.18) / 0.5, 0, 1));
    const r = stack ? { x, y: y + i * (sh + L.gap * 0.6), w, h: sh } : { x: x + i * ((w - L.gap * 2) / 3 + L.gap), y, w: (w - L.gap * 2) / 3, h: sh };
    const shown = i === 2 ? fmtClock(result.time * k) : countStr(val, k);
    // справа остаётся место под единицу измерения, чтобы она не налезала на цифры
    const unitW = unit ? kit.text.measure(unit, Math.max(8, kit.fs(9))) + cc * 5 : 0;
    inst.readout(kit, { x: r.x + sh * 0.9, y: r.y, w: r.w - sh * 0.9 - unitW, h: r.h }, shown, { lit: c.green, digits: Math.max(3, val.length), h: Math.round(sh * 0.5) });
    kit.nine('raised', r.x, r.y, sh * 0.9, r.h);
    kit.icon(icon, r.x + sh * 0.45, r.y + r.h / 2, Math.round(sh * 0.5), c.cyan);
    if (unit) kit.drawText(unit, r.x + r.w - cc * 3, r.y + r.h - cc * 4, { size: Math.max(8, kit.fs(9)), color: c.steel2, align: 'right' });
  });
  y += stack ? 3 * (sh + L.gap * 0.6) : sh + L.gap;
  return y;
}

/** Строка числа с запятой, масштабированная по k (набор значения). */
function countStr(val, k) {
  if (k >= 1) return val;
  const n = Number(String(val).replace(',', '.'));
  if (!Number.isFinite(n)) return val;
  const frac = String(val).includes(',') ? 1 : 0;
  return (n * k).toFixed(frac).replace('.', ',');
}

/** Три полоски «факт / допуск» для посадки: скорость, снос, наклон. Красная часть — выход за допуск. */
function drawTolerances(kit, L, x, y, w, lg) {
  const c = kit.c;
  const cc = kit.cell();
  const deg = (r) => `${Math.round((r * 180) / Math.PI)}°`;
  const rows = [
    ['down', lg.v, lg.vTol, fmtSpeed(lg.v)],
    ['wind', lg.h, lg.hTol, fmtSpeed(lg.h)],
    ['target', lg.ang, lg.angTol, deg(lg.ang)],
  ];
  const rowH = Math.round((!L.portrait && L.h < 460 ? 20 : 24) * U(L));
  rows.forEach(([icon, v, tol, vs], i) => {
    const yy = y + i * rowH;
    const bad = v > tol;
    kit.icon(icon, x + rowH * 0.45, yy + rowH / 2, Math.round(rowH * 0.7), bad ? c.redDark : c.ink);
    const bar = { x: x + rowH, y: yy + cc * 2, w: w - rowH - Math.round(66 * U(L)), h: rowH - cc * 4 };
    kit.ledBar(bar, { value: clamp(v / (tol * 2), 0, 1), color: bad ? c.red : c.green, ghost: 0.5, segments: 12 });
    kit.drawText(vs, x + w, yy + rowH / 2, { size: kit.fs(12), color: bad ? c.redDark : c.ink, align: 'right', maxWidth: 60 * U(L) });
  });
  return rows.length * rowH;
}

// ---------- правая колонка: награды ----------

const CHIP_ICON = { 'results.c.travel': 'altitude', 'results.c.loot': 'coin', 'results.c.landing': 'check', 'results.c.perfect': 'star', 'results.c.expedition': 'target', 'results.c.storm': 'wind' };

function drawRewardsColumn(app, kit, L, col, top, res, st, elapsed, dt) {
  const c = kit.c;
  const cc = kit.cell();
  const { report } = res;
  const { x, w } = col;
  let y = top;
  const coin = report.coins || {};
  const coinsDelta = (res.after.coins || 0) - (res.before.coins || 0);
  const dataDelta = (res.after.data || 0) - (res.before.data || 0);

  // значки наград: иконка и число по очереди
  const lines = Object.keys(CHIP_ICON).map((k) => [k, coin[k.replace('results.c.', '')]]).filter(([, v]) => v);
  const chipH = Math.round(30 * U(L));
  const cols = Math.max(1, Math.min(lines.length || 1, Math.floor(w / Math.round(86 * U(L)))));
  const cw = (w - L.gap * (cols - 1)) / cols;
  lines.forEach(([key, value], i) => {
    const k = easeOutCubic(clamp((elapsed - 0.6 - i * 0.22) / 0.4, 0, 1));
    if (k > 0 && i >= st.ticked) {
      st.ticked = i + 1;
      app.sfx('coin');
    }
    const r = { x: x + (i % cols) * (cw + L.gap), y: y + Math.floor(i / cols) * (chipH + L.gap * 0.6), w: cw, h: chipH };
    if (k <= 0) return;
    kit.S.ctx.globalAlpha = k;
    kit.nine('screen', r.x, r.y, r.w, r.h);
    kit.icon(CHIP_ICON[key], r.x + chipH * 0.55, r.y + r.h / 2, Math.round(chipH * 0.62), c.amberLight);
    kit.drawText(`+${fmtCompact(value * k)}`, r.x + r.w - cc * 3, r.y + r.h / 2, { size: kit.fs(12), color: c.gold, align: 'right', maxWidth: r.w - chipH });
    kit.S.ctx.globalAlpha = 1;
  });
  y += Math.ceil(Math.max(lines.length, 1) / cols) * (chipH + L.gap * 0.6) + L.gap * 0.4;
  if (coin.charged) {
    kit.icon('warn', x + cc * 6, y + chipH / 2, Math.round(chipH * 0.6), c.redDark);
    kit.drawText(`−${fmtCompact(coin.charged)}`, x + cc * 12 + chipH * 0.5, y + chipH / 2, { size: kit.fs(13), color: c.redDark });
    y += chipH + L.gap * 0.4;
  }

  // итоговые счётчики: монеты и данные сегментными цифрами
  const totalK = easeOutCubic(clamp((elapsed - 0.8 - lines.length * 0.22) / 0.9, 0, 1));
  const th = Math.round(52 * U(L));
  const half = (w - L.gap) / 2;
  const rc = { x, y, w: half, h: th };
  const rd = { x: x + half + L.gap, y, w: half, h: th };
  const showC = Math.abs(coinsDelta) * totalK;
  const showD = dataDelta * totalK;
  kit.nine('raised', rc.x, rc.y, rc.w, rc.h);
  kit.icon('coin', rc.x + th * 0.5, rc.y + th / 2, Math.round(th * 0.6), c.gold);
  inst.bigDigits(kit, `${coinsDelta < 0 ? '-' : ''}${Math.round(showC)}`, rc.x + rc.w - cc * 4, rc.y + (th - Math.round(th * 0.5)) / 2, Math.round(th * 0.5), coinsDelta >= 0 ? c.gold : c.red, 'right');
  kit.nine('raised', rd.x, rd.y, rd.w, rd.h);
  kit.icon('data', rd.x + th * 0.5, rd.y + th / 2, Math.round(th * 0.6), c.cyan);
  inst.bigDigits(kit, String(Math.round(showD)), rd.x + rd.w - cc * 4, rd.y + (th - Math.round(th * 0.5)) / 2, Math.round(th * 0.5), c.cyan, 'right');
  y += th + L.gap;

  // монеты летят в табличку, когда набрались
  if (!st.fly && totalK >= 1 && coinsDelta > 0 && app.plateRects?.coins) {
    st.fly = Array.from({ length: FLY_COINS }, (_, i) => ({ t: -i * 0.09, x0: rc.x + rc.w * 0.5, y0: rc.y + rc.h * 0.5 }));
    st.arrived = 0;
  }

  // что нового: значки с короткой подписью
  const news = collectNews(app, res);
  const rowH = Math.round(26 * U(L));
  news.slice(0, 5).forEach((n, i) => {
    const k = easeOutCubic(clamp((elapsed - 1.4 - i * 0.2) / 0.35, 0, 1));
    if (k <= 0) return;
    kit.S.ctx.globalAlpha = k;
    kit.icon(n.icon, x + rowH * 0.5, y + rowH / 2, Math.round(rowH * 0.8), n.color || c.amberDeep);
    kit.drawText(n.text, x + rowH * 1.1, y + rowH / 2, { size: kit.fs(12), color: c.ink, maxWidth: w - rowH * 1.1 - (n.reward ? Math.round(56 * U(L)) : 0) });
    if (n.reward) kit.costChip(x + w, y + rowH / 2, { coins: n.reward }, { align: 'right', size: kit.fs(11) });
    kit.S.ctx.globalAlpha = 1;
    y += rowH;
  });
  void dt;
  return y;
}

/** Летящие монеты: от счётчика к табличке монет; по прилёту табличка набирает число. */
function drawFlyingCoins(app, kit, st, dt) {
  if (!st.fly || !app.plateRects?.coins) return;
  const target = app.plateRects.coins;
  const tx = target.x + target.h * 0.5;
  const ty = target.y + target.h * 0.5;
  const size = Math.round(18 * U(kit.L));
  for (const p of st.fly) {
    p.t += dt;
    if (p.t < 0 || p.done) continue;
    const k = clamp(p.t / 0.55, 0, 1);
    if (k >= 1) {
      p.done = true;
      st.arrived += 1;
      app.sfx('coin');
      kit.spawnSparks(tx, ty, kit.c.gold);
      continue;
    }
    const e = k * k * (3 - 2 * k);
    const x = p.x0 + (tx - p.x0) * e;
    const y = p.y0 + (ty - p.y0) * e - Math.sin(k * Math.PI) * 40 * U(kit.L);
    kit.icon('coin', Math.round(x), Math.round(y), size, kit.c.gold);
  }
}

/** Награды, зоны, вехи и открывшиеся действия — по отчёту правил и разнице профилей. */
function collectNews(app, res) {
  const c = app.kit.c;
  const out = [];
  const { report, before, after } = res;
  for (const a of report.awarded?.achievements || []) out.push({ icon: 'trophy', color: c.amberDeep, text: a.name, reward: a.reward });
  for (const ct of report.awarded?.contracts || []) out.push({ icon: 'contract', color: c.amberDeep, text: ct.name, reward: ct.reward });
  for (const z of report.newZones || []) out.push({ icon: 'altitude', color: c.cyanDark, text: z.name });
  const ms = report.milestones || {};
  if (ms.firstSoftLanding) out.push({ icon: 'check', color: c.greenDark, text: t('results.n.firstLanding') });
  if (ms.firstMoonLanding) out.push({ icon: 'moon', color: c.cyanDark, text: t('results.n.moon') });
  if (ms.firstMarsLanding) out.push({ icon: 'mars', color: c.redDark, text: t('results.n.mars') });
  if (ms.newMaxAlt) out.push({ icon: 'up', color: c.greenDark, text: t('results.n.record') });
  try {
    const was = app.rules.getEraState(before);
    const now = app.rules.getEraState(after);
    if (now.ok && !was.ok) out.push({ icon: 'era', color: c.amberDeep, text: t('results.n.era') });
    const open = (p) => app.rules.availableDestinations(p).filter((d) => d.ok).map((d) => d.id);
    const old = open(before);
    for (const d of open(after)) if (!old.includes(d)) out.push({ icon: d === 'moon' ? 'moon' : 'mars', color: c.cyanDark, text: t('results.n.dest', { name: app.data.DESTINATIONS?.[d]?.name || d }) });
  } catch {
    /* подсказки необязательны */
  }
  return out;
}

void fmtInt;
