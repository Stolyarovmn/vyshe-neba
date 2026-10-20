import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SPACE_ALT, ZONES, advance, createFlight, heavyRocket, startRocket, step,
} from '../src/sim/index.js';
import { PLANE_FLOOR, bandWeight, spawnHazards } from '../src/sim/hazards.js';
import { createRngState, hashSeed } from '../src/sim/rng.js';

function sample(bodyId, era, rows, columns = 6) {
  const found = [];
  let id = 1;
  for (let iy = 0; iy < rows; iy++) {
    for (let ix = -columns; ix < columns; ix++) {
      const rs = createRngState(hashSeed(7, ix, iy, era));
      found.push(...spawnHazards(rs, {
        bodyId, era, x0: ix * 600, alt0: iy * 300, width: 600, height: 300, padX: 0, nextId: () => id++,
      }));
    }
  }
  return found;
}

test('hazard bands fade in and out smoothly', () => {
  assert.equal(bandWeight(50, 100, 200), 0);
  assert.equal(bandWeight(250, 100, 200), 0);
  assert.equal(bandWeight(150, 100, 200), 1);
  assert.ok(bandWeight(105, 100, 200) > 0 && bandWeight(105, 100, 200) < 1);
  assert.ok(bandWeight(195, 100, 200) > 0 && bandWeight(195, 100, 200) < 1);
});

test('aircraft stay off the launch zone and out of space; balloons stay below 50 km', () => {
  const hazards = sample('earth', 3, 40);
  const planes = hazards.filter((h) => h.kind === 'plane');
  const balloons = hazards.filter((h) => h.kind === 'balloon');
  assert.ok(planes.length > 20 && balloons.length > 20);
  for (const plane of planes) {
    const alt = -plane.oy;
    assert.ok(alt >= PLANE_FLOOR, `plane at ${alt}`);
    assert.ok(alt <= 5000, `era 3 experimental ceiling is 50 km, got ${alt}`);
  }
  for (const balloon of balloons) assert.ok(-balloon.oy <= 4500 && -balloon.oy >= 20);
});

test('altitude decides the role: aircraft lineages follow their bands', () => {
  const planes = sample('earth', 4, 40).filter((h) => h.kind === 'plane');
  const at = (lineage) => planes.filter((p) => p.lineage === lineage).map((p) => -p.oy);
  assert.ok(Math.max(...at('low_primary')) <= 400, 'light aircraft only in the low sky');
  assert.ok(Math.min(...at('medium_passenger')) >= 700 && Math.max(...at('medium_passenger')) <= 1300);
  assert.ok(Math.min(...at('high_fighter')) >= 1200 && Math.max(...at('high_fighter')) <= 2300);
  assert.ok(Math.min(...at('high_experimental')) >= 2300);
});

test('the sky is empty of aircraft above 100 km and full of rocks and debris', () => {
  const high = sample('earth', 5, 60).filter((h) => -h.oy > 9000);
  assert.ok(high.length > 0);
  assert.ok(high.every((h) => h.kind === 'asteroid' || h.kind === 'debris' || h.kind === 'plane'));
  assert.ok(high.filter((h) => -h.oy >= SPACE_ALT).every((h) => h.kind === 'asteroid' || h.kind === 'debris'));
  assert.ok(sample('earth', 5, 40).some((h) => h.kind === 'asteroid' && -h.oy < 8500));
});

test('the world follows the era: era 0 only shows the first generation, newer eras mix', () => {
  assert.ok(sample('earth', 0, 20).filter((h) => h.kind === 'plane' || h.kind === 'balloon').every((h) => h.gen === 0));
  const mix = sample('earth', 4, 40).filter((h) => h.kind === 'plane');
  const gens = new Set(mix.map((h) => h.gen));
  assert.ok(gens.has(4) && gens.has(3), `generations seen: ${[...gens]}`);
  assert.ok(mix.filter((h) => h.gen === 4).length > mix.filter((h) => h.gen === 3).length);
});

test('the Moon only has rocks', () => {
  const moon = sample('moon', 3, 8);
  assert.ok(moon.length > 0);
  assert.ok(moon.every((h) => h.kind === 'asteroid'));
});

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
  ringed.objects.push({ id: 1, kind: 'ring', hazard: false, x: 0, y: -(500 + 26 - 30 * 0.05), r: 35, active: true });
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

test('weather: a forced storm blows in the lower sky, shakes the rocket and is gone above the clouds', () => {
  const low = createFlight(startRocket({ weather: 'storm', start: { body: 'earth', alt: 500 } }));
  const events = advance(low, { throttle: 0.7 }, 12);
  assert.equal(low.weather.kind, 'storm');
  assert.ok(low.weather.storm > 0.5);
  assert.ok(events.some((e) => e.type === 'storm' && e.phase === 'start'));
  assert.ok(low.stormTime > 5);

  const high = createFlight(startRocket({ weather: 'storm', start: { body: 'earth', alt: 6000 } }));
  advance(high, { throttle: 0 }, 5);
  assert.equal(high.weather.storm, 0);
  assert.equal(high.weather.wind, 0);

  const calm = createFlight(startRocket({ weather: 'clear', start: { body: 'earth', alt: 500 } }));
  advance(calm, { throttle: 0 }, 5);
  assert.equal(calm.weather.wind, 0);
  assert.equal(calm.stormTime, 0);
});

test('weather: wind pushes sideways, fins reduce it, the forecast needs the weather station', () => {
  const drift = (dragCut) => {
    const state = createFlight(startRocket({ weather: 'storm', fins: { dragCut }, start: { body: 'earth', alt: 600 } }));
    let peak = 0;
    advance(state, { throttle: 0 }, 5, (s) => { peak = Math.max(peak, Math.abs(s.vx)); });
    return peak;
  };
  assert.ok(drift(0) > 1);
  assert.ok(drift(0.5) < drift(0));

  const noStation = createFlight(startRocket({ seed: 4, start: { body: 'earth', alt: 500 } }));
  advance(noStation, { throttle: 0 }, 1);
  assert.equal(noStation.weather.forecast, null);
  const station = createFlight(startRocket({ seed: 4, base: { weather: 1 }, start: { body: 'earth', alt: 500 } }));
  advance(station, { throttle: 0 }, 1);
  assert.ok(['clear', 'cloudy', 'rain', 'storm'].includes(station.weather.forecast.kind));
  assert.ok(station.weather.forecast.in > 0);
});

test('weather changes over time and the Moon has none', () => {
  const state = createFlight(startRocket({ seed: 6, start: { body: 'earth', alt: 9500 } }));
  const kinds = new Set();
  advance(state, { throttle: 0 }, 150, (s) => kinds.add(s.weather.kind));
  assert.ok(kinds.size >= 2, `weather stayed ${[...kinds]}`);

  const moon = createFlight(startRocket({ start: { body: 'moon' } }));
  assert.equal(moon.weather.kind, 'none');
  assert.equal(moon.weather.wind, 0);
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
