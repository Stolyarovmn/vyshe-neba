// Форматирование чисел для интерфейса. Чистые функции, без DOM.
// Игровая единица длины = 10 м (см. ARCHITECTURE §1).

const THIN = ' ';
const UNIT_M = 10;

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, k) => a + (b - a) * k;

/** Целое с узкими пробелами между разрядами: 12 345. */
export function fmtInt(n) {
  if (!Number.isFinite(n)) return '0';
  const s = String(Math.abs(Math.round(n)));
  const body = s.replace(/\B(?=(\d{3})+(?!\d))/g, THIN);
  return (n < 0 && Math.round(n) !== 0 ? '−' : '') + body;
}

/** Компактная запись больших сумм: 1 200, 15,3 тыс., 2,4 млн. */
export function fmtCompact(n) {
  const a = Math.abs(n);
  if (a < 10000) return fmtInt(n);
  if (a < 1e6) return `${trimZeros((n / 1e3).toFixed(a < 1e5 ? 1 : 0))} тыс.`;
  if (a < 1e9) return `${trimZeros((n / 1e6).toFixed(a < 1e7 ? 2 : 1))} млн`;
  return `${trimZeros((n / 1e9).toFixed(2))} млрд`;
}

function trimZeros(s) {
  return (s.includes('.') ? s.replace(/\.?0+$/, '') : s).replace('.', ',');
}

/** Самая короткая запись для тесных табличек: 9 999, 12К, 1,5М. */
export function fmtTiny(n) {
  const a = Math.abs(n);
  if (a < 10000) return fmtInt(n);
  if (a < 1e6) return `${Math.round(n / 1e3)}К`;
  if (a < 1e9) return `${trimZeros((n / 1e6).toFixed(a < 1e7 ? 1 : 0))}М`;
  return `${trimZeros((n / 1e9).toFixed(1))}Г`;
}

/** Число с фиксированным числом знаков и запятой: 3,5. */
export function fmtNum(n, digits = 1) {
  if (!Number.isFinite(n)) return '0';
  return trimZeros(n.toFixed(digits));
}

/** Высота в игровых единицах → «820 м» / «12,4 км». */
export function fmtAlt(units) {
  const m = Math.max(0, units) * UNIT_M;
  if (m < 1000) return { value: String(Math.round(m)), unit: 'm' };
  const km = m / 1000;
  return { value: km < 100 ? fmtNum(km, 1) : fmtInt(km), unit: 'km' };
}

/** Скорость в ед./с — так её показывают правила и подсказки (допуски посадки тоже в ед./с). */
export function fmtSpeed(unitsPerSec, signed = false) {
  const r = Math.round(unitsPerSec);
  const sign = signed && r > 0 ? '+' : r < 0 ? '−' : '';
  return `${sign}${Math.abs(r)}`;
}

export const toMeters = (units) => units * UNIT_M;

/** Секунды → «1:05». */
export function fmtClock(seconds) {
  const s = Math.max(0, Math.round(seconds));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

/** Процент 0..1 → «73%». */
export const fmtPct = (v) => `${Math.round(clamp(v, 0, 1) * 100)}%`;

/** Универсальное значение показателя «было → станет». */
export function fmtStat(v) {
  if (typeof v === 'boolean') return v ? '✓' : '—';
  if (!Number.isFinite(v)) return '—';
  const a = Math.abs(v);
  if (a >= 1000) return fmtCompact(v);
  if (a >= 100) return fmtInt(v);
  if (a >= 10) return fmtNum(v, 1);
  return fmtNum(v, 2);
}

/** Русское склонение: plural(5, ['монета','монеты','монет']). */
export function pluralRu(n, forms) {
  const a = Math.abs(Math.round(n)) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return forms[2];
  if (b > 1 && b < 5) return forms[1];
  if (b === 1) return forms[0];
  return forms[2];
}

/** Лёгкое сглаживание к цели, не зависящее от частоты кадров. */
export function damp(current, target, rate, dt) {
  return lerp(current, target, 1 - Math.exp(-rate * dt));
}

export const easeOutCubic = (t) => 1 - (1 - clamp(t, 0, 1)) ** 3;
export const easeOutBack = (t) => {
  const c = 1.70158;
  const x = clamp(t, 0, 1) - 1;
  return 1 + (c + 1) * x ** 3 + c * x ** 2;
};
