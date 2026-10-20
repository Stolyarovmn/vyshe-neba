// База: карта острова с зонами и якорями, баланс энергии, список построек и дерево эпох с модернизацией.

import { t } from '../../i18n/index.js';
import { screenFrame, baseLayout, assignLanes } from '../layout.js';
import { clamp, fmtInt } from '../format.js';
import { drawHeader, drawBuildingCard, buildingIcon, buildingName, eraName, eraDesc, BUILDING_KEYS, isFundsReason, ERA_YEARS } from './common.js';

// Якоря и зоны острова из art/placeables/BASE_ISLAND_LAYOUT.json
const ANCHORS = {
  beacons: { x: 0, y: 4, zone: 'launch_core' }, gantry: { x: 150, y: 12, zone: 'launch_core' }, deluge: { x: 235, y: 8, zone: 'launch_core' },
  service: { x: 335, y: 12, zone: 'service_central' }, rescue: { x: 445, y: 14, zone: 'service_central' }, fuel: { x: 560, y: 16, zone: 'fuel_east' },
  logistics: { x: 685, y: 12, zone: 'logistics_east' }, factory: { x: 815, y: 16, zone: 'industrial_east' }, weather: { x: 760, y: 92, zone: 'command_north' },
  control: { x: 905, y: 78, zone: 'command_north' }, radar: { x: 1035, y: 96, zone: 'command_north' }, energy: { x: 1085, y: 30, zone: 'utility_east' },
  observation: { x: 1180, y: 102, zone: 'perimeter_east' }, recovery: { x: 1210, y: 14, zone: 'recovery_east' },
};
const ZONE_ORDER = ['launch_core', 'service_central', 'fuel_east', 'logistics_east', 'industrial_east', 'command_north', 'utility_east', 'perimeter_east', 'recovery_east'];
const WORLD_MIN = -150;
const WORLD_MAX = 1300;

function state(app) {
  return ((app.ui ||= {}).base ||= { tab: 'build', selected: null });
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
    if (st.selected) {
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
    drawMap(app, kit, L, G.map, st);

    const tab = kit.tabs('base-tabs', G.tabs, [
      { id: 'build', label: t('base.tab.build'), icon: 'building' },
      { id: 'era', label: t('base.tab.era'), icon: 'era' },
    ], st.tab);
    if (tab !== st.tab) {
      st.tab = tab;
      st.selected = null;
    }
    if (st.tab === 'build') {
      if (st.selected) {
        if (drawBuildingCard(app, kit, G.list, st.selected, { close: true, goto: null })) st.selected = null;
      } else drawBuildList(app, kit, L, G.list, st);
    } else drawEras(app, kit, L, G.list);
  },
};

// ---------- карта ----------

function drawMap(app, kit, L, r, st) {
  const c = kit.c;
  const ctx = kit.S.ctx;
  const p = app.profile;
  kit.nine('inset', r.x, r.y, r.w, r.h);
  kit.hit('map-bg', r, {});
  const pad = L.pad;
  const area = { x: r.x + pad, y: r.y + pad, w: r.w - pad * 2, h: r.h - pad * 2 };

  // баланс мощности
  const pb = app.rules.powerBalance ? app.rules.powerBalance(p) : { supply: 0, demand: 0, ratio: 1 };
  const meterH = Math.round(16 * L.ui);
  const labelW = Math.round(150 * L.ui);
  kit.icon('bolt', area.x + meterH * 0.6, area.y + meterH / 2, Math.round(meterH * 1.2), pb.ratio < 1 ? c.red : c.green);
  kit.meter({ x: area.x + meterH * 1.4, y: area.y, w: area.w - meterH * 1.4 - labelW, h: meterH }, { value: pb.demand ? pb.supply / Math.max(pb.supply, pb.demand) : 1, color: pb.ratio < 1 ? c.red : c.green, segments: 12 });
  kit.drawText(t('base.power', { use: Math.round(pb.demand), supply: Math.round(pb.supply) }), area.x + area.w, area.y + meterH / 2, { size: kit.fs(12), color: pb.ratio < 1 ? c.red : c.green, align: 'right', maxWidth: labelW - L.gap });
  if (pb.ratio < 1) kit.drawText(t('base.powerLow', { pct: Math.round((1 - pb.ratio) * 100) }), area.x, area.y + meterH + kit.fs(10), { size: kit.fs(11), color: c.red, maxWidth: area.w });

  // остров (рисуется внутри рамки карты)
  kit.pushClip({ x: r.x + 2, y: r.y + 2, w: r.w - 4, h: r.h - 4 });
  const mapTop = area.y + meterH + kit.fs(24);
  const groundY = area.y + area.h - Math.round(30 * L.ui);
  const scale = area.w / (WORLD_MAX - WORLD_MIN);
  const sx = (wx) => area.x + (wx - WORLD_MIN) * scale;
  ctx.fillStyle = '#17304f';
  ctx.fillRect(r.x + 2, groundY + Math.round(14 * L.ui), r.w - 4, r.y + r.h - groundY - Math.round(14 * L.ui) - 2);
  ctx.fillStyle = '#c8b27a';
  ctx.fillRect(sx(-330), groundY, (1650 - 330 + 330 > 0 ? (1320 + 330) : 0) * scale, Math.round(14 * L.ui));
  ctx.fillStyle = '#5a8a3c';
  ctx.fillRect(sx(-330), groundY, (1320 + 330) * scale, Math.max(2, Math.round(4 * L.ui)));
  // зоны
  const zoneSpans = {};
  for (const [key, a] of Object.entries(ANCHORS)) {
    const z = (zoneSpans[a.zone] ||= { min: a.x, max: a.x });
    z.min = Math.min(z.min, a.x);
    z.max = Math.max(z.max, a.x);
  }
  ZONE_ORDER.forEach((zone, i) => {
    const z = zoneSpans[zone];
    if (!z) return;
    const x0 = sx(z.min - 40);
    const x1 = sx(z.max + 40);
    ctx.fillStyle = i % 2 ? 'rgba(82,216,255,0.10)' : 'rgba(255,182,39,0.10)';
    ctx.fillRect(x0, groundY - Math.round(8 * L.ui), x1 - x0, Math.round(22 * L.ui));
  });
  // стартовый стол
  ctx.fillStyle = '#8c929c';
  ctx.fillRect(sx(-50), groundY - 3, 100 * scale, 5);
  ctx.fillStyle = '#e8e8ee';
  ctx.fillRect(sx(0) - 2, groundY - Math.round(26 * L.ui), 4, Math.round(24 * L.ui));
  ctx.fillStyle = '#d33';
  ctx.fillRect(sx(0) - 2, groundY - Math.round(30 * L.ui), 4, 4);
  kit.popClip();

  // маркеры
  const size = L.touch(48);
  const lanes = L.portrait ? 3 : 3;
  const items = BUILDING_KEYS.map((key) => ({ key, x: sx(ANCHORS[key].x) }));
  const laneOf = assignLanes(items, size, lanes);
  const laneGap = size + 2;
  const pbRatio = pb.ratio;
  for (const it of items) {
    const key = it.key;
    const bs = app.rules.getBuildingState(p, key);
    const lane = laneOf[key];
    const mx = clamp(it.x, area.x + size / 2, area.x + area.w - size / 2);
    const my = groundY - Math.round(8 * L.ui) - size - lane * laneGap;
    const built = bs.level > 0;
    const avail = bs.next && !bs.locked.length;
    const lockedHard = bs.next && bs.locked.some((x) => !isFundsReason(x));
    const on = st.selected === key;
    ctx.strokeStyle = on ? c.amber : 'rgba(138,151,181,0.4)';
    ctx.lineWidth = Math.max(1, Math.round(L.px / 2));
    ctx.setLineDash([L.px, L.px]);
    ctx.beginPath();
    ctx.moveTo(it.x, my + size);
    ctx.lineTo(it.x, groundY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = built ? c.amber : c.textMute;
    ctx.fillRect(Math.round(it.x) - 2, groundY - 2, 5, 5);
    const rect = { x: Math.round(mx - size / 2), y: my, w: size, h: size };
    const clicked = kit.button(`map-${key}`, rect, {
      icon: buildingIcon(key),
      variant: on ? 'cardOn' : built ? 'raised' : 'card',
      iconSize: Math.round(size * 0.52),
      iconColor: built ? (pbRatio < 1 ? c.red : c.text) : c.textMute,
      tip: buildingName(app, key),
      badge: avail ? '!' : undefined,
    });
    if (built) kit.drawText(String(bs.level), rect.x + rect.w - L.px * 3, rect.y + rect.h - Math.round(8 * L.ui), { size: kit.fs(11), color: c.amber, align: 'right', weight: 900, shadow: 'rgba(0,0,0,0.9)' });
    else if (lockedHard) kit.icon('lock', rect.x + rect.w - 9 * L.ui, rect.y + rect.h - 9 * L.ui, Math.round(12 * L.ui), c.amber);
    if (clicked) {
      st.selected = key;
      st.tab = 'build';
    }
  }
}

// ---------- список построек ----------

function drawBuildList(app, kit, L, r, st) {
  const c = kit.c;
  const p = app.profile;
  kit.nine('panel', r.x, r.y, r.w, r.h);
  const inner = { x: r.x + L.px * 2, y: r.y + L.px * 2, w: r.w - L.px * 4, h: r.h - L.px * 4 };
  const rowH = L.touch(60);
  kit.scrollList('base-list', inner, {
    count: BUILDING_KEYS.length,
    itemH: rowH,
    gap: L.gap * 0.6,
    draw: (i, ir) => {
      const key = BUILDING_KEYS[i];
      const bs = app.rules.getBuildingState(p, key);
      const avail = bs.next && !bs.locked.length;
      const hard = bs.locked.find((x) => !isFundsReason(x));
      const hasLevel = bs.level > 0;
      if (kit.button(`bld-${key}`, ir, { variant: hasLevel ? 'raised' : 'card', align: 'left' })) st.selected = key;
      const pad = L.px * 3;
      kit.icon(buildingIcon(key), ir.x + pad + rowH * 0.3, ir.y + ir.h / 2 - L.px, Math.round(rowH * 0.5), hasLevel ? c.text : c.textMute);
      const tx = ir.x + pad + rowH * 0.7 + L.gap;
      const maxW = ir.w - (tx - ir.x) - Math.round(76 * L.ui);
      kit.drawText(buildingName(app, key), tx, ir.y + ir.h * 0.34, { size: kit.fs(14), color: hasLevel ? c.text : c.textDim, maxWidth: maxW });
      const sub = !bs.next ? t('card.maxed') : hard ? app.reasonText(hard) : t('base.row.cost');
      const subColor = !bs.next ? c.green : hard ? c.red : c.textMute;
      if (bs.next && !hard) {
        kit.costChip(tx, ir.y + ir.h * 0.7, { coins: bs.next.cost, data: bs.next.data }, { have: { coins: p.coins, data: p.data }, size: kit.fs(12) });
      } else kit.drawText(sub, tx, ir.y + ir.h * 0.7, { size: kit.fs(11), color: subColor, maxWidth: maxW });
      const lvText = hasLevel ? t('base.row.lvl', { n: bs.level }) : t('base.row.none');
      kit.drawText(lvText, ir.x + ir.w - pad, ir.y + ir.h * 0.34, { size: kit.fs(13), color: hasLevel ? c.amber : c.textMute, align: 'right', weight: 900 });
      if (avail) kit.icon('up', ir.x + ir.w - pad - kit.fs(8), ir.y + ir.h * 0.7, kit.fs(14), c.green);
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
    const nodeH = Math.round(54 * L.ui);
    for (let i = 0; i < 6; i++) {
      const done = i < p.era;
      const now = i === p.era;
      const nx = inner.x + Math.round(20 * L.ui);
      // линия времени
      if (i < 5) kit.rect(nx - 1, y + nodeH / 2, 3, nodeH + L.gap, done ? c.amber : c.line);
      const dot = Math.round(22 * L.ui);
      kit.nine(now ? 'cardOn' : done ? 'primary' : 'card', nx - dot / 2, y + nodeH / 2 - dot / 2, dot, dot, Math.max(1, Math.round(L.px / 2)));
      if (done) kit.icon('check', nx, y + nodeH / 2, dot * 0.7, c.textDark);
      const tx = nx + dot / 2 + L.gap * 1.5;
      kit.drawText(String(ERA_YEARS[i]), tx, y + nodeH * 0.3, { size: kit.fs(17), color: now ? c.amber : done ? c.text : c.textMute, weight: 900 });
      kit.drawText(eraName(app, i), tx + Math.round(52 * L.ui), y + nodeH * 0.3, { size: kit.fs(13), color: now ? c.text : c.textDim, maxWidth: inner.w - (tx - inner.x) - Math.round(60 * L.ui) });
      kit.drawText(eraDesc(app, i), tx, y + nodeH * 0.72, { size: kit.fs(11), color: c.textMute, maxWidth: inner.w - (tx - inner.x) - L.gap });
      y += nodeH + L.gap;
      if (now && es.next) {
        // карточка перехода
        const cardX = inner.x + L.gap;
        const cardW = inner.w - L.gap * 2 - L.px * 3;
        const lines = conds.length;
        const rowH = Math.round(30 * L.ui);
        const cardH = Math.round(40 * L.ui) + lines * rowH + L.touch(56) + L.gap * 2;
        kit.nine('raised', cardX, y, cardW, cardH);
        kit.drawText(t('era.upgrade', { year: es.next.year }), cardX + L.pad, y + Math.round(22 * L.ui), { size: kit.fs(14), color: c.amber, maxWidth: cardW - L.pad * 2 });
        let cy = y + Math.round(40 * L.ui);
        for (const cd of conds) {
          const icon = cd.ok ? 'check' : cd.kind === 'coins' ? 'coin' : cd.kind === 'data' ? 'data' : cd.kind === 'buildings' ? 'building' : 'target';
          kit.icon(icon, cardX + L.pad + size * 0.6, cy + rowH / 2, size * 1.2, cd.ok ? c.green : c.red);
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

export const _test = { ANCHORS };
