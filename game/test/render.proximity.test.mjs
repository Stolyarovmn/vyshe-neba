import test from 'node:test';
import assert from 'node:assert/strict';
import { CAMERA_TUNING, createCamera } from '../src/render/camera.js';
import { computeLayout } from '../src/render/layout.js';
import {
  PROXIMITY_RANGE, PROXIMITY_REARM, ROCKET_CENTER_OFFSET, ROCKET_HIT_RADIUS, createProximity, proximityKick,
} from '../src/render/proximity.js';
import { ROCKET_AXIS_OFFSET, ROCKET_RADIUS } from '../src/sim/rocket.js';

const DT = 1 / 60;

/** Ракета в начале координат (ноги в (0, 0), центр круга на 26 выше), объект летит вдоль X на высоте dy над центром. */
function fly({ dy = 40, speed = 120, radius = 30, kind = 'plane', rocketVx = 0, from = -260, to = 260, hit = false, id = 1 } = {}) {
  const proximity = createProximity();
  const kicks = [];
  const flight = { x: 0, y: 0, angle: 0, vx: rocketVx, vy: 0, phase: 'ascent' };
  const o = { id, kind, active: true, r: radius, x: from, y: -ROCKET_AXIS_OFFSET - dy, vx: speed, vy: 0 };
  let objects = [o];
  while (o.x < to) {
    o.x += speed * DT;
    if (hit && Math.abs(o.x) < 4) {
      o.active = false; // sim убрала объект после удара
      objects = [];
    }
    proximity.update(flight, objects, DT, (k) => kicks.push(k));
  }
  return { kicks, proximity };
}

test('константы совпадают с sim: центр круга столкновения и радиус ракеты', () => {
  assert.equal(ROCKET_CENTER_OFFSET, ROCKET_AXIS_OFFSET);
  assert.equal(ROCKET_HIT_RADIUS, ROCKET_RADIUS);
  assert.ok(Math.abs(PROXIMITY_RANGE - 1.3 * 60) < 1e-9 && PROXIMITY_REARM > PROXIMITY_RANGE);
});

test('близкий пролёт: один слабый толчок на сближение, в момент наибольшего приближения', () => {
  const { kicks } = fly({ dy: 55 });
  assert.equal(kicks.length, 1, 'ровно один толчок за пролёт');
  assert.ok(kicks[0] >= 0.18 && kicks[0] <= 0.75, `сила ${kicks[0]}`);
  assert.equal(fly({ dy: 400 }).kicks.length, 0, 'далёкий пролёт толчка не даёт');
  assert.equal(fly({ dy: PROXIMITY_RANGE + 30 + 5 }).kicks.length, 0, 'за порогом радиус + 1,3 размера ракеты толчка нет');
  assert.equal(fly({ dy: PROXIMITY_RANGE + 30 - 5 }).kicks.length, 1, 'чуть ближе порога — толчок есть');
  assert.equal(fly({ dy: 35 }).kicks.length, 0, 'внутри радиуса контакта (радиус + радиус ракеты) это уже удар, а не пролёт');
});

test('амплитуда растёт при сближении и при большой относительной скорости', () => {
  const near = fly({ dy: 50 }).kicks[0];
  const far = fly({ dy: 90 }).kicks[0];
  assert.ok(near > far, `ближе сильнее: ${near} против ${far}`);
  const slow = fly({ dy: 65, speed: 40 }).kicks[0];
  const fast = fly({ dy: 65, speed: 260 }).kicks[0];
  assert.ok(fast > slow, `быстрее сильнее: ${fast} против ${slow}`);
  const meeting = fly({ dy: 65, speed: 120, rocketVx: -150 }).kicks[0];
  assert.ok(meeting > fly({ dy: 65, speed: 120 }).kicks[0], 'встречное движение ракеты тоже добавляет скорость');
  assert.ok(proximityKick(1, 400) <= 0.75 && proximityKick(0, 0) >= 0.18);
  assert.ok(proximityKick(0.5, 100) > proximityKick(0.2, 100));
});

test('удар не даёт толчка (сильную тряску даёт hit); кольца и предметы не помехи', () => {
  assert.equal(fly({ dy: 0, hit: true }).kicks.length, 0, 'объект сбит ударом — толчка нет');
  for (const kind of ['ring', 'coin', 'fuel', 'repair']) assert.equal(fly({ dy: 55, kind }).kicks.length, 0, kind);
  for (const kind of ['plane', 'balloon', 'asteroid', 'debris', 'satellite']) assert.equal(fly({ dy: 55, kind }).kicks.length, 1, kind);
});

test('гистерезис: дрожание у порога не даёт повторных толчков, новое сближение после отхода — даёт', () => {
  const proximity = createProximity();
  const kicks = [];
  const flight = { x: 0, y: 0, angle: 0, vx: 0, vy: 0, phase: 'ascent' };
  const o = { id: 7, kind: 'balloon', active: true, r: 28, x: 0, y: -ROCKET_AXIS_OFFSET - 60, vx: 0, vy: 0 };
  const step = (dy) => {
    o.y = -ROCKET_AXIS_OFFSET - dy;
    proximity.update(flight, [o], DT, (k) => kicks.push(k));
  };
  // сближение до 50 ед. и обратно к порогу, потом дрожание между 55 и 75 над центром
  for (const dy of [200, 120, 90, 70, 55, 50, 52, 56, 70, 60, 74, 58, 72, 61, 76, 59]) step(dy);
  assert.equal(kicks.length, 1, `дрожание у порога: ${kicks.length}`);
  for (const dy of [90, 140, 220, 300]) step(dy); // ушёл за PROXIMITY_REARM
  for (const dy of [200, 120, 80, 60, 45, 48, 70]) step(dy);
  assert.equal(kicks.length, 2, 'после отхода и нового сближения — ещё один толчок');
});

test('слежение чистит состояние исчезнувших объектов и не работает на площадке', () => {
  const proximity = createProximity();
  const flight = { x: 0, y: 0, angle: 0, vx: 0, vy: 0, phase: 'ascent' };
  const o = { id: 3, kind: 'plane', active: true, r: 30, x: 0, y: -ROCKET_AXIS_OFFSET - 50, vx: 0, vy: 0 };
  proximity.update(flight, [o], DT, () => assert.fail('толчок без сближения-ухода'));
  assert.equal(proximity.size, 1);
  proximity.update(flight, [], DT, () => {});
  assert.equal(proximity.size, 0, 'объект пропал — забыт');
  const kicks = [];
  const pad = { ...flight, phase: 'pad' };
  const fresh = createProximity();
  for (const dy of [100, 60, 40, 60, 100]) {
    o.y = -ROCKET_AXIS_OFFSET - dy;
    fresh.update(pad, [o], DT, (k) => kicks.push(k));
  }
  assert.equal(kicks.length, 0, 'на площадке тряски нет');
  fresh.update(flight, null, DT, () => {});
  fresh.update(null, [o], DT, () => {});
});

test('толчок камеры: слабый (до ~2 ед.), затухает за ~0,25 с, reduceMotion его гасит', () => {
  const layout = computeLayout(1280, 720, 1);
  const camera = createCamera();
  const target = { x: 0, y: -100, vx: 0, vy: 0, alt: 100 };
  camera.snap(target, layout);
  camera.addKick(0.75);
  camera.update(DT, target, layout, { reduceMotion: false });
  const first = Math.hypot(camera.shakeX, camera.shakeY);
  assert.ok(first > 0.05 && first <= CAMERA_TUNING.kickShake * 2, `начальная тряска ${first}`);
  assert.ok(CAMERA_TUNING.kickShake <= 2.5 && CAMERA_TUNING.maxShake >= 5, 'толчок слабее удара');
  for (let i = 0; i < 15; i++) camera.update(DT, target, layout, { reduceMotion: false }); // 0,25 с
  assert.ok(camera.kick < 0.02, `затухание ${camera.kick}`);
  const calm = createCamera();
  calm.snap(target, layout);
  calm.update(DT, target, layout, { reduceMotion: true });
  calm.addKick(0.75);
  assert.equal(calm.kick, 0);
  calm.update(DT, target, layout, { reduceMotion: true });
  assert.equal(Math.hypot(calm.shakeX, calm.shakeY), 0);
});
