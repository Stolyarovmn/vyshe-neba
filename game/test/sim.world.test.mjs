import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ZONES, advance, createFlight, heavyRocket, startRocket, step,
} from '../src/sim/index.js';

test('cells are generated from the seed alone, so the same sky always appears', () => {
  const a = createFlight(startRocket({ seed: 12 }));
  const b = createFlight(startRocket({ seed: 12 }));
  advance(a, { throttle: 1 }, 1);
  assert.equal(JSON.stringify(a.objects.map((o) => [o.kind, o.ox ?? o.x, o.oy ?? o.y]).sort()),
    JSON.stringify(b.objects.map((o) => [o.kind, o.ox ?? o.x, o.oy ?? o.y]).sort()));
});

test('a collision damages the hull, cuts the engine for a moment and removes the hazard', () => {
  const state = createFlight(startRocket({ weather: 'clear', hull: { hp: 200 }, start: { body: 'earth', alt: 500, vy: -40 } }));
  state.objects.push({
    id: 9000, kind: 'plane', hazard: true, lineage: 'low_primary', gen: 0, r: 30, active: true, near: false, marked: false, warned: false,
    motion: 'drift', ox: 0, oy: -616, x: 0, y: -616, vx: 0, vy: 0, dir: 1, speed: 0, phase: 0, dx: 0, dy: 0,
  });
  const events = advance(state, { throttle: 1 }, 3);
  const hit = events.find((e) => e.type === 'hit');
  assert.ok(hit, 'the plane is on the flight path');
  assert.equal(hit.kind, 'plane');
  assert.ok(hit.damage >= 3 && state.hp < 200);
  assert.ok(events.some((e) => e.type === 'thrust-cut' && e.reason === 'hit'));
  assert.ok(!state.objects.some((o) => o.id === 9000));
  assert.equal(events.filter((e) => e.type === 'hit').length, 1, 'one hazard, one hit');
  assert.equal(state.hits, 1);
});

test('tougher hulls take less damage and a destroyed hull ends the flight with the culprit named', () => {
  const crashInto = (debrisResist, hp) => {
    const state = createFlight(startRocket({ weather: 'clear', hull: { hp, debrisResist }, start: { body: 'earth', alt: 500, vy: -40 } }));
    state.objects.push({
      id: 9000, kind: 'asteroid', hazard: true, lineage: 'rock', gen: 0, r: 28, active: true, near: false, marked: false, warned: false,
      motion: 'drift', ox: 0, oy: -626, x: 0, y: -626, vx: 0, vy: 0, dir: 1, speed: 0, phase: 0, dx: 0, dy: 0,
    });
    const events = advance(state, { throttle: 1 }, 2);
    return { state, events };
  };
  const soft = crashInto(0, 500);
  const hard = crashInto(25, 500);
  assert.ok(500 - hard.state.hp < 500 - soft.state.hp);

  const dead = crashInto(0, 20);
  assert.equal(dead.state.phase, 'crashed');
  const crashed = dead.events.find((e) => e.type === 'crashed');
  assert.equal(crashed.reason, 'hull-destroyed');
  assert.equal(crashed.killer, 'asteroid');
});

test('pickups: coins pay, fuel refills the tank, repair kits heal, rings boost the speed', () => {
  const state = createFlight(startRocket({ weather: 'clear', start: { body: 'earth', alt: 500 } }));
  state.stages[0].fuel = 50;
  state.hp = 50;
  state.vy = 0;
  const around = (kind, r, dx = 0) => ({ id: 8000 + dx, kind, hazard: false, x: dx, y: -(500 + 26), r, active: true });
  state.objects.push(around('coin', 9, 3), around('fuel', 15, -3), around('repair', 15, 6));
  const events = advance(state, { throttle: 0 }, DT_TICKS(2));
  const kinds = events.filter((e) => e.type === 'pickup').map((e) => e.kind).sort();
  assert.deepEqual(kinds, ['coin', 'fuel', 'repair']);
  assert.equal(state.coins, 4);
  assert.ok(state.stages[0].fuel > 50 + 0.1 * state.stages[0].maxFuel);
  assert.equal(state.hp, 90);
  assert.equal(state.pickups, 3);
  assert.deepEqual(state.items, { coin: 1, fuel: 1, repair: 1 });

  const ringed = createFlight(startRocket({ weather: 'clear', start: { body: 'earth', alt: 500, vy: -30 } }));
  const control = createFlight(startRocket({ weather: 'clear', start: { body: 'earth', alt: 500, vy: -30 } }));
  ringed.objects.push({ id: 1, kind: 'ring', hazard: false, orient: 'horizontal', halfWidth: 70, x: 0, y: -(500 + 26 + 1), r: 70, active: true });
  advance(ringed, { throttle: 0 }, 0.1);
  advance(control, { throttle: 0 }, 0.1);
  assert.equal(ringed.rings, 1);
  assert.ok(ringed.climb > control.climb + 9, `a ring adds speed along the path: ${ringed.climb} vs ${control.climb}`);
});

const DT_TICKS = (ticks) => ticks / 120;

test('the magnet consumable widens the coin reach', () => {
  const coinAside = { id: 7000, kind: 'coin', hazard: false, x: 80, y: -526, r: 9, active: true };
  const plain = createFlight(startRocket({ weather: 'clear', start: { body: 'earth', alt: 500 } }));
  plain.objects.push({ ...coinAside });
  step(plain, {}, 1 / 120);
  assert.equal(plain.objects.find((o) => o.id === 7000).active, true);
  const magnet = createFlight(startRocket({ weather: 'clear', consumables: { magnet: 1 }, start: { body: 'earth', alt: 500 } }));
  magnet.objects.push({ ...coinAside });
  step(magnet, {}, 1 / 120);
  assert.ok(!magnet.objects.some((o) => o.id === 7000), 'the magnet pulled the coin in');
});

test('collected things do not come back when the rocket returns to the cell', () => {
  const state = createFlight(startRocket({ weather: 'clear', start: { body: 'earth', alt: 500 } }));
  state.objects.push({ id: 9100, kind: 'coin', hazard: false, x: 0, y: -526, r: 9, active: true });
  step(state, {}, 1 / 120);
  assert.equal(state.coins, 4);
  const cells = Object.keys(state.world.cells).length;

  state.x = 5000;
  step(state, {}, 1 / 120);
  state.x = 0;
  step(state, {}, 1 / 120);
  assert.ok(!state.objects.some((o) => o.id === 9100));
  const nearOrigin = state.objects.filter((o) => o.kind === 'coin' && Math.abs(o.x) < 1 && Math.abs(o.y + 526) < 1);
  assert.equal(nearOrigin.length, 0);
  assert.ok(Object.keys(state.world.cells).length >= cells, 'visited cells stay registered');
});

test('radar marks hazards and warns early; fuel can drops scale with the base bonus', () => {
  const sky = (radar, fuelDropRate = 1) => createFlight(startRocket({ seed: 3, base: { radar, fuelDropRate }, start: { body: 'earth', alt: 1500 } }));
  const none = sky(0);
  const full = sky(1);
  assert.ok(none.objects.some((o) => o.hazard));
  advance(full, { throttle: 0 }, 0.05);
  advance(none, { throttle: 0 }, 0.05);
  assert.ok(full.objects.some((o) => o.hazard && o.marked));
  assert.ok(!none.objects.some((o) => o.marked));

  const cans = (rate) => {
    let total = 0;
    for (let seed = 1; seed <= 20; seed++) {
      total += createFlight(startRocket({ seed, base: { fuelDropRate: rate }, start: { body: 'earth', alt: 3000 } })).objects.filter((o) => o.kind === 'fuel').length;
    }
    return total;
  };
  assert.ok(cans(2) > cans(1));
});

test('zones open as the rocket climbs and each reports once', () => {
  const state = createFlight(heavyRocket({ seed: 1, weather: 'clear' }));
  const events = advance(state, { throttle: 1 }, 35);
  const zones = events.filter((e) => e.type === 'zone');
  assert.ok(zones.length >= 2);
  assert.equal(zones[0].id, ZONES.earth[1].id);
  assert.ok(state.zonesSeen.includes('above-clouds'));
  assert.equal(new Set(zones.filter((e) => e.first).map((e) => e.id)).size, zones.filter((e) => e.first).length);
});

test('the pad blast scorches the hull of a strong engine unless the pad is cooled', () => {
  const launch = (padSafety) => {
    const state = createFlight(heavyRocket({ seed: 1, weather: 'clear', base: { padSafety } }));
    const events = advance(state, { throttle: 1 }, 1);
    return { state, events };
  };
  const hot = launch(0);
  assert.ok(hot.events.some((e) => e.type === 'hit' && e.kind === 'pad-blast'));
  const cooled = launch(1);
  assert.ok(!cooled.events.some((e) => e.kind === 'pad-blast'));
  assert.ok(cooled.state.hp > hot.state.hp);
  const basic = createFlight(startRocket({ weather: 'clear' }));
  assert.ok(!advance(basic, { throttle: 1 }, 1).some((e) => e.kind === 'pad-blast'), 'the starter engine is gentle');
});
