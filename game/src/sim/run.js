// Helpers for driving a flight: used by tests, the economy bot and tools.

import { createAutopilot } from './autopilot.js';
import { DT, createFlight, step, summarize } from './flight.js';

// Runs a whole flight with an autopilot (or `driver(state, dt) -> Input`) until it ends or `maxTime` passes.
// options: { skill, mission, targetAlt, seed, maxTime, driver, onEvents(events, state) }
export function runFlight(config, options = {}) {
  const state = createFlight(config);
  const pilot = options.driver ? null : createAutopilot({ seed: config.seed, ...options });
  const maxTime = options.maxTime ?? 600;
  const events = [];
  while (!state.ended && state.time < maxTime) {
    const input = options.driver ? options.driver(state, DT) : pilot.next(state, DT);
    const fresh = step(state, input, DT);
    if (fresh.length) {
      events.push(...fresh);
      options.onEvents?.(fresh, state);
    }
  }
  return { state, result: summarize(state), events };
}

// Steps `state` for `seconds` with a constant input or `input(state)`; returns every event produced.
export function advance(state, input, seconds, onTick) {
  const events = [];
  const ticks = Math.round(seconds / DT);
  for (let i = 0; i < ticks && !state.ended; i++) {
    events.push(...step(state, typeof input === 'function' ? input(state) : input, DT));
    onTick?.(state);
  }
  return events;
}

// Returns the path of the first NaN, Infinity or undefined found anywhere inside `value`, or null.
export function findNonFinite(value, path = 'state') {
  if (typeof value === 'number') return Number.isFinite(value) ? null : path;
  if (value === undefined) return path;
  if (value === null || typeof value !== 'object') return null;
  for (const key of Object.keys(value)) {
    const found = findNonFinite(value[key], `${path}.${key}`);
    if (found) return found;
  }
  return null;
}
