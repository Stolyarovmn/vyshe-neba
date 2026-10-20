// Касательное управление полётом: диск наклона слева, рычаг тяги справа, кнопки действий.
// Модель не зависит от DOM: события приходят снаружи (input/index.js), геометрия — из layout.hud.

import { discTilt, hitTouchRegion, leverValue, makeInput } from './mapping.js';

const DOUBLE_TAP = 0.34; // секунд
const TAP_MOVE = 14; // пикселей
const STABILIZE_HOLD = 0.9;

export function createTouchModel() {
  const m = {
    pointers: new Map(),
    lever: 0,
    leverTouched: false,
    tilt: 0,
    discTouched: false,
    pulses: new Set(),
    stabilizeUntil: 0,
    lastDiscTap: -1,
    sensitivity: 1,
  };

  const owner = (role) => [...m.pointers.values()].some((p) => p.role === role);

  /** Возвращает роль захваченного указателя или null, если палец не попал в элементы управления. */
  m.down = (id, x, y, hud, now) => {
    const role = hitTouchRegion(x, y, hud);
    if (!role) return null;
    // одну роль держит один палец
    if ((role === 'disc' || role === 'lever') && owner(role)) return null;
    m.pointers.set(id, { role, startX: x, startY: y, x, y, t: now, moved: 0 });
    if (role === 'disc') {
      m.discTouched = true;
      m.tilt = discTilt(x, hud.disc, m.sensitivity);
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
    if (p.role === 'disc') m.tilt = discTilt(x, hud.disc, m.sensitivity);
    else if (p.role === 'lever') m.lever = leverValue(y, hud.lever);
    return true;
  };

  m.up = (id, now, cancelled = false) => {
    const p = m.pointers.get(id);
    if (!p) return false;
    m.pointers.delete(id);
    if (p.role === 'disc') {
      m.discTouched = owner('disc');
      if (!m.discTouched) m.tilt = 0;
      if (!cancelled && p.moved < TAP_MOVE) {
        if (now - m.lastDiscTap < DOUBLE_TAP) {
          m.stabilizeUntil = now + STABILIZE_HOLD;
          m.lastDiscTap = -1;
        } else {
          m.lastDiscTap = now;
        }
      }
    } else if (p.role === 'lever') {
      m.leverTouched = owner('lever');
    }
    return true;
  };

  m.cancelAll = () => {
    m.pointers.clear();
    m.discTouched = false;
    m.leverTouched = false;
    m.tilt = 0;
  };

  m.reset = () => {
    m.cancelAll();
    m.lever = 0;
    m.pulses.clear();
    m.stabilizeUntil = 0;
  };

  m.owns = (id) => m.pointers.has(id);
  m.active = () => m.pointers.size > 0;

  /** Текущее состояние рычага для рисования: значение 0..1 и признак касания. */
  m.leverState = (mode) => ({ value: mode === 'arcade' ? (m.leverTouched ? 1 : 0) : m.lever, touched: m.leverTouched });

  m.poll = (now, mode) => {
    const out = makeInput();
    out.throttle = mode === 'arcade' ? (m.leverTouched ? 1 : 0) : m.lever;
    out.tilt = m.discTouched ? m.tilt : 0;
    out.stabilize = now < m.stabilizeUntil;
    out.boost = owner('button:boost');
    for (const p of m.pulses) out[p] = true;
    m.pulses.clear();
    return out;
  };

  return m;
}
