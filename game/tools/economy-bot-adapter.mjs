// Flight adapter of the economy bot: playFlight(config, plan) -> FlightResult (+ duration).
//
// ANALYTIC ESTIMATE, NOT THE REAL SIMULATION. It integrates a one-dimensional vertical flight with the
// gravity and atmosphere functions of sim/bodies.js, the stage numbers of the FlightConfig and a simple
// autopilot (cruise climb, coast to the target, suicide-burn landing), then turns the outcome into a
// FlightResult with a skill-based chance of a clean landing. Once sim/autopilot.js exists the bot can run
// the real thing with `--real`; the numbers of this file are then only the fallback.

import { BODIES, SPACE_ALT, densityAt, gravityAt } from '../src/sim/bodies.js';
import { METERS_PER_UNIT } from '../src/data/economy.js';
import { travelPay } from '../src/rules/index.js';

const DT = 0.2;
const MASS_SHED_BONUS = 0.35; // same rule as sim/rocket.js stageAccel
const RCS_WASTE = 0.06; // fuel the attitude jets burn on top of the main engine
const APPROACH = { alt: 1400, vMin: 28, vMax: 85 }; // sim/bodies.js approach block of Moon and Mars
const CACHE = new Map();

function makeStages(config, fuelScale = 1) {
  return config.stages.map((stage) => ({ ...stage, left: stage.fuel * fuelScale, gone: false }));
}

function activeIndex(stages) {
  for (let i = 0; i < stages.length; i++) if (!stages[i].gone) return i;
  return stages.length - 1;
}

function settle(stages) {
  for (let i = 0; i < stages.length - 1; i++) {
    if (!stages[i].gone && stages[i].left <= 1e-9) stages[i].gone = true;
    else if (!stages[i].gone) break;
  }
}

function accelOf(stages) {
  const dry = stages.reduce((sum, s) => sum + s.mass, 0);
  const attached = stages.filter((s) => !s.gone).reduce((sum, s) => sum + s.mass, 0);
  const stage = stages[activeIndex(stages)];
  return stage.thrust * (1 + MASS_SHED_BONUS * (1 - attached / dry));
}

function fuelLeft(stages) {
  return stages.reduce((sum, s) => sum + (s.gone ? 0 : s.left), 0);
}

function burn(stages, throttle, waste) {
  // Returns the share of the wanted burn that the tanks could deliver.
  let wanted = throttle * DT * (1 + waste);
  const stage = stages[activeIndex(stages)];
  const amount = wanted * stage.burnRate;
  if (amount <= 0) return 1;
  const used = Math.min(amount, stage.left);
  stage.left -= used;
  settle(stages);
  return used / amount;
}

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

// Hoverslam descent from (alt, v) on a body: coast, then a constant-deceleration burn that ends in a soft
// touchdown. Returns the touchdown speed and updates the stages.
function descend(state, body, stages, cfg, dragCut, waste) {
  const tol = cfg.legs.vTol * (1 + 0.25 * cfg.base.beacons);
  const vSoft = tol * 0.4;
  const fall = cfg.limits?.fall ?? 88;
  let engaged = false;
  for (let guard = 0; guard < 8000 && state.alt > 0; guard++) {
    const g = gravityAt(body, state.alt);
    const dens = densityAt(body, state.alt);
    const a = accelOf(stages);
    const speed = Math.max(0, -state.v);
    let throttle = 0;
    if (fuelLeft(stages) > 0 && speed > vSoft) {
      const net = Math.max(1, a - g);
      const wanted = (speed * speed - vSoft * vSoft) / (2 * Math.max(state.alt, 1));
      if (wanted >= 0.6 * net) engaged = true;
      if (engaged) throttle = clamp((g + Math.min(wanted, net) * 1.05) / a, 0, 1);
    } else if (engaged && fuelLeft(stages) > 0) {
      throttle = clamp(g / a, 0, 1); // hover the last meters
    }
    const delivered = throttle > 0 ? burn(stages, throttle, waste) : 1;
    const acc = throttle * delivered * a - g - dens * 0.13 * (1 - dragCut) * state.v;
    state.v = clamp(state.v + acc * DT, -fall, 9999);
    state.alt += state.v * DT;
    state.t += DT;
  }
  return Math.max(0, -state.v);
}

// Climb + coast to `target` (units). `orbit` stops at the space line and keeps the fuel for a transfer.
// Above 0.95 of the space line gravity is gone, so the rocket has to brake itself with a retro burn.
function fly(config, target, { orbit = false, waste = 0.3 } = {}) {
  const earth = BODIES.earth;
  const stages = makeStages(config);
  const dragCut = config.fins.dragCut;
  const climbCap = (config.limits?.speed ?? 68) * 0.96;
  const goal = orbit ? SPACE_ALT + 40 : target;
  const state = { alt: 0, v: 0, t: 0, max: 0 };
  let phase = 'climb';
  for (let guard = 0; guard < 12000; guard++) {
    const g = gravityAt(earth, state.alt);
    const dens = densityAt(earth, state.alt);
    const a = accelOf(stages);
    let throttle = 0;
    let direction = 1;
    if (phase === 'climb') {
      const gAvg = Math.max(0.5, gravityAt(earth, state.alt + (state.v * state.v) / (4 * Math.max(g, 1))));
      const apex = state.alt + (state.v * state.v) / (2 * gAvg);
      const high = target >= SPACE_ALT * 0.95;
      if (state.alt >= goal || fuelLeft(stages) <= 0 || (!high && state.v > 0 && apex >= goal)) phase = 'coast';
      else throttle = clamp((g + dens * 0.22 * (1 - dragCut) * state.v + 3 * (climbCap - state.v)) / a, 0, 1);
    }
    if (phase === 'coast' && !orbit && g < 1.5 && state.v > 1 && fuelLeft(stages) > 0) {
      throttle = 1;
      direction = -1; // retro burn
    }
    const delivered = throttle > 0 ? burn(stages, throttle, waste) : 1;
    const drag = dens * (state.v > 0 ? 0.22 : 0.13) * (1 - dragCut);
    state.v += (direction * throttle * delivered * a - g - drag * state.v) * DT;
    state.v = clamp(state.v, -(config.limits?.fall ?? 88), climbCap * 1.4);
    state.alt += state.v * DT;
    state.t += DT;
    state.max = Math.max(state.max, state.alt);
    if (phase === 'coast' && (state.v <= 0 || (orbit && state.alt >= SPACE_ALT))) break;
    if (state.alt < 0) { state.alt = 0; break; }
  }
  if (!orbit && state.alt >= SPACE_ALT * 0.95 && g0(state) < 1.5) {
    // The brake left the rocket hanging in zero gravity: a short push down brings it back under the well.
    const push = 15;
    burn(stages, push / Math.max(accelOf(stages), 1) / DT, waste);
    state.v = -push;
    state.t += 1.5;
  }
  return { state, stages };
}

const g0 = (state) => gravityAt(BODIES.earth, state.alt);

// A full Earth sortie to `target` units: climb, coast, land.
function earthSortie(config, target, waste) {
  const { state, stages } = fly(config, target, { waste });
  const apex = state.max;
  const reached = apex >= target * 0.9;
  state.v = Math.min(state.v, 0);
  const touch = descend(state, BODIES.earth, stages, config, config.fins.dragCut, waste);
  const tol = config.legs.vTol * (1 + 0.25 * config.base.beacons);
  const capacity = config.stages.reduce((sum, s) => sum + s.fuel, 0);
  return { apex, reached, touch, tol, fuelLeft01: fuelLeft(stages) / capacity, time: state.t, ok: reached && touch <= tol * 0.9 };
}

// A trip to the Moon or Mars: climb to the space line, transfer, approach and land.
function expedition(config, bodyId, waste) {
  const { state, stages } = fly(config, SPACE_ALT, { orbit: true, waste });
  const reachedSpace = state.max >= SPACE_ALT;
  const core = config.stages.find((s) => s.id === 'core');
  const cost = (config.transferCost?.[bodyId] ?? 0.4) * core.fuel;
  // The transfer burns the core first, then whatever follows.
  let toPay = cost;
  for (const stage of stages) {
    if (stage.gone) continue;
    const taken = Math.min(toPay, stage.left);
    stage.left -= taken;
    toPay -= taken;
    if (toPay <= 0) break;
  }
  settle(stages);
  const capacity = config.stages.reduce((sum, s) => sum + s.fuel, 0);
  const paid = toPay <= 1e-9;
  const quality = clamp(fuelLeft(stages) / capacity / 0.5, 0, 1);
  const approach = { alt: APPROACH.alt, v: -(APPROACH.vMax + (APPROACH.vMin - APPROACH.vMax) * quality), t: state.t + 15, max: state.max };
  const body = BODIES[bodyId];
  const touch = descend(approach, body, stages, config, config.fins.dragCut, waste);
  const tol = config.legs.vTol * (1 + 0.25 * config.base.beacons);
  return {
    apex: state.max,
    reached: reachedSpace && paid,
    touch,
    tol,
    fuelLeft01: fuelLeft(stages) / capacity,
    time: approach.t,
    ok: reachedSpace && paid && touch <= tol * 0.9,
  };
}

// A human burns several times the ideal fuel (corrections, hovering, dodging) and flies slower than the
// cruise model: `waste` is the extra fuel share, `pace`/`base`/`cap` stretch the duration in seconds.
export const PILOT = { waste: 2.5, assistRelief: 0.8, pace: 1.4, base: 25, cap: 210 };

function wasteOf(config) {
  return PILOT.waste - PILOT.assistRelief * (config.avionics.assist ? 1 : 0); // a human pilot is not a perfect hoverslam
}

function cacheKey(config, destination, target) {
  const stages = config.stages.map((s) => [s.id, s.thrust, s.fuel, s.burnRate, s.mass].join(':')).join('|');
  return [destination, Math.round(target), wasteOf(config), stages, config.legs.vTol, config.base.beacons, config.fins.dragCut,
    config.limits?.speed, config.limits?.fall, config.avionics.assist, config.transferCost?.moon, config.transferCost?.mars].join('#');
}

export function simulateSortie(config, destination, target) {
  const key = cacheKey(config, destination, target);
  if (CACHE.has(key)) return CACHE.get(key);
  const waste = wasteOf(config);
  const out = destination === 'earth' ? earthSortie(config, target, waste) : expedition(config, destination, waste);
  if (CACHE.size > 20000) CACHE.clear();
  CACHE.set(key, out);
  return out;
}

// The highest altitude (units) of an Earth sortie that still ends with a soft landing on this config.
export function safeReach(config, ceiling = SPACE_ALT * 1.25) {
  let low = 0;
  let high = ceiling;
  if (simulateSortie(config, 'earth', Math.min(high, ceiling)).ok) return Math.min(high, ceiling);
  for (let i = 0; i < 14; i++) {
    const mid = (low + high) / 2;
    if (simulateSortie(config, 'earth', Math.max(20, mid)).ok) low = mid;
    else high = mid;
  }
  return low;
}

export function canExpedition(config, destination) {
  return simulateSortie(config, destination, SPACE_ALT).ok;
}

// Chance that the pilot actually brings the rocket down softly when the physics allow it.
export function landingChance(config, destination, altUnits, skill) {
  const legsBonus = 0.004 * (config.legs.vTol - 13) + 0.1 * config.base.beacons;
  const aids = 0.08 * config.avionics.assist + 0.03 * config.avionics.predict;
  const altKm = (altUnits * METERS_PER_UNIT) / 1000;
  const difficulty = 0.03 * Math.log2(1 + altKm) + (destination === 'moon' ? 0.06 : destination === 'mars' ? 0.1 : 0);
  return clamp(0.5 + 0.35 * skill + legsBonus + aids - difficulty, 0.3, 0.97);
}

export function flightSeconds(modelSeconds, destination) {
  const pilot = Math.min(PILOT.cap, PILOT.base + PILOT.pace * modelSeconds);
  return destination === 'earth' ? pilot : pilot + 20; // plus the transfer maneuver
}

// plan: { destination, target (units), skill (0..1), rng () -> 0..1 }
export function playFlight(config, plan) {
  const { destination, skill, rng } = plan;
  const target = destination === 'earth' ? plan.target : SPACE_ALT;
  const sortie = simulateSortie(config, destination, target);
  const altUnits = destination === 'earth' ? Math.min(sortie.apex, target) : Math.min(sortie.apex, SPACE_ALT * 1.01);
  const altM = altUnits * METERS_PER_UNIT;
  const distM = altM * (destination === 'earth' ? 2.1 : 2.6) * (0.9 + 0.2 * rng());
  const chance = sortie.ok ? landingChance(config, destination, altUnits, skill) : 0;
  const landed = sortie.ok && rng() < chance;
  const outcome = landed ? 'landed' : 'crashed';
  const perfect = landed && rng() < 0.2 + 0.45 * (chance - 0.5) + 0.2 * config.base.beacons;
  const km = altM / 1000;
  const reference = travelPay(altM, distM, destination, 1);
  const rings = Math.floor(rng() * (1.2 + Math.min(3, km ** 0.3)));
  const pickups = Math.floor(1 + rng() * (2 + Math.min(6, km ** 0.4))) + rings;
  const duration = flightSeconds(sortie.time, destination);
  return {
    outcome,
    perfect,
    destination,
    body: destination,
    maxAlt: altUnits,
    distance: distM / METERS_PER_UNIT,
    time: duration,
    fuelLeft01: sortie.fuelLeft01,
    hpLeft01: landed ? (rng() < 0.6 ? 1 : 0.8) : 0,
    coinsPicked: Math.round(reference * (0.22 + 0.2 * rng()) * (config.consumables.magnet ? 1.15 : 1)),
    rings,
    pickups,
    near: Math.floor(rng() * 3),
    stormTime: rng() < 0.14 ? Math.round(6 + rng() * 14) : 0,
    usedChute: false,
    reason: landed ? null : 'landing-speed',
    landing: { v: landed ? sortie.tol * 0.4 : sortie.tol * 1.6, h: 0, ang: 0 },
    duration,
    estimate: { safe: sortie.ok, chance },
  };
}
