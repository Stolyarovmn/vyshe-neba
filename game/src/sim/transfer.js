// Transfer to the Moon or Mars: a fuel-costing manoeuvre from space, then an approach above the destination.
// The arrival speed depends on how much fuel the manoeuvre left, which makes a bigger rocket a better one.

import { BODIES, smoothstep } from './bodies.js';
import { lerp } from './math.js';
import { activeStage, fuelCapacity, fuelTotal, settleStages } from './rocket.js';
import { enterBody } from './world.js';

export const TRANSFER_TIME = 3.5; // seconds of the manoeuvre itself (the camera plays a warp)

// Absolute fuel the manoeuvre costs: a share of the main stage's tank.
export function transferFuelCost(s) {
  const core = s.stages.find((stage) => stage.id === 'core') ?? s.stages[0];
  return (s.cfg.transferCost[s.cfg.destination] ?? 0) * core.maxFuel;
}

export function canTransfer(s) {
  if (s.ended || s.cfg.destination === 'earth' || s.body !== 'earth' || s.phase !== 'space') return false;
  return fuelTotal(s) >= transferFuelCost(s);
}

// Takes fuel from the active stage first, shedding empty stages on the way.
function drainFuel(s, amount, events) {
  let left = amount;
  while (left > 1e-9) {
    const stage = activeStage(s);
    if (stage.fuel <= 0) {
      if (s.stageIndex >= s.stages.length - 1) break;
      settleStages(s, events);
      continue;
    }
    const used = Math.min(left, stage.fuel);
    stage.fuel -= used;
    left -= used;
    if (stage.fuel < 1e-9) {
      stage.fuel = 0;
      settleStages(s, events);
    }
  }
}

export function startTransfer(s, events) {
  const cost = transferFuelCost(s);
  drainFuel(s, cost, events);
  s.phase = 'transfer';
  s.transfer = { t: 0, cost };
  s.throttle = 0;
  s.rcs.left = 0;
  s.rcs.right = 0;
  events.push({ type: 'transfer-start', destination: s.cfg.destination, cost });
}

// Approach speed in units/s: plenty of fuel left means a gentle arrival.
export function approachSpeed(destination, fuelLeft01) {
  const { vMin, vMax } = BODIES[destination].approach;
  return lerp(vMax, vMin, smoothstep(0, 0.6, fuelLeft01));
}

// Advances the manoeuvre timer; returns true on the step the rocket arrives.
export function updateTransfer(s, dt, events) {
  s.transfer.t += dt;
  if (s.transfer.t < TRANSFER_TIME) return false;

  const destination = s.cfg.destination;
  const approach = BODIES[destination].approach;
  const fuelLeft01 = fuelTotal(s) / fuelCapacity(s);
  const speed = approachSpeed(destination, fuelLeft01);
  enterBody(s, destination, { alt: approach.alt, vx: s.vx * 0.2, vy: speed });
  s.transfer = null;
  s.phase = 'descent';
  s.approach = true;
  s.transferred = true;
  events.push({ type: 'transfer-done', body: destination, speed, alt: approach.alt, fuelLeft01 });
  return true;
}
