// Ввод: клавиатура (аркада/пилот), диск наклона и рычаг тяги, геймпад, слияние источников.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyDeadzone, steerTilt, STEER_DEAD, STEER_RANGE_SHARE, leverValue, hitTouchRegion, createKeyboardModel, mergeInputs, gamepadToInput, risingEdges, makeInput, KEYS, PULSES,
} from '../src/input/mapping.js';
import { createTouchModel } from '../src/input/touch.js';
import { createGamepad } from '../src/input/gamepad.js';
import { createInput } from '../src/input/index.js';
import { computeLayout, hudLayout } from '../src/ui/layout.js';

const hudFor = (w, h) => hudLayout(computeLayout(w, h, 2));
const INPUT_KEYS = ['throttle', 'tilt', 'stabilize', 'boost', 'parachute', 'canister', 'repair', 'transfer', 'pause'];

test('форма Input совпадает с контрактом §6.2', () => {
  assert.deepEqual(Object.keys(makeInput()).sort(), [...INPUT_KEYS].sort());
  const kb = createKeyboardModel();
  assert.deepEqual(Object.keys(kb.step(0.016, 'arcade')).sort(), [...INPUT_KEYS].sort());
});

test('мёртвая зона перенормируется до ±1', () => {
  assert.equal(applyDeadzone(0.05, 0.1), 0);
  assert.equal(applyDeadzone(1, 0.1), 1);
  assert.equal(applyDeadzone(-1, 0.1), -1);
  assert.ok(Math.abs(applyDeadzone(0.55, 0.1) - 0.5) < 1e-9);
});

test('жест наклона: мёртвая зона 6 px, максимум при смещении в 18% ширины, чувствительность масштабирует', () => {
  const steer = { dead: STEER_DEAD, range: 100 };
  assert.equal(STEER_DEAD, 6);
  assert.equal(STEER_RANGE_SHARE, 0.18);
  assert.equal(steerTilt(0, steer), 0);
  assert.equal(steerTilt(6, steer), 0, 'на границе мёртвой зоны — ноль');
  assert.equal(steerTilt(-6, steer), 0);
  assert.ok(steerTilt(7, steer) > 0 && steerTilt(7, steer) < 0.05, 'сразу за зоной наклон плавно растёт с нуля');
  assert.equal(steerTilt(100, steer), 1);
  assert.equal(steerTilt(-100, steer), -1);
  assert.equal(steerTilt(500, steer), 1, 'зажим за пределами');
  assert.ok(Math.abs(steerTilt(53, steer) - 0.5) < 1e-9, 'линейно между зоной и максимумом');
  assert.ok(steerTilt(40, steer, 1.5) > steerTilt(40, steer, 1));
  assert.ok(steerTilt(40, steer, 0.5) < steerTilt(40, steer, 1));
  assert.equal(steerTilt(100, steer, 1.5), 1, 'с большой чувствительностью тоже зажим');
});

test('рычаг тяги: верх — 1, низ — 0, линейно между', () => {
  const lever = { x: 300, y: 100, w: 60, h: 200 };
  assert.equal(leverValue(0, lever), 1);
  assert.equal(leverValue(999, lever), 0);
  const mid = leverValue(200, lever);
  assert.ok(mid > 0.45 && mid < 0.55);
});

test('попадание в сенсорные зоны: кнопки и рычаг — свои роли, любое другое место экрана — жест наклона', () => {
  for (const [w, h] of [[390, 844], [844, 390], [1280, 720]]) {
    const hud = hudFor(w, h);
    assert.equal(hitTouchRegion(hud.lever.x + hud.lever.w / 2, hud.lever.y + hud.lever.h / 2, hud), 'lever', `${w}x${h}: рычаг`);
    for (const name of ['boost', 'parachute', 'canister', 'repair', 'pause']) {
      const r = hud.buttons[name];
      assert.equal(hitTouchRegion(r.x + r.w / 2, r.y + r.h / 2, hud), `button:${name}`, `${w}x${h}: ${name}`);
    }
    for (const [fx, fy] of [[0.5, 0.5], [0.15, 0.4], [0.85, 0.3], [0.5, 0.2], [0.05, 0.95]]) {
      assert.equal(hitTouchRegion(w * fx, h * fy, hud), 'steer', `${w}x${h}: (${fx}, ${fy}) — наклон`);
    }
    // указатель крена на месте бывшего диска больше не орган управления
    assert.equal(hitTouchRegion(hud.disc.cx, hud.disc.cy, hud), 'steer', `${w}x${h}: на указателе крена тоже наклон`);
    assert.equal(hud.steer.dead, 6);
    assert.equal(hud.steer.range, Math.round(w * 0.18));
  }
});

test('скрытые сенсорные элементы не перехватывают указатель', () => {
  const hud = { ...hudFor(844, 390), touchVisible: false };
  assert.equal(hitTouchRegion(hud.disc.cx, hud.disc.cy, hud), null);
  assert.equal(hitTouchRegion(400, 200, hud), null);
});

test('клавиатура, аркада: тяга 0/1 по удержанию, наклон сглаженно к ±1', () => {
  const kb = createKeyboardModel();
  kb.keyDown('KeyW');
  assert.equal(kb.step(0.016, 'arcade').throttle, 1);
  kb.keyUp('KeyW');
  assert.equal(kb.step(0.016, 'arcade').throttle, 0);
  kb.keyDown('KeyD');
  let tilt = 0;
  for (let i = 0; i < 60; i++) tilt = kb.step(0.016, 'arcade').tilt;
  assert.equal(tilt, 1);
  kb.keyUp('KeyD');
  kb.keyDown('ArrowLeft');
  for (let i = 0; i < 60; i++) tilt = kb.step(0.016, 'arcade').tilt;
  assert.equal(tilt, -1);
});

test('клавиатура, пилот: тяга плавно растёт и снижается, Shift+W фиксирует 50%', () => {
  const kb = createKeyboardModel();
  kb.keyDown('KeyW');
  const a = kb.step(0.1, 'pilot').throttle;
  const b = kb.step(0.1, 'pilot').throttle;
  assert.ok(a > 0 && b > a && b < 1);
  for (let i = 0; i < 40; i++) kb.step(0.1, 'pilot');
  assert.equal(kb.step(0.1, 'pilot').throttle, 1);
  kb.keyUp('KeyW');
  assert.equal(kb.step(0.1, 'pilot').throttle, 1, 'после отпускания тяга остаётся');
  kb.keyDown('KeyS');
  for (let i = 0; i < 40; i++) kb.step(0.1, 'pilot');
  assert.equal(kb.step(0.1, 'pilot').throttle, 0);
  const kb2 = createKeyboardModel();
  kb2.keyDown('KeyW', { shift: true });
  assert.equal(kb2.step(0.1, 'pilot').throttle, 0.5);
});

test('клавиатура: стабилизация по Q/E и по S при нулевой тяге; разовые действия — один опрос', () => {
  const kb = createKeyboardModel();
  kb.keyDown('KeyQ');
  assert.equal(kb.step(0.016, 'arcade').stabilize, true);
  kb.keyUp('KeyQ');
  kb.keyDown('KeyS');
  assert.equal(kb.step(0.016, 'arcade').stabilize, true);
  kb.keyDown('KeyX');
  assert.equal(kb.step(0.016, 'arcade').parachute, true);
  assert.equal(kb.step(0.016, 'arcade').parachute, false, 'импульс не повторяется');
  kb.keyDown('Space');
  assert.equal(kb.step(0.016, 'arcade').boost, true);
  kb.keyDown('Escape');
  assert.equal(kb.step(0.016, 'arcade').pause, true);
  kb.keyDown('KeyF', { repeat: true });
  assert.equal(kb.step(0.016, 'arcade').canister, false, 'автоповтор клавиши игнорируется');
});

test('клавиатура: releaseAll снимает все удержания (потеря фокуса)', () => {
  const kb = createKeyboardModel();
  kb.keyDown('KeyW');
  kb.keyDown('KeyD');
  kb.releaseAll();
  const out = kb.step(0.016, 'arcade');
  assert.equal(out.throttle, 0);
  assert.equal(out.tilt, 0);
});

test('все клавиши раскладки уникальны между действиями', () => {
  const seen = new Map();
  for (const [action, codes] of Object.entries(KEYS)) {
    for (const code of codes) {
      assert.ok(!seen.has(code), `${code} занят действием ${seen.get(code)} и ${action}`);
      seen.set(code, action);
    }
  }
});

test('касание: жест наклона и рычаг работают одновременно (мультитач)', () => {
  const hud = hudFor(844, 390);
  const m = createTouchModel();
  assert.equal(m.down(1, 300, 200, hud, 0), 'steer');
  assert.equal(m.down(2, hud.lever.x + hud.lever.w / 2, hud.lever.y + 12, hud, 0), 'lever');
  m.move(1, 300 + hud.steer.range * 0.6, 200, hud);
  const out = m.poll(0.1, 'pilot');
  assert.ok(out.tilt > 0.3 && out.tilt < 1, `наклон ${out.tilt}`);
  assert.ok(out.throttle > 0.9);
  assert.equal(m.down(3, 500, 150, hud, 0.1), null, 'второй палец вне рычага и кнопок не рулит');
});

test('жест: перетаскивание в любом месте даёт наклон по смещению от точки касания', () => {
  for (const [w, h] of [[390, 844], [844, 390], [1280, 720]]) {
    const hud = hudFor(w, h);
    const range = hud.steer.range;
    for (const [sx, sy] of [[w * 0.5, h * 0.5], [w * 0.3, h * 0.35], [w * 0.7, h * 0.25]]) {
      const m = createTouchModel();
      assert.equal(m.down(1, sx, sy, hud, 0), 'steer', `${w}x${h}: касание (${sx}, ${sy})`);
      assert.equal(m.poll(0.016, 'arcade').tilt, 0, 'без смещения наклона нет');
      m.move(1, sx + 4, sy + 60, hud);
      assert.equal(m.poll(0.032, 'arcade').tilt, 0, 'внутри мёртвой зоны (6 px) наклона нет, вертикаль не считается');
      m.move(1, sx + range * 0.5, sy, hud);
      const half = m.poll(0.048, 'arcade').tilt;
      assert.ok(half > 0.35 && half < 0.6, `${w}x${h}: полсмещения → ${half}`);
      m.move(1, sx + range * 3, sy, hud);
      assert.equal(m.poll(0.064, 'arcade').tilt, 1, 'за максимальным смещением зажим в 1');
      m.move(1, sx - range, sy, hud);
      assert.equal(m.poll(0.08, 'arcade').tilt, -1, 'влево — отрицательный наклон');
    }
  }
});

test('жест: чувствительность из настроек масштабирует наклон', () => {
  const hud = hudFor(390, 844);
  const base = createTouchModel();
  const strong = createTouchModel();
  strong.sensitivity = 1.6;
  const weak = createTouchModel();
  weak.sensitivity = 0.6;
  for (const m of [base, strong, weak]) {
    m.down(1, 100, 400, hud, 0);
    m.move(1, 100 + hud.steer.range * 0.4, 400, hud);
  }
  const [b, s, w] = [base, strong, weak].map((m) => m.poll(0.02, 'arcade').tilt);
  assert.ok(s > b && b > w && w > 0, `${w} < ${b} < ${s}`);
});

test('жест: отпускание плавно возвращает наклон к нулю, а не обрывает его', () => {
  const hud = hudFor(390, 844);
  const m = createTouchModel();
  m.down(1, 100, 400, hud, 0);
  m.move(1, 100 + hud.steer.range, 400, hud);
  assert.equal(m.poll(0.02, 'arcade').tilt, 1);
  m.up(1, 0.04);
  let prev = m.poll(0.06, 'arcade').tilt;
  assert.ok(prev > 0.5 && prev < 1, `сразу после отпускания наклон ещё не нуль: ${prev}`);
  let t = 0.06;
  for (let i = 0; i < 12; i++) {
    t += 1 / 30;
    const now = m.poll(t, 'arcade').tilt;
    assert.ok(now <= prev && now >= 0, `убывает монотонно: ${prev} → ${now}`);
    prev = now;
  }
  assert.ok(prev < 0.1, `через 0,4 с наклон почти нулевой: ${prev}`);
  for (let i = 0; i < 40; i++) t += 1 / 30, m.poll(t, 'arcade');
  assert.equal(m.poll(t + 0.03, 'arcade').tilt, 0);
});

test('жест: второй палец на рычаге тяги независим от пальца наклона, отпускание одного не трогает другой', () => {
  const hud = hudFor(844, 390);
  const m = createTouchModel();
  const lx = hud.lever.x + hud.lever.w / 2;
  m.down(1, 200, 150, hud, 0);
  m.down(2, lx, hud.lever.y + 14, hud, 0);
  m.move(1, 200 + hud.steer.range, 150, hud);
  let out = m.poll(0.02, 'pilot');
  assert.equal(out.tilt, 1);
  assert.ok(out.throttle > 0.9);
  // палец на рычаге ведёт вниз: тяга падает, наклон не меняется
  m.move(2, lx, hud.lever.y + hud.lever.h - 14, hud);
  out = m.poll(0.04, 'pilot');
  assert.ok(out.throttle < 0.2 && out.tilt === 1, `тяга ${out.throttle}, наклон ${out.tilt}`);
  // отпустили палец наклона: тяга осталась, наклон уходит в ноль
  m.move(2, lx, hud.lever.y + 14, hud);
  m.up(1, 0.1);
  let t = 0.1;
  for (let i = 0; i < 60; i++) {
    t += 1 / 30;
    out = m.poll(t, 'pilot');
  }
  assert.equal(out.tilt, 0);
  assert.ok(out.throttle > 0.9, 'рычаг держит тягу после отпускания пальца наклона');
  // и наоборот: отпустили рычаг (аркада) — наклон продолжается
  const a = createTouchModel();
  a.down(1, 200, 150, hud, 0);
  a.down(2, lx, hud.lever.y + 14, hud, 0);
  a.move(1, 200 - hud.steer.range * 0.5, 150, hud);
  a.up(2, 0.1);
  out = a.poll(0.12, 'arcade');
  assert.equal(out.throttle, 0);
  assert.ok(out.tilt < -0.3, `наклон при отпущенном рычаге ${out.tilt}`);
});

test('жест: касание кнопки не начинает наклон, второй палец наклона не принимается', () => {
  const hud = hudFor(390, 844);
  const m = createTouchModel();
  const b = hud.buttons.canister;
  assert.equal(m.down(1, b.x + b.w / 2, b.y + b.h / 2, hud, 0), 'button:canister');
  m.move(1, b.x + b.w / 2 + 200, b.y + b.h / 2, hud);
  assert.equal(m.poll(0.02, 'arcade').tilt, 0, 'палец, севший на кнопку, не рулит, сколько бы ни двигался');
  assert.equal(m.down(2, 150, 300, hud, 0.1), 'steer');
  assert.equal(m.down(3, 250, 300, hud, 0.1), null, 'один палец наклона одновременно');
});

test('касание, аркада: тяга 1 пока палец на рычаге; пилот: значение остаётся после отпускания', () => {
  const hud = hudFor(390, 844);
  const arcade = createTouchModel();
  arcade.down(1, hud.lever.x + 10, hud.lever.y + hud.lever.h * 0.5, hud, 0);
  assert.equal(arcade.poll(0, 'arcade').throttle, 1);
  arcade.up(1, 0.2);
  assert.equal(arcade.poll(0.2, 'arcade').throttle, 0);
  const pilot = createTouchModel();
  pilot.down(1, hud.lever.x + 10, hud.lever.y + hud.lever.h * 0.5, hud, 0);
  const held = pilot.poll(0, 'pilot').throttle;
  pilot.up(1, 0.2);
  assert.equal(pilot.poll(0.2, 'pilot').throttle, held);
});

test('касание: отмена и сброс освобождают захват (pointercancel, blur, resize)', () => {
  const hud = hudFor(844, 390);
  const m = createTouchModel();
  m.down(1, 400, 200, hud, 0);
  m.move(1, 460, 200, hud);
  m.down(2, hud.lever.x + 10, hud.lever.y + 10, hud, 0);
  m.down(3, hud.buttons.boost.x + 5, hud.buttons.boost.y + 5, hud, 0);
  assert.equal(m.poll(0, 'arcade').boost, true);
  m.cancelAll();
  const out = m.poll(0.1, 'arcade');
  assert.equal(out.tilt, 0);
  assert.equal(out.throttle, 0);
  assert.equal(out.boost, false);
  assert.equal(m.active(), false);
  // отменённый указатель не считается касанием-«двойным тапом»
  m.down(4, 400, 200, hud, 1);
  m.up(4, 1.05, true);
  m.down(5, 400, 200, hud, 1.1);
  m.up(5, 1.15);
  assert.equal(m.poll(1.2, 'arcade').stabilize, false);
});

test('касание: двойной тап в любом свободном месте включает стабилизацию на время', () => {
  const hud = hudFor(390, 844);
  const m = createTouchModel();
  m.down(1, 180, 420, hud, 0);
  m.up(1, 0.05);
  m.down(2, 190, 430, hud, 0.2);
  m.up(2, 0.25);
  assert.equal(m.poll(0.3, 'arcade').stabilize, true);
  assert.equal(m.poll(2, 'arcade').stabilize, false);
  // перетаскивание (наклон) двойным тапом не считается
  const d = createTouchModel();
  d.down(1, 180, 420, hud, 0);
  d.move(1, 260, 420, hud);
  d.up(1, 0.05);
  d.down(2, 180, 420, hud, 0.2);
  d.up(2, 0.25);
  assert.equal(d.poll(0.3, 'arcade').stabilize, false);
});

test('касание: кнопки-импульсы срабатывают один раз, форсаж — пока палец держит', () => {
  const hud = hudFor(390, 844);
  const m = createTouchModel();
  const b = hud.buttons.parachute;
  m.down(1, b.x + b.w / 2, b.y + b.h / 2, hud, 0);
  assert.equal(m.poll(0, 'arcade').parachute, true);
  assert.equal(m.poll(0.016, 'arcade').parachute, false);
  const boost = hud.buttons.boost;
  m.down(2, boost.x + 4, boost.y + 4, hud, 0.1);
  assert.equal(m.poll(0.1, 'arcade').boost, true);
  m.up(2, 0.5);
  assert.equal(m.poll(0.5, 'arcade').boost, false);
});

test('слияние источников: тяга — максимум, наклон — наибольший по модулю, кнопки — «или»', () => {
  const a = { ...makeInput(), throttle: 0.4, tilt: -0.2, boost: true };
  const b = { ...makeInput(), throttle: 0.9, tilt: 0.7, parachute: true };
  const out = mergeInputs([a, null, b]);
  assert.equal(out.throttle, 0.9);
  assert.equal(out.tilt, 0.7);
  assert.equal(out.boost && out.parachute, true);
  assert.deepEqual(mergeInputs([]), makeInput());
});

test('геймпад: стик — наклон, триггер — тяга, кнопки — действия; аркада даёт 0/1', () => {
  const pad = (b = {}, axes = [0, 0]) => ({ axes, buttons: Array.from({ length: 16 }, (_, i) => ({ value: b[i] || 0, pressed: (b[i] || 0) > 0.5 })) });
  const pilot = gamepadToInput(pad({ 7: 0.6 }, [0.6, 0]), 'pilot');
  assert.ok(pilot.throttle > 0.5 && pilot.throttle < 0.7 && pilot.tilt > 0.3);
  const arcade = gamepadToInput(pad({ 7: 0.6 }), 'arcade');
  assert.equal(arcade.throttle, 1);
  const act = gamepadToInput(pad({ 4: 1, 5: 1, 2: 1, 3: 1, 1: 1, 9: 1 }), 'arcade');
  assert.equal(act.stabilize && act.boost && act.parachute && act.canister && act.repair && act.pause, true);
  assert.equal(gamepadToInput(pad({}, [0.05, 0]), 'arcade').tilt, 0);
  assert.deepEqual(gamepadToInput(null, 'arcade'), makeInput());
});

test('геймпад: импульсные кнопки — по фронту нажатия', () => {
  const prev = { ...makeInput(), parachute: true };
  const next = { ...makeInput(), parachute: true, repair: true };
  const out = risingEdges(prev, next);
  assert.equal(out.parachute, false);
  assert.equal(out.repair, true);
  assert.ok(PULSES.includes('repair'));
});

test('геймпад в интерфейсе: крестовина — навигация с автоповтором, A — выбор, B — назад', () => {
  const state = { buttons: Array.from({ length: 16 }, () => ({ value: 0, pressed: false })), axes: [0, 0], connected: true };
  const gp = createGamepad({ getPads: () => [state] });
  assert.deepEqual(gp.pollUi(0.016), []);
  state.buttons[13].pressed = true;
  assert.deepEqual(gp.pollUi(0.016), [{ type: 'nav', dir: 'down' }]);
  assert.deepEqual(gp.pollUi(0.1), []);
  assert.deepEqual(gp.pollUi(0.4), [{ type: 'nav', dir: 'down' }]);
  state.buttons[13].pressed = false;
  state.buttons[0].pressed = true;
  assert.deepEqual(gp.pollUi(0.016), [{ type: 'activate' }]);
  state.buttons[0].pressed = false;
  state.buttons[1].pressed = true;
  assert.deepEqual(gp.pollUi(0.016), [{ type: 'back' }]);
});

// ---- жесты камеры хаба: щипок и двойной тап ----

function fakeInput() {
  const listeners = {};
  const canvas = {
    addEventListener: (type, fn) => { (listeners[type] ||= []).push(fn); },
    removeEventListener() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 800 }),
    setPointerCapture() {},
  };
  const win = { addEventListener() {}, removeEventListener() {} };
  const prevDoc = globalThis.document;
  globalThis.document = { addEventListener() {}, removeEventListener() {}, hidden: false };
  const input = createInput(canvas, () => ({ w: 400, h: 800, hud: null }), { window: win });
  const fire = (type, id, x, y, pointerType = 'touch') => {
    for (const fn of listeners[type] || []) fn({ pointerId: id, clientX: x, clientY: y, pointerType, preventDefault() {}, deltaMode: 0 });
  };
  return {
    input,
    fire,
    restore: () => {
      input.dispose();
      if (prevDoc === undefined) delete globalThis.document;
      else globalThis.document = prevDoc;
    },
  };
}

test('два пальца в интерфейсе: щипок даёт событие pinch, одиночные нажатия отменяются', () => {
  const { input, fire, restore } = fakeInput();
  fire('pointerdown', 1, 150, 300);
  fire('pointerdown', 2, 250, 300);
  fire('pointermove', 1, 100, 300);
  fire('pointermove', 2, 300, 300);
  fire('pointerup', 1, 100, 300);
  fire('pointerup', 2, 300, 300);
  const ev = input.drain(0.016);
  restore();
  const pinches = ev.filter((e) => e.type === 'pinch');
  assert.ok(pinches.length >= 1, 'нет событий pinch');
  const total = pinches.reduce((k, e) => k * e.factor, 1);
  assert.ok(Math.abs(total - 2) < 0.05, `общий коэффициент ${total}`);
  assert.ok(ev.some((e) => e.type === 'cancel'), 'первое нажатие не отменено');
  assert.ok(!ev.some((e) => e.type === 'up'), 'щипок не должен давать тап');
});

test('двойной тап: два быстрых касания рядом дают dtap, медленные — нет', async () => {
  const { input, fire, restore } = fakeInput();
  fire('pointerdown', 1, 200, 400, 'mouse');
  fire('pointerup', 1, 200, 400, 'mouse');
  fire('pointerdown', 1, 204, 402, 'mouse');
  fire('pointerup', 1, 204, 402, 'mouse');
  const quick = input.drain(0.016);
  assert.equal(quick.filter((e) => e.type === 'dtap').length, 1);
  await new Promise((r) => setTimeout(r, 420));
  fire('pointerdown', 1, 200, 400, 'mouse');
  fire('pointerup', 1, 200, 400, 'mouse');
  fire('pointerdown', 1, 200, 400, 'mouse');
  fire('pointerup', 1, 200, 400, 'mouse');
  const slow = input.drain(0.016);
  restore();
  assert.equal(slow.filter((e) => e.type === 'dtap').length, 1, 'вторая пара тоже быстрая');
});

// ---- жест наклона через настоящий модуль ввода (события указателя → poll) ----

function flightInput(w = 390, h = 844) {
  const hud = hudFor(w, h);
  const listeners = {};
  const canvas = {
    addEventListener: (type, fn) => { (listeners[type] ||= []).push(fn); },
    removeEventListener() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: w, height: h }),
    setPointerCapture() {},
  };
  const prevDoc = globalThis.document;
  globalThis.document = { addEventListener() {}, removeEventListener() {}, hidden: false };
  const input = createInput(canvas, () => ({ w, h, hud: { ...hud, touchVisible: true } }), { window: { addEventListener() {}, removeEventListener() {} } });
  input.setMode('flight');
  const fire = (type, id, x, y) => {
    for (const fn of listeners[type] || []) fn({ pointerId: id, clientX: x, clientY: y, pointerType: 'touch', preventDefault() {}, deltaMode: 0 });
  };
  return { input, hud, fire, restore: () => { input.dispose(); if (prevDoc === undefined) delete globalThis.document; else globalThis.document = prevDoc; } };
}

test('ввод в полёте: палец в произвольном месте экрана наклоняет, второй палец на рычаге даёт тягу независимо', () => {
  const { input, hud, fire, restore } = flightInput();
  const lx = hud.lever.x + hud.lever.w / 2;
  fire('pointerdown', 1, 120, 300);
  fire('pointermove', 1, 120 + hud.steer.range * 0.5, 300);
  let out = input.poll(0.016);
  assert.ok(out.tilt > 0.3 && out.tilt < 0.7, `наклон ${out.tilt}`);
  assert.equal(out.throttle, 0);
  fire('pointerdown', 2, lx, hud.lever.y + 20);
  out = input.poll(0.016);
  assert.equal(out.throttle, 1, 'аркада: тяга пока палец на рычаге');
  assert.ok(out.tilt > 0.3, 'наклон продолжается');
  fire('pointermove', 1, 120 - hud.steer.range, 300);
  out = input.poll(0.016);
  assert.equal(out.tilt, -1);
  assert.equal(out.throttle, 1);
  fire('pointerup', 1, 120 - hud.steer.range, 300);
  fire('pointerup', 2, lx, hud.lever.y + 20);
  for (let i = 0; i < 80; i++) out = input.poll(1 / 30);
  restore();
  assert.equal(out.tilt, 0);
  assert.equal(out.throttle, 0);
});

test('ввод в полёте: касание кнопки HUD не рулит, события не уходят в интерфейс', () => {
  const { input, hud, fire, restore } = flightInput(844, 390);
  const b = hud.buttons.parachute;
  fire('pointerdown', 7, b.x + b.w / 2, b.y + b.h / 2);
  fire('pointermove', 7, b.x + b.w / 2 + 150, b.y + b.h / 2);
  const out = input.poll(0.016);
  const ui = input.drain(0.016);
  restore();
  assert.equal(out.tilt, 0);
  assert.equal(out.parachute, true);
  assert.equal(ui.filter((e) => e.type === 'down').length, 0);
});
