// Лавка: прилавок и две полки. Расходники и краски стоят предметами на полках; тап по предмету открывает щиток «купить».

import { t } from '../../i18n/index.js';
import { shopLayout } from '../layout.js';
import { fmtCompact } from '../format.js';
import { skinItems, shopItems } from '../bridge.js';
import { drawChrome, infoCallout } from './common.js';
import { mix } from '../theme.js';

const CONSUMABLE_ICON = { chute: 'chute', repair: 'repair', canister: 'canister', magnet: 'target' };
const STOCK_MAX = 9;

function state(app) {
  return ((app.ui ||= {}).shop ||= { sel: null });
}

export default {
  id: 'shop',
  background: 'shop',
  enter(app, params) {
    state(app).sel = params?.select || null;
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
    const F = shopLayout(L);
    const c = kit.c;
    drawChrome(app, kit, { back: true });
    const items = shopItems(app.mods);
    const skins = skinItems(app.mods);
    const rects = {};

    drawShelf(kit, F.shelf1, items.length, (i, cell, base) => {
      const it = items[i];
      const have = app.profile.inventory[it.id] || 0;
      rects[`item:${it.id}`] = cell;
      return shelfCell(kit, `shelf-${it.id}`, cell, base, {
        on: st.sel === `item:${it.id}`,
        draw: (cx, cy, s) => {
          kit.icon(CONSUMABLE_ICON[it.id] || 'info', cx, cy, s, c.text);
          if (have > 0) kit.drawText(`×${have}`, cx + s * 0.55, cy - s * 0.5, { size: kit.fs(12), color: c.amberLight, align: 'right', shadow: true });
        },
        price: it.price,
        full: have >= STOCK_MAX,
        click: () => {
          st.sel = st.sel === `item:${it.id}` ? null : `item:${it.id}`;
        },
      });
    });
    drawShelf(kit, F.shelf2, skins.length, (i, cell, base) => {
      const it = skins[i];
      const owned = app.profile.skins.includes(it.id);
      const sel = app.profile.skin === it.id;
      rects[`skin:${it.id}`] = cell;
      return shelfCell(kit, `shelf-skin-${it.id}`, cell, base, {
        on: st.sel === `skin:${it.id}`,
        draw: (cx, cy, s) => {
          drawPaintCan(kit, cx, cy, s, it.color || '#b63c43');
          if (sel) kit.lamp(cx + s * 0.55, cy - s * 0.5, kit.cell() * 5, c.green, true);
        },
        price: owned ? null : it.price,
        click: () => {
          st.sel = st.sel === `skin:${it.id}` ? null : `skin:${it.id}`;
        },
      });
    });

    // прилавок
    kit.nine('cork', F.counter.x, F.counter.y, F.counter.w, F.counter.h);
    kit.drawText(t('dock.shop'), F.counter.x + F.counter.w / 2, F.counter.y + F.counter.h / 2, { size: kit.fs(16), color: c.paper2, align: 'center', shadow: true });
    kit.icon('cart', F.counter.x + F.counter.h * 0.7, F.counter.y + F.counter.h / 2, Math.round(F.counter.h * 0.6), c.paper2);

    if (kit.emptyTap && st.sel && !kit.modalOpen) st.sel = null;
    if (st.sel) drawShopCallout(app, kit, F, st, rects, items, skins);
  },
};

// ---------- полки ----------

/** Полка: приборное стекло с досками снизу; draw(i, ячейка, уровень_доски) рисует предмет. */
function drawShelf(kit, r, count, draw) {
  const cc = kit.cell();
  const plankH = Math.max(kit.L.touch(28), cc * 12);
  kit.nine('glass', r.x, r.y, r.w, r.h);
  const plank = { x: r.x + cc, y: r.y + r.h - plankH - cc, w: r.w - cc * 2, h: plankH };
  kit.nine('cork', plank.x, plank.y, plank.w, plank.h);
  const cw = (r.w - cc * 4) / count;
  for (let i = 0; i < count; i++) {
    const cell = { x: Math.round(r.x + cc * 2 + i * cw), y: r.y + cc * 2, w: Math.round(cw), h: r.h - cc * 4 };
    draw(i, cell, plank);
  }
}

/** Предмет на полке: кнопка-область, спрайт над доской и ценник на доске. */
function shelfCell(kit, id, cell, plank, o) {
  const c = kit.c;
  const cc = kit.cell();
  kit.hit(id, cell, { focusable: true });
  const a = kit.stepAnim(id);
  const lift = a.hover > 0.5 && a.press < 0.5 ? -cc : a.press > 0.5 ? cc : 0;
  const room = plank.y - cell.y;
  const s = Math.max(cc * 10, Math.min(Math.round(cell.w * 0.78), Math.round(room * 0.72)));
  const cx = cell.x + cell.w / 2;
  const cy = cell.y + room * 0.52 + lift;
  if (o.on) kit.focusRing({ x: cx - s / 2 - cc, y: cy - s / 2 - cc, w: s + cc * 2, h: s + cc * 2 }, c.amberLight);
  // тень предмета на доске
  kit.rect(Math.round(cx - s * 0.4), plank.y - cc, Math.round(s * 0.8), cc, c.ink);
  o.draw(cx, cy, s);
  // ценник
  const th = Math.round(plank.h * 0.68);
  const label = o.price === null ? t('skin.own') : o.full ? t('shop.full') : fmtCompact(o.price);
  const tw = Math.min(cell.w - cc * 2, kit.text.measure(label, kit.fs(12)) + (o.price === null || o.full ? cc * 6 : th + cc * 4));
  const tx = Math.round(cx - tw / 2);
  const ty = Math.round(plank.y + (plank.h - th) / 2);
  kit.nine('screen', tx, ty, tw, th);
  if (o.price !== null && !o.full) {
    kit.icon('coin', tx + th * 0.55, ty + th / 2, Math.round(th * 0.7), c.gold);
    kit.drawText(label, tx + tw - cc * 3, ty + th / 2, { size: kit.fs(12), color: c.gold, align: 'right', maxWidth: tw - th - cc * 2 });
  } else kit.drawText(label, cx, ty + th / 2, { size: kit.fs(11), color: o.full ? c.textMute : c.green, align: 'center', maxWidth: tw - cc * 2 });
  if (kit.S.focusVisible && kit.S.focusId === id) kit.focusRing(cell);
  if (kit.clicked === id) o.click();
}

/** Банка краски цвета обшивки из клеток. */
function drawPaintCan(kit, cx, cy, s, color) {
  const cc = kit.cell();
  const c = kit.c;
  const w = Math.round((s * 0.72) / cc) * cc;
  const h = Math.round((s * 0.84) / cc) * cc;
  const x = Math.round(cx - w / 2);
  const y = Math.round(cy - h / 2);
  kit.rect(x, y, w, h, c.ink);
  kit.rect(x + cc, y + cc, w - cc * 2, h - cc * 2, color);
  kit.rect(x + cc, y + cc, cc, h - cc * 2, mix(color, '#ffffff', 0.35));
  kit.rect(x + w - cc * 2, y + cc, cc, h - cc * 2, mix(color, '#000000', 0.35));
  kit.rect(x - cc, y + cc * 2, w + cc * 2, cc * 3, c.ink);
  kit.rect(x, y + cc * 3, w, cc, c.steel2);
  kit.rect(x + cc * 2, y + Math.round(h * 0.5), w - cc * 4, cc * 3, c.paper1);
}

// ---------- щиток покупки ----------

function drawShopCallout(app, kit, F, st, rects, items, skins) {
  const [kind, id] = st.sel.split(':');
  const target = rects[st.sel];
  const p = app.profile;
  if (kind === 'item') {
    const it = items.find((x) => x.id === id);
    if (!it) return;
    const have = p.inventory[id] || 0;
    const full = have >= STOCK_MAX;
    infoCallout(app, kit, {
      id: 'shop-item',
      target,
      bounds: F.body,
      name: t(`cons.${id}`),
      iconName: CONSUMABLE_ICON[id] || 'info',
      tag: `×${have}`,
      line: t(`shop.line.${id}`),
      rows: [],
      locks: [],
      next: true,
      cost: { coins: it.price },
      canBuy: !full && p.coins >= it.price,
      buyLabel: full ? t('shop.full') : t('shop.buy'),
      buyId: `shop-buy-${id}`,
      onBuy: () => {
        const res = app.buyConsumable(id);
        if (res.ok) {
          kit.toast(t('shop.bought', { name: t(`cons.${id}`) }), { kind: 'good', icon: CONSUMABLE_ICON[id] });
          kit.spawnSparks(target.x + target.w / 2, target.y + target.h / 2, kit.c.amberLight);
        }
      },
    });
    return;
  }
  const it = skins.find((x) => x.id === id);
  if (!it) return;
  const owned = p.skins.includes(id);
  const sel = p.skin === id;
  infoCallout(app, kit, {
    id: 'shop-skin',
    target,
    bounds: F.body,
    name: it.name,
    iconName: 'brush',
    rows: [],
    locks: [],
    next: !sel,
    doneText: t('skin.selected'),
    cost: owned ? null : { coins: it.price },
    canBuy: owned || p.coins >= it.price,
    buyLabel: owned ? t('skin.select') : t('shop.buy'),
    buyId: `skin-${id}`,
    onBuy: () => {
      if (owned) {
        app.selectSkin(id);
        return;
      }
      const res = app.buySkin(id);
      if (res.ok) {
        kit.toast(t('skin.bought'), { kind: 'good', icon: 'brush' });
        app.selectSkin(id);
      }
    },
  });
}
