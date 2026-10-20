// Weather: slow-changing cloud, rain and storm layers that produce gusty wind in the lower atmosphere.

import { smoothstep } from './bodies.js';
import { createRngState, nextFloat, range } from './rng.js';

const EARTH_KINDS = [
  { kind: 'clear', weight: 0.38, cloud: 0, rain: 0, storm: 0 },
  { kind: 'cloudy', weight: 0.27, cloud: 0.55, rain: 0, storm: 0 },
  { kind: 'rain', weight: 0.24, cloud: 0.85, rain: 0.65, storm: 0 },
  { kind: 'storm', weight: 0.11, cloud: 1, rain: 1, storm: 1 },
];
const MARS_KINDS = [
  { kind: 'clear', weight: 0.8, cloud: 0, rain: 0, storm: 0 },
  { kind: 'dust', weight: 0.2, cloud: 1, rain: 0, storm: 1 },
];
const GAIN = { earth: 2.2, mars: 5, moon: 0 };
const STORM_ON = 0.5;
const SETTLE_SECONDS = 5;

function kindsFor(bodyId) {
  return bodyId === 'earth' ? EARTH_KINDS : bodyId === 'mars' ? MARS_KINDS : [];
}

function rollKind(rs, kinds) {
  let roll = nextFloat(rs);
  for (const k of kinds) {
    roll -= k.weight;
    if (roll < 0) return k.kind;
  }
  return kinds[kinds.length - 1].kind;
}

function params(bodyId, kind) {
  return kindsFor(bodyId).find((k) => k.kind === kind) ?? { cloud: 0, rain: 0, storm: 0 };
}

export function createWeather(seed, bodyId, forcedKind = null) {
  const kinds = kindsFor(bodyId);
  const rng = createRngState(seed);
  if (!kinds.length) {
    return { kind: 'none', nextKind: 'none', locked: true, time: 0, next: 1e9, cloud: 0, rain: 0, stormLevel: 0,
      storm: 0, wind: 0, flash: 0, lightningAt: 0, rng, forecast: null, stormOn: false };
  }
  const forced = forcedKind && kinds.some((k) => k.kind === forcedKind) ? forcedKind : null;
  const kind = forced ?? rollKind(rng, kinds);
  const p = params(bodyId, kind);
  return {
    kind,
    nextKind: forced ?? rollKind(rng, kinds),
    locked: Boolean(forced),
    time: 0,
    next: forced ? 1e9 : range(rng, 16, 32),
    cloud: p.cloud,
    rain: p.rain,
    stormLevel: p.storm,
    storm: 0,
    wind: 0,
    flash: 0,
    lightningAt: range(rng, 5, 11),
    rng,
    forecast: null,
    stormOn: false,
  };
}

// `alt` is the rocket altitude: weather only reaches the lower atmosphere.
export function updateWeather(w, bodyId, alt, dt, events, showForecast) {
  if (w.kind === 'none') return;
  w.time += dt;
  if (!w.locked && w.time >= w.next) {
    w.kind = w.nextKind;
    w.nextKind = rollKind(w.rng, kindsFor(bodyId));
    w.next = w.time + range(w.rng, 18, 40);
  }

  const target = params(bodyId, w.kind);
  const ease = 1 - Math.exp(-dt / SETTLE_SECONDS);
  w.cloud += (target.cloud - w.cloud) * ease;
  w.rain += (target.rain - w.rain) * ease;
  w.stormLevel += (target.storm - w.stormLevel) * ease;

  const rainZone = bodyId === 'earth' ? 1 - smoothstep(800, 1400, alt) : 1 - smoothstep(1500, 2500, alt);
  const cloudZone = bodyId === 'earth' ? 1 - smoothstep(1600, 2400, alt) : 1 - smoothstep(1500, 2500, alt);
  w.storm = w.stormLevel * rainZone;
  const cloud = w.cloud * cloudZone;
  w.wind = (Math.sin(w.time * 0.35) * 2 + Math.sin(w.time * 0.8) * 0.7) * cloud * GAIN[bodyId];

  w.flash = Math.max(0, w.flash - dt);
  if (w.storm > 0.6 && w.time > w.lightningAt) {
    w.flash = 0.08;
    w.lightningAt = w.time + range(w.rng, 4, 10);
    events.push({ type: 'storm', phase: 'lightning' });
  }

  const stormNow = w.storm > STORM_ON;
  if (stormNow !== w.stormOn) {
    w.stormOn = stormNow;
    events.push({ type: 'storm', phase: stormNow ? 'start' : 'end' });
  }

  w.forecast = showForecast && !w.locked ? { kind: w.nextKind, in: Math.max(0, w.next - w.time) } : null;
}
