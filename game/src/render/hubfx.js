// Эффекты хаба: стройка здания (леса, пыль, искры, поднимающиеся блоки, вспышка), фейерверк новой эпохи,
// пар у площадки. Частицы лежат в общем пуле (particles.js), поэтому без аллокаций в кадре.

import { PALETTE_VARIANT, PARTICLE, createParticles } from './particles.js';
import { clamp, createRng, lerp, smoothstep } from './util.js';

export const BUILD_DURATION = 1.2; // секунд: леса, блоки, вспышка
export const ERA_DURATION = 3.2; // секунд: старты зарядов (последний залп ещё ~2,5 с догорает)
const TAIL_SECONDS = 2.4; // сколько после конца события анимация считается идущей (искры догорают)
const REVEAL_END = 1.0; // к этому моменту здание полностью «построено»
const FIREWORK_TIMES = [0.1, 0.4, 0.65, 0.95, 1.2, 1.5, 1.85, 2.2, 2.6];
const SHELL_RISE = 0.5; // с: заряд поднимается до места залпа
const FIREWORK_COLORS = [PALETTE_VARIANT.GOLD, PALETTE_VARIANT.CYAN, PALETTE_VARIANT.RED, PALETTE_VARIANT.GREEN, PALETTE_VARIANT.DEFAULT];

/** Состояние стройки по времени t (с): reveal 0..1 — какая доля здания уже выстроена, scaffold — прозрачность лесов. */
export function buildProgress(t, reduce = false) {
  if (t >= BUILD_DURATION) return { reveal: 1, scaffold: 0, done: true };
  const span = reduce ? 0.45 : REVEAL_END;
  const x = clamp(t / span, 0, 1);
  const reveal = x * x * (3 - 2 * x);
  const scaffold = reduce ? (t < span ? 1 : 0) : 1 - smoothstep(REVEAL_END - 0.05, BUILD_DURATION, t);
  return { reveal, scaffold, done: false };
}

export function createHubFx() {
  const particles = createParticles(1024);
  const rng = createRng(0x9b3d);
  const builds = [];
  const state = { era: null, eraPulse: 0, tail: 0 };
  const shells = []; // взлетающие заряды фейерверка: { x0, y0, x1, y1, t, variant }

  function geometryOf(entry, geom) {
    return geom ? geom(entry.key) : null;
  }

  return {
    particles,

    /** Запускает стройку: время отсчитывается от первого update после вызова. */
    playBuild(key) {
      const existing = builds.find((b) => b.key === key);
      if (existing) {
        existing.t = 0;
        existing.flashed = false;
        return;
      }
      builds.push({ key, t: 0, flashed: false, dust: 0, sparks: 0 });
    },

    playEra() {
      state.era = { t: 0, fired: 0 };
      state.eraPulse = 1;
    },

    /** Идёт стройка или праздник (плюс 2,4 с, пока догорают искры). Пар у площадки сюда не входит: он идёт всегда. */
    get active() {
      return builds.length > 0 || state.era !== null || state.tail > 0;
    },

    /** Прогресс стройки здания key (или null, если оно не строится). */
    buildState(key, reduce) {
      const build = builds.find((b) => b.key === key);
      return build ? { ...buildProgress(build.t, reduce), t: build.t } : null;
    },

    /** Накал огней эпохи 0..1 (затухает за ERA_DURATION): лампы построек и памятника вспыхивают. */
    get eraPulse() {
      return state.eraPulse;
    },

    /**
     * Шаг эффектов. geom(key) -> [{ x, y, w, h }] (ед. мира, y — низ) для построек в стройке;
     * view — { left, right, top, bottom } видимая область карты для фейерверка.
     */
    update(dt, reduce, geom, view) {
      if (dt > 0) {
        for (let i = builds.length - 1; i >= 0; i--) {
          const build = builds[i];
          build.t += dt;
          const boxes = geometryOf(build, geom);
          if (boxes) this.emitBuild(build, boxes, dt, reduce);
          if (build.t >= BUILD_DURATION + 0.05) builds.splice(i, 1);
        }
        if (state.era) this.updateEra(dt, reduce, view);
        if (shells.length > 0) this.stepShells(dt);
        state.tail = builds.length > 0 || state.era || shells.length > 0 ? TAIL_SECONDS : Math.max(0, state.tail - dt);
        state.eraPulse = state.era ? clamp(1 - state.era.t / ERA_DURATION, 0, 1) : state.eraPulse * Math.exp(-dt * 2);
        particles.update(dt, null);
      }
    },

    emitBuild(build, boxes, dt, reduce) {
      const progress = buildProgress(build.t, reduce);
      const scale = reduce ? 0.35 : 1;
      for (const box of boxes) {
        build.dust += dt * 64 * scale * (progress.done ? 0 : 1);
        while (build.dust >= 1) {
          build.dust -= 1;
          const side = rng() < 0.5 ? -1 : 1;
          particles.emit(
            PARTICLE.DUST, box.x + (rng() - 0.5) * box.w * 0.9, box.y - rng() * 3,
            side * (4 + rng() * 14), -(3 + rng() * 14), 0.6 + rng() * 0.6, 3, 9, -2, 1.3, 0,
          );
        }
        if (!reduce && build.t < REVEAL_END) {
          build.sparks += dt * 30;
          while (build.sparks >= 1) {
            build.sparks -= 1;
            const edge = box.y - box.h * progress.reveal;
            particles.emit(
              PARTICLE.SPARK, box.x + (rng() - 0.5) * box.w * 0.8, edge,
              (rng() - 0.5) * 50, -(14 + rng() * 40), 0.4 + rng() * 0.4, 2, 0.8, 110, 0.5,
              rng() < 0.5 ? PALETTE_VARIANT.GOLD : PALETTE_VARIANT.DEFAULT,
            );
          }
        }
        if (!build.flashed && build.t >= REVEAL_END) {
          build.flashed = true;
          if (!reduce) this.finishFlash(box);
        }
      }
    },

    /** Вспышка по завершении: яркий круг и кольцо искр от здания. */
    finishFlash(box) {
      const cy = box.y - box.h * 0.5;
      particles.emit(PARTICLE.FLASH, box.x, cy, 0, 0, 0.45, 10, Math.max(36, box.w * 0.8), 0, 0, PALETTE_VARIANT.GOLD);
      particles.emit(PARTICLE.FLASH, box.x, cy, 0, 0, 0.3, 6, Math.max(22, box.w * 0.5), 0, 0, PALETTE_VARIANT.DEFAULT);
      for (let i = 0; i < 22; i++) {
        const a = (i / 22) * Math.PI * 2;
        particles.emit(
          PARTICLE.GLINT, box.x + Math.cos(a) * box.w * 0.3, cy + Math.sin(a) * box.h * 0.3,
          Math.cos(a) * 46, Math.sin(a) * 40 - 10, 0.5 + rng() * 0.3, 2.4, 0.6, 20, 1, PALETTE_VARIANT.GOLD,
        );
      }
    },

    updateEra(dt, reduce, view) {
      const era = state.era;
      era.t += dt;
      while (era.fired < FIREWORK_TIMES.length && era.t >= FIREWORK_TIMES[era.fired]) {
        if (!reduce && view) this.launch(era.fired, view);
        era.fired++;
      }
      if (era.t >= ERA_DURATION) state.era = null;
    },

    /** Взлёт заряда фейерверка: светящаяся точка с дымным следом летит к месту залпа SHELL_RISE секунд. */
    launch(index, view) {
      const w = view.right - view.left;
      const h = view.bottom - view.top;
      const x1 = view.left + w * (0.14 + 0.72 * ((index * 0.37 + 0.11) % 1));
      const y1 = view.top + h * (0.12 + 0.34 * ((index * 0.61 + 0.2) % 1));
      shells.push({
        x0: x1 + (index % 2 ? 24 : -24), y0: y1 + h * 0.34, x1, y1, t: 0, index,
        variant: FIREWORK_COLORS[index % FIREWORK_COLORS.length], h,
      });
    },

    stepShells(dt) {
      for (let i = shells.length - 1; i >= 0; i--) {
        const shell = shells[i];
        shell.t += dt;
        const k = clamp(shell.t / SHELL_RISE, 0, 1);
        const e = 1 - (1 - k) * (1 - k);
        const x = lerp(shell.x0, shell.x1, e);
        const y = lerp(shell.y0, shell.y1, e);
        particles.emit(PARTICLE.GLINT, x, y, 0, 0, 0.12, 3.2, 1.2, 0, 0, PALETTE_VARIANT.GOLD);
        particles.emit(PARTICLE.TRAIL, x + (rng() - 0.5) * 2, y + 2, (rng() - 0.5) * 6, 14, 0.5, 2.6, 0.6, 0, 0.8, 0);
        if (k >= 1) {
          this.burst(shell.index, { left: shell.x1, right: shell.x1, top: shell.y1, bottom: shell.y1 }, shell.h);
          shells.splice(i, 1);
        }
      }
    },

    /** Залп фейерверка в точке (view.left, view.top): вспышка и два кольца искр (внешнее и внутреннее), искры оседают дугой. */
    burst(index, view, height) {
      const x = view.left;
      const y = view.top;
      const variant = FIREWORK_COLORS[index % FIREWORK_COLORS.length];
      const other = FIREWORK_COLORS[(index + 2) % FIREWORK_COLORS.length];
      particles.emit(PARTICLE.FLASH, x, y, 0, 0, 0.32, 8, 40, 0, 0, variant);
      particles.emit(PARTICLE.FLASH, x, y, 0, 0, 0.2, 5, 22, 0, 0, PALETTE_VARIANT.DEFAULT);
      const speed = clamp(height * 0.3, 70, 150);
      for (let i = 0; i < 40; i++) {
        const a = (i / 40) * Math.PI * 2 + rng() * 0.12;
        const v = speed * (0.85 + rng() * 0.3);
        particles.emit(PARTICLE.SPARK, x, y, Math.cos(a) * v, Math.sin(a) * v, 1.5 + rng() * 0.7, 4, 1, 34, 1.15, variant);
      }
      for (let i = 0; i < 20; i++) {
        const a = (i / 20) * Math.PI * 2 + 0.15 + rng() * 0.2;
        const v = speed * 0.5 * (0.85 + rng() * 0.3);
        particles.emit(PARTICLE.SPARK, x, y, Math.cos(a) * v, Math.sin(a) * v, 1.3 + rng() * 0.6, 3.2, 0.8, 30, 1.3, other);
      }
    },

    /** Пар и дым: вызывается каждый кадр с точками выхода (ед. мира) и силой 0..1. */
    steam(dt, vents, strength) {
      if (dt <= 0 || strength <= 0) return;
      for (const vent of vents) {
        vent.acc = (vent.acc || 0) + dt * vent.rate * strength;
        while (vent.acc >= 1) {
          vent.acc -= 1;
          particles.emit(
            vent.smoke ? PARTICLE.SMOKE : PARTICLE.STEAM, vent.x + (rng() - 0.5) * 3, vent.y,
            (rng() - 0.5) * 5 + (vent.drift || 0), -(7 + rng() * 6), 1.6 + rng() * 1.2, 2.2, 8, -2, 0.7,
            vent.smoke ? PALETTE_VARIANT.BLACK_SMOKE : 0,
          );
        }
      }
    },

    draw(ctx, view, layer) {
      particles.draw(ctx, view, layer);
    },
  };
}

/**
 * Строительные леса вокруг постройки (ед. мира, y вниз, низ по центру): вертикальные стойки, настилы и раскосы,
 * растут вместе со зданием. alpha — прозрачность (гаснут к концу стройки).
 */
export function drawScaffold(ctx, view, box, reveal, alpha, time) {
  if (alpha <= 0.02) return;
  const s = view.S;
  const half = box.w * 0.5 + 4;
  const top = Math.min(box.h + 8, box.h * reveal + 12);
  const x0 = view.sx(box.x - half);
  const x1 = view.sx(box.x + half);
  const yBottom = view.sy(box.y);
  const yTop = view.sy(box.y - top);
  const pole = Math.max(2, Math.round(1.8 * s));
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.fillStyle = '#4a3622';
  ctx.fillRect(x0 - 1, yTop, pole + 2, yBottom - yTop);
  ctx.fillRect(x1 - pole - 1, yTop, pole + 2, yBottom - yTop);
  ctx.fillStyle = '#9a7242';
  ctx.fillRect(x0, yTop, pole, yBottom - yTop);
  ctx.fillRect(x1 - pole, yTop, pole, yBottom - yTop);
  const step = Math.max(10, 13 * s);
  ctx.strokeStyle = '#7a5a34';
  ctx.lineWidth = Math.max(1, Math.round(0.9 * s));
  ctx.beginPath();
  let flip = false;
  for (let y = yBottom; y - step > yTop; y -= step) {
    ctx.moveTo(x0 + pole, flip ? y : y - step);
    ctx.lineTo(x1 - pole, flip ? y - step : y);
    flip = !flip;
  }
  ctx.stroke();
  ctx.fillStyle = '#b08850';
  for (let y = yBottom - step; y > yTop; y -= step) ctx.fillRect(x0, y, x1 - x0, Math.max(2, Math.round(1.6 * s)));
  // блоки поднимаются по лесам к кромке стройки
  for (let i = 0; i < 4; i++) {
    const phase = (time * 2.4 + i * 0.27) % 1;
    const x = lerp(x0 + pole, x1 - pole - Math.round(7 * s), (i % 2 ? 0.7 : 0.15));
    const y = lerp(yBottom - Math.round(5 * s), yTop, phase);
    ctx.fillStyle = '#2a2c31';
    ctx.fillRect(x - 1, y - 1, Math.round(7 * s) + 2, Math.round(5 * s) + 2);
    ctx.fillStyle = i % 2 ? '#c98a2e' : '#8aa0ad';
    ctx.fillRect(x, y, Math.round(7 * s), Math.round(5 * s));
  }
  ctx.restore();
}
