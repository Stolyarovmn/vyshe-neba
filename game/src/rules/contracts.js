// Contracts: templates are offered by era and by what the base can already do; a seeded pick keeps the
// list stable between sessions. The active list lives in profile.contracts.active.

import { BASE_CONTRACT_SLOTS, CONTRACT_TEMPLATES, MAX_CONTRACT_SLOTS } from '../data/index.js';
import { deriveBase } from './base.js';
import { produce } from './common.js';
import { evalGoal } from './goals.js';
import { availableDestinations } from './destinations.js';

const BY_ID = new Map(CONTRACT_TEMPLATES.map((template) => [template.id, template]));
const PICK_WINDOW = 3; // how many extra candidates the seeded pick may choose from

// Small integer hash: the same inputs always give the same order, no global random state.
function mix(seed, text) {
  let h = (seed ^ 0x9e3779b9) >>> 0;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x85ebca6b) >>> 0;
  h ^= h >>> 15;
  return Math.imul(h, 0x2c1b3c6d) >>> 0;
}

export function contractSlots(profile) {
  return Math.min(MAX_CONTRACT_SLOTS, BASE_CONTRACT_SLOTS + deriveBase(profile).effects.contractSlots);
}

function isOffered(template, profile, openDestinations) {
  const { from, until } = template;
  if (from.era != null && profile.era < from.era) return false;
  if (from.destination && !openDestinations.has(from.destination)) return false;
  if (from.part && (profile.parts[from.part] ?? 0) < from.level) return false;
  if (until && profile.era > until.era) return false;
  return true;
}

function view(template, profile) {
  const bonus = template.cargo ? deriveBase(profile).effects.cargoReward : 0;
  return {
    id: template.id,
    name: template.name,
    desc: template.desc,
    goal: template.goal,
    tier: template.tier,
    cargo: !!template.cargo,
    baseReward: template.reward,
    reward: Math.round(template.reward * (1 + bonus)),
  };
}

// The ids that should be active right now: kept ones first, then seeded picks to fill the free slots.
function activeIds(profile) {
  const done = new Set(profile.contracts.done);
  const kept = [];
  for (const id of profile.contracts.active) {
    if (BY_ID.has(id) && !done.has(id) && !kept.includes(id)) kept.push(id);
  }
  const slots = contractSlots(profile);
  const ids = kept.slice(0, slots);
  if (ids.length >= slots) return ids;

  const open = new Set(availableDestinations(profile).filter((d) => d.ok).map((d) => d.id));
  const pool = CONTRACT_TEMPLATES
    .filter((t) => !done.has(t.id) && !ids.includes(t.id) && isOffered(t, profile, open))
    .sort((a, b) => a.tier - b.tier);
  const need = slots - ids.length;
  const window = pool
    .slice(0, need + PICK_WINDOW)
    .sort((a, b) => mix(profile.contracts.seed, a.id) - mix(profile.contracts.seed, b.id));
  for (const template of window.slice(0, need)) ids.push(template.id);
  return ids;
}

export function listContracts(profile) {
  return activeIds(profile).map((id) => view(BY_ID.get(id), profile));
}

// Stores the current list in the profile (new copy).
export function refillContracts(profile) {
  const ids = activeIds(profile);
  const same = ids.length === profile.contracts.active.length && ids.every((id, i) => id === profile.contracts.active[i]);
  if (same) return profile;
  return produce(profile, (draft) => {
    draft.contracts.active = ids;
  });
}

// Completes every active contract whose goal holds. Rewards go into the purse and into stats.earned.
export function completeContracts(profile, ctx) {
  const list = listContracts(profile);
  const completed = list.filter((contract) => evalGoal(contract.goal, profile, ctx));
  if (completed.length === 0) return { profile: refillContracts(profile), completed: [] };
  const next = produce(profile, (draft) => {
    for (const contract of completed) {
      draft.coins += contract.reward;
      draft.stats.earned += contract.reward;
      draft.contracts.done.push(contract.id);
      draft.contracts.seed += 1;
    }
    draft.contracts.active = list.filter((c) => !completed.includes(c)).map((c) => c.id);
  });
  return { profile: refillContracts(next), completed: completed.map(({ id, name, reward }) => ({ id, name, reward })) };
}
