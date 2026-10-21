import test from 'node:test';
import assert from 'node:assert/strict';
import {
  advance, createFlight, heavyRocket, runFlight, startRocket,
} from '../src/sim/index.js';
import { ASTEROID_SIZES, collisionDamage, spawnHazards } from '../src/sim/hazards.js';
import { spawnPickups } from '../src/sim/pickups.js';
import { createRngState, hashSeed } from '../src/sim/rng.js';

const airborne = (extra = {}, config = {}) => createFlight(startRocket({ weather: 'clear', ...config, start: { body: 'earth', alt: 500, ...extra } }));

function sampleCells(make, rows = 60, columns = 12) {
  const found = [];
  let id = 1;
  for (let iy = 0; iy < rows; iy++) {
    for (let ix = -columns; ix < columns; ix++) {
      const rs = createRngState(hashSeed(9, ix, iy));
      found.push(...make(rs, {
        bodyId: 'earth', era: 5, ix, iy, x0: ix * 600, alt0: iy * 300, width: 600, height: 300, padX: 0, fuelDropRate: 1, nextId: () => id++,
      }));
    }
  }
  return found;
}

// --- asteroids -----------------------------------------------------------------------------------------------------

test('asteroids come in medium, large and huge, none of them small', () => {
  const rocks = sampleCells(spawnHazards, 120, 30).filter((h) => h.kind === 'asteroid');
  assert.ok(rocks.length > 150);
  const bySize = (size) => rocks.filter((r) => r.size === size);
  for (const { size, scale } of ASTEROID_SIZES) {
    assert.ok(bySize(size).length > 10, `${size} rocks exist`);
    for (const rock of bySize(size)) {
      assert.equal(rock.radius, rock.r, 'the collision radius is the exposed radius');
      assert.ok(Math.abs(rock.radius - 28 * scale) <= 0.05, `${size} radius ${rock.radius}`);
    }
  }
  assert.ok(rocks.every((r) => r.radius >= 28), 'no rock is smaller than the old average');
  assert.deepEqual(ASTEROID_SIZES.map((s) => s.scale), [1, 1.6, 2.5]);
  assert.ok(bySize('medium').length > bySize('large').length && bySize('large').length > bySize('huge').length, 'big ones are rarer');
});

test('every object exposes radius and size where they matter', () => {
  const state = createFlight(startRocket({ seed: 4, start: { body: 'earth', alt: 7000 } }));
  const rocks = state.objects.filter((o) => o.kind === 'asteroid');
  assert.ok(rocks.length > 0);
  for (const rock of rocks) {
    assert.ok(['medium', 'large', 'huge'].includes(rock.size));
    assert.equal(typeof rock.radius, 'number');
  }
});

test('a huge rock is hit from farther away than a medium one, and hurts more', () => {
  const rock = (size, scale, damage) => ({
    id: 1, kind: 'asteroid', hazard: true, lineage: 'rock', gen: 0, size, damageScale: damage, r: 28 * scale, radius: 28 * scale,
    active: true, near: false, marked: false, warned: false, motion: 'drift', ox: 60, oy: -526, x: 60, y: -526, vx: 0, vy: 0, dx: 0, dy: 0,
    dir: 1, speed: 0, phase: 0,
  });
  const meet = (object) => {
    const state = airborne({}, { hull: { hp: 1000 } });
    state.objects = [object];
    return advance(state, { throttle: 0 }, 0.05).find((e) => e.type === 'hit');
  };
  assert.equal(meet(rock('medium', 1, 1)), undefined, 'a medium rock 60 units aside is a miss');
  const huge = meet(rock('huge', 2.5, 1.35));
  assert.ok(huge, 'a huge rock at the same place is a hit');
  assert.equal(huge.size, 'huge');

  const hurt = (size, damageScale) => collisionDamage({ kind: 'asteroid', size, damageScale }, 80, 0);
  assert.ok(hurt('huge', 1.35) > hurt('large', 1.15) && hurt('large', 1.15) > hurt('medium', 1));
});

// --- rings ---------------------------------------------------------------------------------------------------------

const ring = (extra = {}) => ({
  id: 4000, kind: 'ring', hazard: false, orient: 'horizontal', halfWidth: 70, r: 70, x: 0, y: -550, active: true, ...extra,
});

function flyThrough(ringObject, { x = 0, vx = 0, vy = -70 } = {}) {
  const state = airborne({ x, vx, vy });
  state.objects = [ringObject];
  const events = advance(state, { throttle: 0 }, 0.6);
  return { state, events, passed: events.find((e) => e.type === 'ring') };
}

test('rings are flat horizontal gates with a centre, a half width and an orientation', () => {
  const rings = sampleCells(spawnPickups).filter((o) => o.kind === 'ring');
  assert.ok(rings.length > 300);
  for (const o of rings) {
    assert.equal(o.orient, 'horizontal');
    assert.ok(o.halfWidth >= 55 && o.halfWidth <= 85, `half width ${o.halfWidth}`);
    assert.equal(o.r, o.halfWidth, 'r stays as an alias for old code');
    assert.ok(o.y < 0 && typeof o.x === 'number');
    assert.equal(o.hazard, false);
  }
});

test('flying up through the middle of a ring counts as a centred pass and speeds the rocket up along its path', () => {
  const { state, passed } = flyThrough(ring());
  assert.ok(passed, 'the ring event fired');
  assert.ok(passed.offset < 0.1, `offset ${passed.offset}`);
  assert.equal(passed.quality, 'center');
  assert.equal(passed.dir, 'up');
  assert.equal(passed.halfWidth, 70);
  assert.equal(passed.x, 0);
  assert.equal(passed.y, -550);
  assert.equal(state.rings, 1);
  assert.equal(state.ringsCentered, 1);
  assert.ok(state.objects.every((o) => o.id !== 4000), 'a taken ring is gone');
  const control = airborne({ vy: -70 });
  advance(control, { throttle: 0 }, 0.6);
  assert.ok(state.climb > control.climb + 9, 'the boost follows the direction of travel');
});

test('the closer to the edge, the weaker the pass and the smaller the boost', () => {
  const centre = flyThrough(ring());
  const edge = flyThrough(ring(), { x: 56 });
  assert.ok(edge.passed, 'a pass inside the half width still counts');
  assert.ok(edge.passed.offset > 0.7 && edge.passed.offset <= 1, `offset ${edge.passed.offset}`);
  assert.equal(edge.passed.quality, 'edge');
  assert.equal(edge.state.ringsCentered, 0);
  assert.equal(edge.state.rings, 1);
  const control = airborne({ vy: -70 });
  advance(control, { throttle: 0 }, 0.6);
  const gain = (r) => r.state.climb - control.climb;
  assert.ok(gain(centre) > gain(edge) + 3, `${gain(centre)} vs ${gain(edge)}`);
});

test('passing outside the half width misses the ring, and so does flying beside it', () => {
  const miss = flyThrough(ring(), { x: 120 });
  assert.equal(miss.passed, undefined);
  assert.equal(miss.state.rings, 0);
  assert.ok(miss.state.objects.some((o) => o.id === 4000), 'the ring waits for the next try');

  const level = airborne({ x: 0, vx: 50, vy: 0 });
  level.objects = [ring({ y: -526 })];
  const events = advance(level, { throttle: 0 }, 0.05);
  assert.ok(!events.some((e) => e.type === 'ring'), 'staying level with the ring without crossing it is not a pass');
});

test('a ring works in either direction and the boost follows the travel', () => {
  const state = airborne({ vy: 60 });
  state.objects = [ring({ y: -440 })];
  const events = advance(state, { throttle: 0 }, 1.2);
  const passed = events.find((e) => e.type === 'ring');
  assert.ok(passed);
  assert.equal(passed.dir, 'down');
  assert.equal(state.rings, 1);
  const control = airborne({ vy: 60 });
  advance(control, { throttle: 0 }, 1.2);
  assert.ok(state.vy > control.vy + 5, 'falling faster after a downward pass');
});

test('a pass registers once even with a long step, and sideways crossing uses the crossing point', () => {
  const state = airborne({ vx: 0, vy: -90 });
  state.objects = [ring({ y: -545 })];
  const events = [];
  for (let i = 0; i < 90; i++) events.push(...advance(state, { throttle: 0 }, 1 / 120));
  assert.equal(events.filter((e) => e.type === 'ring').length, 1);

  const slanted = airborne({ vx: 80, vy: -80 });
  slanted.objects = [ring({ x: 40, y: -540 })];
  advance(slanted, { throttle: 0 }, 0.4);
  assert.equal(slanted.rings, 1, 'the rocket crossed the level at x = 40 or so, inside the gate');
});

test('the autopilot threads the rings on its way up', () => {
  let taken = 0;
  let blind = 0;
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const config = heavyRocket({ seed, weather: 'clear', hull: { hp: 100000, debrisResist: 0 } });
    taken += runFlight(config, { skill: 1, mission: 'hop', targetAlt: 1500 }).result.rings;
    blind += runFlight(config, { skill: 1, mission: 'hop', targetAlt: 1500, rings: false }).result.rings;
  }
  assert.ok(taken > blind + 3, `${taken} rings with the aim, ${blind} without`);
});
