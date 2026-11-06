// Строительство: тот же остров, что в хабе, и стойка плиток-зданий снизу. Тап по плитке или по построенному зданию открывает щиток
// у объекта (цена, «было → станет», условия, кнопка). Энергия — стрелочный индикатор на табличке, эпоха — щиток Памятника.

import { t } from '../../i18n/index.js';
import { baseLayout, sceneArea, bottom } from '../layout.js';
import { drawChrome, drawEnergyPlate, eraCallout, buildingIcon, buildingShort, isFundsReason, BUILDING_KEYS } from './common.js';
import { drawBuildingCallout, worldTarget } from './building.js';

export { eraConditions } from './common.js';

function state(app) {
  return ((app.ui ||= {}).base ||= { sel: null, era: false });
}

export default {
  id: 'base',
  background: 'hub',
  enter(app, params) {
    const st = state(app);
    st.era = false;
    st.sel = null;
    if (params?.select) st.sel = params.select;
    if (params?.tab === 'era') st.era = true;
    if (st.sel && app.profile.buildings[st.sel] > 0) app.renderer.hub.focus?.(st.sel);
  },
  leave(app) {
    app.hubSelected = null;
  },
  onBack(app) {
    const st = state(app);
    if (st.sel || st.era) {
      st.sel = null;
      st.era = false;
      return true;
    }
    return false;
  },
  draw(app, kit, L) {
    const st = state(app);
    const hub = app.renderer.hub;
    const G = baseLayout(L);
    const c = kit.c;
    const p = app.profile;

    if (!kit.modalOpen) {
      if (kit.dragDx || kit.dragDy) hub.pan?.(kit.dragDx, kit.dragDy);
      if (kit.pinch) hub.zoomBy?.(kit.pinch.factor, kit.pinch.x, kit.pinch.y);
      if (kit.wheel) hub.zoomBy?.(Math.exp(-kit.wheel.dy * 0.0015), kit.wheel.x, kit.wheel.y);
      if (kit.dtap) hub.toggleZoom?.(kit.dtap.x, kit.dtap.y);
    }
    // тап по миру: построенное здание или памятник; пустое место закрывает щиток
    const tap = kit.emptyTap;
    if (tap && !kit.modalOpen && !kit.dtap) {
      let key = null;
      try {
        key = hub.hitTest?.(tap.x, tap.y) || null;
      } catch {
        key = null;
      }
      const was = st.sel;
      st.sel = null;
      st.era = false;
      if (key === 'monument') st.era = true;
      else if (key && BUILDING_KEYS.includes(key) && p.buildings[key] > 0 && was !== key) st.sel = key;
    }
    const selected = st.era ? 'monument' : st.sel && p.buildings[st.sel] > 0 ? st.sel : null;
    if (selected !== app.hubSelected) {
      app.hubSelected = selected;
      hub.setSelected?.(selected);
      if (selected && selected !== 'monument') hub.focus?.(selected);
    }

    const ch = drawChrome(app, kit, { back: true, era: true, eraOpen: st.era });
    if (ch.era) {
      st.era = !st.era;
      st.sel = null;
    }
    drawEnergyPlate(app, kit, G.energy);

    // стойка плиток-зданий
    kit.nine('panel', G.rack.x, G.rack.y, G.rack.w, G.rack.h);
    kit.hit('base-rack', G.rack, {});
    const cc = kit.cell();
    BUILDING_KEYS.forEach((key, i) => {
      const r = G.tiles[i];
      const bs = app.rules.getBuildingState(p, key);
      const avail = bs.next && !bs.locked.length;
      const hard = bs.next && bs.locked.some((x) => !isFundsReason(x));
      const built = bs.level > 0;
      const on = st.sel === key;
      const clicked = kit.button(`bld-${key}`, r, { variant: on ? 'cardOn' : built ? 'raised' : 'card', icon: buildingIcon(key, built ? bs.level : 1), iconSize: Math.round(r.w * 0.6), iconColor: built ? c.text : c.textMute, badge: avail ? '!' : undefined, badgePulse: true, tip: buildingShort(app, key) });
      if (clicked) {
        st.sel = on ? null : key;
        st.era = false;
      }
      kit.drawText(built ? String(bs.level) : '–', r.x + r.w - cc * 4, r.y + r.h - cc * 5, { size: kit.fs(11), color: kit.readable(built ? c.amberLight : c.textMute, kit.frameMid(on ? 'cardOn' : built ? 'raised' : 'card')), align: 'right', shadow: true });
      if (hard) kit.icon('lock', r.x + cc * 5, r.y + cc * 5, Math.round(12 * L.ui), c.amber);
    });

    // щиток
    const area = sceneArea(L, { dock: false, back: true, era: true });
    const bounds = { x: area.x, y: area.y, w: area.w, h: Math.max(0, G.rack.y - L.gap - area.y) };
    if (st.sel) {
      const tile = G.tiles[BUILDING_KEYS.indexOf(st.sel)];
      const world = p.buildings[st.sel] > 0 ? worldTarget(app, st.sel) : null;
      const inside = world && world.y + world.h > bounds.y && world.y < bounds.y + bounds.h && world.x + world.w > bounds.x && world.x < bounds.x + bounds.w;
      const full = { x: area.x, y: area.y, w: area.w, h: Math.max(0, bottom(area) - area.y) };
      drawBuildingCallout(app, kit, st.sel, {
        target: inside ? world : tile,
        bounds: inside ? bounds : full,
        side: inside ? undefined : L.portrait ? 'above' : tile.x + tile.w / 2 < L.w / 2 ? 'right' : 'left',
        goto: (key) => {
          st.sel = key;
        },
      });
    } else if (st.era) {
      eraCallout(app, kit, { id: 'era', target: ch.G.era, bounds });
    }
  },
};
