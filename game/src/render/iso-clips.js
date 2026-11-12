// ON-клипы изометрической базы (art/docs/ASSET_STATE_SPEC.md §6, решение 2026-11-11): механика только там, где игрок
// ждёт событие — ферма при пуске (вентиль), спасатели после аварии (машина к воротам), цех при покупке модуля (ворота),
// склад при выполненном контракте (тельфер с ящиком). Части вырезаны из самого спрайта постройки и двигаются кодом;
// освободившееся место закрывает тёмная глубина помещения. Остальным постройкам — лампа и дым кодом (ISO_VENTS).
// Клип играет один раз по событию, не дольше 3 с; при «меньше движения» части стоят, остаётся только свет.

import { clamp, smoothstep } from './util.js';

/**
 * Механические клипы. Прямоугольники — px спрайта от левого верхнего угла: [x, y, w, h].
 * parts: подвижные части и их ход в px при полном раскрытии; holes — что закрыть глубиной помещения; spin — вращение.
 */
export const ISO_PART_CLIPS = {
  factory: {
    time: 2.4,
    hole: '#1d1915',
    holes: [[44, 62, 28, 38], [100, 62, 29, 38]],
    parts: [{ rect: [44, 62, 28, 38], move: [-14, 0] }, { rect: [100, 62, 29, 38], move: [14, 0] }],
    glow: [86, 82, 20],
  },
  rescue: {
    time: 3,
    hole: '#131921',
    sample: [22, 66], // глубина бокса левее машины
    // только корпус с гусеницами: машина трогается к воротам на 3 px, фон бокса вокруг не сдвигается
    holes: [[31, 74, 49, 35]],
    parts: [{ rect: [31, 74, 49, 35], move: [0, 3] }],
    lights: [[40, 94], [67, 94]],
  },
  logistics: {
    time: 2.6,
    hole: '#221d18',
    patch: [48, 75], // место ящика закрывает кусок той же задней стены справа от него
    holes: [[32, 75, 16, 16]],
    parts: [{ rect: [32, 75, 16, 16], move: [0, -12] }],
    chain: [40, 61],
  },
  gantry: {
    time: 2,
    spin: { center: [21, 159], radius: 11, turns: 1.5 },
  },
};

/** Дым и пар: [доля ширины, доля высоты от верха, пар (true) или дым]. */
export const ISO_VENTS = {
  factory: [[0.77, 0.04]],
  control: [[0.83, 0.24]],
  energy: [[0.62, 0.02]],
  recovery: [[0.42, 0.03]],
  rescue: [[0.4, 0.6]], // выхлоп машины спасателей на выезде
  gantry: [[0.1, 0.74, true]], // пар из стояка рядом с вентилем, не поверх него
};

const sampled = new Map();

/** Цвет глубины помещения: пиксель самого спрайта в точке spec.sample (один раз), иначе spec.hole. */
function holeColor(painter, name, spec) {
  if (!spec.sample) return spec.hole;
  if (sampled.has(name)) return sampled.get(name);
  let color = spec.hole;
  try {
    const asset = painter.assets.get(name);
    const img = asset?.img;
    if (img && typeof document !== 'undefined') {
      const c = document.createElement('canvas');
      c.width = 1;
      c.height = 1;
      const x = c.getContext('2d', { willReadFrequently: true });
      x.drawImage(img, -Math.round(spec.sample[0] * img.width / asset.w), -Math.round(spec.sample[1] * img.height / asset.h));
      const d = x.getImageData(0, 0, 1, 1).data;
      if (d[3] > 200) color = `rgb(${d[0]},${d[1]},${d[2]})`;
    }
  } catch {
    /* остаётся запасной цвет */
  }
  sampled.set(name, color);
  return color;
}

/** Длительность клипа или вспышки света (с). */
export function clipTime(key) {
  return ISO_PART_CLIPS[key]?.time ?? 1.6;
}

/** Ход клипа по доле времени u: раскрытие 0..1 за первую четверть, держится, закрывается к концу. */
export function clipOpen(u) {
  return smoothstep(0, 0.25, u) * (1 - smoothstep(0.72, 1, u));
}

/**
 * Рисует постройку key в фазе клипа u (0..1) поверх статичного спрайта name. ax, ay — низ по центру (px карты),
 * w, h — размер спрайта. reduce — «меньше движения»: части не двигаются.
 */
export function drawIsoClip(ctx, painter, mv, key, name, ax, ay, w, h, u, reduce) {
  const spec = ISO_PART_CLIPS[key];
  const opts = { w, h, ax: 0.5, ay: 1, smooth: true };
  painter.sprite(ctx, mv, name, ax, ay, opts);
  if (!spec || reduce) return;
  const e = clipOpen(clamp(u, 0, 1));
  if (e <= 0.001) return;
  const left = ax - w / 2;
  const top = ay - h;
  const sx = (x) => mv.sx(left + x);
  const sy = (y) => mv.sy(top + y);
  if (spec.holes && spec.patch) {
    // заплатка из текстуры того же спрайта: участок patch переносится на место ушедшей части
    for (const [x, y, rw, rh] of spec.holes) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(sx(x), sy(y), sx(x + rw) - sx(x), sy(y + rh) - sy(y));
      ctx.clip();
      painter.sprite(ctx, mv, name, ax + x - spec.patch[0], ay + y - spec.patch[1], opts);
      ctx.restore();
    }
  } else if (spec.holes) {
    ctx.fillStyle = holeColor(painter, name, spec);
    for (const [x, y, rw, rh] of spec.holes) ctx.fillRect(sx(x), sy(y), sx(x + rw) - sx(x), sy(y + rh) - sy(y));
  }
  if (spec.glow) {
    const [gx, gy, r] = spec.glow;
    const g = ctx.createRadialGradient(sx(gx), sy(gy), 0, sx(gx), sy(gy), r * mv.s);
    g.addColorStop(0, `rgba(255,190,110,${(0.75 * e).toFixed(3)})`);
    g.addColorStop(0.6, `rgba(200,130,60,${(0.3 * e).toFixed(3)})`);
    g.addColorStop(1, 'rgba(255,190,110,0)');
    ctx.fillStyle = g;
    for (const [x, y, rw, rh] of spec.holes) ctx.fillRect(sx(x), sy(y), sx(x + rw) - sx(x), sy(y + rh) - sy(y));
  }
  for (const part of spec.parts || []) {
    const dx = Math.round(part.move[0] * e);
    const dy = Math.round(part.move[1] * e);
    const [x, y, rw, rh] = part.rect;
    ctx.save();
    ctx.beginPath();
    ctx.rect(sx(x + dx), sy(y + dy), sx(x + dx + rw) - sx(x + dx), sy(y + dy + rh) - sy(y + dy));
    ctx.clip();
    painter.sprite(ctx, mv, name, ax + dx, ay + dy, opts);
    ctx.restore();
    if (spec.chain) {
      // тельфер: цепь от балки навеса до ящика и крюк
      const [cx, cy] = spec.chain;
      const lw = Math.max(1, Math.round(mv.s * 0.8));
      ctx.fillStyle = '#2b2622';
      ctx.fillRect(sx(cx) - (lw >> 1), sy(cy), lw, Math.max(0, sy(y + dy) - sy(cy)));
      ctx.fillStyle = '#8a8f96';
      ctx.fillRect(sx(cx - 1), sy(y + dy) - lw, Math.max(lw, sx(cx + 1) - sx(cx - 1)), lw);
    }
    if (spec.lights) {
      // фары машины: вспыхивают на выезде
      for (const [lx, ly] of spec.lights) {
        const px = sx(lx + dx);
        const py = sy(ly + dy);
        const g = ctx.createRadialGradient(px, py, 0, px, py, 6 * mv.s);
        g.addColorStop(0, `rgba(255,236,170,${(0.8 * e).toFixed(3)})`);
        g.addColorStop(1, 'rgba(255,236,170,0)');
        ctx.fillStyle = g;
        ctx.fillRect(px - 6 * mv.s, py - 6 * mv.s, 12 * mv.s, 12 * mv.s);
      }
    }
  }
  if (spec.spin) {
    const { center: [cx, cy], radius, turns } = spec.spin;
    const step = Math.PI / 12; // поворот ступенями по 15°: пиксельный вентиль не «плывёт»
    const p = clamp(u / 0.8, 0, 1);
    const angle = Math.round((turns * Math.PI * 2 * p * p * (3 - 2 * p)) / step) * step;
    if (angle !== 0) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(sx(cx), sy(cy), radius * mv.s, 0, Math.PI * 2);
      ctx.clip();
      painter.sprite(ctx, mv, name, left + cx, top + cy, { w, h, ax: cx / w, ay: cy / h, angle, smooth: false });
      ctx.restore();
    }
  }
}
