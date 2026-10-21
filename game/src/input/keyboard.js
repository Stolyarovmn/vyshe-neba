// Клавиатура: в полёте — модель управления, в интерфейсе — навигация стрелками, Enter/Space и Esc.

import { createKeyboardModel } from './mapping.js';

const GAME_KEYS = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'Escape', 'Tab']);
const NAV = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', KeyW: 'up', KeyS: 'down', KeyA: 'left', KeyD: 'right' };

export function createKeyboard({ target, getMode, pushUi }) {
  const model = createKeyboardModel();

  function onKeyDown(e) {
    if (e.target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (getMode() === 'flight') {
      model.keyDown(e.code, { repeat: e.repeat, shift: e.shiftKey });
      if (GAME_KEYS.has(e.code)) e.preventDefault();
      return;
    }
    const dir = NAV[e.code];
    if (dir) {
      pushUi({ type: 'nav', dir });
      e.preventDefault();
    } else if (e.code === 'Tab') {
      pushUi({ type: 'nav', dir: e.shiftKey ? 'up' : 'down' });
      e.preventDefault();
    } else if (e.code === 'Enter' || e.code === 'Space') {
      if (!e.repeat) pushUi({ type: 'activate' });
      e.preventDefault();
    } else if (e.code === 'Escape' || e.code === 'Backspace') {
      if (!e.repeat) pushUi({ type: 'back' });
      e.preventDefault();
    }
  }

  function onKeyUp(e) {
    model.keyUp(e.code);
    if (GAME_KEYS.has(e.code) && getMode() === 'flight') e.preventDefault();
  }

  target.addEventListener('keydown', onKeyDown);
  target.addEventListener('keyup', onKeyUp);

  return {
    model,
    poll: (dt, controlMode) => model.step(dt, controlMode),
    releaseAll: () => model.releaseAll(),
    reset: () => model.reset(),
    dispose() {
      target.removeEventListener('keydown', onKeyDown);
      target.removeEventListener('keyup', onKeyUp);
    },
  };
}
