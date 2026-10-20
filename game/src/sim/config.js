// FlightConfig defaults and normalisation. createFlight accepts a partial config and fills the gaps here.

// Reference stage numbers of the unimproved rocket (all modules at level 0).
// thrust: acceleration at full throttle, units/s²; fuel/burnRate: tank content and use per second at full throttle;
// mass: relative dry mass (only ratios matter); turn: rotation speed, rad/s.
export const STAGE_DEFAULTS = {
  booster: { thrust: 104, fuel: 60, burnRate: 11.7, mass: 0.6, turn: 0.9 },
  core: { thrust: 72, fuel: 175, burnRate: 9, mass: 1, turn: 1.1 },
  capsule: { thrust: 61, fuel: 45, burnRate: 3.15, mass: 0.35, turn: 1.4 },
};

export const START_STAGE_IDS = ['core', 'capsule'];

const BASE_DEFAULTS = {
  radar: 0,
  beacons: 0,
  weather: 0,
  income: 1,
  fuelDropRate: 1,
  repairOnLand: 0,
  rescueRefund: 0,
  padSafety: 0,
  dataMult: 1,
  perfectBonus: 1,
};

function num(value, fallback) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function section(input, defaults) {
  const out = {};
  for (const key of Object.keys(defaults)) out[key] = num(input?.[key], defaults[key]);
  return out;
}

function normalizeStage(input) {
  const id = input?.id in STAGE_DEFAULTS ? input.id : 'core';
  const d = STAGE_DEFAULTS[id];
  const fuel = Math.max(0, num(input?.fuel, d.fuel));
  return {
    id,
    thrust: Math.max(1, num(input?.thrust, d.thrust)),
    fuel,
    burnRate: Math.max(0.001, num(input?.burnRate, d.burnRate)),
    mass: Math.max(0.01, num(input?.mass, d.mass)),
    turn: Math.max(0.1, num(input?.turn, d.turn)),
  };
}

// `start` puts the rocket straight into the air: over Moon/Mars on approach, or over Earth (practice and tests).
function normalizeStart(input) {
  if (!input || !['earth', 'moon', 'mars'].includes(input.body)) return null;
  return {
    body: input.body,
    alt: input.alt == null ? null : num(input.alt, null),
    x: num(input.x, 0),
    angle: num(input.angle, 0),
    vx: num(input.vx, 0),
    vy: input.vy == null ? null : num(input.vy, null),
    padOffset: input.padOffset == null ? null : num(input.padOffset, null),
    stageIndex: Math.max(0, Math.floor(num(input.stageIndex, 0))),
    fuel01: Math.max(0, Math.min(1, num(input.fuel01, 1))),
  };
}

export function normalizeConfig(input = {}) {
  const stageInputs = Array.isArray(input.stages) && input.stages.length
    ? input.stages
    : START_STAGE_IDS.map((id) => ({ id }));
  const forcedWeather = ['clear', 'cloudy', 'rain', 'storm', 'dust'].includes(input.weather) ? input.weather : null;
  return {
    seed: Math.floor(num(input.seed, 1)),
    era: Math.max(0, Math.min(5, Math.floor(num(input.era, 0)))),
    destination: ['earth', 'moon', 'mars'].includes(input.destination) ? input.destination : 'earth',
    skin: typeof input.skin === 'string' ? input.skin : 'classic',
    stages: stageInputs.map(normalizeStage),
    hull: section(input.hull, { hp: 100, debrisResist: 0 }),
    legs: section(input.legs, { vTol: 13, hTol: 18, angTol: 0.32 }),
    fins: section(input.fins, { turn: 1, dragCut: 0 }),
    parachute: { level: Math.max(0, Math.floor(num(input.parachute?.level, 0))) },
    avionics: {
      predict: Math.max(0, Math.min(2, Math.floor(num(input.avionics?.predict, 0)))),
      assist: input.avionics?.assist ? 1 : 0,
    },
    base: section(input.base, BASE_DEFAULTS),
    consumables: {
      chute: input.consumables?.chute ? 1 : 0,
      repair: input.consumables?.repair ? 1 : 0,
      canister: input.consumables?.canister ? 1 : 0,
      magnet: input.consumables?.magnet ? 1 : 0,
    },
    transferCost: section(input.transferCost, { moon: 0.3, mars: 0.5 }),
    limits: {
      speed: input.limits?.speed == null ? null : num(input.limits.speed, null),
      fall: input.limits?.fall == null ? null : num(input.limits.fall, null),
    },
    weather: forcedWeather,
    start: normalizeStart(input.start),
  };
}
