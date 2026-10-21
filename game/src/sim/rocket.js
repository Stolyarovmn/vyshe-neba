// The rocket itself: stages, fuel, throttle, afterburner and attitude control.
// Everything operates on a FlightState and pushes events into the array it is given.

import { clamp, wrapAngle } from './math.js';

export const ROCKET_AXIS_OFFSET = 26; // the collision circle is centred this far above the feet
export const ROCKET_RADIUS = 12;
export const THROTTLE_RISE = 3; // per second: 0 -> 100% in a third of a second
export const THROTTLE_FALL = 4;
export const RCS_FUEL_SHARE = 0.2; // share of burnRate spent while turning at full rate
export const MAX_TURN_RATE = 3.5;
export const TILT_FREE = 3; // a lean limit at or above this (rad) means the rocket may rotate freely
const TILT_SOFT_FROM = 0.7; // share of the limit where the commanded lean starts to fade and the restoring moment starts
const TILT_RESTORE = 2.5; // rad/s², restoring moment at the limit
export const MASS_SHED_BONUS = 0.35; // thrust gain when every other stage has been shed
export const BOOST = { thrust: 1.32, burn: 1.7, heatUp: 0.24, cool: 0.18, unlock: 0.3, speed: 1.15 };

// Emits a `warn` event unless the same kind was already raised less than `cooldown` seconds ago.
export function warn(s, kind, events, cooldown = 2.5, extra = {}) {
  const last = s.warnAt[kind];
  if (last !== undefined && s.time - last < cooldown) return;
  s.warnAt[kind] = s.time;
  events.push({ type: 'warn', kind, ...extra });
}

export function createStages(configStages, firstActive = 0, fuel01 = 1) {
  return configStages.map((c, index) => {
    const gone = index < firstActive;
    return {
      id: c.id,
      thrust: c.thrust,
      fuel: gone ? 0 : c.fuel * fuel01,
      maxFuel: c.fuel,
      burnRate: c.burnRate,
      mass: c.mass,
      turn: c.turn,
      gone,
    };
  });
}

export function activeStage(s) {
  return s.stages[s.stageIndex];
}

// Fuel left in the active stage and the ones that follow it.
export function fuelTotal(s) {
  let sum = 0;
  for (let i = s.stageIndex; i < s.stages.length; i++) sum += s.stages[i].fuel;
  return sum;
}

export function fuelCapacity(s) {
  let sum = 0;
  for (const stage of s.stages) sum += stage.maxFuel;
  return sum;
}

function drySum(s, onlyAttached) {
  let sum = 0;
  for (const stage of s.stages) if (!onlyAttached || !stage.gone) sum += stage.mass;
  return sum;
}

// Full-throttle acceleration of the active stage; a lighter stack accelerates a little better.
export function stageAccel(s) {
  const stage = activeStage(s);
  const shed = 1 - drySum(s, true) / drySum(s, false);
  return stage.thrust * (1 + MASS_SHED_BONUS * shed);
}

// The jets are the same in air and in vacuum: the RCS module decides how fast the rocket turns.
export function turnRate(s) {
  return Math.min(MAX_TURN_RATE, activeStage(s).turn * s.cfg.fins.turn);
}

// Drops every empty stage that has a successor. The throttle value is deliberately left alone.
export function settleStages(s, events) {
  while (activeStage(s).fuel <= 0 && s.stageIndex < s.stages.length - 1) {
    const dropped = activeStage(s);
    dropped.gone = true;
    s.stageIndex += 1;
    events.push({
      type: 'stage-sep',
      stage: dropped.id,
      index: s.stageIndex,
      next: activeStage(s).id,
      x: s.x,
      y: s.y,
      vx: s.vx,
      vy: s.vy,
      angle: s.angle,
    });
  }
  const empty = fuelTotal(s) <= 0;
  if (empty && !s.fuelEmpty) events.push({ type: 'fuel-empty' });
  s.fuelEmpty = empty;
}

// Burns `amount` of fuel from the active stage. Returns the fraction that was actually available (0..1).
export function burnFuel(s, amount, events) {
  const stage = activeStage(s);
  if (amount <= 0) return 1;
  if (stage.fuel <= 0) return 0;
  const used = Math.min(amount, stage.fuel);
  stage.fuel -= used;
  if (stage.fuel < 1e-9) {
    stage.fuel = 0;
    settleStages(s, events);
  }
  return used / amount;
}

// Pours fuel into the active stage first, then the following ones. Returns the amount that fitted.
export function addFuel(s, amount) {
  let left = amount;
  for (let i = s.stageIndex; i < s.stages.length && left > 0; i++) {
    const stage = s.stages[i];
    const poured = Math.min(left, stage.maxFuel - stage.fuel);
    stage.fuel += poured;
    left -= poured;
  }
  if (amount - left > 0) s.fuelEmpty = false;
  return amount - left;
}

export function spoolThrottle(s, target, dt) {
  const delta = target - s.throttle;
  const rate = delta > 0 ? THROTTLE_RISE : THROTTLE_FALL;
  s.throttle = clamp(s.throttle + clamp(delta, -rate * dt, rate * dt), 0, 1);
}

export function updateBoost(s, wanted, canThrust, dt, events) {
  const boost = s.boost;
  if (boost.locked && boost.heat < BOOST.unlock) boost.locked = false;
  boost.active = wanted && canThrust && !boost.locked;
  boost.heat = clamp(boost.heat + (boost.active ? BOOST.heatUp : -BOOST.cool) * dt, 0, 1);
  if (boost.heat >= 1 && !boost.locked) {
    boost.locked = true;
    boost.active = false;
    events.push({ type: 'thrust-cut', reason: 'overheat' });
  }
}

// Rotation: `tilt` commands an angular rate, RCS jets burn the active tank.
// Turning never changes the velocity vector - only thrust does.
// Soft limit on the lean from vertical: past 85% of the limit the angle bends toward it and never reaches it.
function softLimitAngle(angle, max) {
  const start = max * 0.85;
  const excess = Math.abs(angle) - start;
  if (excess <= 0) return angle;
  const band = max - start;
  return Math.sign(angle) * (start + band * Math.tanh(excess / band));
}

// A command that pushes further away from vertical fades out as the limit comes near.
function fadeOutward(angle, wanted, max) {
  if (wanted * angle <= 0) return wanted;
  const over = Math.abs(angle) / max;
  return wanted * clamp((1 - over) / (1 - TILT_SOFT_FROM), 0, 1);
}

export function updateAttitude(s, cmd, dt, density, events) {
  const rate = turnRate(s);
  s.turnRate = rate;
  const stage = activeStage(s);
  const rcsAvailable = stage.fuel > 0 && !s.chute.deployed;

  let wanted = 0;
  if (cmd.stabilize) wanted = clamp(-s.angle * 5, -rate, rate);
  else if (Math.abs(cmd.tilt) > 0.001) wanted = cmd.tilt * rate;
  else if (s.cfg.avionics.assist) wanted = clamp(-s.angle * 1.5, -0.4 * rate, 0.4 * rate);

  const limited = s.cfg.fins.maxTilt < TILT_FREE;
  const maxTilt = s.cfg.fins.maxTilt;
  if (limited) wanted = fadeOutward(s.angle, wanted, maxTilt);

  const intensity = rcsAvailable ? Math.min(1, Math.abs(wanted) / rate) : 0;
  if (rcsAvailable && intensity > 0.02) {
    const delivered = burnFuel(s, RCS_FUEL_SHARE * stage.burnRate * intensity * dt, events);
    s.av += (wanted * delivered - s.av) * (1 - Math.exp(-dt * 10));
  } else {
    // No jets firing: friction in air, almost none in vacuum.
    s.av *= Math.exp(-dt * (density > 0 ? 1.2 : 0.1));
  }
  s.rcs.left = wanted < 0 && rcsAvailable ? intensity : 0;
  s.rcs.right = wanted > 0 && rcsAvailable ? intensity : 0;

  if (limited) {
    // Passive restoring moment of the fins and a soft stop: no sudden wall, the lean just stops growing.
    const over = Math.abs(s.angle) / maxTilt;
    if (over > TILT_SOFT_FROM) s.av -= Math.sign(s.angle) * Math.min(1, (over - TILT_SOFT_FROM) / (1 - TILT_SOFT_FROM)) * TILT_RESTORE * dt;
    const raw = wrapAngle(s.angle + s.av * dt);
    const next = softLimitAngle(raw, maxTilt);
    if (next !== raw && Math.abs(raw) > Math.abs(s.angle)) s.av *= 0.6; // pushing into the soft stop: the turn dies away
    s.angle = next;
  } else {
    s.angle = wrapAngle(s.angle + s.av * dt);
  }
}
