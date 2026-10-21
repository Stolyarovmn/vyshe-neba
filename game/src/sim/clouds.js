// The cloud field: one source of truth for the renderer and for storms.
// Clouds are created lazily around the rocket from the flight seed, per altitude belt, in the frame of the air
// (so they come with the wind and are never created twice). Each cloud then drifts with the wind of its own altitude.
//
// state.clouds[i] = { id, kind: 'cumulus'|'stratus'|'cirrus'|'storm', x, alt, w, h, density, storm, vx }
// x/alt are the centre in world units, w/h the full size, density 0..1 (opacity and thickness), vx the wind speed.

import { chance, createRngState, hashSeed, nextFloat, pickWeighted, range } from './rng.js';
import { windAt } from './weather.js';
import { ROCKET_AXIS_OFFSET } from './rocket.js';

export const CLOUD_CELL_W = 1500;
const WINDOW = 3000; // clouds are kept this far to each side of the rocket
const BODY_INDEX = { earth: 0, moon: 1, mars: 2 };

// Altitude belts in world units (1 unit = 10 m): cumulus 0.3-3 km, stratus 2-6 km, cirrus 7-12 km, storm 0.5-9 km.
export const CLOUD_BELTS = {
  cumulus: { from: 30, to: 300, ref: 165, w: [150, 900], h: [60, 200], density: [0.35, 0.65] },
  stratus: { from: 200, to: 600, ref: 400, w: [900, 3200], h: [15, 50], density: [0.15, 0.45] },
  cirrus: { from: 700, to: 1200, ref: 950, w: [600, 2400], h: [10, 35], density: [0.1, 0.3] },
  storm: { from: 50, to: 900, ref: 475, w: [350, 1100], h: [350, 800], density: [0.72, 1] },
};
const BELT_ORDER = ['cumulus', 'stratus', 'cirrus', 'storm'];

// Average clouds per belt cell for each kind of weather. Storm clouds only grow in rain and storms.
const COUNTS = {
  earth: {
    clear: { cumulus: 0.8, stratus: 0.2, cirrus: 0.8, storm: 0 },
    cloudy: { cumulus: 2.5, stratus: 1.5, cirrus: 1.2, storm: 0 },
    rain: { cumulus: 1.5, stratus: 2, cirrus: 0.8, storm: 0.5 },
    storm: { cumulus: 1.5, stratus: 1.5, cirrus: 0.6, storm: 1.4 },
  },
  mars: {
    clear: { cumulus: 0, stratus: 0, cirrus: 0.4, storm: 0 },
    dust: { cumulus: 0, stratus: 0, cirrus: 0.3, storm: 1.2 },
  },
};

export function createCloudField() {
  return { drift: { cumulus: 0, stratus: 0, cirrus: 0, storm: 0 }, span: {}, nextId: 1 };
}

export function resetClouds(s) {
  s.clouds = [];
  s.cloudField = createCloudField();
}

function makeCloud(s, belt, ix, rs, driftNow) {
  const b = CLOUD_BELTS[belt];
  const w = range(rs, b.w[0], b.w[1]);
  const h = range(rs, b.h[0], b.h[1]);
  const alt = range(rs, b.from + h / 2, b.to - h / 2);
  const u = ix * CLOUD_CELL_W + nextFloat(rs) * CLOUD_CELL_W;
  return {
    id: s.cloudField.nextId++,
    kind: belt,
    x: u + driftNow,
    alt,
    w,
    h,
    density: range(rs, b.density[0], b.density[1]),
    storm: belt === 'storm',
    vx: 0,
  };
}

function generateCell(s, belt, ix) {
  const table = COUNTS[s.body]?.[s.weather.kind];
  if (!table) return;
  const mean = table[belt];
  const rs = createRngState(hashSeed(s.cfg.seed, BODY_INDEX[s.body], BELT_ORDER.indexOf(belt), ix));
  const count = Math.floor(mean) + (nextFloat(rs) < mean - Math.floor(mean) ? 1 : 0);
  for (let i = 0; i < count; i++) s.clouds.push(makeCloud(s, belt, ix, rs, s.cloudField.drift[belt]));
}

// Creates the clouds that come into range and moves every cloud with the wind at its altitude.
export function updateClouds(s, dt) {
  if (!COUNTS[s.body]) return;
  const field = s.cloudField;
  for (const belt of BELT_ORDER) {
    field.drift[belt] += windAt(s.weather, s.body, CLOUD_BELTS[belt].ref) * dt;
    const lo = Math.floor((s.x - WINDOW - field.drift[belt]) / CLOUD_CELL_W);
    const hi = Math.floor((s.x + WINDOW - field.drift[belt]) / CLOUD_CELL_W);
    const span = field.span[belt];
    if (!span) {
      for (let ix = lo; ix <= hi; ix++) generateCell(s, belt, ix);
      field.span[belt] = [lo, hi];
    } else {
      for (let ix = lo; ix < span[0]; ix++) generateCell(s, belt, ix);
      for (let ix = span[1] + 1; ix <= hi; ix++) generateCell(s, belt, ix);
      span[0] = Math.min(span[0], lo);
      span[1] = Math.max(span[1], hi);
    }
  }

  let gone = false;
  for (const c of s.clouds) {
    c.vx = windAt(s.weather, s.body, c.alt);
    c.x += c.vx * dt;
    if (Math.abs(c.x - s.x) > WINDOW * 2 + c.w) gone = true;
  }
  if (gone) s.clouds = s.clouds.filter((c) => Math.abs(c.x - s.x) <= WINDOW * 2 + c.w);
}

// 0 outside storm clouds, up to the cloud's density deep inside one.
export function stormInfluence(s) {
  const centreAlt = s.alt + Math.cos(s.angle) * ROCKET_AXIS_OFFSET;
  let best = 0;
  for (const c of s.clouds) {
    if (!c.storm) continue;
    const dx = (s.x - c.x) / (c.w / 2);
    const dy = (centreAlt - c.alt) / (c.h / 2);
    const depth = 1 - dx * dx - dy * dy;
    if (depth > 0) best = Math.max(best, c.density * Math.min(1, depth * 2.2));
  }
  return best;
}

const STRIKE_CHANCE = 0.12; // per flash while the rocket is inside a storm cloud
const STRIKE_DAMAGE_SHARE = 0.1;

// Sets weather.storm from the clouds and fires the storm events: start/end, lightning (and strikes on the rocket).
export function updateStorm(s, events) {
  const w = s.weather;
  w.storm = stormInfluence(s);
  const inside = w.storm > 0.5;
  if (inside !== w.stormOn) {
    w.stormOn = inside;
    events.push({ type: 'storm', phase: inside ? 'start' : 'end' });
  }
  if (s.time < w.lightningAt) return;

  const centreAlt = s.alt + Math.cos(s.angle) * ROCKET_AXIS_OFFSET;
  const near = s.clouds.filter((c) => c.storm && Math.abs(c.x - s.x) < c.w / 2 + 1800 && Math.abs(c.alt - centreAlt) < c.h / 2 + 1500);
  if (!near.length) {
    w.lightningAt = s.time + 3;
    return;
  }
  w.lightningAt = s.time + (inside ? range(w.rng, 1.5, 5) : range(w.rng, 3, 9));
  const cloud = pickWeighted(w.rng, near, (c) => c.density * c.w);
  const strike = inside && chance(w.rng, STRIKE_CHANCE);
  const x = strike ? s.x : cloud.x + (nextFloat(w.rng) - 0.5) * cloud.w * 0.8;
  const alt = strike ? centreAlt : cloud.alt + (nextFloat(w.rng) - 0.5) * cloud.h * 0.8;
  w.flash = inside ? 0.12 : 0.06;
  events.push({ type: 'storm', phase: 'lightning', x, y: -alt, cloud: cloud.id, strike });
  if (strike) {
    const damage = Math.max(8, s.maxHp * STRIKE_DAMAGE_SHARE);
    s.hp = Math.max(0, s.hp - damage);
    s.shock = Math.max(s.shock, 0.5);
    s.hits += 1;
    if (s.hp <= 0) s.killer = 'lightning';
    events.push({ type: 'hit', kind: 'lightning', damage, hp: s.hp, x, y: -alt });
    events.push({ type: 'thrust-cut', reason: 'hit' });
  }
}
