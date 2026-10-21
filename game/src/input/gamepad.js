// Геймпад: опрос Gamepad API, управление полётом и навигация по интерфейсу (крестовина, A/B).

import { gamepadToInput, makeInput, risingEdges } from './mapping.js';

const REPEAT_DELAY = 0.38;
const REPEAT_RATE = 0.12;

export function createGamepad({ getPads = () => (typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : []) } = {}) {
  let prevFlight = makeInput();
  const held = {};

  function active() {
    for (const p of getPads() || []) if (p && p.connected) return p;
    return null;
  }

  /** Состояние для полёта. Импульсные кнопки (парашют, ремонт…) срабатывают по фронту. */
  function pollFlight(mode) {
    const pad = active();
    if (!pad) return null;
    const raw = gamepadToInput(pad, mode);
    const out = risingEdges(prevFlight, raw);
    prevFlight = raw;
    return out;
  }

  /** События интерфейса: nav/activate/back с автоповтором направления. */
  function pollUi(dt) {
    const pad = active();
    const events = [];
    if (!pad) return events;
    const btn = (i) => !!pad.buttons?.[i]?.pressed;
    const ax = pad.axes?.[0] ?? 0;
    const ay = pad.axes?.[1] ?? 0;
    const dirs = {
      up: btn(12) || ay < -0.6,
      down: btn(13) || ay > 0.6,
      left: btn(14) || ax < -0.6,
      right: btn(15) || ax > 0.6,
    };
    for (const [dir, on] of Object.entries(dirs)) {
      const h = held[dir] || (held[dir] = { on: false, t: 0 });
      if (on && !h.on) {
        events.push({ type: 'nav', dir });
        h.t = REPEAT_DELAY;
      } else if (on) {
        h.t -= dt;
        if (h.t <= 0) {
          events.push({ type: 'nav', dir });
          h.t = REPEAT_RATE;
        }
      }
      h.on = on;
    }
    const edge = (name, i, evt) => {
      const h = held[name] || (held[name] = { on: false });
      if (btn(i) && !h.on) events.push(evt);
      h.on = btn(i);
    };
    edge('a', 0, { type: 'activate' });
    edge('b', 1, { type: 'back' });
    edge('start', 9, { type: 'back' });
    return events;
  }

  return { pollFlight, pollUi, active, reset: () => { prevFlight = makeInput(); } };
}
