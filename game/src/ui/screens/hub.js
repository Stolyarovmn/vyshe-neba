// Космодром: остров на весь экран. Тап по зданию или станции открывает щиток у самого объекта, ракета ведёт к пульту запуска.
// Интерфейс — угловые таблички, кнопки-иконки и большая кнопка «ПУСК» под защитной планкой.

import { t } from '../../i18n/index.js';
import { dockLayout, sceneArea } from '../layout.js';
import { drawChrome, eraCallout, BUILDING_KEYS, PART_KEYS } from './common.js';
import { drawBuildingCallout, worldTarget } from './building.js';

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

/** Значки «!» на кнопках пересчитываются только при смене профиля. */
function derive(app, st) {
  if (st.cache && st.cache.profile === app.profile) return st.cache;
  const p = app.profile;
  const canPart = PART_KEYS.some((id) => {
    const s = app.rules.getPartState(p, id);
    return s.next && !s.locked.length;
  });
  const canBuilding = BUILDING_KEYS.some((k) => {
    const s = app.rules.getBuildingState(p, k);
    return s.next && !s.locked.length;
  });
  st.cache = { profile: p, canPart, canBuilding };
  return st.cache;
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

    const ch = drawChrome(app, kit, { era: true, gear: true, back: false, eraOpen: st.era });
    if (ch.gear) app.go('settings', {}, { push: true });
    if (ch.era) {
      st.era = !st.era;
      st.sel = null;
      if (st.era) hub.focus?.('monument');
    }

    // щиток у выбранного объекта
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
      const badge = n.id === 'rocket' && info.canPart ? '!' : n.id === 'base' && info.canBuilding ? '!' : undefined;
      if (kit.button(`dock-${n.id}`, r, { icon: n.icon, label: t(n.label), stack: true, variant: 'btn', size: kit.fs(10), fixedScale: true, badge, tip: t(`${n.label}.tip`) })) app.go(n.id, {}, { push: true });
    }
    if (first && !L.portrait) {
      // подсказка первого запуска: указатель над кнопкой «ПУСК»
      const bob = Math.sin(app.time * 5) * 4;
      kit.icon('down', D.launch.x + D.launch.w / 2, D.bar.y - L.gap - 12 * L.ui + bob, Math.round(24 * L.ui), c.amber);
    }
  },
};
