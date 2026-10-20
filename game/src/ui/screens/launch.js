// Запуск: выбор цели (Атмосфера / Луна / Марс) с причинами недоступности, расходники, кнопка «Старт».

import { t } from '../../i18n/index.js';
import { screenFrame, launchLayout } from '../layout.js';
import { drawHeader } from './common.js';

const DEST_ICON = { earth: 'earth', moon: 'moon', mars: 'mars' };
const CONS = ['chute', 'repair', 'canister', 'magnet'];
const CONS_ICON = { chute: 'chute', repair: 'repair', canister: 'canister', magnet: 'target' };

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
    const F = screenFrame(L, { header: true });
    const G = launchLayout(L);
    drawHeader(app, kit, F.header, { back: true, title: t('launch.title') });
    const dests = app.rules.availableDestinations(p);
    const base = app.rules.deriveBase(p);
    const free = { chute: base.effects.freeChute > 0, canister: base.effects.freeCanister > 0 };

    // цели
    dests.forEach((d, i) => {
      const r = G.destCards[i];
      const on = st.dest === d.id;
      const variant = on ? 'cardOn' : 'card';
      const clicked = kit.button(`launch-dest-${d.id}`, r, { variant, locked: !d.ok });
      if (clicked) st.dest = d.id;
      else if (kit.denied === `launch-dest-${d.id}`) kit.toast(t('launch.closed'), { kind: 'bad', icon: 'lock' });
      const pad = L.pad;
      const ic = Math.round((L.portrait ? 40 : 52) * L.ui);
      kit.icon(DEST_ICON[d.id], r.x + pad + ic / 2, r.y + pad + ic / 2, ic, d.ok ? c.text : c.textMute, d.ok ? 1 : 0.6);
      const tx = r.x + pad + ic + L.gap;
      const tw = r.w - (tx - r.x) - pad;
      kit.drawText(d.name, tx, r.y + pad + kit.fs(10), { size: kit.fs(17), color: d.ok ? (on ? c.amber : c.text) : c.textDim, maxWidth: tw });
      const used = kit.paragraph(d.desc, L.portrait ? tx : r.x + pad, L.portrait ? r.y + pad + kit.fs(24) : r.y + pad + ic + L.gap, L.portrait ? tw : r.w - pad * 2, { size: kit.fs(12), color: c.textDim, maxLines: L.portrait ? 2 : 4, lineHeight: 1.2 });
      let y = (L.portrait ? r.y + pad + kit.fs(24) : r.y + pad + ic + L.gap) + used + L.gap * 0.5;
      if (d.ok) {
        kit.icon('check', (L.portrait ? tx : r.x + pad) + kit.fs(7), y + kit.fs(8), kit.fs(14), c.green);
        kit.drawText(t('launch.open'), (L.portrait ? tx : r.x + pad) + kit.fs(18), y + kit.fs(8), { size: kit.fs(12), color: c.green });
      } else {
        // причины недоступности: сколько поместится
        const room = r.y + r.h - pad - y;
        const lineH = kit.fs(14);
        const fit = Math.max(1, Math.floor(room / lineH));
        const shown = d.reasons.slice(0, d.reasons.length > fit ? fit - 1 : fit);
        const x0 = L.portrait ? tx : r.x + pad;
        const w0 = L.portrait ? tw : r.w - pad * 2;
        for (const rs of shown) {
          kit.icon('lock', x0 + kit.fs(6), y + lineH / 2, kit.fs(11), c.red);
          kit.drawText(app.reasonText(rs), x0 + kit.fs(16), y + lineH / 2, { size: kit.fs(11), color: c.red, maxWidth: w0 - kit.fs(16) });
          y += lineH;
        }
        if (d.reasons.length > shown.length) kit.drawText(t('launch.more', { n: d.reasons.length - shown.length }), x0 + kit.fs(16), y + lineH / 2, { size: kit.fs(11), color: c.textMute });
      }
    });

    // расходники
    const cr = G.cons;
    const inner = kit.panel(cr, { title: t('launch.cons'), titleIcon: 'canister', variant: 'panel' });
    const cols = L.portrait ? 4 : 2;
    const rows = Math.ceil(CONS.length / cols);
    const cell = { w: (inner.w - L.gap * (cols - 1)) / cols, h: Math.min(L.touch(62), (inner.h - L.gap * (rows - 1)) / rows) };
    CONS.forEach((id, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const r = { x: inner.x + col * (cell.w + L.gap), y: inner.y + row * (cell.h + L.gap), w: cell.w, h: cell.h };
      const have = p.inventory[id] || 0;
      const isFree = !!free[id];
      const usable = have > 0 || isFree;
      const on = usable && (isFree || st.cons[id]);
      const clicked = kit.button(`cons-${id}`, r, { variant: on ? 'cardOn' : 'card', stack: true, icon: CONS_ICON[id], label: t(`cons.${id}`), size: kit.fs(L.portrait ? 10 : 12), disabled: false, iconColor: usable ? c.text : c.textMute, color: usable ? c.text : c.textMute });
      kit.drawText(isFree ? t('cons.free') : `×${have}`, r.x + r.w - L.px * 3, r.y + L.px * 4, { size: kit.fs(11), color: isFree ? c.green : have ? c.amber : c.textMute, align: 'right', weight: 900 });
      if (clicked) {
        if (!usable) app.go('journal', { tab: 'shop' }, { push: true });
        else if (!isFree) st.cons[id] = !st.cons[id];
      }
    });
    if (!L.portrait) {
      const noteY = inner.y + rows * (cell.h + L.gap);
      if (st.dest !== 'earth') kit.paragraph(t('launch.chuteMoon'), inner.x, noteY, inner.w, { size: kit.fs(11), color: c.textMute, maxLines: 3 });
    } else if (st.dest !== 'earth') {
      kit.drawText(t('launch.chuteMoon.short'), inner.x, cr.y + cr.h - L.px * 3, { size: kit.fs(10), color: c.textMute, maxWidth: inner.w, baseline: 'bottom' });
    }

    // старт
    const sel = dests.find((d) => d.id === st.dest);
    if (kit.button('launch-start', G.start, { label: t('launch.start'), icon: 'launch', variant: 'primary', size: kit.fs(20), disabled: !sel?.ok })) {
      const consumables = {};
      for (const id of CONS) consumables[id] = !!(st.cons[id] && (p.inventory[id] || 0) > 0);
      app.startLaunch({ destination: st.dest, consumables });
    }
  },
};
