// Итоги полёта: анимированные награды, причина аварии/посадки с числами, что открылось, «Ещё раз» / «На базу».
// В ландшафте две колонки: слева причина и показатели, справа награды и новое.

import { t } from '../../i18n/index.js';
import { resultsLayout } from '../layout.js';
import { clamp, easeOutCubic, fmtAlt, fmtClock, fmtInt, fmtNum, fmtSpeed } from '../format.js';
import { partName, buildingName } from './common.js';

const LINE_DELAY = 0.3;
const LINE_COUNT_TIME = 0.55;

function state(app) {
  return ((app.ui ||= {}).results ||= { t0: 0, ticked: 0 });
}

export default {
  id: 'results',
  background: 'hubdim',
  enter(app) {
    const st = state(app);
    st.t0 = app.time;
    st.ticked = 0;
  },
  onBack() {
    return true;
  },
  draw(app, kit, L) {
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
    const titleKey = landed ? (result.perfect ? 'results.perfect' : 'results.landed') : crashed ? 'results.crashed' : 'results.abandoned';
    kit.nine('raised', G.card.x, G.card.y, G.card.w, G.card.h);
    kit.hit('results-card', G.card, {});
    const hdrH = Math.round(54 * L.ui);
    kit.nine(landed ? 'good' : crashed ? 'warn' : 'raised', G.card.x + L.px * 2, G.card.y + L.px * 2, G.card.w - L.px * 4, hdrH, Math.max(1, Math.round(L.px * 0.75)));
    kit.icon(landed ? (result.perfect ? 'star' : 'check') : crashed ? 'warn' : 'close', G.card.x + L.pad + hdrH * 0.4, G.card.y + L.px * 2 + hdrH / 2, Math.round(hdrH * 0.55), landed ? c.white : crashed ? c.red : c.textDim);
    kit.drawText(t(titleKey), G.card.x + L.pad * 2 + hdrH * 0.7, G.card.y + L.px * 2 + hdrH / 2, { size: kit.fs(20), color: c.text, shadow: 'rgba(0,0,0,0.6)', maxWidth: G.card.w * 0.5 });

    // тело, на которое летели: «Луна», «Марс», «Атмосфера»
    const bodyId = res.report.body || result.body || res.destination;
    const bodyName = app.data.DESTINATIONS?.[res.destination]?.name || app.data.BODIES?.[bodyId]?.name;
    if (bodyName) {
      const bx = G.card.x + G.card.w - L.pad * 2;
      const by = G.card.y + L.px * 2 + hdrH / 2;
      const nameW = kit.text.measure(bodyName, kit.fs(16));
      kit.drawText(bodyName, bx, by, { size: kit.fs(16), color: c.text, align: 'right', shadow: 'rgba(0,0,0,0.6)', maxWidth: G.card.w * 0.3 });
      kit.icon(bodyId === 'moon' || bodyId === 'mars' ? bodyId : 'earth', bx - Math.min(nameW, G.card.w * 0.3) - kit.fs(14), by, kit.fs(24), c.text);
    }

    const bodyTop = G.card.y + L.px * 2 + hdrH + L.gap;
    const body = { x: G.content.x, y: bodyTop, w: G.content.w, h: G.content.y + G.content.h - bodyTop };
    const elapsed = app.time - st.t0;
    const wide = !L.portrait && body.w > 520 * L.ui;

    kit.scrollArea('results-scroll', body, undefined, (top) => {
      const w = body.w - L.px * 3;
      const colW = wide ? Math.floor((w - L.gap * 2) / 2) : w;
      const left = { x: body.x, w: colW };
      const right = wide ? { x: body.x + colW + L.gap * 2, w: colW } : left;
      const y1 = drawCause(app, kit, L, left, top, res);
      const y2 = drawRewards(app, kit, L, right, wide ? top : y1, res, st, elapsed);
      return Math.max(y1, y2) - top + L.gap;
    });

    const half = (G.buttons.w - L.gap) / 2;
    if (kit.button('results-again', { x: G.buttons.x, y: G.buttons.y, w: half, h: G.buttons.h }, { label: t('results.again'), icon: 'launch', variant: 'primary', size: kit.fs(16) })) again(app, res);
    if (kit.button('results-base', { x: G.buttons.x + half + L.gap, y: G.buttons.y, w: half, h: G.buttons.h }, { label: t('results.base'), icon: 'base', variant: 'btn', size: kit.fs(16) })) {
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

/** Причина аварии с допусками, кнопки «что поможет» и показатели полёта. Возвращает нижнюю границу. */
function drawCause(app, kit, L, col, top, res) {
  const c = kit.c;
  const { result, report } = res;
  const landed = result.outcome === 'landed';
  const crashed = result.outcome === 'crashed';
  const { x, w } = col;
  let y = top;
  if (crashed && report.hint) {
    y += kit.paragraph(report.hint.text, x, y, w, { size: kit.fs(14), color: c.text, lineHeight: 1.25 }) + L.gap * 0.5;
    const lg = result.landing;
    if (lg && lg.vTol) y += drawTolerances(kit, L, x, y, w, lg) + L.gap * 0.5;
    const chips = [];
    if (report.hint.part) chips.push({ id: 'results-goto-part', label: partName(app, report.hint.part), icon: report.hint.part, go: () => app.go('rocket', { select: report.hint.part }, { push: true }) });
    if (report.hint.building) chips.push({ id: 'results-goto-building', label: buildingName(app, report.hint.building), icon: 'building', go: () => app.go('base', { select: report.hint.building }, { push: true }) });
    if (chips.length) {
      kit.drawText(t('results.helps'), x, y + kit.fs(8), { size: kit.fs(12), color: c.textMute });
      y += kit.fs(18);
      const bw = (w - L.gap * (chips.length - 1)) / chips.length;
      chips.forEach((ch, i) => {
        if (kit.button(ch.id, { x: x + i * (bw + L.gap), y, w: bw, h: L.touch(46) }, { label: ch.label, icon: ch.icon, variant: 'btn', size: kit.fs(12) })) ch.go();
      });
      y += L.touch(46) + L.gap;
    }
  } else if (landed && result.landing?.vTol) {
    y += drawTolerances(kit, L, x, y, w, result.landing) + L.gap * 0.5;
  }

  const alt = fmtAlt(result.maxAlt);
  const dist = fmtAlt(result.distance);
  const stats = [
    ['altitude', t('results.alt'), `${alt.value} ${t(alt.unit === 'km' ? 'unit.km' : 'unit.m')}`],
    ['target', t('results.distance'), `${dist.value} ${t(dist.unit === 'km' ? 'unit.km' : 'unit.m')}`],
    ['era', t('results.time'), fmtClock(result.time)],
  ];
  const cw = (w - L.gap * 2) / 3;
  const sh = Math.round(50 * L.ui);
  stats.forEach(([icon, label, val], i) => {
    const sx = x + i * (cw + L.gap);
    kit.nine('inset', sx, y, cw, sh);
    kit.icon(icon, sx + L.pad + 6 * L.ui, y + sh / 2, Math.round(16 * L.ui), c.cyan);
    kit.drawText(val, sx + cw - L.pad * 0.8, y + Math.round(17 * L.ui), { size: kit.fs(14), color: c.text, align: 'right', maxWidth: cw - L.pad * 2 - 18 * L.ui });
    kit.drawText(label, sx + cw - L.pad * 0.8, y + Math.round(37 * L.ui), { size: kit.fs(10), color: c.textMute, align: 'right', maxWidth: cw - L.pad * 2 });
  });
  return y + sh + L.gap * 1.2;
}

/** Награды по строкам (с набором чисел), итог по монетам и данным, «что нового». */
function drawRewards(app, kit, L, col, top, res, st, elapsed) {
  const c = kit.c;
  const { report } = res;
  const { x, w } = col;
  let y = top;
  const size = kit.fs(14);
  const rowH = Math.round(26 * L.ui);
  const lineStep = (i) => clamp((elapsed - i * LINE_DELAY) / LINE_COUNT_TIME, 0, 1);
  let lineIndex = 0;
  const coin = report.coins || {};
  const lines = [
    ['results.c.travel', coin.travel],
    ['results.c.loot', coin.loot],
    ['results.c.landing', coin.landing],
    ['results.c.perfect', coin.perfect],
    ['results.c.expedition', coin.expedition],
    ['results.c.storm', coin.storm],
  ].filter(([, v]) => v);
  kit.drawText(t('results.rewards'), x, y + kit.fs(8), { size: kit.fs(12), color: c.textMute });
  y += kit.fs(20);
  for (const [key, value] of lines) {
    const k = easeOutCubic(lineStep(lineIndex));
    if (k > 0 && lineIndex >= st.ticked) {
      st.ticked = lineIndex + 1;
      app.sfx('coin');
    }
    lineIndex++;
    if (k <= 0) {
      y += rowH;
      continue;
    }
    kit.S.ctx.globalAlpha = k;
    kit.drawText(t(key), x, y + rowH / 2, { size, color: c.textDim, maxWidth: w * 0.6 });
    kit.icon('coin', x + w - kit.fs(60), y + rowH / 2, kit.fs(14), c.gold);
    kit.drawText(`+${fmtInt(value * k)}`, x + w, y + rowH / 2, { size, color: c.gold, align: 'right', weight: 900, dynamic: true });
    kit.S.ctx.globalAlpha = 1;
    y += rowH;
  }
  const m = report.multipliers;
  if (m && m.income > 1.001 && coin.travel) {
    kit.drawText(t('results.mult', { n: fmtNum(m.income, 2) }), x, y + rowH / 2, { size: kit.fs(12), color: c.green });
    y += rowH;
  }
  if (coin.charged) {
    kit.drawText(t('results.c.charged'), x, y + rowH / 2, { size, color: c.red });
    kit.drawText(`−${fmtInt(coin.charged)}`, x + w, y + rowH / 2, { size, color: c.red, align: 'right', weight: 900 });
    y += rowH;
  }
  if (coin.saved) {
    kit.drawText(t('results.c.saved', { n: fmtInt(coin.saved) }), x, y + rowH / 2, { size: kit.fs(12), color: c.green, maxWidth: w });
    y += rowH;
  }

  const totalK = easeOutCubic(clamp((elapsed - lineIndex * LINE_DELAY) / (LINE_COUNT_TIME + 0.3), 0, 1));
  const coinsDelta = (res.after.coins || 0) - (res.before.coins || 0);
  const dataDelta = (res.after.data || 0) - (res.before.data || 0);
  const th = Math.round(48 * L.ui);
  kit.nine('inset', x, y, w, th);
  kit.icon('coin', x + L.pad + kit.fs(10), y + th / 2, kit.fs(20), c.gold);
  kit.drawText(`${coinsDelta >= 0 ? '+' : '−'}${fmtInt(Math.abs(coinsDelta) * totalK)}`, x + L.pad + kit.fs(26), y + th / 2, { size: kit.fs(22), color: coinsDelta >= 0 ? c.gold : c.red, weight: 900, dynamic: true, shadow: 'rgba(0,0,0,0.6)' });
  kit.icon('data', x + w * 0.58, y + th / 2, kit.fs(20), c.cyan);
  kit.drawText(`+${fmtInt(dataDelta * totalK)}`, x + w * 0.58 + kit.fs(16), y + th / 2, { size: kit.fs(22), color: c.cyan, weight: 900, dynamic: true, shadow: 'rgba(0,0,0,0.6)' });
  y += th + L.gap;
  const dt = report.data;
  if (dt && dt.total) {
    const parts = [];
    if (dt.zones) parts.push(t('results.d.zones', { n: dt.zones }));
    if (dt.body) parts.push(t('results.d.body', { n: dt.body }));
    if (dt.trickle) parts.push(t('results.d.trickle', { n: dt.trickle }));
    y += kit.paragraph(parts.join(' · '), x, y, w, { size: kit.fs(11), color: c.textMute }) + L.gap * 0.5;
  }

  const news = collectNews(app, res);
  if (news.length) {
    kit.drawText(t('results.unlocked'), x, y + kit.fs(8), { size: kit.fs(12), color: c.amber });
    y += kit.fs(20);
    for (const n of news) {
      kit.icon(n.icon, x + kit.fs(9), y + rowH / 2, kit.fs(16), n.color || c.amber);
      kit.drawText(n.text, x + kit.fs(24), y + rowH / 2, { size: kit.fs(13), color: c.text, maxWidth: w - kit.fs(24) - (n.reward ? kit.fs(64) : 0) });
      if (n.reward) kit.costChip(x + w, y + rowH / 2, { coins: n.reward }, { align: 'right', size: kit.fs(12) });
      y += rowH;
    }
  }
  return y;
}

/** Три полоски «факт / допуск» для посадки: скорость, снос, наклон. Возвращает занятую высоту. */
function drawTolerances(kit, L, x, y, w, lg) {
  const c = kit.c;
  const deg = (r) => `${Math.round((r * 180) / Math.PI)}°`;
  const rows = [
    [t('results.tol.v'), lg.v, lg.vTol, fmtSpeed(lg.v), fmtSpeed(lg.vTol)],
    [t('results.tol.h'), lg.h, lg.hTol, fmtSpeed(lg.h), fmtSpeed(lg.hTol)],
    [t('results.tol.ang'), lg.ang, lg.angTol, deg(lg.ang), deg(lg.angTol)],
  ];
  const rowH = Math.round(24 * L.ui);
  rows.forEach(([label, v, tol, vs, ts], i) => {
    const yy = y + i * rowH;
    const bad = v > tol;
    kit.drawText(label, x, yy + rowH * 0.45, { size: kit.fs(11), color: c.textDim, maxWidth: w * 0.34 });
    const bar = { x: x + w * 0.36, y: yy + rowH * 0.2, w: w * 0.36, h: Math.round(rowH * 0.5) };
    kit.meter(bar, { value: clamp(v / (tol * 2), 0, 1), color: bad ? c.red : c.green });
    kit.rect(bar.x + bar.w / 2, bar.y - 2, 2, bar.h + 4, c.white);
    kit.drawText(t('results.tol.fact', { v: vs, tol: ts }), x + w, yy + rowH * 0.45, { size: kit.fs(12), color: bad ? c.red : c.text, align: 'right', weight: 900, maxWidth: w * 0.27 });
    kit.icon(bad ? 'warn' : 'check', x + w * 0.74, yy + rowH * 0.45, kit.fs(12), bad ? c.red : c.green);
  });
  return rows.length * rowH;
}

/** Награды, зоны, вехи и открывшиеся действия — по отчёту правил и разнице профилей. */
function collectNews(app, res) {
  const c = app.kit.c;
  const out = [];
  const { report, before, after } = res;
  for (const a of report.awarded?.achievements || []) out.push({ icon: 'trophy', color: c.gold, text: t('results.n.achievement', { name: a.name }), reward: a.reward });
  for (const ct of report.awarded?.contracts || []) out.push({ icon: 'contract', color: c.amber, text: t('results.n.contract', { name: ct.name }), reward: ct.reward });
  for (const z of report.newZones || []) out.push({ icon: 'altitude', color: c.cyan, text: t('results.n.zone', { name: z.name }) });
  const ms = report.milestones || {};
  if (ms.firstSoftLanding) out.push({ icon: 'check', color: c.green, text: t('results.n.firstLanding') });
  if (ms.firstMoonLanding) out.push({ icon: 'moon', color: c.cyan, text: t('results.n.moon') });
  if (ms.firstMarsLanding) out.push({ icon: 'mars', color: c.red, text: t('results.n.mars') });
  if (ms.newMaxAlt) out.push({ icon: 'up', color: c.green, text: t('results.n.record') });
  try {
    const was = app.rules.getEraState(before);
    const now = app.rules.getEraState(after);
    if (now.ok && !was.ok) out.push({ icon: 'era', color: c.amber, text: t('results.n.era') });
    const open = (p) => app.rules.availableDestinations(p).filter((d) => d.ok).map((d) => d.id);
    const old = open(before);
    for (const d of open(after)) if (!old.includes(d)) out.push({ icon: d === 'moon' ? 'moon' : 'mars', color: c.cyan, text: t('results.n.dest', { name: app.data.DESTINATIONS?.[d]?.name || d }) });
  } catch {
    /* подсказки необязательны */
  }
  return out;
}
