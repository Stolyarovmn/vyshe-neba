import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BODIES, SPACE_ALT, advance, createFlight, heavyRocket, runFlight, step,
} from '../src/sim/index.js';

const inSpace = (config = {}, start = {}) => createFlight(heavyRocket({
  weather: 'clear', destination: 'moon', ...config, start: { body: 'earth', alt: SPACE_ALT + 300, vy: -40, ...start },
}));

test('the transfer is offered only in space, only to Moon or Mars, and only with enough fuel', () => {
  assert.equal(inSpace().canTransfer, true);
  assert.equal(inSpace({ destination: 'earth' }).canTransfer, false);
  assert.equal(createFlight(heavyRocket({ destination: 'moon', start: { body: 'earth', alt: 3000 } })).canTransfer, false);
  assert.equal(createFlight(heavyRocket({ destination: 'moon' })).canTransfer, false, 'not on the pad either');
  assert.equal(inSpace({}, { fuel01: 0.01 }).canTransfer, false, 'the manoeuvre costs more than is left');

  const early = inSpace({ destination: 'earth' });
  const events = advance(early, { transfer: true }, 0.5);
  assert.ok(!events.some((e) => e.type === 'transfer-start'));
  assert.equal(early.phase, 'space');
});

test('a transfer to the Moon spends fuel and ends in an approach over the Moon', () => {
  const state = inSpace();
  const core = state.stages.find((stage) => stage.id === 'core');
  const cost = state.cfg.transferCost.moon * core.maxFuel;
  assert.ok(Math.abs(state.transferCostFuel - cost) < 1e-9);
  const before = state.fuelTotal;

  const first = step(state, { transfer: true }, 1 / 120);
  assert.equal(first.at(-1).type, 'transfer-start', 'spent stages may drop first, then the manoeuvre starts');
  assert.ok(Math.abs(before - state.fuelTotal - cost) < 1e-9, 'exactly the transfer cost leaves the tank');
  assert.equal(state.phase, 'transfer');
  assert.equal(state.body, 'earth', 'still travelling');

  const later = [];
  while (state.phase === 'transfer') later.push(...step(state, { throttle: 1 }, 1 / 120));
  assert.deepEqual(later.map((e) => e.type), ['transfer-done']);
  assert.equal(state.phase, 'descent');
  assert.equal(state.body, 'moon');
  assert.equal(state.approach, true);
  assert.ok(Math.abs(state.alt - BODIES.moon.approach.alt) < 5);
  assert.ok(state.vy >= BODIES.moon.approach.vMin - 1e-9 && state.vy <= BODIES.moon.approach.vMax + 1e-9);
  assert.equal(state.canTransfer, false);
  assert.ok(Math.abs(state.fuelTotal - (before - cost)) < 1e-6, 'nothing else burned in transit');
  assert.ok(Math.abs(state.pad.x) >= 150 && Math.abs(state.pad.x) <= 350);
  assert.equal(later[0].body, 'moon');
});

test('the controls are locked during the manoeuvre', () => {
  const state = inSpace();
  step(state, { transfer: true }, 1 / 120);
  const angle = state.angle;
  advance(state, { throttle: 1, tilt: 1 }, 1);
  assert.equal(state.throttle, 0);
  assert.equal(state.angle, angle);
  assert.equal(state.phase, 'transfer');
});

test('a bigger reserve means a gentler arrival, and Mars costs more than the Moon', () => {
  const arrive = (destination, fuel01) => {
    const state = inSpace({ destination }, { fuel01 });
    const cost = state.transferCostFuel;
    advance(state, { transfer: true }, 5);
    return { state, cost };
  };
  const rich = arrive('moon', 1).state;
  const poor = arrive('moon', 0.3).state;
  assert.ok(rich.vy < poor.vy, `${rich.vy} should be slower than ${poor.vy}`);

  const moon = arrive('moon', 1);
  const mars = arrive('mars', 1);
  assert.equal(mars.state.body, 'mars');
  assert.ok(mars.cost > moon.cost);
  assert.ok(mars.state.fuelTotal < moon.state.fuelTotal);
});

test('the whole trip: climb, transfer, land on the Moon and on Mars (autopilot)', () => {
  for (const destination of ['moon', 'mars']) {
    const { result, events } = runFlight(heavyRocket({ seed: 3, destination }), { skill: 1, mission: 'space', maxTime: 900 });
    assert.equal(result.transferred, true);
    assert.equal(result.body, destination);
    assert.equal(result.outcome, 'landed', result.reason);
    assert.ok(result.maxAlt >= SPACE_ALT);
    const types = events.map((e) => e.type);
    assert.ok(types.indexOf('transfer-start') < types.indexOf('transfer-done'));
    assert.ok(types.indexOf('transfer-done') < types.indexOf('touch'));
    assert.ok(result.zones.includes('space'));
  }
});

test('a rocket can come back from space to Earth with its own fuel', () => {
  const { result } = runFlight(heavyRocket({ seed: 3, destination: 'earth' }), { skill: 1, mission: 'space', maxTime: 900 });
  assert.equal(result.transferred, false);
  assert.equal(result.body, 'earth');
  assert.ok(result.maxAlt >= SPACE_ALT);
  assert.equal(result.outcome, 'landed', result.reason);
});

test('stranded in space with an empty tank ends the flight instead of hanging forever', () => {
  const state = inSpace({ destination: 'earth' }, { fuel01: 0, vy: -10 });
  const events = advance(state, { throttle: 1 }, 30);
  assert.equal(state.phase, 'crashed');
  assert.equal(events.find((e) => e.type === 'crashed').reason, 'lost-in-space');
});
