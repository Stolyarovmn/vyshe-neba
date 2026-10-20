// Ready-made configs for tests, tools and the economy bot. The real game builds its config from the profile.

import { normalizeConfig } from './config.js';

// The unimproved rocket: core stage + capsule, no upgrades.
export function startRocket(overrides = {}) {
  return normalizeConfig({ seed: 1, era: 0, ...overrides });
}

// A late-game style rocket that can reach space and make a transfer: strong engines, big tanks, sturdy legs.
export function heavyRocket(overrides = {}) {
  return normalizeConfig({
    seed: 1,
    era: 3,
    stages: [
      { id: 'booster', thrust: 150, fuel: 160, burnRate: 11.7, mass: 0.8, turn: 1 },
      { id: 'core', thrust: 130, fuel: 520, burnRate: 9, mass: 1.2, turn: 1.4 },
      { id: 'capsule', thrust: 100, fuel: 150, burnRate: 3.15, mass: 0.4, turn: 1.6 },
    ],
    hull: { hp: 240, debrisResist: 8 },
    legs: { vTol: 28, hTol: 28, angTol: 0.5 },
    fins: { turn: 1.5, dragCut: 0.3 },
    parachute: { level: 6 },
    avionics: { predict: 2, assist: 1 },
    transferCost: { moon: 0.25, mars: 0.4 },
    ...overrides,
  });
}
