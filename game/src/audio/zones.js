// Altitude zones and the acoustic environment derived from a frame.
// alt01 is altitude divided by the 100 km space line (see DESIGN section 3.1).

import { ZONES } from './names.js';
import { clamp01, expLerp, lerp, smoothstep } from './util.js';

export const ZONE_LIMITS = Object.freeze({
  ground: 0.015, // below ~1.5 km
  troposphere: 0.12, // below ~12 km
  space: 0.98, // above ~98 km, or when the air is practically gone
  vacuumAtmo: 0.004,
});

const ALIASES = Object.freeze({
  atmosphere: 'troposphere',
  atmo: 'troposphere',
  sky: 'troposphere',
  mesosphere: 'stratosphere',
  upper: 'stratosphere',
  orbit: 'space',
  vacuum: 'space',
  earth: 'troposphere',
  island: 'ground',
  pad: 'ground',
  surface: 'ground',
});

export function normalizeZone(id) {
  if (typeof id !== 'string') return null;
  if (ZONES.includes(id)) return id;
  return ALIASES[id] ?? null;
}

// Zone shown to the music system when the game does not name one explicitly.
export function zoneForFrame(frame) {
  if (frame.body === 'moon') return 'moon';
  if (frame.body === 'mars') return 'mars';
  if (frame.phase === 'transfer') return 'space';
  if (frame.atmo < ZONE_LIMITS.vacuumAtmo || frame.alt01 >= ZONE_LIMITS.space) return 'space';
  if (frame.alt01 < ZONE_LIMITS.ground) return 'ground';
  if (frame.alt01 < ZONE_LIMITS.troposphere) return 'troposphere';
  return 'stratosphere';
}

export const AIR_CUTOFF = Object.freeze({ min: 1200, max: 18000 });

// How the world sounds at this moment: thin air absorbs highs, echoes carry.
export function environmentFor(frame) {
  const atmo = clamp01(frame.atmo);
  const thin = 1 - atmo;
  const airCutoff = expLerp(AIR_CUTOFF.min, AIR_CUTOFF.max, Math.pow(atmo, 0.45));
  let reverb = 0.14 + 0.22 * thin;
  reverb *= 0.55 + 0.45 * smoothstep(0, 0.08, atmo); // almost none once the air is gone
  const landed = frame.phase === 'landed' || frame.phase === 'hub';
  return {
    atmo,
    airCutoff,
    worldReverb: landed ? lerp(reverb, 0.12, 0.5) : reverb,
    hullDominance: smoothstep(0.35, 0, atmo),
  };
}
