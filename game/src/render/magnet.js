// Магнит-расходник: пока он включён в полёте (cfg.consumables.magnet), вокруг ракеты светится кольцо радиуса притяжения
// монет, а на кольце висит значок magnet_ГОД. Радиус и центр совпадают с sim (sim/world.js, sim/pickups.js, sim/rocket.js).

import { spriteName } from './manifest.js';
import { TAU } from './util.js';

/** PICKUP_RADIUS.coin (28) + MAGNET_BONUS (90) из sim/pickups.js; тест сверяет значение с sim. */
export const MAGNET_RADIUS = 118;
/** ROCKET_AXIS_OFFSET из sim/rocket.js: круг подбора центрирован на столько выше стоп ракеты. */
export const MAGNET_CENTER_OFFSET = 26;
const BADGE_SIZE = 20; // высота значка, ед. мира

/** Магнит включён в этом полёте. */
export function magnetActive(flight) {
  const consumables = flight && flight.cfg && flight.cfg.consumables;
  return !!(consumables && consumables.magnet);
}

/** Центр круга подбора в мировых координатах (учитывает наклон ракеты). */
export function magnetCenter(flight, out = { x: 0, y: 0 }) {
  const angle = flight.angle || 0;
  out.x = flight.x + Math.sin(angle) * MAGNET_CENTER_OFFSET;
  out.y = flight.y - Math.cos(angle) * MAGNET_CENTER_OFFSET;
  return out;
}

const center = { x: 0, y: 0 };

/**
 * Рисует поле магнита. Невидимо, пока ракета не в игре (авария, посадка, переход). При reduceMotion кольцо не вращается и не
 * пульсирует.
 */
export function drawMagnetField(ctx, painter, view, flight, era, time, reduce) {
  if (!magnetActive(flight)) return;
  if (flight.phase === 'crashed' || flight.phase === 'landed' || flight.phase === 'transfer') return;
  magnetCenter(flight, center);
  const sx = view.sx(center.x);
  const sy = view.sy(center.y);
  const radius = MAGNET_RADIUS * view.S;
  const pulse = reduce ? 0.5 : 0.5 + 0.5 * Math.sin(time * 2.4);
  ctx.save();
  // мягкое заполнение: куда дотянется магнит
  const fill = ctx.createRadialGradient(sx, sy, radius * 0.55, sx, sy, radius);
  fill.addColorStop(0, 'rgba(255,120,110,0)');
  fill.addColorStop(1, `rgba(255,120,110,${(0.07 + 0.05 * pulse).toFixed(3)})`);
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.arc(sx, sy, radius, 0, TAU);
  ctx.fill();
  // пунктирное кольцо бежит по кругу
  ctx.lineWidth = Math.max(1, Math.round(view.px * 1.4));
  ctx.strokeStyle = `rgba(255,150,140,${(0.32 + 0.3 * pulse).toFixed(3)})`;
  ctx.setLineDash([view.px * 7, view.px * 6]);
  ctx.lineDashOffset = reduce ? 0 : -time * view.px * 14;
  ctx.beginPath();
  ctx.arc(sx, sy, radius, 0, TAU);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
  // значок магнита на верху кольца
  const bob = reduce ? 0 : Math.sin(time * 2.1) * 1.5;
  painter.sprite(ctx, view, spriteName('magnet', era), center.x, center.y - MAGNET_RADIUS + bob, { h: BADGE_SIZE, alpha: 0.9, smooth: true });
}
