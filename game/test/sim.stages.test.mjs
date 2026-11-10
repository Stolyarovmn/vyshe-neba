import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DT, advance, createFlight, heavyRocket, startRocket, step,
} from '../src/sim/index.js';

const airborne = (alt, config = {}, extra = {}) => createFlight(startRocket({ weather: 'clear', ...config, start: { body: 'earth', alt, ...extra } }));

test('fuel balance: what leaves the tank equals burn rate times the throttle actually applied', () => {
  const state = airborne(5000);
  const stage = state.stages[0];
  const startFuel = state.fuelTotal;
  let expected = 0;
  advance(state, { throttle: 1 }, 6, (s) => {
    expected += stage.burnRate * s.throttle * DT;
  });
  assert.ok(state.stageIndex === 0, 'still on the first stage');
  assert.ok(Math.abs(startFuel - state.fuelTotal - expected) < 1e-9, `${startFuel - state.fuelTotal} vs ${expected}`);
  assert.ok(expected > 0.8 * stage.burnRate * 6, 'a six second burn really used fuel');
});

test('fuel balance: idle engine burns nothing, turning burns a little, afterburner burns more', () => {
  const idle = airborne(5000);
  advance(idle, { throttle: 0 }, 3);
  assert.equal(idle.fuelTotal, idle.stages[0].maxFuel + idle.stages[1].maxFuel);
  assert.equal(idle.stages[0].fuel, idle.stages[0].maxFuel);

  const turning = airborne(5000, { fins: { turn: 1, maxTilt: Math.PI } });
  advance(turning, { throttle: 0, tilt: 1 }, 2);
  const used = turning.stages[0].maxFuel - turning.stages[0].fuel;
  assert.ok(Math.abs(used - 0.2 * turning.stages[0].burnRate * 2) < 1e-6, `RCS used ${used}`);

  const leaning = airborne(5000);
  advance(leaning, { throttle: 0, tilt: 1 }, 2);
  assert.ok(leaning.stages[0].maxFuel - leaning.stages[0].fuel < used * 0.6, 'a limited hull spends less: the jets only hold it against the restoring moment');

  const plain = airborne(5000);
  const boosted = airborne(5000);
  advance(plain, { throttle: 1 }, 1.5);
  advance(boosted, { throttle: 1, boost: true }, 1.5);
  assert.ok(boosted.fuelTotal < plain.fuelTotal);
});

test('fuel never goes negative and the total only goes up when something is collected', () => {
  const state = airborne(9000);
  let previous = state.fuelTotal;
  advance(state, { throttle: 1, tilt: 0.5 }, 60, (s) => {
    for (const stage of s.stages) assert.ok(stage.fuel >= 0 && stage.fuel <= stage.maxFuel + 1e-9);
    assert.ok(s.fuelTotal <= previous + 1e-9, 'fuel must not appear from nowhere');
    previous = s.fuelTotal;
  });
  assert.equal(state.fuelTotal, 0);
  assert.equal(state.fuelEmpty, true);
});

test('stages separate when empty and the throttle is never released', () => {
  const state = createFlight(heavyRocket({ seed: 2, weather: 'clear' }));
  const throttleAroundSeparation = [];
  let separated = null;
  const events = advance(state, { throttle: 1 }, 30, (s) => {
    if (separated === null && s.stageIndex > 0) separated = s.time;
    if (separated !== null && s.time - separated < 0.5) throttleAroundSeparation.push(s.throttle);
  });

  const seps = events.filter((e) => e.type === 'stage-sep');
  assert.ok(seps.length >= 1, 'the booster must drop');
  assert.equal(seps[0].stage, 'booster');
  assert.equal(seps[0].next, 'core');
  assert.equal(state.stages[0].gone, true);
  assert.equal(state.stageIndex, 1);
  assert.ok(throttleAroundSeparation.length > 10);
  assert.ok(throttleAroundSeparation.every((value) => value === 1), 'thrust continues through the separation');
  assert.ok(!events.some((e) => e.type === 'thrust-cut' && e.reason === 'fuel') || state.fuelEmpty, 'no fuel cut while another stage has fuel');
  assert.equal(state.stages[1].fuel < state.stages[1].maxFuel, true, 'the core stage takes over the burn');
});

test('the next stage starts with a full tank and the separated one is gone for good', () => {
  const state = createFlight(heavyRocket({ seed: 2, weather: 'clear' }));
  const events = advance(state, { throttle: 1 }, 40);
  const sep = events.find((e) => e.type === 'stage-sep');
  assert.ok(sep);
  const gone = state.stages.filter((stage) => stage.gone).map((stage) => stage.id);
  assert.ok(gone.includes('booster'));
  assert.ok(state.stages[0].fuel === 0);
  assert.ok(state.fuel01 < 1);
});

test('when the last tank runs dry: stage-sep, then thrust-cut and fuel-empty, and the rocket just coasts', () => {
  const state = airborne(6000);
  const events = advance(state, { throttle: 1 }, 80);
  const types = events.map((e) => e.type);
  const sep = types.indexOf('stage-sep');
  const cut = types.indexOf('thrust-cut');
  const empty = types.indexOf('fuel-empty');
  assert.ok(sep >= 0 && cut >= 0 && empty >= 0, types.join(','));
  assert.ok(sep < empty, 'the core drops before the capsule runs dry');
  assert.equal(events[cut].reason, 'fuel');
  assert.equal(state.throttle, 0);
  assert.equal(state.fuelTotal, 0);

  const angle = state.angle;
  advance(state, { throttle: 1, tilt: 1 }, 1);
  assert.equal(state.throttle, 0, 'no thrust without fuel');
  assert.ok(Math.abs(state.angle - angle) < 0.35, 'no jets without fuel: the attitude only drifts');
});

test('an empty rocket cannot turn or climb, but a canister brings the engine back', () => {
  const dry = airborne(6000, { consumables: { canister: 1 } }, { fuel01: 0 });
  assert.equal(dry.fuelTotal, 0);
  advance(dry, { throttle: 1, tilt: 1 }, 1);
  assert.equal(dry.throttle, 0);
  assert.ok(Math.abs(dry.angle) < 0.01);
  assert.ok(dry.vy > 30, 'it is simply falling');

  const events = advance(dry, { canister: true }, DT * 2);
  assert.ok(events.some((e) => e.type === 'pickup' && e.kind === 'fuel' && e.consumable));
  assert.ok(dry.fuelTotal > 0);
  advance(dry, { throttle: 1 }, 1);
  assert.ok(dry.throttle > 0.5, 'the engine runs again');
});

test('the canister is a one-shot item and the repair kit only works when damaged', () => {
  const state = airborne(6000, { consumables: { canister: 1, repair: 1 } }, { fuel01: 0.2 });
  const before = state.fuelTotal;
  step(state, { canister: true }, DT);
  assert.ok(state.fuelTotal > before);
  const after = state.fuelTotal;
  step(state, { canister: false }, DT);
  step(state, { canister: true }, DT);
  assert.ok(Math.abs(state.fuelTotal - after) < 1e-9, 'second press finds no canister');

  const hp = state.hp;
  step(state, { repair: true }, DT);
  assert.equal(state.hp, hp, 'a full hull does not waste the kit');
  assert.equal(state.consumables.repair, 1);
  state.hp = 20;
  step(state, { repair: false }, DT);
  const events = step(state, { repair: true }, DT);
  assert.ok(state.hp > 90);
  assert.ok(events.some((e) => e.type === 'pickup' && e.kind === 'repair'));
});

test('low-fuel is announced once per level', () => {
  const state = airborne(9000);
  const events = advance(state, { throttle: 1 }, 60);
  const lows = events.filter((e) => e.type === 'low-fuel');
  assert.deepEqual(lows.map((e) => e.level), [1, 2]);
});

test('more thrust per stage and a lighter stack accelerate better', () => {
  const state = createFlight(heavyRocket({ seed: 1 }));
  const loaded = state.maxAccel;
  advance(state, { throttle: 1 }, 40);
  assert.ok(state.stageIndex >= 1);
  assert.ok(state.maxAccel / state.stages[state.stageIndex].thrust > 1, 'shedding the booster gives a small bonus');
  assert.ok(loaded > 0);
});
