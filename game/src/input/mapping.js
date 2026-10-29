// Чистая логика ввода: раскладки клавиш, геометрия касаний, слияние источников. Без DOM.

export const KEYS = {
  thrustUp: ['KeyW', 'ArrowUp'],
  thrustDown: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  stabilize: ['KeyQ', 'KeyE'],
  boost: ['Space'],
  parachute: ['KeyX'],
  canister: ['KeyF'],
  repair: ['KeyR'],
  transfer: ['KeyT'],
  pause: ['KeyP', 'Escape'],
};

export const PULSES = ['parachute', 'canister', 'repair', 'transfer', 'pause'];

export const EMPTY_INPUT = Object.freeze({
  throttle: 0,
  tilt: 0,
  stabilize: false,
  boost: false,
  parachute: false,
  canister: false,
  repair: false,
  transfer: false,
  pause: false,
});

export const makeInput = () => ({ ...EMPTY_INPUT });

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/** Мёртвая зона с перенормировкой: |v| ≤ dz → 0, иначе плавно до ±1. */
export function applyDeadzone(v, dz = 0.12) {
  const a = Math.abs(v);
  if (a <= dz) return 0;
  return Math.sign(v) * Math.min(1, (a - dz) / (1 - dz));
}

/**
 * Наклон жестом: относительное перетаскивание в любом месте экрана. dx — смещение пальца по X от точки касания (px);
 * steer = { dead, range }: мёртвая зона и смещение, при котором наклон достигает максимума. Чувствительность — из настроек («ДИСК»).
 */
export function steerTilt(dx, steer, sensitivity = 1) {
  const dead = steer?.dead ?? STEER_DEAD;
  const range = Math.max(dead + 1, steer?.range ?? 80);
  const a = Math.abs(dx);
  if (a <= dead) return 0;
  return clamp(Math.sign(dx) * Math.min(1, (a - dead) / (range - dead)) * sensitivity, -1, 1);
}

/** Мёртвая зона жеста наклона, px. */
export const STEER_DEAD = 6;
/** Доля ширины экрана, на которой наклон достигает максимума. */
export const STEER_RANGE_SHARE = 0.18;

/** Рычаг тяги: положение пальца по вертикали → 0..1 (верх = полная тяга). */
export function leverValue(y, lever, inset = 10) {
  const top = lever.y + inset;
  const span = Math.max(1, lever.h - inset * 2);
  return clamp(1 - (y - top) / span, 0, 1);
}

/**
 * Какая касательная зона под пальцем; допускаем небольшой запас вокруг. Кнопки и рычаг тяги — свои роли;
 * любое другое место экрана — жест наклона ('steer').
 */
export function hitTouchRegion(x, y, hud, slop = 6) {
  if (!hud) return null;
  // когда сенсорные элементы скрыты (ПК с мышью), ими управляет только интерфейс
  if (hud.touchVisible === false) return null;
  const names = hud.touchButtons || ['pause', 'transfer', 'boost', 'parachute', 'canister', 'repair'];
  for (const name of names) {
    const r = hud.buttons?.[name];
    if (r && x >= r.x - slop && x < r.x + r.w + slop && y >= r.y - slop && y < r.y + r.h + slop) return `button:${name}`;
  }
  const l = hud.lever;
  if (l && x >= l.x - slop * 2 && x < l.x + l.w + slop * 2 && y >= l.y - slop * 2 && y < l.y + l.h + slop * 2) return 'lever';
  return 'steer';
}

/**
 * Состояние клавиатуры: удерживаемые коды, разовые импульсы и «залипшая» тяга режима «Пилот».
 * Возвращает функцию-шаг, чтобы логика проверялась в Node без DOM.
 */
export function createKeyboardModel() {
  const held = new Set();
  const m = { held, pulses: new Set(), throttle: 0, tilt: 0, shift: false, stabilizeUntil: 0 };

  const isHeld = (action) => KEYS[action].some((c) => held.has(c));

  m.keyDown = (code, { repeat = false, shift = false } = {}) => {
    if (repeat) return;
    held.add(code);
    m.shift = shift;
    for (const p of PULSES) if (KEYS[p].includes(code)) m.pulses.add(p);
    if (KEYS.thrustUp.includes(code) && shift) m.throttle = 0.5; // Shift+W — зафиксировать 50%
  };
  m.keyUp = (code) => {
    held.delete(code);
  };
  m.releaseAll = () => {
    held.clear();
    m.pulses.clear();
    m.tilt = 0;
  };
  m.reset = () => {
    m.releaseAll();
    m.throttle = 0;
  };

  /** dt в секундах; mode — 'arcade' | 'pilot'. */
  m.step = (dt, mode) => {
    const up = isHeld('thrustUp');
    const down = isHeld('thrustDown');
    if (mode === 'pilot') {
      const rate = 1.4;
      if (up && !m.shift) m.throttle = clamp(m.throttle + rate * dt, 0, 1);
      else if (up && m.shift && m.throttle < 0.5) m.throttle = 0.5;
      if (down) m.throttle = clamp(m.throttle - rate * 1.4 * dt, 0, 1);
    } else {
      m.throttle = up ? 1 : 0;
    }
    const target = (isHeld('right') ? 1 : 0) - (isHeld('left') ? 1 : 0);
    const k = Math.min(1, dt * 10);
    m.tilt += (target - m.tilt) * k;
    if (Math.abs(m.tilt - target) < 0.02) m.tilt = target;
    const stabilize = isHeld('stabilize') || (down && m.throttle <= 0.001);
    const out = makeInput();
    out.throttle = m.throttle;
    out.tilt = m.tilt;
    out.stabilize = stabilize;
    out.boost = isHeld('boost');
    for (const p of PULSES) {
      out[p] = m.pulses.has(p);
    }
    m.pulses.clear();
    return out;
  };
  return m;
}

/** Слияние нескольких источников: тяга — максимум, наклон — наибольший по модулю, кнопки — «или». */
export function mergeInputs(list) {
  const out = makeInput();
  for (const i of list) {
    if (!i) continue;
    out.throttle = Math.max(out.throttle, i.throttle);
    if (Math.abs(i.tilt) > Math.abs(out.tilt)) out.tilt = i.tilt;
    for (const k of ['stabilize', 'boost', ...PULSES]) out[k] = out[k] || !!i[k];
  }
  return out;
}

/** Состояние геймпада → Input (stick/триггеры). pad = { axes, buttons:[{value,pressed}] }. */
export function gamepadToInput(pad, mode) {
  const out = makeInput();
  if (!pad) return out;
  const b = (i) => pad.buttons?.[i]?.value ?? (pad.buttons?.[i]?.pressed ? 1 : 0);
  const trigger = Math.max(b(7), b(0));
  out.throttle = mode === 'pilot' ? applyDeadzone(trigger, 0.05) : trigger > 0.3 ? 1 : 0;
  out.tilt = applyDeadzone(pad.axes?.[0] ?? 0, 0.16);
  out.stabilize = b(4) > 0.5;
  out.boost = b(5) > 0.5;
  out.parachute = b(2) > 0.5;
  out.canister = b(3) > 0.5;
  out.repair = b(1) > 0.5;
  out.pause = b(9) > 0.5;
  return out;
}

/** Фронт нажатия: true только на кадре, где значение стало истинным. */
export function risingEdges(prev, next, keys = PULSES) {
  const out = { ...next };
  for (const k of keys) out[k] = !!next[k] && !prev?.[k];
  return out;
}
