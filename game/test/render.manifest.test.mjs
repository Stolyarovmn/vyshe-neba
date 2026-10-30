import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  ART_BUILDINGS, ASSET_FILES, BROKEN_PLACEABLE_ERAS, BUILDING_ANCHORS, BUILDING_KEYS, E0_BUILDING_SIZES, ENTRY_KEYS, ERA_SPRITE_SIZES, ERA_YEARS,
  FLAT_SPRITE_SIZES, ISLAND, ISLAND_ROADS, PLACEABLE_BUILDINGS, PROCEDURAL_BUILDINGS, WORLD_ENTRIES, buildingSpriteName, eraYear,
  placeableFile, spriteAnchor, spriteName, spriteSize,
} from '../src/render/manifest.js';
import { pngProblem, pngSize, repoRoot } from './render-helpers.mjs';

const fileOf = (spec) => (typeof spec === 'string' ? spec : spec.file);

/** Имя спрайта placeables -> [каталог, эпоха], если его файл подменён вместо битого (дубликаты путей допустимы только там). */
function substitutedNames() {
  const names = new Set();
  for (const [key, dir] of Object.entries({ ...PLACEABLE_BUILDINGS, service_lift: 'workshop/service_lift' })) {
    for (const era of BROKEN_PLACEABLE_ERAS[dir] || []) {
      names.add(PLACEABLE_BUILDINGS[key] ? `bld_${key}_${ERA_YEARS[era]}` : `station_${key}_${ERA_YEARS[era]}`);
    }
  }
  return names;
}

test('все файлы каталога существуют, пути не повторяются (кроме подмены битых файлов)', () => {
  const seen = new Map();
  const substituted = substitutedNames();
  for (const [name, spec] of Object.entries(ASSET_FILES)) {
    const file = fileOf(spec);
    assert.ok(fs.existsSync(path.join(repoRoot, file)), `нет файла ${file} для ${name}`);
    assert.ok(!seen.has(file) || substituted.has(name) || substituted.has(seen.get(file)), `${file} указан дважды: ${seen.get(file)} и ${name}`);
    if (!seen.has(file)) seen.set(file, name);
  }
  assert.ok(Object.keys(ASSET_FILES).length > 150);
});

test('каждый PNG каталога цел: контрольные суммы и распаковка (битый файл браузер рисует пустым)', () => {
  const problems = [];
  const files = new Set(Object.values(ASSET_FILES).map(fileOf).filter((file) => file.endsWith('.png')));
  for (const file of files) {
    const problem = pngProblem(path.join(repoRoot, file));
    if (problem) problems.push(`${file}: ${problem}`);
  }
  assert.deepEqual(problems, []);
});

test('подмена битых файлов placeables: берётся ближайшая целая эпоха, а в таблице лишь действительно битые файлы', (t) => {
  assert.equal(placeableFile('workshop/service_lift', 0).endsWith('e0_1978.png'), true);
  assert.equal(placeableFile('workshop/service_lift', 3).endsWith('e4_2035.png'), true);
  assert.equal(placeableFile('workshop/service_lift', 2).endsWith('e1_1986.png'), true);
  assert.equal(placeableFile('workshop/service_lift', 5).endsWith('e4_2035.png'), true);
  assert.equal(placeableFile('workshop/manufacturing_cell', 1).endsWith('e0_1978.png'), true);
  assert.equal(placeableFile('workshop/telemetry_post', 2).endsWith('e1_1986.png'), true);
  assert.equal(placeableFile('base/weather_complex', 3).endsWith('e3_2015.png'), true);
  for (const [dir, eras] of Object.entries(BROKEN_PLACEABLE_ERAS)) {
    for (const era of eras) {
      const original = path.join(repoRoot, 'outputs/rocket/dist/assets/placeables', dir, `e${era}_${ERA_YEARS[era]}.png`);
      if (!pngProblem(original)) t.diagnostic(`${dir} e${era} теперь цел: уберите из BROKEN_PLACEABLE_ERAS`);
    }
  }
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

test('раскладка построек совпадает с art/placeables/BASE_ISLAND_LAYOUT.json (version 3)', () => {
  const layout = JSON.parse(fs.readFileSync(path.join(repoRoot, 'art', 'placeables', 'BASE_ISLAND_LAYOUT.json'), 'utf8'));
  assert.equal(layout.version, 3);
  assert.deepEqual(layout.world.island_size_px, [ISLAND.width, ISLAND.height]);
  assert.deepEqual(layout.world.launch_origin_px, ISLAND.launchOrigin);
  assert.equal(layout.world.units_per_px, ISLAND.unitsPerPx);
  assert.deepEqual(layout.world.pad_core.trench_px, ISLAND.padCore.trench);
  assert.equal(layout.world.pad_core.radius_px, ISLAND.padCore.radius);
  assert.equal(fileOf(ASSET_FILES.island_start), layout.world.island_asset);
  assert.deepEqual(Object.keys(layout.purchases).sort(), [...BUILDING_KEYS].sort());
  for (const [key, purchase] of Object.entries(layout.purchases)) {
    assert.deepEqual(BUILDING_ANCHORS[key].anchors, purchase.anchors, key);
    assert.equal(BUILDING_ANCHORS[key].zone, purchase.zone, key);
    assert.deepEqual(BUILDING_ANCHORS[key].size, purchase.sprite_px, key);
    assert.deepEqual(BUILDING_ANCHORS[key].footprint, purchase.footprint_px, key);
    purchase.anchors.forEach((anchor, i) => {
      assert.ok(Math.abs(purchase.anchors_uv[i][0] - anchor[0] / ISLAND.width) < 1e-4, `${key} uv x`);
      assert.ok(Math.abs(purchase.anchors_uv[i][1] - anchor[1] / ISLAND.height) < 1e-4, `${key} uv y`);
      const wx = (anchor[0] - ISLAND.launchOrigin[0]) * ISLAND.unitsPerPx;
      const wy = (anchor[1] - ISLAND.launchOrigin[1]) * ISLAND.unitsPerPx;
      assert.ok(Math.abs(purchase.anchors_world[i][0] - wx) < 0.02 && Math.abs(purchase.anchors_world[i][1] - wy) < 0.02, `${key} world`);
    });
  }
  assert.deepEqual(layout.asset_families.B03_landing_guidance, { purchase: 'beacons', zone: 'launch_core' });
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

test('объекты-входы: раскладка в манифесте совпадает с JSON, ключи для UI заданы', () => {
  const layout = JSON.parse(fs.readFileSync(path.join(repoRoot, 'art', 'placeables', 'BASE_ISLAND_LAYOUT.json'), 'utf8'));
  assert.deepEqual(ENTRY_KEYS, ['workshop', 'board', 'shop', 'monument']);
  assert.deepEqual(Object.keys(layout.entries).sort(), [...ENTRY_KEYS].sort());
  for (const key of ENTRY_KEYS) {
    const entry = layout.entries[key];
    assert.deepEqual(WORLD_ENTRIES[key].anchors, entry.anchors, key);
    assert.deepEqual(WORLD_ENTRIES[key].size, entry.sprite_px, key);
    assert.deepEqual(WORLD_ENTRIES[key].footprint, entry.footprint_px, key);
    assert.equal(WORLD_ENTRIES[key].zone, entry.zone, key);
    assert.ok(!BUILDING_KEYS.includes(key), `${key} не должен совпадать с ключом постройки`);
  }
  assert.ok(ISLAND_ROADS.length >= 1 && ISLAND_ROADS.every((road) => road.points.length >= 2));
});

test('манифест чистый: читается Node без DOM (как в tools/build.mjs)', () => {
  assert.equal(typeof globalThis.window, 'undefined');
  assert.ok(ASSET_FILES.aircraft_fx.kind === 'json');
});

test('HD-постройки E0: в каталоге из art/gen/runtime, размеры совпадают с PNG, для остальных эпох прежние файлы', () => {
  const keys = Object.keys(E0_BUILDING_SIZES);
  assert.equal(keys.length, 11);
  for (const key of keys) {
    const name = `bld_${key}_1978`;
    assert.equal(fileOf(ASSET_FILES[name]), `art/gen/runtime/${name}.png`, name);
    assert.deepEqual(pngSize(path.join(repoRoot, fileOf(ASSET_FILES[name]))), E0_BUILDING_SIZES[key], `${name}: размер`);
    assert.deepEqual(spriteSize(name), E0_BUILDING_SIZES[key]);
    assert.deepEqual(spriteAnchor(name), [0.5, 1], `${name}: низ по центру`);
    assert.equal(pngProblem(path.join(repoRoot, fileOf(ASSET_FILES[name]))), null, `${name}: повреждён`);
    assert.ok(BUILDING_ANCHORS[key], key);
  }
  // арт других эпох: готовые infrastructure/ у шести построек, у пяти программных — только силуэт кодом
  for (const key of ART_BUILDINGS) {
    for (const year of ERA_YEARS.slice(1)) assert.equal(fileOf(ASSET_FILES[`bld_${key}_${year}`]), `outputs/rocket/dist/assets/infrastructure/${key}/${year}.png`);
  }
  for (const key of PROCEDURAL_BUILDINGS) {
    assert.ok(ASSET_FILES[`bld_${key}_1978`], `${key}: арт E0`);
    for (const year of ERA_YEARS.slice(1)) assert.equal(ASSET_FILES[`bld_${key}_${year}`], undefined, `${key} ${year}: силуэт кодом`);
  }
  // старые маленькие файлы E0 больше не подключаются
  const used = new Set(Object.values(ASSET_FILES).map(fileOf));
  for (const key of ART_BUILDINGS) assert.ok(!used.has(`outputs/rocket/dist/assets/infrastructure/${key}/1978.png`), `${key}: старый E0`);
});
