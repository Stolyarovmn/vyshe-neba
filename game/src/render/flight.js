// Отрисовка полёта: небо по высоте, дальний план с параллаксом, поверхность тела, объекты sim,
// ракета со ступенями, пламенем и парашютом, частицы, накладки. Читает FlightState (ARCHITECTURE §6),
// сам ничего не меняет в нём.

import { createCamera, createView } from './camera.js';
import { applyEvents, createScreenFx } from './events.js';
import { drawIsland, drawOcean, drawTerrain } from './ground.js';
import { drawPlacedBuildings } from './buildings.js';
import { drawLaunchTable } from './launchpad.js';
import { drawObjects, drawRadarMarks } from './objects.js';
import {
  drawFlash, drawLandingZone, drawPadPointer, drawPredict, drawSpeedLines, drawTransferWarp,
} from './overlays.js';
import { PALETTE_VARIANT, PARTICLE, createParticles } from './particles.js';
import {
  ROCKET_SIZE, createRocketPose, drawChute, drawRocket, nozzleOffset, stackHeight,
} from './rocket.js';
import {
  CLOUD_LAYERS_FLIGHT, drawClouds, drawLimb, drawRain, drawSky, drawSkyBodies, drawStars, drawSun,
} from './sky.js';
import { ensureWorld } from './layout.js';
import { spriteName } from './manifest.js';
import { clamp, createRng, lerp, smoothstep } from './util.js';
import { weatherMood } from './weather.js';

const TRANSFER_TIME = 3.5; // секунд манёвра в sim (TRANSFER_TIME)
const CHUTE_OPEN_TIME = 1.1;
const CHUTE_FOLD_TIME = 0.7;
const BODY_GRAVITY = { earth: 45, moon: 9, mars: 20 };
const PIECE_COUNT = 10;
const CAMERA_JUMP = 1500;

function activeStageId(flight) {
  const stages = flight.stages;
  if (!stages || !stages.length) return 'core';
  const stage = stages[Math.min(flight.stageIndex | 0, stages.length - 1)];
  return stage ? stage.id : 'core';
}

function makePieces() {
  return Array.from({ length: PIECE_COUNT }, () => ({
    active: false, base: 'booster', era: 0, h: 36, x: 0, y: 0, vx: 0, vy: 0, angle: 0, av: 0, life: 0, trail: 0, hue: 0, rest: 0,
  }));
}

export function createFlightRenderer(painter, shared) {
  const camera = createCamera();
  const view = createView();
  const particles = createParticles(900);
  const fx = createScreenFx();
  const rng = createRng(0x51f7);
  const pose = createRocketPose();
  const pieces = makePieces();
  const target = { x: 0, y: 0, vx: 0, vy: 0, alt: 0 };
  const anchorDev = { x: 0, y: 0 };
  const mood = { cloud: 0, rain: 0, storm: 0, wind: 0, dust: 0, flash: 0 };
  const state = {
    flight: null,
    lastTime: null,
    lastX: 0,
    lastY: 0,
    body: 'earth',
    era: 0,
    skin: 'classic',
    reduce: false,
    chuteT: 0,
    chuteStarted: false,
    endT: 0,
    crashed: false,
    crashX: 0,
    crashY: 0,
    crashT: 0,
    acc: { flame: 0, smoke: 0, ground: 0, damage: 0, water: 0 },
  };

  function resetState(flight) {
    state.flight = flight;
    state.lastTime = null;
    state.chuteT = 0;
    state.chuteStarted = false;
    state.endT = 0;
    state.crashed = false;
    state.crashT = 0;
    state.body = flight && flight.body ? flight.body : 'earth';
    state.acc.flame = state.acc.smoke = state.acc.ground = state.acc.damage = state.acc.water = 0;
    particles.clear();
    for (const piece of pieces) piece.active = false;
    camera.reset();
    fx.flash = 0;
    fx.slowmo = 0;
  }

  const env = {
    particles,
    camera,
    fx,
    rng,
    flight: null,
    body: 'earth',
    reduceMotion: false,
    spawnStage(e) {
      spawnPiece(e);
    },
    startChute() {
      state.chuteStarted = true;
    },
    markCrash(x, y) {
      state.crashed = true;
      state.crashX = x;
      state.crashY = y;
      state.crashT = 0;
    },
  };

  function spawnPiece(e) {
    const piece = pieces.find((p) => !p.active) || pieces[0];
    const base = e.stage === 'capsule' ? 'capsule' : e.stage === 'booster' ? 'booster' : 'core';
    const h = base === 'booster' ? ROCKET_SIZE.boosterH : base === 'capsule' ? ROCKET_SIZE.capsuleH : ROCKET_SIZE.coreH;
    const angle = e.angle || 0;
    const flight = state.flight;
    const x = e.x !== undefined ? e.x : flight ? flight.x : 0;
    const y = e.y !== undefined ? e.y : flight ? flight.y : 0;
    // Центр отделившейся ступени; её опора — исходная точка ракеты.
    piece.active = true;
    piece.base = base;
    piece.era = state.era;
    piece.h = h;
    piece.hue = 0;
    piece.x = x + Math.sin(angle) * h * 0.5;
    piece.y = y - Math.cos(angle) * h * 0.5;
    // Лёгкий толчок вниз по оси ракеты: ступень остаётся позади.
    piece.vx = (e.vx || 0) - Math.sin(angle) * 14 + (rng() - 0.5) * 8;
    piece.vy = (e.vy || 0) + Math.cos(angle) * 14;
    piece.angle = angle;
    piece.av = (rng() - 0.5) * 1.6;
    piece.life = 0;
    piece.trail = 0;
    piece.rest = 0;
  }

  function updatePieces(dt) {
    const g = BODY_GRAVITY[state.body] || 20;
    for (const piece of pieces) {
      if (!piece.active) continue;
      piece.life += dt;
      if (piece.rest > 0) {
        piece.rest += dt;
        if (piece.rest > 5) piece.active = false;
        continue;
      }
      piece.vy += g * dt;
      piece.x += piece.vx * dt;
      piece.y += piece.vy * dt;
      piece.angle += piece.av * dt;
      piece.trail += dt * 26;
      while (piece.trail >= 1) {
        piece.trail -= 1;
        particles.emit(PARTICLE.TRAIL, piece.x, piece.y, piece.vx * 0.2, piece.vy * 0.2, 0.6 + rng() * 0.4, 3.5, 1, 0, 1.5, 0);
        if (rng() < 0.4) particles.emit(PARTICLE.SMOKE, piece.x, piece.y, rng() * 6 - 3, -4, 1.1, 3, 8, 0, 1, 0);
      }
      const bottom = piece.y + piece.h * 0.5;
      if (bottom >= 0) {
        piece.y = -piece.h * 0.5;
        piece.vx = piece.vy = 0;
        piece.av = 0;
        piece.angle = Math.sign(piece.angle || 1) * 1.45;
        piece.rest = 0.01;
        for (let i = 0; i < 12; i++) {
          const a = -Math.PI / 2 + (rng() - 0.5) * 2.4;
          particles.emit(PARTICLE.SPARK, piece.x, -2, Math.cos(a) * (30 + rng() * 60), Math.sin(a) * (30 + rng() * 60), 0.5, 2, 0.8, 140, 0.6, 0);
        }
        camera.addTrauma(0.2);
      } else if (piece.life > 16) {
        piece.active = false;
      }
    }
  }

  function drawPieces(ctx) {
    for (const piece of pieces) {
      if (!piece.active) continue;
      if (piece.x < view.left - 80 || piece.x > view.right + 80 || piece.y < view.top - 80 || piece.y > view.bottom + 80) continue;
      painter.sprite(ctx, view, spriteName(piece.base, piece.era), piece.x, piece.y, {
        h: piece.h, ax: 0.5, ay: 0.5, angle: piece.angle, hue: piece.hue,
      });
    }
  }

  // --- непрерывные эффекты --------------------------------------------------------------------

  function emitExhaust(flight, dt) {
    if (!pose.visible || pose.throttle < 0.05 || dt <= 0) return;
    const reduce = state.reduce ? 0.6 : 1;
    const sin = Math.sin(pose.angle);
    const cos = Math.cos(pose.angle);
    const off = nozzleOffset(pose.kind) + 1;
    const nx = pose.x - sin * off;
    const ny = pose.y + cos * off;
    const dirX = -sin;
    const dirY = cos;
    const perpX = cos;
    const perpY = sin;
    const vac = 1 - pose.atmo;
    const scale = pose.kind === 'capsule' ? 0.55 : 1;
    const plasma = vac > 0.55 || state.era >= 4;
    state.acc.flame += dt * (45 + 140 * pose.throttle) * reduce * scale;
    while (state.acc.flame >= 1) {
      state.acc.flame -= 1;
      const speed = 55 + rng() * 45 + (pose.boost ? 30 : 0);
      const lateral = (rng() * 2 - 1) * lerp(8, 2.2, vac);
      const spawn = (rng() * 2 - 1) * 2 * scale;
      particles.emit(
        PARTICLE.FLAME, nx + perpX * spawn, ny + perpY * spawn,
        flight.vx * 0.6 + dirX * speed + perpX * lateral, flight.vy * 0.6 + dirY * speed + perpY * lateral,
        0.16 + rng() * 0.2, 3.2 * scale, 0.7, 0, 2.4, plasma ? PALETTE_VARIANT.PLASMA : 0,
      );
    }
    if (pose.atmo > 0.3) {
      state.acc.smoke += dt * 32 * pose.throttle * pose.atmo * reduce * scale;
      while (state.acc.smoke >= 1) {
        state.acc.smoke -= 1;
        const speed = 12 + rng() * 22;
        particles.emit(
          PARTICLE.SMOKE, nx + (rng() - 0.5) * 5, ny + dirY * 6,
          flight.vx * 0.5 + dirX * speed + (rng() - 0.5) * 14, flight.vy * 0.5 + dirY * speed + (rng() - 0.5) * 8,
          0.9 + rng() * 0.8, 4 * scale, 12 * scale, -4, 1.1, 0,
        );
      }
    }
  }

  function emitGround(flight, dt, profile) {
    const alt = flight.alt;
    if (!pose.visible || pose.throttle < 0.12 || alt > 60 || dt <= 0) return;
    const reduce = state.reduce ? 0.6 : 1;
    const closeness = 1 - alt / 60;
    state.acc.ground += dt * 95 * pose.throttle * closeness * reduce;
    const body = state.body;
    const kind = body === 'earth' ? PARTICLE.SMOKE : PARTICLE.DUST;
    const variant = body === 'mars' ? PALETTE_VARIANT.MARS_DUST : body === 'moon' ? PALETTE_VARIANT.MOON_DUST : 0;
    while (state.acc.ground >= 1) {
      state.acc.ground -= 1;
      const side = rng() < 0.5 ? -1 : 1;
      particles.emit(
        kind, pose.x + side * (4 + rng() * 6), -1,
        side * (40 + rng() * 110) * (0.5 + pose.throttle * 0.7), -(1 + rng() * 14),
        0.7 + rng() * 1, 4, 13, -3, 1.4, variant,
      );
    }
    if (body === 'earth' && profile && profile.buildings && (profile.buildings.deluge | 0) > 0 && alt < 40) {
      state.acc.water += dt * 60 * reduce;
      while (state.acc.water >= 1) {
        state.acc.water -= 1;
        particles.emit(
          PARTICLE.SPARK, 235 + (rng() - 0.5) * 14, -26, -(50 + rng() * 70), -(30 + rng() * 55),
          0.9, 2.2, 1, 150, 0.2, PALETTE_VARIANT.CYAN,
        );
        if (rng() < 0.25) particles.emit(PARTICLE.STEAM, 20 + rng() * 90, -3, (rng() - 0.5) * 20, -(8 + rng() * 14), 1.4, 5, 13, -4, 1, 0);
      }
    }
  }

  /** Остов тлеет на месте аварии несколько секунд. */
  function emitWreck(dt) {
    if (!state.crashed || dt <= 0) return;
    state.crashT += dt;
    if (state.crashT > 7) return;
    state.acc.damage += dt * 14 * (1 - state.crashT / 7);
    while (state.acc.damage >= 1) {
      state.acc.damage -= 1;
      particles.emit(
        PARTICLE.SMOKE, state.crashX + (rng() - 0.5) * 16, state.crashY + 18, (rng() - 0.5) * 8, -(8 + rng() * 10),
        1.4 + rng(), 4, 12, -2, 0.8, PALETTE_VARIANT.BLACK_SMOKE,
      );
    }
  }

  function emitDamage(flight, dt) {
    const hpFrac = flight.maxHp ? flight.hp / flight.maxHp : 1;
    if (hpFrac >= 0.5 || !pose.visible || dt <= 0) return;
    state.acc.damage += dt * (1 - hpFrac * 2) * 22;
    while (state.acc.damage >= 1) {
      state.acc.damage -= 1;
      const h = stackHeight(pose.kind);
      const sin = Math.sin(pose.angle);
      const cos = Math.cos(pose.angle);
      const along = h * (0.2 + rng() * 0.5);
      particles.emit(
        PARTICLE.SMOKE, pose.x + sin * along, pose.y - cos * along,
        flight.vx * 0.5 + (rng() - 0.5) * 10, flight.vy * 0.5 - 6, 1 + rng() * 0.8, 3, 9, -6, 1, PALETTE_VARIANT.BLACK_SMOKE,
      );
      if (hpFrac < 0.25 && rng() < 0.3) {
        particles.emit(PARTICLE.SPARK, pose.x + sin * along, pose.y - cos * along, (rng() - 0.5) * 50, -20 - rng() * 40, 0.5, 2, 0.8, 140, 0.6, 0);
      }
    }
  }

  // --- кадр ---------------------------------------------------------------------------------------

  function fillPose(flight, dt) {
    const kind = activeStageId(flight);
    pose.kind = kind === 'booster' || kind === 'capsule' ? kind : 'core';
    pose.x = flight.x;
    pose.y = flight.y;
    pose.angle = flight.angle || 0;
    pose.era = state.era;
    pose.skin = state.skin;
    pose.throttle = flight.phase === 'transfer' ? 0.7 : flight.throttle || 0;
    pose.atmo = flight.phase === 'transfer' ? 0 : Math.sqrt(clamp(flight.atmo ?? 1, 0, 1));
    pose.boost = !!(flight.boost && flight.boost.active);
    pose.rcsLeft = flight.rcs ? flight.rcs.left : 0;
    pose.rcsRight = flight.rcs ? flight.rcs.right : 0;
    pose.visible = !(state.crashed || flight.phase === 'crashed');

    const ended = flight.phase === 'landed' || flight.phase === 'crashed';
    if (flight.chute && flight.chute.deployed && !ended) {
      state.chuteT += dt;
      state.endT = 0;
    } else if (ended && state.chuteT > 0) {
      state.endT += dt;
    } else if (!(flight.chute && flight.chute.deployed) && !state.chuteStarted) {
      state.chuteT = 0;
    }
    const open = clamp(state.chuteT / CHUTE_OPEN_TIME, 0, 1);
    pose.chute = ended ? open * (1 - clamp(state.endT / CHUTE_FOLD_TIME, 0, 1)) : open;
    pose.chuteTime = state.chuteT;
    return kind;
  }

  function updateCamera(flight, dt, layout, reduce) {
    target.x = flight.x;
    target.y = flight.y - stackHeight(pose.kind) * 0.5;
    target.vx = flight.vx || 0;
    target.vy = flight.vy || 0;
    target.alt = flight.alt ?? -flight.y;
    camera.reduceMotion = reduce;
    const jumped = Math.hypot(flight.x - state.lastX, flight.y - state.lastY) > CAMERA_JUMP;
    state.lastX = flight.x;
    state.lastY = flight.y;
    if (flight.phase === 'transfer') return;
    if (!camera.ready || jumped || flight.body !== state.body) {
      camera.snap(target, layout);
      state.body = flight.body || 'earth';
    } else {
      camera.update(dt, target, layout, { reduceMotion: reduce });
    }
    const rumble = pose.throttle * pose.atmo * 0.5 + (flight.boost && flight.boost.heat > 0.8 ? 0.45 : 0);
    camera.setRumble(rumble);
  }

  function drawBackdrop(ctx, flight, camAlt, time) {
    const body = flight.body || 'earth';
    drawSky(ctx, view, body, mood, body === 'earth' ? 150 : null);
    const starAlpha = body === 'moon' ? 1 : body === 'mars' ? smoothstep(1200, 4200, camAlt) : smoothstep(3500, 8500, camAlt);
    drawStars(ctx, view, starAlpha, time);
    if (body === 'earth') drawSun(ctx, view, 0.82, 0.12, (1 - smoothstep(600, 3200, camAlt)) * (1 - mood.cloud * 0.7));
    drawSkyBodies(ctx, painter, view, body, camAlt);
    drawLimb(ctx, view, body, camAlt);
    if (body === 'earth') {
      const fade = 1 - smoothstep(2200, 3200, camAlt);
      drawClouds(ctx, painter, view, CLOUD_LAYERS_FLIGHT, time, 0.3 + 0.7 * mood.cloud, mood.wind, mood.storm, fade);
    }
  }

  function drawGround(ctx, flight, profile, time) {
    const body = flight.body || 'earth';
    if (body === 'earth') {
      drawOcean(ctx, view, time, mood);
      drawIsland(ctx, painter, view);
      if (profile) drawPlacedBuildings(ctx, painter, view, profile, time, null);
      drawLaunchTable(ctx, view, state.era);
    } else {
      const pad = flight.pad ? { x: flight.pad.x, w: flight.pad.width || flight.pad.half * 2 } : null;
      drawTerrain(ctx, painter, view, body, state.era, pad, time);
    }
  }

  const draw = (ctx, params) => {
    const { flight, time, layout } = params;
    if (!flight || !layout) return;
    const settings = params.settings || {};
    if (flight !== state.flight) resetState(flight);
    state.reduce = !!settings.reduceMotion;
    env.reduceMotion = state.reduce;
    env.flight = flight;
    env.body = flight.body || 'earth';
    const cfg = flight.cfg || params.config || {};
    state.era = clamp(cfg.era | 0, 0, 5);
    state.skin = cfg.skin || 'classic';
    const profile = params.profile || (shared && shared.profile) || null;

    const world = ensureWorld(layout);
    const canvas = ctx.canvas;
    const devW = canvas.width;
    const devH = canvas.height;
    const dt = params.dt !== undefined
      ? params.dt
      : state.lastTime === null ? 0 : clamp(time - state.lastTime, 0, 0.05);
    state.lastTime = time;

    fillPose(flight, dt);
    updateCamera(flight, dt, layout, state.reduce);
    view.set(camera, layout, world.px, devW, devH);
    weatherMood(flight.weather, mood);
    const camAlt = -view.camY;
    const body = flight.body || 'earth';
    anchorDev.x = view.ax;
    anchorDev.y = view.ay;

    fx.flash = Math.max(0, fx.flash - dt * 2.4);
    fx.slowmo = Math.max(0, fx.slowmo - dt);

    emitExhaust(flight, dt);
    emitGround(flight, dt, profile);
    emitDamage(flight, dt);
    emitWreck(dt);
    updatePieces(dt);
    particles.update(dt, 0);

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;

    if (flight.phase === 'transfer') {
      drawSky(ctx, view, 'moon', mood, null);
      drawStars(ctx, view, 1, time);
      const progress = flight.transfer ? clamp(flight.transfer.t / TRANSFER_TIME, 0, 1) : 0;
      drawTransferWarp(ctx, painter, view, flight.cfg ? flight.cfg.destination : 'moon', progress, time);
      particles.draw(ctx, view, 0);
      drawRocket(ctx, painter, view, pose, time);
      particles.draw(ctx, view, 1);
      drawFlash(ctx, view, fx);
      ctx.restore();
      return;
    }

    drawBackdrop(ctx, flight, camAlt, time);
    drawGround(ctx, flight, profile, time);

    const pad = flight.pad;
    if (pad) {
      const ok = !!(flight.landing && flight.landing.ok) && Math.abs(flight.x - pad.x) <= pad.half;
      drawLandingZone(ctx, view, pad, !!pad.lit, ok, time, flight.alt, (flight.vy || 0) > -5);
      drawPadPointer(ctx, view, pad, view.ay, time);
    }
    if (mood.rain > 0.05 && camAlt < 2400) drawRain(ctx, view, time, mood.rain, mood.wind);
    drawPredict(ctx, view, flight.predict, time);
    drawObjects(ctx, painter, view, flight.objects, state.era, time);
    drawRadarMarks(ctx, view, flight.objects, time, anchorDev);

    particles.draw(ctx, view, 0);
    drawPieces(ctx);
    drawRocket(ctx, painter, view, pose, time);
    drawChute(ctx, painter, view, pose, time);
    particles.draw(ctx, view, 1);

    drawSpeedLines(ctx, view, flight.vx || 0, flight.vy || 0, flight.atmo ?? 1, time);
    if (mood.dust > 0.05 && body === 'mars') {
      ctx.fillStyle = `rgba(190,110,70,${(0.28 * mood.dust).toFixed(2)})`;
      ctx.fillRect(0, 0, devW, devH);
    }
    if (mood.storm > 0.3) {
      ctx.fillStyle = `rgba(18,26,40,${(0.16 * mood.storm).toFixed(2)})`;
      ctx.fillRect(0, 0, devW, devH);
    }
    if (mood.flash > 0 && !state.reduce) {
      ctx.fillStyle = `rgba(235,240,255,${Math.min(0.55, mood.flash * 7).toFixed(2)})`;
      ctx.fillRect(0, 0, devW, devH);
    }
    drawFlash(ctx, view, fx);
    ctx.restore();
  };

  return {
    camera,
    particles,
    fx,
    pose,
    view,

    /** Начало полёта: сбрасывает камеру, частицы и отделённые ступени. */
    start(flight) {
      resetState(flight || null);
    },

    reset() {
      resetState(null);
    },

    /** События sim -> частицы, тряска, вспышки. flight (необязательно) — для позиции эффектов. */
    events(list, flight) {
      if (flight) {
        state.flight = flight;
        env.flight = flight;
        env.body = flight.body || 'earth';
      }
      applyEvents(list, env);
    },

    /** Рекомендуемый множитель времени (замедление в момент касания/аварии); 1 — без замедления. */
    get timeScale() {
      return fx.slowmo > 0 && !state.reduce ? 0.4 : 1;
    },

    draw,
  };
}
