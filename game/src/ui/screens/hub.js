// Космодром: остров на весь экран. Тап по зданию или станции открывает щиток у самого объекта, ракета ведёт к пульту запуска.
// Интерфейс — угловые таблички, кнопки-иконки и большая кнопка «ПУСК» под защитной планкой.

import { t } from '../../i18n/index.js';
import { dockLayout, sceneArea } from '../layout.js';
import { drawChrome, eraCallout, BUILDING_KEYS } from './common.js';
import { drawBuildingCallout, worldTarget } from './building.js';
import { nextSummary } from '../next-steps.js';

const NAV = [
  { id: 'rocket', icon: 'rocket', label: 'dock.rocket' },
  { id: 'base', icon: 'base', label: 'dock.base' },
  { id: 'journal', icon: 'journal', label: 'dock.journal' },
  { id: 'shop', icon: 'cart', label: 'dock.shop' },
];
// объекты-входы острова → экраны
const ENTRY_SCREEN = { workshop: 'rocket', board: 'journal', shop: 'shop' };

function state(app) {
  return ((app.ui ||= {}).hub ||= { sel: null, era: false, cache: null });
}

/** Отметки «!» на кнопках, памятнике и подсказка о потолке эпохи пересчитываются только при смене профиля. */
function derive(app, st) {
  if (st.cache && st.cache.profile === app.profile) return st.cache;
  const sum = nextSummary(app);
  st.cache = { profile: app.profile, canPart: sum.part, canBuilding: sum.building, era: sum.era, capped: sum.capped };
  return st.cache;
}

/**
 * Отметка на памятнике эпох: переход доступен — яркая пульсирующая «!» с часами эпохи, переход близок — спокойный значок.
 * Рисуется над рамкой памятника в мире; пока щиток эпохи открыт, не нужна.
 */
function drawMonumentMark(app, kit, L, info, st) {
  const era = info.era;
  if (!era || (!era.ok && !era.near) || st.era || st.sel) return;
  const r = worldTarget(app, 'monument');
  if (!r) return;
  const u = L.ui;
  const cx = Math.round(r.x + r.w / 2);
  const bob = app.settings.reduceMotion ? 0 : Math.round(Math.sin(app.time * 4) * 3 * u);
  const cy = Math.round(r.y - 16 * u) + bob;
  if (cx < L.area.x || cx > L.area.x + L.area.w || cy < L.area.y || cy > L.area.y + L.area.h) return;
  const c = kit.c;
  if (era.ok) {
    kit.icon('era', cx, cy, Math.round(28 * u), c.amberLight);
    kit.badge(cx + Math.round(15 * u), cy - Math.round(13 * u), '!', true);
  } else {
    const ctx = kit.S.ctx;
    ctx.globalAlpha = app.settings.reduceMotion ? 0.8 : 0.6 + 0.3 * Math.sin(app.time * 2.2);
    kit.icon('era', cx, cy, Math.round(22 * u), c.amber);
    ctx.globalAlpha = 1;
  }
}

/**
 * Подсказка, когда всё куплено до потолка эпохи: что нужно для модернизации (или что переход уже доступен).
 * Стоит у памятника эпох, закрывается тапом по ней и возвращается при следующем входе в хаб.
 */
function drawEraHint(app, kit, L, info, st, bounds) {
  const era = info.era;
  if (!info.capped || !era || st.hintOff || st.sel || st.era || kit.modalOpen || app.cards.length) return;
  const c = kit.c;
  const u = L.ui;
  const w = Math.min(Math.round(300 * u), 400, L.area.w - L.gap * 2);
  const pad = L.pad;
  const size = kit.fs(12);
  const titleSize = kit.fs(13);
  const step = kit.text.lineStep(size, 1.3);
  const isz = Math.round(24 * u);
  const textW = w - pad * 2 - isz - L.gap;
  const title = era.ok ? t('hub.eraHint.ready', { year: era.year }) : t('hub.eraHint.title', { year: era.year });
  const items = era.ok ? [t('hub.eraHint.tap')] : era.missing.slice(0, 4);
  const titleLines = kit.text.wrap(title, textW, titleSize).slice(0, 2);
  const lines = items.flatMap((it) => kit.text.wrap(it, textW - Math.round(size * 1.2), size).slice(0, 2).map((ln, i) => ({ ln, first: i === 0 })));
  const titleStep = kit.text.lineStep(titleSize, 1.3);
  const h = pad * 2 + titleLines.length * titleStep + Math.round(L.gap * 0.5) + lines.length * step;
  const target = worldTarget(app, 'monument');
  const co = kit.callout('era-hint', { x: L.w / 2, y: bounds.y + bounds.h * 0.35 }, { w, h }, { target, bounds, variant: 'panel', pad });
  kit.withLayer(61, () => {
    const r = co.inner;
    kit.icon('era', r.x + isz / 2, r.y + isz / 2, isz, c.amberLight);
    let y = r.y + titleStep / 2;
    for (const ln of titleLines) {
      kit.drawText(ln, r.x + isz + L.gap, y, { size: titleSize, color: c.amberLight, shadow: true });
      y += titleStep;
    }
    y += Math.round(L.gap * 0.5) - titleStep / 2 + step / 2;
    for (const { ln, first } of lines) {
      if (first) kit.rect(r.x + isz + L.gap, Math.round(y - 1), Math.round(size * 0.5), Math.round(size * 0.5), era.ok ? c.green : c.red);
      kit.drawText(ln, r.x + isz + L.gap + Math.round(size * 1.2), y, { size, color: c.text });
      y += step;
    }
  });
  if (kit.clicked === 'callout-era-hint') st.hintOff = true;
}

function worldHit(app, x, y) {
  try {
    const res = app.renderer.hub.hitTest?.(x, y, { profile: app.profile, time: app.time, layout: app.layout });
    if (!res) return null;
    return typeof res === 'string' ? res : res.key || res.building || res.id || null;
  } catch {
    return null;
  }
}

export default {
  id: 'hub',
  background: 'hub',
  enter(app, params) {
    const st = state(app);
    st.era = false;
    st.hintOff = false;
    if (params?.select) st.sel = params.select;
    if (params?.era) {
      st.era = true;
      st.sel = null;
    }
  },
  leave(app) {
    app.hubSelected = null;
  },
  onBack(app) {
    const st = state(app);
    st.sel = null;
    st.era = false;
    return true;
  },
  draw(app, kit, L) {
    const st = state(app);
    const hub = app.renderer.hub;
    const info = derive(app, st);
    const c = kit.c;

    // камера: перетаскивание, щипок, двойной тап, колесо
    if (!kit.modalOpen) {
      if (kit.dragDx || kit.dragDy) hub.pan?.(kit.dragDx, kit.dragDy);
      if (kit.pinch) hub.zoomBy?.(kit.pinch.factor, kit.pinch.x, kit.pinch.y);
      if (kit.wheel) hub.zoomBy?.(Math.exp(-kit.wheel.dy * 0.0015), kit.wheel.x, kit.wheel.y);
      if (kit.dtap) hub.toggleZoom?.(kit.dtap.x, kit.dtap.y);
    }

    // тап по миру: здание, станция, ракета, памятник
    const tap = kit.emptyTap;
    if (tap && !kit.modalOpen && !kit.dtap) {
      const key = worldHit(app, tap.x, tap.y);
      const was = st.sel || (st.era ? 'monument' : null);
      st.sel = null;
      st.era = false;
      if (key === 'rocket') app.go('launch', {}, { push: true });
      else if (ENTRY_SCREEN[key]) app.go(ENTRY_SCREEN[key], {}, { push: true });
      else if (key === 'monument') {
        if (was !== 'monument') {
          st.era = true;
          app.sfx('press');
          hub.focus?.('monument');
        }
      } else if (key && BUILDING_KEYS.includes(key) && app.profile.buildings[key] > 0) {
        if (was !== key) {
          st.sel = key;
          app.sfx('press');
        }
      }
    }
    const sel = st.era ? 'monument' : st.sel;
    if (sel !== app.hubSelected) {
      app.hubSelected = sel;
      hub.setSelected?.(sel);
      if (sel && sel !== 'monument') hub.focus?.(sel);
    }

    const ch = drawChrome(app, kit, { era: true, gear: true, back: false, eraOpen: st.era, eraBadge: !!info.era?.ok });
    if (ch.gear) app.go('settings', {}, { push: true });
    if (ch.era) {
      st.era = !st.era;
      st.sel = null;
      if (st.era) hub.focus?.('monument');
    }

    // нижняя панель: ПУСК под защитной планкой и кнопки-иконки
    const D = dockLayout(L);
    kit.hazard(D.launch);
    kit.rect(D.launch.x, D.launch.y, D.launch.w, kit.cell(), c.ink);
    kit.rect(D.launch.x, D.launch.y + D.launch.h - kit.cell(), D.launch.w, kit.cell(), c.ink);
    kit.rect(D.launch.x, D.launch.y, kit.cell(), D.launch.h, c.ink);
    kit.rect(D.launch.x + D.launch.w - kit.cell(), D.launch.y, kit.cell(), D.launch.h, c.ink);
    kit.hit('dock-bar', D.bar, {});
    const first = app.profile.stats.flights === 0 && !st.sel && !st.era;
    const pulse = first && !app.settings.reduceMotion && Math.floor(app.time * 2.5) % 2 === 0;
    if (kit.button('dock-launch', D.button, { label: t('launch.start'), icon: 'launch', variant: pulse ? 'dangerHover' : 'danger', size: kit.fs(24), iconSize: Math.round(D.button.h * 0.46), lamp: pulse ? c.white : c.amberLight, tip: t('dock.launch.tip'), solo: true })) app.go('launch', {}, { push: true });
    for (const n of NAV) {
      const r = D.items[n.id];
      // «!» пульсирует, когда в этом разделе есть покупка, доступная прямо сейчас
      const badge = n.id === 'rocket' && info.canPart ? '!' : n.id === 'base' && info.canBuilding ? '!' : undefined;
      if (kit.button(`dock-${n.id}`, r, { icon: n.icon, label: t(n.label), stack: true, variant: 'btn', size: kit.fs(10), fixedScale: true, badge, badgePulse: true, tip: t(`${n.label}.tip`) })) app.go(n.id, {}, { push: true });
    }
    if (first && !L.portrait) {
      // подсказка первого запуска: указатель над кнопкой «ПУСК»
      const bob = Math.sin(app.time * 5) * 4;
      kit.icon('down', D.launch.x + D.launch.w / 2, D.bar.y - L.gap - 12 * L.ui + bob, Math.round(24 * L.ui), c.amber);
    }

    // щиток у выбранного объекта рисуется после нижней панели: в тесном окне он перекрывает кнопки панели, а не наоборот
    const bounds = sceneArea(L, { dock: true, back: false, era: true, gear: true });
    if (st.sel) {
      drawBuildingCallout(app, kit, st.sel, {
        target: worldTarget(app, st.sel),
        bounds,
        goto: (key) => app.go('base', { select: key }, { push: true }),
      });
    } else if (st.era) {
      eraCallout(app, kit, { id: 'era', target: worldTarget(app, 'monument'), bounds });
    }
    drawMonumentMark(app, kit, L, info, st);
    drawEraHint(app, kit, L, info, st, bounds);
  },
};
