import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  ART_BUILDINGS, ASSET_FILES, BUILDING_ANCHORS, BUILDING_KEYS, ERA_SPRITE_SIZES, ERA_YEARS, FLAT_SPRITE_SIZES,
  ISLAND, PLACEABLE_BUILDINGS, PROCEDURAL_BUILDINGS, buildingSpriteName, eraYear, spriteAnchor, spriteName, spriteSize,
} from '../src/render/manifest.js';
import { pngSize, repoRoot } from './render-helpers.mjs';

const fileOf = (spec) => (typeof spec === 'string' ? spec : spec.file);

test('все файлы каталога существуют, пути не повторяются', () => {
  const seen = new Map();
  for (const [name, spec] of Object.entries(ASSET_FILES)) {
    const file = fileOf(spec);
    assert.ok(fs.existsSync(path.join(repoRoot, file)), `нет файла ${file} для ${name}`);
    assert.ok(!seen.has(file), `${file} указан дважды: ${seen.get(file)} и ${name}`);
    seen.set(file, name);
  }
  assert.ok(Object.keys(ASSET_FILES).length > 150);
});

test('размеры в манифесте совпадают с заголовками PNG (crop/scale уже применены)', () => {
  for (const [base, sizes] of Object.entries(ERA_SPRITE_SIZES)) {
    ERA_YEARS.forEach((year, era) => {
      const file = fileOf(ASSET_FILES[`${base}_${year}`]);
      assert.deepEqual(pngSize(path.join(repoRoot, file)), sizes[era], `${base}_${year}`);
    });
  }
  for (const [name, size] of Object.entries(FLAT_SPRITE_SIZES)) {
    assert.deepEqual(pngSize(path.join(repoRoot, fileOf(ASSET_FILES[name]))), size, name);
  }
});

test('якоря построек совпадают с art/placeables/BASE_ISLAND_LAYOUT.json', () => {
  const layout = JSON.parse(fs.readFileSync(path.join(repoRoot, 'art', 'placeables', 'BASE_ISLAND_LAYOUT.json'), 'utf8'));
  assert.equal(ISLAND.left, layout.world.island_world_left);
  assert.equal(ISLAND.top, layout.world.island_world_top);
  assert.equal(ISLAND.width, layout.world.island_world_width);
  assert.equal(ISLAND.waterSurfaceY, layout.world.water_surface_y);
  assert.equal(fileOf(ASSET_FILES.island_start), layout.world.island_asset);
  assert.deepEqual(Object.keys(layout.purchases).sort(), [...BUILDING_KEYS].sort());
  for (const [key, purchase] of Object.entries(layout.purchases)) {
    const expected = purchase.anchors || [purchase.anchor];
    assert.deepEqual(BUILDING_ANCHORS[key].anchors, expected, key);
    assert.equal(BUILDING_ANCHORS[key].zone, purchase.zone, key);
  }
});

test('четырнадцать построек разделены на арт, placeables и программные без пересечений', () => {
  const all = [...ART_BUILDINGS, ...Object.keys(PLACEABLE_BUILDINGS), ...PROCEDURAL_BUILDINGS];
  assert.equal(new Set(all).size, all.length);
  assert.deepEqual([...all].sort(), [...BUILDING_KEYS].sort());
  assert.deepEqual([...PROCEDURAL_BUILDINGS].sort(), ['energy', 'logistics', 'observation', 'radar', 'recovery']);
  assert.equal(PLACEABLE_BUILDINGS.factory, 'workshop/manufacturing_cell');
  assert.equal(PLACEABLE_BUILDINGS.control, 'workshop/telemetry_post');
});

test('спрайты построек доступны для каждого уровня 1..6', () => {
  for (const key of [...ART_BUILDINGS, ...Object.keys(PLACEABLE_BUILDINGS)]) {
    for (let level = 1; level <= 6; level++) {
      assert.ok(ASSET_FILES[buildingSpriteName(key, level)], `${key} ур. ${level}`);
    }
  }
});

test('имена спрайтов по эпохам и безопасные границы', () => {
  assert.equal(spriteName('core', 0), 'core_1978');
  assert.equal(spriteName('core', 5), 'core_2060');
  assert.equal(spriteName('core', 99), 'core_2060');
  assert.equal(eraYear(-3), 1978);
  assert.equal(buildingSpriteName('gantry', 3), 'bld_gantry_1998');
  assert.deepEqual(spriteSize('core_1978'), [206, 425]);
  assert.deepEqual(spriteSize('cloud_2'), [385, 266]);
  assert.equal(spriteSize('nothing_1978'), undefined);
});

test('якоря спрайтов: ступени снизу, площадки по измеренной точке касания', () => {
  assert.deepEqual(spriteAnchor('core_2015'), [0.5, 1]);
  assert.deepEqual(spriteAnchor('bld_gantry_1978'), [0.5, 1]);
  assert.equal(spriteAnchor('pad_moon_1978')[1], 0.1382);
  assert.equal(spriteAnchor('terrain_mars')[1], 0.2486);
  assert.deepEqual(spriteAnchor('coin_1978'), [0.5, 0.5]);
});

test('манифест чистый: читается Node без DOM (как в tools/build.mjs)', () => {
  assert.equal(typeof globalThis.window, 'undefined');
  assert.ok(ASSET_FILES.aircraft_fx.kind === 'json');
});
