// Пульт запуска: ряд ламп готовности, три крупные кнопки-планеты (картинка и замок), гнёзда расходников
// и большая кнопка «ПУСК» под защитной планкой.

import { t } from '../../i18n/index.js';
import { launchLayout } from '../layout.js';
import { drawChrome, lockRows, isFundsReason, partIcon } from './common.js';
import { mix } from '../theme.js';

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

    // выбор цели: экран эпохи (ЭЛТ, плоский дисплей, голограмма) с тремя карточками-планетами; нажатия — поверх экрана
    {
      const cc = kit.cell();
      const first = G.dest[0];
      const last = G.dest[G.dest.length - 1];
      const scr = { x: first.x - cc * 3, y: first.y - cc * 3, w: last.x + last.w - first.x + cc * 6, h: first.h + cc * 6 };
      kit.nine('inset', scr.x - cc * 2, scr.y - cc * 2, scr.w + cc * 4, scr.h + cc * 4);
      kit.screen('launch-dests', scr, () => {
        dests.forEach((d, i) => {
          const r0 = G.dest[i];
          const id = `launch-dest-${d.id}`;
          const a = kit.stepAnim(id);
          const shake = a.shake > 0 && !app.settings.reduceMotion ? Math.round(Math.sin(a.shake * 40) * cc * 2 * a.shake) : 0;
          const r = { x: r0.x + shake, y: r0.y + (a.press > 0.5 ? cc : 0), w: r0.w, h: r0.h };
          const on = st.dest === d.id;
          kit.rect(r.x, r.y, r.w, r.h, c.ink);
          // на ЭЛТ выбранная карточка — только скобки: яркая заливка превратилась бы в сплошной блок люминофора
          const crtKind = kit.S.skin.crt.kind;
          kit.rect(r.x + cc, r.y + cc, r.w - cc * 2, r.h - cc * 2, on && !['green', 'amber', 'color'].includes(crtKind) ? mix(c.navy2, c.amber, 0.12) : c.navy1);
          if (on) {
            const arm = cc * 5;
            for (const [bx, by, sx, sy] of [[r.x, r.y, 1, 1], [r.x + r.w, r.y, -1, 1], [r.x, r.y + r.h, 1, -1], [r.x + r.w, r.y + r.h, -1, -1]]) {
              kit.rect(sx > 0 ? bx : bx - arm, sy > 0 ? by : by - cc, arm, cc, c.amberLight);
              kit.rect(sx > 0 ? bx : bx - cc, sy > 0 ? by : by - arm, cc, arm, c.amberLight);
            }
          }
          const nameSize = kit.fs(L.portrait ? 12 : 14);
          const glyphH = 7 * kit.text.stepFor(nameSize).css;
          const chipH = d.ok ? 0 : Math.round(28 * L.ui);
          const nameY = r.y + r.h - cc * 4 - chipH - glyphH / 2;
          const room = nameY - glyphH / 2 - cc * 3 - (r.y + cc * 4);
          const pic = Math.max(cc * 8, Math.min(Math.round(r.w * 0.62), Math.round(room)));
          kit.icon(DEST_ICON[d.id], r.x + r.w / 2, r.y + cc * 4 + room / 2, pic, d.id === 'mars' ? '#e8845a' : c.text, d.ok ? 1 : 0.6);
          kit.drawText(t(`dest.${d.id}`), r.x + r.w / 2, nameY, { size: nameSize, color: d.ok ? (on ? c.amberLight : c.text) : c.textMute, align: 'center', maxWidth: r.w - cc * 8, box: { x: r.x, y: r.y, w: r.w, h: r.h } });
          if (!d.ok) {
            kit.icon('lock', r.x + r.w - cc * 7, r.y + cc * 7, Math.round(16 * L.ui), c.amber);
            const why = d.reasons.filter((x) => !isFundsReason(x)).slice(0, 1);
            if (why.length) lockRows(app, kit, r.x + cc * 2, r.y + r.h - cc * 3 - chipH, r.w - cc * 4, why, { compact: true });
          }
        });
      });
      dests.forEach((d, i) => {
        const id = `launch-dest-${d.id}`;
        const r = G.dest[i];
        kit.hit(id, r, { focusable: true });
        if (kit.S.focusVisible && kit.S.focusId === id) kit.focusRing(r);
        if (kit.S.hover === id) kit.S.cursor = 'pointer';
        if (kit.clicked === id) {
          if (d.ok) st.dest = d.id;
          else {
            kit.anim(id).shake = 1;
            kit.sfx('deny');
            kit.toast(t('launch.closed'), { kind: 'bad', icon: 'lock' });
          }
        }
      });
    }

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
        if (!usable) {
          if (id === 'chute') kit.toast(t('launch.noChute'), { kind: 'info', icon: 'cart' });
          app.go('shop', {}, { push: true });
        }
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
