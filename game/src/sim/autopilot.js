// A simple flight controller used by tests and the economy bot.
// skill 0..1: 1 is clean, lower values add reaction delay, control noise and a worse landing plan.
//
// const pilot = createAutopilot({ skill: 1, mission: 'hop', targetAlt: 90, seed: 7 });
// const input = pilot.next(state, dt);   // call every frame/tick, pass the result to step()
//
// Missions: 'hop' climbs to targetAlt and lands, 'space' climbs past the space line (then transfers when the
// destination is Moon/Mars, otherwise turns around and returns), 'land' only brings an approach down.

import { BODIES, SPACE_ALT, densityAt, gravityAt } from './bodies.js';
import { clamp, wrapAngle } from './math.js';
import { createRngState, gaussian, hashSeed, range } from './rng.js';

const IDLE = Object.freeze({
  throttle: 0, tilt: 0, stabilize: false, boost: false, parachute: false, canister: false, repair: false, transfer: false, pause: false,
});

const NOISE_TIME = 0.5; // seconds: how slowly the pilot's hand wanders
const BRAKE_SHARE = 0.65; // share of the available deceleration the landing plan relies on
const SPEED_GAIN = 4; // 1/s: vertical speed error to acceleration
const LOOKAHEAD = 0.2; // seconds: begin braking early to cover throttle spool-up
const HOVER_WINDOW = 2; // units above the ground where the plan reaches touchdown speed

// Height the rocket reaches if the engine is cut now (gravity and drag, straight up).
function predictApogee(s) {
  const body = BODIES[s.body];
  const dt = 0.1;
  let alt = s.alt;
  let climb = s.climb;
  for (let i = 0; i < 400 && climb > 0; i++) {
    climb -= gravityAt(body, alt) * dt;
    climb *= Math.exp(-densityAt(body, alt) * 0.22 * (1 - s.cfg.fins.dragCut) * dt);
    alt += climb * dt;
  }
  return alt;
}

// Sideways speed that steps out of the way of the most imminent hazard (0 when the path is clear).
function dodgeSpeed(s) {
  const HORIZON = 4;
  const MARGIN = 30;
  const cx = s.x + Math.sin(s.angle) * 26;
  const cy = s.y - Math.cos(s.angle) * 26;
  let soonest = HORIZON;
  let side = 0;
  for (const o of s.objects) {
    if (!o.hazard || !o.active) continue;
    const px = o.x - cx;
    const py = o.y - cy;
    if (Math.abs(px) > 500 || Math.abs(py) > 500) continue;
    const vx = o.vx - s.vx;
    const vy = o.vy - s.vy;
    const speed2 = vx * vx + vy * vy;
    const t = speed2 > 1e-6 ? clamp(-(px * vx + py * vy) / speed2, 0, HORIZON) : 0;
    const missX = px + vx * t;
    const missY = py + vy * t;
    if (Math.hypot(missX, missY) < o.r + 12 + MARGIN && t < soonest) {
      soonest = t;
      side = missX >= 0 ? -1 : 1;
    }
  }
  return side * 45;
}

// Near the ground a dodge must stay gentle: the landing needs the rocket close to the pad and nearly still.
function dodgeFor(s) {
  const lowGround = s.vy > 0 ? clamp((s.alt - 60) / 80, 0, 1) : clamp((s.alt - 25) / 80, 0, 1);
  return lowGround > 0 ? dodgeSpeed(s) * (0.4 + 0.6 * lowGround) : 0;
}

// Sideways speed that lines the rocket up with the nearest boost ring above it, or null when none is worth taking.
// Rings are only taken when the sky is clear of threats and there is fuel to spare.
function ringAim(s) {
  if (s.alt < 120 || s.fuel01 < 0.3) return null;
  const centreAlt = s.alt + Math.cos(s.angle) * 26;
  let best = null;
  for (const o of s.objects) {
    if (o.kind !== 'ring' || !o.active) continue;
    const up = -o.y - centreAlt;
    if (up < 25 || up > 500 || Math.abs(o.x - s.x) > o.halfWidth + 200) continue;
    if (!best || up < best.up) best = { up, dx: o.x - s.x };
  }
  if (!best || dodgeSpeed(s) !== 0) return null;
  return clamp(best.dx / Math.max(0.6, best.up / Math.max(15, s.climb)), -40, 40);
}

export function createAutopilot(options = {}) {
  const skill = clamp(options.skill ?? 1, 0, 1);
  const sloppy = 1 - skill;
  const mission = options.mission ?? 'hop';
  const targetAlt = options.targetAlt ?? 90;
  const takeRings = options.rings !== false;
  const rng = createRngState(hashSeed(options.seed ?? 1, 4242));

  // Per-flight personality: how optimistic the landing plan is, and how long the reaction takes.
  const planFactor = BRAKE_SHARE * (1 + sloppy * range(rng, -0.5, 0.45));
  const delay = sloppy * 0.3;
  const queue = [];
  let held = { ...IDLE };
  const noise = { throttle: 0, tilt: 0 };
  let mode = null;
  let lastTime = null;

  function updateNoise(dt) {
    const k = Math.exp(-dt / NOISE_TIME);
    const spread = Math.sqrt(1 - k * k);
    noise.throttle = noise.throttle * k + gaussian(rng) * spread;
    noise.tilt = noise.tilt * k + gaussian(rng) * spread;
  }

  function tiltToward(s, wantedAngle) {
    const error = wrapAngle(wantedAngle - s.angle);
    return clamp((3 * error - 0.6 * s.av) / s.turnRate, -1, 1);
  }

  // Horizontal guidance toward the pad: returns the angle to hold.
  function steerAngle(s, climbing = false) {
    const dx = s.x - s.pad.x;
    const aim = climbing && takeRings ? ringAim(s) : null;
    const reach = Math.max(1.5, s.g * 0.4 * Math.tan(0.4)); // sideways acceleration the tilt can really give
    const maxSpeed = Math.min(60, 3 + 0.35 * s.alt, Math.sqrt(2 * 0.6 * reach * Math.abs(dx)));
    const wanted = (aim ?? -Math.sign(dx) * maxSpeed) + dodgeFor(s);
    const accel = 1.5 * (wanted - s.vx);
    const limit = clamp(0.06 + s.alt * 0.01, 0.06, 0.45);
    return clamp(Math.atan2(accel, Math.max(s.g, 3)), -limit, limit);
  }

  // Too far from the pad for the height left: slow the descent down and slide over.
  function descentCap(s) {
    const dx = Math.abs(s.x - s.pad.x);
    return dx > 40 + 0.15 * s.alt ? 18 : Infinity;
  }

  function landingThrottle(s) {
    const touchSpeed = 0.38 * 0.7 * s.cfg.legs.vTol; // aim well inside even the rough-ground limit
    const brake = Math.max(0.5, (s.maxAccel - s.g) * planFactor);
    const alt = s.alt - LOOKAHEAD * Math.max(0, s.vy);
    const above = Math.max(0, alt - HOVER_WINDOW);
    const planned = Math.min(Math.sqrt(touchSpeed * touchSpeed + 2 * brake * above), Math.max(descentCap(s), touchSpeed));
    const feedForward = brake * clamp(above / 4, 0, 1);
    const wantedAccel = feedForward + SPEED_GAIN * (s.vy - planned);
    return clamp((s.g + wantedAccel) / (s.maxAccel * Math.cos(s.angle)), 0, 1);
  }

  function decide(s) {
    const out = { ...IDLE };
    if (s.ended) return out;
    if (s.phase === 'transfer') return out;
    if (mode === null) mode = s.approach || mission === 'land' ? 'descend' : 'climb';
    if (s.approach && mode !== 'descend') mode = 'descend';

    const spaceGoal = mission === 'space';
    const goalAlt = spaceGoal ? SPACE_ALT + 150 : targetAlt;

    if (mode === 'climb' || mode === 'coast') {
      if (s.liftedOff && s.climb < 0 && !spaceGoal) mode = 'descend';
      else if (spaceGoal && s.phase === 'space') mode = s.cfg.destination === 'earth' ? 'flip' : 'wait';
      else if (s.liftedOff && s.climb < 0 && s.phase === 'descent') mode = 'descend';
    }

    if (mode === 'climb' || mode === 'coast') {
      const apogee = predictApogee(s);
      if (apogee >= goalAlt) mode = 'coast';
      else if (apogee < goalAlt - 15) mode = 'climb';
      out.throttle = mode === 'climb' ? 1 : 0;
      out.tilt = tiltToward(s, steerAngle(s, true));
      return out;
    }

    if (mode === 'wait') {
      out.tilt = tiltToward(s, 0);
      if (s.canTransfer) out.transfer = true;
      else if (s.fuelTotal < s.transferCostFuel) mode = 'flip'; // not enough fuel to go: turn back
      return out;
    }

    if (mode === 'flip') {
      // Weightless return: point the nose down, cancel the climb, then fall back.
      out.tilt = tiltToward(s, Math.PI);
      const turned = Math.abs(wrapAngle(Math.PI - s.angle)) < 0.35;
      if (turned && s.climb > -30) out.throttle = 1;
      if (s.climb <= -30 || s.phase === 'descent') mode = 'descend';
      return out;
    }

    // descend
    if (s.fuelTotal <= 0 && s.vy > 0) out.parachute = true;
    out.tilt = tiltToward(s, s.alt > 4 || s.vy > 0 ? steerAngle(s) : 0);
    if (s.climb > 0 && s.alt > 10) out.throttle = 0;
    else out.throttle = landingThrottle(s);
    if (s.alt < 1 && s.vy < 2) out.throttle = 0;
    return out;
  }

  return {
    next(state, dt = 1 / 120) {
      const raw = decide(state);
      if (lastTime === null || state.time !== lastTime) updateNoise(dt);
      lastTime = state.time;
      if (sloppy > 0) {
        raw.throttle = clamp(raw.throttle + sloppy * 0.15 * noise.throttle * (raw.throttle > 0 ? 1 : 0), 0, 1);
        raw.tilt = clamp(raw.tilt + sloppy * 0.6 * noise.tilt, -1, 1);
      }
      if (delay <= 0) return raw;
      queue.push({ at: state.time + delay, input: raw });
      while (queue.length && queue[0].at <= state.time) held = queue.shift().input;
      return { ...held };
    },
    get mode() {
      return mode;
    },
  };
}
