import test from 'node:test';
import assert from 'node:assert/strict';
import { GROUND_DISTANCE, createMapView, groundDrop, groundScale, groundTransform, islandRect } from '../src/render/islandmap.js';
import { cloudLayers, cloudPass, cloudSize, drawCloudField, fallbackClouds } from '../src/render/clouds.js';
import { ROCK_MIN_DIAMETER, drawObjects, drawObjectsFront, rockDiameter } from '../src/render/objects.js';
import { clampCenter, createHub, fitScale } from '../src/render/hub.js';
import { createPainter } from '../src/render/painter.js';
import { computeLayout } from '../src/render/layout.js';
import { createView } from '../src/render/camera.js';
import { ISLAND } from '../src/render/manifest.js';
import { fakeAssets, makeStubCanvas, stubContext } from './render-helpers.mjs';

test('земля в полёте: на земле масштаб 1 без смещения, выше мельче и ниже, плавно', () => {
  assert.equal(groundScale(0), 1);
  assert.equal(groundDrop(0), 0);
  assert.ok(Math.abs(groundScale(GROUND_DISTANCE) - 0.5) < 1e-9);
  let previousScale = 1;
  let previousDrop = 0;
  for (let a = 5; a <= 6000; a += 5) {
    const s = groundScale(a);
    const d = groundDrop(a);
    assert.ok(s < previousScale && d > previousDrop, `монотонность на ${a}`);
    assert.ok(previousScale - s < 0.01 && d - previousDrop < 3.1, `нет скачка на ${a}`);
    previousScale = s;
    previousDrop = d;
  }
  const tr = groundTransform({}, 0, 3, 500, 400, 25);
  assert.equal(tr.s, 3);
  assert.equal(tr.oy, 500);
  assert.equal(tr.ox, 400 - 25 * 3);
});

test('параллакс: карта уходит вниз медленнее ракеты, у земли высота читается по расстоянию до тени', () => {
  const near = groundTransform({}, 100, 3, 500, 400, 0);
  const high = groundTransform({}, 1000, 3, 500, 400, 0);
  assert.ok(near.oy > 500 && high.oy > near.oy);
  assert.ok(high.oy - 500 < 3 * 1000, 'медленнее, чем при прямом сносе вниз');
  assert.ok(near.oy - 500 >= 3 * 100 * 0.55, 'у земли смещение заметно');
});

test('MapView: преобразования обратимы, границы соответствуют экрану', () => {
  const mv = createMapView().set(300, 200, 2, 1000, 600);
  assert.equal(mv.sx(0), 300);
  assert.equal(mv.sy(10), 220);
  assert.ok(Math.abs(mv.wx(mv.sx(77)) - 77) < 0.5);
  assert.equal(mv.left, -150);
  assert.equal(mv.right, 350);
  assert.equal(mv.top, -100);
  assert.equal(mv.bottom, 200);
  const rect = islandRect(mv);
  assert.ok(rect.x1 > rect.x0 && rect.y1 > rect.y0);
  assert.ok(Math.abs((rect.x1 - rect.x0) - ISLAND.widthUnits * 2) <= 1);
});

test('облака: слои растут с плотностью, виды дают разные формы, проходы делят облака на задние и передние', () => {
  assert.ok(cloudLayers({ kind: 'cumulus', density: 1 }) > cloudLayers({ kind: 'cumulus', density: 0.1 }));
  assert.ok(cloudLayers({ kind: 'storm', density: 1 }) >= 3);
  const aspect = 0.64;
  const [cw, ch] = cloudSize({ kind: 'cumulus', w: 200, h: 0 }, aspect);
  const [sw, sh] = cloudSize({ kind: 'stratus', w: 600, h: 0 }, aspect);
  const [rw, rh] = cloudSize({ kind: 'cirrus', w: 600, h: 0 }, aspect);
  const [tw, th] = cloudSize({ kind: 'storm', w: 300, h: 0 }, aspect);
  assert.ok(sh / sw < ch / cw && rh / rw < sh / sw, 'слоистые тоньше кучевых, перистые тончайшие');
  assert.ok(th / tw > ch / cw, 'грозовые выше кучевых');
  let front = 0;
  for (let id = 1; id <= 400; id++) if (cloudPass({ id, kind: 'cumulus' }) === 1) front++;
  assert.ok(front > 60 && front < 180, `передних ${front}`);
  assert.equal(cloudPass({ id: 5, kind: 'cirrus' }), 0);
});

test('облака рисуются только из списка sim и не двигаются сами; запасное поле неподвижно и детерминировано', () => {
  const painter = createPainter(fakeAssets(), makeStubCanvas);
  const view = createView().setStatic(0, -500, 200, 300, 2, 400, 600);
  const clouds = [
    { id: 1, kind: 'cumulus', x: 10, alt: 500, w: 200, h: 0, density: 0.8, storm: false, vx: 4 },
    { id: 2, kind: 'storm', x: -40, alt: 540, w: 300, h: 0, density: 1, storm: true, vx: 3 },
    { id: 3, kind: 'stratus', x: 100, alt: 480, w: 600, h: 0, density: 0.5, storm: false, vx: 2 },
  ];
  const a = stubContext(400, 600);
  const b = stubContext(400, 600);
  drawCloudField(a, painter, view, clouds, 0, 1, 0, 3);
  drawCloudField(a, painter, view, clouds, 1, 1, 0, 3);
  drawCloudField(b, painter, view, clouds, 0, 99, 0, 3);
  drawCloudField(b, painter, view, clouds, 1, 99, 0, 3);
  assert.ok(a.calls.drawImage > 0);
  assert.equal(a.calls.drawImage, b.calls.drawImage, 'время не влияет на положение и число облаков');
  assert.equal(drawCloudField(a, painter, view, null, 0, 0, 0, 0), undefined);
  const first = fallbackClouds(view, 0.6, true).map((c) => [c.id, c.kind, c.x, c.alt].join());
  const second = fallbackClouds(view, 0.6, true).map((c) => [c.id, c.kind, c.x, c.alt].join());
  assert.deepEqual(first, second);
  assert.ok(first.length > 0);
});

test('астероиды: размер по классу и радиусу sim, диаметр не меньше 60 ед.', () => {
  assert.equal(ROCK_MIN_DIAMETER, 60);
  assert.ok(rockDiameter({ size: 'medium', r: 20 }) >= 60);
  assert.ok(rockDiameter({ size: 'medium', radius: 30 }) >= 70);
  assert.ok(rockDiameter({ size: 'large', radius: 46 }) > rockDiameter({ size: 'medium', radius: 28 }));
  assert.ok(rockDiameter({ size: 'huge', radius: 70 }) > rockDiameter({ size: 'large', radius: 46 }));
  assert.ok(rockDiameter({ r: 28 }) >= 60, 'без size — как medium');
});

test('кольца: горизонтальные рисуются двумя половинами, задняя и передняя в разных проходах', () => {
  const painter = createPainter(fakeAssets(), makeStubCanvas);
  const view = createView().setStatic(0, -500, 200, 300, 2, 400, 600);
  const horizontal = [{ id: 9, kind: 'ring', active: true, x: 0, y: -500, r: 35, orient: 'horizontal', halfWidth: 38 }];
  const vertical = [{ id: 10, kind: 'ring', active: true, x: 0, y: -500, r: 35 }];
  const back = stubContext(400, 600);
  drawObjects(back, painter, view, horizontal, 2, 1);
  const front = stubContext(400, 600);
  drawObjectsFront(front, painter, view, horizontal, 2);
  assert.ok(back.calls.drawImage >= 1 && front.calls.drawImage >= 1);
  assert.ok(back.calls.clip >= 1 && front.calls.clip >= 1, 'половины вырезаются клипом');
  const legacy = stubContext(400, 600);
  drawObjectsFront(legacy, painter, view, vertical, 2);
  assert.equal(legacy.calls.drawImage || 0, 0, 'у вертикального кольца нет передней половины');
});

test('хаб: зум щипком держит точку под пальцами и не выходит за пределы', () => {
  const painter = createPainter(fakeAssets(), makeStubCanvas);
  const hub = createHub(painter, { profile: null });
  const layout = computeLayout(1280, 720, 1);
  const ctx = stubContext(1280, 720);
  const profile = { era: 0, parts: {}, buildings: {} };
  hub.draw(ctx, { profile, time: 0, layout });
  const before = hub.view;
  const x = 900;
  const y = 300;
  const s0 = before.scale;
  const mx = before.cx + (x - 640) / s0;
  const my = before.cy + (y - 360) / s0;
  hub.zoomBy(1.6, x, y);
  const after = hub.view;
  assert.ok(after.zoom > before.zoom);
  assert.ok(Math.abs(after.cx + (x - 640) / after.scale - mx) < 0.5 && Math.abs(after.cy + (y - 360) / after.scale - my) < 0.5, 'точка под курсором на месте');
  hub.zoomBy(1e6, x, y);
  const maxZoom = hub.view.zoom;
  hub.zoomBy(1e6, x, y);
  assert.equal(hub.view.zoom, maxZoom);
  hub.zoomBy(1e-6, x, y);
  assert.equal(hub.view.zoom, 1);
  hub.pan(1e5, 1e5);
  hub.pan(-1e5, -1e5);
  hub.draw(ctx, { profile, time: 1, layout });
});

test('хаб: портрет по умолчанию крупнее ландшафта; двойной тап приближает и возвращает', () => {
  const painter = createPainter(fakeAssets(), makeStubCanvas);
  const portrait = createHub(painter, { profile: null });
  const landscape = createHub(painter, { profile: null });
  const profile = { era: 0, parts: {}, buildings: {} };
  const pl = computeLayout(390, 844, 2);
  const ll = computeLayout(1280, 720, 1);
  portrait.draw(stubContext(780, 1688), { profile, time: 0, layout: pl });
  landscape.draw(stubContext(1280, 720), { profile, time: 0, layout: ll });
  const portraitVisible = 780 / portrait.view.scale;
  const landscapeVisible = 1280 / landscape.view.scale;
  assert.ok(portraitVisible < 400, `портрет показывает ${portraitVisible} ед.`);
  assert.ok(landscapeVisible > 600 && landscapeVisible < 1000, `ландшафт показывает ${landscapeVisible} ед.`);
  const ctx = stubContext(1280, 720);
  const start = landscape.view.zoom;
  landscape.toggleZoom(640, 360);
  for (let i = 1; i <= 80; i++) landscape.draw(ctx, { profile, time: i / 30, layout: ll });
  assert.ok(landscape.view.zoom > start * 1.5);
  landscape.toggleZoom(640, 360);
  for (let i = 81; i <= 160; i++) landscape.draw(ctx, { profile, time: i / 30, layout: ll });
  assert.ok(Math.abs(landscape.view.zoom - start) < 0.05);
});

test('хаб: focus на постройку приближает и ставит её в центр; clampCenter держит остров в кадре', () => {
  const painter = createPainter(fakeAssets(), makeStubCanvas);
  const hub = createHub(painter, { profile: null });
  const layout = computeLayout(390, 844, 2);
  const ctx = stubContext(780, 1688);
  const profile = { era: 0, parts: {}, buildings: { control: 1, gantry: 1 } };
  hub.focus('control', true);
  hub.draw(ctx, { profile, time: 0, layout });
  const pos = hub.screenPos('control');
  assert.ok(pos && Math.abs(pos.x - 195) < 40 && pos.y > 0 && pos.y < 844, JSON.stringify(pos));
  const [x, y] = clampCenter(1e6, -1e6, 1, 780, 1688);
  assert.ok(x <= ISLAND.leftUnits + ISLAND.widthUnits && y >= ISLAND.topUnits);
  assert.ok(fitScale(1280, 720) > 0 && fitScale(390, 844) < fitScale(1280, 720));
});

test('широкие облака собираются из кусков ограниченной ширины и покрывают свою ширину', async () => {
  const { cloudPieces } = await import('../src/render/clouds.js');
  const small = cloudPieces({ id: 3, kind: 'cumulus' }, 200, 100);
  assert.equal(small.length, 1);
  const bank = cloudPieces({ id: 4, kind: 'stratus' }, 3200, 80);
  assert.ok(bank.length >= 5);
  assert.ok(bank.every((p) => p.w <= 520 * 1.1 + 1e-6), 'кусок не растягивается шире предела');
  const left = Math.min(...bank.map((p) => p.dx - p.w / 2));
  const right = Math.max(...bank.map((p) => p.dx + p.w / 2));
  assert.ok(left <= -1500 && right >= 1500, `покрытие ${left}..${right}`);
  const again = cloudPieces({ id: 4, kind: 'stratus' }, 3200, 80);
  assert.deepEqual(again, bank, 'детерминировано');
});
