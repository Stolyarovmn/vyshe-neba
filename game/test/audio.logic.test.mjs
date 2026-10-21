// Vocabulary, catalogue, zones, helpers and analysis: pure logic, no Web Audio.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { analyze, encodeWav } from '../src/audio/analyze.js';
import { IDLE_FRAME, normalizeFrame } from '../src/audio/frame.js';
import { makeCeilingCurve, CEILING } from '../src/audio/graph.js';
import { deriveMusicTarget } from '../src/audio/music.js';
import { isSfxName, PHASES, SCENES, SFX_NAMES, sfxForEvent, ZONES } from '../src/audio/names.js';
import { frameAt } from '../src/audio/offline.js';
import { createRng, hashString, mulberry32 } from '../src/audio/prng.js';
import { SFX_CATALOG } from '../src/audio/sfx.js';
import { approach, clamp, dbToGain, expLerp, midiToHz, smoothstep, volumeToGain } from '../src/audio/util.js';
import { AIR_CUTOFF, environmentFor, normalizeZone, ZONE_LIMITS, zoneForFrame } from '../src/audio/zones.js';

const srcDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'audio');

// ---- names and catalogue ----

const REQUIRED_SFX = [
  'ui-hover', 'ui-press', 'ui-deny', 'ui-back', 'purchase', 'build', 'build-complete', 'era-up', 'achievement', 'coin', 'ring',
  'fuel-pickup', 'repair', 'stage-sep', 'liftoff', 'thrust-cut', 'low-fuel-alarm', 'warn', 'parachute-open', 'touch-soft',
  'touch-hard', 'crash', 'explosion', 'transfer-start', 'transfer-done', 'storm-thunder', 'near-miss', 'hit', 'countdown-tick',
  'countdown-go', 'toast',
];

test('the sfx vocabulary is exactly the one in the brief', () => {
  assert.deepEqual([...SFX_NAMES].sort(), [...REQUIRED_SFX].sort());
  assert.equal(new Set(SFX_NAMES).size, SFX_NAMES.length, 'no duplicates');
  assert.ok(isSfxName('coin') && !isSfxName('banana'));
  assert.ok(Object.isFrozen(SFX_NAMES));
});

test('the catalogue covers every name and nothing else', () => {
  assert.deepEqual(Object.keys(SFX_CATALOG).sort(), [...SFX_NAMES].sort());
  for (const [name, entry] of Object.entries(SFX_CATALOG)) {
    assert.ok(['ui', 'world'].includes(entry.bus), `${name}: bus`);
    assert.ok(entry.gain > 0 && entry.gain <= 2, `${name}: gain`);
    assert.ok(entry.cooldown >= 0 && entry.cooldown <= 2, `${name}: cooldown`);
    assert.ok(Number.isInteger(entry.maxVoices) && entry.maxVoices >= 1, `${name}: maxVoices`);
    assert.ok(Number.isInteger(entry.priority) && entry.priority >= 0 && entry.priority <= 9, `${name}: priority`);
    assert.equal(typeof entry.play, 'function', `${name}: play`);
    if (entry.duck) {
      assert.ok(entry.duck.depth > 0 && entry.duck.depth < 1 && entry.duck.hold >= 0 && entry.duck.release > 0, `${name}: duck`);
    }
  }
  // Big moments duck the music, tiny ones do not.
  for (const name of ['crash', 'era-up', 'liftoff', 'achievement', 'purchase']) assert.ok(SFX_CATALOG[name].duck, `${name} ducks music`);
  for (const name of ['ui-hover', 'coin', 'ui-press']) assert.equal(SFX_CATALOG[name].duck, undefined, `${name} leaves the music alone`);
  assert.ok(SFX_CATALOG.crash.duck.depth < SFX_CATALOG.purchase.duck.depth, 'a crash ducks harder than a purchase');
});

test('simulation events map to sound effects', () => {
  assert.deepEqual(sfxForEvent({ type: 'liftoff' }).name, 'liftoff');
  assert.equal(sfxForEvent({ type: 'stage-sep' }).name, 'stage-sep');
  assert.equal(sfxForEvent({ type: 'parachute' }).name, 'parachute-open');
  assert.equal(sfxForEvent({ type: 'storm' }).name, 'storm-thunder');
  assert.equal(sfxForEvent({ type: 'low-fuel' }).name, 'low-fuel-alarm');
  assert.equal(sfxForEvent({ type: 'crashed', reason: 'speed' }).name, 'crash');
  assert.equal(sfxForEvent({ type: 'pickup', kind: 'coin' }).name, 'coin');
  assert.equal(sfxForEvent({ type: 'pickup', kind: 'fuel' }).name, 'fuel-pickup');
  assert.equal(sfxForEvent({ type: 'pickup', kind: 'repair' }).name, 'repair');
  assert.equal(sfxForEvent({ type: 'touch', hard: true }).name, 'touch-hard');
  assert.equal(sfxForEvent({ type: 'touch', severity: 0.2 }).name, 'touch-soft');
  assert.equal(sfxForEvent({ type: 'warn', kind: 'hull' }).params.kind, 'hull');
  assert.equal(sfxForEvent({ type: 'landed', perfect: false }), null);
  assert.equal(sfxForEvent({ type: 'landed', perfect: true }).name, 'achievement');
  for (const bad of [null, undefined, {}, { type: 42 }, { type: 'zone' }, { type: 'fuel-empty' }]) assert.equal(sfxForEvent(bad), null);
  for (const type of ['liftoff', 'stage-sep', 'ring', 'near-miss', 'hit', 'thrust-cut', 'transfer-start', 'transfer-done', 'parachute', 'storm', 'low-fuel', 'warn', 'pickup', 'touch', 'crashed', 'landed']) {
    const mapped = sfxForEvent({ type, perfect: true });
    assert.ok(mapped && isSfxName(mapped.name), `${type} maps to a real effect`);
  }
});

test('scenes, zones and phases are the documented ones', () => {
  assert.deepEqual([...SCENES], ['hub', 'flight', 'results']);
  assert.deepEqual([...ZONES], ['ground', 'troposphere', 'stratosphere', 'space', 'moon', 'mars']);
  for (const phase of ['pad', 'ascent', 'space', 'transfer', 'descent', 'landed', 'crashed']) assert.ok(PHASES.includes(phase));
});

// ---- zones and environment ----

test('zones follow altitude, body and phase', () => {
  const f = (patch) => normalizeFrame({ phase: 'ascent', atmo: 1, ...patch });
  assert.equal(zoneForFrame(f({ alt01: 0 })), 'ground');
  assert.equal(zoneForFrame(f({ alt01: ZONE_LIMITS.ground + 0.001 })), 'troposphere');
  assert.equal(zoneForFrame(f({ alt01: ZONE_LIMITS.troposphere + 0.01, atmo: 0.3 })), 'stratosphere');
  assert.equal(zoneForFrame(f({ alt01: 0.99, atmo: 0.1 })), 'space');
  assert.equal(zoneForFrame(f({ alt01: 0.5, atmo: 0 })), 'space', 'no air means space');
  assert.equal(zoneForFrame(f({ body: 'moon', alt01: 0.01 })), 'moon');
  assert.equal(zoneForFrame(f({ body: 'mars', alt01: 0.4, atmo: 0.2 })), 'mars');
  assert.equal(zoneForFrame(f({ phase: 'transfer', alt01: 0.2 })), 'space');
  for (const zone of ZONES) assert.equal(normalizeZone(zone), zone);
  assert.equal(normalizeZone('orbit'), 'space');
  assert.equal(normalizeZone('atmosphere'), 'troposphere');
  assert.equal(normalizeZone('nope'), null);
  assert.equal(normalizeZone(undefined), null);
  assert.equal(normalizeZone(12), null);
});

test('environment: thin air swallows highs; reverb stays bounded', () => {
  let last = null;
  for (let i = 0; i <= 20; i++) {
    const env = environmentFor({ atmo: i / 20, phase: 'ascent' });
    assert.ok(env.airCutoff >= AIR_CUTOFF.min - 1 && env.airCutoff <= AIR_CUTOFF.max + 1);
    assert.ok(env.worldReverb > 0.05 && env.worldReverb < 0.5);
    if (last) assert.ok(env.airCutoff > last.airCutoff, 'more air, more highs');
    last = env;
  }
  assert.equal(Math.round(environmentFor({ atmo: 1, phase: 'ascent' }).airCutoff), AIR_CUTOFF.max);
  assert.equal(Math.round(environmentFor({ atmo: 0, phase: 'space' }).airCutoff), AIR_CUTOFF.min);
  assert.ok(environmentFor({ atmo: 0.1, phase: 'ascent' }).worldReverb > environmentFor({ atmo: 1, phase: 'ascent' }).worldReverb, 'echoes carry in thin air');
  assert.ok(environmentFor({ atmo: 0, phase: 'space' }).hullDominance > 0.9);
  assert.equal(environmentFor({ atmo: 1, phase: 'ascent' }).hullDominance, 0);
});

// ---- frame handling and music target ----

test('normalizeFrame fills and clamps', () => {
  const f = normalizeFrame({ throttle: 4, atmo: -1, stage: 2.9, rcs: { left: 9 }, body: 'venus', phase: 3, fuel01: NaN });
  assert.equal(f.throttle, 1);
  assert.equal(f.atmo, 0);
  assert.equal(f.stage, 2);
  assert.deepEqual(f.rcs, { left: 1, right: 0 });
  assert.equal(f.body, 'earth');
  assert.equal(f.phase, 'ascent');
  assert.equal(f.fuel01, 0, 'NaN counts as empty rather than propagating');
  assert.deepEqual(normalizeFrame(undefined), normalizeFrame({ phase: 'ascent' }));
  assert.equal(normalizeFrame(IDLE_FRAME).phase, 'hub');
});

test('music target: explicit values win, danger and low fuel add tension', () => {
  const flying = normalizeFrame({ phase: 'ascent', throttle: 1, speed01: 0.8, alt01: 0.3, atmo: 0.5, fuel01: 0.9 });
  const auto = deriveMusicTarget(flying, {});
  assert.equal(auto.scene, 'flight');
  assert.equal(auto.zone, 'stratosphere');
  assert.ok(auto.intensity > 0.6);
  assert.equal(auto.tension, 0);
  assert.equal(deriveMusicTarget(normalizeFrame({ phase: 'hub' }), {}).scene, 'hub');
  assert.equal(deriveMusicTarget(flying, { scene: 'results' }).scene, 'results');
  assert.equal(deriveMusicTarget(flying, { zone: 'moon' }).zone, 'moon');
  assert.equal(deriveMusicTarget(flying, { zone: 'garbage' }).zone, 'stratosphere', 'bad zone falls back to the frame');
  assert.equal(deriveMusicTarget(flying, { intensity: 0.1 }).intensity, 0.1);
  assert.ok(deriveMusicTarget({ ...flying, danger01: 1 }, { intensity: 0.2 }).intensity > 0.55, 'danger adds on top');
  assert.equal(deriveMusicTarget({ ...flying, danger01: 1 }, { scene: 'results' }).tension, 0, 'no tension outside flight');
  assert.equal(deriveMusicTarget(flying, { scene: 'results', mood: 'fail' }).mood, 'fail');
  assert.equal(deriveMusicTarget({ ...flying, fuel01: 0.04 }, {}).tension, 1, 'almost empty tank');
  assert.equal(deriveMusicTarget({ ...flying, fuel01: 0.5 }, {}).tension, 0);
  assert.equal(deriveMusicTarget({ ...flying, phase: 'landed', fuel01: 0.01 }, {}).tension, 0, 'no panic after landing');
  assert.equal(deriveMusicTarget({ ...flying, paused: true }, {}).paused, true);
});

// ---- util and prng ----

test('util helpers', () => {
  assert.equal(clamp(5, 0, 1), 1);
  assert.equal(clamp(NaN, 0, 1), 0);
  assert.equal(clamp('x', 2, 3), 2);
  assert.ok(Math.abs(midiToHz(69) - 440) < 1e-9 && Math.abs(midiToHz(81) - 880) < 1e-9 && Math.abs(midiToHz(57) - 220) < 1e-9);
  assert.ok(Math.abs(dbToGain(-6.0206) - 0.5) < 1e-4);
  assert.equal(expLerp(100, 400, 0.5), 200);
  assert.equal(smoothstep(0, 1, 0.5), 0.5);
  assert.equal(smoothstep(1, 0, 0), 1, 'reversed edges are allowed');
  assert.equal(smoothstep(0, 0, 3), 0, 'degenerate edges do not divide by zero');
  let last = -1;
  for (let i = 0; i <= 10; i++) {
    const g = volumeToGain(i / 10);
    assert.ok(g > last);
    last = g;
  }
  assert.equal(volumeToGain(0), 0);
  assert.equal(volumeToGain(1), 1);
  assert.equal(volumeToGain(2), 1);
  assert.equal(volumeToGain(-1), 0);
  const slow = approach(0, 1, 1 / 60, 0.5);
  let fast = 0;
  for (let i = 0; i < 6; i++) fast = approach(fast, 1, 1 / 360, 0.5);
  assert.ok(Math.abs(slow - fast) < 1e-12, 'smoothing does not depend on the frame rate');
  assert.equal(approach(3, 9, 0.1, 0), 9);
});

test('prng: reproducible, well spread, independent streams', () => {
  const a = mulberry32(42);
  const b = mulberry32(42);
  const seqA = Array.from({ length: 1000 }, a);
  const seqB = Array.from({ length: 1000 }, b);
  assert.deepEqual(seqA, seqB);
  assert.notDeepEqual(Array.from({ length: 10 }, mulberry32(43)), seqA.slice(0, 10));
  assert.ok(seqA.every((v) => v >= 0 && v < 1));
  const mean = seqA.reduce((s, v) => s + v, 0) / seqA.length;
  assert.ok(Math.abs(mean - 0.5) < 0.05, `mean ${mean}`);
  const buckets = new Array(10).fill(0);
  for (const v of seqA) buckets[Math.floor(v * 10)]++;
  assert.ok(buckets.every((n) => n > 60 && n < 140), `uniform buckets ${buckets}`);
  assert.equal(mulberry32(1)(), 0.6270739405881613, 'known first value of mulberry32(1)');

  const rng = createRng(7);
  const left = rng.fork('left');
  const right = rng.fork('right');
  assert.notEqual(left.next(), right.next());
  assert.equal(createRng(7).fork('left').next(), createRng(7).fork('left').next());
  assert.notEqual(hashString('pad'), hashString('bass'));
  for (let i = 0; i < 200; i++) {
    const n = rng.int(5);
    assert.ok(Number.isInteger(n) && n >= 0 && n < 5);
    const r = rng.range(2, 3);
    assert.ok(r >= 2 && r < 3);
    const s = rng.soft();
    assert.ok(s >= -1 && s <= 1);
    assert.ok([-1, 1].includes(rng.sign()));
  }
  assert.equal(rng.pick(['only']), 'only');
});

// ---- output stage ----

test('the ceiling curve is transparent below the knee and never exceeds the ceiling', () => {
  const curve = makeCeilingCurve(2049);
  const mid = (curve.length - 1) / 2;
  assert.equal(curve[mid], 0);
  for (let i = 0; i < curve.length; i++) {
    const x = (i / (curve.length - 1)) * 2 - 1;
    assert.ok(Math.abs(curve[i]) <= CEILING + 1e-6);
    if (Math.abs(x) <= 0.55) assert.ok(Math.abs(curve[i] - x) < 1e-6, 'linear below the knee');
    assert.ok(Math.sign(curve[i]) === Math.sign(x) || x === 0);
  }
  assert.ok(Math.abs(curve[curve.length - 1] + curve[0]) < 1e-6, 'symmetric');
  for (let i = 1; i < curve.length; i++) assert.ok(curve[i] >= curve[i - 1], 'monotonic');
  assert.ok(20 * Math.log10(CEILING) <= -1, 'ceiling is at or below -1 dBFS');
});

// ---- analysis ----

test('analyze measures peak, loudness, silence and invalid samples', () => {
  const rate = 8000;
  const sine = Float32Array.from({ length: rate * 2 }, (_, i) => 0.5 * Math.sin((2 * Math.PI * 440 * i) / rate));
  const a = analyze([sine, sine], rate);
  assert.ok(Math.abs(a.peakDb - -6.02) < 0.05, `peak ${a.peakDb}`);
  assert.ok(Math.abs(a.rmsDb - -9.03) < 0.1, `rms ${a.rmsDb}`);
  assert.equal(a.invalid, 0);
  assert.equal(a.longestSilence, 0);
  assert.ok(Math.abs(a.seconds - 2) < 1e-9);

  const gap = new Float32Array(rate * 3);
  gap.set(sine.subarray(0, rate), 0);
  gap.set(sine.subarray(0, rate / 2), rate * 2.5);
  const g = analyze([gap], rate);
  assert.ok(g.longestSilence >= 1.3 && g.longestSilence <= 1.6, `silence ${g.longestSilence}`);
  assert.ok(analyze([gap], rate, { from: 0, to: 0.9 }).longestSilence === 0, 'ranges are respected');

  const bad = Float32Array.from(sine);
  bad[10] = NaN;
  bad[20] = Infinity;
  assert.equal(analyze([bad], rate).invalid, 2);
  assert.ok(Number.isFinite(analyze([bad], rate).rmsDb));
  assert.ok(analyze([new Float32Array(rate)], rate).rmsDb < -150);
});

test('wav encoder writes a valid 16-bit header and clips safely', () => {
  const data = Float32Array.from([0, 0.5, -0.5, 2, -2]);
  const buffer = encodeWav([data, data], 22050);
  const view = new DataView(buffer);
  const text = (o) => String.fromCharCode(view.getUint8(o), view.getUint8(o + 1), view.getUint8(o + 2), view.getUint8(o + 3));
  assert.equal(text(0), 'RIFF');
  assert.equal(text(8), 'WAVE');
  assert.equal(view.getUint16(22, true), 2);
  assert.equal(view.getUint32(24, true), 22050);
  assert.equal(view.getUint32(40, true), data.length * 2 * 2);
  assert.equal(buffer.byteLength, 44 + data.length * 4);
  assert.equal(view.getInt16(44 + 3 * 4, true), 32767, 'positive overload clips');
  assert.equal(view.getInt16(44 + 4 * 4, true), -32768, 'negative overload clips');
});

// ---- offline script helpers ----

test('frameAt holds, ramps and defaults', () => {
  const keys = [
    { t: 1, frame: { throttle: 0, atmo: 1, phase: 'pad' }, ramp: true },
    { t: 3, frame: { throttle: 1, atmo: 0, phase: 'ascent', rcs: { left: 1 } } },
    { t: 4, frame: { throttle: 0.2, phase: 'space' } },
  ];
  assert.equal(frameAt(keys, 0).phase, 'hub', 'before the first key frame the idle frame applies');
  assert.equal(frameAt(keys, 1).throttle, 0);
  const mid = frameAt(keys, 2);
  assert.ok(Math.abs(mid.throttle - 0.5) < 1e-12 && Math.abs(mid.atmo - 0.5) < 1e-12);
  assert.equal(mid.phase, 'pad', 'non-numeric fields come from the earlier key');
  assert.ok(Math.abs(mid.rcs.left - 0.5) < 1e-12);
  assert.equal(frameAt(keys, 3.5).throttle, 1, 'no ramp flag: hold');
  assert.equal(frameAt(keys, 99).phase, 'space');
});

// ---- hygiene ----

const sources = fs.readdirSync(srcDir).filter((f) => f.endsWith('.js'));

test('hygiene: no wall clocks, no Math.random, no interval timers', () => {
  assert.ok(sources.length >= 15);
  for (const file of sources) {
    const code = fs.readFileSync(path.join(srcDir, file), 'utf8').replace(/\/\/.*$/gm, '');
    for (const banned of ['Math.random', 'Date.now', 'performance.now', 'setInterval', 'new Date', 'console.', 'debugger']) {
      assert.ok(!code.includes(banned), `${file} uses ${banned}`);
    }
  }
});

test('hygiene: every module loads in Node without a browser', async () => {
  for (const file of sources) {
    const module = await import(pathToFileURL(path.join(srcDir, file)).href);
    assert.ok(Object.keys(module).length > 0, `${file} exports something`);
  }
});

test('hygiene: no module reaches into other game folders', () => {
  for (const file of sources) {
    const code = fs.readFileSync(path.join(srcDir, file), 'utf8');
    for (const match of code.matchAll(/from '(\.[^']+)'/g)) assert.ok(match[1].startsWith('./') && !match[1].startsWith('../'), `${file} imports ${match[1]}`);
  }
});
