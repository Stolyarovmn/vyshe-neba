import test from 'node:test';
import assert from 'node:assert/strict';
import {
  advance, createFlight, heavyRocket, runFlight, startRocket, step,
} from '../src/sim/index.js';

const indexOfType = (events, type) => events.findIndex((e) => e.type === type);

test('a normal hop reports liftoff, then touch, then landed - once each, in that order', () => {
  const { events, result } = runFlight(startRocket({ seed: 2 }), { skill: 1, mission: 'hop', targetAlt: 90 });
  const types = events.map((e) => e.type);
  assert.equal(result.outcome, 'landed');
  assert.equal(types.filter((t) => t === 'liftoff').length, 1);
  assert.equal(types.filter((t) => t === 'touch').length, 1);
  assert.equal(types.filter((t) => t === 'landed').length, 1);
  assert.ok(!types.includes('crashed'));
  assert.equal(types[types.indexOf('touch') + 1], 'landed', 'landed follows touch directly');
  assert.ok(types.indexOf('liftoff') < types.indexOf('touch'));
  assert.equal(types.at(-1), 'landed', 'nothing comes after the end');
  const landed = events.at(-1);
  assert.equal(landed.perfect, true);
});

test('a crash reports touch, then crashed with a reason', () => {
  const state = createFlight(startRocket({ weather: 'clear', start: { body: 'earth', alt: 200 } }));
  const events = advance(state, { throttle: 0 }, 10);
  const types = events.map((e) => e.type);
  assert.deepEqual(types.slice(-2), ['touch', 'crashed']);
  assert.equal(typeof events.at(-1).reason, 'string');
});

test('events carry the simulation time and arrive in time order', () => {
  const { events } = runFlight(heavyRocket({ seed: 5, destination: 'moon' }), { skill: 1, mission: 'space', maxTime: 900 });
  let previous = -1;
  for (const event of events) {
    assert.equal(typeof event.t, 'number');
    assert.ok(event.t >= previous, `${event.type} at ${event.t} came after ${previous}`);
    previous = event.t;
  }
});

test('the heavy rocket trip tells its story in the right order', () => {
  // A tough hull keeps a chance collision with traffic from cutting the story short.
  const config = heavyRocket({ seed: 5, destination: 'moon', hull: { hp: 100000, debrisResist: 8 } });
  const { events, result } = runFlight(config, { skill: 1, mission: 'space', maxTime: 900 });
  assert.equal(result.outcome, 'landed');
  const at = (type) => indexOfType(events, type);
  assert.ok(at('liftoff') === 0 || events.slice(0, at('liftoff')).every((e) => e.type === 'warn' || e.type === 'pickup'));
  assert.ok(at('liftoff') < at('stage-sep'), 'booster drops after liftoff');
  assert.ok(at('stage-sep') < at('transfer-start'));
  assert.ok(at('transfer-start') < at('transfer-done'));
  assert.ok(at('transfer-done') < at('touch'));
  assert.ok(at('touch') < at('landed'));

  const zones = events.filter((e) => e.type === 'zone' && e.first).map((e) => e.id);
  assert.deepEqual(zones.slice(0, 3), ['above-clouds', 'stratosphere', 'high-route'], 'zones open from the bottom up');
  assert.ok(zones.includes('space'));
  assert.ok(at('zone') < at('transfer-start'));
});

test('the transfer events keep their own order even with other events around', () => {
  const state = createFlight(heavyRocket({ weather: 'clear', destination: 'mars', start: { body: 'earth', alt: 10500, vy: -30 } }));
  const events = advance(state, { transfer: true }, 6);
  const types = events.map((e) => e.type);
  assert.ok(types.indexOf('transfer-start') < types.indexOf('transfer-done'));
  assert.equal(events.find((e) => e.type === 'transfer-done').body, 'mars');
});

test('a finished flight ignores further input and reports nothing', () => {
  const state = createFlight(startRocket({ weather: 'clear', start: { body: 'earth', alt: 50 } }));
  advance(state, { throttle: 0 }, 5);
  assert.equal(state.ended, true);
  const frozen = JSON.stringify(state);
  assert.deepEqual(step(state, { throttle: 1, tilt: 1 }, 1), []);
  assert.equal(JSON.stringify(state), frozen);
});

test('pickups and rings are reported as events with positions', () => {
  const state = createFlight(startRocket({ weather: 'clear' }));
  state.objects.push(
    { id: 9001, kind: 'coin', hazard: false, x: 0, y: -60, r: 9, active: true },
    { id: 9002, kind: 'ring', hazard: false, orient: 'horizontal', halfWidth: 70, x: 0, y: -90, r: 70, active: true },
  );
  const events = advance(state, { throttle: 1 }, 4);
  const coin = events.find((e) => e.type === 'pickup' && e.kind === 'coin');
  assert.ok(coin && coin.value === 4 && typeof coin.x === 'number');
  assert.ok(events.some((e) => e.type === 'ring'));
  assert.ok(state.coins >= 4 && state.rings >= 1);
});
