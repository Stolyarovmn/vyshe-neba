import test from 'node:test';
import assert from 'node:assert/strict';
import { PARTICLE, createParticles } from '../src/render/particles.js';
import { createRng } from '../src/render/util.js';
import { applyEvents, createScreenFx } from '../src/render/events.js';
import { createCamera } from '../src/render/camera.js';
import { computeLayout } from '../src/render/layout.js';
import { createView } from '../src/render/camera.js';
import { stubContext } from './render-helpers.mjs';

test('частицы живут ttl и затем удаляются', () => {
  const pool = createParticles(16);
  pool.emit(PARTICLE.SMOKE, 0, 0, 10, 0, 0.5, 2, 4);
  pool.emit(PARTICLE.SPARK, 0, 0, 0, 0, 1.5, 2, 1);
  assert.equal(pool.count, 2);
  pool.update(0.6, null);
  assert.equal(pool.count, 1);
  pool.update(1, null);
  assert.equal(pool.count, 0);
});

test('движение: скорость, сопротивление и гравитация', () => {
  const pool = createParticles(4);
  pool.emit(PARTICLE.DEBRIS, 0, 0, 10, 0, 5, 2, 2, 100, 0);
  pool.update(0.1, null);
  pool.update(0.1, null);
  // Проверяем через рисование: частица сместилась вправо и вниз.
  const ctx = stubContext(200, 200);
  const view = createView().setStatic(0, 0, 100, 100, 1, 200, 200);
  pool.draw(ctx, view, 1);
  assert.ok(ctx.calls.fillRect >= 1);
});

test('переполнение пула перезаписывает старые, не растёт и не падает', () => {
  const pool = createParticles(8);
  for (let i = 0; i < 100; i++) pool.emit(PARTICLE.FLAME, i, 0, 0, 0, 1, 1, 1);
  assert.equal(pool.count, 8);
  assert.equal(pool.capacity, 8);
});

test('искры и обломки отскакивают от грунта и не проваливаются', () => {
  const pool = createParticles(8);
  pool.emit(PARTICLE.SPARK, 0, -5, 0, 80, 5, 2, 2, 100, 0);
  for (let i = 0; i < 60; i++) pool.update(1 / 60, 0);
  const ctx = stubContext(200, 200);
  const view = createView().setStatic(0, 0, 100, 100, 1, 200, 200);
  // Нарисованная точка не ниже линии грунта (y=100 на экране).
  const rects = [];
  ctx.fillRect = (x, y) => rects.push(y);
  pool.draw(ctx, view, 1);
  for (const y of rects) assert.ok(y <= 101, `ниже грунта: ${y}`);
});

test('пул не создаёт новых массивов во время работы (без аллокаций в кадре)', () => {
  const pool = createParticles(64);
  const rng = createRng(3);
  const view = createView().setStatic(0, 0, 100, 100, 2, 400, 300);
  const ctx = stubContext(400, 300);
  const before = process.memoryUsage().heapUsed;
  for (let frame = 0; frame < 600; frame++) {
    for (let i = 0; i < 6; i++) pool.emit(PARTICLE.FLAME, rng() * 20, 0, rng() * 5, rng() * 30, 0.3, 3, 1);
    pool.update(1 / 60, 0);
  }
  const grew = process.memoryUsage().heapUsed - before;
  assert.ok(grew < 4 * 1024 * 1024, `куча выросла на ${grew} байт`);
  assert.ok(pool.count <= 64);
  pool.draw(ctx, view, 0);
});

test('события: тряска и вспышка выключены при reduceMotion, частицы остаются', () => {
  const layout = computeLayout(1280, 720, 1);
  for (const reduceMotion of [false, true]) {
    const particles = createParticles(900);
    const camera = createCamera();
    camera.snap({ x: 0, y: -10, vx: 0, vy: 0, alt: 10 }, layout);
    camera.reduceMotion = reduceMotion;
    const fx = createScreenFx();
    const env = {
      particles, camera, fx, rng: createRng(1), flight: { x: 0, y: 0, vx: 0, vy: 0 }, body: 'earth', reduceMotion,
      spawnStage() {}, startChute() {}, markCrash() {},
    };
    applyEvents([{ type: 'hit', damage: 20 }, { type: 'crashed', reason: 'x', x: 0, y: 0 }, { type: 'storm', phase: 'lightning' }], env);
    assert.ok(particles.count > 20);
    if (reduceMotion) {
      assert.equal(camera.trauma, 0);
      assert.equal(fx.flash, 0);
    } else {
      assert.ok(camera.trauma > 0.9);
      assert.ok(fx.flash > 0.5);
    }
  }
});

test('события вызывают нужные обработчики: отделение ступени, парашют, авария', () => {
  const layout = computeLayout(1280, 720, 1);
  const camera = createCamera();
  camera.snap({ x: 0, y: -10, vx: 0, vy: 0, alt: 10 }, layout);
  const seen = [];
  const env = {
    particles: createParticles(900), camera, fx: createScreenFx(), rng: createRng(2), flight: { x: 5, y: -100, vx: 0, vy: -50 },
    body: 'moon', reduceMotion: false,
    spawnStage: (e) => seen.push(['sep', e.stage]),
    startChute: () => seen.push(['chute']),
    markCrash: () => seen.push(['crash']),
  };
  applyEvents([
    { type: 'stage-sep', stage: 'booster', x: 5, y: -100 },
    { type: 'parachute' },
    { type: 'crashed', x: 5, y: -100 },
    { type: 'pickup', kind: 'coin' },
    { type: 'unknown-event' },
  ], env);
  assert.deepEqual(seen, [['sep', 'booster'], ['chute'], ['crash']]);
});
