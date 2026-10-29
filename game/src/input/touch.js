// Касательное управление полётом: рычаг тяги справа, кнопки действий, а наклон — жестом в любом месте экрана:
// относительное перетаскивание (смещение пальца по X от точки касания задаёт целевой наклон), без дисков и стрелок.
// Модель не зависит от DOM: события приходят снаружи (input/index.js), геометрия — из layout.hud.

import { hitTouchRegion, leverValue, makeInput, steerTilt } from './mapping.js';

const DOUBLE_TAP = 0.34; // секунд
const TAP_MOVE = 14; // пикселей
const STABILIZE_HOLD = 0.9;
const RETURN_RATE = 8; // 1/с: после отпускания наклон плавно возвращается к нулю
const MAX_STEP = 0.1; // секунд: потолок шага сглаживания при редких опросах

export function createTouchModel() {
  const m = {
    pointers: new Map(),
    lever: 0,
    leverTouched: false,
    /** Текущий наклон -1..1 (при отпускании плавно возвращается к нулю). */
    tilt: 0,
    /** Целевой наклон по смещению пальца. */
    steerTarget: 0,
    steerTouched: false,
    pulses: new Set(),
    stabilizeUntil: 0,
    lastTap: -1,
    lastPoll: null,
    sensitivity: 1,
  };

  const owner = (role) => [...m.pointers.values()].some((p) => p.role === role);

  /** Возвращает роль захваченного указателя или null, если палец не попал в элементы управления. */
  m.down = (id, x, y, hud, now) => {
    const role = hitTouchRegion(x, y, hud);
    if (!role) return null;
    // одну роль держит один палец (второй палец вне рычага и кнопок не рулит)
    if ((role === 'steer' || role === 'lever') && owner(role)) return null;
    m.pointers.set(id, { role, startX: x, startY: y, x, y, t: now, moved: 0 });
    if (role === 'steer') {
      m.steerTouched = true;
      m.steerTarget = 0;
    } else if (role === 'lever') {
      m.leverTouched = true;
      m.lever = leverValue(y, hud.lever);
    } else if (role.startsWith('button:')) {
      const name = role.slice(7);
      if (name !== 'boost') m.pulses.add(name);
    }
    return role;
  };

  m.move = (id, x, y, hud) => {
    const p = m.pointers.get(id);
    if (!p) return false;
    p.x = x;
    p.y = y;
    p.moved = Math.max(p.moved, Math.hypot(x - p.startX, y - p.startY));
    if (p.role === 'steer') m.steerTarget = steerTilt(x - p.startX, hud?.steer, m.sensitivity);
    else if (p.role === 'lever') m.lever = leverValue(y, hud.lever);
    return true;
  };

  m.up = (id, now, cancelled = false) => {
    const p = m.pointers.get(id);
    if (!p) return false;
    m.pointers.delete(id);
    if (p.role === 'steer') {
      m.steerTouched = owner('steer');
      if (!m.steerTouched) m.steerTarget = 0;
      // двойной тап где угодно на свободном месте — стабилизация
      if (!cancelled && p.moved < TAP_MOVE) {
        if (now - m.lastTap < DOUBLE_TAP) {
          m.stabilizeUntil = now + STABILIZE_HOLD;
          m.lastTap = -1;
        } else {
          m.lastTap = now;
        }
      }
    } else if (p.role === 'lever') {
      m.leverTouched = owner('lever');
    }
    return true;
  };

  m.cancelAll = () => {
    m.pointers.clear();
    m.steerTouched = false;
    m.leverTouched = false;
    m.steerTarget = 0;
    m.tilt = 0;
  };

  m.reset = () => {
    m.cancelAll();
    m.lever = 0;
    m.pulses.clear();
    m.stabilizeUntil = 0;
    m.lastPoll = null;
    m.lastTap = -1;
  };

  m.owns = (id) => m.pointers.has(id);
  m.active = () => m.pointers.size > 0;

  /** Палец, ведущий наклон (для рисования подсказки жеста): { startX, startY, x, y } или null. */
  m.steerFinger = () => {
    for (const p of m.pointers.values()) if (p.role === 'steer') return p;
    return null;
  };

  /** Текущее состояние рычага для рисования: значение 0..1 и признак касания. */
  m.leverState = (mode) => ({ value: mode === 'arcade' ? (m.leverTouched ? 1 : 0) : m.lever, touched: m.leverTouched });

  /** dtOverride — шаг времени от вызывающего (иначе по разности now). */
  m.poll = (now, mode, dtOverride) => {
    const dt = dtOverride ?? (m.lastPoll === null ? 1 / 60 : Math.min(MAX_STEP, Math.max(0, now - m.lastPoll)));
    m.lastPoll = now;
    if (m.steerTouched) m.tilt = m.steerTarget;
    else if (m.tilt !== 0) {
      m.tilt *= Math.exp(-RETURN_RATE * dt);
      if (Math.abs(m.tilt) < 0.01) m.tilt = 0;
    }
    const out = makeInput();
    out.throttle = mode === 'arcade' ? (m.leverTouched ? 1 : 0) : m.lever;
    out.tilt = m.tilt;
    out.stabilize = now < m.stabilizeUntil;
    out.boost = owner('button:boost');
    for (const p of m.pulses) out[p] = true;
    m.pulses.clear();
    return out;
  };

  return m;
}
