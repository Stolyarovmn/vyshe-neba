// Накладки полёта: зона посадки, линия прогноза, указатель площадки за краем кадра,
// линии скорости, варп перелёта, вспышка.

import { drawPadLights } from './launchpad.js';
import { fillWorldRect } from './painter.js';
import { clamp, hash2, smoothstep, TAU } from './util.js';

/** Дальность тени и контактного маркера посадки (ед. мира, 400 м): sim кладёт её в state.shadowRange. */
export const SHADOW_RANGE = 40;

/** Высота над землёй для картинки: state.heightAboveGround (sim), иначе высота над стартом. */
export function heightAboveGround(flight) {
  return Math.max(0, flight.heightAboveGround ?? flight.alt ?? -(flight.y || 0));
}

/**
 * Общее правило тени и посадочного маркера: видны только ниже shadowRange (по умолчанию 40 ед. = 400 м) и плавно гаснут к
 * этой высоте. strength — прозрачность у самой земли (тень 0,42, маркер 1).
 */
export function groundMarkAlpha(height, range = SHADOW_RANGE, strength = 1) {
  return strength * (1 - smoothstep(0, Math.max(1, range), Math.max(0, height)));
}

/** Тень ракеты на земле: смещение и размер растут с высотой 1:1 (солнце сбоку-сверху), пока ракета ниже range. */
export function shadowGeometry(height, out = { dx: 0, dy: 0, rx: 0, ry: 0 }) {
  const h = Math.max(0, height);
  out.dx = 7 + h * 0.25;
  out.dy = 6 + h * 0.18;
  out.rx = 17 + h * 0.3;
  out.ry = 9 + h * 0.17;
  return out;
}

/**
 * Видимость маркера посадочной зоны (0..1): нет на старте, в наборе высоты и пока ракета стоит (площадка, посадка, авария),
 * на спуске — по общему правилу тени: у земли виден, к высоте shadowRange гаснет. Дальний луч над площадкой на Луне и Марсе управляется
 * отдельно (landingBeamAlpha): он нужен, чтобы найти площадку с высоты.
 */
export function landingZoneAlpha(flight) {
  if (!flight.liftedOff || flight.phase === 'landed' || flight.phase === 'crashed' || flight.phase === 'pad' || flight.phase === 'ascent') return 0;
  return groundMarkAlpha(heightAboveGround(flight), flight.shadowRange ?? SHADOW_RANGE);
}

/** Видимость дальнего луча над площадкой: растёт после отрыва и остаётся, пока ракета высоко. */
export function landingBeamAlpha(flight) {
  if (!flight.liftedOff || flight.phase === 'landed' || flight.phase === 'crashed' || flight.phase === 'pad') return 0;
  return smoothstep(12, 70, flight.alt ?? 0);
}

const flatShadowGeometry = { dx: 0, dy: 0, rx: 0, ry: 0 };

/**
 * Тень ракеты на ровной поверхности Луны и Марса (y = 0): тот же размер, смещение и прозрачность, что у острова на Земле.
 * Рисуется только ниже shadowRange — по ней видна высота при посадке.
 */
export function drawFlatShadow(ctx, view, flight) {
  const height = heightAboveGround(flight);
  const alpha = groundMarkAlpha(height, flight.shadowRange ?? SHADOW_RANGE, 0.42);
  if (alpha <= 0.01 || flight.phase === 'crashed') return;
  const g = shadowGeometry(height, flatShadowGeometry);
  ctx.save();
  ctx.fillStyle = `rgba(6,12,20,${alpha.toFixed(3)})`;
  ctx.beginPath();
  ctx.ellipse(view.sx(flight.x + g.dx), view.sy(g.dy * 0.2), Math.max(1, g.rx * view.S), Math.max(1, g.ry * 0.35 * view.S), 0, 0, TAU);
  ctx.fill();
  ctx.restore();
}

/**
 * Зона посадки: огни по краям площадки, полоса на грунте и тонкий световой луч сверху.
 * pad = { x, half, lit }; ok — текущее состояние допустимо для посадки и ракета над площадкой.
 */
export function drawLandingZone(ctx, view, pad, lit, ok, time, alt, alpha, beamAlpha = alpha) {
  if (!pad || pad.visible === false || (alpha <= 0.01 && beamAlpha <= 0.01)) return;
  const half = pad.half;
  const left = pad.x - half;
  const right = pad.x + half;
  if (right < view.left - 30 || left > view.right + 30) return;
  const color = ok ? 'rgba(150,240,170,0.9)' : 'rgba(255,214,120,0.85)';
  const previous = ctx.globalAlpha;
  if (alpha > 0.01) {
    ctx.globalAlpha = previous * alpha;
    fillWorldRect(ctx, view, left, -2, half * 2, 2, color);
    drawPadLights(ctx, view, pad.x, half, lit, time, ok);
  }
  ctx.globalAlpha = previous * beamAlpha;
  if (beamAlpha > 0.01 && alt > 30 && alt < 2400) {
    // Луч над площадкой: помогает найти её при подлёте. Три слоя разной ширины дают мягкие края.
    const sy1 = view.sy(0);
    const sy0 = Math.max(0, view.sy(-700));
    const pulse = 0.5 + 0.5 * Math.sin(time * 2.4);
    const layers = [[0.5, 0.045], [0.32, 0.055], [0.16, 0.07]];
    for (const [width, strength] of layers) {
      const sx0 = view.sx(pad.x - half * width);
      const sx1 = view.sx(pad.x + half * width);
      const beam = ctx.createLinearGradient(0, sy1, 0, sy0);
      beam.addColorStop(0, `rgba(160,245,180,${(strength * (1.4 + pulse * 0.6)).toFixed(3)})`);
      beam.addColorStop(1, 'rgba(160,245,180,0)');
      ctx.fillStyle = beam;
      ctx.fillRect(sx0, sy0, sx1 - sx0, sy1 - sy0);
    }
  }
  ctx.globalAlpha = previous;
}

/** Стрелка на краю кадра в сторону площадки, когда она вне экрана по горизонтали. */
export function drawPadPointer(ctx, view, pad, anchorY, time) {
  if (!pad || pad.visible === false) return;
  const sx = view.sx(pad.x);
  const px = view.px;
  const margin = 18 * px;
  if (sx > margin && sx < view.devW - margin) return;
  const side = sx <= margin ? -1 : 1;
  const x = side < 0 ? margin : view.devW - margin;
  const y = clamp(anchorY, 40 * px, view.devH - 40 * px);
  const pulse = 0.6 + 0.4 * Math.sin(time * 5);
  ctx.save();
  ctx.fillStyle = `rgba(160,245,180,${pulse.toFixed(2)})`;
  ctx.beginPath();
  ctx.moveTo(x + side * 8 * px, y);
  ctx.lineTo(x - side * 4 * px, y - 8 * px);
  ctx.lineTo(x - side * 4 * px, y + 8 * px);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/**
 * Линия прогноза: пунктир по опорным точкам sim.predict.points ([x, y] в мире) и, на втором
 * уровне авионики, отметка точки падения (зелёная на площадке, жёлтая рядом).
 */
export function drawPredict(ctx, view, predict, time, alpha = 1, groundView = view) {
  if (!predict || !predict.points || predict.points.length < 2 || alpha <= 0.01) return;
  const px = view.px;
  const points = predict.points;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.lineWidth = Math.max(1, Math.round(px * 1.2));
  ctx.setLineDash([4 * px, 4 * px]);
  ctx.lineDashOffset = -time * 20 * px;
  ctx.strokeStyle = 'rgba(200,240,255,0.7)';
  ctx.beginPath();
  ctx.moveTo(view.sx(points[0][0]), view.sy(points[0][1]));
  for (let i = 1; i < points.length; i++) ctx.lineTo(view.sx(points[i][0]), view.sy(points[i][1]));
  ctx.stroke();
  ctx.setLineDash([]);
  const impact = predict.impact;
  if (impact) {
    const x = groundView.sx(impact.x);
    const y = groundView.sy(0);
    const color = impact.onPad ? 'rgba(150,240,170,0.95)' : 'rgba(255,200,110,0.95)';
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = Math.max(1, Math.round(px * 1.5));
    const r = 9 * px * (groundView.S / view.S);
    ctx.beginPath();
    ctx.ellipse(x, y, r * 1.6, r * 0.5, 0, 0, TAU);
    ctx.stroke();
    ctx.fillRect(x - px, y - 2 * px, 2 * px, 4 * px);
  }
  ctx.restore();
}

/** Линии скорости: тонкие штрихи вдоль вектора скорости при быстром полёте в воздухе. */
export function drawSpeedLines(ctx, view, vx, vy, atmo, time) {
  const speed = Math.hypot(vx, vy);
  const strength = smoothstep(100, 190, speed) * clamp(atmo * 2.4, 0.15, 1);
  if (strength < 0.05) return;
  const px = view.px;
  const dx = -vx / speed;
  const dy = -vy / speed;
  const count = Math.round(6 + 14 * strength);
  const travel = view.devH * 1.2;
  ctx.save();
  ctx.strokeStyle = `rgba(255,255,255,${(0.08 + 0.14 * strength).toFixed(2)})`;
  ctx.lineWidth = Math.max(1, px);
  ctx.beginPath();
  for (let i = 0; i < count; i++) {
    const phase = (time * (1.1 + hash2(i, 2, 5)) + hash2(i, 1, 5)) % 1;
    const x = hash2(i, 3, 5) * view.devW;
    const y = hash2(i, 4, 5) * view.devH;
    const len = (10 + 26 * hash2(i, 6, 5)) * px * strength;
    const sx = x + dx * (phase - 0.5) * travel;
    const sy = y + dy * (phase - 0.5) * travel;
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx + dx * len, sy + dy * len);
  }
  ctx.stroke();
  ctx.restore();
}

/** Варп перелёта: звёздные штрихи вниз и растущая планета назначения. progress 0..1. */
export function drawTransferWarp(ctx, painter, view, destination, progress, time) {
  const px = view.px;
  const ramp = Math.sin(clamp(progress, 0, 1) * Math.PI);
  ctx.save();
  ctx.lineWidth = Math.max(1, px);
  for (let i = 0; i < 70; i++) {
    const speed = 500 + 900 * hash2(i, 1, 9);
    const len = (30 + 140 * hash2(i, 2, 9)) * px * (0.3 + ramp);
    const x = hash2(i, 3, 9) * view.devW;
    const y = ((hash2(i, 4, 9) * view.devH + time * speed * px * 0.5) % (view.devH + len)) - len;
    const bright = 150 + Math.floor(hash2(i, 5, 9) * 100);
    ctx.strokeStyle = `rgba(${bright - 20},${bright},255,${(0.25 + 0.5 * ramp).toFixed(2)})`;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y + len);
    ctx.stroke();
  }
  const radius = (10 + 80 * progress * progress) * px;
  const cx = view.devW * 0.72;
  const cy = view.devH * 0.22;
  const sprite = destination === 'moon' && painter.assets.get('moon');
  if (sprite) {
    painter.spriteScreen(ctx, view, 'moon', cx, cy, radius * 2);
  } else {
    ctx.fillStyle = destination === 'mars' ? '#b0583c' : '#9aa0aa';
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.arc(cx + radius * 0.25, cy + radius * 0.1, radius * 0.95, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

/** Полноэкранная вспышка поверх кадра. */
export function drawFlash(ctx, view, fx) {
  if (fx.flash <= 0.01) return;
  const c = fx.flashColor;
  ctx.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},${Math.min(1, fx.flash).toFixed(2)})`;
  ctx.fillRect(0, 0, view.devW, view.devH);
}
