// Evaluators for the declarative conditions of achievements and contracts.
// Altitude and distance in the profile are meters; a flight result carries game units (see METERS_PER_UNIT).

import { MAX_PART_LEVEL, METERS_PER_UNIT } from '../data/economy.js';

const sum = (object) => Object.values(object).reduce((total, value) => total + value, 0);

// Achievement conditions: how far the profile is from the goal.
export function conditionProgress(cond, profile) {
  switch (cond.type) {
    case 'stat': return { have: profile.stats[cond.key] ?? 0, need: cond.min };
    case 'maxAlt': return { have: profile.milestones.maxAlt, need: cond.min };
    case 'partsTotal': return { have: sum(profile.parts), need: cond.min };
    case 'partMax': return { have: Math.max(0, ...Object.values(profile.parts)), need: MAX_PART_LEVEL };
    case 'era': return { have: profile.era, need: cond.min };
    case 'skins': return { have: profile.skins.length, need: cond.min };
    case 'allBodies': {
      const have = (profile.stats.flights >= 1 ? 1 : 0) + (profile.stats.moon >= 1 ? 1 : 0) + (profile.stats.mars >= 1 ? 1 : 0);
      return { have, need: 3 };
    }
    default: throw new Error(`Unknown condition type "${cond.type}"`);
  }
}

export function evalCondition(cond, profile) {
  const { have, need } = conditionProgress(cond, profile);
  return have >= need;
}

// Contract goals. `ctx` is null outside a flight; flight goals are then never satisfied.
export function evalGoal(goal, profile, ctx) {
  if (goal.type === 'era') return profile.era >= goal.min;
  if (!ctx) return false;
  const { result, body, landed } = ctx;
  const altM = (result.maxAlt ?? 0) * METERS_PER_UNIT;
  switch (goal.type) {
    case 'flightAlt': return altM >= goal.min;
    case 'land': return landed;
    case 'flightDistance': return (result.distance ?? 0) * METERS_PER_UNIT >= goal.min;
    case 'pickups': return (result.pickups ?? 0) >= goal.min;
    case 'rings': return (result.rings ?? 0) >= goal.min;
    case 'landOn': return landed && body === goal.body;
    case 'perfect': return landed && !!result.perfect;
    case 'perfectOn': return landed && !!result.perfect && body === goal.body;
    case 'stormLand': return landed && (result.stormTime ?? 0) >= goal.min;
    case 'cleanLand': return landed && (result.hpLeft01 ?? 0) >= 0.999;
    case 'flightTime': return (result.time ?? 0) >= goal.min;
    case 'fuelLand': return landed && (result.fuelLeft01 ?? 0) >= goal.min;
    case 'near': return (result.near ?? 0) >= goal.min;
    case 'chuteLand': return landed && !!result.usedChute;
    case 'landAlt': return landed && altM >= goal.min;
    default: throw new Error(`Unknown goal type "${goal.type}"`);
  }
}
