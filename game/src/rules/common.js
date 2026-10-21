// Shared helpers of the rules package: immutable updates, requirement checks, locked reasons.

import { BUILDINGS, ERAS, PARTS } from '../data/index.js';
import { MAX_BUILDING_LEVEL, MAX_PART_LEVEL } from '../data/economy.js';

export function clone(value) {
  return structuredClone(value);
}

// Applies `change(draft)` to a deep copy and returns the copy. The input is never touched.
export function produce(profile, change) {
  const draft = clone(profile);
  change(draft);
  return draft;
}

export function buildingCap(profile, key) {
  const lead = BUILDINGS[key].lead ?? 0;
  return Math.min(MAX_BUILDING_LEVEL, ERAS[profile.era].cap.building + lead);
}

export function partCap(profile) {
  return Math.min(MAX_PART_LEVEL, ERAS[profile.era].cap.part);
}

export const lockEra = (profile, era) => ({
  kind: 'era',
  era,
  have: profile.era,
  text: `Нужна эпоха ${ERAS[era].year}`,
});

export const lockBuilding = (profile, building, level) => ({
  kind: 'building',
  building,
  level,
  have: profile.buildings[building] ?? 0,
  text: `${BUILDINGS[building].need} ур. ${level}`,
});

export const lockPart = (profile, part, level) => ({
  kind: 'part',
  part,
  level,
  have: profile.parts[part] ?? 0,
  text: `${PARTS[part].need} ур. ${level}`,
});

// Returns the lock entry of an unmet requirement or null when it holds.
export function unmetRequirement(profile, req) {
  if (req.era != null) return profile.era >= req.era ? null : lockEra(profile, req.era);
  if (req.building) return (profile.buildings[req.building] ?? 0) >= req.level ? null : lockBuilding(profile, req.building, req.level);
  if (req.part) return (profile.parts[req.part] ?? 0) >= req.level ? null : lockPart(profile, req.part, req.level);
  throw new Error(`Unknown requirement ${JSON.stringify(req)}`);
}

export function unmetRequirements(profile, requires) {
  const out = [];
  for (const req of requires) {
    const lock = unmetRequirement(profile, req);
    if (lock) out.push(lock);
  }
  return out;
}

export const lockCoins = (profile, need) => ({
  kind: 'coins',
  need,
  have: profile.coins,
  text: `Нужно ещё ${need - profile.coins} монет`,
});

export const lockData = (profile, need) => ({
  kind: 'data',
  need,
  have: profile.data,
  text: `Нужно ещё ${need - profile.data} данных`,
});

export function resourceLocks(profile, cost, data) {
  const out = [];
  if (profile.coins < cost) out.push(lockCoins(profile, cost));
  if (profile.data < data) out.push(lockData(profile, data));
  return out;
}
