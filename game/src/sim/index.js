// Public entry of the flight simulation. See docs/ARCHITECTURE.md section 6 for the contract.

export { createFlight, step, summarize } from './flight.js';
export {
  BODIES, DT, METERS_PER_UNIT, SPACE_ALT, ZONES, densityAt, gravityAt, zoneAt,
} from './bodies.js';
export { STAGE_DEFAULTS, normalizeConfig } from './config.js';
export { mulberry32 } from './rng.js';
export { createAutopilot } from './autopilot.js';
export { heavyRocket, startRocket } from './presets.js';
export { advance, findNonFinite, runFlight } from './run.js';
