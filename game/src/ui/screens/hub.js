// Космодром: сцена острова, нижний док (Запуск, Ракета, База, Журнал, Ещё), карточка постройки по тапу.

import { t } from '../../i18n/index.js';
import { dockLayout, screenFrame, sheetRect, right } from '../layout.js';
import { drawHeader, drawBuildingCard, suggestNext, buildingIcon, BUILDING_KEYS, PART_KEYS } from './common.js';

const DOCK = [
  { id: 'launch', icon: 'launch', variant: 'primary' },
  { id: 'rocket', icon: 'rocket', variant: 'btn' },
  { id: 'base', icon: 'base', variant: 'btn' },
  { id: 'journal', icon: 'journal', variant: 'btn' },
  { id: 'more', icon: 'more', variant: 'btn' },
];

function state(app) {
  return ((app.ui ||= {}).hub ||= { selected: null, more: false, cache: null });
}

/** Подсказки и значки на доке пересчитываются только при смене профиля. */
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
  st.cache = { profile: p, canPart, canBuilding, goal: suggestNext(app) };
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
    st.more = false;
    if (params?.select) st.selected = params.select;
  },
  onBack(app) {
    const st = state(app);
    if (st.more) st.more = false;
    else st.selected = null;
    return true;
  },
  draw(app, kit, L) {
    const st = state(app);
    const F = screenFrame(L, { header: true, dock: true });
    const c = kit.c;
    const info = derive(app, st);

    // перетаскивание сцены и тап: постройка или ракета
    if (kit.dragDx && !kit.modalOpen) app.renderer.hub.pan?.(kit.dragDx);
    const tap = kit.emptyTap;
    if (tap && !kit.modalOpen) {
      const key = worldHit(app, tap.x, tap.y);
      st.more = false;
      if (key === 'rocket') app.go('rocket', {}, { push: true });
      else if (key && BUILDING_KEYS.includes(key) && app.profile.buildings[key] > 0) {
        st.selected = key;
        app.sfx('press');
      } else st.selected = null;
    }
    if (st.selected !== app.hubSelected) {
      app.hubSelected = st.selected;
      app.renderer.hub.setSelected?.(st.selected);
      if (st.selected) app.renderer.hub.focus?.(st.selected);
    }

    drawHeader(app, kit, F.header, { era: true });

    // цель дня
    const goal = info.goal;
    if (goal && !st.selected) {
      const gh = L.touch(44);
      const gw = Math.min(L.area.w - L.gap * 2, Math.round(330 * L.ui));
      const gx = L.portrait ? F.body.x : F.body.x;
      const gy = F.body.y;
      if (kit.button('goal', { x: gx, y: gy, w: gw, h: gh }, { label: goal.text, icon: goal.icon, variant: 'card', size: kit.fs(13), align: 'left', iconColor: c.amber })) goal.action();
    }

    // карточка постройки
    if (st.selected) {
      const r = sheetRect(L, { dock: true });
      if (drawBuildingCard(app, kit, r, st.selected, { close: true, goto: null })) st.selected = null;
    }

    // док
    const dock = dockLayout(L);
    kit.nine('raised', dock.bar.x, dock.bar.y, dock.bar.w, dock.bar.h);
    kit.hit('dock-bar', dock.bar, {});
    for (const d of DOCK) {
      const r = dock.items[d.id];
      const badge = d.id === 'rocket' && info.canPart ? '!' : d.id === 'base' && info.canBuilding ? '!' : undefined;
      const clicked = kit.button(`dock-${d.id}`, r, { label: t(`dock.${d.id}`), icon: d.icon, stack: true, variant: d.variant, size: kit.fs(L.portrait ? 11 : 13), badge, tip: t(`dock.${d.id}.tip`) });
      if (!clicked) continue;
      if (d.id === 'more') st.more = !st.more;
      else app.go(d.id, {}, { push: true });
    }
    if (app.profile.stats.flights === 0 && !st.selected) {
      // подсказка первого запуска: указатель над кнопкой «Запуск»
      const r = dock.items.launch;
      const bob = Math.sin(app.time * 5) * 4;
      kit.icon('down', r.x + r.w / 2, r.y - L.gap - 12 * L.ui + bob, Math.round(22 * L.ui), c.amber);
    }

    if (st.more) drawMore(app, kit, L, dock, st);
  },
};

function drawMore(app, kit, L, dock, st) {
  const c = kit.c;
  const r = dock.items.more;
  const w = Math.round(220 * L.ui);
  const rowH = L.touch(52);
  const items = [
    { id: 'settings', label: t('more.settings'), icon: 'gear' },
    { id: 'help', label: t('more.help'), icon: 'info' },
    { id: 'sound', label: app.prefs.muted ? t('more.soundOn') : t('more.soundOff'), icon: app.prefs.muted ? 'mute' : 'sound' },
  ];
  const h = items.length * rowH + (items.length + 1) * L.gap;
  const x = Math.min(right(L.area) - w - L.gap, r.x + r.w - w);
  const y = dock.bar.y - L.gap - h;
  kit.panel({ x, y, w, h }, { variant: 'raised', pad: L.gap });
  items.forEach((it, i) => {
    const b = { x: x + L.gap, y: y + L.gap + i * (rowH + L.gap), w: w - L.gap * 2, h: rowH };
    if (kit.button(`more-${it.id}`, b, { label: it.label, icon: it.icon, variant: 'btn', align: 'left', size: kit.fs(15), iconColor: c.amber })) {
      st.more = false;
      if (it.id === 'settings') app.go('settings', {}, { push: true });
      else if (it.id === 'help') app.queueCard('help', true);
      else app.toggleMute();
    }
  });
}
