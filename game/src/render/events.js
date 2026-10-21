// События симуляции -> частицы, тряска камеры, вспышки. Уважает settings.reduceMotion:
// без тряски и вспышек, частиц меньше.

import { PALETTE_VARIANT, PARTICLE } from './particles.js';
import { clamp } from './util.js';

/** Состояние экранных эффектов (вспышка, рекомендуемое замедление времени). */
export function createScreenFx() {
  return { flash: 0, flashColor: [255, 255, 255], slowmo: 0 };
}

/** Взрыв частиц из точки: count штук с разбросом направления вокруг angle (рад.), spread — полуугол. */
export function emitBurst(particles, rng, spec) {
  const {
    kind, x, y, count, speed, ttl, size, gravity = 0, drag = 0, variant = 0,
    angle = -Math.PI / 2, spread = Math.PI, ox = 0, oy = 0,
  } = spec;
  for (let i = 0; i < count; i++) {
    const a = angle + (rng() * 2 - 1) * spread;
    const v = speed[0] + rng() * (speed[1] - speed[0]);
    const life = ttl[0] + rng() * (ttl[1] - ttl[0]);
    const s0 = size[0] + rng() * (size[1] - size[0]);
    particles.emit(
      kind, x + (rng() * 2 - 1) * ox, y + (rng() * 2 - 1) * oy,
      Math.cos(a) * v + (spec.vx || 0), Math.sin(a) * v + (spec.vy || 0),
      life, s0, s0 * (spec.shrink ?? 0.4), gravity, drag, variant,
    );
  }
}

function scaled(count, reduce) {
  return reduce ? Math.ceil(count * 0.5) : count;
}

function dustVariant(body) {
  return body === 'mars' ? PALETTE_VARIANT.MARS_DUST : body === 'moon' ? PALETTE_VARIANT.MOON_DUST : PALETTE_VARIANT.DEFAULT;
}

function flash(env, alpha, r, g, b) {
  if (env.reduceMotion) return;
  const fx = env.fx;
  if (alpha > fx.flash) {
    fx.flash = alpha;
    fx.flashColor[0] = r;
    fx.flashColor[1] = g;
    fx.flashColor[2] = b;
  }
}

function groundDust(env, x, count, power) {
  const body = env.body;
  const variant = dustVariant(body);
  const kind = body === 'earth' ? PARTICLE.SMOKE : PARTICLE.DUST;
  for (const side of [-1, 1]) {
    emitBurst(env.particles, env.rng, {
      kind, x, y: -1, count: scaled(count, env.reduceMotion), speed: [20 * power, 90 * power], ttl: [0.7, 1.6], size: [5, 11],
      gravity: -4, drag: 1.6, variant, angle: side > 0 ? -0.12 : Math.PI + 0.12, spread: 0.2, ox: 6, shrink: 2.2,
    });
  }
}

function sparks(env, x, y, count, power = 1, variant = 0) {
  emitBurst(env.particles, env.rng, {
    kind: PARTICLE.SPARK, x, y, count: scaled(count, env.reduceMotion), speed: [30 * power, 120 * power], ttl: [0.35, 0.9],
    size: [1.5, 3], gravity: 140, drag: 0.6, variant, angle: -Math.PI / 2, spread: Math.PI * 0.9, shrink: 0.3,
  });
}

function explosion(env, x, y) {
  const { particles, rng, reduceMotion } = env;
  particles.emit(PARTICLE.FLASH, x, y, 0, 0, 0.45, 14, 96, 0, 0, PALETTE_VARIANT.FIREBALL);
  particles.emit(PARTICLE.FLASH, x, y, 0, 0, 0.65, 8, 62, 0, 0, PALETTE_VARIANT.DEFAULT);
  emitBurst(particles, rng, {
    kind: PARTICLE.FLAME, x, y, count: scaled(46, reduceMotion), speed: [20, 130], ttl: [0.45, 1.1], size: [5, 12],
    gravity: 18, drag: 1.1, variant: PALETTE_VARIANT.FIREBALL, angle: -Math.PI / 2, spread: Math.PI, shrink: 0.2,
  });
  emitBurst(particles, rng, {
    kind: PARTICLE.SMOKE, x, y, count: scaled(34, reduceMotion), speed: [8, 60], ttl: [1.6, 3.8], size: [7, 15],
    gravity: -10, drag: 0.8, variant: PALETTE_VARIANT.BLACK_SMOKE, angle: -Math.PI / 2, spread: Math.PI, shrink: 2.4,
  });
  // Осколки обшивки: белые и красные, часть остаётся лежать на земле надолго.
  for (const variant of [PALETTE_VARIANT.HULL_WHITE, PALETTE_VARIANT.HULL_RED]) {
    emitBurst(particles, rng, {
      kind: PARTICLE.DEBRIS, x, y, count: scaled(11, reduceMotion), speed: [40, 200], ttl: [4, 14], size: [2.5, 6],
      gravity: 170, drag: 0.3, variant, angle: -Math.PI / 2, spread: Math.PI * 0.85, shrink: 1,
    });
  }
  sparks(env, x, y, 30, 1.5, PALETTE_VARIANT.DEFAULT);
}

/**
 * Применяет события sim. env: { particles, camera, fx, rng, flight, body, reduceMotion,
 * spawnStage(info), startChute(), markCrash(), hudFlash? }.
 */
export function applyEvents(events, env) {
  if (!events || !events.length) return;
  for (const e of events) applyEvent(e, env);
}

function rocketPoint(env, e) {
  const f = env.flight;
  const x = e.x !== undefined ? e.x : f ? f.x : 0;
  const y = e.y !== undefined ? e.y : f ? f.y - 24 : 0;
  return [x, y];
}

function applyEvent(e, env) {
  const { particles, camera, fx, rng } = env;
  const f = env.flight;
  switch (e.type) {
    case 'liftoff':
      groundDust(env, e.x ?? 0, 22, 1.4);
      emitBurst(particles, rng, {
        kind: PARTICLE.STEAM, x: e.x ?? 0, y: -4, count: scaled(14, env.reduceMotion), speed: [10, 60], ttl: [0.8, 1.8], size: [5, 10],
        gravity: -8, drag: 1.2, angle: -Math.PI / 2, spread: Math.PI * 0.8, shrink: 2,
      });
      camera.addTrauma(0.4);
      break;
    case 'stage-sep': {
      env.spawnStage(e);
      const x = e.x ?? (f ? f.x : 0);
      const y = e.y ?? (f ? f.y : 0);
      sparks(env, x, y - 20, 14, 0.9, PALETTE_VARIANT.DEFAULT);
      emitBurst(particles, rng, {
        kind: PARTICLE.SMOKE, x, y: y - 10, count: scaled(8, env.reduceMotion), speed: [6, 28], ttl: [0.6, 1.2], size: [4, 8],
        gravity: 0, drag: 1.5, angle: -Math.PI / 2, spread: Math.PI, shrink: 1.8,
      });
      camera.addTrauma(0.35);
      flash(env, 0.18, 255, 244, 220);
      break;
    }
    case 'fuel-empty':
    case 'thrust-cut': {
      const [x, y] = rocketPoint(env, { x: f ? f.x : 0, y: f ? f.y : 0 });
      emitBurst(particles, rng, {
        kind: PARTICLE.SMOKE, x, y: y + 2, count: scaled(6, env.reduceMotion), speed: [4, 20], ttl: [0.5, 1.1], size: [3, 6],
        gravity: 0, drag: 1.6, angle: Math.PI / 2, spread: 0.9, shrink: 1.8,
      });
      break;
    }
    case 'pickup': {
      const [x, y] = rocketPoint(env, e);
      const variant = e.kind === 'coin' ? PALETTE_VARIANT.GOLD : e.kind === 'fuel' ? PALETTE_VARIANT.GREEN : PALETTE_VARIANT.CYAN;
      emitBurst(particles, rng, {
        kind: PARTICLE.GLINT, x, y, count: scaled(e.kind === 'coin' ? 7 : 12, env.reduceMotion), speed: [18, 60], ttl: [0.3, 0.7],
        size: [1.5, 3], gravity: -10, drag: 1.4, variant, angle: -Math.PI / 2, spread: Math.PI, shrink: 0.3,
      });
      break;
    }
    case 'ring': {
      const [x, y] = rocketPoint(env, e);
      const half = e.halfWidth || 40;
      const variant = e.quality === 'center' ? PALETTE_VARIANT.GOLD : PALETTE_VARIANT.CYAN;
      // Горизонтальное кольцо: вспышка бежит по его кромке наружу (эллипс, а не круг).
      const count = scaled(26, env.reduceMotion);
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2;
        particles.emit(
          PARTICLE.GLINT, x + Math.cos(a) * half * 0.82, y + Math.sin(a) * half * 0.3,
          Math.cos(a) * 46, Math.sin(a) * 14 - 6, 0.45 + (i % 3) * 0.08, 2.4, 0.6, 0, 1.2, variant,
        );
      }
      particles.emit(PARTICLE.FLASH, x, y, 0, 0, 0.35, 8, 40, 0, 0, variant);
      if (env.ringFx) env.ringFx.trigger(e, env.flight && Number.isFinite(env.flight.x) ? env.flight.x : x, env.era, env.reduceMotion);
      camera.addTrauma(e.quality === 'center' ? 0.18 : 0.1);
      break;
    }
    case 'near-miss':
      camera.addTrauma(0.1);
      break;
    case 'hit': {
      const [x, y] = f ? [f.x, f.y - 26] : rocketPoint(env, e);
      sparks(env, x, y, 18, 1.1, PALETTE_VARIANT.DEFAULT);
      emitBurst(particles, rng, {
        kind: PARTICLE.DEBRIS, x, y, count: scaled(6, env.reduceMotion), speed: [20, 90], ttl: [0.8, 1.6], size: [2, 4],
        gravity: 170, drag: 0.3, angle: -Math.PI / 2, spread: Math.PI, shrink: 1,
      });
      camera.addTrauma(clamp(0.35 + (e.damage || 10) * 0.012, 0.35, 0.8));
      flash(env, 0.28, 255, 90, 70);
      break;
    }
    case 'storm':
      if (e.phase === 'lightning') flash(env, 0.5, 235, 240, 255);
      break;
    case 'parachute': {
      env.startChute();
      const [x, y] = f ? [f.x, f.y - 30] : rocketPoint(env, e);
      emitBurst(particles, rng, {
        kind: PARTICLE.STEAM, x, y, count: scaled(9, env.reduceMotion), speed: [8, 30], ttl: [0.5, 1], size: [4, 8],
        gravity: 0, drag: 1.6, angle: -Math.PI / 2, spread: Math.PI, shrink: 1.8,
      });
      camera.addTrauma(0.15);
      break;
    }
    case 'transfer-start':
      flash(env, 0.5, 215, 235, 255);
      camera.addTrauma(0.5);
      break;
    case 'transfer-done':
      flash(env, 0.7, 235, 245, 255);
      camera.addTrauma(0.3);
      break;
    case 'touch': {
      const x = e.x ?? (f ? f.x : 0);
      groundDust(env, x, e.ok === false ? 26 : 14, e.ok === false ? 1.5 : 1);
      if (e.ok === false) sparks(env, x, -4, 16, 1.2, PALETTE_VARIANT.DEFAULT);
      camera.addTrauma(e.ok === false ? 0.5 : 0.25);
      fx.slowmo = Math.max(fx.slowmo, 0.3);
      break;
    }
    case 'landed':
      if (e.perfect) {
        const x = f ? f.x : 0;
        emitBurst(particles, rng, {
          kind: PARTICLE.CONFETTI, x, y: -34, count: scaled(40, env.reduceMotion), speed: [40, 140], ttl: [1.2, 2.4], size: [2, 3.5],
          gravity: 90, drag: 0.5, angle: -Math.PI / 2, spread: Math.PI * 0.6, shrink: 0.8,
        });
        flash(env, 0.2, 255, 240, 190);
      }
      break;
    case 'crashed': {
      const x = e.x ?? (f ? f.x : 0);
      const y = (e.y ?? (f ? f.y : 0)) - 22;
      explosion(env, x, y);
      camera.addTrauma(1);
      flash(env, 0.8, 255, 210, 150);
      fx.slowmo = Math.max(fx.slowmo, 0.6);
      env.markCrash(x, y);
      break;
    }
    default:
      break;
  }
}
