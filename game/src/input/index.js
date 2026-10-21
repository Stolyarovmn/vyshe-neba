// Ввод: createInput(canvas, getLayout) -> { poll(dt) -> Input, drain(dt) -> UI-события, on(type, fn), ... }.
// Захват указателя освобождается на pointerup / pointercancel / lostpointercapture / blur / resize / скрытие вкладки.

import { createKeyboard } from './keyboard.js';
import { createTouchModel } from './touch.js';
import { createGamepad } from './gamepad.js';
import { mergeInputs } from './mapping.js';

const TAP_MOVE = 10;
const TAP_TIME = 0.5;

export function createInput(canvas, getLayout, opts = {}) {
  const win = opts.window || window;
  let mode = 'ui';
  const settings = { controlMode: 'arcade', sensitivity: 1 };
  const queue = [];
  const handlers = {};
  const uiPointers = new Map();
  const touchModel = createTouchModel();
  const gamepad = createGamepad();
  let touchSeen = false;
  let pinch = null; // два пальца в режиме интерфейса: щипок для камеры
  let lastTap = null; // для двойного тапа
  let lastPoll = performance.now() / 1000;

  const emit = (type, payload) => {
    for (const fn of handlers[type] || []) fn(payload);
  };
  const push = (evt) => {
    queue.push(evt);
  };

  const keyboard = createKeyboard({ target: win, getMode: () => mode, pushUi: push });

  function toUi(e) {
    const r = canvas.getBoundingClientRect();
    const L = getLayout();
    const sx = L && r.width ? L.w / r.width : 1;
    const sy = L && r.height ? L.h / r.height : 1;
    return { x: (e.clientX - r.left) * sx, y: (e.clientY - r.top) * sy };
  }

  const now = () => performance.now() / 1000;

  function releaseAll() {
    touchModel.cancelAll();
    keyboard.releaseAll();
    for (const id of uiPointers.keys()) push({ type: 'cancel', pointerId: id });
    uiPointers.clear();
    pinch = null;
  }

  function onDown(e) {
    const { x, y } = toUi(e);
    if (e.pointerType === 'touch' || e.pointerType === 'pen') touchSeen = true;
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      /* указатель мог уже исчезнуть */
    }
    if (mode === 'flight') {
      const role = touchModel.down(e.pointerId, x, y, getLayout()?.hud, now());
      if (role) {
        e.preventDefault();
        emit('press', { x, y, role });
        return;
      }
    }
    if (mode === 'ui' && e.pointerType === 'touch' && uiPointers.size === 1 && !pinch) {
      // второй палец: жест щипка; первое нажатие отменяется, чтобы не стать тапом или сдвигом
      const [[firstId, first]] = [...uiPointers.entries()];
      pinch = { a: firstId, b: e.pointerId, pos: { [firstId]: { x: first.cx ?? first.x0, y: first.cy ?? first.y0 }, [e.pointerId]: { x, y } } };
      pinch.dist = Math.hypot(pinch.pos[firstId].x - x, pinch.pos[firstId].y - y);
      first.pinched = true;
      push({ type: 'cancel', pointerId: firstId });
      uiPointers.set(e.pointerId, { x0: x, y0: y, t0: now(), moved: 999, type: e.pointerType, pinched: true });
      return;
    }
    uiPointers.set(e.pointerId, { x0: x, y0: y, t0: now(), moved: 0, type: e.pointerType });
    push({ type: 'down', x, y, pointerId: e.pointerId, pointerType: e.pointerType });
    emit('press', { x, y });
  }

  function onMove(e) {
    const { x, y } = toUi(e);
    if (touchModel.owns(e.pointerId)) {
      touchModel.move(e.pointerId, x, y, getLayout()?.hud);
      e.preventDefault();
      return;
    }
    if (pinch && (e.pointerId === pinch.a || e.pointerId === pinch.b)) {
      pinch.pos[e.pointerId] = { x, y };
      const A = pinch.pos[pinch.a];
      const B = pinch.pos[pinch.b];
      const d = Math.hypot(A.x - B.x, A.y - B.y);
      if (pinch.dist > 8 && d > 8) push({ type: 'pinch', factor: d / pinch.dist, x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 });
      pinch.dist = d;
      return;
    }
    const p = uiPointers.get(e.pointerId);
    if (p) {
      p.cx = x;
      p.cy = y;
      p.moved = Math.max(p.moved, Math.hypot(x - p.x0, y - p.y0));
      emit('drag', { x, y, dx: x - p.x0, dy: y - p.y0 });
      push({ type: 'move', x, y, pointerId: e.pointerId, pointerType: e.pointerType });
    } else if (e.pointerType === 'mouse') {
      push({ type: 'move', x, y, pointerId: e.pointerId, pointerType: 'mouse' });
    }
  }

  function onUp(e) {
    const { x, y } = toUi(e);
    if (touchModel.owns(e.pointerId)) {
      touchModel.up(e.pointerId, now());
      return;
    }
    const p = uiPointers.get(e.pointerId);
    if (!p) return;
    uiPointers.delete(e.pointerId);
    if (p.pinched) {
      if (pinch && (e.pointerId === pinch.a || e.pointerId === pinch.b)) pinch = null;
      return;
    }
    push({ type: 'up', x, y, pointerId: e.pointerId, pointerType: e.pointerType });
    if (p.moved < TAP_MOVE && now() - p.t0 < TAP_TIME) {
      emit('tap', { x, y });
      const t = now();
      if (lastTap && t - lastTap.t < 0.32 && Math.hypot(x - lastTap.x, y - lastTap.y) < 28) {
        push({ type: 'dtap', x, y });
        lastTap = null;
      } else lastTap = { t, x, y };
    }
  }

  function onCancel(e) {
    if (touchModel.owns(e.pointerId)) {
      touchModel.up(e.pointerId, now(), true);
      return;
    }
    const q = uiPointers.get(e.pointerId);
    if (q?.pinched) {
      uiPointers.delete(e.pointerId);
      if (pinch && (e.pointerId === pinch.a || e.pointerId === pinch.b)) pinch = null;
      return;
    }
    if (uiPointers.delete(e.pointerId)) push({ type: 'cancel', pointerId: e.pointerId });
  }

  function onWheel(e) {
    e.preventDefault();
    const { x, y } = toUi(e);
    const k = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
    push({ type: 'wheel', x, y, dy: e.deltaY * k });
    emit('wheel', { x, y, dy: e.deltaY * k });
  }

  const onLeave = () => push({ type: 'leave' });
  const onBlur = () => releaseAll();
  const onHidden = () => {
    if (document.hidden) releaseAll();
  };

  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onCancel);
  canvas.addEventListener('lostpointercapture', onCancel);
  canvas.addEventListener('pointerleave', onLeave);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  win.addEventListener('blur', onBlur);
  win.addEventListener('resize', releaseAll);
  win.addEventListener('orientationchange', releaseAll);
  document.addEventListener('visibilitychange', onHidden);

  return {
    /** 'flight' — касания обслуживает полётное управление; 'ui' — события идут интерфейсу. */
    setMode(next) {
      if (next === mode) return;
      mode = next;
      releaseAll();
      if (next === 'flight') {
        keyboard.reset();
        touchModel.reset();
        gamepad.reset();
      }
    },
    get mode() { return mode; },
    setSettings(s) {
      if (s.controlMode) settings.controlMode = s.controlMode === 'pilot' ? 'pilot' : 'arcade';
      if (typeof s.sensitivity === 'number') {
        settings.sensitivity = s.sensitivity;
        touchModel.sensitivity = s.sensitivity;
      }
    },
    /** Начать полёт с нуля: тяга и наклон сброшены. */
    resetFlight() {
      keyboard.reset();
      touchModel.reset();
      gamepad.reset();
    },
    /** Input по контракту §6.2. Разовые действия приходят одним опросом. */
    poll(dt) {
      const t = now();
      const d = dt ?? Math.min(0.1, t - lastPoll);
      lastPoll = t;
      if (mode !== 'flight') return mergeInputs([]);
      return mergeInputs([keyboard.poll(d, settings.controlMode), touchModel.poll(t, settings.controlMode), gamepad.pollFlight(settings.controlMode)]);
    },
    /** Разовое действие из интерфейса (кнопки HUD при управлении мышью). */
    pulse(name) {
      keyboard.model.pulses.add(name);
    },
    /** События интерфейса с прошлого кадра. */
    drain(dt = 1 / 60) {
      if (mode === 'ui') for (const e of gamepad.pollUi(dt)) queue.push(e);
      return queue.splice(0, queue.length);
    },
    on(type, fn) {
      (handlers[type] ||= []).push(fn);
      return () => handlers[type].splice(handlers[type].indexOf(fn), 1);
    },
    get touch() { return touchModel; },
    get touchSeen() { return touchSeen; },
    get gamepadActive() { return !!gamepad.active(); },
    releaseAll,
    dispose() {
      keyboard.dispose();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onCancel);
      canvas.removeEventListener('lostpointercapture', onCancel);
      canvas.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('wheel', onWheel);
      win.removeEventListener('blur', onBlur);
      win.removeEventListener('resize', releaseAll);
      win.removeEventListener('orientationchange', releaseAll);
      document.removeEventListener('visibilitychange', onHidden);
    },
  };
}

export { mergeInputs } from './mapping.js';
