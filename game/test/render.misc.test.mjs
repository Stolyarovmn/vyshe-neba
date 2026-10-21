import test from 'node:test';
import assert from 'node:assert/strict';
import { createSpriteCache, loadAssets } from '../src/render/assets.js';
import { createPainter, rotateHue } from '../src/render/painter.js';
import { aircraftChoice, aircraftLayer, lineageFor } from '../src/render/traffic.js';
import { weatherMood } from '../src/render/weather.js';
import { skyColor } from '../src/render/sky.js';
import { createRng, hash2, sampleStops } from '../src/render/util.js';
import { createView } from '../src/render/camera.js';
import { fakeAssets, makeStubCanvas, stubContext } from './render-helpers.mjs';

test('самолёт выбирается стабильно по точке рождения и не зависит от смещения', () => {
  const a = aircraftChoice(120.3, 450.7, 3);
  for (let i = 0; i < 5; i++) assert.deepEqual(aircraftChoice(120.3, 450.7, 3), a);
  assert.ok(a.name.startsWith(a.lineage));
  assert.equal(aircraftChoice(0, 10, 2), null, 'у земли самолётов нет');
  assert.equal(aircraftLayer(40).weights.low_primary, 0.7);
});

test('самолёты: слои высот и доля предыдущей эпохи около 18 %', () => {
  let previous = 0;
  const total = 4000;
  for (let i = 0; i < total; i++) {
    const choice = aircraftChoice(i * 13.7, 350 + (i % 200), 4);
    if (choice.era === 3) previous++;
    assert.ok(['medium_cargo', 'medium_passenger', 'low_primary', 'low_multiwing'].includes(choice.lineage));
  }
  const share = previous / total;
  assert.ok(share > 0.13 && share < 0.23, `доля ${share}`);
  assert.equal(lineageFor('high', 1, 1), lineageFor('high', 1, 1));
  assert.ok(['high_fighter', 'high_experimental'].includes(lineageFor('high', 3, 9)));
});

test('погода: числа sim важнее вида, прогноз хаба по виду', () => {
  const sim = weatherMood({ kind: 'clear', cloud: 0.8, rain: 0.2, storm: 0.1, wind: -3, flash: 0.05 });
  assert.equal(sim.cloud, 0.8);
  assert.equal(sim.rain, 0.2);
  assert.equal(sim.wind, -3);
  assert.equal(sim.flash, 0.05);
  const forecast = weatherMood({ kind: 'storm', wind: 5 });
  assert.equal(forecast.storm, 1);
  assert.equal(forecast.rain, 1);
  assert.equal(weatherMood({ kind: 'none' }).cloud, 0.3);
  assert.equal(weatherMood(null).storm, 0);
  assert.ok(weatherMood({ kind: 'dust', cloud: 1, rain: 0, storm: 1 }).dust > 0.9);
  assert.equal(weatherMood({ kind: 'rain', cloud: 0.9, rain: 0.6, storm: true }).storm, 1);
});

test('цвет неба: синий у земли, чёрный в космосе, Луна всегда тёмная', () => {
  const low = skyColor('earth', 0, { storm: 0 });
  const high = skyColor('earth', 9800, { storm: 0 });
  assert.ok(low[2] > low[0] && low[2] > 180);
  assert.ok(high[0] < 8 && high[2] < 40);
  assert.deepEqual(skyColor('moon', 0, { storm: 0 }), [3, 8, 24]);
  const storm = skyColor('earth', 100, { storm: 1 });
  assert.ok(storm[1] < low[1]);
  const mars = skyColor('mars', 0, { storm: 0 });
  assert.ok(mars[0] > mars[2]);
});

test('util: хеш детерминирован, rng воспроизводим, градиент интерполирует', () => {
  assert.equal(hash2(3, 4, 5), hash2(3, 4, 5));
  assert.notEqual(hash2(3, 4, 5), hash2(4, 3, 5));
  const a = createRng(9);
  const b = createRng(9);
  for (let i = 0; i < 10; i++) assert.equal(a(), b());
  const stops = [[0, [0, 0, 0]], [10, [100, 200, 50]]];
  assert.deepEqual(sampleStops(stops, 5), [50, 100, 25]);
  assert.deepEqual(sampleStops(stops, -5), [0, 0, 0]);
  assert.deepEqual(sampleStops(stops, 50), [100, 200, 50]);
});

test('загрузчик: ошибки одного файла не мешают остальным, параллелизм ограничен', async () => {
  const files = { a: 'x/a.png', b: 'x/b.png', c: 'x/c.png', d: { file: 'x/d.json', kind: 'json' }, e: 'x/e.png' };
  let active = 0;
  let peak = 0;
  const store = await loadAssets({ ASSET_FILES: files }, {
    concurrency: 2,
    resolveUrl: (path) => `/${path}`,
    loadImage: async (url) => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active--;
      if (url.endsWith('b.png')) throw new Error('битый файл');
      return { naturalWidth: 10, naturalHeight: 20 };
    },
    loadJson: async () => ({ ok: true }),
  });
  assert.ok(peak <= 2, `пик параллельных загрузок ${peak}`);
  assert.equal(store.size, 3);
  assert.equal(store.has('b'), false);
  assert.equal(store.errors.length, 1);
  assert.match(store.errors[0], /b: /);
  assert.deepEqual(store.json('d'), { ok: true });
  assert.deepEqual(store.get('a').anchor, [0.5, 0.5]);
});

test('адрес ассета: __GAME_ASSETS__ подменяет путь, иначе абсолютный от корня', async () => {
  const urls = [];
  const loadImage = async (url) => {
    urls.push(url);
    return { width: 1, height: 1 };
  };
  await loadAssets({ ASSET_FILES: { a: 'dir/a.png' } }, { loadImage });
  globalThis.__GAME_ASSETS__ = { 'dir/a.png': 'data:image/png;base64,AAAA' };
  try {
    await loadAssets({ ASSET_FILES: { a: 'dir/a.png' } }, { loadImage });
  } finally {
    delete globalThis.__GAME_ASSETS__;
  }
  assert.deepEqual(urls, ['/dir/a.png', 'data:image/png;base64,AAAA']);
});

test('кэш спрайтов: уменьшение один раз на размер, увеличение без копии', () => {
  const made = [];
  const cache = createSpriteCache((w, h) => {
    made.push([w, h]);
    return makeStubCanvas(w, h);
  });
  const asset = { name: 'big', img: { width: 400, height: 800 }, w: 400, h: 800 };
  const first = cache.scaled(asset, 50, 100);
  assert.strictEqual(cache.scaled(asset, 50, 100), first);
  assert.ok(made.length >= 1 && cache.size === 1);
  assert.strictEqual(cache.scaled(asset, 500, 900), asset.img);
});

test('painter: спрайт рисуется в мировых координатах, отсутствующий возвращает false', () => {
  const painter = createPainter(fakeAssets({ missing: ['coin_1978'] }), makeStubCanvas);
  const ctx = stubContext(400, 300);
  const view = createView().setStatic(0, 0, 200, 150, 2, 400, 300);
  assert.equal(painter.sprite(ctx, view, 'core_1978', 0, 0, { h: 72 }), true);
  assert.equal(painter.sprite(ctx, view, 'coin_1978', 0, 0, { h: 16 }), false);
  assert.equal(painter.sprite(ctx, view, 'core_1978', 0, 0, { h: 72, angle: 0.3, flipX: true, alpha: 0.5 }), true);
  assert.ok(ctx.calls.drawImage >= 2);
});

test('сдвиг оттенка сохраняет яркость серого и прозрачность', () => {
  const pixels = new Uint8ClampedArray([128, 128, 128, 77, 255, 0, 0, 255]);
  rotateHue(pixels, 180);
  assert.ok(Math.abs(pixels[0] - 128) <= 1 && Math.abs(pixels[1] - 128) <= 1);
  assert.equal(pixels[3], 77);
  assert.ok(pixels[4] < 255 && pixels[6] > 0, 'красный сместился');
});
