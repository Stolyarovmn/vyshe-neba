// Мелкие чистые помощники рендера: математика, детерминированный шум, цвета.

export const TAU = Math.PI * 2;

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function smoothstep(edge0, edge1, v) {
  const t = clamp((v - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Экспоненциальное сглаживание, не зависящее от частоты кадров. */
export function damp(current, target, rate, dt) {
  return current + (target - current) * (1 - Math.exp(-rate * dt));
}

/** Целочисленный хеш двух чисел в [0, 1). Детерминирован, без Math.random. */
export function hash2(x, y, salt = 0) {
  let n = Math.imul((x | 0) ^ 0x2c1b3c6d, 0x297a2d39) ^ Math.imul((y | 0) + salt * 0x9e3779b1, 0x1b873593);
  n = Math.imul(n ^ (n >>> 15), 0x85ebca6b);
  n = Math.imul(n ^ (n >>> 13), 0xc2b2ae35);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

/** Плавный псевдошум по времени в [-1, 1] из суммы синусов (без состояния). */
export function wobble(t, seed = 0) {
  return (
    Math.sin(t * 17.3 + seed * 12.9898) * 0.5
    + Math.sin(t * 29.7 + seed * 78.233) * 0.3
    + Math.sin(t * 43.1 + seed * 37.719) * 0.2
  );
}

export function mixColor(a, b, t, out) {
  const target = out || [0, 0, 0];
  target[0] = a[0] + (b[0] - a[0]) * t;
  target[1] = a[1] + (b[1] - a[1]) * t;
  target[2] = a[2] + (b[2] - a[2]) * t;
  return target;
}

export function rgbString(c) {
  return `rgb(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])})`;
}

export function rgbaString(c, alpha) {
  return `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${alpha})`;
}

/** Кусочно-линейный градиент: stops = [[позиция, [r,g,b]], ...] по возрастанию позиции. */
export function sampleStops(stops, pos, out) {
  const target = out || [0, 0, 0];
  if (pos <= stops[0][0]) return copyColor(stops[0][1], target);
  const last = stops[stops.length - 1];
  if (pos >= last[0]) return copyColor(last[1], target);
  let i = 0;
  while (pos > stops[i + 1][0]) i++;
  const a = stops[i];
  const b = stops[i + 1];
  return mixColor(a[1], b[1], (pos - a[0]) / (b[0] - a[0]), target);
}

function copyColor(src, dst) {
  dst[0] = src[0];
  dst[1] = src[1];
  dst[2] = src[2];
  return dst;
}

/** Нормализованный угол в (-PI, PI]. */
export function wrapAngle(a) {
  let v = a % TAU;
  if (v > Math.PI) v -= TAU;
  else if (v <= -Math.PI) v += TAU;
  return v;
}

/** Кадрированное значение 0..n-1 по времени: frame(t, 8 fps, 4 кадра). */
export function frameIndex(t, fps, count) {
  return Math.floor(t * fps) % count;
}

/** Генератор mulberry32 для визуальных эффектов: rng() -> [0, 1). Не связан с симуляцией. */
export function createRng(seed = 1) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
