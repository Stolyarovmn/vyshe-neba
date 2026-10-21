import test from 'node:test';
import assert from 'node:assert/strict';
import { createPainter } from '../src/render/painter.js';
import { createHub } from '../src/render/hub.js';
import { computeLayout } from '../src/render/layout.js';
import { BUILD_DURATION, ERA_DURATION, buildProgress, createHubFx } from '../src/render/hubfx.js';
import {
  DAY_CYCLE_SECONDS, ROAD_LENGTHS, VEHICLES, birdPosition, dayOverlay, daylightAt, lightsAt, pingPong, roadPoint, shorePoints,
  vehiclePosition,
} from '../src/render/life.js';
import { BUILDING_KEYS, ENTRY_KEYS, ISLAND, ISLAND_ROADS, WORLD_ENTRIES } from '../src/render/manifest.js';
import { entrySize, entryWorld } from '../src/render/entries.js';
import { fakeAssets, makeStubCanvas, stubContext } from './render-helpers.mjs';

function setup({ w = 960, h = 540, dpr = 2, missing } = {}) {
  const assets = fakeAssets({ missing });
  const painter = createPainter(assets, makeStubCanvas);
  const hub = createHub(painter, { profile: null });
  const layout = computeLayout(w, h, dpr);
  const ctx = stubContext(w * dpr, h * dpr);
  return { hub, layout, ctx, painter, assets };
}

const profile = (buildings = {}, extra = {}) => ({
  era: 2,
  skin: 'classic',
  parts: { booster: 1, capsule: 1 },
  buildings: Object.fromEntries(BUILDING_KEYS.map((k) => [k, buildings[k] || 0])),
  contracts: { active: [{ id: 'a' }, { id: 'b' }] },
  ...extra,
});

/** Прокручивает кадры с шагом 1/30 с от startTime; возвращает конечное время. */
function run(hub, ctx, layout, p, seconds, startTime = 10, extra = {}) {
  let time = startTime;
  for (let i = 0; i <= Math.round(seconds * 30); i++) {
    hub.draw(ctx, { profile: p, time, layout, ...extra });
    time += 1 / 30;
  }
  return time;
}

// --- стройка и праздник ----------------------------------------------------------------------------

test('стройка: reveal растёт плавно до 1 к концу, леса гаснут, по завершении done', () => {
  let last = -1;
  for (let t = 0; t <= BUILD_DURATION + 0.2; t += 0.04) {
    const p = buildProgress(t);
    assert.ok(p.reveal >= last - 1e-9, 'reveal не убывает');
    last = p.reveal;
    assert.ok(p.reveal >= 0 && p.reveal <= 1 && p.scaffold >= 0 && p.scaffold <= 1);
  }
  assert.equal(buildProgress(0).reveal, 0);
  assert.equal(buildProgress(0.5).scaffold, 1);
  assert.equal(buildProgress(1.0).reveal, 1);
  assert.deepEqual(buildProgress(BUILD_DURATION), { reveal: 1, scaffold: 0, done: true });
  assert.ok(Math.abs(BUILD_DURATION - 1.2) < 1e-9);
});

test('стройка при reduceMotion: короче и без плавных эффектов, но здание всё равно «вырастает»', () => {
  assert.equal(buildProgress(0.5, true).reveal, 1);
  assert.equal(buildProgress(0.2, true).scaffold, 1);
  assert.ok(buildProgress(0.2, true).reveal < 1);
  assert.equal(buildProgress(0.9, true).scaffold, 0);
});

test('эффекты стройки: пыль и искры идут при стройке, вспышка при завершении, пул не переполняется', () => {
  const fx = createHubFx();
  const geom = () => [{ x: 0, y: 40, w: 60, h: 50 }];
  fx.playBuild('gantry');
  assert.equal(fx.active, true);
  let peak = 0;
  for (let i = 0; i < 90; i++) {
    fx.update(1 / 60, false, geom, null);
    peak = Math.max(peak, fx.particles.count);
  }
  assert.ok(peak > 20, `частиц ${peak}`);
  assert.equal(fx.buildState('gantry', false), null, 'после 1,2 с запись о стройке снята');
  for (let i = 0; i < 400; i++) fx.update(1 / 60, false, geom, null);
  assert.equal(fx.particles.count, 0, 'частицы стройки живут конечное время');
  assert.equal(fx.active, false);
});

test('эффекты стройки при reduceMotion: частиц заметно меньше, искр и вспышки нет', () => {
  const geom = () => [{ x: 0, y: 40, w: 60, h: 50 }];
  const peakOf = (reduce) => {
    const fx = createHubFx();
    fx.playBuild('gantry');
    let peak = 0;
    for (let i = 0; i < 80; i++) {
      fx.update(1 / 60, reduce, geom, null);
      peak = Math.max(peak, fx.particles.count);
    }
    return peak;
  };
  assert.ok(peakOf(true) < peakOf(false) * 0.6);
});

test('фейерверк эпохи: залпы идут по расписанию, огни затухают, при reduceMotion залпов нет', () => {
  const view = { left: -300, right: 300, top: -200, bottom: 200 };
  const full = createHubFx();
  full.playEra();
  assert.equal(full.eraPulse, 1);
  let peak = 0;
  for (let i = 0; i < Math.round(ERA_DURATION * 60); i++) {
    full.update(1 / 60, false, null, view);
    peak = Math.max(peak, full.particles.count);
  }
  assert.ok(peak > 60, `частиц фейерверка ${peak}`);
  for (let i = 0; i < 600; i++) full.update(1 / 60, false, null, view);
  assert.ok(full.eraPulse < 0.05 && full.particles.count === 0);

  const calm = createHubFx();
  calm.playEra();
  let calmPeak = 0;
  for (let i = 0; i < 240; i++) {
    calm.update(1 / 60, true, null, view);
    calmPeak = Math.max(calmPeak, calm.particles.count);
  }
  assert.equal(calmPeak, 0, 'без залпов при reduceMotion');
  assert.ok(calm.eraPulse >= 0, 'мягкое свечение ламп остаётся');
});

test('пар: источники выпускают частицы по скорости, сила 0 не выпускает', () => {
  const fx = createHubFx();
  const vents = [{ x: 0, y: 0, rate: 10, drift: 0 }];
  fx.steam(1, vents, 0);
  assert.equal(fx.particles.count, 0);
  fx.steam(1, vents, 1);
  assert.ok(fx.particles.count >= 9 && fx.particles.count <= 11);
});

// --- хаб: объекты-входы ---------------------------------------------------------------------------

test('объекты-входы: нарисованы даже без покупок, hitTest возвращает их ключи, screenPos работает', () => {
  const { hub, layout, ctx } = setup();
  hub.draw(ctx, { profile: profile(), time: 1, layout });
  for (const key of ENTRY_KEYS) {
    const pos = hub.screenPos(key);
    assert.ok(pos, `${key}: нет экранной позиции`);
    assert.ok(pos.x > 0 && pos.x < layout.w && pos.y > 0 && pos.y < layout.h, `${key}: вне кадра (${pos.x}, ${pos.y})`);
    assert.equal(hub.hitTest(pos.x, pos.y), key, key);
    const rects = hub.screenRects(key);
    assert.equal(rects.length, 1);
  }
  assert.equal(hub.hitTest(5, 5), null);
});

test('объекты-входы: цель нажатия не меньше 48 CSS-пикселей, в центре и на 16 px от него по осям нажатие попадает в свой объект', () => {
  for (const [w, h, dpr] of [[390, 844, 3], [844, 390, 3], [1280, 720, 1]]) {
    const { hub, layout, ctx } = setup({ w, h, dpr });
    hub.draw(ctx, { profile: profile(), time: 1, layout });
    for (const key of ENTRY_KEYS) {
      const pos = hub.screenPos(key);
      assert.ok(pos, key);
      for (const [dx, dy] of [[0, 0], [-16, 0], [16, 0], [0, -16], [0, 16]]) assert.equal(hub.hitTest(pos.x + dx, pos.y + dy), key, `${w}x${h} ${key} ${dx},${dy}`);
    }
  }
});

test('стартовый вид показывает все объекты-входы целиком в трёх окнах', () => {
  for (const [w, h, dpr] of [[390, 844, 3], [844, 390, 3], [1280, 720, 1]]) {
    const { hub, layout, ctx } = setup({ w, h, dpr });
    hub.draw(ctx, { profile: profile(), time: 1, layout });
    for (const key of [...ENTRY_KEYS, 'rocket']) {
      const [r] = hub.screenRects(key);
      assert.ok(r, `${w}x${h} ${key}`);
      assert.ok(r.x0 >= 0 && r.x1 <= w && r.y0 >= 0 && r.y1 <= h, `${w}x${h}: ${key} не помещается (${r.x0.toFixed(0)},${r.y0.toFixed(0)}-${r.x1.toFixed(0)},${r.y1.toFixed(0)})`);
    }
  }
});

test('объекты-входы: рядом с ракетой, ракета и постройки остаются отдельными целями', () => {
  const { hub, layout, ctx } = setup();
  const p = profile({ gantry: 1, beacons: 1, weather: 1, factory: 1, control: 1 });
  hub.draw(ctx, { profile: p, time: 2, layout });
  const rocket = hub.screenPos('rocket');
  assert.ok(rocket);
  assert.equal(hub.hitTest(rocket.x, rocket.y), 'rocket');
  for (const key of ['gantry', 'weather', 'factory', 'control']) {
    const pos = hub.screenPos(key);
    assert.ok(pos, key);
    assert.equal(hub.hitTest(pos.x, pos.y), key);
  }
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  for (const key of ENTRY_KEYS) {
    const k = ISLAND.unitsPerPx;
    const [wx, wy] = entryWorld(key);
    assert.ok(Math.hypot(wx, wy) < 260 * k, `${key}: далеко от ракеты`);
    assert.ok(distance(hub.screenPos(key), rocket) > 20);
  }
});

test('объекты-входы: размер мастерской берётся из спрайта эпохи, остальные из манифеста', () => {
  const { painter } = setup();
  const [w0, h0] = entrySize('workshop', painter, 0);
  const [w5, h5] = entrySize('workshop', painter, 5);
  assert.ok(Math.abs(h0 - WORLD_ENTRIES.workshop.size[1] * ISLAND.unitsPerPx) < 1e-6);
  assert.ok(Math.abs(h5 - h0) < 1e-6 && Math.abs(w5 - w0) < 1e-6, 'у всех эпох один размер PNG');
  for (const key of ['board', 'shop', 'monument']) {
    const [w, h] = entrySize(key, painter, 3);
    assert.ok(Math.abs(w - WORLD_ENTRIES[key].size[0] * ISLAND.unitsPerPx) < 1e-6 && Math.abs(h - WORLD_ENTRIES[key].size[1] * ISLAND.unitsPerPx) < 1e-6, key);
  }
});

test('объекты-входы: focus наводит вид на объект и ставит его у центра кадра', () => {
  for (const key of ENTRY_KEYS) {
    const { hub, layout, ctx } = setup();
    const p = profile();
    hub.draw(ctx, { profile: p, time: 0, layout });
    hub.focus(key, true);
    hub.draw(ctx, { profile: p, time: 0.1, layout });
    const pos = hub.screenPos(key);
    assert.ok(pos && Math.abs(pos.x - layout.w / 2) < 120, `${key}: x ${pos && pos.x}`);
  }
});

test('объекты-входы рисуются без спрайтов мастерской и лавки (запасной вид)', () => {
  const { hub, layout, ctx } = setup({ missing: ['station_service_lift_1998', 'fuel_1998', 'repair_1998', 'pack_1998', 'coin_1998'] });
  hub.draw(ctx, { profile: profile(), time: 3, layout });
  for (const key of ENTRY_KEYS) assert.ok(hub.screenPos(key), key);
});

test('подсказки входов: пульсирующий контур при первом запуске, по запросу и никогда при false', () => {
  const countFor = (setHints, extra) => {
    const { hub, layout, ctx } = setup();
    if (setHints !== undefined) hub.setHints(setHints);
    hub.draw(ctx, { profile: profile({}, extra), time: 1, layout, daylight: 1 });
    return ctx.calls.fillRect;
  };
  const tutorial = { settings: { tutorial: { done: false, step: 0 } } };
  const finished = { settings: { tutorial: { done: true, step: 99 } } };
  const first = countFor(undefined, tutorial);
  const later = countFor(undefined, finished);
  assert.ok(first >= later + ENTRY_KEYS.length * 8, `первый запуск ${first}, позже ${later}`);
  assert.equal(countFor(false, tutorial), later, 'явный false выключает подсказки');
  assert.equal(countFor(true, finished), first);
});

// --- хаб: стройка, праздник, жизнь --------------------------------------------------------------------

test('playBuild: анимация идёт ~1,2 с, дорисовывает леса и пыль и затем завершается', () => {
  const { hub, layout, ctx } = setup();
  const p = profile({ gantry: 1 });
  let time = run(hub, ctx, layout, p, 0.2);
  assert.equal(hub.animating, false);
  assert.ok(Math.abs(hub.buildDuration - 1.2) < 1e-9);
  const idleFill = ctx.calls.fillRect;
  hub.playBuild('gantry');
  assert.equal(hub.animating, true);
  ctx.calls.fillRect = 0;
  time = run(hub, ctx, layout, p, 0.6, time);
  assert.ok(ctx.calls.fillRect > idleFill * 1.5, 'во время стройки рисуется заметно больше (леса, блоки, пыль)');
  assert.equal(hub.animating, true);
  time = run(hub, ctx, layout, p, 4, time);
  assert.equal(hub.animating, false, 'стройка и частицы закончились');
  hub.playBuild('нет_такой_постройки');
  assert.equal(hub.animating, false, 'неизвестный ключ игнорируется');
});

test('playBuild: здание не мигает пустотой — на стройке рисуется с reveal, после неё целиком; рамка нажатия сохранена', () => {
  const { hub, layout, ctx } = setup();
  const p = profile({ gantry: 1 });
  let time = run(hub, ctx, layout, p, 0.1);
  const before = hub.screenRects('gantry')[0];
  hub.playBuild('gantry');
  time = run(hub, ctx, layout, p, 0.5, time);
  const during = hub.screenRects('gantry')[0];
  assert.ok(during, 'во время стройки цель нажатия есть');
  assert.ok(Math.abs(during.x1 - during.x0 - (before.x1 - before.x0)) < 1);
  run(hub, ctx, layout, p, 3, time);
  const after = hub.screenRects('gantry')[0];
  assert.ok(Math.abs(after.y1 - before.y1) < 1);
});

test('playBuild и playEra при reduceMotion работают без исключений и заканчиваются', () => {
  const { hub, layout, ctx } = setup();
  const p = profile({ radar: 3, beacons: 1 });
  hub.playBuild('radar');
  hub.playEra();
  const time = run(hub, ctx, layout, p, 1, 10, { settings: { reduceMotion: true } });
  run(hub, ctx, layout, p, 5, time, { settings: { reduceMotion: true } });
  assert.equal(hub.animating, false);
});

test('playEra: огни памятника и фейерверк рисуются, затем всё стихает', () => {
  const { hub, layout, ctx } = setup();
  const p = profile({ gantry: 1 });
  let time = run(hub, ctx, layout, p, 0.2);
  ctx.calls.fillRect = 0;
  time = run(hub, ctx, layout, p, 0.2, time);
  const calm = ctx.calls.fillRect;
  hub.playEra();
  assert.equal(hub.animating, true);
  ctx.calls.fillRect = 0;
  time = run(hub, ctx, layout, p, 1.2, time);
  assert.ok(ctx.calls.fillRect > calm * 2, 'залпы добавляют много частиц');
  time = run(hub, ctx, layout, p, 8, time);
  assert.equal(hub.animating, false);
});

test('день и ночь: освещённость 0..1, ночь темнее и включает огни, по умолчанию день', () => {
  assert.equal(daylightAt(0), 1);
  assert.equal(daylightAt(DAY_CYCLE_SECONDS), 1);
  let min = 1;
  for (let t = 0; t < DAY_CYCLE_SECONDS; t += 3) {
    const d = daylightAt(t);
    assert.ok(d >= 0 && d <= 1);
    min = Math.min(min, d);
  }
  assert.ok(min < 0.3 && min > 0, `минимум ${min}`);
  assert.ok(Math.abs(daylightAt(-1) - daylightAt(DAY_CYCLE_SECONDS - 1)) < 1e-9);
  assert.equal(lightsAt(1), 0);
  assert.equal(lightsAt(0.2), 1);
  assert.ok(lightsAt(0.6) > 0 && lightsAt(0.6) < 1);
  const noon = dayOverlay(1);
  const dusk = dayOverlay(0.6);
  const night = dayOverlay(0.2);
  assert.equal(noon.a, 0);
  assert.ok(dusk.a > 0 && night.a > dusk.a);
  assert.ok(dusk.r > night.r, 'закат теплее ночи');
});

test('ночью хаб светится: огни и затемнение добавляют отрисовку, а днём их нет', () => {
  const p = profile({ gantry: 1, beacons: 1, radar: 1 });
  const count = (daylight) => {
    const { hub, layout, ctx } = setup();
    hub.setDaylight(daylight);
    run(hub, ctx, layout, p, 0.1);
    return ctx.calls.fillRect;
  };
  assert.ok(count(0.2) > count(1) + 10);
  const { hub, layout, ctx } = setup();
  hub.setDaylight(0.2);
  hub.setDaylight(null);
  hub.draw(ctx, { profile: p, time: 0, layout });
});

test('дороги: машины ходят по дороге туда-обратно в пределах её длины', () => {
  assert.ok(ROAD_LENGTHS.length === ISLAND_ROADS.length && ROAD_LENGTHS.every((l) => l > 100));
  assert.equal(pingPong(0, 100), 0);
  assert.equal(pingPong(100, 100), 100);
  assert.equal(pingPong(150, 100), 50);
  assert.equal(pingPong(250, 100), 50);
  assert.equal(pingPong(-30, 100), 30);
  const first = ISLAND_ROADS[0].points[0];
  const start = roadPoint(ISLAND_ROADS[0], 0);
  assert.deepEqual([start.x, start.y], first);
  for (const vehicle of VEHICLES) {
    let moved = 0;
    let previous = null;
    for (let t = 0; t < 120; t += 0.5) {
      const p = vehiclePosition(vehicle, t, { x: 0, y: 0, dx: 1, dy: 0 });
      assert.ok(Math.abs(Math.abs(p.dx) + Math.abs(p.dy) - 1) < 1e-9 || Math.hypot(p.dx, p.dy) > 0.99, 'направление единичное');
      if (previous) moved += Math.hypot(p.x - previous.x, p.y - previous.y);
      previous = { x: p.x, y: p.y };
      const xs = ISLAND_ROADS[vehicle.road].points.map((pt) => pt[0]);
      const ys = ISLAND_ROADS[vehicle.road].points.map((pt) => pt[1]);
      assert.ok(p.x >= Math.min(...xs) - 1e-6 && p.x <= Math.max(...xs) + 1e-6 && p.y >= Math.min(...ys) - 1e-6 && p.y <= Math.max(...ys) + 1e-6);
    }
    assert.ok(moved > 200, `машина стоит на месте (${moved})`);
  }
});

test('птицы: летят, пролетают остров и возвращаются; крылья машут', () => {
  const flock = { y: 0, speed: 24, count: 3, dir: 1, offset: 0, wobble: 0.5 };
  const a = birdPosition(flock, 0, 0, { x: 0, y: 0, flap: 0 });
  const b = birdPosition(flock, 0, 10, { x: 0, y: 0, flap: 0 });
  assert.ok(b.x > a.x + 200);
  const back = { ...flock, dir: -1 };
  assert.ok(birdPosition(back, 0, 10, { x: 0, y: 0, flap: 0 }).x < birdPosition(back, 0, 0, { x: 0, y: 0, flap: 0 }).x - 200);
  const flaps = new Set();
  for (let t = 0; t < 2; t += 0.1) flaps.add(birdPosition(flock, 1, t, { x: 0, y: 0, flap: 0 }).flap.toFixed(2));
  assert.ok(flaps.size > 5);
});

test('пена прибоя: точки берега детерминированы, лежат на суше рядом с водой', () => {
  const land = {
    cols: 8, rows: 4, cell_px: 10,
    land_hex_rows: ['3c', '7e', '7e', '3c'],
  };
  const a = shorePoints(land, 1);
  const b = shorePoints(land, 1);
  assert.deepEqual(a, b);
  assert.ok(a.length > 8);
  for (const p of a) {
    assert.ok(Math.abs(Math.hypot(p.nx, p.ny) - 1) < 1e-9, 'нормаль единичная');
    assert.ok(p.x > 0 && p.x < 80 && p.y > 0 && p.y < 40);
  }
  assert.ok(shorePoints(land, 0.2).length < a.length);
  assert.deepEqual(shorePoints(null), []);
});

test('жизнь острова: хаб рисуется во всех окнах днём, на закате и ночью с тревожным набором и без ассетов', () => {
  const all = profile(Object.fromEntries(BUILDING_KEYS.map((k) => [k, 6])), { era: 5 });
  for (const [w, h, dpr] of [[390, 844, 3], [844, 390, 3], [1280, 720, 1]]) {
    for (const daylight of [1, 0.6, 0.2]) {
      for (const missing of [undefined, ['island_land', 'station_service_lift_2060', 'base_drone_0', 'base_drone_1']]) {
        const { hub, layout, ctx } = setup({ w, h, dpr, missing });
        hub.setDaylight(daylight);
        hub.playEra();
        hub.playBuild('radar');
        run(hub, ctx, layout, all, 0.5, 5, { weather: { kind: 'rain', wind: 3 }, selected: 'radar' });
        assert.ok(ctx.calls.fillRect > 0);
      }
    }
  }
});

test('хаб с reduceMotion не рисует пену и птиц (меньше штрихов), но остаётся живым', () => {
  const p = profile({ gantry: 1 });
  const count = (reduceMotion) => {
    const { hub, layout, ctx } = setup();
    run(hub, ctx, layout, p, 0.3, 5, { settings: { reduceMotion } });
    return ctx.calls.fillRect + ctx.calls.stroke;
  };
  assert.ok(count(true) < count(false));
});
