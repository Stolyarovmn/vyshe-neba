// Scripted scenarios for offline rendering (see game/src/audio/offline.js).
// Shared by the browser test and the manual demo page.

const pad = { phase: 'pad', throttle: 0, atmo: 1, alt01: 0, speed01: 0, stage: 0, fuel01: 1, danger01: 0 };

// Ten seconds: countdown, liftoff, stage separation, pickups, vacuum, descent,
// parachute, touchdown and the results scene.
export const FLIGHT_SECONDS = 10;
export const FLIGHT_SCRIPT = [
  { t: 0, music: { scene: 'flight' } },

  { t: 0, frame: { ...pad }, ramp: true },
  { t: 1.2, frame: { ...pad, throttle: 0.1 }, ramp: true },
  { t: 2.0, frame: { phase: 'ascent', throttle: 1, atmo: 0.95, alt01: 0.01, speed01: 0.25, stage: 0, fuel01: 0.95, danger01: 0 }, ramp: true },
  { t: 3.0, frame: { phase: 'ascent', throttle: 1, atmo: 0.7, alt01: 0.06, speed01: 0.55, stage: 0, fuel01: 0.85, danger01: 0 } },
  { t: 3.2, frame: { phase: 'ascent', throttle: 0.85, atmo: 0.66, alt01: 0.07, speed01: 0.56, stage: 1, fuel01: 0.85, danger01: 0 }, ramp: true },
  { t: 4.5, frame: { phase: 'ascent', throttle: 0.8, atmo: 0.25, alt01: 0.5, speed01: 0.75, stage: 1, fuel01: 0.7, danger01: 0 }, ramp: true },
  { t: 5.0, frame: { phase: 'ascent', throttle: 0.7, atmo: 0.12, alt01: 0.7, speed01: 0.75, stage: 1, fuel01: 0.62, rcs: { left: 1, right: 0 } }, ramp: true },
  { t: 5.4, frame: { phase: 'space', throttle: 0.6, atmo: 0.03, alt01: 0.85, speed01: 0.72, stage: 1, fuel01: 0.55, rcs: { left: 0, right: 0 } }, ramp: true },
  { t: 5.8, frame: { phase: 'space', throttle: 0.55, atmo: 0, alt01: 1, speed01: 0.7, stage: 1, fuel01: 0.5, rcs: { left: 0, right: 1 } }, ramp: true },
  { t: 6.2, frame: { phase: 'space', throttle: 0.5, atmo: 0, alt01: 1, speed01: 0.7, stage: 1, fuel01: 0.5, rcs: { left: 0, right: 0 } } },
  { t: 6.5, frame: { phase: 'space', throttle: 0, atmo: 0, alt01: 1, speed01: 0.65, stage: 1, fuel01: 0.45 }, ramp: true },
  { t: 7.0, frame: { phase: 'descent', throttle: 0, atmo: 0.1, alt01: 0.9, speed01: 0.6, stage: 1, fuel01: 0.4, danger01: 0.3 }, ramp: true },
  { t: 8.0, frame: { phase: 'descent', throttle: 0.7, atmo: 0.9, alt01: 0.05, speed01: 0.4, stage: 1, fuel01: 0.2, danger01: 0.6 }, ramp: true },
  { t: 9.05, frame: { phase: 'descent', throttle: 0.4, atmo: 1, alt01: 0, speed01: 0.05, stage: 1, fuel01: 0.12, danger01: 0.2 } },
  { t: 9.1, frame: { phase: 'landed', throttle: 0, atmo: 1, alt01: 0, speed01: 0, stage: 1, fuel01: 0.12, danger01: 0 } },

  { t: 0.2, sfx: 'countdown-tick' },
  { t: 0.5, sfx: 'countdown-tick' },
  { t: 0.8, sfx: 'countdown-tick' },
  { t: 1.1, sfx: 'countdown-go' },
  { t: 1.6, sfx: 'liftoff' },
  { t: 3.2, sfx: 'stage-sep' },
  { t: 3.5, sfx: 'coin' },
  { t: 3.62, sfx: 'coin' },
  { t: 3.74, sfx: 'coin' },
  { t: 3.86, sfx: 'coin' },
  { t: 4.2, sfx: 'ring' },
  { t: 4.6, sfx: 'fuel-pickup' },
  { t: 5.5, sfx: 'warn', params: { kind: 'speed' } },
  { t: 6.5, sfx: 'thrust-cut' },
  { t: 6.8, sfx: 'near-miss', params: { side: -1 } },
  { t: 7.2, sfx: 'low-fuel-alarm' },
  { t: 7.6, sfx: 'parachute-open' },
  { t: 8.4, sfx: 'low-fuel-alarm' },
  { t: 9.05, sfx: 'touch-soft' },
  { t: 9.3, sfx: 'achievement' },
  { t: 9.3, music: { scene: 'results' } },
];

// Every effect once, in a quiet room, three seconds apart (music muted).
export const SFX_SLOT_SECONDS = 3;

export function sfxSweepScript(names) {
  const script = [{ t: 0, volumes: { music: 0 } }, { t: 0, frame: { phase: 'hub' } }];
  names.forEach((name, i) => script.push({ t: 0.3 + i * SFX_SLOT_SECONDS, sfx: name, params: name === 'warn' ? { kind: 'hull' } : {} }));
  return script;
}

// Full throttle, then a pause with music off: everything must go quiet.
export const PAUSE_SECONDS = 4;
export const PAUSE_FROM = 1.6;
export const PAUSE_SCRIPT = [
  { t: 0, music: { scene: 'flight' } },
  { t: 0, volumes: { music: 0 } },
  { t: 0, frame: { phase: 'ascent', throttle: 1, atmo: 1, alt01: 0.05, speed01: 0.6, stage: 0, fuel01: 0.8, rcs: { left: 1, right: 1 } } },
  { t: PAUSE_FROM, frame: { phase: 'ascent', throttle: 1, atmo: 1, alt01: 0.05, speed01: 0.6, stage: 0, fuel01: 0.8, rcs: { left: 1, right: 1 }, paused: true } },
];

// Hub theme plus waves, no flight at all.
export const HUB_SECONDS = 8;
export const HUB_SCRIPT = [
  { t: 0, music: { scene: 'hub' } },
  { t: 0, frame: { phase: 'hub' } },
  { t: 2, sfx: 'ui-hover' },
  { t: 3, sfx: 'ui-press' },
  { t: 4, sfx: 'purchase' },
  { t: 5.5, sfx: 'build' },
];
