// Пульт запуска: ряд ламп готовности, три крупные кнопки-планеты (картинка и замок), гнёзда расходников
// и большая кнопка «ПУСК» под защитной планкой.

import { t } from '../../i18n/index.js';
import { launchLayout } from '../layout.js';
import { drawChrome, lockRows, isFundsReason, partIcon } from './common.js';

const DEST_ICON = { earth: 'earth', moon: 'moon', mars: 'mars' };
const CONS = ['chute', 'repair', 'canister', 'magnet'];
const CONS_ICON = { chute: 'chute', repair: 'repair', canister: 'canister', magnet: 'target' };
const READY_PARTS = ['engine', 'tank', 'hull', 'capsule'];

function state(app) {
  return ((app.ui ||= {}).launch ||= { dest: 'earth', cons: {} });
}

export default {
  id: 'launch',
  background: 'hubdim',
  enter(app) {
    const st = state(app);
    const dests = app.rules.availableDestinations(app.profile);
    if (!dests.find((d) => d.id === st.dest && d.ok)) st.dest = 'earth';
  },
  draw(app, kit, L) {
    const st = state(app);
    const c = kit.c;
    const p = app.profile;
    const G = launchLayout(L);
    drawChrome(app, kit, { back: true });
    const dests = app.rules.availableDestinations(p);
    const base = app.rules.deriveBase(p);
    const free = { chute: base.effects.freeChute > 0, canister: base.effects.freeCanister > 0 };
    const sel = dests.find((d) => d.id === st.dest);

    // корпус пульта
    kit.panel(G.panel, { variant: 'raised', pad: 0 });

    // лампы готовности: ключевые модули установлены, цель открыта
    const lampSize = Math.round(18 * L.ui);
    const cells = READY_PARTS.length + 1;
    const step = G.lamps.w / cells;
    READY_PARTS.forEach((id, i) => {
      const cx = G.lamps.x + step * (i + 0.5);
      const ok = (p.parts[id] || 0) > 0;
      kit.icon(partIcon(id), cx - lampSize * 0.9, G.lamps.y + G.lamps.h / 2, Math.round(lampSize * 1.15), ok ? c.text : c.textMute);
      kit.lamp(cx + lampSize * 0.5, G.lamps.y + G.lamps.h / 2, lampSize, ok ? c.green : c.amber, ok, false);
    });
    {
      const cx = G.lamps.x + step * (cells - 0.5);
      const ok = !!sel?.ok;
      kit.icon(DEST_ICON[st.dest] || 'earth', cx - lampSize * 0.9, G.lamps.y + G.lamps.h / 2, Math.round(lampSize * 1.15), ok ? c.text : c.textMute);
      kit.lamp(cx + lampSize * 0.5, G.lamps.y + G.lamps.h / 2, lampSize, ok ? c.green : c.red, true, !ok);
    }

    // три планеты
    dests.forEach((d, i) => {
      const r = G.dest[i];
      const on = st.dest === d.id;
      const clicked = kit.button(`launch-dest-${d.id}`, r, {
        variant: on ? 'cardOn' : 'card', locked: !d.ok, icon: DEST_ICON[d.id], stack: true, label: t(`dest.${d.id}`),
        size: kit.fs(L.portrait ? 12 : 14), iconColor: d.id === 'mars' ? '#e8845a' : c.text, lamp: on ? c.green : false,
      });
      if (clicked) st.dest = d.id;
      else if (kit.denied === `launch-dest-${d.id}`) kit.toast(t('launch.closed'), { kind: 'bad', icon: 'lock' });
      if (!d.ok) {
        const why = d.reasons.filter((x) => !isFundsReason(x)).slice(0, 1);
        if (why.length) lockRows(app, kit, r.x + L.gap * 0.5, r.y + r.h - Math.round(34 * L.ui), r.w - L.gap, why, { compact: true });
      }
    });

    // гнёзда расходников
    kit.nine('screen', G.cons.x, G.cons.y, G.cons.w, G.cons.h);
    CONS.forEach((id, i) => {
      const r = G.consSlots[i];
      const have = p.inventory[id] || 0;
      const isFree = !!free[id];
      const usable = have > 0 || isFree;
      const on = usable && (isFree || st.cons[id]);
      const pad = Math.round(L.gap * 0.5);
      const slot = { x: r.x + pad, y: r.y + pad, w: r.w - pad * 2, h: r.h - pad * 2 };
      const clicked = kit.button(`cons-${id}`, slot, { variant: on ? 'cardOn' : 'card', icon: CONS_ICON[id], iconSize: Math.round(slot.h * 0.56), iconColor: usable ? c.text : c.textMute, tip: t(`cons.${id}`), lamp: on ? c.green : false });
      kit.drawText(isFree ? t('cons.free') : `×${have}`, slot.x + slot.w - kit.cell() * 3, slot.y + slot.h - kit.cell() * 5, { size: kit.fs(11), color: isFree ? c.green : have ? c.amberLight : c.textMute, align: 'right', shadow: true });
      if (id === 'chute' && usable && st.dest !== 'earth') kit.icon('warn', slot.x + kit.cell() * 5, slot.y + slot.h - kit.cell() * 5, Math.round(14 * L.ui), c.amber);
      if (clicked) {
        if (!usable) app.go('shop', {}, { push: true });
        else if (!isFree) st.cons[id] = !st.cons[id];
      }
    });

    // ПУСК под защитной планкой
    const cc = kit.cell();
    kit.hazard(G.start);
    for (const [x, y, w, h] of [[G.start.x, G.start.y, G.start.w, cc], [G.start.x, G.start.y + G.start.h - cc, G.start.w, cc], [G.start.x, G.start.y, cc, G.start.h], [G.start.x + G.start.w - cc, G.start.y, cc, G.start.h]]) kit.rect(x, y, w, h, c.ink);
    const btn = { x: G.start.x + cc * 3, y: G.start.y + cc * 3, w: G.start.w - cc * 6, h: G.start.h - cc * 6 };
    if (kit.button('launch-start', btn, { label: t('launch.start'), icon: 'launch', variant: 'danger', size: kit.fs(24), iconSize: Math.round(btn.h * 0.46), disabled: !sel?.ok, lamp: sel?.ok ? c.amberLight : false })) {
      const consumables = {};
      for (const id of CONS) consumables[id] = !!(st.cons[id] && (p.inventory[id] || 0) > 0);
      app.startLaunch({ destination: st.dest, consumables });
    }
  },
};
