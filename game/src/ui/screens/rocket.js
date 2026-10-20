// Мастерская: интерьер эпохи, ракета на подъёмнике по центру, станции вокруг. Девять модулей — физические узлы-таблички
// у своих частей ракеты; тап по узлу открывает щиток с уровнем, «было → станет», ценой и причиной блокировки.

import { t } from '../../i18n/index.js';
import { rocketLayout } from '../layout.js';
import { drawAssembly, MODULE_VIEW } from '../../render/rocket-view.js';
import { clamp } from '../format.js';
import { drawChrome, infoCallout, isFundsReason, partIcon, partShort, deltaRows, PART_KEYS } from './common.js';

const STAND = { ramp: 0.5, hold: 1.4, fall: 0.7 };
const STATION_MODULES = ['engine', 'hull', 'avionics'];

function state(app) {
  return ((app.ui ||= {}).rocket ||= { selected: null, stand: -1, flash: 0, lastLevels: null });
}

/** Показатели «было → станет» для следующего уровня модуля: описание — data.PARTS[id].statInfo. */
export function statRows(app, id) {
  const ps = app.rules.getPartState(app.profile, id);
  const infos = app.data.PARTS?.[id]?.statInfo;
  if (!ps.next || !infos) return [];
  return deltaRows(infos, ps.current, ps.next.stats).filter((r) => r.changed);
}

export default {
  id: 'rocket',
  background: 'blueprint',
  enter(app, params) {
    const st = state(app);
    st.stand = -1;
    st.selected = params?.select && PART_KEYS.includes(params.select) ? params.select : null;
  },
  leave(app) {
    app.standFrame = null;
  },
  onBack(app) {
    const st = state(app);
    if (st.selected) {
      st.selected = null;
      return true;
    }
    return false;
  },
  draw(app, kit, L, dt) {
    const st = state(app);
    const G = rocketLayout(L);
    drawChrome(app, kit, { back: true });

    // изменение уровней → вспышка на сборке
    const levels = PART_KEYS.map((k) => app.profile.parts[k]).join(',');
    if (st.lastLevels !== null && st.lastLevels !== levels) st.flash = 1;
    st.lastLevels = levels;
    st.flash = Math.max(0, st.flash - dt * 2);

    // стенд
    let thr = 0;
    if (st.stand >= 0) {
      st.stand += dt;
      const { ramp, hold, fall } = STAND;
      const s = st.stand;
      thr = s < ramp ? s / ramp : s < ramp + hold ? 1 : clamp(1 - (s - ramp - hold) / fall, 0, 1);
      if (s > ramp + hold + fall) st.stand = -1;
    }
    app.standFrame = st.stand >= 0 ? { throttle: thr } : null;

    const stations = drawScene(app, kit, L, G, st, thr);
    if (stations) {
      for (const id of STATION_MODULES) {
        const box = stations.modules?.[id];
        if (box && box.source === 'station') {
          kit.hit(`station-${id}`, box, {});
          if (kit.clicked === `station-${id}`) st.selected = st.selected === id ? null : id;
        }
      }
    }
    drawNodes(app, kit, L, G, st);

    const standOn = st.stand >= 0;
    if (kit.button('stand', G.stand, { label: t('rocket.stand'), icon: 'stand', variant: standOn ? 'good' : 'btn', size: kit.fs(13), tip: t('rocket.stand.tip'), lamp: standOn ? kit.c.amberLight : false }) && !standOn) {
      st.stand = 0;
      st.selected = null;
    }

    // тап по миру закрывает щиток
    if (kit.emptyTap && st.selected && !kit.modalOpen) st.selected = null;
    if (st.selected) drawPartCallout(app, kit, L, G, st);
  },
};

// ---------- сцена ----------

/** Станции эпохи, ракета настоящими спрайтами (render/rocket-view.js), подсветка выбранного модуля, вспышка улучшения. */
function drawScene(app, kit, L, G, st, thr) {
  const ctx = kit.S.ctx;
  const c = kit.c;
  const p = app.profile;
  const r = G.rocket;
  let stations = null;
  // станции и сборка — арт рендера (свечение пламени и т. п.), а не слой интерфейса: тест-страж их не считает
  app.uiDrawing = false;
  try {
    if (app.backdropOn && app.renderer.workshop?.drawStations) {
      try {
        stations = app.renderer.workshop.drawStations(ctx, { era: p.era, rect: G.schematic, time: app.time, rocket: r });
      } catch (err) {
        console.warn('[rocket] drawStations:', err);
      }
    }
    const shake = thr > 0 && !app.settings.reduceMotion ? Math.sin(app.time * 90) * thr * 1.2 : 0;
    drawAssembly(ctx, app.renderer.painter, {
      era: p.era,
      parts: p.parts,
      skin: p.skin,
      cx: r.x + r.w / 2 + shake,
      bottom: r.y + r.h,
      height: r.h,
      dpr: L.dpr,
      time: app.time,
      throttle: thr,
    });
  } finally {
    app.uiDrawing = true;
  }

  // выбранный модуль: мигающие пиксельные уголки вокруг его области на сборке
  const view = st.selected ? MODULE_VIEW[st.selected] : null;
  if (view) {
    const cc = kit.cell();
    const on = app.settings.reduceMotion || Math.floor(app.time * 4) % 2 === 0;
    const pad = cc * 3;
    const x0 = Math.round(r.x - pad);
    const x1 = Math.round(r.x + r.w + pad);
    const y0 = Math.round(r.y + view.region[0] * r.h - pad);
    const y1 = Math.round(r.y + view.region[1] * r.h + pad);
    const arm = Math.max(cc * 4, Math.round(Math.min(x1 - x0, y1 - y0) * 0.28));
    const col = on ? c.amberLight : c.amber;
    for (const [px, py, sx, sy] of [[x0, y0, 1, 1], [x1, y0, -1, 1], [x0, y1, 1, -1], [x1, y1, -1, -1]]) {
      kit.rect(sx > 0 ? px : px - arm, sy > 0 ? py : py - cc, arm, cc, col);
      kit.rect(sx > 0 ? px : px - cc, sy > 0 ? py : py - arm, cc, arm, col);
    }
  }
  if (st.flash > 0) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = st.flash * 0.5;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(r.x - 4, r.y, r.w + 8, r.h);
    ctx.restore();
  }
  return stations;
}

// ---------- узлы-таблички ----------

function drawNodes(app, kit, L, G, st) {
  const c = kit.c;
  const p = app.profile;
  const cc = kit.cell();
  const cx = G.rocket.x + G.rocket.w / 2;
  for (const id of PART_KEYS) {
    const r = G.spots[id];
    if (!r) continue;
    const ps = app.rules.getPartState(p, id);
    const on = st.selected === id;
    const upgradable = ps.next && !ps.locked.length;
    const lockedReq = ps.next && ps.locked.some((x) => !isFundsReason(x));
    // пунктирная линия-выноска от узла к детали
    const mark = { x: cx + r.side * G.rocket.w * 0.3, y: G.rocket.y + MODULE_VIEW[id].tAnchor * G.rocket.h };
    kit.line(r.side < 0 ? r.x + r.w : r.x, r.y + r.h / 2, mark.x, mark.y, on ? c.amber : c.steel2, { dash: true });
    kit.rect(Math.round(mark.x - cc), Math.round(mark.y - cc), cc * 2, cc * 2, on ? c.amberLight : c.steel3);

    const clicked = kit.button(`part-${id}`, r, { variant: on ? 'cardOn' : 'card', iconSize: Math.round(r.w * 0.52), icon: partIcon(id), tip: partShort(app, id), badge: upgradable ? '!' : undefined, iconColor: ps.level ? c.text : c.textMute });
    if (clicked) st.selected = on ? null : id;
    const n = ps.level ? String(ps.level) : '–';
    kit.drawText(n, r.x + r.w / 2, r.y + r.h - cc * 5, { size: kit.fs(11), color: ps.level ? c.amberLight : c.textMute, align: 'center', shadow: true });
    if (lockedReq) kit.icon('lock', r.x + cc * 5, r.y + cc * 5, Math.round(12 * L.ui), c.amber);
  }
}

// ---------- щиток модуля ----------

function drawPartCallout(app, kit, L, G, st) {
  const id = st.selected;
  const p = app.profile;
  const ps = app.rules.getPartState(p, id);
  const r = G.spots[id];
  infoCallout(app, kit, {
    id: `part-${id}`,
    target: r,
    bounds: G.schematic,
    side: L.portrait ? undefined : r.side < 0 ? 'left' : 'right',
    name: partShort(app, id),
    iconName: partIcon(id),
    iconAlpha: ps.level ? 1 : 0.7,
    level: ps.level,
    max: ps.max,
    cap: ps.cap,
    rows: statRows(app, id),
    locks: ps.locked,
    goto: (key) => app.go('base', { select: key }, { push: true }),
    next: ps.next ? true : false,
    cost: ps.next ? { coins: ps.next.cost, data: ps.next.data } : null,
    canBuy: ps.next && ps.locked.length === 0,
    buyLabel: ps.level ? t('card.upgrade') : t('card.install'),
    buyId: `buy-${id}`,
    onBuy: () => {
      const res = app.buyPart(id);
      if (!res.ok) {
        kit.toast(t('card.cannot'), { kind: 'bad' });
        return;
      }
      kit.toast(t('rocket.done', { name: partShort(app, id) }), { kind: 'good', icon: partIcon(id) });
      kit.spawnSparks(r.x + r.w / 2, r.y + r.h / 2, kit.c.amberLight);
    },
  });
}
