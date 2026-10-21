// Small pure helpers shared by every audio module. No Web Audio here.

export const TAU = Math.PI * 2;

export function num(value, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function clamp(value, lo, hi) {
  const v = num(value, lo);
  return v < lo ? lo : v > hi ? hi : v;
}

export const clamp01 = (value) => clamp(value, 0, 1);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => (a === b ? 0 : clamp01((v - a) / (b - a)));

// Geometric interpolation: equal steps in t are equal musical intervals.
export const expLerp = (a, b, t) => a * Math.pow(b / a, t);

export function smoothstep(a, b, x) {
  const t = invLerp(a, b, x);
  return t * t * (3 - 2 * t);
}

export const midiToHz = (midi) => 440 * Math.pow(2, (midi - 69) / 12);
export const semitones = (n) => Math.pow(2, n / 12);
export const dbToGain = (db) => Math.pow(10, db / 20);
export const gainToDb = (gain) => 20 * Math.log10(Math.max(gain, 1e-9));

// Slider position (0..1) to linear gain. Roughly "equal loudness per step".
export const VOLUME_CURVE_POWER = 1.6;
export const volumeToGain = (v) => Math.pow(clamp01(v), VOLUME_CURVE_POWER);

// One-pole smoothing that is independent of the frame rate.
export function approach(current, target, dt, tau) {
  if (tau <= 0) return target;
  return target + (current - target) * Math.exp(-dt / tau);
}

export function pickClosest(values, target) {
  let best = values[0];
  for (const v of values) if (Math.abs(v - target) < Math.abs(best - target)) best = v;
  return best;
}
