// Hazards: aircraft, balloons and airships, asteroids and orbital debris.
//
// Altitude bands, class shares, transitions and generation mixes follow the two traffic documents:
//   outputs/rocket/study/aircraft-traffic-by-altitude-and-era.md  (aircraft)
//   outputs/rocket/docs/AEROSTAT_TRAFFIC.md                       (balloons and airships)
// Heights are world units (1 unit = 10 m, so 1 km = 100). Per-era arrays are indexed by the base era 0..5.
// Positions are analytic functions of time, so hazards need no integration.

import { smoothstep } from './bodies.js';
import { chance, nextFloat, pickWeighted, randInt, range } from './rng.js';

export const CORRIDOR_HALF = 130; // nothing static spawns this close to the pad column while low
export const CORRIDOR_ALT = 300;
// Over Earth nothing that can hit the rocket (aircraft, balloons, airships, asteroids, debris, satellites) appears below this
// height: the first 4 km are a clean sky for learning and take-off. Coins, rings and fuel are not affected.
export const OBSTACLE_FLOOR = 400;
export const AIRCRAFT_CEILING = 10000; // no aircraft in space
const DENSITY = 0.5; // share of spawn attempts that may succeed where the sky is fully populated
const PLANE_WEIGHT = 0.9;
const TRACK_SPAN = 3200;
const ASTEROID_RADIUS = 28; // the "medium" size

// --- aircraft: one line of evolution per lineage, six eras each --------------------------------------------------

export const AIRCRAFT = {
  low_primary: { mix: 'standard', min: [450, 450, 450, 450, 450, 450], max: [800, 800, 850, 900, 900, 950], speed: [36, 46], r: 30 },
  low_multiwing: { mix: 'standard', min: [450, 450, 450, 450, 450, 450], max: [800, 800, 850, 900, 900, 950], speed: [34, 44], r: 30 },
  medium_passenger: { mix: 'standard', min: [800, 800, 900, 1200, 1300, 1300], max: [1800, 1800, 1800, 1850, 1900, 2050], speed: [50, 60], r: 36 },
  medium_cargo: { mix: 'standard', min: [800, 800, 800, 900, 900, 900], max: [1600, 1600, 1600, 1700, 1800, 1900], speed: [42, 52], r: 38 },
  high_fighter: { mix: 'fighter', min: [1800, 1800, 1800, 1800, 1800, 1800], max: [2200, 2300, 2550, 2800, 3100, 3300], speed: [80, 100], r: 26 },
  high_experimental: { mix: 'experimental', min: [2200, 2300, 2550, 2800, 3100, 3300], max: [3000, 3300, 4300, 5800, 7600, 9650], speed: [90, 120], r: 30 },
};

// Who flies where, as shares of the traffic in each altitude layer. `density` thins the rare high layers.
export const AIRCRAFT_LAYERS = [
  { from: 450, to: 800, density: 1, shares: { low_primary: 0.7, low_multiwing: 0.3 } },
  { from: 800, to: 1200, density: 1, shares: { medium_cargo: 0.5, medium_passenger: 0.35, low_primary: 0.105, low_multiwing: 0.045 } },
  { from: 1200, to: 1800, density: 1, shares: { medium_passenger: 0.6, medium_cargo: 0.35, high_fighter: 0.05 } },
  { from: 1800, to: 2800, density: 1, shares: { high_fighter: 0.7, high_experimental: 0.3 } },
  { from: 2800, to: 5800, density: 0.9, shares: { high_experimental: 1 } },
  { from: 5800, to: 8800, density: 0.25, shares: { high_experimental: 1 } },
  { from: 8800, to: AIRCRAFT_CEILING, density: 0.05, shares: { high_experimental: 1 } },
];

// --- balloons and airships: low, mid and high lines -----------------------------------------------------------

export const AEROSTATS = {
  low: { weight: 0.55, min: [450, 450, 500, 500, 550, 600], max: [600, 750, 850, 950, 1150, 1300], r: 25 },
  mid: { weight: 0.45, min: [550, 600, 650, 750, 800, 900], max: [800, 900, 1100, 1250, 1400, 1600], r: 30 },
  high: { weight: 0.4, min: [2550, 2800, 3000, 3600, 2800, 3300], max: [3800, 4000, 4300, 4300, 4600, 5300], r: 28 },
};
const AEROSTAT_FADE = 0.15; // first and last 15% of a band fade in and out

export const ASTEROID_SIZES = [
  { size: 'medium', scale: 1, weight: 0.55, damage: 1 },
  { size: 'large', scale: 1.6, weight: 0.33, damage: 1.15 },
  { size: 'huge', scale: 2.5, weight: 0.12, damage: 1.35 },
];

export const DAMAGE_FACTOR = { plane: 1.2, balloon: 0.8, asteroid: 1.3, debris: 1 };

// Transition width around a boundary: +-500 m, or +-1 km at the big changes at 18 km and 28 km.
function transition(at) {
  return at === 1800 || at === 2800 ? 100 : 50;
}

function ramp(alt, edge) {
  const f = transition(edge);
  return smoothstep(edge - f, edge + f, alt);
}

// Share of an aircraft line's own band (the era table) that is open at `alt`: 0 outside, soft at both ends.
export function aircraftAvailability(lineage, era, alt) {
  const def = AIRCRAFT[lineage];
  const min = def.min[era];
  const max = def.max[era];
  // The lowest bands start at 4.5 km, so their +-500 m transition begins exactly at the obstacle floor.
  return alt < OBSTACLE_FLOOR ? 0 : ramp(alt, min) * (1 - ramp(alt, max));
}

// How much of an altitude layer applies at `alt` (layers blend across their boundaries and sum to 1).
export function layerWeight(layer, alt) {
  const rise = layer === AIRCRAFT_LAYERS[0] ? 1 : ramp(alt, layer.from);
  const fall = layer.to >= AIRCRAFT_CEILING ? 1 : 1 - ramp(alt, layer.to);
  return alt >= OBSTACLE_FLOOR && alt < AIRCRAFT_CEILING ? rise * fall : 0;
}

export function aircraftWeight(lineage, era, alt) {
  const available = aircraftAvailability(lineage, era, alt);
  if (available <= 0) return 0;
  let sum = 0;
  for (const layer of AIRCRAFT_LAYERS) {
    const share = layer.shares[lineage];
    if (share) sum += layerWeight(layer, alt) * layer.density * share;
  }
  return PLANE_WEIGHT * sum * available;
}

function aerostatWeight(line, era, alt) {
  const def = AEROSTATS[line];
  const min = def.min[era];
  const max = def.max[era];
  if (alt <= min || alt >= max) return 0;
  const edge = (max - min) * AEROSTAT_FADE;
  return def.weight * Math.min(1, (alt - min) / edge, (max - alt) / edge);
}

function candidates(bodyId, era, alt) {
  const list = [];
  if (bodyId === 'earth') {
    for (const lineage of Object.keys(AIRCRAFT)) {
      const weight = aircraftWeight(lineage, era, alt);
      if (weight > 0) list.push({ kind: 'plane', motion: 'track', lineage, def: AIRCRAFT[lineage], weight });
    }
    for (const line of Object.keys(AEROSTATS)) {
      const weight = aerostatWeight(line, era, alt);
      if (weight > 0) list.push({ kind: 'balloon', motion: 'sway', lineage: line, def: AEROSTATS[line], weight });
    }
    if (alt >= 5000) list.push({ kind: 'asteroid', motion: 'drift', lineage: 'rock', def: {}, weight: alt >= 8500 ? 0.2 : 0.3 });
    if (alt >= 7500) list.push({ kind: 'debris', motion: 'track', lineage: 'satellite', def: { r: 32, speed: [26, 40] }, weight: alt >= 8500 ? 0.3 : 0.12 });
  } else if (alt >= 150) {
    list.push({ kind: 'asteroid', motion: 'drift', lineage: 'rock', def: {}, weight: 0.5 * Math.min(1, (alt - 150) / 200) });
  }
  return list;
}

// --- which generation of sprite flies: the world changes gradually, not at one stroke ----------------------------

export function pickGeneration(rs, era, choice, alt) {
  if (era === 0 || (choice.kind !== 'plane' && choice.kind !== 'balloon')) return 0;
  const roll = nextFloat(rs);
  if (choice.kind === 'balloon') {
    if (era === 1) return roll < 0.7 ? 1 : 0;
    return roll < 0.7 ? era : roll < 0.95 ? era - 1 : randInt(rs, era - 1);
  }
  const mix = choice.def.mix;
  if (mix === 'fighter') return roll < 0.85 ? era : era - 1;
  if (mix === 'experimental') {
    const previousCeiling = AIRCRAFT.high_experimental.max[era - 1];
    return alt > previousCeiling || roll < 0.9 ? era : era - 1;
  }
  if (era === 1) return roll < 0.8 ? 1 : 0;
  return roll < 0.75 ? era : roll < 0.95 ? era - 1 : randInt(rs, era - 1);
}

function makeHazard(rs, id, choice, x, alt, era) {
  const def = choice.def;
  const rock = choice.kind === 'asteroid' ? pickWeighted(rs, ASTEROID_SIZES, (s) => s.weight) : null;
  const radius = rock ? Math.round(ASTEROID_RADIUS * rock.scale * 10) / 10 : def.r;
  const hazard = {
    id,
    kind: choice.kind,
    hazard: true,
    lineage: choice.lineage,
    gen: pickGeneration(rs, era, choice, alt),
    r: radius,
    radius,
    active: true,
    near: false,
    marked: false,
    warned: false,
    motion: choice.motion,
    ox: x,
    oy: -alt,
    x,
    y: -alt,
    vx: 0,
    vy: 0,
    dir: chance(rs, 0.5) ? 1 : -1,
    speed: def.speed ? range(rs, def.speed[0], def.speed[1]) : 0,
    phase: nextFloat(rs),
    dx: choice.motion === 'drift' ? range(rs, -12, 12) / (rock?.scale ?? 1) : 0,
    dy: choice.motion === 'drift' ? range(rs, -8, 8) / (rock?.scale ?? 1) : 0,
  };
  if (rock) {
    hazard.size = rock.size;
    hazard.damageScale = rock.damage;
  }
  positionHazard(hazard, 0);
  return hazard;
}

// Places that stay free of hazards: the launch/landing column near the ground, the arrival column over Moon/Mars,
// and (for a gentle first flight) the whole low sky.
function isProtected(ctx, x, alt) {
  if (ctx.quiet && alt < CORRIDOR_ALT) return true;
  if (alt < CORRIDOR_ALT && Math.abs(x - ctx.padX) < CORRIDOR_HALF) return true;
  if (ctx.bodyId === 'earth') return false;
  return Math.abs(x) < 250 || Math.abs(x - ctx.padX) < 200;
}

// ctx: { bodyId, era, x0, alt0, width, height, padX, quiet, nextId }
export function spawnHazards(rs, ctx) {
  const out = [];
  const attempts = 1 + Math.floor(ctx.era / 3);
  for (let i = 0; i < attempts; i++) {
    const x = ctx.x0 + range(rs, 45, ctx.width - 45);
    const alt = ctx.alt0 + range(rs, 25, ctx.height - 25);
    if (ctx.bodyId === 'earth' && alt < OBSTACLE_FLOOR) continue;
    const options = candidates(ctx.bodyId, ctx.era, alt);
    const total = options.reduce((sum, o) => sum + o.weight, 0);
    const roll = nextFloat(rs);
    const choice = pickWeighted(rs, options, (o) => o.weight);
    if (!choice || roll > total * DENSITY) continue;
    if (isProtected(ctx, x, alt)) continue;
    out.push(makeHazard(rs, ctx.nextId(), choice, x, alt, ctx.era));
  }
  return out;
}

export function positionHazard(o, t) {
  if (o.motion === 'track') {
    const travel = ((((o.phase * TRACK_SPAN + o.speed * t) % TRACK_SPAN) + TRACK_SPAN) % TRACK_SPAN) - TRACK_SPAN / 2;
    const bob = o.phase * 6.2832;
    o.x = o.ox + o.dir * travel;
    o.y = o.oy + Math.sin(t * 0.3 + bob) * 6;
    o.vx = o.dir * o.speed;
    o.vy = Math.cos(t * 0.3 + bob) * 1.8;
  } else if (o.motion === 'sway') {
    const a = t * 0.15 + o.phase * 6.2832;
    const b = t * 0.22 + o.phase * 6.2832;
    o.x = o.ox + Math.sin(a) * 16;
    o.y = o.oy + Math.sin(b) * 8;
    o.vx = Math.cos(a) * 16 * 0.15;
    o.vy = Math.cos(b) * 8 * 0.22;
  } else {
    o.x = o.ox + o.dx * t;
    o.y = o.oy + o.dy * t;
    o.vx = o.dx;
    o.vy = o.dy;
  }
}

// Hull damage for a collision at relative speed `speed`.
export function collisionDamage(hazard, speed, debrisResist) {
  const factor = (DAMAGE_FACTOR[hazard.kind] ?? 1) * (hazard.damageScale ?? 1);
  return Math.max(3, Math.min(100, Math.round((6 + speed * 0.48 - debrisResist) * factor)));
}
