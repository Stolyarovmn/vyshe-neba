// Доска: пробковая доска с приколотыми листами контрактов и стеклянная полка наград. Тап по листу или медали — щиток.

import { t } from '../../i18n/index.js';
import { journalLayout } from '../layout.js';
import { clamp, fmtCompact, fmtInt } from '../format.js';
import { drawChrome, infoCallout, oneLine } from './common.js';

function state(app) {
  return ((app.ui ||= {}).journal ||= { sel: null });
}

export default {
  id: 'journal',
  background: 'hubdim',
  enter(app) {
    state(app).sel = null;
  },
  onBack(app) {
    const st = state(app);
    if (st.sel) {
      st.sel = null;
      return true;
    }
    return false;
  },
  draw(app, kit, L) {
    const st = state(app);
    const G = journalLayout(L);
    drawChrome(app, kit, { back: true });
    const rects = {};
    const contracts = app.rules.listContracts(app.profile) || [];
    drawBoard(app, kit, L, G.board, st, contracts, rects);
    drawAwards(app, kit, L, G.shelf, st, rects);
    if (kit.emptyTap && st.sel && !kit.modalOpen) st.sel = null;
    if (st.sel) drawJournalCallout(app, kit, L, G, st, contracts, rects);
  },
};

// ---------- доска контрактов ----------

function cork(kit, r) {
  const c = kit.c;
  const cc = kit.cell();
  kit.nine('cork', r.x, r.y, r.w, r.h);
  // крапинки пробки: детерминированно, клетками
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const n = Math.round((r.w * r.h) / (cc * cc * 90));
  for (let i = 0; i < n; i++) {
    const x = r.x + cc * 3 + Math.floor((rnd() * (r.w - cc * 6)) / cc) * cc;
    const y = r.y + cc * 3 + Math.floor((rnd() * (r.h - cc * 6)) / cc) * cc;
    kit.rect(x, y, cc, cc, rnd() < 0.5 ? c.cork0 : c.cork2);
  }
}

function drawBoard(app, kit, L, r, st, list, rects) {
  const c = kit.c;
  const cc = kit.cell();
  cork(kit, r);
  kit.hit('journal-board', r, {});
  const inner = { x: r.x + L.pad, y: r.y + L.pad, w: r.w - L.pad * 2, h: r.h - L.pad * 2 };
  const slots = Math.max(list.length, app.rules.contractSlots ? app.rules.contractSlots(app.profile) : list.length, 1);
  const gap = L.gap * 1.4;
  const sw0 = Math.round(132 * L.ui);
  const cols = Math.max(1, Math.min(slots, Math.floor((inner.w + gap) / (sw0 + gap))));
  const sw = Math.floor((inner.w - gap * (cols - 1)) / cols);
  const sh = Math.round(Math.min(sw * 1.05, 130 * L.ui));
  const rows = Math.ceil(slots / cols);
  const contentH = rows * (sh + gap) - gap + cc * 4;
  kit.scrollArea('journal-contracts', inner, contentH, (top) => {
    for (let i = 0; i < slots; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      // листы чуть сдвинуты «от руки»: сдвиг кратен клетке
      const jx = ((i * 37) % 5 - 2) * cc;
      const jy = ((i * 53) % 5 - 2) * cc;
      const x = inner.x + col * (sw + gap) + jx + cc * 2;
      const y = top + row * (sh + gap) + jy + cc * 2;
      const rect = { x, y, w: sw - cc * 4, h: sh };
      const ct = list[i];
      if (!ct) {
        kit.nine('inset', rect.x, rect.y, rect.w, rect.h);
        kit.drawText('–', rect.x + rect.w / 2, rect.y + rect.h / 2, { size: kit.fs(20), color: c.textMute, align: 'center' });
        pin(kit, rect.x + rect.w / 2, rect.y + cc * 3, c.steel2);
        continue;
      }
      const id = `sheet-${i}`;
      rects[`sheet:${i}`] = rect;
      kit.hit(id, rect, { focusable: true });
      const a = kit.stepAnim(id);
      const lift = a.press > 0.5 ? cc : 0;
      const ry = rect.y + lift;
      kit.rect(rect.x + cc * 2, ry + cc * 2, rect.w, rect.h, c.ink);
      kit.nine('paper', rect.x, ry, rect.w, rect.h);
      pin(kit, rect.x + rect.w / 2, ry + cc * 4, c.red);
      // название переносится по словам; размер подбирается так, чтобы самое длинное слово не рвалось
      const textW = rect.w - cc * 10;
      const size = kit.text.fitWords(ct.name, textW, kit.fs(11));
      const step = kit.text.lineStep(size);
      const lines = kit.text.wrap(ct.name, textW, size);
      lines.forEach((ln, k) => kit.drawText(ln, rect.x + cc * 5, ry + cc * 10 + k * step, { size, color: c.ink, baseline: 'top' }));
      if (ct.cargo) kit.icon('cart', rect.x + cc * 7, ry + rect.h - cc * 14, Math.round(16 * L.ui), c.cyanDark);
      // награда: число прижато вправо, значок монеты — перед ним по измеренной ширине, чтобы не налезать на цифры
      const rewardStr = fmtCompact(ct.reward);
      const rewardSize = kit.fs(12);
      const rewardW = kit.text.measure(rewardStr, rewardSize);
      kit.drawText(rewardStr, rect.x + rect.w - cc * 4, ry + rect.h - cc * 7, { size: rewardSize, color: c.amberDeep, align: 'right' });
      kit.icon('coin', rect.x + rect.w - cc * 4 - rewardW - cc * 4 - Math.round(7 * L.ui), ry + rect.h - cc * 7, Math.round(14 * L.ui), c.amberDeep);
      if (kit.S.focusVisible && kit.S.focusId === id) kit.focusRing(rect);
      if (st.sel === `sheet:${i}`) kit.focusRing({ x: rect.x, y: ry, w: rect.w, h: rect.h }, c.red);
      if (kit.clicked === id) st.sel = st.sel === `sheet:${i}` ? null : `sheet:${i}`;
    }
    return contentH;
  });
}

function pin(kit, cx, cy, color) {
  const cc = kit.cell();
  kit.rect(cx - cc * 2, cy - cc * 2, cc * 4, cc * 4, kit.c.ink);
  kit.rect(cx - cc, cy - cc, cc * 2, cc * 2, color);
}

// ---------- полка наград ----------

function medalProgress(app, a) {
  if (!app.rules.conditionProgress) return null;
  try {
    const pr = app.rules.conditionProgress(a.cond, app.profile);
    return pr && pr.need > 0 ? pr : null;
  } catch {
    return null;
  }
}

function drawAwards(app, kit, L, r, st, rects) {
  const c = kit.c;
  const cc = kit.cell();
  const list = app.data.ACHIEVEMENTS || [];
  const done = new Set(app.profile.achievements || []);
  kit.nine('glass', r.x, r.y, r.w, r.h);
  kit.hit('journal-shelf', r, {});
  const headH = Math.round(34 * L.ui);
  kit.icon('trophy', r.x + L.pad + 10 * L.ui, r.y + headH / 2 + cc, Math.round(24 * L.ui), c.gold);
  kit.drawText(`${done.size}/${list.length}`, r.x + L.pad + 28 * L.ui, r.y + headH / 2 + cc, { size: kit.fs(14), color: c.amberLight, shadow: true });
  const area = { x: r.x + cc * 2, y: r.y + headH + cc * 2, w: r.w - cc * 4, h: r.h - headH - cc * 4 };
  if (!list.length) return;
  // выполненные впереди
  const ordered = [...list].sort((a, b) => Number(done.has(b.id)) - Number(done.has(a.id)));
  const cell = Math.max(L.touch(56), Math.round(68 * L.ui));
  const cols = Math.max(1, Math.floor((area.w - cc * 3) / cell));
  const rows = Math.ceil(ordered.length / cols);
  const plankH = cc * 3;
  kit.scrollArea('journal-ach', area, rows * (cell + plankH), (top) => {
    const x0 = area.x + Math.round((area.w - cc * 3 - cols * cell) / 2);
    for (let row = 0; row < rows; row++) {
      const py = top + row * (cell + plankH) + cell;
      kit.rect(area.x + cc, py, area.w - cc * 4, plankH, c.cork1);
      kit.rect(area.x + cc, py, area.w - cc * 4, cc, c.cork2);
      kit.rect(area.x + cc, py + plankH - cc, area.w - cc * 4, cc, c.cork0);
    }
    ordered.forEach((a, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const rect = { x: x0 + col * cell, y: top + row * (cell + plankH), w: cell, h: cell };
      const ok = done.has(a.id);
      const id = `medal-${a.id}`;
      rects[`medal:${a.id}`] = rect;
      kit.hit(id, rect, { focusable: true });
      const ani = kit.stepAnim(id);
      const lift = ani.hover > 0.5 ? -cc : 0;
      const s = Math.round(cell * 0.56);
      kit.icon('trophy', rect.x + cell / 2, rect.y + cell * 0.46 + lift, s, ok ? c.gold : c.steel0, ok ? 1 : 0.9);
      if (ok) kit.lamp(rect.x + cell - cc * 6, rect.y + cc * 6, cc * 4, c.green, true);
      else {
        const pr = medalProgress(app, a);
        if (pr) kit.ledBar({ x: rect.x + cc * 4, y: rect.y + cell - cc * 8, w: cell - cc * 8, h: cc * 5 }, { value: clamp(pr.have / pr.need, 0, 1), color: c.amber, segments: 6 });
      }
      if (st.sel === `medal:${a.id}`) kit.focusRing({ x: rect.x + cc * 2, y: rect.y + cc * 2, w: cell - cc * 4, h: cell - cc * 4 }, c.amberLight);
      if (kit.S.focusVisible && kit.S.focusId === id) kit.focusRing(rect);
      if (kit.clicked === id) st.sel = st.sel === `medal:${a.id}` ? null : `medal:${a.id}`;
    });
    return rows * (cell + plankH);
  });
}

// ---------- щиток ----------

function drawJournalCallout(app, kit, L, G, st, contracts, rects) {
  const [kind, id] = st.sel.split(':');
  const target = rects[st.sel];
  if (!target) {
    st.sel = null;
    return;
  }
  const u = L.ui;
  const innerW = Math.min(Math.round(310 * u), 420, L.area.w - L.gap * 2) - L.pad * 2;
  if (kind === 'sheet') {
    const ct = contracts[Number(id)];
    if (!ct) return;
    const descH = Math.round(kit.text.blockHeight(ct.desc || '', innerW, kit.fs(11), 1.25));
    infoCallout(app, kit, {
      id: 'sheet',
      target,
      bounds: G.body,
      name: ct.name,
      iconName: ct.cargo ? 'cart' : 'contract',
      rows: [],
      locks: [],
      noBuy: true,
      cost: { coins: ct.reward },
      tag: ct.cargo ? t('journal.cargo') : '',
      extraH: descH + L.gap,
      extra: (r) => {
        kit.paragraph(ct.desc || '', r.x, r.y + L.gap * 0.5, r.w, { size: kit.fs(11), color: kit.c.textDim, lineHeight: 1.25 });
        return descH + L.gap;
      },
    });
    return;
  }
  const a = (app.data.ACHIEVEMENTS || []).find((x) => x.id === id);
  if (!a) return;
  const ok = (app.profile.achievements || []).includes(id);
  const pr = ok ? null : medalProgress(app, a);
  const descH = Math.round(kit.text.blockHeight(a.desc || '', innerW, kit.fs(11), 1.25));
  const barH = pr ? Math.round(26 * u) : 0;
  infoCallout(app, kit, {
    id: 'medal',
    target,
    bounds: G.body,
    name: a.name,
    iconName: 'trophy',
    rows: [],
    locks: [],
    noBuy: true,
    cost: ok ? null : { coins: a.reward },
    doneText: ok ? t('journal.ach.done') : undefined,
    extraH: descH + barH + L.gap,
    extra: (r) => {
      kit.paragraph(a.desc || '', r.x, r.y + L.gap * 0.5, r.w, { size: kit.fs(11), color: kit.c.textDim, lineHeight: 1.25 });
      let h = descH + L.gap;
      if (pr) {
        kit.progress({ x: r.x, y: r.y + h, w: r.w, h: Math.round(20 * u) }, clamp(pr.have / pr.need, 0, 1), { label: `${fmtInt(pr.have)}/${fmtInt(pr.need)}`, color: kit.c.amber });
        h += barH;
      }
      return h;
    },
  });
  void oneLine;
}
