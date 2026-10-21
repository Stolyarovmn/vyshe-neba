// Flight simulation: fixed-step integration of one rocket flight. Pure and deterministic.
// Coordinates: x right, y DOWN, altitude = -y. Angle 0 points the nose up, positive turns clockwise.
// Velocities: vy > 0 means falling.

import { BODIES, DT, SPACE_ALT, densityAt, gravityAt, zoneAt } from './bodies.js';
import { normalizeConfig } from './config.js';
import {
  CHUTE, applyChute, canParachute, deployChute, evaluateTouchdown, hasChute, liveLanding, predictTrajectory,
} from './landing.js';
import { clamp } from './math.js';
import {
  BOOST, activeStage, addFuel, burnFuel, createStages, fuelCapacity, fuelTotal, spoolThrottle, stageAccel,
  updateAttitude, updateBoost, warn,
} from './rocket.js';
import { CANISTER_SHARE, CONSUMABLE_REPAIR } from './pickups.js';
import { canTransfer, startTransfer, transferFuelCost, updateTransfer } from './transfer.js';
import { updateClouds, updateStorm } from './clouds.js';
import { updateWeather } from './weather.js';
import { createWorld, enterBody, streamWorld, updateObjects } from './world.js';

const LIFTOFF_ALT = 1;
const SPEED_PER_THRUST = 0.94;
const SPEED_CAP = 190;
const PAD_VISIBLE_ALT = 4000;
const PAD_BLAST_FREE = 110; // engines stronger than this scorch the pad without cooling
const PAD_BLAST_DAMAGE = 0.3;
const MAX_FLIGHT_TIME = 1200;
const LOST_IN_SPACE_AFTER = 15;
const PREDICT_EVERY = 8; // ticks

export { DT };

export function createFlight(config) {
  const cfg = normalizeConfig(config);
  const firstStage = cfg.start?.stageIndex ?? 0;
  const stages = createStages(cfg.stages, Math.min(firstStage, cfg.stages.length - 1), cfg.start?.fuel01 ?? 1);
  const core = cfg.stages.find((stage) => stage.id === 'core') ?? cfg.stages[0];

  const s = {
    version: 1,
    cfg,
    phase: 'pad',
    ended: false,
    outcome: null,
    reason: null,
    killer: null,
    perfect: false,
    time: 0,
    entryTime: 0,
    liftoffAt: null,
    liftedOff: false,
    body: 'earth',
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    angle: 0,
    av: 0,
    throttle: 0,
    alt: 0,
    speed: 0,
    climb: 0,
    stageIndex: Math.min(firstStage, cfg.stages.length - 1),
    stages,
    fuel: 0,
    maxFuel: 0,
    fuelTotal: 0,
    fuel01: 1,
    fuelEmpty: false,
    lowFuel: 0,
    hp: cfg.hull.hp,
    maxHp: cfg.hull.hp,
    coins: 0,
    rcs: { left: 0, right: 0 },
    turnRate: 0,
    boost: { heat: 0, locked: false, active: false },
    maxAccel: 0,
    g: 0,
    atmo: 1,
    weightless: false,
    weather: null,
    clouds: [],
    cloudField: null,
    lastCx: null,
    lastCy: null,
    objects: [],
    world: createWorld(),
    pad: null,
    landing: null,
    canTransfer: false,
    transferCostFuel: 0,
    transfer: null,
    predict: null,
    zone: 'troposphere',
    zonesSeen: [],
    limits: {
      speed: cfg.limits.speed ?? Math.min(SPEED_CAP, SPEED_PER_THRUST * core.thrust),
      fall: cfg.limits.fall ?? Math.min(125, Math.max(60, 88 + 0.67 * (cfg.legs.vTol - 13))),
    },
    chute: { deployed: false, used: false, open: false, t: 0, consumable: cfg.consumables.chute === 1 },
    consumables: { repair: cfg.consumables.repair, canister: cfg.consumables.canister },
    latch: { canister: false, repair: false },
    hitTimer: 0,
    shock: 0,
    ringBoost: 0,
    approach: false,
    transferred: false,
    touch: null,
    maxAlt: 0,
    distance: 0,
    rings: 0,
    ringsCentered: 0,
    pickups: 0,
    items: { coin: 0, fuel: 0, repair: 0 },
    near: 0,
    hits: 0,
    stormTime: 0,
    driftTime: 0,
    warnAt: {},
    tick: 0,
  };

  s.fuelEmpty = fuelTotal(s) <= 0;
  const start = cfg.start;
  if (start) {
    const approach = BODIES[start.body].approach;
    const alt = start.alt ?? approach?.alt ?? 500;
    enterBody(s, start.body, {
      alt,
      x: start.x,
      angle: start.angle,
      vx: start.vx,
      vy: start.vy ?? approach?.vMin ?? 0,
      padOffset: start.padOffset ?? undefined,
    });
    s.phase = alt >= SPACE_ALT ? 'space' : 'descent';
    s.liftedOff = true;
    s.liftoffAt = 0;
    s.approach = Boolean(approach);
  } else {
    enterBody(s, 'earth');
  }
  s.zonesSeen = [s.zone];
  streamWorld(s);
  refresh(s);
  return s;
}

function readInput(input) {
  const number = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  return {
    throttle: clamp(number(input?.throttle), 0, 1),
    tilt: clamp(number(input?.tilt), -1, 1),
    stabilize: Boolean(input?.stabilize),
    boost: Boolean(input?.boost),
    parachute: Boolean(input?.parachute),
    canister: Boolean(input?.canister),
    repair: Boolean(input?.repair),
    transfer: Boolean(input?.transfer),
    pause: Boolean(input?.pause),
  };
}

// Advances the flight by `dt` seconds (split into fixed ticks) and returns the events that happened.
export function step(state, input, dt = DT) {
  const events = [];
  const cmd = readInput(input);
  if (state.ended || cmd.pause) return events;

  useConsumables(state, cmd, events);
  state.latch.canister = cmd.canister;
  state.latch.repair = cmd.repair;

  const ticks = Math.max(1, Math.round(dt / DT));
  const h = dt / ticks;
  for (let i = 0; i < ticks && !state.ended; i++) {
    const first = events.length;
    tick(state, cmd, h, events);
    for (let e = first; e < events.length; e++) events[e].t = state.time;
  }
  return events;
}

function useConsumables(s, cmd, events) {
  if (cmd.repair && !s.latch.repair && s.consumables.repair > 0 && s.hp < s.maxHp) {
    s.consumables.repair -= 1;
    const restored = Math.min(s.maxHp - s.hp, CONSUMABLE_REPAIR);
    s.hp += restored;
    events.push({ type: 'pickup', kind: 'repair', value: restored, consumable: true, t: s.time });
  }
  if (cmd.canister && !s.latch.canister && s.consumables.canister > 0) {
    const stage = activeStage(s);
    if (fuelTotal(s) < fuelCapacity(s)) {
      s.consumables.canister -= 1;
      const added = addFuel(s, stage.maxFuel * CANISTER_SHARE);
      events.push({ type: 'pickup', kind: 'fuel', value: added, consumable: true, t: s.time });
    }
  }
}

function tick(s, cmd, dt, events) {
  s.time += dt;
  s.tick += 1;
  s.hitTimer = Math.max(0, s.hitTimer - dt);
  s.shock = Math.max(0, s.shock - dt);
  s.ringBoost = Math.max(0, s.ringBoost - dt);

  if (s.phase === 'transfer') {
    updateTransfer(s, dt, events);
    refresh(s);
    return;
  }

  const body = BODIES[s.body];
  const alt = -s.y;
  const g = gravityAt(body, alt);
  const density = densityAt(body, alt);

  updateWeather(s.weather, s.body, alt, dt, s.cfg.base.weather > 0 || s.cfg.avionics.predict > 0);
  updateClouds(s, dt);
  updateStorm(s, events);
  const storm = s.weather.storm;
  if (storm > 0.5) s.stormTime += dt;

  if (cmd.parachute && !s.chute.deployed) {
    if (canParachute(s)) deployChute(s, events);
    else if (hasChute(s) && s.atmo < CHUTE.minDensity) warn(s, 'chute-air', events, 4);
  }
  if (cmd.transfer && canTransfer(s)) {
    startTransfer(s, events);
    refresh(s);
    return;
  }

  const stage = activeStage(s);
  const canBurn = stage.fuel > 0 && !s.chute.deployed && s.shock <= 0;
  if (canBurn) {
    spoolThrottle(s, cmd.throttle, dt);
  } else {
    if (s.throttle > 0 && stage.fuel <= 0) events.push({ type: 'thrust-cut', reason: 'fuel' });
    s.throttle = 0;
  }
  updateBoost(s, cmd.boost, canBurn && s.throttle > 0.05, dt, events);

  let thrust = 0;
  if (s.throttle > 0 && canBurn) {
    const boosted = s.boost.active;
    const accel = stageAccel(s) * s.throttle * (boosted ? BOOST.thrust : 1);
    const burn = stage.burnRate * s.throttle * (boosted ? BOOST.burn : 1) * dt;
    thrust = accel * burnFuel(s, burn, events);
  }

  if (s.liftedOff) updateAttitude(s, cmd, dt, density, events);
  else s.rcs.left = s.rcs.right = 0;

  const fins = s.cfg.fins.dragCut;
  const windFactor = 1 - Math.min(0.9, 1.4 * fins);
  if (s.liftedOff && storm > 0.01) {
    // Inside a storm cloud: the nose is shaken and the air rises and sinks in smooth gusts.
    s.av += storm * 0.7 * (Math.sin(s.time * 2.9) + Math.sin(s.time * 5.3 + 1)) * windFactor * dt;
    s.vy += storm * 6 * Math.sin(s.time * 1.7 + 0.4) * dt;
  }

  s.vx += Math.sin(s.angle) * thrust * dt;
  s.vy += (-Math.cos(s.angle) * thrust + g) * dt;

  // Air drag works against the velocity relative to the moving air: that is how the wind carries the rocket.
  const windSpeed = (s.weather.wind + storm * 8 * Math.sin(s.time * 0.9)) * windFactor;
  s.weather.push = 0;
  if (density > 0) {
    const speed = Math.hypot(s.vx, s.vy);
    const climbShare = speed > 0.001 ? 0.5 - 0.5 * (s.vy / speed) : 0.5;
    const k = density * (0.065 + 0.155 * climbShare) * (1 - fins);
    const keep = Math.exp(-k * dt);
    s.weather.push = k * (windSpeed - s.vx);
    s.vx = windSpeed + (s.vx - windSpeed) * keep;
    s.vy *= keep;
  }
  if (s.chute.deployed) applyChute(s, dt);

  const falling = s.vy > 0 && g > 0;
  let limit = falling ? s.limits.fall : s.limits.speed;
  limit *= 1 + 0.12 * Math.min(1, s.ringBoost);
  if (s.boost.active) limit *= BOOST.speed;
  // The limit is on the speed through the air, so a wind-carried rocket is not slowed down by the cap.
  s.weather.felt = windSpeed;
  const airSpeed = Math.hypot(s.vx - windSpeed, s.vy);
  if (airSpeed > limit) {
    s.vx = windSpeed + (s.vx - windSpeed) * (limit / airSpeed);
    s.vy *= limit / airSpeed;
  }

  if (!s.liftedOff && s.y >= 0 && s.vy >= 0) {
    // The pad holds the rocket until the engine actually lifts it.
    s.vx = 0;
    s.vy = 0;
    s.angle = 0;
    s.av = 0;
  }

  s.x += s.vx * dt;
  s.y += s.vy * dt;
  if (s.liftedOff) s.distance += Math.hypot(s.vx, s.vy) * dt;

  const newAlt = -s.y;
  if (!s.liftedOff && newAlt > LIFTOFF_ALT) liftOff(s, events);
  if (s.body === 'earth') s.maxAlt = Math.max(s.maxAlt, newAlt);

  if (s.liftedOff && s.y >= 0) {
    touchDown(s, events);
    refresh(s);
    return;
  }

  streamWorld(s);
  updateObjects(s, events);
  if (s.hp <= 0) {
    crash(s, 'hull-destroyed', events);
    refresh(s);
    return;
  }

  updatePhase(s, events);
  refresh(s);
  updateWarnings(s, events);
  checkLimits(s, dt, events);
}

function liftOff(s, events) {
  s.liftedOff = true;
  s.liftoffAt = s.time;
  s.phase = 'ascent';
  events.push({ type: 'liftoff', x: s.x, y: s.y });
  const blast = Math.max(0, stageAccel(s) - PAD_BLAST_FREE) * PAD_BLAST_DAMAGE * (1 - s.cfg.base.padSafety);
  if (blast >= 1) {
    s.hp = Math.max(1, s.hp - blast);
    events.push({ type: 'hit', kind: 'pad-blast', damage: blast, hp: s.hp, x: s.x, y: s.y });
  }
}

function updatePhase(s, events) {
  const alt = -s.y;
  if (s.phase === 'ascent' && s.vy > 2 && alt > LIFTOFF_ALT) s.phase = 'descent';
  if (s.body === 'earth') {
    if (alt >= SPACE_ALT && (s.phase === 'ascent' || s.phase === 'descent')) s.phase = 'space';
    else if (s.phase === 'space' && alt < SPACE_ALT - 100) s.phase = 'descent';
  }
  const zone = zoneAt(s.body, alt);
  if (zone !== s.zone) {
    const first = !s.zonesSeen.includes(zone);
    if (first) s.zonesSeen.push(zone);
    events.push({ type: 'zone', id: zone, previous: s.zone, first });
    s.zone = zone;
  }
}

function crash(s, reason, events, extra = {}) {
  s.phase = 'crashed';
  s.outcome = 'crashed';
  s.ended = true;
  s.reason = reason;
  s.throttle = 0;
  s.rcs.left = s.rcs.right = 0;
  events.push({ type: 'crashed', reason, killer: s.killer, x: s.x, y: s.y, ...extra });
}

function touchDown(s, events) {
  const result = evaluateTouchdown(s);
  s.y = 0;
  s.touch = result;
  events.push({
    type: 'touch', v: result.v, h: result.h, ang: result.ang, ok: result.ok, onPad: result.onPad, x: s.x, body: s.body,
  });
  s.vx = 0;
  s.vy = 0;
  s.av = 0;
  s.throttle = 0;
  s.rcs.left = s.rcs.right = 0;

  if (!result.ok) {
    crash(s, result.reason, events, { v: result.v, h: result.h, ang: result.ang, vTol: result.vTol, hTol: result.hTol, angTol: result.angTol });
    return;
  }
  s.hp = Math.max(0, s.hp - result.damage);
  if (s.hp <= 0) {
    crash(s, 'hull-destroyed', events);
    return;
  }
  s.phase = 'landed';
  s.outcome = 'landed';
  s.ended = true;
  s.perfect = result.perfect;
  events.push({ type: 'landed', perfect: result.perfect, onPad: result.onPad, damage: result.damage, body: s.body });
}

function updateWarnings(s, events) {
  const landing = s.landing;
  if (s.liftedOff && s.vy > landing.vTol * 1.2 && s.alt < 600 && s.fuel > 0) {
    const net = s.maxAccel - s.g;
    const needed = net > 0 ? (s.vy * s.vy) / (2 * net) : Infinity;
    if (needed > s.alt * 0.85) warn(s, 'brake', events, 1.5);
  }
  if (s.liftedOff && s.vy > 0 && s.alt < 120) {
    if (Math.abs(s.angle) > landing.angTol * 0.9) warn(s, 'tilt', events, 2);
    if (Math.abs(s.vx) > landing.hTol * 0.9) warn(s, 'drift', events, 2);
  }
  if (s.boost.active && s.boost.heat > 0.8) warn(s, 'overheat', events, 2);
  if (s.hp / s.maxHp < 0.25) warn(s, 'hull', events, 8);
  if (Math.abs(s.weather.push) > 3.5) warn(s, 'wind', events, 12);

  const fraction = s.fuel01;
  if (fraction < 0.2 && s.lowFuel < 1 && s.fuelTotal > 0) {
    s.lowFuel = 1;
    events.push({ type: 'low-fuel', level: 1, fraction });
  }
  if (fraction < 0.08 && s.lowFuel < 2 && s.fuelTotal > 0) {
    s.lowFuel = 2;
    events.push({ type: 'low-fuel', level: 2, fraction });
  }
  if (fraction > 0.25) s.lowFuel = 0;
}

function checkLimits(s, dt, events) {
  if (s.ended) return;
  if (s.phase === 'space' && s.fuelEmpty && !s.chute.deployed && s.climb > -2) s.driftTime += dt;
  else s.driftTime = 0;
  if (s.driftTime > LOST_IN_SPACE_AFTER) crash(s, 'lost-in-space', events);
  else if (s.time - (s.liftoffAt ?? 0) > MAX_FLIGHT_TIME) crash(s, 'lost-contact', events);
}

// Copies derived values the renderer, HUD and sound read straight from the state.
function refresh(s) {
  const body = BODIES[s.body];
  const alt = Math.max(0, -s.y);
  const stage = activeStage(s);
  s.alt = alt;
  s.speed = Math.hypot(s.vx, s.vy);
  s.climb = -s.vy;
  s.g = gravityAt(body, alt);
  s.atmo = densityAt(body, alt);
  s.weightless = s.g <= 0;
  s.fuel = stage.fuel;
  s.maxFuel = stage.maxFuel;
  s.fuelTotal = fuelTotal(s);
  s.fuel01 = s.fuelTotal / Math.max(1e-9, fuelCapacity(s));
  s.maxAccel = stageAccel(s);
  s.pad.visible = alt < PAD_VISIBLE_ALT;
  s.landing = liveLanding(s);
  s.canTransfer = canTransfer(s);
  s.transferCostFuel = s.cfg.destination === 'earth' ? 0 : transferFuelCost(s);
  if (s.cfg.avionics.predict > 0 && (s.tick % PREDICT_EVERY === 0 || s.predict === null)) s.predict = predictTrajectory(s);
}

export function summarize(s) {
  const landed = s.outcome === 'landed';
  const airTime = s.liftoffAt === null ? 0 : s.time - s.liftoffAt;
  const touch = s.touch;
  return {
    outcome: s.ended ? s.outcome : 'abandoned',
    perfect: landed && s.perfect,
    destination: s.cfg.destination,
    body: s.body,
    maxAlt: s.maxAlt,
    distance: s.distance,
    time: airTime,
    fuelLeft01: s.fuelTotal / Math.max(1e-9, fuelCapacity(s)),
    hpLeft01: s.hp / s.maxHp,
    coinsPicked: s.coins,
    rings: s.rings,
    ringsCentered: s.ringsCentered,
    pickups: s.pickups,
    near: s.near,
    stormTime: s.stormTime,
    usedChute: s.chute.used,
    reason: s.ended ? s.reason : 'abandoned',
    landing: touch
      ? { v: touch.v, h: touch.h, ang: touch.ang, vTol: touch.vTol, hTol: touch.hTol, angTol: touch.angTol, onPad: touch.onPad }
      : null,
    transferred: s.transferred,
    hits: s.hits,
    items: { ...s.items },
    zones: [...s.zonesSeen],
    killer: s.killer,
    skin: s.cfg.skin,
  };
}
