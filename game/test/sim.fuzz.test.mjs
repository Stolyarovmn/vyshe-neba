import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DT, SPACE_ALT, createFlight, findNonFinite, heavyRocket, mulberry32, startRocket, step, summarize,
} from '../src/sim/index.js';

// Numbers the renderer, HUD and sound read every frame: checked on every tick.
const HOT_FIELDS = ['time', 'x', 'y', 'vx', 'vy', 'angle', 'av', 'throttle', 'alt', 'speed', 'fuel', 'fuelTotal', 'hp', 'coins', 'atmo', 'g'];

function randomInput(rng) {
  const roll = rng();
  return {
    throttle: roll < 0.4 ? 1 : roll < 0.6 ? 0 : rng(),
    tilt: rng() < 0.3 ? 0 : rng() * 2 - 1,
    stabilize: rng() < 0.05,
    boost: rng() < 0.15,
    parachute: rng() < 0.03,
    canister: rng() < 0.02,
    repair: rng() < 0.02,
    transfer: rng() < 0.2,
    pause: false,
  };
}

function scenario(index, rng) {
  const seed = 1000 + index;
  const kind = index % 6;
  const rocket = kind % 2 === 0 ? startRocket : heavyRocket;
  const consumables = { chute: rng() < 0.5, repair: rng() < 0.5, canister: rng() < 0.5, magnet: rng() < 0.5 };
  const base = { radar: rng(), beacons: rng(), weather: rng(), padSafety: rng(), fuelDropRate: 1 + rng() };
  const config = { seed, destination: ['earth', 'moon', 'mars'][index % 3], consumables, base, avionics: { predict: index % 3, assist: index % 2 } };
  if (kind === 2) config.start = { body: 'earth', alt: 500 + rng() * 9000, vx: rng() * 40 - 20, vy: rng() * 100 - 80 };
  if (kind === 3) config.start = { body: 'earth', alt: SPACE_ALT + rng() * 3000, vx: rng() * 60 - 30, vy: -rng() * 60 };
  if (kind === 4) config.start = { body: index % 2 ? 'moon' : 'mars', stageIndex: index % 5 === 0 ? 1 : 0 };
  return rocket(config);
}

test('60 simulated minutes of random input never produce a NaN, a negative tank or a broken state', () => {
  const rng = mulberry32(2024);
  const TARGET = 3600;
  let simulated = 0;
  let flights = 0;
  const outcomes = {};

  while (simulated < TARGET) {
    const state = createFlight(scenario(flights, rng));
    flights += 1;
    let held = randomInput(rng);
    let hold = 0;
    let ticks = 0;
    while (!state.ended && state.time < 240 && simulated < TARGET) {
      if (hold <= 0) {
        held = randomInput(rng);
        hold = 15 + Math.floor(rng() * 60);
      }
      hold -= 1;
      step(state, held, DT);
      simulated += DT;
      ticks += 1;

      for (const field of HOT_FIELDS) {
        if (!Number.isFinite(state[field])) assert.fail(`${field} is ${state[field]} in flight ${flights} at ${state.time}`);
      }
      if (state.stages.some((stage) => stage.fuel < 0 || stage.fuel > stage.maxFuel + 1e-9)) assert.fail('tank out of range');
      if (state.hp < 0 || state.hp > state.maxHp + 1e-9) assert.fail(`hp ${state.hp}`);
      if (ticks % 1200 === 0) assert.equal(findNonFinite(state), null);
    }
    assert.equal(findNonFinite(state), null);
    assert.equal(findNonFinite(summarize(state), 'result'), null);
    const outcome = summarize(state).outcome;
    outcomes[outcome] = (outcomes[outcome] ?? 0) + 1;
  }

  assert.ok(flights > 20, `only ${flights} flights`);
  assert.ok(simulated >= TARGET);
  assert.ok((outcomes.crashed ?? 0) > 0, JSON.stringify(outcomes));
});

test('wild inputs (NaN, huge numbers, missing fields) are tolerated', () => {
  const state = createFlight(heavyRocket({ seed: 3 }));
  const inputs = [
    undefined, null, {}, { throttle: NaN, tilt: Infinity }, { throttle: 5, tilt: -9 }, { throttle: '1', tilt: 'left' },
    { throttle: 1, boost: 'yes', transfer: 1, parachute: {} },
  ];
  for (let i = 0; i < 2400; i++) {
    step(state, inputs[i % inputs.length], DT);
    if (state.ended) break;
  }
  assert.equal(findNonFinite(state), null);
  assert.ok(state.throttle >= 0 && state.throttle <= 1);
});

test('odd configs are repaired instead of breaking the flight', () => {
  const state = createFlight({
    seed: 'x', era: 99, destination: 'jupiter', stages: [{ id: 'nonsense', fuel: -5, thrust: NaN }, { id: 'capsule' }],
    hull: { hp: NaN }, legs: { vTol: Infinity }, base: { radar: 9 }, start: { body: 'venus' },
  });
  assert.equal(findNonFinite(state), null);
  assert.equal(state.cfg.era, 5);
  assert.equal(state.cfg.destination, 'earth');
  assert.equal(state.cfg.start, null);
  for (let i = 0; i < 600; i++) step(state, { throttle: 1, tilt: 0.3 }, DT);
  assert.equal(findNonFinite(state), null);
});
