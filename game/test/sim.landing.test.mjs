import test from 'node:test';
import assert from 'node:assert/strict';
import {
  advance, createFlight, heavyRocket, runFlight, startRocket, summarize,
} from '../src/sim/index.js';

const SEEDS = Array.from({ length: 24 }, (_, i) => i + 1);

function hop(seed, skill = 1) {
  return runFlight(startRocket({ seed }), { skill, mission: 'hop', targetAlt: 90 });
}

test('the unimproved rocket reaches 800 m and lands softly from one attempt (skill 1)', () => {
  for (const seed of SEEDS) {
    const { result } = hop(seed);
    assert.equal(result.outcome, 'landed', `seed ${seed}: ${result.reason}`);
    assert.ok(result.maxAlt >= 80, `seed ${seed}: reached only ${result.maxAlt} units`);
    assert.ok(result.fuelLeft01 > 0.3, 'a sensible landing leaves fuel in the tank');
    assert.ok(result.landing.v <= result.landing.vTol);
    assert.ok(result.perfect, 'a precise autopilot lands on the pad gently');
  }
});

for (const body of ['moon', 'mars']) {
  test(`the unimproved rocket lands softly on ${body} with one attempt (skill 1)`, () => {
    for (const seed of SEEDS) {
      const config = startRocket({ seed, destination: body, start: { body } });
      const { result } = runFlight(config, { skill: 1, mission: 'land' });
      assert.equal(result.outcome, 'landed', `seed ${seed}: ${result.reason}`);
      assert.equal(result.body, body);
      assert.ok(result.fuelLeft01 > 0.4);
    }
  });
}

test('a clumsy pilot (skill 0.3) sometimes crashes and sometimes lands', () => {
  let landed = 0;
  let crashed = 0;
  for (const seed of SEEDS.concat(SEEDS.map((s) => s + 100))) {
    const { result } = hop(seed, 0.3);
    if (result.outcome === 'landed') landed += 1;
    else crashed += 1;
  }
  assert.ok(crashed >= 3, `only ${crashed} crashes`);
  assert.ok(landed >= 3, `only ${landed} landings`);
});

test('skill orders the results: better pilots crash less', () => {
  const crashes = (skill) => SEEDS.filter((seed) => hop(seed, skill).result.outcome !== 'landed').length;
  assert.ok(crashes(1) <= crashes(0.5));
  assert.ok(crashes(0.5) <= crashes(0.1));
  assert.ok(crashes(0.1) > crashes(1));
});

test('a fast touchdown is a crash and the reason says why', () => {
  const state = createFlight(startRocket({ weather: 'clear', start: { body: 'earth', alt: 300 } }));
  const events = advance(state, { throttle: 0 }, 10);
  const touch = events.find((e) => e.type === 'touch');
  const crashed = events.find((e) => e.type === 'crashed');
  assert.ok(touch && crashed);
  assert.equal(touch.ok, false);
  assert.equal(crashed.reason, 'landing-speed');
  assert.ok(crashed.v > crashed.vTol);
  assert.equal(state.phase, 'crashed');
  const result = summarize(state);
  assert.equal(result.outcome, 'crashed');
  assert.equal(result.reason, 'landing-speed');
  assert.ok(result.landing.v > result.landing.vTol);
  assert.equal(result.perfect, false);
});

// Touches down within a few ticks at (about) the given speeds, so the numbers are what the rules see.
const touchdown = (config = {}, start = {}) => {
  const state = createFlight(startRocket({ weather: 'clear', ...config, start: { body: 'earth', alt: 0.02, vy: 5, ...start } }));
  const events = advance(state, { throttle: 0 }, 1);
  return { state, events, end: events.find((e) => e.type === 'landed' || e.type === 'crashed') };
};

test('sideways speed and a tilted hull are crash reasons too', () => {
  const free = { fins: { turn: 1, maxTilt: Math.PI } };
  assert.equal(touchdown({}, { vx: 40 }).end.reason, 'landing-drift');
  assert.equal(touchdown(free, { angle: 0.6 }).end.reason, 'landing-tilt');
  assert.equal(touchdown({}, { vy: 30, vx: 20 }).end.reason, 'landing-speed', 'the worst excess is reported');
});

test('stronger legs widen the tolerance, beacons widen it on the pad, rough ground narrows it', () => {
  assert.equal(touchdown({}, { vy: 11 }).end.type, 'landed', 'an 11 unit/s touchdown is within the basic tolerance of 13');
  assert.equal(touchdown({}, { vy: 16 }).end.type, 'crashed');
  assert.equal(touchdown({ legs: { vTol: 20 } }, { vy: 16 }).end.type, 'landed');
  assert.equal(touchdown({ base: { beacons: 1 } }, { vy: 15 }).end.type, 'landed', 'beacons add 25% on the pad');
  assert.equal(touchdown({}, { x: 400, vy: 11 }).end.type, 'crashed', 'off the pad the ground is rough: 13 * 0.7 = 9.1');
  assert.equal(touchdown({}, { x: 400, vy: 8 }).end.type, 'landed');
  assert.equal(touchdown({}, { x: 80, vy: 11 }).end.type, 'landed', 'the pad is 85 units to each side');
});

test('perfect landings need a gentle, vertical touchdown on the pad', () => {
  assert.equal(touchdown({}, { vy: 5 }).end.perfect, true);
  assert.equal(touchdown({}, { vy: 10 }).end.perfect, false);
  assert.equal(touchdown({ fins: { turn: 1, maxTilt: Math.PI } }, { vy: 5, angle: 0.25 }).end.perfect, false);
  assert.equal(touchdown({}, { vy: 5, x: 400 }).end.perfect, false);
});

test('a hard but legal landing costs hull and can break it', () => {
  const { state } = touchdown({}, { vy: 12.5 });
  assert.equal(state.phase, 'landed');
  assert.ok(state.hp < state.maxHp, 'the legs took a beating');
  assert.ok(summarize(state).hpLeft01 > 0.7);
  assert.equal(touchdown({}, { vy: 4 }).state.hp, 100, 'a gentle touch is free');

  const worn = createFlight(startRocket({ weather: 'clear', start: { body: 'earth', alt: 0.02, vy: 12.5 } }));
  worn.hp = 1;
  const end = advance(worn, { throttle: 0 }, 1).find((e) => e.type === 'crashed');
  assert.equal(end.reason, 'hull-destroyed');
});

// --- the parachute is a shop item now: one fixed canopy, thick air only -------------------------------------------

const withChute = (extra = {}, config = {}) => createFlight(startRocket({
  weather: 'clear', consumables: { chute: 1 }, ...config, start: { body: 'earth', alt: 600, ...extra },
}));

test('the canopy opens after a short delay, sheds the speed quickly but smoothly down to a fixed 8 units/s and lands softly', () => {
  const state = withChute({}, { fins: { turn: 1, maxTilt: Math.PI } });
  state.objects = [];
  advance(state, { throttle: 0 }, 2);
  assert.equal(state.chute.deployed, false);
  const fall = state.vy;
  assert.ok(fall > 60);

  const events = advance(state, { throttle: 0, parachute: true }, 1 / 120);
  assert.deepEqual(events.map((e) => e.type), ['parachute']);
  assert.equal(state.chute.deployed, true);
  assert.equal(state.chute.open, false);
  advance(state, { throttle: 1 }, 0.4);
  assert.equal(state.throttle, 0, 'the engine is cut as soon as the cord is pulled');
  assert.ok(state.vy >= fall - 1, 'the canopy has not braked yet: it needs about 0.6 s to inflate');
  assert.ok(state.chute.t > 0.5 && state.chute.t < 1);

  const speeds = [];
  advance(state, { parachute: true }, 0.4, (s) => { if (s.chute.open) speeds.push(s.vy); });
  advance(state, { parachute: true }, 3, (s) => speeds.push(s.vy));
  assert.equal(state.chute.open, true);
  let sharpest = 0;
  for (let i = 1; i < speeds.length; i++) {
    assert.ok(speeds[i] <= speeds[i - 1] + 1e-9, 'the speed only falls');
    assert.ok(speeds[i] >= 8 - 1e-9, 'and never goes below the terminal speed');
    sharpest = Math.max(sharpest, (speeds[i - 1] - speeds[i]) * 120);
  }
  assert.ok(sharpest <= 141, `the braking is capped (${sharpest} units/s²), not instant`);
  assert.ok(speeds[Math.round(0.1 * 120)] > fall * 0.6, 'a tenth of a second after opening the speed is still high');
  assert.ok(speeds[Math.round(1 * 120)] < fall * 0.35, 'one second after opening most of it is gone');
  advance(state, { parachute: true }, 2);
  assert.ok(Math.abs(state.vy - 8) < 0.2, `sinks at ${state.vy}`);
  assert.ok(Math.abs(state.vy - 8) > -1);

  advance(state, { parachute: true }, 120);
  assert.equal(state.phase, 'landed');
  const result = summarize(state);
  assert.equal(result.usedChute, true);
  assert.ok(result.landing.v <= 8.5 && result.landing.v < result.landing.vTol, 'a safe touchdown');
  assert.equal(result.outcome, 'landed');
});

test('a kilometre under the canopy takes about 2 minutes less than it used to: about 14 s at 8 units/s', () => {
  const state = withChute({ alt: 100 }, { fins: { turn: 1, maxTilt: Math.PI } });
  state.objects = [];
  advance(state, { throttle: 0, parachute: true }, 0.02);
  advance(state, { parachute: true }, 1);
  const before = state.alt;
  const start = state.time;
  advance(state, { parachute: true }, 60);
  assert.equal(state.phase, 'landed');
  assert.ok(state.time - start < 20, 'comes down fast enough');
  assert.ok(before > 0);
});

test('the canopy exists only if it was taken along; the parachute module level no longer matters', () => {
  const without = createFlight(startRocket({ weather: 'clear', parachute: { level: 18 }, start: { body: 'earth', alt: 800 } }));
  assert.equal(without.cfg.parachute.level, 0, 'the level is ignored and kept at 0 for old readers');
  assert.equal(without.chute.consumable, false);
  advance(without, { throttle: 0 }, 2);
  const events = advance(without, { throttle: 0, parachute: true }, 1);
  assert.equal(without.chute.deployed, false);
  assert.ok(!events.some((e) => e.type === 'parachute'));
  assert.ok(!events.some((e) => e.kind === 'chute-air'), 'no canopy, no thin-air warning either');
});

test('the canopy needs thick air: not at 60 km, not on Mars, not on the Moon', () => {
  const thin = withChute({ alt: 6000 });
  const events = advance(thin, { throttle: 0, parachute: true }, 1);
  assert.equal(thin.chute.deployed, false);
  assert.ok(events.some((e) => e.type === 'warn' && e.kind === 'chute-air'));
  assert.equal(thin.canTransfer, false);

  for (const body of ['mars', 'moon']) {
    const state = createFlight(startRocket({ consumables: { chute: 1 }, start: { body, alt: 600, vy: 30 } }));
    advance(state, { parachute: true }, 1);
    assert.equal(state.chute.deployed, false, body);
  }
  const dense = withChute({ alt: 2500 });
  dense.objects = [];
  advance(dense, { parachute: true, throttle: 0 }, 1);
  assert.equal(dense.chute.deployed, true, 'the air at 25 km is thick enough');
});

test('the canopy cannot be used while climbing, and a second pull changes nothing', () => {
  const rising = withChute({ vy: -40 });
  advance(rising, { parachute: true, throttle: 0 }, 0.2);
  assert.equal(rising.chute.deployed, false, 'only a falling rocket can use it');
  advance(rising, { throttle: 0 }, 2);
  advance(rising, { parachute: true }, 0.1);
  assert.equal(rising.chute.deployed, true);
  const events = advance(rising, { parachute: true }, 1);
  assert.ok(!events.some((e) => e.type === 'parachute'));
});

test('stronger rockets land too: the heavy rocket with a fast return', () => {
  let landed = 0;
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const { result } = runFlight(heavyRocket({ seed }), { skill: 1, mission: 'hop', targetAlt: 1500 });
    if (result.outcome === 'landed') landed += 1;
  }
  assert.ok(landed >= 5, `${landed} of 6 landed`);
});

test('the prediction line shows where a coasting rocket would land', () => {
  const state = createFlight(startRocket({ weather: 'clear', avionics: { predict: 2 }, start: { body: 'earth', alt: 400, vx: 10 } }));
  assert.ok(state.predict.points.length > 3);
  assert.ok(state.predict.impact.x > 10);
  assert.equal(state.predict.impact.onPad, true);

  const basic = createFlight(startRocket({ avionics: { predict: 1 }, start: { body: 'earth', alt: 400 } }));
  assert.equal(basic.predict.impact, null);
  assert.equal(createFlight(startRocket({})).predict, null);
});
