// Public vocabulary of the audio engine. Pure data, safe to import anywhere.

export const SFX_NAMES = Object.freeze([
  'ui-hover',
  'ui-press',
  'ui-deny',
  'ui-back',
  'purchase',
  'build',
  'build-complete',
  'era-up',
  'achievement',
  'coin',
  'ring',
  'fuel-pickup',
  'repair',
  'stage-sep',
  'liftoff',
  'thrust-cut',
  'low-fuel-alarm',
  'warn',
  'parachute-open',
  'touch-soft',
  'touch-hard',
  'crash',
  'explosion',
  'transfer-start',
  'transfer-done',
  'storm-thunder',
  'near-miss',
  'hit',
  'countdown-tick',
  'countdown-go',
  'toast',
]);

export const SFX_SET = new Set(SFX_NAMES);
export const isSfxName = (name) => SFX_SET.has(name);

export const SCENES = Object.freeze(['hub', 'flight', 'results']);
export const ZONES = Object.freeze(['ground', 'troposphere', 'stratosphere', 'space', 'moon', 'mars']);
export const PHASES = Object.freeze(['hub', 'pad', 'ascent', 'space', 'transfer', 'descent', 'landed', 'crashed']);

// Convenience for the game loop: turn a simulation event into an sfx call.
// Returns null when the event has no sound of its own.
export function sfxForEvent(event) {
  if (!event || typeof event.type !== 'string') return null;
  switch (event.type) {
    case 'liftoff':
    case 'stage-sep':
    case 'ring':
    case 'near-miss':
    case 'hit':
    case 'thrust-cut':
    case 'transfer-start':
    case 'transfer-done':
      return { name: event.type, params: event };
    case 'parachute':
      return { name: 'parachute-open', params: event };
    case 'storm':
      return { name: 'storm-thunder', params: event };
    case 'low-fuel':
      return { name: 'low-fuel-alarm', params: event };
    case 'warn':
      return { name: 'warn', params: { kind: event.kind } };
    case 'pickup':
      return pickupSfx(event);
    case 'touch':
      return { name: event.hard || num(event.severity) > 0.5 ? 'touch-hard' : 'touch-soft', params: event };
    case 'crashed':
      return { name: 'crash', params: event };
    case 'landed':
      return event.perfect ? { name: 'achievement', params: { perfect: true } } : null;
    default:
      return null;
  }
}

function pickupSfx(event) {
  const kind = event.kind ?? event.item ?? event.what ?? 'coin';
  if (kind === 'fuel') return { name: 'fuel-pickup', params: event };
  if (kind === 'repair') return { name: 'repair', params: event };
  return { name: 'coin', params: event };
}

function num(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}
