// Physical constants of the three bodies. The data package reads the same numbers, so keep them plain.
// World units: 1 unit = 10 m, y points down, altitude = -y above the body surface.

export const DT = 1 / 120;
export const METERS_PER_UNIT = 10;
export const SPACE_ALT = 10000; // 100 km: Earth's atmosphere ends and gravity is gone

export const BODIES = {
  earth: {
    id: 'earth',
    gravity: 52, // units/s² at the surface
    wellRadius: 10000, // altitude where gravity has faded to zero
    atmo: { ceiling: 10000, curve: 2, density: 1 }, // density(alt) = density * (1 - alt/ceiling)^curve
    wind: 2, // steady swaying gust, units/s² at density 1
    surface: 'island',
    pad: { half: 85 },
    approach: null,
  },
  moon: {
    id: 'moon',
    gravity: 9,
    wellRadius: 3000,
    atmo: { ceiling: 0, curve: 1, density: 0 },
    wind: 0,
    surface: 'regolith',
    pad: { half: 70 },
    approach: { alt: 1400, vMin: 28, vMax: 85, padOffset: 350 },
  },
  mars: {
    id: 'mars',
    gravity: 20,
    wellRadius: 4500,
    atmo: { ceiling: 4500, curve: 2, density: 0.16 },
    wind: 0.6,
    surface: 'dust',
    pad: { half: 70 },
    approach: { alt: 1400, vMin: 28, vMax: 85, padOffset: 350 },
  },
};

// Altitude bands (units) that count as "zones". A zone id is reported in the state and in `zone` events.
export const ZONES = {
  earth: [
    { id: 'troposphere', from: 0 },
    { id: 'above-clouds', from: 300 },
    { id: 'stratosphere', from: 1200 },
    { id: 'high-route', from: 3000 },
    { id: 'noctilucent', from: 5000 },
    { id: 'space-edge', from: 8500 },
    { id: 'space', from: SPACE_ALT },
  ],
  moon: [
    { id: 'moon-surface', from: 0 },
    { id: 'moon-low', from: 300 },
    { id: 'moon-high', from: 1000 },
  ],
  mars: [
    { id: 'mars-surface', from: 0 },
    { id: 'mars-low', from: 300 },
    { id: 'mars-high', from: 1000 },
  ],
};

export function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export function gravityAt(body, alt) {
  const t = Math.max(0, alt) / body.wellRadius;
  if (t >= 1) return 0;
  const fade = smoothstep(0.45, 1, t);
  return body.gravity * (1 - 0.15 * t) * (1 - fade);
}

export function densityAt(body, alt) {
  const { ceiling, curve, density } = body.atmo;
  if (density <= 0 || ceiling <= 0) return 0;
  const t = Math.max(0, alt) / ceiling;
  return t >= 1 ? 0 : density * Math.pow(1 - t, curve);
}

export function zoneAt(bodyId, alt) {
  const list = ZONES[bodyId];
  let id = list[0].id;
  for (const zone of list) if (alt >= zone.from) id = zone.id;
  return id;
}
