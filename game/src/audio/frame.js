// Normalises the per-frame snapshot the game passes to audio.update().
// Everything downstream can rely on finite numbers in known ranges.

import { clamp01, num } from './util.js';

const KNOWN_BODIES = new Set(['earth', 'moon', 'mars']);

export const IDLE_FRAME = Object.freeze({
  throttle: 0,
  atmo: 1,
  alt01: 0,
  speed01: 0,
  stage: 0,
  rcs: Object.freeze({ left: 0, right: 0 }),
  fuel01: 1,
  danger01: 0,
  storm: 0,
  body: 'earth',
  phase: 'hub',
  paused: false,
});

export function normalizeFrame(frame) {
  const f = frame ?? {};
  const rcs = f.rcs ?? {};
  return {
    throttle: clamp01(f.throttle),
    atmo: clamp01(f.atmo ?? 1),
    alt01: clamp01(f.alt01),
    speed01: clamp01(f.speed01),
    stage: Math.max(0, Math.floor(num(f.stage))),
    rcs: { left: clamp01(rcs.left), right: clamp01(rcs.right) },
    fuel01: clamp01(f.fuel01 ?? 1),
    danger01: clamp01(f.danger01),
    storm: clamp01(f.storm),
    body: KNOWN_BODIES.has(f.body) ? f.body : 'earth',
    phase: typeof f.phase === 'string' ? f.phase : 'ascent',
    paused: Boolean(f.paused),
  };
}
