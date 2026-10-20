import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { backdropCell, coverCrop, createBackdrop } from '../src/render/backdrop.js';
import { STATION_COLUMNS, createWorkshop, layoutStations } from '../src/render/workshop.js';
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
  assert.deepEqual(backdropCell('launch-earth', 0), { atlas: 'backdrop_env', col: 0, row: 0 });
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
