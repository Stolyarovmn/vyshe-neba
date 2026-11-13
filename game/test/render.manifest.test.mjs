import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  ART_BUILDINGS, ASSET_FILES, BUILDING_ANCHORS, BUILDING_KEYS, ENTRY_KEYS, ERA_SPRITE_SIZES, ERA_YEARS,
  FLAT_SPRITE_SIZES, ISLAND, ISLAND_ROADS, PLACEABLE_BUILDINGS, PROCEDURAL_BUILDINGS, WORLD_ENTRIES, buildingSpriteName, eraYear,
  spriteAnchor, spriteName, spriteSize,
} from '../src/render/manifest.js';
import { BUILDING_KEYS as DATA_BUILDING_KEYS } from '../src/data/buildings.js';
import { pngProblem, pngSize, repoRoot } from './render-helpers.mjs';

const fileOf = (spec) => (typeof spec === 'string' ? spec : spec.file);

test('все файлы каталога существуют внутри game/assets; повторные пути принадлежат одной группе спрайтов', () => {
  const seen = new Map();
  assert.ok(Object.keys(ASSET_FILES).length > 150);
  for (const [name, spec] of Object.entries(ASSET_FILES)) {
    const file = fileOf(spec);
    // Необязательные записи (новый арт, которого ещё нет) сборка пропускает — тест тоже.
    if (spec.optional && !fs.existsSync(path.resolve(repoRoot, file))) continue;
    assert.ok(file.startsWith('game/assets/'), `${name}: ${file}`);
    const absolute = path.resolve(repoRoot, file);
    assert.ok(absolute.startsWith(path.join(repoRoot, 'game', 'assets') + path.sep), `${name}: выход из assets`);
    assert.ok(fs.statSync(absolute).isFile(), `нет файла ${file} для ${name}`);
    // Несколько эпох одной станции могут использовать один подготовленный файл.
    const group = name.replace(/_\d{4}$/, '');
    if (seen.has(file)) assert.equal(group, seen.get(file), `${file}: разные группы используют один файл`);
    seen.set(file, group);
  }
});

test('каждый PNG каталога цел: контрольные суммы и распаковка (битый файл браузер рисует пустым)', () => {
  const problems = [];
  const files = new Set(Object.values(ASSET_FILES)
    .filter((spec) => !(spec.optional && !fs.existsSync(path.join(repoRoot, fileOf(spec)))))
    .map(fileOf).filter((file) => file.endsWith('.png')));
  for (const file of files) {
    const problem = pngProblem(path.join(repoRoot, file));
    if (problem) problems.push(`${file}: ${problem}`);
  }
  assert.deepEqual(problems, []);
});

test('станции мастерской доступны во всех эпохах как целые PNG', () => {
  for (const id of ['service_lift', 'engine_test_stand', 'hull_diagnostics']) {
    for (const year of ERA_YEARS) {
      const file = fileOf(ASSET_FILES[`station_${id}_${year}`]);
      assert.equal(pngProblem(path.join(repoRoot, file)), null, `${id} ${year}`);
    }
  }
});

test('размеры в манифесте совпадают с заголовками PNG (crop/scale уже применены)', () => {
  for (const base of Object.keys(ERA_SPRITE_SIZES)) {
    ERA_YEARS.forEach((year, era) => {
      const name = (base === 'pad_moon' || base === 'pad_mars') && (era === 0 || era === 5)
        ? `${base}_${era === 0 ? 'early' : 'future'}` : `${base}_${year}`;
      const file = fileOf(ASSET_FILES[name]);
      assert.deepEqual(pngSize(path.join(repoRoot, file)), spriteSize(name), name);
    });
  }
  for (const [name, size] of Object.entries(FLAT_SPRITE_SIZES)) {
    assert.deepEqual(pngSize(path.join(repoRoot, fileOf(ASSET_FILES[name]))), size, name);
  }
});

test('раскладка манифеста: ровно четырнадцать записей по ключам игровых построек', () => {
  assert.equal(DATA_BUILDING_KEYS.length, 14);
  assert.equal(new Set(DATA_BUILDING_KEYS).size, 14);
  assert.deepEqual([...BUILDING_KEYS].sort(), [...DATA_BUILDING_KEYS].sort());
  assert.deepEqual(Object.keys(BUILDING_ANCHORS).sort(), [...DATA_BUILDING_KEYS].sort());
  assert.deepEqual([ISLAND.width, ISLAND.height], [1916, 821]);
  assert.deepEqual(ISLAND.padCore.center, ISLAND.launchOrigin);
  assert.ok(ISLAND.unitsPerPx > 0);
  for (const [key, spec] of Object.entries(BUILDING_ANCHORS)) {
    assert.ok(spec.zone, key);
    for (const variant of [spec, spec.e0]) {
      assert.ok(variant, `${key}: геометрия E0`);
      assert.equal(variant.anchors.length, key === 'beacons' ? 2 : 1, key);
      assert.equal(new Set(variant.anchors.map(String)).size, variant.anchors.length, key);
      for (const [x, y] of variant.anchors) {
        assert.ok(Number.isFinite(x) && x >= 0 && x <= ISLAND.width, `${key}: x`);
        assert.ok(Number.isFinite(y) && y >= 0 && y <= ISLAND.height, `${key}: y`);
      }
      assert.ok(variant.size.every(v => Number.isFinite(v) && v > 0), key);
      assert.ok(variant.footprint.every(v => Number.isFinite(v) && v > 0), key);
      assert.ok(variant.footprint[0] <= variant.size[0], `${key}: ширина следа`);
    }
  }
});

test('четырнадцать построек разделены на арт, placeables и программные без пересечений', () => {
  const all = [...ART_BUILDINGS, ...Object.keys(PLACEABLE_BUILDINGS), ...PROCEDURAL_BUILDINGS];
  assert.equal(new Set(all).size, all.length);
  assert.deepEqual([...all].sort(), [...BUILDING_KEYS].sort());
  assert.deepEqual([...PROCEDURAL_BUILDINGS].sort(), ['energy', 'logistics', 'observation', 'radar', 'recovery']);
  assert.equal(PLACEABLE_BUILDINGS.factory, 'base/factory');
  assert.equal(PLACEABLE_BUILDINGS.control, 'base/control');
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

test('объекты-входы: уникальные ключи UI, якоря внутри острова и допустимые размеры', () => {
  assert.deepEqual(ENTRY_KEYS, ['workshop', 'board', 'shop', 'monument']);
  assert.deepEqual(Object.keys(WORLD_ENTRIES).sort(), [...ENTRY_KEYS].sort());
  for (const key of ENTRY_KEYS) {
    const entry = WORLD_ENTRIES[key];
    assert.equal(entry.anchors.length, 1, key);
    assert.ok(entry.zone, key);
    assert.ok(!BUILDING_KEYS.includes(key), key);
    for (const [x, y] of [...entry.anchors, entry.e0Anchor]) {
      assert.ok(x >= 0 && x <= ISLAND.width && y >= 0 && y <= ISLAND.height, key);
    }
    assert.ok(entry.size.every(v => v > 0) && entry.footprint.every(v => v > 0), key);
    assert.ok(entry.footprint[0] <= entry.size[0], key);
  }
  assert.ok(ISLAND_ROADS.length >= 1 && ISLAND_ROADS.every(road => road.points.length >= 2));
});

test('манифест чистый: читается Node без DOM (как в tools/build.mjs)', () => {
  assert.equal(typeof globalThis.window, 'undefined');
  assert.ok(ASSET_FILES.aircraft_fx.kind === 'json');
});

test('постройки E0: PNG существуют, пиксельные размеры точны, остальные спрайты уменьшаются на острове', () => {
  for (const key of DATA_BUILDING_KEYS) {
    const name = `bld_${key}_1978`;
    const file = fileOf(ASSET_FILES[name]);
    assert.equal(file, `game/assets/eras/e0-1978/${PLACEABLE_BUILDINGS[key] || `base/${key}`}.png`, name);
    const actual = pngSize(path.join(repoRoot, file));
    const spec = BUILDING_ANCHORS[key].e0;
    if (spec.smooth === false) {
      assert.deepEqual(spec.size, actual, `${key}: пиксельный спрайт 1:1`);
    } else {
      assert.ok(spec.size.every((v, i) => v <= actual[i]), `${key}: размер на острове не больше PNG`);
    }
    assert.deepEqual(spriteAnchor(name), [0.5, 1], name);
    assert.equal(pngProblem(path.join(repoRoot, file)), null, name);
  }
  for (const key of ART_BUILDINGS) {
    ERA_YEARS.slice(1).forEach((year, i) => {
      assert.equal(fileOf(ASSET_FILES[`bld_${key}_${year}`]), `game/assets/eras/e${i + 1}-${year}/base/${key}.png`);
    });
  }
  for (const key of PROCEDURAL_BUILDINGS) {
    for (const year of ERA_YEARS.slice(1)) assert.equal(ASSET_FILES[`bld_${key}_${year}`], undefined, `${key} ${year}: программный силуэт`);
  }
});
