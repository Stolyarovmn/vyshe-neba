// The Profile: everything that is saved. fresh() builds a new game, normalizeProfile() repairs an
// untrusted object, validateProfile() lists what is wrong with a profile.

import { ACHIEVEMENTS, BUILDING_KEYS, CONTRACT_TEMPLATES, PART_IDS, SKINS } from '../data/index.js';
import { MAX_BUILDING_LEVEL, MAX_ERA, MAX_PART_LEVEL, START_COINS, START_DATA } from '../data/economy.js';

export const PROFILE_VERSION = 1;

const INVENTORY_KEYS = ['chute', 'repair', 'canister', 'magnet'];
const STAT_KEYS = ['flights', 'landings', 'crashes', 'perfect', 'streak', 'bestStreak', 'distance', 'earned',
  'rings', 'pickups', 'near', 'storm', 'moon', 'mars', 'parachutes', 'saved', 'airtime'];
const CONTROL_MODES = ['arcade', 'pilot'];
const TOUCH_LAYOUTS = ['right', 'left'];

const zeros = (keys) => Object.fromEntries(keys.map((key) => [key, 0]));

export function defaultSettings() {
  return {
    master: 0.8,
    music: 0.6,
    sfx: 0.9,
    controlMode: 'arcade',
    reduceMotion: false,
    textScale: 1,
    colorblind: false,
    vibrate: true,
    touchLayout: 'right',
    tutorial: { done: false, step: 0 },
  };
}

export function fresh() {
  return {
    v: PROFILE_VERSION,
    coins: START_COINS,
    data: START_DATA,
    era: 0,
    parts: zeros(PART_IDS),
    buildings: zeros(BUILDING_KEYS),
    inventory: zeros(INVENTORY_KEYS),
    skins: ['classic'],
    skin: 'classic',
    milestones: { maxAlt: 0, softLandings: 0, moonLanding: false, marsLanding: false },
    stats: zeros(STAT_KEYS),
    achievements: [],
    contracts: { active: [], done: [], seed: 1 },
    settings: defaultSettings(),
  };
}

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isNumber = (value) => typeof value === 'number' && Number.isFinite(value);

function int(value, min, max, fallback, issues, label) {
  if (!isNumber(value)) {
    if (value !== undefined) issues.push(`${label}: не число`);
    return fallback;
  }
  const rounded = Math.floor(value);
  if (rounded < min || rounded > max) issues.push(`${label}: вне диапазона`);
  return Math.min(max, Math.max(min, rounded));
}

function unit(value, fallback, min, max, issues, label) {
  if (!isNumber(value)) {
    if (value !== undefined) issues.push(`${label}: не число`);
    return fallback;
  }
  return Math.min(max, Math.max(min, value));
}

function bool(value, fallback) {
  return typeof value === 'boolean' ? value : fallback;
}

function idList(value, known, issues, label) {
  if (!Array.isArray(value)) {
    if (value !== undefined) issues.push(`${label}: не список`);
    return [];
  }
  const out = [];
  for (const id of value) {
    if (typeof id === 'string' && known.has(id) && !out.includes(id)) out.push(id);
    else issues.push(`${label}: лишний элемент`);
  }
  return out;
}

function levels(raw, keys, max, issues, label) {
  const out = zeros(keys);
  if (!isObject(raw)) {
    if (raw !== undefined) issues.push(`${label}: не объект`);
    return out;
  }
  for (const key of keys) out[key] = int(raw[key], 0, max, 0, issues, `${label}.${key}`);
  return out;
}

function settingsFrom(raw, issues) {
  const base = defaultSettings();
  if (!isObject(raw)) {
    if (raw !== undefined) issues.push('settings: не объект');
    return base;
  }
  return {
    master: unit(raw.master, base.master, 0, 1, issues, 'settings.master'),
    music: unit(raw.music, base.music, 0, 1, issues, 'settings.music'),
    sfx: unit(raw.sfx, base.sfx, 0, 1, issues, 'settings.sfx'),
    controlMode: CONTROL_MODES.includes(raw.controlMode) ? raw.controlMode : base.controlMode,
    reduceMotion: bool(raw.reduceMotion, base.reduceMotion),
    textScale: unit(raw.textScale, base.textScale, 0.8, 2, issues, 'settings.textScale'),
    colorblind: bool(raw.colorblind, base.colorblind),
    vibrate: bool(raw.vibrate, base.vibrate),
    touchLayout: TOUCH_LAYOUTS.includes(raw.touchLayout) ? raw.touchLayout : base.touchLayout,
    tutorial: {
      done: bool(raw.tutorial?.done, false),
      step: int(raw.tutorial?.step, 0, 99, 0, issues, 'settings.tutorial.step'),
    },
  };
}

// Lenient repair. Returns { ok, profile, issues }. The object is rejected only when it does not look
// like a profile at all (no purse and no module levels).
export function normalizeProfile(raw) {
  const issues = [];
  if (!isObject(raw) || !isNumber(raw.coins) || !isObject(raw.parts) || !isObject(raw.buildings)) {
    return { ok: false, profile: fresh(), issues: ['Это не сохранение игры'] };
  }
  const base = fresh();
  const knownSkins = new Set(SKINS.map((skin) => skin.id));
  const skins = idList(raw.skins, knownSkins, issues, 'skins');
  if (!skins.includes('classic')) skins.unshift('classic');
  const rawStats = isObject(raw.stats) ? raw.stats : {};
  const stats = zeros(STAT_KEYS);
  for (const key of STAT_KEYS) stats[key] = int(rawStats[key], 0, Number.MAX_SAFE_INTEGER, 0, issues, `stats.${key}`);
  const rawMilestones = isObject(raw.milestones) ? raw.milestones : {};
  const rawContracts = isObject(raw.contracts) ? raw.contracts : {};

  const profile = {
    v: PROFILE_VERSION,
    coins: int(raw.coins, 0, Number.MAX_SAFE_INTEGER, base.coins, issues, 'coins'),
    data: int(raw.data, 0, Number.MAX_SAFE_INTEGER, base.data, issues, 'data'),
    era: int(raw.era, 0, MAX_ERA, 0, issues, 'era'),
    parts: levels(raw.parts, PART_IDS, MAX_PART_LEVEL, issues, 'parts'),
    buildings: levels(raw.buildings, BUILDING_KEYS, MAX_BUILDING_LEVEL, issues, 'buildings'),
    inventory: levels(raw.inventory, INVENTORY_KEYS, 99, issues, 'inventory'),
    skins,
    skin: skins.includes(raw.skin) ? raw.skin : 'classic',
    milestones: {
      maxAlt: int(rawMilestones.maxAlt, 0, Number.MAX_SAFE_INTEGER, 0, issues, 'milestones.maxAlt'),
      softLandings: int(rawMilestones.softLandings, 0, Number.MAX_SAFE_INTEGER, 0, issues, 'milestones.softLandings'),
      moonLanding: bool(rawMilestones.moonLanding, false),
      marsLanding: bool(rawMilestones.marsLanding, false),
    },
    stats,
    achievements: idList(raw.achievements, new Set(ACHIEVEMENTS.map((a) => a.id)), issues, 'achievements'),
    contracts: {
      active: idList(rawContracts.active, new Set(CONTRACT_TEMPLATES.map((t) => t.id)), issues, 'contracts.active'),
      done: idList(rawContracts.done, new Set(CONTRACT_TEMPLATES.map((t) => t.id)), issues, 'contracts.done'),
      seed: int(rawContracts.seed, 1, 2 ** 31, 1, issues, 'contracts.seed'),
    },
    settings: settingsFrom(raw.settings, issues),
  };
  return { ok: true, profile, issues };
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (isObject(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

// Strict check of an already normalized profile: the list of problems, empty when it is fine.
export function validateProfile(profile) {
  const { ok, issues, profile: normalized } = normalizeProfile(profile);
  if (!ok) return issues;
  const problems = [...issues];
  if (profile.v !== PROFILE_VERSION) problems.push('v: неверная версия');
  const same = canonical(normalized) === canonical({ ...profile, v: PROFILE_VERSION });
  if (!same && problems.length === 0) problems.push('Структура профиля отличается от эталона');
  return problems;
}

export function isValidProfile(profile) {
  return validateProfile(profile).length === 0;
}
