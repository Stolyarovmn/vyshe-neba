// Изометрическая база (render/hub-iso.js) и подъём камеры база → полёт (render/flight.js: tiltFrames, liftBlend).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createPainter } from '../src/render/painter.js';
import { createHub } from '../src/render/hub.js';
import { isoDrawItems, isoLayout } from '../src/render/hub-iso.js';
import { LIFT_TIME, createFlightRenderer, liftBlend, tiltFrames } from '../src/render/flight.js';
import { computeLayout } from '../src/render/layout.js';
import { BUILDING_ANCHORS, BUILDING_KEYS, ISLAND } from '../src/render/manifest.js';
import { createFlight, startRocket } from '../src/sim/index.js';
import { fakeAssets, makeStubCanvas, stubContext } from './render-helpers.mjs';

const allBuilt = () => ({ era: 0, skin: 'classic', parts: { booster: 1, capsule: 1 }, buildings: Object.fromEntries(BUILDING_KEYS.map((k) => [k, 1])) });

test('изометрия: раскладка читается из base-iso.json, у всех 14 построек есть якорь и размер, стол на карте', () => {
  const assets = fakeAssets({ iso: true });
  const layout = isoLayout(assets);
  assert.ok(layout, 'раскладка изометрии собрана');
  assert.deepEqual(Object.keys(layout.buildings).sort(), [...BUILDING_KEYS].sort());
  const [w, h] = layout.size;
  assert.ok(layout.pad.x > 0 && layout.pad.x < w && layout.pad.y > 0 && layout.pad.y < h);
  for (const [key, b] of Object.entries(layout.buildings)) {
    assert.ok(b.anchor[0] > 0 && b.anchor[0] < w && b.anchor[1] > 0 && b.anchor[1] < h, `${key}: якорь на карте`);
    assert.ok(b.size.every((v) => v > 0), key);
  }
  assert.ok(layout.strip.x1 - layout.strip.x0 > 0 && layout.strip.y1 - layout.strip.y0 > 0, 'полоса застройки');
});

test('изометрия: без раскладки остаётся прежний хаб сверху', () => {
  assert.equal(isoLayout(fakeAssets()), null);
  assert.equal(createHub(createPainter(fakeAssets(), makeStubCanvas), { profile: null }).mode(), 'top');
  assert.equal(createHub(createPainter(fakeAssets({ iso: true }), makeStubCanvas), { profile: null }).mode(), 'iso');
});

test('изометрия: очередь отрисовки по низу спрайта, ракета на месте стола', () => {
  const assets = fakeAssets({ iso: true });
  const layout = isoLayout(assets);
  const items = isoDrawItems(layout, allBuilt().buildings, assets);
  assert.equal(items.length, BUILDING_KEYS.length + 1);
  for (let i = 1; i < items.length; i++) assert.ok(items[i].y >= items[i - 1].y);
  assert.equal(items.find((it) => it.key === 'rocket').y, layout.pad.y);
});

test('изометрия: хаб рисуется, все постройки — цели нажатия, широкий экран показывает всю застройку', () => {
  const painter = createPainter(fakeAssets({ iso: true }), makeStubCanvas);
  const hub = createHub(painter, { profile: null });
  const layout = computeLayout(1920, 1080, 1);
  const ctx = stubContext(1920, 1080);
  hub.draw(ctx, { profile: allBuilt(), time: 0, layout });
  for (const key of BUILDING_KEYS) {
    const pos = hub.screenPos(key);
    assert.ok(pos, `${key}: есть на экране`);
    assert.ok(pos.x >= 0 && pos.x <= 1920 && pos.y >= 0 && pos.y <= 1080, `${key}: в кадре (${Math.round(pos.x)}, ${Math.round(pos.y)})`);
    // в центре спрайта нажатие попадает в эту постройку или в соседнюю, нарисованную поверх (радар перед цехом)
    assert.ok(BUILDING_KEYS.includes(hub.hitTest(pos.x, pos.y)), `${key}: нажатие в центре`);
  }
  assert.ok(hub.hitTest(hub.screenPos('rocket').x, hub.screenPos('rocket').y), 'ракета — цель нажатия');
});

test('изометрия: matchPad ставит стол в заданную точку экрана в масштабе полёта', () => {
  const painter = createPainter(fakeAssets({ iso: true }), makeStubCanvas);
  const hub = createHub(painter, { profile: null });
  const layout = computeLayout(1280, 720, 1);
  const ctx = stubContext(1280, 720);
  hub.draw(ctx, { profile: allBuilt(), time: 0, layout });
  const flight = createFlightRenderer(painter, { profile: null });
  const f = flight.restFraming(layout, 1280, 720, 'booster', 0);
  assert.ok([f.ax, f.feetY, f.pxPerUnit].every(Number.isFinite) && f.pxPerUnit > 0);
  hub.matchPad(f.ax, f.feetY, f.pxPerUnit, true);
  hub.draw(ctx, { profile: allBuilt(), time: 0.01, layout });
  const iso = isoLayout(painter.assets);
  assert.ok(Math.abs(hub.view.scale * iso.pad.rocketScale - f.pxPerUnit) < 1e-6, 'масштаб стола = масштаб полёта');
});

test('подъём камеры: кадры от изометрии к карте полёта, у каждого стол и все постройки', () => {
  const frames = tiltFrames(fakeAssets({ iso: true }));
  assert.ok(frames && frames.length >= 3, 'есть изометрия, промежуточные ракурсы и карта');
  assert.equal(frames[frames.length - 1].pad, ISLAND.launchOrigin, 'последний кадр — карта полёта');
  for (const fr of frames) {
    assert.ok(fr.size.every((v) => v > 0) && fr.pad.every(Number.isFinite));
    for (const key of BUILDING_KEYS) assert.ok(fr.buildings[key]?.length, `${key}: якорь в кадре ${fr.asset?.name}`);
  }
  const map = frames[frames.length - 1].buildings;
  for (const key of BUILDING_KEYS) assert.deepEqual(map[key], BUILDING_ANCHORS[key].e0.anchors, `${key}: карта = якоря E0`);
  assert.equal(tiltFrames(fakeAssets()), null, 'без изометрии подъёма нет');
});

test('подъём камеры: ход u проходит все кадры без пропусков и не выходит за ряд', () => {
  for (const n of [3, 5]) {
    assert.deepEqual(liftBlend(0, n), { i: 0, b: 0 });
    const end = liftBlend(1, n);
    assert.equal(end.i, n - 2);
    assert.ok(end.b > 0.999);
    let last = -1;
    for (let u = 0; u <= 1; u += 0.01) {
      const { i, b } = liftBlend(u, n);
      assert.ok(i >= 0 && i <= n - 2 && b >= 0 && b <= 1);
      assert.ok(i + b >= last - 1e-9, 'монотонно');
      last = i + b;
    }
  }
  assert.ok(LIFT_TIME > 0 && LIFT_TIME < 2);
});

test('подъём камеры: первые кадры полёта рисуют изометрию и все постройки, затем карту', () => {
  const painter = createPainter(fakeAssets({ iso: true }), makeStubCanvas);
  const renderer = createFlightRenderer(painter, { profile: null });
  assert.equal(renderer.hasTilt(), true);
  const layout = computeLayout(1280, 720, 1);
  const config = startRocket({ seed: 3, era: 0 });
  const flight = createFlight(config);
  renderer.start(flight);
  const profile = allBuilt();
  const counts = [];
  for (let i = 0; i <= 6; i++) {
    const ctx = stubContext(1280, 720);
    renderer.draw(ctx, { flight, config, time: 10 + i * LIFT_TIME / 4, layout, settings: {}, profile, dt: 0 });
    counts.push(ctx.calls.drawImage || 0);
  }
  assert.ok(counts.every((n) => n > BUILDING_KEYS.length), `кадры нарисованы: ${counts.join(', ')}`);
});
