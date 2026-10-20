// Ввод: клавиатура (аркада/пилот), диск наклона и рычаг тяги, геймпад, слияние источников.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyDeadzone, discTilt, leverValue, hitTouchRegion, createKeyboardModel, mergeInputs, gamepadToInput, risingEdges, makeInput, KEYS, PULSES,
} from '../src/input/mapping.js';
import { createTouchModel } from '../src/input/touch.js';
import { createGamepad } from '../src/input/gamepad.js';
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

test('диск наклона: центр — ноль, края — ±1, зажим за пределами', () => {
  const disc = { cx: 100, cy: 100, r: 60 };
  assert.equal(discTilt(100, disc), 0);
  assert.equal(discTilt(100 + 200, disc), 1);
  assert.equal(discTilt(100 - 200, disc), -1);
  assert.ok(discTilt(100 + 20, disc) > 0 && discTilt(100 + 20, disc) < 0.5);
  assert.equal(discTilt(100 + 20, disc, 2) > discTilt(100 + 20, disc), true);
});

test('рычаг тяги: верх — 1, низ — 0, линейно между', () => {
  const lever = { x: 300, y: 100, w: 60, h: 200 };
  assert.equal(leverValue(0, lever), 1);
  assert.equal(leverValue(999, lever), 0);
  const mid = leverValue(200, lever);
  assert.ok(mid > 0.45 && mid < 0.55);
});

test('попадание в сенсорные зоны в портрете и ландшафте', () => {
  for (const [w, h] of [[390, 844], [844, 390], [1280, 720]]) {
    const hud = hudFor(w, h);
    assert.equal(hitTouchRegion(hud.disc.cx, hud.disc.cy, hud), 'disc', `${w}x${h}: диск`);
    assert.equal(hitTouchRegion(hud.lever.x + hud.lever.w / 2, hud.lever.y + hud.lever.h / 2, hud), 'lever', `${w}x${h}: рычаг`);
    for (const name of ['boost', 'parachute', 'canister', 'repair', 'pause']) {
      const r = hud.buttons[name];
      assert.equal(hitTouchRegion(r.x + r.w / 2, r.y + r.h / 2, hud), `button:${name}`, `${w}x${h}: ${name}`);
    }
    assert.equal(hitTouchRegion(w / 2, h / 2, hud), null, `${w}x${h}: центр экрана свободен`);
  }
});

test('скрытые сенсорные элементы не перехватывают указатель', () => {
  const hud = { ...hudFor(844, 390), touchVisible: false };
  assert.equal(hitTouchRegion(hud.disc.cx, hud.disc.cy, hud), null);
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

test('касание: диск и рычаг работают одновременно (мультитач)', () => {
  const hud = hudFor(844, 390);
  const m = createTouchModel();
  assert.equal(m.down(1, hud.disc.cx + hud.disc.r * 0.6, hud.disc.cy, hud, 0), 'disc');
  assert.equal(m.down(2, hud.lever.x + hud.lever.w / 2, hud.lever.y + 12, hud, 0), 'lever');
  const out = m.poll(0.1, 'pilot');
  assert.ok(out.tilt > 0.3);
  assert.ok(out.throttle > 0.9);
  assert.equal(m.down(3, hud.disc.cx, hud.disc.cy, hud, 0.1), null, 'второй палец на диске не принимается');
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
  m.down(1, hud.disc.cx + 30, hud.disc.cy, hud, 0);
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
  m.down(4, hud.disc.cx, hud.disc.cy, hud, 1);
  m.up(4, 1.05, true);
  m.down(5, hud.disc.cx, hud.disc.cy, hud, 1.1);
  m.up(5, 1.15);
  assert.equal(m.poll(1.2, 'arcade').stabilize, false);
});

test('касание: двойной тап по диску включает стабилизацию на время', () => {
  const hud = hudFor(390, 844);
  const m = createTouchModel();
  m.down(1, hud.disc.cx, hud.disc.cy, hud, 0);
  m.up(1, 0.05);
  m.down(2, hud.disc.cx, hud.disc.cy, hud, 0.2);
  m.up(2, 0.25);
  assert.equal(m.poll(0.3, 'arcade').stabilize, true);
  assert.equal(m.poll(2, 'arcade').stabilize, false);
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
