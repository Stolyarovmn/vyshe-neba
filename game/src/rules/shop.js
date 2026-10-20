// The shop in the journal: consumables for the next flight and cosmetic skins.

import { SHOP, SKINS } from '../data/index.js';
import { lockCoins, produce } from './common.js';
import { applyProgress } from './progress.js';

const MAX_STOCK = 9;

export function buyConsumable(profile, id) {
  const item = SHOP.find((entry) => entry.id === id);
  if (!item) return { ok: false, reasons: [{ kind: 'unknown', text: 'Такого товара нет' }], profile };
  if ((profile.inventory[id] ?? 0) >= MAX_STOCK) return { ok: false, reasons: [{ kind: 'max', text: 'Склад полон' }], profile };
  if (profile.coins < item.price) return { ok: false, reasons: [lockCoins(profile, item.price)], profile };
  const next = produce(profile, (draft) => {
    draft.coins -= item.price;
    draft.inventory[id] = (draft.inventory[id] ?? 0) + 1;
  });
  return { ok: true, reasons: [], profile: next };
}

export function buySkin(profile, id) {
  const skin = SKINS.find((entry) => entry.id === id);
  if (!skin) return { ok: false, reasons: [{ kind: 'unknown', text: 'Такой раскраски нет' }], profile };
  if (profile.skins.includes(id)) return { ok: false, reasons: [{ kind: 'owned', text: 'Уже куплено' }], profile };
  if (profile.coins < skin.price) return { ok: false, reasons: [lockCoins(profile, skin.price)], profile };
  const bought = produce(profile, (draft) => {
    draft.coins -= skin.price;
    draft.skins.push(id);
    draft.skin = id;
  });
  const progressed = applyProgress(bought);
  return { ok: true, reasons: [], profile: progressed.profile, awarded: progressed.awarded };
}

export function selectSkin(profile, id) {
  if (!profile.skins.includes(id)) return { ok: false, reasons: [{ kind: 'locked', text: 'Раскраска не куплена' }], profile };
  if (profile.skin === id) return { ok: true, reasons: [], profile };
  return { ok: true, reasons: [], profile: produce(profile, (draft) => { draft.skin = id; }) };
}
