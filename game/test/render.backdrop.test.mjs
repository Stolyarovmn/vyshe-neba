import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { backdropCell, coverCrop, createBackdrop } from '../src/render/backdrop.js';
import { MODULE_IDS, MODULE_STATIONS, STATION_COLUMNS, createWorkshop, defaultRocketRect, layoutStations, moduleBoxes } from '../src/render/workshop.js';
import { ASSEMBLY_HEIGHT, ASSEMBLY_WIDTH, MODULE_VIEW } from '../src/render/rocket-view.js';
import { createPainter } from '../src/render/painter.js';
import { ASSET_FILES, BACKDROP_ATLAS, STATION_SIZES, eraYear } from '../src/render/manifest.js';
import { fakeAssets, makeStubCanvas, pngSize, repoRoot, stubContext } from './render-helpers.mjs';

test('ячейки фонов: мастерская по эпохе, лавка, запуск с Земли и с Луны', () => {
  assert.deepEqual(backdropCell('workshop', 0), { atlas: 'backdrop_interior', col: 0, row: 0 });
  assert.deepEqual(backdropCell('workshop', 2), { atlas: 'backdrop_interior', col: 2, row: 0 });
  assert.deepEqual(backdropCell('workshop', 3), { atlas: 'backdrop_interior', col: 0, row: 1 });
  assert.deepEqual(backdropCell('workshop', 5), { atlas: 'backdrop_interior', col: 2, row: 1 });
  assert.deepEqual(backdropCell('workshop', 99), { atlas: 'backdrop_interior', col: 2, row: 1 });
  assert.deepEqual(backdropCell('shop', 0), { atlas: 'backdrop_env', col: 0, row: 1 });
  assert.deepEqual(backdropCell('shop', 0, 1), { atlas: 'backdrop_env', col: 1, row: 0 });
  const fallback = { atlas: 'backdrop_env', col: 0, row: 0 };
  assert.deepEqual(backdropCell('launch-earth', 0), { atlas: 'backdrop_base', col: 0, row: 0, fallback });
  assert.deepEqual(backdropCell('launch-earth', 2), { atlas: 'backdrop_base', col: 2, row: 0, fallback });
  assert.deepEqual(backdropCell('launch-earth', 3), { atlas: 'backdrop_base', col: 0, row: 1, fallback });
  assert.deepEqual(backdropCell('launch-earth', 5), { atlas: 'backdrop_base', col: 2, row: 1, fallback });
  assert.deepEqual(backdropCell('launch-earth', 99), { atlas: 'backdrop_base', col: 2, row: 1, fallback });
  assert.deepEqual(backdropCell('launch-moon', 0), { atlas: 'backdrop_env', col: 1, row: 1 });
});

test('cover: пропорции сохраняются при любом прямоугольнике, обрезка внутри исходника', () => {
  for (const [dw, dh] of [[390, 844], [1280, 720], [100, 100], [844, 390], [300, 1000]]) {
    for (const zoom of [1, 1.05, 1.5]) {
      for (const focus of [0, 0.5, 1]) {
        const c = coverCrop(587, 439, dw, dh, zoom, focus, 0.5);
        assert.ok(Math.abs(c.sw / c.sh - dw / dh) < 1e-9, `${dw}x${dh}`);
        assert.ok(c.sx >= -1e-9 && c.sx + c.sw <= 587 + 1e-9);
        assert.ok(c.sy >= -1e-9 && c.sy + c.sh <= 439 + 1e-9);
      }
    }
  }
  const full = coverCrop(800, 400, 800, 400, 1);
  assert.deepEqual([full.sx, full.sy, full.sw, full.sh], [0, 0, 800, 400]);
});

test('backdrop.draw рисует панель, затемнение и возвращает признак арта', () => {
  const painter = createPainter(fakeAssets(), makeStubCanvas);
  const backdrop = createBackdrop(painter);
  const ctx = stubContext(800, 600);
  const rect = { x: 10, y: 20, w: 390, h: 500 };
  assert.equal(backdrop.draw(ctx, { kind: 'workshop', era: 4, rect, time: 3, dim: 0.4 }), true);
  assert.ok(ctx.calls.drawImage >= 1);
  assert.ok(ctx.calls.fillRect >= 2, 'затемнение и свечение');
  for (const kind of ['shop', 'launch-earth', 'launch-moon']) assert.equal(backdrop.draw(ctx, { kind, era: 0, rect, time: 0 }), true);
  const bare = createBackdrop(createPainter(fakeAssets({ missing: ['backdrop_interior'] }), makeStubCanvas));
  assert.equal(bare.draw(stubContext(100, 100), { kind: 'workshop', era: 0, rect, time: 0, dim: 0 }), false);
});

test('станции: раскладка по бокам, в пределах rect, без наложений и с центром свободным', () => {
  for (const rect of [{ x: 0, y: 0, w: 390, h: 500 }, { x: 40, y: 80, w: 844, h: 300 }, { x: 0, y: 0, w: 1280, h: 560 }]) {
    const items = layoutStations(rect);
    assert.equal(items.length, STATION_COLUMNS.left.length + STATION_COLUMNS.right.length);
    for (const item of items) {
      assert.ok(item.x >= rect.x - 1e-6 && item.x + item.w <= rect.x + rect.w + 1e-6, `${item.id} по ширине`);
      assert.ok(item.y >= rect.y - 1e-6 && item.y + item.h <= rect.y + rect.h + 1e-6, `${item.id} по высоте`);
      const [sw, sh] = STATION_SIZES[item.id];
      assert.ok(Math.abs(item.w / item.h - sw / sh) < 1e-6, `${item.id} пропорции`);
      const centre = rect.x + rect.w / 2;
      assert.ok(item.side === 'left' ? item.x + item.w < centre - rect.w * 0.15 : item.x > centre + rect.w * 0.15, `${item.id} центр свободен`);
    }
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const a = items[i];
        const b = items[j];
        const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
        assert.ok(!overlap, `${a.id} перекрывает ${b.id}`);
      }
    }
  }
});

test('drawStations рисует все станции эпохи и возвращает рамки', () => {
  const painter = createPainter(fakeAssets(), makeStubCanvas);
  const workshop = createWorkshop(painter);
  const ctx = stubContext(800, 600);
  const items = workshop.drawStations(ctx, { era: 3, rect: { x: 0, y: 100, w: 390, h: 400 }, time: 2 });
  assert.equal(items.length, 5);
  assert.ok(ctx.calls.drawImage >= 5);
});

const within = (a, b) => a.x >= b.x - 1e-6 && a.y >= b.y - 1e-6 && a.x + a.w <= b.x + b.w + 1e-6 && a.y + a.h <= b.y + b.h + 1e-6;
const sameBox = (a, b) => ['x', 'y', 'w', 'h'].every((k) => Math.abs(a[k] - b[k]) < 1e-9);

test('хитбоксы модулей: девять модулей, станции у двигателя, корпуса и электроники, остальное — части ракеты', () => {
  assert.deepEqual([...MODULE_IDS].sort(), Object.keys(MODULE_VIEW).sort());
  assert.deepEqual(MODULE_STATIONS, { engine: 'engine_test_stand', hull: 'hull_diagnostics', avionics: 'telemetry_post' });
  for (const rect of [{ x: 0, y: 0, w: 390, h: 500 }, { x: 40, y: 80, w: 844, h: 300 }, { x: 0, y: 0, w: 1280, h: 560 }]) {
    for (const era of [0, 3, 5]) {
      const boxes = moduleBoxes({ era, rect });
      const stations = layoutStations(rect);
      assert.deepEqual(Object.keys(boxes).sort(), [...MODULE_IDS].sort());
      for (const id of MODULE_IDS) {
        const box = boxes[id];
        assert.ok(box.w > 0 && box.h > 0 && Number.isFinite(box.x + box.y), `${id}: пустой хитбокс`);
        if (MODULE_STATIONS[id]) {
          assert.equal(box.source, 'station', id);
          assert.equal(box.station, MODULE_STATIONS[id]);
          assert.ok(sameBox(box, stations.find((s) => s.id === MODULE_STATIONS[id])), `${id}: рамка станции`);
        } else {
          assert.equal(box.source, 'rocket', id);
          assert.equal(box.station, null);
        }
        assert.ok(box.part && box.part.w > 0 && box.part.h > 0, `${id}: есть рамка узла на ракете`);
      }
    }
  }
});

test('хитбоксы частей ракеты: лежат в рамке сборки, идут по высоте сверху вниз и совпадают с MODULE_VIEW', () => {
  const rect = { x: 0, y: 0, w: 844, h: 360 };
  const rocket = { x: 360, y: 20, w: (320 * ASSEMBLY_WIDTH) / ASSEMBLY_HEIGHT, h: 320 };
  const boxes = moduleBoxes({ era: 2, rect, rocket });
  for (const id of MODULE_IDS) {
    const { part } = boxes[id];
    const [t0, t1] = MODULE_VIEW[id].region;
    assert.ok(Math.abs(part.y - (rocket.y + t0 * rocket.h)) < 1e-6 && Math.abs(part.y + part.h - (rocket.y + t1 * rocket.h)) < 1e-6, `${id}: диапазон по высоте`);
    assert.ok(part.y >= rocket.y - 1e-6 && part.y + part.h <= rocket.y + rocket.h + 1e-6, `${id}: за пределами сборки по высоте`);
    assert.ok(part.x < rocket.x + rocket.w && part.x + part.w > rocket.x, `${id}: не над ракетой`);
  }
  const top = (id) => boxes[id].part.y;
  const bottom = (id) => boxes[id].part.y + boxes[id].part.h;
  assert.ok(top('parachute') <= top('avionics'), 'парашют выше электроники');
  assert.ok(top('avionics') >= top('capsule') - 1e-6 && bottom('avionics') <= bottom('capsule') + 1e-6, 'электроника внутри капсулы');
  assert.ok(top('capsule') < top('tank') && top('tank') <= top('hull') + 1e-6 && top('hull') < top('engine') && top('engine') < top('booster'));
  assert.ok(boxes.fins.part.w > boxes.hull.part.w && boxes.legs.part.w > boxes.hull.part.w, 'ноги и стабилизаторы шире корпуса');
  const centre = rocket.x + rocket.w / 2;
  for (const id of MODULE_IDS) assert.ok(Math.abs(boxes[id].part.x + boxes[id].part.w / 2 - centre) < 1e-6, `${id}: по центру сборки`);
});

test('хитбоксы без станций (портрет): все девять модулей — части ракеты', () => {
  const rect = { x: 0, y: 0, w: 390, h: 420 };
  const boxes = moduleBoxes({ era: 1, rect, stations: false });
  for (const id of MODULE_IDS) {
    assert.equal(boxes[id].source, 'rocket', id);
    assert.ok(sameBox(boxes[id], boxes[id].part), id);
  }
  const guessed = defaultRocketRect(rect);
  assert.ok(within(guessed, rect) && Math.abs(guessed.w / guessed.h - ASSEMBLY_WIDTH / ASSEMBLY_HEIGHT) < 1e-9);
});

test('drawStations возвращает массив станций с .modules (хитбокс каждого модуля), контракт массива не нарушен', () => {
  const painter = createPainter(fakeAssets(), makeStubCanvas);
  const workshop = createWorkshop(painter);
  const ctx = stubContext(800, 600);
  const rect = { x: 0, y: 100, w: 844, h: 300 };
  const rocket = { x: 400, y: 110, w: 40, h: 280 };
  const items = workshop.drawStations(ctx, { era: 4, rect, time: 1, rocket });
  assert.ok(Array.isArray(items) && items.length === 5);
  assert.ok(items.every((item) => item.id && item.side && Number.isFinite(item.w)));
  assert.deepEqual(Object.keys(items.modules).sort(), [...MODULE_IDS].sort());
  assert.equal(items.modules.engine.station, 'engine_test_stand');
  assert.ok(sameBox(items.modules.engine, moduleBoxes({ era: 4, rect, rocket }).engine));
  const plain = workshop.drawStations(ctx, { era: 4, rect, time: 1 });
  assert.equal(Object.keys(plain.modules).length, 9, 'без params.rocket рамка сборки оценивается по rect');
  assert.equal(workshop.moduleBoxes({ era: 4, rect, rocket }).capsule.source, 'rocket');
});

test('файлы фонов и станций существуют и совпадают по размеру с манифестом', () => {
  for (const [name, spec] of Object.entries(BACKDROP_ATLAS)) {
    assert.ok(ASSET_FILES[name], name);
    assert.ok(String(ASSET_FILES[name]).endsWith('.webp'));
  }
  for (const [id, size] of Object.entries(STATION_SIZES)) {
    for (let era = 0; era < 6; era++) {
      const name = id === 'manufacturing_cell' ? `bld_factory_${eraYear(era)}` : id === 'telemetry_post' ? `bld_control_${eraYear(era)}` : `station_${id}_${eraYear(era)}`;
      assert.ok(ASSET_FILES[name], name);
      assert.deepEqual(pngSize(path.join(repoRoot, ASSET_FILES[name])), size, name);
    }
  }
});
