// Buying rocket modules and buildings. Both return { ok, reasons, profile }; a failed purchase hands back
// the same profile object, a successful one a fresh copy. Achievements and contracts that the purchase
// completes are applied immediately and listed in `awarded`.

import { BUILDINGS, ERAS, PARTS } from '../data/index.js';
import { MAX_BUILDING_LEVEL, MAX_DISCOUNT, MAX_PART_LEVEL } from '../data/economy.js';
import { deriveBase, powerBalance } from './base.js';
import { buildingCap, partCap, produce, resourceLocks, unmetRequirements } from './common.js';
import { applyProgress } from './progress.js';

export function partPrice(profile, id, baseCost) {
  const { effects } = deriveBase(profile);
  let discount = ERAS[profile.era].bonus.discount + effects.partDiscount;
  if (id === 'engine' || id === 'fins') discount += effects.discountEngineFins;
  return Math.max(1, Math.round(baseCost * (1 - Math.min(MAX_DISCOUNT, discount))));
}

export function buildingPrice(profile, baseCost) {
  const discount = Math.min(MAX_DISCOUNT, ERAS[profile.era].bonus.discount);
  return Math.max(1, Math.round(baseCost * (1 - discount)));
}

export function getPartState(profile, id) {
  const part = PARTS[id];
  if (!part) throw new Error(`Unknown part "${id}"`);
  const level = profile.parts[id] ?? 0;
  const maxed = level >= MAX_PART_LEVEL;
  const state = {
    id,
    name: part.name,
    level,
    max: MAX_PART_LEVEL,
    cap: partCap(profile),
    maxed,
    current: part.levels[level - 1]?.stats ?? part.base,
    next: null,
    locked: [],
    canBuy: false,
  };
  if (maxed) return state;
  const next = part.levels[level];
  state.next = {
    level: level + 1,
    cost: partPrice(profile, id, next.cost),
    baseCost: next.cost,
    data: next.data,
    stats: next.stats,
    requires: next.requires,
  };
  state.locked = [...unmetRequirements(profile, next.requires), ...resourceLocks(profile, state.next.cost, next.data)];
  state.canBuy = state.locked.length === 0;
  return state;
}

export function buyPart(profile, id) {
  const state = getPartState(profile, id);
  if (state.maxed) return { ok: false, reasons: [{ kind: 'max', text: 'Максимальный уровень' }], profile, awarded: emptyAward() };
  if (!state.canBuy) return { ok: false, reasons: state.locked, profile, awarded: emptyAward() };
  const bought = produce(profile, (draft) => {
    draft.coins -= state.next.cost;
    draft.data -= state.next.data;
    draft.parts[id] += 1;
  });
  const progressed = applyProgress(bought);
  return { ok: true, reasons: [], profile: progressed.profile, awarded: progressed.awarded };
}

export function getBuildingState(profile, key) {
  const building = BUILDINGS[key];
  if (!building) throw new Error(`Unknown building "${key}"`);
  const level = profile.buildings[key] ?? 0;
  const cap = buildingCap(profile, key);
  const maxed = level >= MAX_BUILDING_LEVEL;
  const current = level > 0 ? building.levels[level - 1] : null;
  const state = {
    id: key,
    name: building.name,
    level,
    max: MAX_BUILDING_LEVEL,
    cap,
    maxed,
    power: current ? { ...current.power } : { use: 0, supply: 0 },
    effects: current ? current.effects : {},
    next: null,
    locked: [],
    canBuy: false,
  };
  if (maxed) return state;
  const next = building.levels[level];
  state.next = {
    level: level + 1,
    cost: buildingPrice(profile, next.cost),
    baseCost: next.cost,
    data: next.data,
    power: { ...next.power },
    effects: next.effects,
    requires: next.requires,
  };
  state.locked = [...unmetRequirements(profile, next.requires), ...resourceLocks(profile, state.next.cost, next.data)];
  state.canBuy = state.locked.length === 0;
  return state;
}

export function buyBuilding(profile, key) {
  const state = getBuildingState(profile, key);
  if (state.maxed) return { ok: false, reasons: [{ kind: 'max', text: 'Максимальный уровень' }], profile, awarded: emptyAward() };
  if (!state.canBuy) return { ok: false, reasons: state.locked, profile, awarded: emptyAward() };
  const bought = produce(profile, (draft) => {
    draft.coins -= state.next.cost;
    draft.data -= state.next.data;
    draft.buildings[key] += 1;
  });
  const progressed = applyProgress(bought);
  return {
    ok: true,
    reasons: [],
    profile: progressed.profile,
    awarded: progressed.awarded,
    power: powerBalance(progressed.profile),
  };
}

export function emptyAward() {
  return { achievements: [], contracts: [] };
}
