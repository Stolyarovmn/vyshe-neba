// Small sound-building blocks on top of a Voice: a shaped tone, an FM tone and
// a shaped noise hit. Each schedules its own sources and connects to `to`
// (default: the voice output). Times are absolute context seconds.

import { percussive, sweep } from './synth.js';

function withFilter(v, spec, t, end) {
  if (!spec) return null;
  const node = v.filter(spec.type ?? 'lowpass', spec.f, spec.q ?? 0.7);
  if (spec.f2) sweep(node.frequency, t, spec.f, spec.f2, end - t);
  return node;
}

// A tone with its own envelope; f2 makes it glide exponentially over the note.
export function tone(v, t, o) {
  const { type = 'sine', f, f2, attack = 0.004, decay = 0.2, hold = 0, peak = 1, filter, to } = o;
  const end = t + attack + hold + decay;
  const osc = v.osc(type, f, t, end + 0.03);
  if (f2) sweep(osc.frequency, t, f, f2, end - t);
  const env = v.gain(0);
  percussive(env.gain, t, peak, attack, decay, hold);
  const flt = withFilter(v, filter, t, end);
  const nodes = flt ? [osc, flt, env] : [osc, env];
  v.chain(...nodes, to ?? v.out);
  return { osc, env, end };
}

// Two-operator FM: a sine modulator bends the carrier's frequency. The index
// falls over the note, which gives the bright attack and mellow tail of bells
// and electric pianos.
export function fm(v, t, o) {
  const { f, ratio = 2, index = 2, indexEnd = 0.1, attack = 0.003, decay = 0.4, hold = 0, peak = 1, type = 'sine', to } = o;
  const end = t + attack + hold + decay;
  const carrier = v.osc(type, f, t, end + 0.03);
  const modulator = v.osc('sine', f * ratio, t, end + 0.03);
  const depth = v.gain(0);
  depth.gain.setValueAtTime(index * f * ratio, t);
  depth.gain.exponentialRampToValueAtTime(Math.max(indexEnd, 0.001) * f * ratio, t + attack + hold + decay * 0.7);
  v.chain(modulator, depth, carrier.frequency);
  const env = v.gain(0);
  percussive(env.gain, t, peak, attack, decay, hold);
  v.chain(carrier, env, to ?? v.out);
  return { carrier, env, end };
}

// A burst of shaped noise; `filter.f2` sweeps the cutoff over the burst.
export function noiseHit(v, t, o) {
  const { color = 'white', attack = 0.002, hold = 0, decay = 0.1, peak = 1, filter, to } = o;
  const end = t + attack + hold + decay;
  const source = v.noise(color, t, end + 0.03);
  const env = v.gain(0);
  percussive(env.gain, t, peak, attack, decay, hold);
  const flt = withFilter(v, filter, t, end);
  const nodes = flt ? [source, flt, env] : [source, env];
  v.chain(...nodes, to ?? v.out);
  return { source, env, end };
}
