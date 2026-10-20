// Weather: slow-changing sky mood plus a persistent wind field.
//
// Wind is a horizontal air speed (units/s, + is toward +x). It has three layers:
//   - a prevailing drive that gets a new target every 40-120 s and eases toward it, with one dominant sign;
//   - short smooth gusts (bell-shaped, 6-14 s) that add to the prevailing direction;
//   - an altitude profile: weak near the ground, strongest at 3-12 km (jet streams), gone in vacuum.
// Nothing here is per-frame noise. The rocket feels the wind through air drag (see flight.js).

import { BODIES, smoothstep } from './bodies.js';
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

const DRIVE_EASE = 25; // seconds: how slowly the prevailing wind follows a new target
const RETARGET_EVERY = [40, 120]; // seconds between new targets
const REVERSE_CHANCE = 0.08; // chance that a new target flips the prevailing direction
const MIN_STRENGTH = 0.25;
const GUST_GAP = [5, 15];
const GUST_LENGTH = [6, 14];
const GUST_SHARE = 0.15; // strongest gust, as a share of the body's strongest wind
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

// Share of the strongest wind found at this altitude.
export function windProfile(bodyId, alt) {
  const a = Math.max(0, alt);
  if (bodyId === 'earth') {
    const rise = 0.25 + 0.75 * smoothstep(0, 300, a);
    return rise * (1 - 0.7 * smoothstep(1200, 5000, a)) * (1 - smoothstep(5000, 10000, a));
  }
  if (bodyId === 'mars') return (0.5 + 0.5 * smoothstep(0, 200, a)) * (1 - smoothstep(1500, 4500, a));
  return 0;
}

function strengthMultiplier(w) {
  return 0.75 + 0.15 * w.cloud + 0.3 * w.stormLevel;
}

function gustScale(w, bodyId) {
  return bodyId === 'mars' ? 0.45 + 0.55 * w.stormLevel : 0.35 + 0.35 * w.rain + 0.4 * w.stormLevel;
}

// Wind speed at `alt`, from the prevailing drive (or an explicit `drive`) plus the current gust.
export function windAt(w, bodyId, alt, drive = w.drive) {
  const max = BODIES[bodyId].wind;
  if (!max) return 0;
  const profile = windProfile(bodyId, alt);
  return (drive * strengthMultiplier(w) + w.sign * w.gust * GUST_SHARE) * max * profile;
}

export function createWeather(seed, bodyId, forcedKind = null) {
  const kinds = kindsFor(bodyId);
  const rng = createRngState(seed);
  const calm = {
    time: 0, cloud: 0, rain: 0, stormLevel: 0, storm: 0, wind: 0, windDir: 1, gust: 0, push: 0, felt: 0, flash: 0, forecast: null,
    drive: 0, driveTarget: 0, sign: 1, windNext: 1e9, gusts: [], gustAt: 1e9, lightningAt: 1e9, stormOn: false, rng,
  };
  if (!kinds.length) return { ...calm, kind: 'none', nextKind: 'none', locked: true, next: 1e9 };

  const forced = forcedKind && kinds.some((k) => k.kind === forcedKind) ? forcedKind : null;
  const kind = forced ?? rollKind(rng, kinds);
  const nextKind = forced ?? rollKind(rng, kinds);
  const p = params(bodyId, kind);
  const sign = nextFloat(rng) < 0.5 ? -1 : 1;
  const strength = range(rng, MIN_STRENGTH, 1);
  return {
    ...calm,
    kind,
    nextKind,
    locked: Boolean(forced),
    next: forced ? 1e9 : range(rng, 16, 32),
    cloud: p.cloud,
    rain: p.rain,
    stormLevel: p.storm,
    sign,
    windDir: sign,
    drive: sign * strength,
    driveTarget: sign * strength,
    windNext: range(rng, ...RETARGET_EVERY),
    gustAt: range(rng, 2, 8),
    lightningAt: range(rng, 5, 11),
  };
}

function retargetWind(w) {
  if (nextFloat(w.rng) < REVERSE_CHANCE) w.sign = -w.sign;
  w.driveTarget = w.sign * range(w.rng, MIN_STRENGTH, 1);
  w.windNext = w.time + range(w.rng, ...RETARGET_EVERY);
}

function updateGusts(w, dt) {
  if (w.time >= w.gustAt) {
    w.gusts.push({ t0: w.time, length: range(w.rng, ...GUST_LENGTH), amp: range(w.rng, 0.4, 1) });
    w.gustAt = w.time + range(w.rng, ...GUST_GAP);
  }
  let envelope = 0;
  w.gusts = w.gusts.filter((g) => w.time - g.t0 < g.length);
  for (const g of w.gusts) {
    const phase = (w.time - g.t0) / g.length;
    envelope += g.amp * Math.sin(Math.PI * phase) ** 2;
  }
  return Math.min(1, envelope);
}

// `alt` is the rocket altitude. `showForecast` opens the forecast block (weather station or avionics).
export function updateWeather(w, bodyId, alt, dt, showForecast) {
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

  if (w.time >= w.windNext) retargetWind(w);
  w.drive += (w.driveTarget - w.drive) * (1 - Math.exp(-dt / DRIVE_EASE));
  w.gust = Math.min(1, updateGusts(w, dt) * gustScale(w, bodyId));
  w.flash = Math.max(0, w.flash - dt);

  w.wind = windAt(w, bodyId, alt);
  if (Math.abs(w.drive) > 0.02) w.windDir = w.drive > 0 ? 1 : -1;

  w.forecast = showForecast
    ? {
      kind: w.locked ? w.kind : w.nextKind,
      in: w.locked ? 0 : Math.max(0, w.next - w.time),
      wind: windAt(w, bodyId, alt, w.driveTarget),
      windDir: w.driveTarget >= 0 ? 1 : -1,
      windIn: Math.max(0, w.windNext - w.time),
    }
    : null;
}
