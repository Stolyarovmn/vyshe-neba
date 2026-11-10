import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CAMERA_TUNING, createCamera, createView, landingBoost, pixelSnapZoom, zoomForSpeed,
} from '../src/render/camera.js';
import { computeLayout } from '../src/render/layout.js';

const target = (extra = {}) => ({ x: 100, y: -500, vx: 0, vy: 0, alt: 500, ...extra });

test('после snap ракета в точке якоря (портрет и ландшафт)', () => {
  for (const layout of [computeLayout(390, 844, 3), computeLayout(1280, 720, 1)]) {
    const camera = createCamera();
    const view = createView();
    camera.snap(target(), layout);
    view.set(camera, layout, layout.world.px, layout.w * layout.dpr, layout.h * layout.dpr);
    const devPerCss = layout.dpr;
    assert.ok(Math.abs(view.sx(100) - layout.rocketAnchor.x * devPerCss) <= 1);
    assert.ok(Math.abs(view.sy(-500) - layout.rocketAnchor.y * devPerCss) <= 1);
  }
});

test('камера догоняет движущуюся цель без рывков', () => {
  const layout = computeLayout(1280, 720, 1);
  const camera = createCamera();
  camera.snap(target(), layout);
  let t = target({ vy: -80 });
  let previous = camera.y;
  for (let i = 0; i < 240; i++) {
    t = { ...t, y: t.y - 80 / 60 };
    camera.update(1 / 60, t, layout, {});
    const step = Math.abs(camera.y - previous);
    assert.ok(step < 3, `шаг камеры ${step}`);
    previous = camera.y;
  }
  assert.ok(Math.abs(camera.y - t.y) < 120, `отставание ${camera.y - t.y}`);
});

test('зум по скорости монотонен и ограничен', () => {
  let last = 2;
  for (const speed of [0, 20, 40, 80, 120, 160, 190, 400]) {
    const z = zoomForSpeed(speed);
    assert.ok(z <= last + 1e-9);
    assert.ok(z >= 1 - CAMERA_TUNING.zoomOutAmount - 1e-9 && z <= 1);
    last = z;
  }
  assert.equal(zoomForSpeed(0), 1);
});

test('приближение к посадке только при спуске у земли', () => {
  assert.equal(landingBoost(100, -5, 5), 0);
  assert.equal(landingBoost(100, 40, 120), 0);
  assert.ok(landingBoost(50, 20, 20) > 0.1);
  assert.equal(landingBoost(2000, 20, 20), 0);
});

test('pixelSnapZoom непрерывен и «прилипает» к 1', () => {
  assert.equal(pixelSnapZoom(1), 1);
  assert.ok(Math.abs(pixelSnapZoom(1.01) - 1) < 0.01);
  assert.equal(pixelSnapZoom(0.8), 0.8);
  let prev = pixelSnapZoom(0.9);
  for (let z = 0.9; z <= 1.2; z += 0.002) {
    const v = pixelSnapZoom(z);
    assert.ok(Math.abs(v - prev) < 0.01, `скачок в ${z}`);
    prev = v;
  }
});

test('якорь уезжает к центру при горизонтальном движении в ландшафте', () => {
  const layout = computeLayout(1280, 720, 1);
  const camera = createCamera();
  camera.snap(target(), layout);
  const startX = camera.ax;
  for (let i = 0; i < 300; i++) camera.update(1 / 60, target({ vx: 90, vy: 0, x: 100 + i * 1.5 }), layout, {});
  assert.ok(camera.ax > startX + 100);
  assert.ok(Math.abs(camera.ax - layout.rocketAnchorH.x) < 5);
});

test('тряска: затухает, складывается и отключается reduceMotion', () => {
  const layout = computeLayout(1280, 720, 1);
  const camera = createCamera();
  camera.snap(target(), layout);
  camera.addTrauma(0.6);
  camera.addTrauma(0.6);
  assert.equal(camera.trauma, 1);
  camera.update(1 / 60, target(), layout, {});
  assert.ok(Math.hypot(camera.shakeX, camera.shakeY) > 0);
  for (let i = 0; i < 200; i++) camera.update(1 / 60, target(), layout, {});
  assert.equal(camera.trauma, 0);
  assert.equal(camera.shakeX, 0);

  const calm = createCamera();
  calm.snap(target(), layout);
  calm.update(1 / 60, target(), layout, { reduceMotion: true });
  calm.addTrauma(1);
  calm.setRumble(1);
  calm.update(1 / 60, target(), layout, { reduceMotion: true });
  assert.equal(calm.trauma, 0);
  assert.equal(calm.shakeX, 0);
  assert.equal(calm.shakeY, 0);
});

test('view: преобразование мир -> экран обратимо, границы согласованы', () => {
  const layout = computeLayout(844, 390, 2);
  const camera = createCamera();
  const view = createView();
  camera.snap(target({ x: -40, y: -1200 }), layout);
  view.set(camera, layout, layout.world.px, 844 * 2, 390 * 2);
  for (const [x, y] of [[-40, -1200], [200, -1100], [-300, -1300]]) {
    assert.ok(Math.abs(view.wx(view.sx(x)) - x) <= 1 / view.S);
    assert.ok(Math.abs(view.wy(view.sy(y)) - y) <= 1 / view.S);
  }
  assert.ok(view.left < view.right && view.top < view.bottom);
  assert.ok(Math.abs((view.right - view.left) * view.S - 844 * 2) < 1e-6);
});
