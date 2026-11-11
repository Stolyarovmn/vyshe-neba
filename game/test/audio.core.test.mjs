// The whole sound machine on a strict mock of Web Audio: no browser needed.
// The mock rejects non-finite values, negative times and bad ramps like the real
// API, and tracks node lifetime so leaks show up as numbers.

import assert from 'node:assert/strict';
import test from 'node:test';

import { createAudio } from '../src/audio/index.js';
import { createCore } from '../src/audio/core.js';
import { SFX_NAMES } from '../src/audio/names.js';
import { renderOffline } from '../src/audio/offline.js';
import { MockAudioContext } from './audio-mock.mjs';

function rig({ seed = 1, offline = false } = {}) {
  const ctx = new MockAudioContext();
  const clock = { t: 0 };
  const core = createCore({ ctx, seed, now: () => clock.t, offline });
  const advance = (to, frame, dt = 1 / 60) => {
    for (let t = clock.t; t < to - 1e-9; t += dt) {
      clock.t = t;
      ctx.advance(t);
      if (frame) core.update(dt, typeof frame === 'function' ? frame(t) : frame);
    }
    clock.t = to;
    ctx.advance(to);
  };
  return { ctx, core, clock, advance };
}

const flightFrame = (t) => ({
  phase: t > 8 ? 'descent' : 'ascent',
  throttle: Math.min(1, t / 3),
  atmo: Math.max(0, 1 - t / 10),
  alt01: Math.min(1, t / 10),
  speed01: Math.min(1, t / 6),
  stage: t > 5 ? 1 : 0,
  fuel01: Math.max(0, 1 - t / 14),
  danger01: t > 9 ? 0.8 : 0,
  rcs: { left: t % 2 < 0.4 ? 1 : 0, right: t % 3 < 0.3 ? 1 : 0 },
});

test('a flight runs without errors, warnings or invalid automation', () => {
  const { ctx, core, advance } = rig();
  core.music.set({ scene: 'flight' });
  for (let i = 0; i < SFX_NAMES.length; i++) {
    advance(i * 0.5 + 0.5, flightFrame);
    assert.equal(core.sfx(SFX_NAMES[i], { kind: 'hull' }), true, `${SFX_NAMES[i]} played`);
  }
  advance(20, flightFrame);
  const info = core.music.info();
  assert.equal(info.errors, 0, info.lastError);
  assert.ok(info.events > 100, 'music produced notes');
  assert.deepEqual(ctx.warnings, []);
});

test('every effect plays on its own, creates sound and cleans up after itself', () => {
  for (const name of SFX_NAMES) {
    const { ctx, core, advance } = rig();
    core.music.setMuted(true);
    advance(0.1, { phase: 'hub' });
    const before = ctx.liveCount();
    const created = ctx.stats.created;
    assert.equal(core.sfx(name, { kind: 'speed', series: 2 }), true, name);
    assert.ok(ctx.stats.created - created >= 4, `${name} builds a voice`);
    assert.ok(core.stats().sfxVoices >= 1, `${name} is counted`);
    advance(12, { phase: 'hub' });
    assert.equal(ctx.liveCount(), before, `${name}: every node is released (${ctx.liveCount() - before} left)`);
    assert.equal(core.stats().sfxVoices, 0, `${name}: voice list is empty`);
    assert.deepEqual(ctx.warnings, [], name);
  }
});

test('nothing leaks over a long session', () => {
  const { ctx, core, advance } = rig();
  const baseline = ctx.liveCount(); // the always-on graph, before any voice exists
  core.music.set({ scene: 'flight' });
  let peakLive = 0;
  for (let second = 1; second <= 240; second++) {
    advance(second, flightFrame);
    if (second % 3 === 0) core.sfx(SFX_NAMES[second % SFX_NAMES.length], {});
    peakLive = Math.max(peakLive, ctx.liveCount());
  }
  assert.ok(peakLive < baseline + 260, `live nodes peaked at ${peakLive} (baseline ${baseline})`);
  core.music.setMuted(true);
  advance(300, { phase: 'hub' });
  assert.equal(core.stats().voices, 0, 'no voice survives');
  assert.equal(ctx.liveCount(), baseline, 'the node count returns to the baseline');
  assert.ok(ctx.runningSources() <= 40, `only the always-on sources keep running (${ctx.runningSources()})`);
  assert.ok(core.stats().peakVoices <= 60, `voice peak ${core.stats().peakVoices}`);
});

test('polyphony is capped and the oldest voice is stolen', () => {
  const { core, advance, ctx } = rig();
  core.music.setMuted(true);
  advance(0.1, { phase: 'hub' });
  let played = 0;
  for (let i = 0; i < 60; i++) {
    advance(0.1 + (i + 1) * 0.03, { phase: 'hub' });
    if (core.sfx('coin', {})) played++;
    assert.ok(core.stats().sfxVoices <= 36, 'global sfx cap');
    assert.ok(core.stats().sfxVoices <= 12, 'coin cap (8) plus aux/rcs leeway');
  }
  assert.ok(played >= 50, 'rapid coins are not dropped');
  assert.ok(core.stats().stolen > 0, 'old coin voices were stolen');
  assert.deepEqual(ctx.warnings, []);
  advance(10, { phase: 'hub' });
  assert.equal(core.stats().sfxVoices, 0);
});

test('cooldowns drop machine-gun repeats', () => {
  const { core, advance } = rig();
  advance(1, { phase: 'hub' });
  assert.equal(core.sfx('ui-hover'), true);
  assert.equal(core.sfx('ui-hover'), false, 'same instant');
  advance(1.02, { phase: 'hub' });
  assert.equal(core.sfx('ui-hover'), false, '20 ms later is still too soon');
  advance(1.2, { phase: 'hub' });
  assert.equal(core.sfx('ui-hover'), true);
  assert.equal(core.sfx('not-a-sound'), false, 'unknown names are ignored');
  assert.ok(core.sfxStats.dropped >= 2);
});

test('coin pitch climbs with a streak and resets after a pause', () => {
  const { ctx, core, advance } = rig();
  advance(1, { phase: 'hub' });
  const oscillators = [];
  const original = ctx.createOscillator.bind(ctx);
  ctx.createOscillator = () => {
    const osc = original();
    oscillators.push(osc);
    return osc;
  };
  const pitches = [];
  const pick = (at) => {
    advance(at, { phase: 'hub' });
    const before = oscillators.length;
    core.sfx('coin');
    pitches.push(oscillators[before].frequency.value);
  };
  [1.1, 1.3, 1.5, 1.7, 1.9].forEach(pick);
  for (let i = 1; i < pitches.length; i++) assert.ok(pitches[i] > pitches[i - 1], `coin ${i} is higher: ${pitches}`);
  pick(5);
  assert.equal(pitches[5], pitches[0], 'after a pause the series restarts');
  pick(5.2);
  assert.ok(pitches[6] > pitches[5]);
  // An explicit series wins over the automatic one.
  advance(9, { phase: 'hub' });
  const before = oscillators.length;
  core.sfx('coin', { series: 4 });
  assert.equal(oscillators[before].frequency.value, pitches[4]);
});

test('effects honour pan, gain and pitch parameters', () => {
  const { ctx, core, advance } = rig();
  advance(1, { phase: 'hub' });
  const panners = [];
  const originalPanner = ctx.createStereoPanner.bind(ctx);
  ctx.createStereoPanner = () => {
    const node = originalPanner();
    panners.push(node);
    return node;
  };
  core.sfx('ui-press', { pan: -0.7 });
  assert.ok(panners.some((p) => Math.abs(p.pan.value + 0.7) < 1e-9), 'pan was applied');
  const gains = [];
  const originalGain = ctx.createGain.bind(ctx);
  ctx.createGain = () => {
    const node = originalGain();
    gains.push(node);
    return node;
  };
  advance(2, { phase: 'hub' });
  core.sfx('toast', { gain: 0 });
  assert.equal(gains[0].gain.value, 0, 'voice output gain follows params.gain');
  advance(3, { phase: 'hub' });
  const oscillators = [];
  const originalOsc = ctx.createOscillator.bind(ctx);
  ctx.createOscillator = () => {
    const node = originalOsc();
    oscillators.push(node);
    return node;
  };
  core.sfx('ui-back', { pitch: 1 });
  const normal = oscillators[0].frequency.value;
  advance(4, { phase: 'hub' });
  oscillators.length = 0;
  core.sfx('ui-back', { pitch: 2 });
  assert.ok(Math.abs(oscillators[0].frequency.value / normal - 2) < 1e-9, 'pitch scales frequencies');
});

test('the same seed builds the same graph; another seed does not', () => {
  const signature = (seed) => {
    const { ctx, core, advance } = rig({ seed });
    const sources = [];
    const originals = ['createOscillator', 'createBufferSource'].map((name) => {
      const original = ctx[name].bind(ctx);
      ctx[name] = () => {
        const node = original();
        sources.push(node);
        return node;
      };
      return original;
    });
    assert.equal(originals.length, 2);
    core.music.set({ scene: 'flight' });
    advance(6, flightFrame);
    core.sfx('crash');
    core.sfx('storm-thunder');
    advance(8, flightFrame);
    return JSON.stringify(sources.map((s) => [s.kind, s.startTime, s.stopTime, s.frequency?.value ?? 0, s.loopStart]));
  };
  assert.equal(signature(7), signature(7));
  assert.notEqual(signature(7), signature(8));
});

test('volumes and mute reach the output stage', () => {
  const { core, advance } = rig();
  advance(0.5, { phase: 'hub' });
  const finalGain = (param) => param.events.filter((e) => e.type === 'target').pop()?.value ?? param.value;
  const master = core.graph.master.gain;
  core.setVolumes({ master: 1 });
  assert.equal(finalGain(master), 1);
  core.setVolumes({ master: 0.5 });
  assert.ok(finalGain(master) > 0.2 && finalGain(master) < 0.5, 'perceptual curve');
  core.setMuted(true);
  assert.equal(finalGain(master), 0);
  core.setVolumes({ master: 0.9 });
  assert.equal(finalGain(master), 0, 'volume changes do not unmute');
  core.setMuted(false);
  assert.ok(finalGain(master) > 0.6);
  core.setVolumes({ music: 0 });
  assert.equal(core.graph.volumes.music, 0);
});

test('muting stops the music scheduler and unmuting restarts it cleanly', () => {
  const { core, advance } = rig();
  core.music.set({ scene: 'flight' });
  advance(3, flightFrame);
  const playing = core.music.info().events;
  core.setMuted(true);
  advance(30, flightFrame);
  assert.equal(core.music.info().events, playing, 'no notes while muted');
  core.setMuted(false);
  advance(33, flightFrame);
  assert.ok(core.music.info().events > playing, 'music resumes');
  assert.equal(core.music.info().errors, 0);
});

test('scene and zone changes switch profiles at musical boundaries', () => {
  const { core, advance } = rig();
  core.music.set({ scene: 'hub' });
  advance(4, { phase: 'hub' });
  assert.equal(core.music.info().profile, 'hub');
  core.music.set({ scene: 'flight', zone: 'ground' });
  advance(8, flightFrame);
  assert.equal(core.music.info().profile, 'ground');
  core.music.set({ zone: 'moon' });
  advance(20, flightFrame);
  assert.equal(core.music.info().profile, 'moon');
  core.music.set({ zone: null, scene: 'results', mood: 'fail' });
  advance(30, flightFrame);
  assert.equal(core.music.info().profile, 'results-fail');
  assert.equal(core.music.info().errors, 0);
});

test('offline mode never touches the graph while it renders', () => {
  const { ctx, core, advance } = rig({ offline: true });
  core.music.set({ scene: 'flight' });
  advance(20, flightFrame);
  core.sfx('crash');
  advance(40, flightFrame);
  assert.equal(ctx.stats.released, 0, 'nothing is disconnected until the render is over');
  assert.equal(core.stats().voices <= 70, true, 'voice accounting still follows the virtual clock');
  core.dispose();
  assert.ok(ctx.stats.released > 50, 'dispose releases the graph');
});

test('the engine graph is parked while the game is quiet and wakes on demand', () => {
  const { ctx, core, advance } = rig();
  core.music.setMuted(true);
  advance(2, { phase: 'hub' });
  assert.equal(core.stats().engineAwake, true, 'not parked straight away');
  advance(9, { phase: 'hub' });
  assert.equal(core.stats().engineAwake, false, 'parked after a few quiet seconds');
  const wake = (frame) => {
    advance(ctx.currentTime + 0.1, frame);
    return core.stats().engineAwake;
  };
  assert.equal(wake({ phase: 'ascent', throttle: 0.5, atmo: 1 }), true, 'throttle wakes it');
  advance(30, { phase: 'hub' });
  assert.equal(core.stats().engineAwake, false);
  assert.equal(wake({ phase: 'ascent', throttle: 0, atmo: 1, speed01: 0.6 }), true, 'wind wakes it');
  advance(60, { phase: 'ascent', throttle: 0, atmo: 0, speed01: 0 });
  assert.equal(core.stats().engineAwake, false, 'vacuum without thrust is silent too');
  assert.equal(wake({ phase: 'space', throttle: 0, atmo: 0, rcs: { left: 1, right: 0 } }), true, 'RCS wakes it');
  advance(80, { phase: 'ascent', throttle: 1, paused: true });
  assert.equal(core.stats().engineAwake, false, 'pause parks it');
});

test('createAudio without Web Audio is a harmless no-op', async () => {
  const audio = createAudio({ autoUnlock: false });
  assert.equal(audio.state, 'none');
  assert.equal(await audio.unlock(), false);
  assert.equal(audio.sfx('coin'), false);
  assert.doesNotThrow(() => {
    audio.update(1 / 60, { phase: 'ascent', throttle: 1 });
    audio.music.set({ scene: 'flight' });
    audio.setVolumes({ master: 0.5 });
    audio.setMuted(true);
    audio.event({ type: 'liftoff' });
    audio.events([{ type: 'ring' }, null]);
  });
  await audio.suspend();
  await audio.resume();
  audio.dispose();
  assert.deepEqual(audio.getVolumes(), { master: 0.5, music: 0.6, sfx: 0.9 });
  assert.equal(audio.isMuted(), true);
});

test('createAudio lifecycle on a mock context: unlock, play, suspend, resume, mute, dispose', async () => {
  const audio = createAudio({ autoUnlock: false, AudioContext: MockAudioContext });
  assert.equal(audio.state, 'none');
  assert.equal(audio.sfx('coin'), false, 'nothing plays before the first gesture');
  audio.music.set({ scene: 'flight', zone: 'space' });
  audio.setVolumes({ music: 0.3 });
  assert.equal(await audio.unlock(), true);
  assert.equal(audio.state, 'running');
  assert.deepEqual(audio.getVolumes(), { master: 0.8, music: 0.3, sfx: 0.9 }, 'settings made earlier are kept');
  assert.equal(audio.sfx('ui-press'), true);
  assert.equal(audio.event({ type: 'pickup', kind: 'coin' }), true);
  assert.equal(audio.event({ type: 'zone' }), false);
  audio.update(1 / 60, { phase: 'ascent', throttle: 0.5, atmo: 1 });
  assert.equal(audio.stats.music.errors, 0);
  await audio.suspend();
  assert.equal(audio.state, 'suspended');
  assert.equal(audio.sfx('coin'), false, 'no sound while suspended');
  audio.update(1 / 60, { phase: 'ascent' });
  await audio.resume();
  assert.equal(audio.state, 'running');
  audio.setMuted(true);
  assert.equal(audio.sfx('coin'), false, 'muted');
  audio.setMuted(false);
  assert.equal(audio.sfx('ring'), true);
  assert.ok(audio.analyser, 'level meter is available');
  audio.dispose();
  assert.equal(audio.state, 'none');
  assert.equal(audio.sfx('coin'), false);
});

test('unlock is idempotent and survives concurrent calls', async () => {
  const audio = createAudio({ autoUnlock: false, AudioContext: MockAudioContext });
  const results = await Promise.all([audio.unlock(), audio.unlock(), audio.unlock()]);
  assert.deepEqual(results, [true, true, true]);
  assert.equal(await audio.unlock(), true);
  audio.dispose();
});

test('a context that stays suspended (autoplay policy) keeps the engine quiet but alive', async () => {
  class StuckContext extends MockAudioContext {
    resume() { return Promise.resolve(); }
  }
  const audio = createAudio({ autoUnlock: false, AudioContext: class extends StuckContext { constructor(o) { super({ ...o, state: 'suspended' }); } } });
  assert.equal(await audio.unlock(), false);
  assert.equal(audio.state, 'suspended');
  assert.equal(audio.sfx('coin'), false);
  assert.doesNotThrow(() => audio.update(1 / 60, { phase: 'ascent', throttle: 1 }));
  audio.dispose();
});

test('renderOffline drives a script through the real core', async () => {
  const created = [];
  class FakeOffline extends MockAudioContext {
    constructor(channels, length, sampleRate) {
      super({ sampleRate });
      this.length = length;
      created.push(this);
    }

    async startRendering() {
      const data = [new Float32Array(this.length), new Float32Array(this.length)];
      data[0].fill(0.25);
      return { numberOfChannels: 2, length: this.length, sampleRate: this.sampleRate, getChannelData: (c) => data[c] };
    }
  }
  const script = [
    { t: 0.5, sfx: 'coin' },
    { t: 0.2, music: { scene: 'flight' } },
    { t: 0, frame: { phase: 'ascent', throttle: 0, atmo: 1 }, ramp: true },
    { t: 1, frame: { phase: 'ascent', throttle: 1, atmo: 1 } },
    { t: 1.2, volumes: { music: 0.1 } },
    { t: 1.5, muted: true },
  ];
  const result = await renderOffline({ seconds: 2, script, sampleRate: 22050, OfflineContext: FakeOffline, tail: 0.5 });
  assert.equal(created.length, 1);
  assert.equal(created[0].length, Math.ceil(2.5 * 22050));
  assert.equal(result.channels.length, 2);
  assert.equal(result.sampleRate, 22050);
  assert.ok(Math.abs(result.analysis.peak - 0.25) < 1e-6);
  assert.equal(result.analysis.invalid, 0);
  assert.equal(result.stats.music.errors, 0);
  assert.ok(result.stats.sfx.played >= 1);
  assert.deepEqual(created[0].warnings, []);
  await assert.rejects(renderOffline({ seconds: 1, OfflineContext: null, script: [] }), /OfflineAudioContext/);
});
