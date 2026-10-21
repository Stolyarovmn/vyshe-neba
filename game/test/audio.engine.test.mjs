// Engine, wind and RCS parameter mapping: pure logic, no Web Audio.

import assert from 'node:assert/strict';
import test from 'node:test';

import { mapEngine, STAGE_VOICES, stageVoice } from '../src/audio/engine.js';
import { createRng } from '../src/audio/prng.js';

const ground = { phase: 'ascent', throttle: 1, atmo: 1, alt01: 0.01, speed01: 0.3, stage: 1, fuel01: 0.8 };
const vacuum = { ...ground, phase: 'space', atmo: 0, alt01: 1 };

function flatten(object, prefix = '', out = {}) {
  for (const [key, value] of Object.entries(object)) {
    if (value && typeof value === 'object') flatten(value, `${prefix}${key}.`, out);
    else out[`${prefix}${key}`] = value;
  }
  return out;
}

test('every output is finite, even for garbage input', () => {
  const garbage = [undefined, null, {}, { throttle: NaN, atmo: Infinity, stage: -4, rcs: 'x' }, { throttle: 7, atmo: -3, speed01: 9, fuel01: -1, stage: 99, phase: 5 }];
  for (const input of garbage) {
    for (const [name, value] of Object.entries(flatten(mapEngine(input)))) {
      assert.ok(typeof value === 'number' && Number.isFinite(value), `${name} = ${value} for ${JSON.stringify(input)}`);
    }
  }
});

test('fuzz: values stay in sane ranges', () => {
  const rng = createRng(123);
  const phases = ['hub', 'pad', 'ascent', 'space', 'transfer', 'descent', 'landed', 'crashed'];
  for (let i = 0; i < 1500; i++) {
    const frame = {
      throttle: rng.next(), atmo: rng.next(), alt01: rng.next(), speed01: rng.next(), stage: rng.int(5), fuel01: rng.next(),
      danger01: rng.next(), storm: rng.next(), phase: rng.pick(phases), paused: rng.chance(0.2), rcs: { left: rng.next(), right: rng.next() },
    };
    const m = mapEngine(frame);
    for (const [name, value] of Object.entries(flatten(m))) {
      assert.ok(Number.isFinite(value) && value >= 0, `${name} = ${value} for ${JSON.stringify(frame)}`);
      if (/gain|rumble|body|rush|level|sputter|left|right|hiss|duck/i.test(name) && !/freq|cutoff|rate/i.test(name)) assert.ok(value <= 2, `${name} = ${value}`);
    }
    assert.ok(m.roar.cutoff >= 100 && m.roar.cutoff <= 20000);
  }
});

test('silent when nothing is burning: hub, crash, pause, no fuel, no throttle', () => {
  const silentEngine = (m) => m.level === 0 && m.roar.gain === 0 && m.formantGain === 0 && m.rumble.gain === 0 && m.body.gain === 0 && m.whine.gain === 0 && m.rush === 0;
  for (const phase of ['hub', 'crashed']) assert.ok(silentEngine(mapEngine({ ...ground, phase })), phase);
  assert.ok(silentEngine(mapEngine({ ...ground, paused: true })), 'paused');
  assert.ok(silentEngine(mapEngine({ ...ground, fuel01: 0 })), 'out of fuel');
  assert.ok(silentEngine(mapEngine({ ...ground, throttle: 0 })), 'idle');
  assert.ok(silentEngine(mapEngine({ ...ground, throttle: 0.01 })), 'dead zone below 1.5 %');
  assert.ok(mapEngine({ ...ground, throttle: 0.05 }).roar.gain > 0, 'but 5 % is audible');
});

test('pause silences wind, whistle and RCS too', () => {
  const m = mapEngine({ ...ground, speed01: 1, storm: 1, rcs: { left: 1, right: 1 }, paused: true });
  assert.equal(m.wind.gain, 0);
  assert.equal(m.wind.whistleGain, 0);
  assert.equal(m.rcs.left + m.rcs.right, 0);
});

test('throttle makes the engine louder, brighter and higher', () => {
  let last = null;
  for (let i = 1; i <= 20; i++) {
    const m = mapEngine({ ...ground, throttle: i / 20 });
    if (last) {
      assert.ok(m.roar.gain > last.roar.gain, 'roar gain');
      assert.ok(m.roar.cutoff > last.roar.cutoff, 'roar brightness');
      assert.ok(m.rumble.freq > last.rumble.freq, 'rumble pitch');
      assert.ok(m.rumble.gain > last.rumble.gain, 'rumble gain');
      assert.ok(m.whine.freq > last.whine.freq, 'turbopump pitch');
      assert.ok(m.crackle.rate > last.crackle.rate, 'crackle rate');
      assert.ok(m.formants[0].freq > last.formants[0].freq && m.formants[1].freq > last.formants[1].freq, 'formants rise');
      assert.ok(m.duckMusic > last.duckMusic, 'louder engine ducks the music more');
    }
    last = m;
  }
});

test('thin air removes the roar but keeps the hull vibration', () => {
  let last = null;
  for (let i = 0; i <= 20; i++) {
    const m = mapEngine({ ...ground, atmo: i / 20 });
    if (last) {
      assert.ok(m.roar.gain >= last.roar.gain, 'roar returns with air');
      assert.ok(m.roar.cutoff >= last.roar.cutoff, 'air carries highs');
      assert.ok(m.body.gain <= last.body.gain + 1e-12, 'hull vibration fades as air thickens');
    }
    last = m;
  }
  const air = mapEngine(ground);
  const none = mapEngine(vacuum);
  assert.equal(none.roar.gain, 0);
  assert.equal(none.formantGain, 0);
  assert.equal(none.rush, 0);
  assert.ok(none.body.gain > 0 && none.buzz.gain > 0 && none.rumble.gain > 0, 'a dull vibration remains in vacuum');
  assert.ok(none.body.gain > air.body.gain * 2, 'and dominates there');
  assert.ok(air.roar.gain > 0);
});

test('wind needs both speed and air', () => {
  let last = null;
  for (let i = 0; i <= 20; i++) {
    const m = mapEngine({ ...ground, throttle: 0, speed01: i / 20 });
    if (last) {
      assert.ok(m.wind.gain >= last.wind.gain && m.wind.freq >= last.wind.freq && m.wind.whistleGain >= last.wind.whistleGain, 'wind grows with speed');
    }
    last = m;
  }
  assert.equal(mapEngine({ ...vacuum, throttle: 0, speed01: 1 }).wind.gain, 0, 'no wind in vacuum');
  assert.equal(mapEngine({ ...vacuum, throttle: 0, speed01: 1 }).wind.whistleGain, 0);
  const calm = mapEngine({ ...ground, throttle: 0, speed01: 0.5, storm: 0 });
  const storm = mapEngine({ ...ground, throttle: 0, speed01: 0.5, storm: 1 });
  assert.ok(storm.wind.gain > calm.wind.gain && storm.wind.gust > calm.wind.gust, 'storms are gustier');
  assert.ok(mapEngine({ ...ground, throttle: 0, speed01: 0 }).wind.gain > 0, 'a faint breeze on the ground');
});

test('stage selects the voice: booster deep, capsule small and bright', () => {
  const booster = mapEngine({ ...ground, stage: 0 });
  const core = mapEngine({ ...ground, stage: 1 });
  const capsule = mapEngine({ ...ground, stage: 2 });
  assert.ok(booster.rumble.freq < core.rumble.freq && core.rumble.freq < capsule.rumble.freq);
  assert.ok(booster.roar.gain > core.roar.gain && core.roar.gain > capsule.roar.gain);
  assert.ok(capsule.roar.cutoff > core.roar.cutoff);
  assert.deepEqual(stageVoice(7), STAGE_VOICES[STAGE_VOICES.length - 1], 'extra stages reuse the last voice');
  assert.deepEqual(stageVoice(-2), STAGE_VOICES[0]);
});

test('running dry sputters', () => {
  assert.equal(mapEngine({ ...ground, fuel01: 0.5 }).sputter, 0);
  assert.equal(mapEngine({ ...ground, fuel01: 0.07 }).sputter, 0);
  const a = mapEngine({ ...ground, fuel01: 0.05 }).sputter;
  const b = mapEngine({ ...ground, fuel01: 0.02 }).sputter;
  assert.ok(a > 0 && b > a && b <= 1);
});

test('RCS: sides pass through, vacuum shifts the sound from hiss to body', () => {
  const m = mapEngine({ ...ground, rcs: { left: 0.7, right: 0.2 } });
  assert.equal(m.rcs.left, 0.7);
  assert.equal(m.rcs.right, 0.2);
  const air = mapEngine({ ...ground, rcs: { left: 1, right: 0 } });
  const space = mapEngine({ ...vacuum, rcs: { left: 1, right: 0 } });
  assert.ok(air.rcs.hiss > space.rcs.hiss && air.rcs.hissCutoff > space.rcs.hissCutoff);
  assert.ok(space.rcs.body > air.rcs.body);
  assert.ok(space.rcs.hiss > 0, 'still audible in vacuum');
});
