import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DT, advance, createAutopilot, createFlight, findNonFinite, heavyRocket, mulberry32, startRocket, step, summarize,
} from '../src/sim/index.js';

function randomPilot(seed) {
  const rng = mulberry32(seed);
  let held = { throttle: 1, tilt: 0 };
  let nextChange = 0;
  return (state) => {
    if (state.time >= nextChange) {
      held = { throttle: rng() < 0.75 ? 1 : rng(), tilt: rng() * 2 - 1, boost: rng() < 0.1, stabilize: rng() < 0.05 };
      nextChange = state.time + 0.2 + rng() * 0.6;
    }
    return held;
  };
}

function run(config, seconds, pilotSeed) {
  const state = createFlight(config);
  const events = advance(state, randomPilot(pilotSeed), seconds);
  return { state, events };
}

test('the same seed and inputs give the same flight, event for event', () => {
  const a = run(heavyRocket({ seed: 11 }), 25, 5);
  const b = run(heavyRocket({ seed: 11 }), 25, 5);
  assert.equal(JSON.stringify(a.state), JSON.stringify(b.state));
  assert.equal(JSON.stringify(a.events), JSON.stringify(b.events));
  assert.equal(JSON.stringify(summarize(a.state)), JSON.stringify(summarize(b.state)));
});

test('a different seed builds a different world', () => {
  const a = createFlight(startRocket({ seed: 1 }));
  const b = createFlight(startRocket({ seed: 2 }));
  assert.notEqual(JSON.stringify(a.objects), JSON.stringify(b.objects));
});

test('a flight survives a JSON round trip and continues identically', () => {
  const original = createFlight(heavyRocket({ seed: 4 }));
  const pilot = randomPilot(9);
  advance(original, pilot, 12);
  const copy = JSON.parse(JSON.stringify(original));
  assert.equal(JSON.stringify(copy), JSON.stringify(original));

  const pilotA = randomPilot(77);
  const pilotB = randomPilot(77);
  const eventsA = advance(original, pilotA, 15);
  const eventsB = advance(copy, pilotB, 15);
  assert.equal(JSON.stringify(original), JSON.stringify(copy));
  assert.equal(JSON.stringify(eventsA), JSON.stringify(eventsB));
});

test('the state and the result are plain JSON data with no NaN or undefined', () => {
  const state = createFlight(heavyRocket({ seed: 3, avionics: { predict: 2, assist: 1 } }));
  advance(state, randomPilot(1), 20);
  assert.equal(findNonFinite(state), null);
  assert.equal(findNonFinite(summarize(state), 'result'), null);
  assert.deepEqual(JSON.parse(JSON.stringify(summarize(state))), JSON.parse(JSON.stringify(summarize(state))));
});

test('createFlight does not change the config it is given', () => {
  const config = { seed: 5, era: 2, stages: [{ id: 'core', fuel: 99 }], legs: { vTol: 20 } };
  const before = JSON.stringify(config);
  createFlight(config);
  assert.equal(JSON.stringify(config), before);
});

test('a long step is split into fixed ticks and matches the same time in small steps', () => {
  const small = createFlight(startRocket({ seed: 2 }));
  const big = createFlight(startRocket({ seed: 2 }));
  for (let i = 0; i < 120; i++) step(small, { throttle: 1 }, DT);
  for (let i = 0; i < 6; i++) step(big, { throttle: 1 }, DT * 20);
  assert.equal(JSON.stringify(small.objects.length), JSON.stringify(big.objects.length));
  assert.ok(Math.abs(small.y - big.y) < 1e-9);
  assert.ok(Math.abs(small.fuelTotal - big.fuelTotal) < 1e-9);
});

test('an autopilot flight is reproducible', () => {
  const fly = () => {
    const state = createFlight(startRocket({ seed: 8 }));
    const pilot = createAutopilot({ skill: 0.6, seed: 8, mission: 'hop', targetAlt: 90 });
    while (!state.ended && state.time < 120) step(state, pilot.next(state, DT), DT);
    return JSON.stringify(summarize(state));
  };
  assert.equal(fly(), fly());
});
