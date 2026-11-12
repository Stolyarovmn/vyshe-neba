// Итоги полёта: бланк-отчёт на бумаге со штампом «ПОСАДКА» / «АВАРИЯ», сегментные счётчики с анимацией, монеты летят в табличку,
// значки наград. Без таблиц «название — значение»: числа и полоски. В ландшафте две колонки.

import { t } from '../../i18n/index.js';
import { resultsLayout } from '../layout.js';
import { clamp, easeOutCubic, fmtAlt, fmtClock, fmtCompact, fmtInt, fmtSpeed } from '../format.js';
import * as inst from '../skin/instruments.js';
import { drawSheet, drawRule, sheetInset, reportOf } from '../skin/report.js';
import { drawChrome, partShort, buildingShort, partIcon, buildingIcon } from './common.js';
import { nextSummary } from '../next-steps.js';

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
    st.contentH = null;
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
    const M = reportOf(kit);
    const { result } = res;
    // лист по высоте содержимого (оно известно по предыдущему кадру), носитель — по эпохе базы
    const inset = sheetInset(kit);
    const compact = !L.portrait && L.h < 460;
    const cc = kit.cell();
    const outcome = result.outcome;
    const landed = outcome === 'landed';
    const crashed = outcome === 'crashed';
    const elapsed = app.time - st.t0;
    // шапка: название тела слева, штамп справа; в узком листе штамп уходит на вторую строку (шрифт не мельчится)
    const bodyId = res.report.body || result.body || res.destination;
    const bodyName = t(`dest.${res.destination}`) !== `dest.${res.destination}` ? t(`dest.${res.destination}`) : app.data.DESTINATIONS?.[res.destination]?.name || app.data.BODIES?.[bodyId]?.name;
    const stampLabel = landed ? (result.perfect ? t('results.perfect') : t('results.landed')) : crashed ? t('results.crashed') : t('results.abandoned');
    const stampSize = kit.fs(L.portrait ? 18 : 22);
    const stampW = kit.text.measure(stampLabel, stampSize) + cc * 14;
    const stampH = Math.round(7 * kit.text.stepFor(stampSize).css + cc * 12);
    const G0 = resultsLayout(L, { inset });
    const nameMax = G0.card.w * 0.34;
    // на бумажном бланке в шапке — «Отчёт о полёте № N»: если он не помещается рядом со штампом, штамп уходит на вторую строку
    const formTitle = isPaper(M) ? t('results.form.title', { n: app.profile?.stats?.flights || 1 }) : '';
    const nameW = Math.round(42 * U(L)) + (isPaper(M) ? kit.text.measure(formTitle, kit.fs(14)) : bodyName ? Math.min(kit.text.measure(bodyName, kit.fs(16)), nameMax) : 0);
    const stackStamp = nameW + stampW + L.gap * 2 > G0.card.w - G0.pad.x * 2;
    const rowH = Math.round((compact ? 44 : 56) * U(L));
    const hdrH = rowH + (stackStamp ? stampH + Math.round(L.gap * 0.5) : 0);
    const need = st.contentH == null ? 0 : L.pad * 2 + inset.y * 2 + hdrH + L.gap * 2 + st.contentH;
    const G = resultsLayout(L, { inset, height: need });

    // таблички: число монет догоняет итог по мере прилёта монет
    const coinsDelta = (res.after.coins || 0) - (res.before.coins || 0);
    const dataDelta = (res.after.data || 0) - (res.before.data || 0);
    const fk = st.fly ? clamp(st.arrived / FLY_COINS, 0, 1) : elapsed > 2.4 ? 1 : 0;
    const chrome = drawChrome(app, kit, { back: false, coins: Math.round(res.before.coins + coinsDelta * fk), data: Math.round(res.before.data + dataDelta * fk) });
    void chrome;

    // бланк: слегка «падает» сверху
    const drop = Math.round(clamp(1 - elapsed / 0.3, 0, 1) * 4) * cc * 4;
    const card = { x: G.card.x, y: G.card.y - drop, w: G.card.w, h: G.card.h };
    drawSheet(kit, card);
    kit.hit('results-card', card, {});

    // шапка: куда летели и штамп
    const hx = card.x + G.pad.x;
    const hy = card.y + G.pad.y + rowH / 2;
    kit.icon(bodyId === 'moon' || bodyId === 'mars' ? bodyId : 'earth', hx + Math.round(18 * U(L)), hy, Math.round(36 * U(L)), M.ink);
    if (isPaper(M)) {
      // шапка бланка: номер отчёта и куда летали, как на печатной форме
      const titleMax = stackStamp ? G.card.w - G.pad.x * 2 - Math.round(42 * U(L)) : nameMax;
      kit.drawText(formTitle, hx + Math.round(42 * U(L)), hy - kit.fs(8), { size: kit.fs(14), color: M.ink, maxWidth: titleMax });
      if (bodyName) kit.drawText(bodyName, hx + Math.round(42 * U(L)), hy + kit.fs(10), { size: kit.fs(12), color: M.dim, maxWidth: titleMax });
    } else if (bodyName) kit.drawText(bodyName, hx + Math.round(42 * U(L)), hy, { size: kit.fs(16), color: M.ink, maxWidth: nameMax });
    const stampColor = landed ? M.good : crashed ? M.bad : M.dim;
    if (elapsed > 0.5) {
      const k = clamp((elapsed - 0.5) / 0.18, 0, 1);
      if (!st.stamped) {
        st.stamped = true;
        app.sfx(landed ? 'coin' : 'hit');
        if (!landed) app.shake?.(1);
      }
      const off = Math.round((1 - k) * 4) * cc * 2;
      kit.S.ctx.globalAlpha = k;
      const sy = stackStamp ? card.y + G.pad.y + rowH + Math.round(L.gap * 0.25) + stampH / 2 : hy;
      kit.stamp(stampLabel, card.x + card.w - G.pad.x - stampW / 2, sy + off, stampColor, stampSize);
      kit.S.ctx.globalAlpha = 1;
    }

    drawRule(kit, hx, card.y + G.pad.y + hdrH + Math.round(L.gap * 0.4), card.w - G.pad.x * 2);
    const bodyTop = card.y + G.pad.y + hdrH + L.gap;
    const body = { x: G.content.x, y: bodyTop, w: G.content.w, h: G.content.y + G.content.h - bodyTop - drop * 0 };
    const wide = !L.portrait && body.w > 520 * U(L);
    const paper = isPaper(M);
    kit.scrollArea('results-scroll', { x: body.x, y: body.y - drop, w: body.w, h: body.h }, undefined, (top) => {
      const w = body.w - cc * 4;
      const colW = wide ? Math.floor((w - L.gap * 3) / 2) : w;
      const left = { x: body.x, w: colW };
      const right = wide ? { x: body.x + colW + L.gap * 3, w: colW } : left;
      const y1 = paper ? drawPaperFlight(app, kit, L, left, top, res, elapsed) : drawFlightColumn(app, kit, L, left, top, res, elapsed);
      const y2 = paper ? drawPaperRewards(app, kit, L, right, wide ? top : y1 + L.gap, res, st, elapsed) : drawRewardsColumn(app, kit, L, right, wide ? top : y1, res, st, elapsed, dt);
      st.contentH = Math.max(y1, y2) - top + L.gap;
      return st.contentH;
    });

    drawFlyingCoins(app, kit, st, dt);

    const half = (G.buttons.w - L.gap) / 2;
    const by = G.buttons.y - drop;
    // значки на кнопках — пока помещаются при полном шрифте; иначе только подписи
    const endSize = kit.fs(16);
    const icons = kit.buttonNeed(t('results.again'), endSize, { icon: true }) <= half && kit.buttonNeed(t('results.base'), endSize, { icon: true }) <= half;
    if (kit.button('results-again', { x: G.buttons.x, y: by, w: half, h: G.buttons.h }, { label: t('results.again'), icon: icons ? 'launch' : undefined, variant: 'primary', size: endSize, fixedScale: true })) again(app, res);
    if (kit.button('results-base', { x: G.buttons.x + half + L.gap, y: by, w: half, h: G.buttons.h }, { label: t('results.base'), icon: icons ? 'base' : undefined, variant: 'btn', size: endSize, fixedScale: true })) {
      app.results = null;
      app.history.length = 0;
      app.go('hub');
    }
  },
};

// ---------- бумажный бланк (E0 перфобумага, E1 термолента) ----------
//
// На бумаге нет экранов и кнопок: всё напечатано строками «название …… значение» и разделами, как в отчёте с телетайпа.
// Числа набираются (печатаются) по очереди; переходы «что улучшить» — подчёркнутые строки, нажимаются целиком.

const isPaper = (M) => M.kind === 'perf' || M.kind === 'thermal';

/** Заголовок раздела: короткая строка тёмной краской и пунктир под ней. Возвращает высоту. */
function formHeading(kit, x, y, w, text, k = 1) {
  const M = reportOf(kit);
  const cc = kit.cell();
  const size = kit.fs(11);
  const h = Math.round(size * 1.9);
  if (k <= 0) return h;
  kit.S.ctx.globalAlpha = k;
  kit.drawText(text, x, y + size * 0.75, { size, color: M.dim });
  for (let xx = 0; xx < w; xx += cc * 3) kit.rect(Math.round(x + xx), Math.round(y + size * 1.45), Math.min(cc * 2, w - xx), cc, M.dim);
  kit.S.ctx.globalAlpha = 1;
  return h;
}

/**
 * Печатная строка: подпись слева, отточие, значение справа. Длинная подпись переносится, значение стоит на последней
 * строке. o: size, color, value color, k (появление 0..1), icon. Возвращает высоту строки.
 */
function formRow(kit, x, y, w, label, value, o = {}) {
  const M = reportOf(kit);
  const cc = kit.cell();
  const size = o.size || kit.fs(12);
  const step = kit.text.lineStep(size, 1.3);
  const iconW = o.icon ? Math.round(size * 1.6) : 0;
  const vw = value ? kit.text.measure(value, size) : 0;
  const lines = kit.text.wrap(label, Math.max(size * 4, w - iconW - vw - cc * 8), size);
  const h = Math.max(o.minH || 0, lines.length * step + cc * 2);
  const k = o.k ?? 1;
  if (k <= 0) return h;
  kit.S.ctx.globalAlpha = k;
  const y0 = y + cc + step / 2;
  if (o.icon) kit.icon(o.icon, x + iconW * 0.4, y0, Math.round(size * 1.25), o.iconColor || M.ink);
  lines.forEach((ln, i) => kit.drawText(ln, x + iconW, y0 + i * step, { size, color: o.color || M.ink }));
  if (value) {
    const ly = y0 + (lines.length - 1) * step;
    const lastW = kit.text.measure(lines[lines.length - 1] || '', size);
    const dotY = Math.round(ly + kit.text.stepFor(size).css * 2.5);
    for (let dx = x + iconW + lastW + cc * 3; dx < x + w - vw - cc * 3; dx += cc * 3) kit.rect(Math.round(dx), dotY, cc, cc, M.dim);
    kit.drawText(value, x + w, ly, { size, color: o.valueColor || o.color || M.ink, align: 'right' });
  }
  kit.S.ctx.globalAlpha = 1;
  return h;
}

/** Левая колонка бланка: полёт, причина аварии, касание, рекомендации. Возвращает нижнюю границу. */
function drawPaperFlight(app, kit, L, col, top, res, elapsed) {
  const M = reportOf(kit);
  const cc = kit.cell();
  const { result, report } = res;
  const landed = result.outcome === 'landed';
  const crashed = result.outcome === 'crashed';
  const { x, w } = col;
  let y = top;
  const rowK = (i) => easeOutCubic(clamp((elapsed - 0.35 - i * 0.18) / 0.4, 0, 1));
  y += formHeading(kit, x, y, w, t('results.form.flight'));
  const alt = fmtAlt(result.maxAlt);
  const dist = fmtAlt(result.distance);
  const unit = (u) => t(u === 'km' ? 'unit.km' : 'unit.m');
  const rows = [
    [t('results.row.alt'), `${countStr(alt.value.replace(' ', ''), rowK(0))} ${unit(alt.unit)}`],
    [t('results.row.dist'), `${countStr(dist.value.replace(' ', ''), rowK(1))} ${unit(dist.unit)}`],
    [t('results.row.time'), fmtClock(result.time * rowK(2))],
  ];
  rows.forEach(([label, value], i) => { y += formRow(kit, x, y, w, label, value, { k: Math.min(1, rowK(i) * 3) }); });
  y += L.gap * 0.5;
  if (crashed && report.hint) {
    y += kit.paragraph(report.hint.text, x, y, w, { size: kit.fs(12), color: M.ink, lineHeight: 1.3 }) + L.gap * 0.5;
    if (report.hint.savedIfLanded !== undefined) y += kit.paragraph(t('results.savedIfLanded', { n: fmtInt(report.hint.savedIfLanded) }), x, y, w, { size: kit.fs(12), color: M.bad, lineHeight: 1.3 }) + L.gap * 0.5;
  }
  const lg = result.landing;
  if ((crashed || landed) && lg && lg.vTol) {
    y += formHeading(kit, x, y, w, t('results.form.touch'));
    const deg = (r) => `${Math.round((r * 180) / Math.PI)}°`;
    for (const [key, v, tol, vs, ts] of [['v', lg.v, lg.vTol, fmtSpeed(lg.v), fmtSpeed(lg.vTol)], ['h', lg.h, lg.hTol, fmtSpeed(lg.h), fmtSpeed(lg.hTol)], ['ang', lg.ang, lg.angTol, deg(lg.ang), deg(lg.angTol)]]) {
      const bad = v > tol;
      y += formRow(kit, x, y, w, t(`results.row.${key}`), t('results.row.tol', { v: vs, tol: ts }), { valueColor: bad ? M.bad : M.ink, icon: bad ? 'close' : 'check', iconColor: bad ? M.bad : M.good });
    }
    y += L.gap * 0.5;
  }
  if (crashed && report.hint) {
    const links = [];
    const part = report.hint.part;
    if (part && part !== 'parachute') {
      const name = part === 'fins' ? t('results.fins') : partShort(app, part);
      const label = report.reason === 'lost-in-space' ? t('results.spaceFins') : t('results.upgrade', { part: name, level: report.hint.level ?? Math.min(18, res.before.parts[part] + 1) });
      links.push({ id: 'results-goto-part', label, go: () => app.go('rocket', { select: part }, { push: true }) });
    }
    if (report.hint.shop === 'chute') links.push({ id: 'results-goto-shop', label: t('cons.chute'), go: () => app.go('shop', {}, { push: true }) });
    if (report.hint.building) links.push({ id: 'results-goto-building', label: buildingShort(app, report.hint.building), go: () => app.go('base', { select: report.hint.building }, { push: true }) });
    if (links.length) {
      y += formHeading(kit, x, y, w, t('results.form.todo'));
      const size = kit.fs(13);
      const rh = Math.max(L.touch(40), Math.round(size * 2.4));
      for (const ln of links) {
        const r = { x, y, w, h: rh };
        kit.hit(ln.id, r, { focusable: true });
        const hot = kit.S.hover === ln.id;
        if (hot) kit.S.cursor = 'pointer';
        if (kit.S.focusVisible && kit.S.focusId === ln.id) kit.focusRing(r);
        // строка-ссылка: стрелка и подчёркнутое название, при наведении — пометка карандашом слева
        if (hot) kit.rect(x, y + cc * 2, cc, rh - cc * 4, M.amber);
        kit.icon('arrow', x + size * 0.9, y + rh / 2, Math.round(size * 1.2), M.cyan);
        const tw = kit.drawText(ln.label, x + size * 2.2, y + rh / 2, { size, color: M.cyan, maxWidth: w - size * 2.4 }).w;
        kit.rect(Math.round(x + size * 2.2), Math.round(y + rh / 2 + kit.text.stepFor(size).css * 4.5), Math.round(tw), cc, M.cyan);
        if (kit.clicked === ln.id) ln.go();
        y += rh;
      }
    }
  }
  return y;
}

/** Правая колонка бланка: начислено, списано, итог, отметки, что дальше. Возвращает нижнюю границу. */
function drawPaperRewards(app, kit, L, col, top, res, st, elapsed) {
  const M = reportOf(kit);
  const { report } = res;
  const { x, w } = col;
  let y = top;
  const coin = report.coins || {};
  const coinsDelta = (res.after.coins || 0) - (res.before.coins || 0);
  const dataDelta = (res.after.data || 0) - (res.before.data || 0);
  const lines = Object.keys(CHIP_ICON).map((k) => [k.replace('results.c.', ''), coin[k.replace('results.c.', '')]]).filter(([, v]) => v);
  if (lines.length) y += formHeading(kit, x, y, w, t('results.form.paid'));
  lines.forEach(([key, value], i) => {
    const k = easeOutCubic(clamp((elapsed - 0.6 - i * 0.22) / 0.4, 0, 1));
    if (k > 0 && i >= st.ticked) {
      st.ticked = i + 1;
      app.sfx('coin');
    }
    y += formRow(kit, x, y, w, t(`results.p.${key}`, { count: res.result.rings ?? 0 }), `+${fmtInt(value)}`, { k });
  });
  if (coin.saved) y += kit.paragraph(t('results.saved', { n: fmtInt(coin.saved) }), x, y, w, { size: kit.fs(12), color: M.good, lineHeight: 1.3 }) + L.gap * 0.4;
  if (coin.charged) y += formRow(kit, x, y, w, t('results.row.charged'), `−${fmtInt(coin.charged)}`, { color: M.bad });
  y += L.gap * 0.5;

  // итог: крупнее остальных строк; монеты летят в табличку, когда итог напечатан
  const totalK = easeOutCubic(clamp((elapsed - 0.8 - lines.length * 0.22) / 0.9, 0, 1));
  y += formHeading(kit, x, y, w, t('results.form.total'));
  const big = kit.fs(16);
  const coinsY = y;
  const shownC = Math.round(Math.abs(coinsDelta) * totalK);
  y += formRow(kit, x, y, w, t('results.row.coins'), `${coinsDelta < 0 ? '−' : '+'}${fmtInt(shownC)}`, { size: big, icon: 'coin', iconColor: M.amber, valueColor: coinsDelta < 0 ? M.bad : M.ink });
  if (dataDelta) y += formRow(kit, x, y, w, t('results.row.data'), `+${fmtInt(Math.round(dataDelta * totalK))}`, { size: big, icon: 'data', iconColor: M.cyan });
  if (!st.fly && totalK >= 1 && coinsDelta > 0 && app.plateRects?.coins) {
    st.fly = Array.from({ length: FLY_COINS }, (_, i) => ({ t: -i * 0.09, x0: x + w - big * 2, y0: coinsY + big }));
    st.arrived = 0;
  }
  y += L.gap * 0.5;

  const news = collectNews(app, res).slice(0, 5);
  if (news.length) {
    const nk = (i) => easeOutCubic(clamp((elapsed - 1.4 - i * 0.2) / 0.35, 0, 1));
    y += formHeading(kit, x, y, w, t('results.form.news'), nk(0));
    news.forEach((n, i) => {
      y += formRow(kit, x, y, w, n.text, n.reward ? `+${fmtInt(n.reward)}` : '', { k: nk(i), icon: n.icon, iconColor: M[n.tone] || M.amber });
    });
    y += L.gap * 0.5;
  }

  const steps = nextSummary(app, 2).steps.slice(0, 2);
  if (steps.length) {
    const sk = easeOutCubic(clamp((elapsed - 1.6 - news.length * 0.2) / 0.4, 0, 1));
    y += formHeading(kit, x, y, w, t('next.title'), sk);
    for (const step of steps) {
      const ready = step.affordable && step.kind !== 'fly';
      const name = { 'buy-building': buildingIcon(step.id, 1), 'buy-part': partIcon(step.id), era: 'era', fly: 'launch', wait: 'check' }[step.kind] || 'target';
      y += formRow(kit, x, y, w, step.text, '', { k: sk, icon: name, iconColor: ready ? M.good : M.amber, color: ready ? M.good : M.ink });
    }
  }
  return y;
}

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
  const M = reportOf(kit);
  const cc = kit.cell();
  const { result, report } = res;
  const landed = result.outcome === 'landed';
  const crashed = result.outcome === 'crashed';
  const { x, w } = col;
  let y = top;
  const compact = !L.portrait && L.h < 460;
  if (crashed && report.hint) {
    y += kit.paragraph(report.hint.text, x, y, w, { size: kit.fs(12), color: M.ink, lineHeight: 1.25 }) + L.gap * 0.5;
    if (report.hint.savedIfLanded !== undefined) y += kit.paragraph(t('results.savedIfLanded', { n: fmtInt(report.hint.savedIfLanded) }), x, y, w, { size: kit.fs(12), color: M.bad, lineHeight: 1.25 }) + L.gap * 0.5;
  }
  const lg = result.landing;
  if ((crashed || landed) && lg && lg.vTol) y += drawTolerances(kit, L, x, y, w, lg) + L.gap * 0.5;
  if (crashed && report.hint) {
    const chips = [];
    const part = report.hint.part;
    if (part && part !== 'parachute') {
      const name = part === 'fins' ? t('results.fins') : partShort(app, part);
      const label = report.reason === 'lost-in-space' ? t('results.spaceFins') : t('results.upgrade', { part: name, level: report.hint.level ?? Math.min(18, res.before.parts[part] + 1) });
      chips.push({ id: 'results-goto-part', label, icon: partIcon(part), go: () => app.go('rocket', { select: part }, { push: true }) });
    }
    // парашют теперь расходник: после аварии без него подсказываем лавку
    if (report.hint.shop === 'chute') chips.push({ id: 'results-goto-shop', label: t('cons.chute'), icon: 'chute', go: () => app.go('shop', {}, { push: true }) });
    if (report.hint.building) chips.push({ id: 'results-goto-building', label: buildingShort(app, report.hint.building), icon: buildingIcon(report.hint.building, 1), go: () => app.go('base', { select: report.hint.building }, { push: true }) });
    if (chips.length) {
      // кнопки-переходы раскладываются рядами по ширине листа: сначала со значками, иначе без; шрифт не мельчится
      const csize = kit.fs(12);
      const need = (ch, icon) => kit.buttonNeed(ch.label, csize, { icon: icon ? ch.icon : undefined });
      const pack = (icon) => {
        const out = [];
        let cur = [];
        let widest = 0;
        for (const ch of chips) {
          const nw = Math.max(widest, need(ch, icon));
          if (cur.length && (cur.length + 1) * nw + L.gap * cur.length > w) {
            out.push(cur);
            cur = [];
            widest = 0;
          }
          cur.push(ch);
          widest = Math.max(widest, need(ch, icon));
        }
        if (cur.length) out.push(cur);
        return out;
      };
      const withIcons = pack(true);
      const plain = pack(false);
      const showIcons = withIcons.length <= plain.length;
      const rows = showIcons ? withIcons : plain;
      const bh = L.touch(compact ? 44 : 46);
      for (const row of rows) {
        const bw = (w - L.gap * (row.length - 1)) / row.length;
        const pad = Math.max(cc * 3, kit.text.stepFor(csize).css * 2 + cc);
        const iconW = showIcons ? csize * 1.9 : 0;
        const textW = bw - pad * 2 - iconW;
        const rowHeight = Math.max(bh, ...row.map((ch) => kit.text.blockHeight(ch.label, textW, csize, 1.25) + pad * 2));
        row.forEach((ch, i) => {
          const bx = x + i * (bw + L.gap);
          if (kit.button(ch.id, { x: bx, y, w: bw, h: rowHeight }, { tip: ch.label, variant: 'btn', size: csize, fixedScale: true })) ch.go();
          const color = kit.readable(c.text, kit.frameMid('btn'));
          if (showIcons) kit.icon(ch.icon, bx + pad + csize * 0.75, y + rowHeight / 2, csize * 1.5, color);
          kit.paragraph(ch.label, bx + pad + iconW, y + pad, textW, { size: csize, color, lineHeight: 1.25 });
        });
        y += rowHeight + L.gap * (compact ? 0.5 : 1);
      }
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
  // узкая колонка: три карточки в ряд — значок и единица сверху, цифры на своём табло снизу
  const cards = w < 420 * U(L);
  const ch = Math.round(sh * (compact ? 1.4 : 1.5));
  const cw = (w - L.gap * 2) / 3;
  boards.forEach(([icon, val, unit], i) => {
    const k = easeOutCubic(clamp((elapsed - 0.35 - i * 0.18) / 0.5, 0, 1));
    const shown = i === 2 ? fmtClock(result.time * k) : countStr(val, k);
    const digits = Math.max(3, val.length);
    if (cards) {
      const r = { x: x + i * (cw + L.gap), y, w: cw, h: ch };
      const isz = Math.round(sh * 0.4);
      kit.nine('raised', r.x, r.y, r.w, r.h);
      kit.icon(icon, r.x + cc * 4 + isz / 2, r.y + cc * 3 + isz / 2, isz, c.cyan);
      if (unit) kit.drawText(unit, r.x + r.w - cc * 4, r.y + cc * 3 + isz / 2, { size: Math.max(8, kit.fs(9)), color: kit.readable(c.steel3, kit.frameMid('raised')), align: 'right' });
      const top = r.y + cc * 3 + isz + cc;
      inst.readout(kit, { x: r.x + cc * 2, y: top, w: r.w - cc * 4, h: r.y + r.h - cc * 3 - top }, shown, { lit: c.green, digits, h: Math.round(sh * 0.5) });
      return;
    }
    const r = { x: x + i * (cw + L.gap), y, w: cw, h: sh };
    // справа остаётся место под единицу измерения, чтобы она не налезала на цифры
    const unitW = unit ? kit.text.measure(unit, Math.max(8, kit.fs(9))) + cc * 5 : 0;
    inst.readout(kit, { x: r.x + sh * 0.9, y: r.y, w: r.w - sh * 0.9 - unitW, h: r.h }, shown, { lit: c.green, digits, h: Math.round(sh * 0.5) });
    kit.nine('raised', r.x, r.y, sh * 0.9, r.h);
    kit.icon(icon, r.x + sh * 0.45, r.y + r.h / 2, Math.round(sh * 0.5), c.cyan);
    if (unit) kit.drawText(unit, r.x + r.w - cc * 3, r.y + r.h - cc * 4, { size: Math.max(8, kit.fs(9)), color: M.dim, align: 'right' });
  });
  y += (cards ? ch : sh) + L.gap;
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
  const M = reportOf(kit);
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
    kit.icon(icon, x + rowH * 0.45, yy + rowH / 2, Math.round(rowH * 0.7), bad ? M.bad : M.ink);
    const bar = { x: x + rowH, y: yy + cc * 2, w: w - rowH - Math.round(66 * U(L)), h: rowH - cc * 4 };
    kit.ledBar(bar, { value: clamp(v / (tol * 2), 0, 1), color: bad ? c.red : c.green, ghost: 0.5, segments: 12 });
    kit.drawText(vs, x + w, yy + rowH / 2, { size: kit.fs(12), color: bad ? M.bad : M.ink, align: 'right', maxWidth: 60 * U(L) });
  });
  return rows.length * rowH;
}

// ---------- правая колонка: награды ----------

const CHIP_ICON = { 'results.c.travel': 'altitude', 'results.c.loot': 'coin', 'results.c.landing': 'check', 'results.c.perfect': 'star', 'results.c.expedition': 'target', 'results.c.storm': 'wind', 'results.c.rings': 'fins', 'results.c.near': 'shield', 'results.c.fuelSaving': 'fuel', 'results.c.goal': 'target' };

function drawRewardsColumn(app, kit, L, col, top, res, st, elapsed, dt) {
  const c = kit.c;
  const M = reportOf(kit);
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
  // Каждая выплата подписана; переносы учитываются в высоте прокручиваемого бланка.
  lines.forEach(([key, value], i) => {
    const k = easeOutCubic(clamp((elapsed - 0.6 - i * 0.22) / 0.4, 0, 1));
    if (k > 0 && i >= st.ticked) {
      st.ticked = i + 1;
      app.sfx('coin');
    }
    const label = t(key, { n: fmtInt(value), count: res.result.rings ?? 0 });
    const size = kit.fs(12);
    const textW = w - chipH - cc * 4;
    const height = Math.max(chipH, kit.text.blockHeight(label, textW, size, 1.25));
    const r = { x, y, w, h: height };
    y += height + L.gap * 0.6;
    if (k <= 0) return;
    kit.S.ctx.globalAlpha = k;
    kit.nine('screen', r.x, r.y, r.w, r.h);
    kit.icon(CHIP_ICON[key], r.x + chipH * 0.55, r.y + r.h / 2, Math.round(chipH * 0.62), c.amberLight);
    kit.paragraph(label, r.x + chipH, r.y, textW, { size, color: c.gold, lineHeight: 1.25 });
    kit.S.ctx.globalAlpha = 1;
  });
  y += L.gap * 0.4;
  if (coin.saved) y += kit.paragraph(t('results.saved', { n: fmtInt(coin.saved) }), x, y, w, { size: kit.fs(12), color: M.good, lineHeight: 1.25 }) + L.gap * 0.5;
  if (coin.charged) {
    kit.icon('warn', x + cc * 6, y + chipH / 2, Math.round(chipH * 0.6), M.bad);
    kit.drawText(`−${fmtCompact(coin.charged)}`, x + cc * 12 + chipH * 0.5, y + chipH / 2, { size: kit.fs(13), color: M.bad });
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
  kit.nine('screen', rc.x, rc.y, rc.w, rc.h);
  kit.icon('coin', rc.x + th * 0.5, rc.y + th / 2, Math.round(th * 0.6), c.gold);
  inst.bigDigits(kit, `${coinsDelta < 0 ? '-' : ''}${Math.round(showC)}`, rc.x + rc.w - cc * 4, rc.y + (th - Math.round(th * 0.5)) / 2, Math.round(th * 0.5), coinsDelta >= 0 ? c.gold : c.red, 'right');
  kit.nine('screen', rd.x, rd.y, rd.w, rd.h);
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
  // подписи переносятся по словам (две–три строки), а не обрезаются; место под строку резервируется заранее,
  // чтобы бланк не «росла» по мере появления наград
  const newsSize = kit.fs(12);
  const newsStep = kit.text.lineStep(newsSize, 1.25);
  news.slice(0, 5).forEach((n, i) => {
    const k = easeOutCubic(clamp((elapsed - 1.4 - i * 0.2) / 0.35, 0, 1));
    const rewardW = n.reward ? kit.costWidth({ coins: n.reward }, kit.fs(11)) + L.gap : 0;
    const lines = kit.text.wrap(n.text, w - rowH * 1.1 - rewardW, newsSize);
    const itemH = Math.max(rowH, Math.round(lines.length * newsStep + cc * 2));
    if (k > 0) {
      kit.S.ctx.globalAlpha = k;
      const first = y + rowH / 2;
      kit.icon(n.icon, x + rowH * 0.5, first, Math.round(rowH * 0.8), M[n.tone] || M.amber);
      lines.forEach((ln, li) => kit.drawText(ln, x + rowH * 1.1, first + li * newsStep, { size: newsSize, color: M.ink }));
      if (n.reward) kit.costChip(x + w, first, { coins: n.reward }, { align: 'right', size: kit.fs(11), bg: M.bg2 });
      kit.S.ctx.globalAlpha = 1;
    }
    y += itemH;
  });
  void dt;

  // «Что дальше»: один-два ближайших шага прогресса (rules.getNextSteps), чтобы игрок не упирался в потолок вслепую
  const steps = nextSummary(app, 2).steps.slice(0, 2);
  if (steps.length) {
    const nk = easeOutCubic(clamp((elapsed - 1.6 - Math.min(news.length, 5) * 0.2) / 0.4, 0, 1));
    const ssize = kit.fs(12);
    const sstep = kit.text.lineStep(ssize, 1.25);
    const icon = Math.round(rowH * 0.8);
    y += Math.round(L.gap * 0.5);
    kit.S.ctx.globalAlpha = nk;
    kit.drawText(t('next.title'), x, y + Math.round(kit.fs(11) * 0.7), { size: kit.fs(11), color: M.dim });
    y += Math.round(kit.fs(11) * 1.6);
    for (const step of steps) {
      const lines = kit.text.wrap(step.text, w - rowH * 1.1, ssize).slice(0, 3);
      const itemH = Math.max(rowH, Math.round(lines.length * sstep + cc * 2));
      const first = y + rowH / 2;
      // значок по виду шага: покупка модуля/постройки, переход в эпоху, нужный полёт, «всё сделано»
      const name = { 'buy-building': buildingIcon(step.id, 1), 'buy-part': partIcon(step.id), era: 'era', fly: 'launch', wait: 'check' }[step.kind] || 'target';
      const ready = step.affordable && step.kind !== 'fly';
      kit.icon(name, x + rowH * 0.5, first, icon, ready ? M.good : step.kind === 'fly' ? M.cyan : M.amber);
      lines.forEach((ln, li) => kit.drawText(ln, x + rowH * 1.1, first + li * sstep, { size: ssize, color: ready ? M.good : M.ink }));
      y += itemH;
    }
    kit.S.ctx.globalAlpha = 1;
  }
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
  // tone — роль цвета на носителе отчёта (skin.report): amber, cyan, good, bad
  const out = [];
  const { report, before, after } = res;
  for (const a of report.awarded?.achievements || []) out.push({ icon: 'trophy', tone: 'amber', text: a.name, reward: a.reward });
  for (const ct of report.awarded?.contracts || []) out.push({ icon: 'contract', tone: 'amber', text: ct.name, reward: ct.reward });
  for (const z of report.newZones || []) out.push({ icon: 'altitude', tone: 'cyan', text: z.name });
  const ms = report.milestones || {};
  if (ms.firstSoftLanding) out.push({ icon: 'check', tone: 'good', text: t('results.n.firstLanding') });
  if (ms.firstMoonLanding) out.push({ icon: 'moon', tone: 'cyan', text: t('results.n.moon') });
  if (ms.firstMarsLanding) out.push({ icon: 'mars', tone: 'bad', text: t('results.n.mars') });
  if (ms.newMaxAlt) out.push({ icon: 'up', tone: 'good', text: t('results.n.record') });
  try {
    const was = app.rules.getEraState(before);
    const now = app.rules.getEraState(after);
    if (now.ok && !was.ok) out.push({ icon: 'era', tone: 'amber', text: t('results.n.era') });
    const open = (p) => app.rules.availableDestinations(p).filter((d) => d.ok).map((d) => d.id);
    const old = open(before);
    for (const d of open(after)) if (!old.includes(d)) out.push({ icon: d === 'moon' ? 'moon' : 'mars', tone: 'cyan', text: t('results.n.dest', { name: app.data.DESTINATIONS?.[d]?.name || d }) });
  } catch {
    /* подсказки необязательны */
  }
  return out;
}

void fmtInt;
