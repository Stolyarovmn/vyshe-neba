// Economy constants shared by data, rules and the balance bot. Plain numbers only.
// Units: coins, data; altitude and distance are stored in METERS in the profile
// (a flight result reports game units, 1 unit = METERS_PER_UNIT meters).

import { METERS_PER_UNIT, SPACE_ALT } from '../sim/bodies.js';

export { METERS_PER_UNIT, SPACE_ALT };
export const SPACE_LINE_M = SPACE_ALT * METERS_PER_UNIT;

export const MAX_PART_LEVEL = 18;
export const MAX_BUILDING_LEVEL = 6;
export const MAX_ERA = 5;
export const PART_LEVELS_PER_ERA = 3;

export const START_COINS = 0;
export const START_DATA = 0;

// The launch table brings its own small generator, so the first buildings work without an energy node.
export const BASE_POWER_SUPPLY = 12;

// Base prices of modules and buildings are multiplied by these before rounding.
export const PART_PRICE_SCALE = 0.5;
export const BUILDING_PRICE_SCALE = 0.58;

// The sum of all discounts (era, factory, service) never exceeds this share of the price.
export const MAX_DISCOUNT = 0.5;

// Flight payout. travel = (K * (km + OFFSET) ^ EXP + SQRT_DIST * sqrt(meters)) * body multiplier * income.
export const PAYOUT = {
  travelK: 6.5,
  travelOffsetKm: 0.3,
  travelExp: 0.85,
  distanceK: 0.2,
  landingBonus: 12, // soft touchdown, before the era scale
  perfectBonus: 20, // extra for a perfect touchdown, multiplied by the beacon bonus
  crashTravelShare: 0.5, // share of the path payout kept after a crash
  eraScale: 0.2, // every era adds this share to landing bonuses
  body: {
    earth: { mult: 1, expedition: 0 },
    moon: { mult: 1.25, expedition: 600 },
    mars: { mult: 1.6, expedition: 1000 },
  },
};

// Crash loss: a share of everything ever spent on rocket modules, never more than half of the purse.
export const CRASH_LOSS = { partValueShare: 0.045, minimum: 12, purseShare: 0.5 };

// Data. A flight yields a trickle on landing; first-time zones and first body landings pay lump sums.
export const DATA_GAIN = {
  landingBase: 0.5,
  landingPerSqrtKm: 0.28,
  abandoned: 0,
  firstLanding: { moon: 110, mars: 280 },
  repeatLanding: { moon: 12, mars: 26 },
};

// Altitude zones (meters) with the data paid when the profile crosses them for the first time.
export const ZONES = [
  { id: 'low-air', name: 'Нижний воздух', from: 0, data: 0 },
  { id: 'treetops', name: 'Выше сосен', from: 1000, data: 2 },
  { id: 'clouds', name: 'Облачный слой', from: 3000, data: 4 },
  { id: 'stratosphere', name: 'Стратосфера', from: 12000, data: 9 },
  { id: 'high-route', name: 'Высотный маршрут', from: 30000, data: 16 },
  { id: 'mesosphere', name: 'Мезосфера', from: 50000, data: 24 },
  { id: 'space-edge', name: 'Край космоса', from: 85000, data: 36 },
  { id: 'space', name: 'Космос', from: SPACE_LINE_M, data: 60 },
  { id: 'deep-space', name: 'Глубокий космос', from: 120000, data: 40 },
];

export const OVERHEAD = {
  cycleSeconds: 30, // results screen, shopping and countdown between two flights
  purchaseSeconds: 4,
};

export function metersFromUnits(units) {
  return units * METERS_PER_UNIT;
}
