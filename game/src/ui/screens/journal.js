// Журнал: контракты, достижения, лавка расходников, раскраски.

import { t } from '../../i18n/index.js';
import { screenFrame, journalLayout } from '../layout.js';
import { clamp, fmtInt } from '../format.js';
import { skinItems, shopItems } from '../bridge.js';
import { drawHeader } from './common.js';

const CONSUMABLE_ICON = { chute: 'chute', repair: 'repair', canister: 'canister', magnet: 'target' };
const STOCK_MAX = 9;

function state(app) {
  return ((app.ui ||= {}).journal ||= { tab: 'contracts' });
}

export default {
  id: 'journal',
  background: 'hubdim',
  enter(app, params) {
    if (params?.tab) state(app).tab = params.tab;
  },
  draw(app, kit, L) {
    const st = state(app);
    const F = screenFrame(L, { header: true });
    const G = journalLayout(L);
    drawHeader(app, kit, F.header, { back: true, title: t('journal.title') });
    const tabs = [
      { id: 'contracts', label: t('journal.tab.contracts'), icon: 'contract' },
      { id: 'achievements', label: t('journal.tab.achievements'), icon: 'trophy' },
      { id: 'shop', label: t('journal.tab.shop'), icon: 'cart' },
      { id: 'skins', label: t('journal.tab.skins'), icon: 'brush' },
    ];
    st.tab = kit.tabs('journal-tabs', G.tabs, tabs, st.tab, { size: kit.fs(L.portrait ? 11 : 13) });
    kit.nine(app.backdropOn ? 'panelGlass' : 'panel', G.list.x, G.list.y, G.list.w, G.list.h);
    kit.hit('journal-bg', G.list, {});
    const inner = { x: G.list.x + L.px * 2, y: G.list.y + L.px * 2, w: G.list.w - L.px * 4, h: G.list.h - L.px * 4 };
    if (st.tab === 'contracts') drawContracts(app, kit, L, inner);
    else if (st.tab === 'achievements') drawAchievements(app, kit, L, inner);
    else if (st.tab === 'shop') drawShop(app, kit, L, inner);
    else drawSkins(app, kit, L, inner);
  },
};

function empty(kit, L, r, text, icon = 'contract') {
  kit.icon(icon, r.x + r.w / 2, r.y + r.h * 0.35, Math.round(48 * L.ui), kit.c.textMute);
  kit.paragraph(text, r.x + L.pad, r.y + r.h * 0.35 + 40 * L.ui, r.w - L.pad * 2, { size: kit.fs(14), color: kit.c.textMute, align: 'center' });
}

// ---------- контракты ----------

function drawContracts(app, kit, L, r) {
  const c = kit.c;
  const list = app.rules.listContracts(app.profile) || [];
  const slots = app.rules.contractSlots ? app.rules.contractSlots(app.profile) : list.length;
  const head = Math.round(30 * L.ui);
  kit.drawText(t('journal.contracts.head', { n: list.length, slots, done: app.profile.contracts.done.length }), r.x + L.pad, r.y + head / 2, { size: kit.fs(13), color: c.amber, maxWidth: r.w - L.pad * 2 });
  const listR = { x: r.x, y: r.y + head, w: r.w, h: r.h - head };
  if (!list.length) {
    empty(kit, L, listR, t('journal.contracts.empty'));
    return;
  }
  const rowH = Math.round(84 * L.ui);
  kit.scrollList('journal-contracts', listR, {
    count: list.length,
    itemH: rowH,
    gap: L.gap,
    draw: (i, ir) => {
      const ct = list[i];
      kit.nine('card', ir.x, ir.y, ir.w, ir.h);
      kit.icon(ct.cargo ? 'cart' : 'contract', ir.x + L.pad + 14 * L.ui, ir.y + ir.h * 0.4, Math.round(28 * L.ui), c.amber);
      const tx = ir.x + L.pad + 40 * L.ui;
      const rewardW = Math.round(96 * L.ui);
      const maxW = ir.w - (tx - ir.x) - rewardW - L.pad;
      kit.drawText(ct.name, tx, ir.y + ir.h * 0.28, { size: kit.fs(14), color: c.text, maxWidth: maxW });
      kit.paragraph(ct.desc, tx, ir.y + ir.h * 0.48, maxW, { size: kit.fs(12), color: c.textDim, maxLines: 2, lineHeight: 1.15 });
      if (ct.cargo) kit.drawText(t('journal.cargo'), tx, ir.y + ir.h * 0.88, { size: kit.fs(10), color: c.cyan });
      kit.costChip(ir.x + ir.w - L.pad, ir.y + ir.h * 0.5, { coins: ct.reward }, { align: 'right', size: kit.fs(14) });
    },
  });
}

// ---------- достижения ----------

function drawAchievements(app, kit, L, r) {
  const c = kit.c;
  const list = app.data.ACHIEVEMENTS || [];
  const done = new Set(app.profile.achievements || []);
  if (!list.length) {
    empty(kit, L, r, t('journal.ach.empty'), 'trophy');
    return;
  }
  const head = Math.round(30 * L.ui);
  kit.drawText(t('journal.ach.count', { n: done.size, max: list.length }), r.x + L.pad, r.y + head / 2, { size: kit.fs(13), color: c.amber });
  const listR = { x: r.x, y: r.y + head, w: r.w, h: r.h - head };
  const rowH = Math.round(72 * L.ui);
  // невыполненные сверху, выполненные в конце
  const ordered = [...list].sort((a, b) => Number(done.has(a.id)) - Number(done.has(b.id)));
  kit.scrollList('journal-ach', listR, {
    count: ordered.length,
    itemH: rowH,
    gap: L.gap * 0.6,
    draw: (i, ir) => {
      const a = ordered[i];
      const ok = done.has(a.id);
      kit.nine(ok ? 'raised' : 'card', ir.x, ir.y, ir.w, ir.h);
      kit.icon('trophy', ir.x + L.pad + 14 * L.ui, ir.y + ir.h / 2, Math.round(28 * L.ui), ok ? c.gold : c.textMute, ok ? 1 : 0.6);
      const tx = ir.x + L.pad + 40 * L.ui;
      const maxW = ir.w - (tx - ir.x) - Math.round(84 * L.ui);
      kit.drawText(a.name, tx, ir.y + ir.h * 0.27, { size: kit.fs(14), color: ok ? c.text : c.textDim, maxWidth: maxW });
      kit.drawText(a.desc, tx, ir.y + ir.h * 0.52, { size: kit.fs(11), color: c.textMute, maxWidth: maxW });
      if (!ok && app.rules.conditionProgress) {
        let pr = null;
        try {
          pr = app.rules.conditionProgress(a.cond, app.profile);
        } catch {
          pr = null;
        }
        if (pr && pr.need > 0) kit.progress({ x: tx, y: ir.y + ir.h * 0.68, w: maxW, h: Math.round(12 * L.ui) }, clamp(pr.have / pr.need, 0, 1), { label: `${fmtInt(pr.have)} / ${fmtInt(pr.need)}`, color: c.amber });
      }
      if (ok) kit.icon('check', ir.x + ir.w - L.pad - 8 * L.ui, ir.y + ir.h / 2, Math.round(16 * L.ui), c.green);
      else kit.costChip(ir.x + ir.w - L.pad, ir.y + ir.h * 0.5, { coins: a.reward }, { align: 'right', size: kit.fs(12) });
    },
  });
}

// ---------- лавка ----------

/** Витрина 2×2: крупные карточки расходников (спрайт эпохи, описание, запас, кнопка покупки) заполняют всю область. */
function drawShop(app, kit, L, r) {
  const c = kit.c;
  const items = shopItems(app.mods);
  const p = app.profile;
  const cols = 2;
  const gap = L.gap;
  const rows = Math.ceil(items.length / cols);
  const cardW = Math.floor((r.w - gap * (cols - 1) - L.px * 3) / cols);
  const minH = Math.round(236 * L.ui);
  const cardH = Math.max(minH, Math.min(Math.round(320 * L.ui), Math.floor((r.h - gap * (rows - 1)) / rows)));
  kit.scrollArea('journal-shop', r, rows * (cardH + gap) - gap, (top) => {
    items.forEach((it, i) => {
      const x = r.x + (i % cols) * (cardW + gap);
      const y = top + Math.floor(i / cols) * (cardH + gap);
      const have = p.inventory[it.id] || 0;
      kit.nine('card', x, y, cardW, cardH);
      const icon = Math.round(Math.min(cardW * 0.46, cardH * 0.3));
      kit.icon(CONSUMABLE_ICON[it.id] || 'info', x + cardW / 2, y + L.pad + icon / 2, icon, c.amber);
      kit.drawText(it.name, x + cardW / 2, y + L.pad * 1.4 + icon + kit.fs(8), { size: kit.fs(14), color: c.text, align: 'center', maxWidth: cardW - L.pad });
      const descY = y + L.pad * 1.4 + icon + kit.fs(22);
      kit.paragraph(it.desc, x + L.pad * 0.8, descY, cardW - L.pad * 1.6, { size: kit.fs(11), color: c.textDim, maxLines: 3, lineHeight: 1.18, align: 'center' });
      const btnH = L.touch(52);
      const stockY = y + cardH - btnH - L.gap * 1.6 - L.pad * 0.5;
      kit.drawText(t('shop.have', { n: have }), x + cardW / 2, stockY, { size: kit.fs(12), color: have ? c.green : c.textMute, align: 'center' });
      const full = have >= STOCK_MAX;
      const afford = p.coins >= it.price;
      const b = { x: x + L.gap, y: y + cardH - btnH - L.gap, w: cardW - L.gap * 2, h: btnH };
      if (kit.button(`shop-buy-${it.id}`, b, { label: full ? t('shop.full') : fmtInt(it.price), icon: full ? undefined : 'coin', variant: 'primary', disabled: full || !afford, size: kit.fs(15), sub: !full && !afford ? t('card.needFunds') : undefined })) {
        const res = app.buyConsumable(it.id);
        if (res.ok) kit.toast(t('shop.bought', { name: it.name }), { kind: 'good', icon: CONSUMABLE_ICON[it.id] });
      }
    });
    return rows * (cardH + gap) - gap;
  });
}

// ---------- раскраски ----------

function drawSkins(app, kit, L, r) {
  const c = kit.c;
  const items = skinItems(app.mods);
  const p = app.profile;
  const cols = L.portrait ? 2 : 3;
  const gap = L.gap;
  const cardW = Math.floor((r.w - gap * (cols - 1) - L.px * 3) / cols);
  const cardH = Math.round(160 * L.ui);
  const rows = Math.ceil(items.length / cols);
  kit.scrollArea('journal-skins', r, rows * (cardH + gap), (top) => {
    items.forEach((it, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = r.x + col * (cardW + gap);
      const y = top + row * (cardH + gap);
      const owned = p.skins.includes(it.id);
      const sel = p.skin === it.id;
      kit.nine(sel ? 'cardOn' : 'card', x, y, cardW, cardH);
      const sw = Math.round(cardH * 0.46);
      const sx = x + cardW / 2;
      const body = it.color || '#b63c43';
      kit.rect(sx - sw * 0.17, y + L.pad, sw * 0.34, sw, '#e8e8ee');
      kit.rect(sx - sw * 0.17, y + L.pad, sw * 0.34, sw * 0.24, body);
      kit.rect(sx - sw * 0.17, y + L.pad + sw * 0.55, sw * 0.34, sw * 0.1, body);
      kit.rect(sx - sw * 0.34, y + L.pad + sw * 0.72, sw * 0.17, sw * 0.28, body);
      kit.rect(sx + sw * 0.17, y + L.pad + sw * 0.72, sw * 0.17, sw * 0.28, body);
      kit.drawText(it.name, sx, y + L.pad + sw + kit.fs(14), { size: kit.fs(13), color: c.text, align: 'center', maxWidth: cardW - L.pad });
      const b = { x: x + L.gap, y: y + cardH - L.touch(48) - L.gap, w: cardW - L.gap * 2, h: L.touch(48) };
      if (sel) kit.button(`skin-${it.id}`, b, { label: t('skin.selected'), variant: 'good', icon: 'check', size: kit.fs(12) });
      else if (owned) {
        if (kit.button(`skin-${it.id}`, b, { label: t('skin.select'), variant: 'btn', size: kit.fs(12) })) app.selectSkin(it.id);
      } else if (kit.button(`skin-${it.id}`, b, { label: fmtInt(it.price), icon: 'coin', variant: 'primary', disabled: p.coins < it.price, size: kit.fs(13) })) {
        const res = app.buySkin(it.id);
        if (res.ok) kit.toast(t('skin.bought'), { kind: 'good', icon: 'brush' });
      }
    });
    return rows * (cardH + gap);
  });
}
