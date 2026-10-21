// Тестовый стенд: синтетический FlightState (структура ARCHITECTURE §6, поля как у sim/flight.js)
// с движущейся ракетой, объектами, фазами и событиями. Без зависимости от sim.

import { createRng, hash2 } from '../util.js';

const TAU = Math.PI * 2;
const BODY_G = { earth: 52, moon: 9, mars: 20 };
const CEILING = { earth: 10000, moon: 0, mars: 4500 };
const DENSITY = { earth: 1, moon: 0, mars: 0.16 };

export function atmoAt(body, alt) {
  const ceiling = CEILING[body];
  if (!ceiling) return 0;
  const t = Math.max(0, alt) / ceiling;
  return t >= 1 ? 0 : DENSITY[body] * (1 - t) ** 2;
}

function makeStages(kind) {
  const list = kind === 'booster' ? ['booster', 'core', 'capsule'] : kind === 'core' ? ['core', 'capsule'] : ['capsule'];
  return list.map((id) => ({ id, fuel: 100, maxFuel: 100, gone: false }));
}

function makeObjects(body, era) {
  const rng = createRng(77);
  const objects = [];
  let id = 1;
  const add = (o) => objects.push({ id: id++, active: true, marked: false, near: false, ...o });
  const x0 = -1400;
  if (body === 'earth') {
    for (let alt = 130; alt < 9800; alt += 85) {
      const x = x0 + rng() * 2800;
      const roll = rng();
      if (Math.abs(x) < 140 && alt < 300) continue;
      if (roll < 0.34 && alt < 2500) {
        const lineage = alt < 300 ? (rng() < 0.7 ? 'low_primary' : 'low_multiwing')
          : alt < 1200 ? (rng() < 0.55 ? 'medium_passenger' : 'medium_cargo')
            : alt < 1800 ? 'high_fighter' : 'high_experimental';
        add({ kind: 'plane', hazard: true, lineage, gen: Math.max(0, era - (rng() < 0.2 ? 1 : 0)), r: 32, dir: rng() < 0.5 ? 1 : -1, speed: 36 + rng() * 40, phase: rng(), ox: x, oy: -alt, x, y: -alt, motion: 'track', marked: rng() < 0.4 });
      } else if (roll < 0.58 && alt < 4000) {
        add({ kind: 'balloon', hazard: true, lineage: alt < 300 ? 'low' : alt < 1200 ? 'mid' : 'high', gen: era, r: 28, dir: 1, phase: rng(), ox: x, oy: -alt, x, y: -alt, motion: 'sway' });
      } else if (roll < 0.66 && alt > 4800) {
        addRock(add, rng, x, alt);
      } else if (roll < 0.72 && alt > 7000) {
        add({ kind: 'debris', hazard: true, lineage: 'satellite', gen: era, r: 32, dir: 1, phase: rng(), ox: x, oy: -alt, x, y: -alt, motion: 'drift' });
      } else if (roll < 0.84) {
        for (let i = 0; i < 5; i++) add({ kind: 'coin', hazard: false, r: 9, x: x + i * 30, y: -alt - i * 8 });
      } else if (roll < 0.9) {
        add({ kind: 'ring', hazard: false, r: 35, orient: 'horizontal', halfWidth: 72, x, y: -alt });
      } else if (roll < 0.95) {
        add({ kind: 'fuel', hazard: false, r: 15, x, y: -alt });
      } else {
        add({ kind: 'repair', hazard: false, r: 15, x, y: -alt });
      }
    }
  } else {
    for (let alt = 160; alt < 1500; alt += 90) {
      const x = x0 + rng() * 2800;
      const roll = rng();
      if (roll < 0.3) addRock(add, rng, x, alt, { dx: 4, dy: 2 });
      else if (roll < 0.6) for (let i = 0; i < 5; i++) add({ kind: 'coin', hazard: false, r: 9, x: x + i * 30, y: -alt });
      else if (roll < 0.75) add({ kind: 'ring', hazard: false, r: 35, orient: 'horizontal', halfWidth: 72, x, y: -alt });
      else if (roll < 0.85) add({ kind: 'fuel', hazard: false, r: 15, x, y: -alt });
    }
  }
  return objects;
}

const ROCK_CLASSES = [['medium', 28], ['large', 46], ['huge', 70]];

function addRock(add, rng, x, alt, extra = {}) {
  const [size, radius] = ROCK_CLASSES[Math.floor(rng() * 3)];
  add({ kind: 'asteroid', hazard: true, lineage: 'rock', gen: 0, size, r: radius, radius, dir: 1, phase: rng(), ox: x, oy: -alt, x, y: -alt, motion: 'drift', ...extra });
}

/** Облака в формате sim: положение уже включает снос; скорость постоянная, без качаний. */
function makeClouds(body, cloudiness) {
  if (body !== 'earth') return [];
  const rng = createRng(31);
  const list = [];
  let id = 1;
  for (let alt = 120; alt < 5200; alt += 150) {
    const count = 1 + (rng() < 0.5 ? 1 : 0);
    for (let i = 0; i < count; i++) {
      if (rng() > 0.25 + 0.7 * cloudiness) continue;
      const kind = alt > 3400 ? 'cirrus' : alt > 2200 ? (rng() < 0.5 ? 'stratus' : 'cirrus') : rng() < 0.22 ? 'stratus' : rng() < 0.2 * cloudiness ? 'storm' : 'cumulus';
      list.push({
        id: id++, kind, ox: -1200 + rng() * 2400, alt: alt + rng() * 100,
        w: kind === 'stratus' ? 480 + rng() * 360 : kind === 'cirrus' ? 360 + rng() * 300 : 170 + rng() * 170,
        h: 0, density: 0.25 + rng() * 0.7, storm: kind === 'storm', vx: 3 + rng() * 3, x: 0,
      });
    }
  }
  return list;
}

function moveClouds(clouds, t) {
  for (const cloud of clouds) cloud.x = cloud.ox + cloud.vx * t;
}

function moveObjects(objects, t) {
  for (const o of objects) {
    if (o.motion === 'track') {
      const travel = ((((o.phase * 3200 + o.speed * t) % 3200) + 3200) % 3200) - 1600;
      o.x = o.ox + o.dir * travel;
      o.y = o.oy + Math.sin(t * 0.3 + o.phase * TAU) * 6;
    } else if (o.motion === 'sway') {
      o.x = o.ox + Math.sin(t * 0.15 + o.phase * TAU) * 16;
      o.y = o.oy + Math.sin(t * 0.22 + o.phase * TAU) * 8;
    } else if (o.motion === 'drift') {
      o.x = o.ox + (o.dx ?? 3) * t * 0.2;
      o.y = o.oy + (o.dy ?? 2) * t * 0.2;
    }
  }
}

function weatherFor(kind, t) {
  const presets = {
    clear: [0.1, 0, 0], cloudy: [0.7, 0, 0], rain: [0.9, 0.7, 0.2], storm: [1, 1, 1], dust: [1, 0, 1], none: [0, 0, 0],
  };
  const [cloud, rain, storm] = presets[kind] || presets.clear;
  const wind = (Math.sin(t * 0.35) * 2 + Math.sin(t * 0.8) * 0.7) * cloud * 2.2;
  const flash = storm > 0.6 && Math.sin(t * 1.7) > 0.985 ? 0.08 : 0;
  return { kind, cloud, rain, storm, wind, flash };
}

export function createStubFlight() {
  const events = [];
  let flight = null;
  let objects = [];
  let objectsKey = '';
  let cloudsKey = '';
  let clouds = [];
  let loop = null;

  function ensure(opts) {
    const stageKind = opts.stage || 'booster';
    const key = `${opts.body}|${opts.era}|${stageKind}`;
    if (!flight || flight.key !== key) {
      flight = {
        key,
        version: 1,
        cfg: { era: opts.era, skin: 'classic', destination: opts.body === 'earth' ? 'earth' : opts.body, stages: [] },
        phase: 'pad', ended: false, liftedOff: false, time: 0, body: opts.body,
        x: 0, y: 0, vx: 0, vy: 0, angle: 0, av: 0, throttle: 0, alt: 0, speed: 0, climb: 0,
        stageIndex: 0, stages: makeStages(stageKind), fuel: 100, maxFuel: 100, fuel01: 1,
        hp: 100, maxHp: 100, coins: 0, rcs: { left: 0, right: 0 }, boost: { heat: 0, locked: false, active: false },
        atmo: 1, weather: weatherFor('clear', 0), objects: [],
        pad: { x: opts.body === 'earth' ? 0 : 260, half: 85, width: 170, lit: true, visible: true },
        landing: { ok: true, vTol: 13, hTol: 18, angTol: 0.32, onPad: true, v: 0, h: 0, ang: 0 },
        canTransfer: false, transfer: null, predict: null, zone: 'troposphere',
        chute: { deployed: false, used: false, consumable: true },
      };
      objects = [];
      objectsKey = '';
      cloudsKey = '';
      loop = null;
    }
    if (objectsKey !== `${opts.body}|${opts.era}|${opts.objects}`) {
      objectsKey = `${opts.body}|${opts.era}|${opts.objects}`;
      objects = opts.objects ? makeObjects(opts.body, opts.era) : [];
      flight.objects = objects;
    }
    const weatherKind = opts.weather ? opts.weather.kind : 'clear';
    if (cloudsKey !== `${opts.body}|${weatherKind}`) {
      cloudsKey = `${opts.body}|${weatherKind}`;
      clouds = makeClouds(opts.body, weatherKind === 'clear' ? 0.15 : weatherKind === 'cloudy' ? 0.6 : 0.9);
      flight.clouds = clouds;
    }
    flight.cfg.era = opts.era;
    return flight;
  }

  function refresh(f) {
    f.alt = Math.max(0, -f.y);
    f.speed = Math.hypot(f.vx, f.vy);
    f.climb = -f.vy;
    f.atmo = atmoAt(f.body, f.alt);
    if (f.pad) f.pad.visible = f.alt < 4000;
    f.landing.v = Math.max(0, f.vy);
    f.landing.h = Math.abs(f.vx);
    f.landing.ang = Math.abs(f.angle);
    f.landing.ok = f.landing.v <= f.landing.vTol && f.landing.h <= f.landing.hTol && f.landing.ang <= f.landing.angTol;
    f.landing.onPad = Math.abs(f.x - f.pad.x) <= f.pad.half;
    f.zone = f.alt > 10000 ? 'space' : f.alt > 3000 ? 'high-route' : 'troposphere';
    const dt = 0.5;
    const pts = [[f.x, f.y]];
    let x = f.x;
    let y = f.y;
    let vy = f.vy;
    for (let i = 1; i <= 24; i++) {
      vy += BODY_G[f.body] * 0.1;
      x += f.vx * 0.5;
      y += vy * dt * 0.5;
      if (y >= 0) {
        pts.push([x, 0]);
        f.predict = { level: 2, points: pts, impact: { x, onPad: Math.abs(x - f.pad.x) <= f.pad.half } };
        return;
      }
      pts.push([x, y]);
    }
    f.predict = { level: 2, points: pts, impact: null };
  }

  function stepLoop(f, dt, opts) {
    if (!loop) {
      loop = { t: 0, sep: false, chute: false, ended: 0, lifted: false };
      f.liftedOff = false;
      f.stageIndex = 0;
      f.phase = 'pad';
      f.x = 0; f.y = 0; f.vx = 0; f.vy = 0; f.angle = 0; f.throttle = 0; f.hp = 100;
      f.chute.deployed = false;
      for (const s of f.stages) s.gone = false;
    }
    loop.t += dt;
    f.time += dt;
    const t = loop.t;
    if (f.phase === 'landed') {
      loop.ended += dt;
      f.throttle = 0;
      if (loop.ended > 4) loop = null;
      return;
    }
    const g = BODY_G[f.body] * 0.65;
    const body = f.body;
    f.throttle = t < 1 ? 0 : t < 1.5 ? (t - 1) * 2 : f.alt < (body === 'earth' ? 1100 : 500) && f.vy < 20 && !f.chute.deployed && f.phase !== 'descent' ? 1 : 0;
    if (t >= 1.5 && !loop.lifted) {
      loop.lifted = true;
      f.liftedOff = true;
      f.phase = 'ascent';
      events.push({ type: 'liftoff', x: 0, y: 0 });
    }
    if (!loop.lifted) return;
    const accel = f.throttle * (f.stageIndex === 0 ? 100 : 80);
    f.vy += (-accel + g) * dt;
    f.vy *= Math.exp(-f.atmo * 0.1 * dt);
    f.vy = Math.max(-150, Math.min(105, f.vy));
    if (f.chute.deployed) f.vy += (16 - f.vy) * (1 - Math.exp(-2.5 * dt));
    f.vx += Math.sin(f.angle) * accel * dt * 0.4;
    f.vx *= Math.exp(-0.2 * dt);
    f.angle = f.chute.deployed ? f.angle * 0.9 : Math.sin(t * 0.6) * 0.12;
    f.x += f.vx * dt;
    f.y += f.vy * dt;
    if (f.vy > 2 && f.phase === 'ascent') f.phase = 'descent';
    if (!loop.sep && t > 4.5 && f.stageIndex === 0 && f.stages.length > 2) {
      loop.sep = true;
      f.stages[0].gone = true;
      f.stageIndex = 1;
      events.push({ type: 'stage-sep', stage: 'booster', index: 1, next: 'core', x: f.x, y: f.y, vx: f.vx, vy: f.vy, angle: f.angle });
    }
    f.rcs.left = Math.cos(t * 0.6) > 0.6 ? 0.8 : 0;
    f.rcs.right = Math.cos(t * 0.6) < -0.6 ? 0.8 : 0;
    refresh(f);
    if (f.phase === 'descent' && !loop.chute && f.alt < 380 && body === 'earth') {
      loop.chute = true;
      f.chute.deployed = true;
      events.push({ type: 'parachute', x: f.x, y: f.y });
    }
    if (f.y >= 0 && loop.lifted && t > 3) {
      f.y = 0;
      events.push({ type: 'touch', ok: true, x: f.x, v: f.vy, h: f.vx, ang: f.angle, onPad: true, body });
      events.push({ type: 'landed', perfect: opts.perfect !== false, onPad: true, body });
      f.vx = 0; f.vy = 0; f.angle = 0; f.throttle = 0;
      f.phase = 'landed';
      loop.ended = 0;
    }
  }

  return {
    get last() {
      return { flight, events };
    },
    reset() {
      flight = null;
      loop = null;
    },
    /** Шаг стенда. opts: { scenario, body, era, alt, throttle, angle, stage, weather, objects, time }. */
    update(dt, opts) {
      const f = ensure(opts);
      events.length = 0;
      const t = opts.time || 0;
      f.weather = weatherFor(opts.weather ? opts.weather.kind : 'clear', t);
      moveObjects(f.objects, t);
      moveClouds(clouds, t);
      const scenario = opts.scenario;
      f.boost.active = false;
      if (scenario === 'loop') {
        stepLoop(f, dt, opts);
        refresh(f);
        return { flight: f, config: f.cfg, events };
      }
      loop = null;
      f.time += dt;
      f.chute.deployed = scenario === 'chute';
      f.landing.ok = true;
      const alt = scenario === 'pad' || scenario === 'launch' ? 0 : opts.alt;
      const speedBy = { ascent: -90, space: -40, descent: 70, chute: 14, landing: 10, free: 0, pad: 0, launch: 0 };
      f.x = scenario === 'landing' ? f.pad.x * 0.3 : 0;
      f.y = -alt;
      f.vx = scenario === 'ascent' ? 8 * Math.sin(t * 0.3) : 0;
      f.vy = speedBy[scenario] ?? 0;
      f.angle = scenario === 'free' || scenario === 'landing' ? opts.angle : scenario === 'ascent' ? 0.12 * Math.sin(t * 0.7) : scenario === 'descent' ? 0.04 : 0;
      f.liftedOff = scenario !== 'pad' && scenario !== 'launch';
      f.phase = scenario === 'pad' ? 'pad' : alt > 10000 && f.body === 'earth' ? 'space' : scenario === 'ascent' || scenario === 'launch' ? 'ascent' : scenario === 'landing' && alt < 2 ? 'landed' : 'descent';
      f.throttle = scenario === 'pad' ? 0 : scenario === 'launch' ? Math.max(0.6, opts.throttle) : scenario === 'chute' || scenario === 'landing' && alt < 2 ? 0 : opts.throttle;
      f.rcs.left = scenario === 'ascent' && Math.sin(t * 2) > 0.7 ? 0.8 : 0;
      f.rcs.right = scenario === 'ascent' && Math.sin(t * 2) < -0.7 ? 0.8 : 0;
      f.stageIndex = f.stages.findIndex((s) => s.id === opts.stage);
      if (f.stageIndex < 0) f.stageIndex = 0;
      f.hp = scenario === 'free' ? 30 : 100;
      f.boost.active = scenario === 'launch' && f.throttle > 0.9 && hash2(Math.floor(t), 1) > 0.5;
      refresh(f);
      if (scenario === 'launch') {
        // Земля держит ракету, пока она не оторвётся: видно пламя, дым и пар.
        f.phase = 'pad';
      }
      return { flight: f, config: f.cfg, events };
    },
  };
}
