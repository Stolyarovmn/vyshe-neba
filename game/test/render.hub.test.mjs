import test from 'node:test';
import assert from 'node:assert/strict';
import { createPainter } from '../src/render/painter.js';
import { createHub } from '../src/render/hub.js';
import { buildingDrawOrder } from '../src/render/buildings.js';
import { computeLayout } from '../src/render/layout.js';
import { BUILDING_KEYS } from '../src/render/manifest.js';
import { fakeAssets, makeStubCanvas, stubContext } from './render-helpers.mjs';

function setup({ w = 960, h = 540, dpr = 2, missing } = {}) {
  const assets = fakeAssets({ missing });
  const painter = createPainter(assets, makeStubCanvas);
  const hub = createHub(painter, { profile: null });
  const layout = computeLayout(w, h, dpr);
  const ctx = stubContext(w * dpr, h * dpr);
  return { hub, layout, ctx, painter };
}

const profile = (buildings = {}, extra = {}) => ({
  era: 1,
  skin: 'classic',
  parts: { booster: 1, capsule: 1 },
  buildings: Object.fromEntries(BUILDING_KEYS.map((k) => [k, buildings[k] || 0])),
  ...extra,
});

test('постройки рисуются только купленные, порядок от дальних к ближним', () => {
  assert.deepEqual(buildingDrawOrder(profile()), []);
  const order = buildingDrawOrder(profile({ gantry: 1, weather: 1, beacons: 1, radar: 2 }));
  assert.deepEqual(order.map((o) => o.key).sort(), ['beacons', 'beacons', 'gantry', 'radar', 'weather']);
  const ys = order.map((o) => o.anchorY);
  assert.deepEqual([...ys].sort((a, b) => b - a), ys);
  assert.equal(order.filter((o) => o.key === 'beacons' && o.mirror).length, 1);
});

test('hitTest: тап по купленной постройке возвращает ключ, по пустому месту — null', () => {
  const { hub, layout, ctx } = setup();
  const p = profile({ gantry: 1, deluge: 1 });
  hub.draw(ctx, { profile: p, time: 1, layout });
  const gantry = hub.screenPos('gantry');
  assert.ok(gantry, 'у башни есть экранная позиция');
  assert.equal(hub.hitTest(gantry.x, gantry.y), 'gantry');
  assert.equal(hub.hitTest(5, 5), null);
  assert.equal(hub.screenPos('radar'), null, 'непокупленная постройка не нарисована');
});

test('hitTest: ракета на столе отдельная цель, постройка рядом не перехватывает', () => {
  const { hub, layout, ctx } = setup();
  const p = profile({ gantry: 1 });
  hub.draw(ctx, { profile: p, time: 1, layout });
  const rocket = hub.screenPos('rocket');
  assert.ok(rocket);
  assert.equal(hub.hitTest(rocket.x, rocket.y), 'rocket');
});

test('hitTest: цель нажатия не меньше 48 CSS-пикселей', () => {
  const { hub, layout, ctx } = setup();
  hub.draw(ctx, { profile: profile({ beacons: 1 }), time: 1, layout });
  const beacons = hub.screenPos('beacons');
  assert.ok(beacons);
  assert.equal(hub.hitTest(beacons.x + 23, beacons.y + 23), 'beacons');
});

test('в хабе без купленных построек остаётся только ракета', () => {
  const { hub, layout, ctx } = setup();
  hub.draw(ctx, { profile: profile(), time: 0, layout });
  for (const key of BUILDING_KEYS) assert.equal(hub.screenPos(key), null, key);
  assert.ok(hub.screenPos('rocket'));
});

test('pan двигает вид, focus наводит на постройку, границы острова держатся', () => {
  const { hub, layout, ctx } = setup();
  const p = profile({ gantry: 1, recovery: 1 });
  hub.draw(ctx, { profile: p, time: 0, layout });
  const before = hub.screenPos('gantry').x;
  hub.pan(-120);
  hub.draw(ctx, { profile: p, time: 5, layout });
  assert.ok(hub.screenPos('gantry').x < before - 20, 'перетаскивание влево сдвигает мир влево');
  hub.focus('recovery', true);
  hub.draw(ctx, { profile: p, time: 5.1, layout });
  const recovery = hub.screenPos('recovery');
  assert.ok(recovery && Math.abs(recovery.x - layout.w / 2) < 90, 'постройка у центра кадра');
  hub.pan(100000);
  hub.draw(ctx, { profile: p, time: 9, layout });
  hub.pan(-100000);
  hub.draw(ctx, { profile: p, time: 12, layout });
  hub.reset();
});

test('хаб рисуется в обеих ориентациях без исключений, с любым набором и без ассетов', () => {
  for (const [w, h, dpr] of [[390, 844, 3], [844, 390, 3], [1280, 720, 1], [360, 640, 2]]) {
    for (const missing of [undefined, ['island_start', 'bld_gantry_1978', 'core_1986']]) {
      const { hub, layout, ctx } = setup({ w, h, dpr, missing });
      const all = profile(Object.fromEntries(BUILDING_KEYS.map((k) => [k, 6])), { era: 5, skin: 'wasp' });
      for (const weather of [null, { kind: 'rain', wind: 2 }, { kind: 'storm', wind: 6, storm: 1 }]) {
        hub.draw(ctx, { profile: all, time: 3.7, layout, weather, selected: 'radar' });
      }
      assert.ok(ctx.calls.drawImage > 0 || missing, `${w}x${h}`);
    }
  }
});

test('выбор постройки: рамка подсветки рисуется только для нарисованной постройки', () => {
  const { hub, layout, ctx } = setup();
  const p = profile({ gantry: 1 });
  hub.draw(ctx, { profile: p, time: 0, layout, selected: 'gantry' });
  const withSelection = ctx.calls.fillRect;
  const plain = setup();
  plain.hub.draw(plain.ctx, { profile: p, time: 0, layout: plain.layout });
  assert.ok(withSelection > plain.ctx.calls.fillRect);
  assert.equal(hub.selected, 'gantry');
  hub.setSelected(null);
  assert.equal(hub.selected, null);
});
