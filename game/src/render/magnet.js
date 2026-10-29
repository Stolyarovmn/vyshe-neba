// Магнит-расходник: пока он включён в полёте (cfg.consumables.magnet), вокруг ракеты едва заметно течёт магнитное поле:
// тонкие силовые линии диполя от «полюсов» у носа и кормы по обе стороны. Холодный голубой у «экватора», тёплый оранжевый
// у полюсов, альфа 0,08..0,18, линии медленно «текут», радиус дышит +-6 % с периодом ~2,4 с. Жёсткого контура нет.
// Радиус и центр совпадают с кругом сбора в sim (sim/world.js, sim/pickups.js, sim/rocket.js); значок магнита рисует HUD.

import { TAU, clamp, smoothstep } from './util.js';

/** PICKUP_RADIUS.coin (28) + MAGNET_BONUS (90) из sim/pickups.js; тест сверяет значение с sim. */
export const MAGNET_RADIUS = 118;
/** ROCKET_AXIS_OFFSET из sim/rocket.js: круг подбора центрирован на столько выше стоп ракеты. */
export const MAGNET_CENTER_OFFSET = 26;
export const FIELD_PULSE = 0.06; // доля радиуса: дыхание поля
export const FIELD_PERIOD = 2.4; // с
export const FIELD_ALPHA = { min: 0.08, max: 0.18 };
/** Доли радиуса, на которые вылетают линии поля (экватор каждой дуги), и число отрезков в линии. */
export const FIELD_LOOPS = [0.42, 0.62, 0.82, 1];
export const FIELD_SEGMENTS = 36;
const POLE = 0.2; // положение «полюсов» от центра в долях радиуса (в локальных осях ракеты)

const WARM = [255, 150, 70];
const COOL = [110, 185, 255];

/** Магнит включён в этом полёте. */
export function magnetActive(flight) {
  const consumables = flight && flight.cfg && flight.cfg.consumables;
  return !!(consumables && consumables.magnet);
}

/** Радиус сбора с магнитом: state.magnetRadius или cfg.magnetRadius (если sim их отдаёт), иначе значение по sim. */
export function magnetRadius(flight) {
  const fromState = flight && (flight.magnetRadius ?? (flight.cfg && flight.cfg.magnetRadius));
  return Number.isFinite(fromState) && fromState > 0 ? fromState : MAGNET_RADIUS;
}

/** Центр круга подбора в мировых координатах (учитывает наклон ракеты). */
export function magnetCenter(flight, out = { x: 0, y: 0 }) {
  const angle = flight.angle || 0;
  out.x = flight.x + Math.sin(angle) * MAGNET_CENTER_OFFSET;
  out.y = flight.y - Math.cos(angle) * MAGNET_CENTER_OFFSET;
  return out;
}

/** Множитель радиуса: 1 +- FIELD_PULSE с периодом FIELD_PERIOD (при reduceMotion — 1). */
export function fieldPulse(time, reduce) {
  return reduce ? 1 : 1 + FIELD_PULSE * Math.sin((time / FIELD_PERIOD) * TAU);
}

/**
 * Точка силовой линии в локальных осях ракеты (x вправо, y вверх, ед. мира) для дуги с экватором на расстоянии equator,
 * стороны side (-1 слева, +1 справа) и параметра u 0..1 от северного полюса к южному. Кубическая кривая Безье
 * от полюса (0, +pole) вокруг к полюсу (0, -pole), как линии стержневого магнита.
 */
export function fieldPoint(equator, side, u, pole, out = { x: 0, y: 0 }) {
  const k = 1 - u;
  const bulge = equator * 1.34; // у кубической Безье максимум по x равен 0,75 от управляющей точки
  const lift = pole + equator * 0.62;
  const b1 = 3 * k * k * u;
  const b2 = 3 * k * u * u;
  out.x = side * bulge * (b1 + b2);
  // Безье: P0=(0,pole), P1=(bulge,pole+lift), P2=(bulge,-pole-lift), P3=(0,-pole)
  out.y = k * k * k * pole + b1 * (pole + lift) + b2 * (-pole - lift) + u * u * u * -pole;
  return out;
}

/** Прозрачность отрезка линии: u 0..1 вдоль линии, loop 0..n-1 (внутренние дуги чуть ярче), поток по времени. */
export function fieldAlpha(u, loop, time, reduce, out = { value: 0 }) {
  const fade = Math.pow(Math.sin(Math.PI * clamp(u, 0, 1)), 0.35); // к полюсам линия лишь слегка тает
  const flow = reduce ? 0.7 : 0.5 + 0.5 * Math.sin(TAU * (u * 1.25 - time * 0.16 + loop * 0.23));
  const inner = 1 - loop / (FIELD_LOOPS.length * 2.2);
  out.value = clamp(FIELD_ALPHA.min + (FIELD_ALPHA.max - FIELD_ALPHA.min) * fade * (0.35 + 0.65 * flow) * inner, 0, FIELD_ALPHA.max);
  return out.value;
}

/** Цвет вдоль линии: оранжевый у полюсов, голубой у экватора. */
export function fieldColor(u, out = [0, 0, 0]) {
  const t = smoothstep(0.16, 0.5, Math.min(u, 1 - u));
  out[0] = WARM[0] + (COOL[0] - WARM[0]) * t;
  out[1] = WARM[1] + (COOL[1] - WARM[1]) * t;
  out[2] = WARM[2] + (COOL[2] - WARM[2]) * t;
  return out;
}

const center = { x: 0, y: 0 };
const point = { x: 0, y: 0 };
const color = [0, 0, 0];
const alphaOut = { value: 0 };

/**
 * Рисует поле магнита вокруг ракеты. Невидимо, пока ракета не в игре (авария, посадка, переход) или магнит не включён.
 * Рисовать до ракеты: полюса прячутся за её корпусом. При reduceMotion поле неподвижно, без пульсации.
 */
export function drawMagnetField(ctx, view, flight, time, reduce) {
  if (!magnetActive(flight)) return;
  if (flight.phase === 'crashed' || flight.phase === 'landed' || flight.phase === 'transfer') return;
  magnetCenter(flight, center);
  const angle = flight.angle || 0;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const radius = magnetRadius(flight) * fieldPulse(time, reduce);
  const S = view.S;
  const cx = view.sx(center.x);
  const cy = view.sy(center.y);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  // едва заметная аура: тёплый центр и холодный край, без контура
  const aura = ctx.createRadialGradient(cx, cy, radius * 0.1 * S, cx, cy, radius * S);
  aura.addColorStop(0, 'rgba(255,170,90,0.045)');
  aura.addColorStop(0.55, 'rgba(120,190,255,0.03)');
  aura.addColorStop(1, 'rgba(120,190,255,0)');
  ctx.fillStyle = aura;
  ctx.beginPath();
  ctx.arc(cx, cy, radius * S, 0, TAU);
  ctx.fill();
  // силовые линии диполя
  ctx.lineWidth = Math.max(1, Math.round(S * 0.7));
  ctx.lineCap = 'butt'; // без круглых концов: на стыках отрезков не копятся яркие точки
  const pole = radius * POLE;
  let wasWarm = false;
  FIELD_LOOPS.forEach((fraction, loop) => {
    for (const side of [-1, 1]) {
      let px = 0;
      let py = 0;
      for (let i = 0; i <= FIELD_SEGMENTS; i++) {
        const u = i / FIELD_SEGMENTS;
        fieldPoint(radius * fraction, side, u, pole, point);
        // локальные оси ракеты: вверх вдоль её оси; экран: y вниз, поворот по углу ракеты
        const wx = center.x + point.x * cos + point.y * sin;
        const wy = center.y - point.y * cos + point.x * sin;
        const sx = view.sx(wx);
        const sy = view.sy(wy);
        if (i > 0) {
          const mid = (i - 0.5) / FIELD_SEGMENTS;
          const a = fieldAlpha(mid, loop + (side > 0 ? 0.5 : 0), time, reduce, alphaOut);
          fieldColor(mid, color);
          // тёплые концы у полюсов — обычным смешением (на синем море «lighter» даёт серое), холодная середина — светящаяся
          const warm = mid < 0.22 || mid > 0.78;
          if (warm !== wasWarm) ctx.globalCompositeOperation = warm ? 'source-over' : 'lighter';
          wasWarm = warm;
          ctx.strokeStyle = `rgba(${color[0] | 0},${color[1] | 0},${color[2] | 0},${a.toFixed(3)})`;
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.lineTo(sx, sy);
          ctx.stroke();
        }
        px = sx;
        py = sy;
      }
    }
  });
  ctx.restore();
}
