// The world around the rocket: cells of objects generated on demand, plus rocket/object interaction.
// A cell is generated once from (seed, body, cell) alone, so nothing respawns when the rocket comes back.

import { BODIES, zoneAt } from './bodies.js';
import { chance, createRngState, hashSeed, range } from './rng.js';
import { createWeather, updateWeather } from './weather.js';
import { resetClouds, updateClouds } from './clouds.js';
import { collisionDamage, positionHazard, spawnHazards } from './hazards.js';
import {
  COIN_VALUE, FUEL_PICKUP_SHARE, MAGNET_BONUS, PICKUP_RADIUS, REPAIR_AMOUNT, RING_BOOST_TIME,
  RING_IMPULSE, spawnPickups,
} from './pickups.js';
import { ROCKET_AXIS_OFFSET, ROCKET_RADIUS, activeStage, addFuel, warn } from './rocket.js';

export const CELL_W = 600;
export const CELL_H = 300;
const NEAR_MISS_INNER = 15;
const NEAR_MISS_OUTER = 42;
const HIT_COOLDOWN = 0.8;
const RING_CENTER_OFFSET = 0.35; // passing this close to the middle counts as a centred pass
const BODY_INDEX = { earth: 0, moon: 1, mars: 2 };
const KEEP_X = 3500;
const KEEP_ALT = 2600;

export function createWorld() {
  return { cells: {}, nextId: 1, ix: null, iy: null };
}

export function resetWorld(s) {
  s.world = createWorld();
  s.objects = [];
}

function makePad(s, bodyId, x) {
  const half = BODIES[bodyId].pad.half * (1 + 0.35 * s.cfg.base.beacons);
  return { x, half, width: half * 2, lit: s.cfg.base.beacons > 0.15, visible: false };
}

// Puts the rocket above a body: fresh pad, weather and world. Used at launch and after a transfer.
// opts: { alt, x, angle, vx, vy, padOffset }. On Earth the rocket starts on the pad; elsewhere it arrives from above.
export function enterBody(s, bodyId, opts = {}) {
  const body = BODIES[bodyId];
  s.body = bodyId;
  const rs = createRngState(hashSeed(s.cfg.seed, 99, BODY_INDEX[bodyId]));
  let padX = 0;
  if (body.approach) {
    const offset = opts.padOffset ?? range(rs, 150, body.approach.padOffset);
    padX = chance(rs, 0.5) ? offset : -offset;
  }
  s.pad = makePad(s, bodyId, padX);
  s.weather = createWeather(hashSeed(s.cfg.seed, 11, BODY_INDEX[bodyId]), bodyId, s.cfg.weather);
  resetWorld(s);
  s.lastCx = null;
  s.lastCy = null;
  s.entryTime = s.time;
  s.x = opts.x ?? 0;
  s.y = -(opts.alt ?? 0);
  s.vx = opts.vx ?? 0;
  s.vy = opts.vy ?? 0;
  s.angle = opts.angle ?? 0;
  s.av = 0;
  s.zone = zoneAt(bodyId, opts.alt ?? 0);
  updateWeather(s.weather, bodyId, opts.alt ?? 0, 0, s.cfg.base.weather > 0 || s.cfg.avionics.predict > 0);
  resetClouds(s);
  updateClouds(s, 0);
}

function generateCell(s, ix, iy) {
  const rs = createRngState(hashSeed(s.cfg.seed, BODY_INDEX[s.body], ix, iy));
  const ctx = {
    bodyId: s.body,
    era: s.cfg.era,
    ix,
    iy,
    x0: ix * CELL_W,
    alt0: iy * CELL_H,
    width: CELL_W,
    height: CELL_H,
    padX: s.pad.x,
    quiet: s.cfg.quietSky,
    fuelDropRate: s.cfg.base.fuelDropRate,
    nextId: () => s.world.nextId++,
  };
  s.objects.push(...spawnPickups(rs, ctx), ...spawnHazards(rs, ctx));
}

// Makes sure cells around the rocket exist. Cheap when the rocket stays inside the same cell.
export function streamWorld(s) {
  const ix = Math.floor(s.x / CELL_W);
  const iy = Math.max(0, Math.floor(-s.y / CELL_H));
  if (s.world.ix === ix && s.world.iy === iy) return;
  s.world.ix = ix;
  s.world.iy = iy;
  for (let cy = Math.max(0, iy - 1); cy <= iy + 4; cy++) {
    for (let cx = ix - 3; cx <= ix + 3; cx++) {
      const key = `${cx},${cy}`;
      if (s.world.cells[key]) continue;
      s.world.cells[key] = 1;
      generateCell(s, cx, cy);
    }
  }
  const alt = -s.y;
  s.objects = s.objects.filter((o) => o.active && Math.abs(o.x - s.x) < KEEP_X && Math.abs(-o.y - alt) < KEEP_ALT);
}

function hitHazard(s, o, events) {
  const relative = Math.hypot(s.vx - o.vx, s.vy - o.vy);
  const damage = collisionDamage(o, relative, s.cfg.hull.debrisResist);
  s.hp = Math.max(0, s.hp - damage);
  s.hitTimer = HIT_COOLDOWN;
  s.shock = Math.min(0.5, 0.1 + damage * 0.006) / (1 + s.cfg.hull.debrisResist / 15);
  s.hits += 1;
  o.active = false;

  // Bounce: remove part of the closing speed along the line between centres.
  const cx = s.x + Math.sin(s.angle) * ROCKET_AXIS_OFFSET;
  const cy = s.y - Math.cos(s.angle) * ROCKET_AXIS_OFFSET;
  const len = Math.max(1, Math.hypot(cx - o.x, cy - o.y));
  const nx = (cx - o.x) / len;
  const ny = (cy - o.y) / len;
  const approach = (s.vx - o.vx) * nx + (s.vy - o.vy) * ny;
  if (approach < 0) {
    s.vx -= nx * approach * 0.45;
    s.vy -= ny * approach * 0.45;
  }

  if (s.hp <= 0) s.killer = o.kind;
  events.push({ type: 'hit', kind: o.kind, lineage: o.lineage, size: o.size, damage, hp: s.hp, x: o.x, y: o.y });
  events.push({ type: 'thrust-cut', reason: 'hit' });
}

function collect(s, o, events) {
  o.active = false;
  const stage = activeStage(s);
  if (o.kind === 'coin') {
    s.coins += COIN_VALUE;
    s.items.coin += 1;
    events.push({ type: 'pickup', kind: 'coin', value: COIN_VALUE, x: o.x, y: o.y });
  } else if (o.kind === 'fuel') {
    const added = addFuel(s, stage.maxFuel * FUEL_PICKUP_SHARE);
    s.items.fuel += 1;
    events.push({ type: 'pickup', kind: 'fuel', value: added, x: o.x, y: o.y });
  } else if (o.kind === 'repair') {
    const restored = Math.min(s.maxHp - s.hp, REPAIR_AMOUNT);
    s.hp += restored;
    s.items.repair += 1;
    events.push({ type: 'pickup', kind: 'repair', value: restored, x: o.x, y: o.y });
  }
  s.pickups += 1;
}

// Flying through a horizontal ring: the rocket crosses the ring's level inside its width, in either direction.
// The speed boost follows the direction of travel and is better the closer to the middle the rocket passes.
function passRing(s, o, offset, crossingDir, events) {
  o.active = false;
  s.rings += 1;
  if (offset <= RING_CENTER_OFFSET) s.ringsCentered += 1;
  const speed = Math.hypot(s.vx, s.vy);
  const dirX = speed > 0.5 ? s.vx / speed : Math.sin(s.angle);
  const dirY = speed > 0.5 ? s.vy / speed : -Math.cos(s.angle);
  const impulse = RING_IMPULSE * (1.15 - 0.5 * offset);
  s.vx += dirX * impulse;
  s.vy += dirY * impulse;
  s.ringBoost = RING_BOOST_TIME;
  events.push({
    type: 'ring', x: o.x, y: o.y, halfWidth: o.halfWidth, offset, dir: crossingDir, quality: offset <= RING_CENTER_OFFSET ? 'center' : 'edge',
  });
}

export function updateObjects(s, events) {
  const radar = s.cfg.base.radar;
  const magnet = s.cfg.consumables.magnet ? MAGNET_BONUS : 0;
  const cx = s.x + Math.sin(s.angle) * ROCKET_AXIS_OFFSET;
  const cy = s.y - Math.cos(s.angle) * ROCKET_AXIS_OFFSET;
  const broad = 350 + 900 * radar;
  const hitScale = 1 - 0.08 * radar;
  let removed = false;

  for (const o of s.objects) {
    if (!o.active) continue;
    if (o.hazard) positionHazard(o, s.time - s.entryTime);
    const dx = o.x - cx;
    const dy = o.y - cy;
    if (Math.abs(dx) > broad || Math.abs(dy) > broad) {
      o.marked = false;
      continue;
    }
    const d = Math.hypot(dx, dy);

    if (o.hazard) {
      o.marked = radar > 0;
      const closing = dx * (o.vx - s.vx) + dy * (o.vy - s.vy) < 0;
      if (!o.warned && closing && d < 220 + 700 * radar) {
        o.warned = true;
        warn(s, 'hazard', events, 1, { object: o.kind, x: o.x, y: o.y });
      }
      if (d < (o.r + ROCKET_RADIUS) * hitScale && s.hitTimer <= 0) {
        hitHazard(s, o, events);
        removed = true;
      } else if (!o.near && d < o.r + NEAR_MISS_OUTER && d > o.r + NEAR_MISS_INNER) {
        o.near = true;
        s.near += 1;
        events.push({ type: 'near-miss', kind: o.kind, x: o.x, y: o.y });
      }
    } else if (o.kind === 'coin' && d < PICKUP_RADIUS.coin + magnet) {
      collect(s, o, events);
      removed = true;
    } else if ((o.kind === 'fuel' || o.kind === 'repair') && d < PICKUP_RADIUS[o.kind]) {
      collect(s, o, events);
      removed = true;
    } else if (o.kind === 'ring' && s.lastCy !== null) {
      const before = s.lastCy - o.y;
      const after = cy - o.y;
      if (before * after <= 0 && before !== after) {
        const t = before / (before - after);
        const offset = Math.abs(s.lastCx + (cx - s.lastCx) * t - o.x) / o.halfWidth;
        if (offset <= 1) {
          passRing(s, o, offset, cy < s.lastCy ? 'up' : 'down', events);
          removed = true;
        }
      }
    }
  }
  s.lastCx = cx;
  s.lastCy = cy;
  if (removed) s.objects = s.objects.filter((o) => o.active);
}
