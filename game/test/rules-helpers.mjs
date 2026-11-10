// Shared helpers of the data/rules/economy tests (not a test file itself).

import { fresh } from '../src/state/index.js';

export function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

// A fresh profile with some fields replaced; nested objects are merged one level deep.
export function makeProfile(patch = {}) {
  const profile = fresh();
  for (const [key, value] of Object.entries(patch)) {
    if (value && typeof value === 'object' && !Array.isArray(value) && profile[key] && typeof profile[key] === 'object') {
      Object.assign(profile[key], value);
    } else {
      profile[key] = value;
    }
  }
  return profile;
}

// A plausible landed result; override what a test cares about.
export function landedResult(patch = {}) {
  return {
    outcome: 'landed',
    perfect: false,
    destination: 'earth',
    maxAlt: 120,
    distance: 300,
    time: 70,
    fuelLeft01: 0.3,
    hpLeft01: 1,
    coinsPicked: 12,
    rings: 0,
    pickups: 2,
    near: 0,
    stormTime: 0,
    usedChute: false,
    reason: null,
    landing: { v: 4, h: 2, ang: 0.05 },
    ...patch,
  };
}

export function crashedResult(patch = {}) {
  return landedResult({ outcome: 'crashed', reason: 'landing-speed', hpLeft01: 0, landing: { v: 40, h: 2, ang: 0.05 }, ...patch });
}
