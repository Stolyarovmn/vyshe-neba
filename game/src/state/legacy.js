// Import of the previous edition's save (outputs/rocket/dist/engine.js fresh(), v: 2).
// The two games share ideas, not rules, so this is an approximation:
//  - base level -> era, upgrades -> module levels rescaled to 18 steps and capped by the era;
//  - buildings are granted so that every imported module meets its requirements and the power holds;
//  - modules the new rules cannot support in that era are refunded as coins;
//  - statistics, achievements, skins and finished contracts are copied.

import { BUILDINGS, BUILDING_KEYS, ERAS, PARTS, PART_IDS } from '../data/index.js';
import { MAX_BUILDING_LEVEL, MAX_PART_LEVEL } from '../data/economy.js';
import { powerBalance } from '../rules/base.js';
import { fresh, normalizeProfile } from './profile.js';

// Old module id -> [new module id, old maximum level].
const MODULE_MAP = {
  fuel: ['tank', 20],
  engine: ['engine', 20],
  legs: ['legs', 12],
  hull: ['hull', 15],
  fins: ['fins', 18],
  parachute: ['parachute', 12],
  booster: ['booster', 8],
};

export function isLegacySave(raw) {
  return raw !== null && typeof raw === 'object' && raw.upgrades && typeof raw.upgrades === 'object'
    && Number.isFinite(raw.base) && !raw.parts;
}

const clampInt = (value, min, max) => Math.min(max, Math.max(min, Math.floor(Number.isFinite(value) ? value : min)));

// The lowest building levels that let `part` reach `level`, or null when the era does not allow it.
function buildingNeeds(part, level, era) {
  const needs = {};
  for (const requirement of PARTS[part].levels[level - 1].requires) {
    if (requirement.era != null) {
      if (requirement.era > era) return null;
    } else if (requirement.building) {
      const building = BUILDINGS[requirement.building];
      if (building.minEra > era || requirement.level > era + 1 + (building.lead ?? 0)) return null;
      needs[requirement.building] = Math.max(needs[requirement.building] ?? 0, requirement.level);
    }
  }
  return needs;
}

// Raise dependencies (energy node, base building) until every level has what it needs.
function closeDependencies(levels) {
  let changed = true;
  while (changed) {
    changed = false;
    for (const key of BUILDING_KEYS) {
      const level = levels[key];
      if (level < 2) continue;
      for (const [dep, need] of requiredDependencies(key, level)) {
        if (levels[dep] < need) {
          levels[dep] = need;
          changed = true;
        }
      }
    }
  }
}

function requiredDependencies(key, level) {
  return BUILDINGS[key].levels[level - 1].requires.filter((r) => r.building).map((r) => [r.building, r.level]);
}

export function importLegacySave(old) {
  const profile = fresh();
  const issues = ['Сохранение старой версии: прогресс перенесён приближённо'];
  const era = clampInt(old.base, 0, ERAS.length - 1);
  profile.era = era;
  profile.coins = clampInt(old.coins, 0, Number.MAX_SAFE_INTEGER);
  // Eras already left earned their data.
  for (let e = 0; e < era; e++) profile.data += Math.round(ERAS[e].advance.data * 0.5);

  const partCap = ERAS[era].cap.part;
  const needs = {};
  for (const [oldId, [newId, oldMax]] of Object.entries(MODULE_MAP)) {
    const oldLevel = clampInt(old.upgrades?.[oldId], 0, oldMax);
    let level = Math.min(partCap, Math.round((oldLevel * MAX_PART_LEVEL) / oldMax));
    while (level > 0 && !buildingNeeds(newId, level, era)) level -= 1;
    for (let l = level + 1; l <= Math.min(partCap, Math.round((oldLevel * MAX_PART_LEVEL) / oldMax)); l++) {
      profile.coins += PARTS[newId].levels[l - 1].cost; // refund of a level the new rules cannot hold yet
    }
    profile.parts[newId] = level;
    for (let l = 1; l <= level; l++) {
      for (const [building, need] of Object.entries(buildingNeeds(newId, l, era))) needs[building] = Math.max(needs[building] ?? 0, need);
    }
  }

  // Buildings: what the modules need, plus the visible base of that era (one level below the cap).
  for (const key of BUILDING_KEYS) {
    const spec = BUILDINGS[key];
    const standard = era >= 1 && spec.minEra <= era ? Math.min(era, era + (spec.lead ?? 0)) : 0;
    profile.buildings[key] = clampInt(Math.max(needs[key] ?? 0, standard), 0, MAX_BUILDING_LEVEL);
  }
  closeDependencies(profile.buildings);
  while (powerBalance(profile).ratio < 1 && profile.buildings.energy < Math.min(MAX_BUILDING_LEVEL, era + 1 + BUILDINGS.energy.lead)) {
    profile.buildings.energy += 1;
    closeDependencies(profile.buildings);
  }

  const inventory = old.inventory ?? {};
  profile.inventory = {
    chute: clampInt(inventory.chute, 0, 99),
    repair: clampInt(inventory.repair, 0, 99),
    canister: clampInt(inventory.canister ?? inventory.boost, 0, 99),
    magnet: clampInt(inventory.magnet, 0, 99),
  };
  profile.skins = Array.isArray(old.skins) ? old.skins.filter((id) => typeof id === 'string') : ['classic'];
  profile.skin = typeof old.skin === 'string' ? old.skin : 'classic';

  const st = old.stats ?? {};
  for (const key of Object.keys(profile.stats)) {
    if (key === 'mars') continue;
    profile.stats[key] = clampInt(st[key], 0, Number.MAX_SAFE_INTEGER);
  }
  profile.stats.mars = clampInt(st.cargo, 0, Number.MAX_SAFE_INTEGER);
  profile.milestones = {
    maxAlt: clampInt(st.alt, 0, Number.MAX_SAFE_INTEGER),
    softLandings: profile.stats.landings,
    moonLanding: profile.stats.moon > 0,
    marsLanding: profile.stats.mars > 0,
  };
  profile.achievements = Array.isArray(old.achievements) ? old.achievements : [];
  profile.contracts.done = [...(Array.isArray(old.missions) ? old.missions : []), ...(Array.isArray(old.skippedMissions) ? old.skippedMissions : [])];
  profile.settings.master = old.settings?.muted ? 0 : profile.settings.master;
  profile.settings.reduceMotion = old.settings?.shake === false;

  const normalized = normalizeProfile(profile);
  return { profile: normalized.profile, issues: [...issues, ...normalized.issues] };
}
