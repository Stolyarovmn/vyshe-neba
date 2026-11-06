import test from 'node:test';
import assert from 'node:assert/strict';
import { createPainter } from '../src/render/painter.js';
import { createFlightRenderer } from '../src/render/flight.js';
import { computeLayout } from '../src/render/layout.js';
import { activeKind, canopyOpening, flameShape, stackHeight, stackParts } from '../src/render/rocket.js';
import { createStubFlight } from '../src/render/dev/stub-flight.js';
import { createFlight, heavyRocket, startRocket, step } from '../src/sim/index.js';
import { fakeAssets, makeStubCanvas, stubContext } from './render-helpers.mjs';

function setup({ w = 960, h = 540, dpr = 2, missing } = {}) {
  const painter = createPainter(fakeAssets({ missing }), makeStubCanvas);
  const renderer = createFlightRenderer(painter, { profile: null });
  return { renderer, layout: computeLayout(w, h, dpr), ctx: stubContext(w * dpr, h * dpr) };
}

const stubOptions = (scenario, extra = {}) => ({
  scenario, body: 'earth', era: 2, alt: 800, throttle: 1, angle: 0, stage: 'booster', weather: { kind: 'cloudy' }, objects: true, time: 1, ...extra,
});

test('стек ракеты: разгонный блок + ядро, ядро, капсула', () => {
  assert.deepEqual(stackParts('booster').map((p) => p.base), ['booster', 'core']);
  assert.deepEqual(stackParts('core').map((p) => p.base), ['core']);
  assert.deepEqual(stackParts('capsule').map((p) => p.base), ['capsule']);
  assert.ok(stackHeight('booster') > stackHeight('core'));
  assert.ok(stackHeight('core') > stackHeight('capsule'));
  assert.equal(activeKind(['booster', 'core', 'capsule'], 0), 'booster');
  assert.equal(activeKind(['booster', 'core', 'capsule'], 1), 'core');
  assert.equal(activeKind(['booster', 'core', 'capsule'], 2), 'capsule');
  assert.equal(activeKind(['core', 'capsule'], 9), 'capsule');
});

test('пламя: в атмосфере короткое и широкое, в вакууме длинное и тонкое', () => {
  const air = flameShape(1, 1, false, 'core');
  const vacuum = flameShape(1, 0, false, 'core');
  assert.ok(air.half > vacuum.half);
  assert.ok(vacuum.length > air.length);
  assert.ok(flameShape(1, 1, true, 'core').length > air.length);
  assert.ok(flameShape(0.2, 1, false, 'core').length < air.length);
  assert.ok(flameShape(1, 1, false, 'capsule').length < air.length);
});

test('раскрытие парашюта монотонно растёт и завершается около единицы', () => {
  let last = -1;
  for (let p = 0; p <= 1.0001; p += 0.05) {
    const v = canopyOpening(p);
    assert.ok(v >= last - 0.08, `p=${p}`);
    last = v;
  }
  assert.ok(Math.abs(canopyOpening(1) - 1) < 0.01);
  assert.equal(canopyOpening(0), 0);
});

test('все сценарии стенда рисуются: земля, Луна, Марс, любая высота и погода', () => {
  const { renderer, layout, ctx } = setup();
  const stub = createStubFlight();
  let time = 0;
  for (const body of ['earth', 'moon', 'mars']) {
    for (const scenario of ['pad', 'launch', 'ascent', 'space', 'descent', 'chute', 'landing', 'loop', 'free']) {
      for (const alt of [0, 150, 1200, 6500, 12000]) {
        for (const weather of ['clear', 'storm']) {
          time += 0.05;
          const state = stub.update(1 / 60, stubOptions(scenario, { body, alt, time, weather: { kind: weather }, stage: ['booster', 'core', 'capsule'][alt % 3] }));
          renderer.events(state.events, state.flight);
          renderer.draw(ctx, { flight: state.flight, config: state.config, time, layout, settings: {} });
        }
      }
    }
  }
  assert.ok(ctx.calls.drawImage > 100);
});

test('настоящая sim: полный полёт до посадки рисуется без исключений в обеих ориентациях', () => {
  for (const [w, h, dpr] of [[390, 844, 3], [1280, 720, 1]]) {
    const { renderer, layout, ctx } = setup({ w, h, dpr });
    const config = heavyRocket({ seed: 5, era: 3, base: { radar: 1, beacons: 1 } });
    const flight = createFlight(config);
    renderer.start(flight, config);
    let time = 0;
    let frames = 0;
    for (let i = 0; i < 4000 && !flight.ended; i++) {
      const input = { throttle: flight.time > 1 && flight.alt < 900 && flight.vy < 30 ? 1 : 0, tilt: 0.1, parachute: flight.alt < 300 && flight.vy > 0 };
      const events = step(flight, input, 1 / 120);
      if (events.length) renderer.events(events);
      if (i % 2 === 0) {
        time += 1 / 60;
        renderer.draw(ctx, { flight, config, time, layout, settings: { reduceMotion: i % 7 === 0 } });
        frames++;
      }
    }
    assert.ok(frames > 100);
    assert.ok(renderer.particles.count <= renderer.particles.capacity);
  }
});

test('sim: посадка на Луне и перелёт рисуются (поверхность, площадка, варп)', () => {
  const { renderer, layout, ctx } = setup();
  const config = heavyRocket({ seed: 2, era: 4, destination: 'moon', start: { body: 'moon' } });
  const flight = createFlight(config);
  renderer.start(flight, config);
  for (let i = 0; i < 600; i++) {
    const events = step(flight, { throttle: flight.vy > 25 ? 1 : 0 }, 1 / 60);
    renderer.events(events);
    renderer.draw(ctx, { flight, config, time: i / 60, layout, settings: {} });
  }
  const transfer = createFlight(heavyRocket({ seed: 3, era: 4, destination: 'moon' }));
  transfer.phase = 'transfer';
  transfer.transfer = { t: 1.2, cost: 1 };
  renderer.draw(ctx, { flight: transfer, config: transfer.cfg, time: 99, layout, settings: {} });
});

test('новый полёт сбрасывает частицы и камеру; start вызывается явно или по смене объекта', () => {
  const { renderer, layout, ctx } = setup();
  const a = createFlight(startRocket({ seed: 1 }));
  renderer.draw(ctx, { flight: a, config: a.cfg, time: 0, layout, settings: {} });
  renderer.events([{ type: 'crashed', x: 0, y: 0 }], a);
  assert.ok(renderer.particles.count > 20);
  const b = createFlight(startRocket({ seed: 2 }));
  renderer.draw(ctx, { flight: b, config: b.cfg, time: 0.1, layout, settings: {} });
  assert.equal(renderer.particles.count < 20, true);
  renderer.start(b, b.cfg);
  assert.equal(renderer.particles.count, 0);
});

test('timeScale замедляет только после касания и аварии и не при reduceMotion', () => {
  const { renderer, layout, ctx } = setup();
  const flight = createFlight(startRocket({ seed: 1 }));
  renderer.draw(ctx, { flight, config: flight.cfg, time: 0, layout, settings: {} });
  assert.equal(renderer.timeScale, 1);
  renderer.events([{ type: 'touch', ok: false, x: 0 }], flight);
  assert.ok(renderer.timeScale < 1);
  const calm = setup();
  const f2 = createFlight(startRocket({ seed: 1 }));
  calm.renderer.draw(calm.ctx, { flight: f2, config: f2.cfg, time: 0, layout: calm.layout, settings: { reduceMotion: true } });
  calm.renderer.events([{ type: 'touch', ok: false, x: 0 }], f2);
  assert.equal(calm.renderer.timeScale, 1);
});

test('отсутствующие ассеты не ломают полёт: запасные формы', () => {
  const { renderer, layout, ctx } = setup({ missing: ['core_1978', 'capsule_1978', 'terrain_moon', 'pad_moon_1978', 'island_start', 'cloud_0', 'coin_1978'] });
  const stub = createStubFlight();
  for (const body of ['earth', 'moon']) {
    const state = stub.update(1 / 60, stubOptions('ascent', { body, era: 0, alt: body === 'moon' ? 100 : 400, stage: 'core' }));
    renderer.draw(ctx, { flight: state.flight, config: state.config, time: 1, layout, settings: {} });
  }
});

test('маркер посадочной зоны и линия прогноза не показываются на старте и пока ракета стоит', async () => {
  const { landingZoneAlpha } = await import('../src/render/overlays.js');
  const base = { liftedOff: true, phase: 'descent', alt: 400 };
  assert.equal(landingZoneAlpha({ ...base, liftedOff: false, phase: 'pad', alt: 0 }), 0);
  assert.equal(landingZoneAlpha({ ...base, phase: 'pad', alt: 3 }), 0);
  assert.equal(landingZoneAlpha({ ...base, phase: 'ascent', alt: 4 }), 0);
  assert.equal(landingZoneAlpha({ ...base, phase: 'landed', alt: 0 }), 0);
  assert.equal(landingZoneAlpha({ ...base, phase: 'crashed', alt: 0 }), 0);
  // на спуске маркер подчиняется правилу тени: виден ниже 400 м (40 ед.) и гаснет к этой высоте
  assert.equal(landingZoneAlpha({ ...base, alt: 200 }), 0);
  assert.equal(landingZoneAlpha({ ...base, alt: 40 }), 0);
  assert.ok(landingZoneAlpha({ ...base, alt: 20 }) > 0.3 && landingZoneAlpha({ ...base, alt: 20 }) < 0.7);
  assert.ok(landingZoneAlpha({ ...base, alt: 2 }) > 0.95);
  assert.equal(landingZoneAlpha({ ...base, alt: 20, phase: 'space' }) > 0, true);
  // sim кладёт высоту над землёй и дальность в state: рендер берёт их, а не высоту над стартом
  assert.equal(landingZoneAlpha({ ...base, alt: 5, heightAboveGround: 60 }), 0);
  assert.ok(landingZoneAlpha({ ...base, alt: 5, heightAboveGround: 10, shadowRange: 80 }) > 0.8);
});

test('дальний луч над площадкой растёт после отрыва и не зависит от дальности тени', async () => {
  const { landingBeamAlpha } = await import('../src/render/overlays.js');
  assert.equal(landingBeamAlpha({ liftedOff: false, phase: 'pad', alt: 0 }), 0);
  assert.equal(landingBeamAlpha({ liftedOff: true, phase: 'landed', alt: 0 }), 0);
  assert.equal(landingBeamAlpha({ liftedOff: true, phase: 'descent', alt: 400 }), 1);
  assert.ok(landingBeamAlpha({ liftedOff: true, phase: 'ascent', alt: 40 }) > 0);
});

test('тень и маркер: общая формула alpha = 0,42 * (1 - smoothstep(0, 40, высота)), размер и смещение растут с высотой 1:1', async () => {
  const { SHADOW_RANGE, groundMarkAlpha, shadowGeometry, heightAboveGround } = await import('../src/render/overlays.js');
  assert.equal(SHADOW_RANGE, 40);
  assert.ok(Math.abs(groundMarkAlpha(0, 40, 0.42) - 0.42) < 1e-9);
  assert.equal(groundMarkAlpha(40, 40, 0.42), 0);
  assert.equal(groundMarkAlpha(400, 40, 0.42), 0);
  let previous = 1;
  for (let h = 0; h <= 40; h += 2) {
    const a = groundMarkAlpha(h);
    assert.ok(a <= previous + 1e-9, 'тень не светлеет обратно');
    previous = a;
  }
  const low = shadowGeometry(0, {});
  const high = shadowGeometry(40, {});
  assert.ok(high.dx > low.dx && high.dy > low.dy && high.rx > low.rx && high.ry > low.ry, 'выше — больше и дальше от ракеты');
  assert.equal(heightAboveGround({ heightAboveGround: 12, alt: 50 }), 12);
  assert.equal(heightAboveGround({ alt: 50 }), 50);
  assert.equal(heightAboveGround({ y: -70 }), 70);
});
