// База: блок энергии, список построек карточками (спрайт здания по эпохе, уровень, эффект, цена, причина блокировки),
// карточка выбранной постройки с «было → станет» и кнопкой «Показать на острове», вкладка «Эпохи» с модернизацией.
// Остров рисует хаб; здесь карты нет.

import { t } from '../../i18n/index.js';
import { screenFrame, baseLayout } from '../layout.js';
import { fmtInt } from '../format.js';
import {
  drawHeader, drawBuildingCard, buildingIcon, buildingName, eraName, eraDesc, deltaRows, levelPips, BUILDING_KEYS, isFundsReason, ERA_YEARS,
} from './common.js';

function state(app) {
  return ((app.ui ||= {}).base ||= { tab: 'build', selected: null });
}

/** Показать постройку на острове: хаб открывается с карточкой, камера наводится через renderer.hub.focus. */
function showOnIsland(app, key) {
  app.history.length = 0;
  app.go('hub', { select: key });
  app.renderer.hub.focus?.(key);
}

export default {
  id: 'base',
  background: 'blueprint',
  enter(app, params) {
    const st = state(app);
    if (params?.tab) st.tab = params.tab === 'era' ? 'era' : 'build';
    if (params?.select) {
      st.tab = 'build';
      st.selected = params.select;
    }
  },
  onBack(app) {
    const st = state(app);
    if (st.selected && app.layout.portrait) {
      st.selected = null;
      return true;
    }
    return false;
  },
  draw(app, kit, L) {
    const st = state(app);
    const F = screenFrame(L, { header: true });
    const G = baseLayout(L);
    drawHeader(app, kit, F.header, { back: true, title: t('base.title') });
    drawEnergy(app, kit, L, G.energy);

    const tab = kit.tabs('base-tabs', G.tabs, [
      { id: 'build', label: t('base.tab.build'), icon: 'building' },
      { id: 'era', label: t('base.tab.era'), icon: 'era' },
    ], st.tab);
    if (tab !== st.tab) {
      st.tab = tab;
      st.selected = null;
    }

    if (st.tab === 'era') {
      drawEras(app, kit, L, G.wide ? G.full : G.list);
      return;
    }
    const opts = { close: true, goto: null, onShow: (key) => showOnIsland(app, key) };
    if (G.wide) {
      drawBuildList(app, kit, L, G.list, st);
      if (st.selected) {
        if (drawBuildingCard(app, kit, G.detail, st.selected, opts)) st.selected = null;
      } else drawHint(kit, L, G.detail);
    } else if (st.selected) {
      if (drawBuildingCard(app, kit, G.detail, st.selected, opts)) st.selected = null;
    } else drawBuildList(app, kit, L, G.list, st);
  },
};

// ---------- энергия ----------

function drawEnergy(app, kit, L, r) {
  const c = kit.c;
  const pb = app.rules.powerBalance(app.profile);
  const low = pb.ratio < 1;
  kit.nine('inset', r.x, r.y, r.w, r.h);
  kit.hit('base-energy', r, {});
  const pad = L.pad;
  kit.icon('bolt', r.x + pad + 14 * L.ui, r.y + r.h / 2, Math.round(28 * L.ui), low ? c.red : c.green);
  const tx = r.x + pad * 2 + 28 * L.ui;
  const meterH = Math.round(14 * L.ui);
  kit.drawText(t('base.power', { use: Math.round(pb.demand), supply: Math.round(pb.supply) }), tx, r.y + r.h * 0.32, { size: kit.fs(13), color: low ? c.red : c.green, maxWidth: r.x + r.w - tx - pad });
  kit.meter({ x: tx, y: r.y + r.h * 0.55, w: r.x + r.w - tx - pad, h: meterH }, { value: pb.demand ? pb.supply / Math.max(pb.supply, pb.demand) : 1, color: low ? c.red : c.green, segments: 14 });
  if (low) kit.drawText(t('base.powerLow', { pct: Math.round((1 - pb.ratio) * 100) }), r.x + r.w - pad, r.y + r.h * 0.32, { size: kit.fs(11), color: c.red, align: 'right', maxWidth: r.w * 0.5 });
}

function drawHint(kit, L, r) {
  kit.nine('panel', r.x, r.y, r.w, r.h);
  kit.hit('base-hint', r, {});
  kit.icon('building', r.x + r.w / 2, r.y + r.h * 0.4, Math.round(72 * L.ui), kit.c.textMute, 0.5);
  kit.paragraph(t('base.pick'), r.x + L.pad, r.y + r.h * 0.4 + 56 * L.ui, r.w - L.pad * 2, { size: kit.fs(14), color: kit.c.textMute, align: 'center' });
}

// ---------- список построек ----------

/** Короткая строка эффекта для карточки: текущий эффект, а у не построенной — что даст первый уровень. */
function effectLine(app, key, bs) {
  const infos = app.data.BUILDINGS?.[key]?.effectInfo || [];
  const rows = deltaRows(infos, bs.effects, bs.next ? bs.next.effects : bs.effects);
  const row = rows.find((x) => x.after > 0) || rows[0];
  if (!row) return '';
  return bs.level > 0 ? `${row.label.split(',')[0]}: ${row.fmt(row.before)}` : `${row.label.split(',')[0]} ${row.fmt(row.after)}`;
}

function drawBuildList(app, kit, L, r, st) {
  const c = kit.c;
  const p = app.profile;
  kit.nine('panel', r.x, r.y, r.w, r.h);
  const inner = { x: r.x + L.px * 2, y: r.y + L.px * 2, w: r.w - L.px * 4, h: r.h - L.px * 4 };
  const rowH = Math.round(Math.max(76 * L.ui, L.touch(76)));
  kit.scrollList('base-list', inner, {
    count: BUILDING_KEYS.length,
    itemH: rowH,
    gap: L.gap * 0.6,
    draw: (i, ir) => {
      const key = BUILDING_KEYS[i];
      const bs = app.rules.getBuildingState(p, key);
      const avail = bs.next && !bs.locked.length;
      const hard = bs.locked.find((x) => !isFundsReason(x));
      const built = bs.level > 0;
      const on = st.selected === key;
      if (kit.button(`bld-${key}`, ir, { variant: on ? 'cardOn' : built ? 'raised' : 'card', align: 'left' })) st.selected = key;
      const pad = L.px * 3;
      const sprite = Math.round(ir.h * 0.78);
      kit.icon(buildingIcon(key, built ? bs.level : 1), ir.x + pad + sprite / 2, ir.y + ir.h / 2, sprite, c.text, built ? 1 : 0.5);
      const tx = ir.x + pad + sprite + L.gap;
      const lvW = Math.round(64 * L.ui);
      const maxW = ir.w - (tx - ir.x) - lvW - pad;
      kit.drawText(buildingName(app, key), tx, ir.y + ir.h * 0.27, { size: kit.fs(14), color: built ? c.text : c.textDim, maxWidth: maxW + lvW * 0.5 });
      levelPips(kit, { x: tx, y: ir.y + ir.h * 0.46, w: Math.min(maxW, 110 * L.ui), h: Math.round(5 * L.ui) }, bs.level, bs.max, bs.cap);
      const line = effectLine(app, key, bs);
      if (bs.next && !hard) {
        kit.costChip(tx, ir.y + ir.h * 0.78, { coins: bs.next.cost, data: bs.next.data }, { have: { coins: p.coins, data: p.data }, size: kit.fs(12) });
      } else kit.drawText(!bs.next ? t('card.maxed') : app.reasonText(hard), tx, ir.y + ir.h * 0.78, { size: kit.fs(11), color: !bs.next ? c.green : c.red, maxWidth: maxW + lvW * 0.6 });
      if (line && L.w > 420) kit.drawText(line, ir.x + ir.w - pad, ir.y + ir.h * 0.78, { size: kit.fs(11), color: c.textMute, align: 'right', maxWidth: ir.w * 0.34 });
      kit.drawText(built ? t('base.row.lvl', { n: bs.level }) : t('base.row.none'), ir.x + ir.w - pad, ir.y + ir.h * 0.27, { size: kit.fs(13), color: built ? c.amber : c.textMute, align: 'right', weight: 900 });
      if (avail) kit.icon('up', ir.x + ir.w - pad - kit.fs(7), ir.y + ir.h * 0.5, kit.fs(14), c.green);
    },
  });
}

// ---------- эпохи ----------

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

function drawEras(app, kit, L, r) {
  const c = kit.c;
  const p = app.profile;
  kit.nine('panel', r.x, r.y, r.w, r.h);
  const inner = { x: r.x + L.px * 2, y: r.y + L.px * 2, w: r.w - L.px * 4, h: r.h - L.px * 4 };
  const es = app.rules.getEraState(p);
  const conds = eraConditions(es);
  const size = kit.fs(13);
  kit.scrollArea('base-eras', inner, undefined, (top) => {
    let y = top;
    const nodeH = Math.round(66 * L.ui);
    for (let i = 0; i < 6; i++) {
      const done = i < p.era;
      const now = i === p.era;
      const nx = inner.x + Math.round(20 * L.ui);
      if (i < 5) kit.rect(nx - 1, y + nodeH / 2, 3, nodeH + L.gap, done ? c.amber : c.line);
      const dot = Math.round(22 * L.ui);
      kit.nine(now ? 'cardOn' : done ? 'primary' : 'card', nx - dot / 2, y + nodeH / 2 - dot / 2, dot, dot, Math.max(1, Math.round(L.px / 2)));
      if (done) kit.icon('check', nx, y + nodeH / 2, dot * 0.7, c.textDark);
      const tx = nx + dot / 2 + L.gap * 1.5;
      kit.drawText(String(ERA_YEARS[i]), tx, y + nodeH * 0.3, { size: kit.fs(17), color: now ? c.amber : done ? c.text : c.textMute, weight: 900 });
      kit.drawText(eraName(app, i), tx + Math.round(52 * L.ui), y + nodeH * 0.3, { size: kit.fs(13), color: now ? c.text : c.textDim, maxWidth: inner.w - (tx - inner.x) - Math.round(60 * L.ui) });
      kit.drawText(eraDesc(app, i), tx, y + nodeH * 0.56, { size: kit.fs(11), color: c.textMute, maxWidth: inner.w - (tx - inner.x) - L.gap });
      const ms = i >= p.era ? app.data.ERAS?.[i]?.advance?.milestone?.text : null;
      if (ms) kit.drawText(t('era.milestone', { text: ms }), tx, y + nodeH * 0.84, { size: kit.fs(11), color: i === p.era ? c.cyan : c.textMute, maxWidth: inner.w - (tx - inner.x) - L.gap });
      y += nodeH + L.gap;
      if (now && es.next) {
        const cardX = inner.x + L.gap;
        const cardW = inner.w - L.gap * 2 - L.px * 3;
        const rowH = Math.round(30 * L.ui);
        const cardH = Math.round(40 * L.ui) + conds.length * rowH + L.touch(56) + L.gap * 2;
        kit.nine('raised', cardX, y, cardW, cardH);
        kit.drawText(t('era.upgrade', { year: es.next.year }), cardX + L.pad, y + Math.round(22 * L.ui), { size: kit.fs(14), color: c.amber, maxWidth: cardW - L.pad * 2 });
        let cy = y + Math.round(40 * L.ui);
        for (const cd of conds) {
          const icon = cd.ok ? 'check' : cd.kind === 'coins' ? 'coin' : cd.kind === 'data' ? 'data' : cd.kind === 'buildings' ? 'building' : 'target';
          kit.icon(icon, cardX + L.pad + size * 0.6, cy + rowH / 2, size * 1.3, cd.ok ? c.green : c.red);
          const text = cd.kind === 'coins' || cd.kind === 'data' ? t(`era.cond.${cd.kind}`, { have: fmtInt(cd.have), need: fmtInt(cd.need) })
            : cd.kind === 'buildings' ? t('era.cond.buildings', { have: cd.have, need: cd.need, level: cd.level })
            : cd.text || cd.kind;
          kit.drawText(text, cardX + L.pad + size * 1.8, cy + rowH / 2, { size, color: cd.ok ? c.text : c.textDim, maxWidth: cardW - L.pad * 2 - size * 1.8 });
          cy += rowH;
        }
        cy += L.gap;
        if (kit.button('era-advance', { x: cardX + L.pad, y: cy, w: cardW - L.pad * 2, h: L.touch(56) }, { label: t('era.advance'), variant: 'primary', disabled: !es.ok, icon: 'era', size: kit.fs(16), sub: es.ok ? undefined : t('card.locked') })) {
          const res = app.advanceEra();
          if (res.ok) kit.toast(t('era.done', { year: ERA_YEARS[res.profile.era] }), { kind: 'good', icon: 'era' });
        }
        y += cardH + L.gap;
      }
    }
    return y - top + L.gap;
  });
}
