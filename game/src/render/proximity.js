// Тряска при очень близком пролёте мимо помехи (самолёт, шар, астероид, обломки, спутник): короткий слабый толчок камеры.
// Сильная тряска остаётся только за удары (событие hit). Кольца не считаются помехой.
//
// Толчок срабатывает один раз на сближение с объектом, в момент наибольшего приближения: пока расстояние до края объекта
// меньше PROXIMITY_RANGE, считаем минимум расстояния и максимум относительной скорости, а когда объект начинает уходить,
// выдаём толчок. Если столкновение случилось (объект исчез или расстояние упало до контакта), толчка нет — это удар.
// Повторно объект включается в игру только после того, как отошёл дальше PROXIMITY_REARM.

import { clamp, smoothstep } from './util.js';

/** Центр круга столкновения ракеты выше стоп (sim/rocket.js ROCKET_AXIS_OFFSET) и его радиус (ROCKET_RADIUS). */
export const ROCKET_CENTER_OFFSET = 26;
export const ROCKET_HIT_RADIUS = 12;
/** Размер ракеты для порога сближения: высота спрайта в мире (ROCKET_SIZE.coreH ~ 60 ед.). */
export const ROCKET_SIZE_UNITS = 60;
/** Толчок включается, когда расстояние от центра ракеты до объекта меньше его радиуса плюс столько (1,3 размера ракеты). */
export const PROXIMITY_RANGE = 1.3 * ROCKET_SIZE_UNITS;
/** Объект снова «взводится», когда отошёл от ракеты дальше радиуса плюс этот зазор (гистерезис). */
export const PROXIMITY_REARM = PROXIMITY_RANGE * 1.5;
/** Помехи, которые дают толчок; кольца, монеты и предметы — нет. */
export const PROXIMITY_KINDS = new Set(['plane', 'balloon', 'asteroid', 'debris', 'satellite']);

/** Сила толчка 0..1 по самому тесному сближению (closeness 0..1) и относительной скорости (ед./с). Максимум ~0,75: слабый. */
export function proximityKick(closeness, relativeSpeed) {
  const near = clamp(closeness, 0, 1);
  const fast = smoothstep(40, 260, Math.max(0, relativeSpeed));
  return clamp(0.18 + 0.38 * near + 0.22 * fast, 0, 0.75);
}

/**
 * Следит за сближением ракеты с помехами. update(flight, objects, dt, onKick): onKick(strength) вызывается не чаще раза на
 * сближение с объектом. Состояние по id объекта хранится во внутренней таблице и чистится, когда объект исчез.
 */
export function createProximity() {
  const tracked = new Map();
  const previous = new Map(); // положение прошлого кадра для объектов без vx/vy
  const seen = new Set();

  function objectVelocity(o, dt, out) {
    if (Number.isFinite(o.vx) && Number.isFinite(o.vy)) {
      out.x = o.vx;
      out.y = o.vy;
      return out;
    }
    const last = previous.get(o.id);
    out.x = last && dt > 0 ? (o.x - last.x) / dt : 0;
    out.y = last && dt > 0 ? (o.y - last.y) / dt : 0;
    return out;
  }

  const velocity = { x: 0, y: 0 };

  return {
    /** Сколько объектов сейчас отслеживается (для тестов). */
    get size() {
      return tracked.size;
    },

    reset() {
      tracked.clear();
      previous.clear();
    },

    update(flight, objects, dt, onKick) {
      if (!flight || !objects || dt <= 0) return;
      const live = flight.phase === 'ascent' || flight.phase === 'descent' || flight.phase === 'space';
      const angle = flight.angle || 0;
      const cx = flight.x + Math.sin(angle) * ROCKET_CENTER_OFFSET;
      const cy = flight.y - Math.cos(angle) * ROCKET_CENTER_OFFSET;
      seen.clear();
      for (const o of objects) {
        if (!o.active || !PROXIMITY_KINDS.has(o.kind)) continue;
        seen.add(o.id);
        const radius = o.r ?? 30;
        const d = Math.hypot(o.x - cx, o.y - cy);
        const edge = d - radius; // расстояние от центра ракеты до края объекта
        let state = tracked.get(o.id);
        if (!state) {
          state = { inside: false, fired: false, min: Infinity, speed: 0 };
          tracked.set(o.id, state);
        }
        if (live) {
          objectVelocity(o, dt, velocity);
          const relative = Math.hypot((flight.vx || 0) - velocity.x, (flight.vy || 0) - velocity.y);
          const contact = d < radius + ROCKET_HIT_RADIUS;
          if (state.fired) {
            if (edge > PROXIMITY_REARM) {
              state.fired = false;
              state.inside = false;
              state.min = Infinity;
              state.speed = 0;
            }
          } else if (contact) {
            // удар: сильную тряску даёт событие hit, этот проход толчком не считается
            state.fired = true;
            state.inside = false;
          } else if (edge < PROXIMITY_RANGE) {
            state.inside = true;
            state.min = Math.min(state.min, edge);
            state.speed = Math.max(state.speed, relative);
            // объект начал уходить после самого тесного места: толчок
            if (edge > state.min + 3) {
              const closeness = 1 - (state.min - ROCKET_HIT_RADIUS) / (PROXIMITY_RANGE - ROCKET_HIT_RADIUS);
              state.fired = true;
              state.inside = false;
              onKick(proximityKick(closeness, state.speed));
            }
          } else if (state.inside) {
            // вышел за порог, не успев «уйти» заметно: считаем это проходом по минимуму
            const closeness = 1 - (state.min - ROCKET_HIT_RADIUS) / (PROXIMITY_RANGE - ROCKET_HIT_RADIUS);
            state.fired = true;
            state.inside = false;
            onKick(proximityKick(closeness, state.speed));
          }
        }
        previous.set(o.id, { x: o.x, y: o.y });
      }
      // объекты, которых больше нет в списке (в том числе сбитые ударом), забываем без толчка
      for (const id of tracked.keys()) {
        if (!seen.has(id)) {
          tracked.delete(id);
          previous.delete(id);
        }
      }
    },
  };
}
