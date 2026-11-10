import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DT, advance, createFlight, findNonFinite, heavyRocket, startRocket,
} from '../src/sim/index.js';
import { CLOUD_BELTS } from '../src/sim/clouds.js';
import { windAt } from '../src/sim/weather.js';

const sky = (seed, weather, alt = 600, extra = {}) => createFlight(startRocket({ seed, weather, ...extra, start: { body: 'earth', alt } }));

// A big storm cloud wrapped around the rocket, for tests of what happens inside one.
function stormAround(state, id = 777) {
  state.clouds.push({
    id, kind: 'storm', x: state.x, alt: state.alt + 26, w: 1200, h: 800, density: 0.9, storm: true, vx: 0,
  });
}

// Holds the altitude the flight started at, so the rocket stays in the same part of the sky.
const hover = (s) => {
  s.holdAlt ??= s.alt;
  const wanted = s.g + 0.8 * (s.holdAlt - s.alt) - 1.5 * s.climb;
  return { throttle: Math.max(0, Math.min(1, wanted / s.maxAccel)), tilt: 0 };
};

test('clouds follow the documented shape of the state', () => {
  const state = sky(3, 'cloudy');
  assert.ok(state.clouds.length > 5);
  for (const c of state.clouds) {
    assert.deepEqual(Object.keys(c).sort(), ['alt', 'density', 'h', 'id', 'kind', 'storm', 'vx', 'w', 'x']);
    assert.ok(['cumulus', 'stratus', 'cirrus', 'storm'].includes(c.kind));
    assert.equal(c.storm, c.kind === 'storm');
    assert.ok(c.density > 0 && c.density <= 1);
    assert.ok(c.w > 0 && c.h > 0);
  }
  assert.equal(findNonFinite(state.clouds), null);
  assert.equal(new Set(state.clouds.map((c) => c.id)).size, state.clouds.length, 'ids are unique');
});

test('the same seed always gives the same clouds, a different seed gives different ones', () => {
  const a = sky(5, 'rain');
  const b = sky(5, 'rain');
  advance(a, { throttle: 0 }, 5);
  advance(b, { throttle: 0 }, 5);
  assert.equal(JSON.stringify(a.clouds), JSON.stringify(b.clouds));
  assert.notEqual(JSON.stringify(sky(6, 'rain').clouds.map((c) => c.w)), JSON.stringify(a.clouds.map((c) => c.w)));
});

test('clouds stay inside their altitude belts and nothing grows above 12 km', () => {
  for (let seed = 1; seed <= 12; seed++) {
    for (const weather of ['clear', 'cloudy', 'rain', 'storm']) {
      const state = sky(seed, weather, 400 + seed * 300);
      for (const c of state.clouds) {
        const belt = CLOUD_BELTS[c.kind];
        assert.ok(c.alt - c.h / 2 >= belt.from - 1e-9, `${c.kind} bottom ${c.alt - c.h / 2} < ${belt.from}`);
        assert.ok(c.alt + c.h / 2 <= belt.to + 1e-9, `${c.kind} top ${c.alt + c.h / 2} > ${belt.to}`);
        assert.ok(c.alt + c.h / 2 <= 1200 + 1e-9, 'no clouds above 12 km');
      }
    }
  }
  assert.equal(CLOUD_BELTS.cumulus.from, 30);
  assert.equal(CLOUD_BELTS.cumulus.to, 300);
  assert.deepEqual([CLOUD_BELTS.stratus.from, CLOUD_BELTS.stratus.to], [200, 600]);
  assert.deepEqual([CLOUD_BELTS.cirrus.from, CLOUD_BELTS.cirrus.to], [700, 1200]);
  assert.deepEqual([CLOUD_BELTS.storm.from, CLOUD_BELTS.storm.to], [50, 900]);
});

test('kinds differ in size and thickness: stratus is wide and thin, cirrus high and thin, storm clouds are tall and dense', () => {
  const all = [];
  for (let seed = 1; seed <= 25; seed++) all.push(...sky(seed, 'storm', 500).clouds);
  const of = (kind) => all.filter((c) => c.kind === kind);
  const mean = (list, key) => list.reduce((sum, c) => sum + c[key], 0) / list.length;
  for (const kind of ['cumulus', 'stratus', 'cirrus', 'storm']) assert.ok(of(kind).length > 10, `${kind} clouds exist`);
  assert.ok(mean(of('stratus'), 'w') > mean(of('cumulus'), 'w') * 1.5);
  assert.ok(mean(of('stratus'), 'h') < mean(of('cumulus'), 'h'));
  assert.ok(mean(of('storm'), 'h') > mean(of('cumulus'), 'h') * 2.5, 'cumulonimbus tower over cumulus');
  assert.ok(Math.min(...of('storm').map((c) => c.density)) > Math.max(...of('cumulus').concat(of('stratus'), of('cirrus')).map((c) => c.density)));
  assert.ok(Math.max(...of('cumulus').map((c) => c.w)) / Math.min(...of('cumulus').map((c) => c.w)) > 3, 'sizes vary a lot');
});

test('storm clouds grow only in rain and storms', () => {
  const count = (weather) => {
    let n = 0;
    for (let seed = 1; seed <= 25; seed++) n += sky(seed, weather, 500).clouds.filter((c) => c.storm).length;
    return n;
  };
  assert.equal(count('clear'), 0);
  assert.equal(count('cloudy'), 0);
  assert.ok(count('rain') > 0);
  assert.ok(count('storm') > count('rain'));
});

test('clear weather has few clouds, cloudy weather has many', () => {
  const total = (weather) => [1, 2, 3, 4, 5, 6].reduce((sum, seed) => sum + sky(seed, weather).clouds.length, 0);
  assert.ok(total('cloudy') > total('clear') * 1.8);
});

test('clouds drift with the wind of their own altitude and never wobble', () => {
  const state = sky(4, 'cloudy', 700);
  state.objects = [];
  const watched = state.clouds.filter((c) => c.w > 0).slice(0, 12).map((c) => c.id);
  const previous = new Map(state.clouds.map((c) => [c.id, c.x]));
  const flips = new Map();
  const lastStep = new Map();
  advance(state, hover, 60, (s) => {
    for (const c of s.clouds) {
      if (!previous.has(c.id)) { previous.set(c.id, c.x); continue; }
      const dx = c.x - previous.get(c.id);
      assert.ok(Math.abs(dx - c.vx * DT) < 1e-9, 'x moves by exactly vx * dt');
      assert.ok(Math.abs(c.vx - windAt(s.weather, 'earth', c.alt)) < 1e-9, 'vx is the local wind');
      if (watched.includes(c.id) && Math.abs(dx) > 1e-12) {
        if (lastStep.has(c.id) && Math.sign(lastStep.get(c.id)) !== Math.sign(dx)) flips.set(c.id, (flips.get(c.id) ?? 0) + 1);
        lastStep.set(c.id, dx);
      }
      previous.set(c.id, c.x);
    }
  });
  for (const id of watched) assert.ok((flips.get(id) ?? 0) <= 1, `cloud ${id} changed direction ${flips.get(id)} times`);
});

test('higher clouds ride faster winds than the lowest ones', () => {
  const state = sky(4, 'cloudy', 700);
  const speed = (kind) => state.clouds.filter((c) => c.kind === kind).map((c) => Math.abs(c.vx));
  const cirrus = speed('cirrus');
  const cumulus = speed('cumulus');
  assert.ok(cirrus.length && cumulus.length);
  assert.ok(Math.max(...cirrus) > Math.max(...cumulus));
});

test('clouds appear around the rocket wherever it is, and are made from the seed alone', () => {
  const far = createFlight(startRocket({ seed: 4, weather: 'cloudy', start: { body: 'earth', alt: 700, x: 50000 } }));
  assert.ok(far.clouds.length > 5);
  assert.ok(far.clouds.every((c) => Math.abs(c.x - 50000) < 3000 * 2 + c.w));
  assert.ok(far.clouds.some((c) => Math.abs(c.x - 50000) < 1500), 'some clouds are close enough to see');
});

test('new clouds arrive with the wind as the old ones drift away', () => {
  const state = sky(4, 'cloudy', 700);
  const firstIds = new Set(state.clouds.map((c) => c.id));
  advance(state, hover, 180);
  const fresh = state.clouds.filter((c) => !firstIds.has(c.id));
  assert.ok(fresh.length > 0, 'the sky keeps being supplied');
  assert.ok(state.clouds.filter((c) => c.kind === 'cirrus').length > 0);
  assert.ok(state.clouds.every((c) => Math.abs(c.x - state.x) < 3000 * 2 + c.w + 1), 'far clouds are dropped');
});

test('the Moon has no clouds and Mars only thin cirrus and dust storms', () => {
  const moon = createFlight(startRocket({ start: { body: 'moon' } }));
  assert.deepEqual(moon.clouds, []);
  advance(moon, { throttle: 0 }, 3);
  assert.deepEqual(moon.clouds, []);
  const kinds = new Set();
  for (let seed = 1; seed <= 20; seed++) {
    for (const c of createFlight(startRocket({ seed, start: { body: 'mars' } })).clouds) kinds.add(c.kind);
  }
  assert.ok([...kinds].every((k) => k === 'cirrus' || k === 'storm'));
});

test('inside a storm cloud the rocket feels a storm: events, turbulence and time in the storm', () => {
  const calm = sky(2, 'clear', 500);
  const stormy = sky(2, 'clear', 500);
  for (const s of [calm, stormy]) {
    s.clouds = [];
    s.objects = [];
  }
  stormAround(stormy);
  const events = advance(stormy, hover, 6);
  advance(calm, hover, 6);
  assert.ok(stormy.weather.storm > 0.5, `storm intensity ${stormy.weather.storm}`);
  assert.equal(calm.weather.storm, 0);
  assert.ok(events.some((e) => e.type === 'storm' && e.phase === 'start'));
  assert.ok(stormy.stormTime > 3);
  assert.equal(calm.stormTime, 0);
  assert.ok(Math.abs(stormy.av) > 0 || Math.abs(stormy.angle) > Math.abs(calm.angle) + 1e-6, 'the turbulence shakes the nose');
});

test('lightning flashes inside storm clouds carry a position and sometimes strike the rocket', () => {
  const state = createFlight(heavyRocket({ seed: 3, weather: 'clear', start: { body: 'earth', alt: 500 } }));
  state.clouds = [];
  state.objects = [];
  stormAround(state);
  const anchor = state.clouds[0];
  const events = advance(state, hover, 120, (s) => { anchor.x = s.x; }); // keep the cloud over the rocket despite the wind
  const flashes = events.filter((e) => e.type === 'storm' && e.phase === 'lightning');
  assert.ok(flashes.length >= 15, `${flashes.length} flashes`);
  for (const flash of flashes) {
    assert.equal(typeof flash.x, 'number');
    assert.equal(typeof flash.y, 'number');
    assert.ok(flash.y < 0, 'y is a world coordinate (down is positive, so the sky is negative)');
    assert.equal(typeof flash.cloud, 'number');
  }
  const strikes = events.filter((e) => e.type === 'hit' && e.kind === 'lightning');
  assert.equal(strikes.length, flashes.filter((f) => f.strike).length);
  assert.ok(strikes.length >= 1 && strikes.length < flashes.length / 2, `${strikes.length} strikes in ${flashes.length} flashes`);
  assert.ok(state.hp < state.maxHp);
  assert.ok(strikes.every((e) => e.damage >= 8));
});

test('leaving a storm cloud ends the storm; a cloud far away only flashes in the distance', () => {
  const state = sky(2, 'clear', 500);
  state.clouds = [];
  state.objects = [];
  stormAround(state);
  const first = advance(state, hover, 2);
  assert.ok(first.some((e) => e.phase === 'start'));
  state.clouds[0].x += 5000;
  const events = advance(state, hover, 0.1);
  assert.ok(events.some((e) => e.type === 'storm' && e.phase === 'end'));
  assert.equal(state.weather.storm, 0);

  const far = sky(2, 'clear', 500);
  far.clouds = [];
  far.objects = [];
  far.clouds.push({ id: 5, kind: 'storm', x: far.x + 1500, alt: 400, w: 600, h: 600, density: 0.9, storm: true, vx: 0 });
  const distant = advance(far, hover, 30);
  assert.equal(far.weather.storm, 0);
  assert.ok(distant.some((e) => e.type === 'storm' && e.phase === 'lightning' && !e.strike));
  assert.ok(!distant.some((e) => e.type === 'hit'));
});

test('a stormy sky builds storm clouds in the flight path and an ascent can run into one', () => {
  let met = 0;
  for (let seed = 1; seed <= 12; seed++) {
    const state = createFlight(heavyRocket({ seed, weather: 'storm', hull: { hp: 100000 } }));
    const events = advance(state, { throttle: 1 }, 40);
    if (events.some((e) => e.type === 'storm' && e.phase === 'start')) met += 1;
  }
  assert.ok(met >= 4, `${met} of 12 climbs met a storm cloud`);
});
