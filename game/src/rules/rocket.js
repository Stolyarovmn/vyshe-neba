// Rocket stats derived from the modules plus the base, and the FlightConfig handed to the simulation.
//
// Units follow the simulation (STAGE_DEFAULTS in sim/config.js): thrust is acceleration at full throttle,
// fuel and burnRate are per second at full throttle, mass is relative. Values are rounded so that the
// config stays readable in saves and logs.

import { ERAS, PARTS, TRANSFER_COST } from '../data/index.js';
import { STAGE_DEFAULTS } from '../sim/config.js';
import { deriveBase } from './base.js';
import { availableDestinations } from './destinations.js';

const round = (value, digits = 2) => Math.round(value * 10 ** digits) / 10 ** digits;

function moduleStats(profile, id) {
  const level = profile.parts[id] ?? 0;
  return level > 0 ? PARTS[id].levels[level - 1].stats : PARTS[id].base;
}

export function deriveRocket(profile) {
  const base = deriveBase(profile);
  const eraBonus = ERAS[profile.era].bonus;
  const engine = moduleStats(profile, 'engine');
  const tank = moduleStats(profile, 'tank');
  const hull = moduleStats(profile, 'hull');
  const booster = moduleStats(profile, 'booster');
  const capsule = moduleStats(profile, 'capsule');
  const legs = moduleStats(profile, 'legs');
  const fins = moduleStats(profile, 'fins');
  const avionics = moduleStats(profile, 'avionics');
  const { effects } = base;

  const burnScale = engine.burnRate / STAGE_DEFAULTS.core.burnRate; // 1 for the stock engine, lower is better
  const coreThrust = engine.thrust;

  const stages = [];
  if (booster.fuel > 0) {
    stages.push({
      id: 'booster',
      thrust: round(coreThrust * booster.thrustRatio * (1 + effects.boosterPower), 1),
      fuel: round(booster.fuel * (1 + effects.padFuel), 1),
      burnRate: round(STAGE_DEFAULTS.booster.burnRate * burnScale, 2),
      mass: STAGE_DEFAULTS.booster.mass,
      turn: STAGE_DEFAULTS.booster.turn,
    });
  }
  stages.push({
    id: 'core',
    thrust: round(coreThrust, 1),
    fuel: round(tank.fuel * (1 + eraBonus.fuel + effects.tankBonus), 1),
    burnRate: engine.burnRate,
    mass: STAGE_DEFAULTS.core.mass,
    turn: STAGE_DEFAULTS.core.turn,
  });
  stages.push({
    id: 'capsule',
    thrust: round(coreThrust * capsule.thrustRatio, 1),
    fuel: round(capsule.fuel * (1 + effects.padFuel), 1),
    burnRate: round(STAGE_DEFAULTS.capsule.burnRate * burnScale, 3),
    mass: STAGE_DEFAULTS.capsule.mass,
    turn: STAGE_DEFAULTS.capsule.turn,
  });

  const flightHull = { hp: hull.hp, debrisResist: round(Math.min(0.9, hull.debrisResist + 0.5 * effects.hullWear), 3) };
  const flightLegs = { vTol: legs.vTol, hTol: legs.hTol, angTol: legs.angTol };
  const flightFins = { turn: fins.turn, dragCut: fins.dragCut, maxTilt: fins.maxTilt };
  const flightAvionics = { predict: avionics.predict, assist: avionics.assist };
  const limits = {
    speed: Math.min(190, engine.speed + 2 * profile.era),
    fall: Math.min(125, 88 + 2 * (profile.parts.legs ?? 0) + 2 * profile.era),
  };
  const transferCost = {
    moon: round(TRANSFER_COST.moon * (1 - avionics.transferSave), 3),
    mars: round(TRANSFER_COST.mars * (1 - avionics.transferSave), 3),
  };

  // Flat numbers for the "was -> becomes" bars of the rocket screen.
  const summary = {
    thrust: stages.find((s) => s.id === 'core').thrust,
    burnRate: engine.burnRate,
    speed: limits.speed,
    fuel: stages.find((s) => s.id === 'core').fuel,
    boosterFuel: booster.fuel > 0 ? stages[0].fuel : 0,
    capsuleFuel: stages[stages.length - 1].fuel,
    totalFuel: round(stages.reduce((sum, s) => sum + s.fuel, 0), 1),
    hp: flightHull.hp,
    debrisResist: flightHull.debrisResist,
    vTol: flightLegs.vTol,
    hTol: flightLegs.hTol,
    angTol: flightLegs.angTol,
    turn: flightFins.turn,
    dragCut: flightFins.dragCut,
    maxTilt: flightFins.maxTilt,
    maxTiltDeg: Math.round((flightFins.maxTilt * 180) / Math.PI),
    predict: flightAvionics.predict,
    assist: flightAvionics.assist,
    transferSave: avionics.transferSave,
  };

  return {
    stages,
    hull: flightHull,
    legs: flightLegs,
    fins: flightFins,
    avionics: flightAvionics,
    limits,
    transferCost,
    summary,
  };
}

// Consumables that start the flight: asked for and in stock, plus the ones the base hands out for free.
export function resolveConsumables(profile, requested = {}) {
  const { effects } = deriveBase(profile);
  const stock = profile.inventory;
  const free = { chute: effects.freeChute > 0, canister: effects.freeCanister > 0, repair: false, magnet: false };
  const out = {};
  const paid = {};
  for (const id of ['chute', 'repair', 'canister', 'magnet']) {
    const wanted = !!requested[id];
    const inStock = (stock[id] ?? 0) > 0;
    paid[id] = wanted && !free[id] && inStock ? 1 : 0;
    out[id] = free[id] || (wanted && inStock) ? 1 : 0;
  }
  return { active: out, paid };
}

export function makeFlightConfig(profile, { destination = 'earth', consumables = {}, seed = 1 } = {}) {
  const open = availableDestinations(profile).find((d) => d.id === destination);
  if (!open) throw new RangeError(`Unknown destination "${destination}"`);
  if (!open.ok) throw new RangeError(`Destination "${destination}" is closed: ${open.reasons.map((r) => r.text).join('; ')}`);

  const rocket = deriveRocket(profile);
  const base = deriveBase(profile);
  return {
    seed: Math.floor(seed),
    era: profile.era,
    destination,
    skin: profile.skin,
    stages: rocket.stages,
    hull: rocket.hull,
    legs: rocket.legs,
    fins: rocket.fins,
    avionics: rocket.avionics,
    base: base.flight,
    consumables: resolveConsumables(profile, consumables).active,
    transferCost: rocket.transferCost,
    limits: rocket.limits,
  };
}

