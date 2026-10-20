// Hazards: aircraft, balloons and airships, asteroids and orbital debris.
// Altitude bands follow outputs/rocket/docs/AEROSTAT_TRAFFIC.md and study/aircraft-traffic-by-altitude-and-era.md
// (heights in world units, 1 unit = 10 m). Positions are analytic functions of time, so hazards need no integration.

import { chance, nextFloat, pickWeighted, randInt, range } from './rng.js';

export const PLANE_FLOOR = 110; // aircraft never spawn near the launch corridor
export const CORRIDOR_HALF = 130; // nothing spawns this close to the pad column while low
export const CORRIDOR_ALT = 300;
const DENSITY = 0.5; // share of spawn attempts that may succeed where the sky is fully populated
const TRACK_SPAN = 3200;
const FADE = 0.15; // share of a band used for fading in and out

// Per-era arrays are indexed by the base era 0..5.
const PLANES = [
  { lineage: 'low_primary', weight: 0.5, min: [30, 30, 30, 30, 30, 30], max: [300, 300, 350, 400, 400, 450], speed: [36, 46], r: 30 },
  { lineage: 'low_multiwing', weight: 0.22, min: [30, 30, 30, 30, 30, 30], max: [300, 300, 350, 400, 400, 450], speed: [34, 44], r: 30 },
  { lineage: 'medium_passenger', weight: 0.5, min: [300, 300, 400, 600, 700, 700], max: [1200, 1200, 1200, 1250, 1300, 1400], speed: [50, 60], r: 36 },
  { lineage: 'medium_cargo', weight: 0.35, min: [300, 300, 300, 400, 400, 400], max: [1000, 1000, 1000, 1100, 1200, 1300], speed: [42, 52], r: 38 },
  { lineage: 'high_fighter', weight: 0.4, min: [1200, 1200, 1200, 1200, 1200, 1200], max: [1500, 1600, 1800, 2000, 2300, 2500], speed: [80, 100], r: 26 },
  { lineage: 'high_experimental', weight: 0.3, min: [1500, 1600, 1800, 2000, 2300, 2500], max: [2200, 2500, 3500, 5000, 7000, 9500], speed: [90, 120], r: 30 },
];

const AEROSTATS = [
  { lineage: 'low', weight: 0.55, min: [20, 30, 50, 80, 100, 150], max: [150, 250, 350, 450, 550, 700], r: 25 },
  { lineage: 'mid', weight: 0.45, min: [100, 150, 200, 250, 300, 400], max: [300, 400, 500, 650, 800, 1000], r: 30 },
  { lineage: 'high', weight: 0.4, min: [1800, 2000, 2200, 2800, 2000, 2500], max: [3000, 3200, 3500, 3500, 3800, 4500], r: 28 },
];

export const DAMAGE_FACTOR = { plane: 1.2, balloon: 0.8, asteroid: 1.3, debris: 1 };

// Weight of a band [min, max] at `alt`: ramps in over the first 15%, ramps out over the last 15%.
export function bandWeight(alt, min, max) {
  if (alt <= min || alt >= max) return 0;
  const edge = (max - min) * FADE;
  return Math.min(1, (alt - min) / edge, (max - alt) / edge);
}

function candidates(bodyId, era, alt) {
  const list = [];
  if (bodyId === 'earth') {
    for (const p of PLANES) {
      const w = p.weight * bandWeight(alt, Math.max(p.min[era], PLANE_FLOOR), p.max[era]);
      if (w > 0) list.push({ kind: 'plane', motion: 'track', def: p, weight: w });
    }
    for (const a of AEROSTATS) {
      const w = a.weight * bandWeight(alt, a.min[era], a.max[era]);
      if (w > 0) list.push({ kind: 'balloon', motion: 'sway', def: a, weight: w });
    }
    if (alt >= 5000) list.push({ kind: 'asteroid', motion: 'drift', def: { lineage: 'rock', r: 28 }, weight: alt >= 8500 ? 0.2 : 0.3 });
    if (alt >= 7500) list.push({ kind: 'debris', motion: 'track', def: { lineage: 'satellite', r: 32, speed: [26, 40] }, weight: alt >= 8500 ? 0.3 : 0.12 });
  } else if (alt >= 150) {
    list.push({ kind: 'asteroid', motion: 'drift', def: { lineage: 'rock', r: 28 }, weight: 0.5 * Math.min(1, (alt - 150) / 200) });
  }
  return list;
}

// Newer worlds still show older machines: 75% current, 20% previous, 5% older.
function pickGeneration(rs, era) {
  if (era === 0) return 0;
  const roll = nextFloat(rs);
  if (era === 1) return roll < 0.8 ? 1 : 0;
  if (roll < 0.75) return era;
  if (roll < 0.95) return era - 1;
  return randInt(rs, era - 1);
}

function makeHazard(rs, id, choice, x, alt, era) {
  const def = choice.def;
  const hazard = {
    id,
    kind: choice.kind,
    hazard: true,
    lineage: def.lineage,
    gen: choice.kind === 'plane' || choice.kind === 'balloon' ? pickGeneration(rs, era) : 0,
    r: def.r,
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
    dx: choice.motion === 'drift' ? range(rs, -12, 12) : 0,
    dy: choice.motion === 'drift' ? range(rs, -8, 8) : 0,
  };
  positionHazard(hazard, 0);
  return hazard;
}

// Places that stay free of hazards: the launch/landing column near the ground and the arrival column over Moon/Mars.
function isProtected(ctx, x, alt) {
  if (alt < CORRIDOR_ALT && Math.abs(x - ctx.padX) < CORRIDOR_HALF) return true;
  if (ctx.bodyId === 'earth') return false;
  return Math.abs(x) < 250 || Math.abs(x - ctx.padX) < 200;
}

// ctx: { bodyId, era, x0, alt0, width, height, padX, nextId }
export function spawnHazards(rs, ctx) {
  const out = [];
  const attempts = 1 + Math.floor(ctx.era / 3);
  for (let i = 0; i < attempts; i++) {
    const x = ctx.x0 + range(rs, 45, ctx.width - 45);
    const alt = ctx.alt0 + range(rs, 25, ctx.height - 25);
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
  const raw = Math.round((6 + speed * 0.48 - debrisResist) * (DAMAGE_FACTOR[hazard.kind] ?? 1));
  return Math.max(3, Math.min(100, raw));
}
