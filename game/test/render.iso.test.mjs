// Изометрическая база (render/hub-iso.js) и подъём камеры база → полёт (render/flight.js: tiltFrames, liftBlend).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createPainter } from '../src/render/painter.js';
import { createHub } from '../src/render/hub.js';
import { ISO_LAMPS, drawLamps, isoBuildingSprite, isoDrawItems, isoLayout } from '../src/render/hub-iso.js';
import { createMapView } from '../src/render/islandmap.js';
import { ISO_PART_CLIPS, clipOpen } from '../src/render/iso-clips.js';
import { LIFT_TIME, createFlightRenderer, fitAffine, liftBlend, tiltFrames } from '../src/render/flight.js';
import { computeLayout } from '../src/render/layout.js';
import { BUILDING_ANCHORS, BUILDING_KEYS, ENTRY_KEYS, ISLAND } from '../src/render/manifest.js';
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
  assert.equal(items.length, BUILDING_KEYS.length + ENTRY_KEYS.length + 1);
  assert.equal(isoDrawItems(layout, {}, assets).length, ENTRY_KEYS.length + 1, 'входы есть и без построек');
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

test('изометрия: ангар, лавка, доска и памятник стоят на карте и открываются нажатием', () => {
  const assets = fakeAssets({ iso: true });
  const layout = isoLayout(assets);
  assert.deepEqual(Object.keys(layout.entries).sort(), [...ENTRY_KEYS].sort());
  const [w, h] = layout.size;
  for (const [key, e] of Object.entries(layout.entries)) {
    assert.ok(e.anchor[0] > 0 && e.anchor[0] < w && e.anchor[1] > 0 && e.anchor[1] < h, `${key}: якорь на карте`);
    // вход не заслоняет постройки: рамки спрайтов не пересекаются
    const [x0, x1, y0, y1] = [e.anchor[0] - e.size[0] / 2, e.anchor[0] + e.size[0] / 2, e.anchor[1] - e.size[1], e.anchor[1]];
    for (const [bk, b] of Object.entries(layout.buildings)) {
      for (const a of b.anchors || [b.anchor]) {
        const overlapX = Math.min(x1, a[0] + b.size[0] / 2) - Math.max(x0, a[0] - b.size[0] / 2);
        const overlapY = Math.min(y1, a[1]) - Math.max(y0, a[1] - b.size[1]);
        assert.ok(overlapX <= 2 || overlapY <= 2, `${key} не налезает на ${bk}`);
      }
    }
  }
  const painter = createPainter(assets, makeStubCanvas);
  const hub = createHub(painter, { profile: null });
  const screen = computeLayout(1920, 1080, 1);
  hub.draw(stubContext(1920, 1080), { profile: { era: 0, parts: {}, buildings: {} }, time: 0, layout: screen });
  for (const key of ENTRY_KEYS) {
    const pos = hub.screenPos(key);
    assert.ok(pos && pos.x > 0 && pos.x < 1920 && pos.y > 0 && pos.y < 1080, `${key}: в кадре`);
    assert.equal(hub.hitTest(pos.x, pos.y), key, `${key}: нажатие`);
  }
  hub.focus('monument', true);
  hub.draw(stubContext(1920, 1080), { profile: { era: 0, parts: {}, buildings: {} }, time: 0.1, layout: screen });
  const m = hub.screenPos('monument');
  assert.ok(Math.abs(m.x - 960) < 80 && Math.abs(m.y - 540) < 200, 'камера подводит к памятнику');
});

test('подъём камеры: входы есть в кадрах подъёма по приближению якорей построек', () => {
  const frames = tiltFrames(fakeAssets({ iso: true }));
  const iso = frames[0];
  for (const key of ENTRY_KEYS) assert.ok(iso.entries[key]?.length === 1 && iso.entrySize[key], key);
  const last = frames[frames.length - 1];
  // на карте полёта место входа — рядом с прежним планом (в пределах острова, с правильной стороны от стола)
  for (const key of ENTRY_KEYS) {
    const [x, y] = last.entries[key][0];
    assert.ok(x > 0 && x < ISLAND.width && y > 0 && y < ISLAND.height, `${key}: на острове (${x.toFixed(0)}, ${y.toFixed(0)})`);
    assert.equal(Math.sign(x - last.pad[0]), Math.sign(iso.entries[key][0][0] - iso.pad[0]), `${key}: та же сторона от стола`);
  }
  const map = fitAffine({ a: [[0, 0], [10, 0], [0, 10]] }, { a: [[1, 2], [21, 2], [1, 32]] });
  assert.deepEqual(map([5, 5]), [11, 17]);
  assert.equal(fitAffine({ a: [[0, 0], [1, 1]] }, { a: [[0, 0], [1, 1]] }), null);
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

test('изометрия: ночью горят лампы построек, днём нет; недостроенная постройка тёмная', () => {
  const assets = fakeAssets({ iso: true });
  const layout = isoLayout(assets);
  const owned = allBuilt().buildings;
  const mv = createMapView().set(0, 0, 1, 2000, 700);
  const expected = Object.entries(ISO_LAMPS)
    .reduce((n, [key, lamps]) => n + lamps.length * ((layout.buildings[key] || layout.entries[key]).anchors?.length || 1), 0);
  assert.equal(drawLamps(stubContext(), mv, layout, owned, allBuilt(), 0, 1), expected, 'каждая лампа каждого якоря');
  assert.equal(drawLamps(stubContext(), mv, layout, owned, allBuilt(), 0, 1, (key) => (key === 'control' ? 0.5 : 1)),
    expected - ISO_LAMPS.control.length, 'пульт в стройке не светится');
  for (const [key, lamps] of Object.entries(ISO_LAMPS)) {
    for (const [fx, fy] of lamps) assert.ok(fx >= 0 && fx <= 1 && fy >= 0 && fy <= 1, `${key}: лампа на спрайте`);
  }

  const painter = createPainter(assets, makeStubCanvas);
  const hub = createHub(painter, { profile: null });
  const screen = computeLayout(1920, 1080, 1);
  const gradients = (daylight) => {
    const ctx = stubContext(1920, 1080);
    hub.draw(ctx, { profile: allBuilt(), time: 0, layout: screen, daylight });
    return ctx.calls.createRadialGradient || 0;
  };
  assert.ok(gradients(0) - gradients(1) >= expected, 'ночью добавились огни всех ламп');
});

test('изометрия: стройка — здание растёт в лесах, затем анимация гаснет; праздник эпохи зажигает лампы днём', () => {
  const painter = createPainter(fakeAssets({ iso: true }), makeStubCanvas);
  const hub = createHub(painter, { profile: null });
  const screen = computeLayout(1920, 1080, 1);
  const profile = allBuilt();
  const frame = (time, daylight = 1) => {
    const ctx = stubContext(1920, 1080);
    hub.draw(ctx, { profile, time, layout: screen, daylight });
    return ctx.calls;
  };
  frame(0);
  assert.equal(hub.animating, false, 'в покое анимации нет');
  hub.playBuild('control');
  assert.equal(hub.animating, true);
  frame(0.05);
  const growing = frame(0.4);
  assert.ok((growing.clip || 0) >= 1, 'спрайт обрезан по высоте стройки');
  for (let t = 0.5; t < 6; t += 0.1) frame(t);
  assert.equal(hub.animating, false, 'стройка и искры закончились');
  assert.equal(frame(6.1).clip || 0, 0, 'достроенное здание целиком');

  const day = frame(6.2).createRadialGradient || 0;
  hub.playEra();
  assert.equal(hub.animating, true);
  frame(6.25);
  assert.ok((frame(6.3).createRadialGradient || 0) > day, 'днём в праздник горят лампы');
});

test('клипы ON: части вырезаны в пределах спрайта, клип играет по событию, гаснет и не играет у некупленной постройки', () => {
  const assets = fakeAssets({ iso: true });
  const layout = isoLayout(assets);
  assert.deepEqual(Object.keys(ISO_PART_CLIPS).sort(), ['factory', 'gantry', 'logistics', 'rescue'], '§6: механика только у четырёх');
  for (const [key, spec] of Object.entries(ISO_PART_CLIPS)) {
    const [w, h] = layout.buildings[key].size;
    assert.ok(spec.time > 0 && spec.time <= 3, `${key}: не дольше 3 с`);
    for (const [x, y, rw, rh] of [...(spec.holes || []), ...(spec.parts || []).map((p) => p.rect)]) {
      assert.ok(x >= 0 && y >= 0 && x + rw <= w && y + rh <= h, `${key}: часть в спрайте ${w}×${h}`);
    }
    if (spec.spin) {
      const { center: [cx, cy], radius } = spec.spin;
      assert.ok(cx - radius >= 0 && cx + radius <= w && cy - radius >= 0 && cy + radius <= h, `${key}: вентиль в спрайте`);
    }
  }
  assert.equal(clipOpen(0), 0);
  assert.equal(clipOpen(0.5), 1);
  assert.equal(clipOpen(1), 0);

  const painter = createPainter(assets, makeStubCanvas);
  const hub = createHub(painter, { profile: null });
  const screen = computeLayout(1920, 1080, 1);
  const frame = (profile, time) => {
    const ctx = stubContext(1920, 1080);
    hub.draw(ctx, { profile, time, layout: screen, daylight: 1 });
    return ctx.calls;
  };
  const built = allBuilt();
  frame(built, 0);
  hub.playEvent('factory');
  assert.equal(hub.animating, true);
  frame(built, 0.05);
  const mid = frame(built, 1.2);
  assert.ok((mid.clip || 0) >= 2, 'обе створки ворот нарисованы со смещением');
  assert.ok((mid.createRadialGradient || 0) > 0, 'днём горят лампы цеха и свет внутри');
  for (let t = 1.3; t < 7; t += 0.1) frame(built, t);
  assert.equal(hub.animating, false, 'клип и дым закончились');

  const empty = { era: 0, parts: {}, buildings: {} };
  hub.playEvent('rescue');
  frame(empty, 7.1);
  frame(empty, 7.2);
  assert.equal(hub.animating, false, 'нет спасателей — нет клипа');
});

test('изометрия по уровню постройки: свой спрайт уровня, иначе младший; E1 рисует все постройки и цели нажатия', () => {
  const assets = fakeAssets({ iso: true });
  for (const key of BUILDING_KEYS) {
    assert.equal(isoBuildingSprite(assets, key, 1)?.name, `iso_${key}_1978`);
    const l2 = isoBuildingSprite(assets, key, 2);
    assert.ok(l2, `${key}: ур.2 рисуется`);
    if (!assets.has(`iso_${key}_1986`)) assert.equal(l2.name, `iso_${key}_1978`, `${key}: без спрайта ур.2 — ур.1`);
  }
  assert.equal(isoBuildingSprite(assets, 'gantry', 0)?.level, 1, 'уровень 0 не встречается, но не ломает выбор');
  const painter = createPainter(assets, makeStubCanvas);
  const hub = createHub(painter, { profile: null });
  const screen = computeLayout(1920, 1080, 1);
  const e1 = { era: 1, skin: 'classic', parts: { booster: 1, capsule: 1 }, buildings: Object.fromEntries(BUILDING_KEYS.map((k) => [k, 2])) };
  hub.draw(stubContext(1920, 1080), { profile: e1, time: 0, layout: screen });
  for (const key of BUILDING_KEYS) assert.ok(hub.screenPos(key), `${key}: на базе E1`);
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
