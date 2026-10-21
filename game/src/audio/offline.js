// Offline rendering: runs a scripted scenario through the same core the game
// uses, on an OfflineAudioContext, and returns the samples with measurements.
//
// Script items (times in seconds):
//   { t, frame: {...}, ramp?: true }   key frame for audio.update; with ramp the
//                                      numbers glide linearly to the next key frame
//   { t, sfx: 'coin', params? }        sound effect
//   { t, music: { scene, zone, intensity, mood } }
//   { t, volumes: { master, music, sfx } }   { t, muted: true }

import { analyze } from './analyze.js';
import { createCore } from './core.js';
import { IDLE_FRAME } from './frame.js';

const NUMERIC = ['throttle', 'atmo', 'alt01', 'speed01', 'fuel01', 'danger01', 'storm'];

export function frameAt(keys, t) {
  let before = null;
  let after = null;
  for (const key of keys) {
    if (key.t <= t) before = key;
    else {
      after = key;
      break;
    }
  }
  if (!before) return { ...IDLE_FRAME };
  const base = { ...IDLE_FRAME, ...before.frame };
  if (!before.ramp || !after) return base;
  const span = after.t - before.t;
  const k = span > 0 ? (t - before.t) / span : 1;
  const next = { ...IDLE_FRAME, ...after.frame };
  const out = { ...base };
  for (const name of NUMERIC) out[name] = base[name] + (next[name] - base[name]) * k;
  const rcsA = { left: 0, right: 0, ...before.frame.rcs };
  const rcsB = { left: 0, right: 0, ...after.frame.rcs };
  out.rcs = { left: rcsA.left + (rcsB.left - rcsA.left) * k, right: rcsA.right + (rcsB.right - rcsA.right) * k };
  return out;
}

export async function renderOffline({
  seconds = 10,
  script = [],
  sampleRate = 44100,
  seed = 1,
  volumes,
  step = 1 / 60,
  tail = 1,
  OfflineContext = globalThis.OfflineAudioContext ?? globalThis.webkitOfflineAudioContext,
}) {
  if (!OfflineContext) throw new Error('OfflineAudioContext is not available');
  const total = seconds + tail;
  const ctx = new OfflineContext(2, Math.ceil(total * sampleRate), sampleRate);
  const clock = { t: 0 };
  const core = createCore({ ctx, seed, now: () => clock.t, volumes, offline: true });

  const items = script.map((item, index) => ({ item, index })).sort((a, b) => a.item.t - b.item.t || a.index - b.index).map((x) => x.item);
  const keys = items.filter((item) => item.frame);
  let next = 0;
  const steps = Math.ceil(total / step);
  for (let k = 0; k < steps; k++) {
    clock.t = k * step;
    while (next < items.length && items[next].t <= clock.t + 1e-9) {
      const item = items[next++];
      if (item.sfx) core.sfx(item.sfx, item.params);
      if (item.music) core.music.set(item.music);
      if (item.volumes) core.setVolumes(item.volumes);
      if (item.muted !== undefined) core.setMuted(item.muted);
    }
    core.update(step, frameAt(keys, clock.t));
  }

  const buffer = await ctx.startRendering();
  const channels = [];
  for (let c = 0; c < buffer.numberOfChannels; c++) channels.push(new Float32Array(buffer.getChannelData(c)));
  const result = {
    sampleRate,
    seconds,
    channels,
    stats: core.stats(),
    analysis: analyze(channels, sampleRate, { from: 0, to: seconds }),
  };
  core.dispose();
  return result;
}
