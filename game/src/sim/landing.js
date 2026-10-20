// Touchdown rules, parachute and the avionics prediction line.

import { BODIES, densityAt, gravityAt } from './bodies.js';
import { clamp, wrapAngle } from './math.js';

export const CHUTE = { minDensity: 0.35, terminalBase: 12, terminalPerLevel: 0.65, terminalMin: 3.5, decel: 110 };
const OFF_PAD_FACTOR = 0.7; // rough ground: every tolerance shrinks
const BEACON_TOLERANCE_GAIN = 0.25; // full beacon coverage widens tolerances by this much on the pad
const PERFECT = { v: 0.46, h: 0.34, ang: 0.44 }; // share of the tolerance a perfect landing must stay under
const SOFT_DAMAGE_MAX = 0.22; // share of max hull lost by a touchdown right at the tolerance limit
const SOFT_DAMAGE_FROM = 0.55; // below this share of the tolerance a touchdown is free

export function isOnPad(s) {
  return Math.abs(s.x - s.pad.x) <= s.pad.half;
}

export function landingLimits(s) {
  const { vTol, hTol, angTol } = s.cfg.legs;
  const onPad = isOnPad(s);
  const k = onPad ? 1 + BEACON_TOLERANCE_GAIN * s.cfg.base.beacons : OFF_PAD_FACTOR;
  return { vTol: vTol * k, hTol: hTol * k, angTol: angTol * k, onPad };
}

// Live values for the HUD: is the current state safe to touch down in?
export function liveLanding(s) {
  const limits = landingLimits(s);
  const v = Math.max(0, s.vy);
  const h = Math.abs(s.vx);
  const ang = Math.abs(wrapAngle(s.angle));
  return {
    ...limits,
    v,
    h,
    ang,
    ok: v <= limits.vTol && h <= limits.hTol && ang <= limits.angTol,
  };
}

// Decides what a touchdown with the current state means. Does not change the state.
export function evaluateTouchdown(s) {
  const limits = landingLimits(s);
  const v = Math.max(0, s.vy);
  const h = Math.abs(s.vx);
  const ang = Math.abs(wrapAngle(s.angle));
  const ratios = { 'landing-speed': v / limits.vTol, 'landing-drift': h / limits.hTol, 'landing-tilt': ang / limits.angTol };

  let reason = null;
  let worst = 1;
  for (const [code, ratio] of Object.entries(ratios)) {
    if (ratio > worst) {
      worst = ratio;
      reason = code;
    }
  }

  const severity = reason ? 1 : clamp((Math.max(...Object.values(ratios)) - SOFT_DAMAGE_FROM) / (1 - SOFT_DAMAGE_FROM), 0, 1);
  const damage = reason ? 0 : s.maxHp * SOFT_DAMAGE_MAX * severity * severity;
  const perfect = !reason
    && limits.onPad
    && v <= limits.vTol * PERFECT.v
    && h <= limits.hTol * PERFECT.h
    && ang <= limits.angTol * PERFECT.ang;

  return { ...limits, v, h, ang, ok: !reason, reason, perfect, damage };
}

export function chuteLevel(s) {
  return Math.max(s.cfg.parachute.level, s.chute.consumable ? 1 : 0);
}

export function hasChute(s) {
  return chuteLevel(s) > 0;
}

export function canParachute(s) {
  if (s.chute.deployed || s.ended || !hasChute(s)) return false;
  return s.vy > 0 && s.atmo >= CHUTE.minDensity && s.phase !== 'pad' && s.phase !== 'transfer';
}

export function deployChute(s, events) {
  s.chute.deployed = true;
  s.chute.used = true;
  s.throttle = 0;
  events.push({ type: 'parachute', level: chuteLevel(s), x: s.x, y: s.y });
}

export function chuteTerminalSpeed(s) {
  return Math.max(CHUTE.terminalMin, CHUTE.terminalBase - CHUTE.terminalPerLevel * chuteLevel(s));
}

// An open canopy brakes the fall down to the terminal speed (strongly, then it holds) and damps sway and tilt.
export function applyChute(s, dt) {
  const terminal = chuteTerminalSpeed(s);
  if (s.vy > terminal) s.vy = Math.max(terminal, s.vy - CHUTE.decel * dt);
  s.vx *= Math.exp(-0.6 * dt);
  s.angle *= Math.exp(-2 * dt);
  s.av = 0;
}

// Coasting trajectory (no thrust) for the avionics display. Returns null when there is no avionics.
export function predictTrajectory(s) {
  const level = s.cfg.avionics.predict;
  if (level <= 0) return null;
  const body = BODIES[s.body];
  const STEP = 0.05;
  const SAMPLE_EVERY = 5;
  const HORIZON = 14;
  let x = s.x;
  let y = s.y;
  let vx = s.vx;
  let vy = s.vy;
  const points = [[x, y]];
  let impact = null;
  const dragCoefficient = 0.065 * (1 - s.cfg.fins.dragCut);

  for (let i = 1; i * STEP <= HORIZON; i++) {
    const alt = -y;
    vy += gravityAt(body, alt) * STEP;
    const drag = Math.exp(-densityAt(body, alt) * dragCoefficient * 2 * STEP);
    vx *= drag;
    vy *= drag;
    x += vx * STEP;
    y += vy * STEP;
    if (y >= 0) {
      impact = { x, t: i * STEP, v: vy, h: Math.abs(vx) };
      points.push([x, 0]);
      break;
    }
    if (i % SAMPLE_EVERY === 0) points.push([x, y]);
  }

  const result = { level, points, impact: null };
  if (level >= 2 && impact) result.impact = { ...impact, onPad: Math.abs(impact.x - s.pad.x) <= s.pad.half };
  return result;
}
