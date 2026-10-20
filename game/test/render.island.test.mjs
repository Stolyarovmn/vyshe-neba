import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { ASSET_FILES, BUILDING_ANCHORS, BUILDING_KEYS, ISLAND } from '../src/render/manifest.js';
import { pngSize, repoRoot } from './render-helpers.mjs';

const envDir = path.join(repoRoot, 'art', 'gen', 'environment');
const land = JSON.parse(fs.readFileSync(path.join(envDir, 'start_island_hd.land.json'), 'utf8'));
const landGrid = land.land_hex_rows.map((row) => {
  const bits = [...row].map((c) => parseInt(c, 16).toString(2).padStart(4, '0')).join('');
  return [...bits.slice(0, land.cols)].map((b) => b === '1');
});

function isLand(px, py) {
  const row = landGrid[Math.floor(py / land.cell_px)];
  return !!row && !!row[Math.floor(px / land.cell_px)];
}

function footprintOf(anchor, footprint) {
  return { x0: anchor[0] - footprint[0] / 2, y0: anchor[1] - footprint[1], x1: anchor[0] + footprint[0] / 2, y1: anchor[1] };
}

function landFraction(rect) {
  let total = 0;
  let hit = 0;
  for (let y = Math.floor(rect.y0 / land.cell_px); y <= Math.floor(rect.y1 / land.cell_px); y++) {
    for (let x = Math.floor(rect.x0 / land.cell_px); x <= Math.floor(rect.x1 / land.cell_px); x++) {
      total++;
      if (landGrid[y] && landGrid[y][x]) hit++;
    }
  }
  return hit / total;
}

const overlaps = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

function allFootprints() {
  const list = [];
  for (const key of BUILDING_KEYS) {
    BUILDING_ANCHORS[key].anchors.forEach((anchor, i) => {
      list.push({ tag: `${key}[${i}]`, key, anchor, rect: footprintOf(anchor, BUILDING_ANCHORS[key].footprint) });
    });
  }
  return list;
}

test('HD-остров: размеры файла, маска суши и манифест согласованы', () => {
  const file = path.join(repoRoot, ASSET_FILES.island_start);
  assert.deepEqual(pngSize(file), [ISLAND.width, ISLAND.height]);
  assert.deepEqual(land.size, [ISLAND.width, ISLAND.height]);
  assert.equal(landGrid.length, land.rows);
  assert.ok(landGrid.every((row) => row.length === land.cols));
  assert.ok(isLand(...ISLAND.launchOrigin), 'центр площадки на суше');
  assert.ok(fs.statSync(file).size < 1.6 * 1024 * 1024, 'вес острова в сборке');
});

test('HD-остров: происхождение записано, статус «ждёт утверждения»', () => {
  const meta = JSON.parse(fs.readFileSync(path.join(envDir, 'start_island_hd.meta.json'), 'utf8'));
  assert.equal(meta.source.drive_id, '109IFUuj4paHf6Chdbj-5ABRoyLmDj8mw');
  assert.match(meta.source.sha256, /^[0-9a-f]{64}$/);
  assert.deepEqual(meta.source.size, [1916, 821]);
  assert.equal(meta.approved_by_user, false);
  assert.equal(meta.status, 'pending');
  assert.equal(meta.contains_starter_tower, false);
  const sha = crypto.createHash('sha256').update(fs.readFileSync(path.join(repoRoot, ASSET_FILES.island_start))).digest('hex');
  assert.equal(meta.output_sha256, sha, 'meta.output_sha256 соответствует файлу (перезапустите game/tools/prepare-island-hd.py)');
});

test('раскладка: все якоря и следы построек на суше, внутри острова', () => {
  for (const item of allFootprints()) {
    assert.ok(isLand(item.anchor[0], item.anchor[1] - 2), `${item.tag}: якорь в воде`);
    assert.ok(item.rect.x0 >= 0 && item.rect.x1 <= ISLAND.width && item.rect.y0 >= 0 && item.rect.y1 <= ISLAND.height, `${item.tag}: за пределами острова`);
    assert.ok(landFraction(item.rect) >= 0.9, `${item.tag}: след не на суше (${landFraction(item.rect).toFixed(2)})`);
  }
});

test('раскладка: постройки не перекрываются между собой и со стартовой площадкой', () => {
  const items = allFootprints();
  const core = ISLAND.padCore;
  const trench = { x0: core.trench[0], y0: core.trench[1], x1: core.trench[2], y1: core.trench[3] };
  for (let i = 0; i < items.length; i++) {
    const a = items[i];
    const nearestX = Math.min(Math.max(core.center[0], a.rect.x0), a.rect.x1);
    const nearestY = Math.min(Math.max(core.center[1], a.rect.y0), a.rect.y1);
    assert.ok(Math.hypot(nearestX - core.center[0], nearestY - core.center[1]) >= core.radius, `${a.tag} задевает ракету на столе`);
    assert.ok(!overlaps(a.rect, trench), `${a.tag} задевает пламенный канал`);
    for (let j = i + 1; j < items.length; j++) assert.ok(!overlaps(a.rect, items[j].rect), `${a.tag} пересекается с ${items[j].tag}`);
  }
});

test('раскладка: спрайты заметные (по ширине от 90 до 240 px острова) и пропорциональны следу', () => {
  for (const key of BUILDING_KEYS) {
    const { size, footprint } = BUILDING_ANCHORS[key];
    assert.ok(size[0] >= 90 && size[0] <= 240, `${key}: ширина ${size[0]}`);
    assert.ok(footprint[0] <= size[0] && footprint[0] >= size[0] * 0.6, `${key}: след ${footprint[0]} при ширине ${size[0]}`);
  }
});

test('у каждой покупки есть зона и якорь; маяки парные по сторонам площадки', () => {
  for (const key of BUILDING_KEYS) assert.ok(BUILDING_ANCHORS[key].zone && BUILDING_ANCHORS[key].anchors.length >= 1, key);
  assert.equal(BUILDING_ANCHORS.beacons.anchors.length, 2);
  const [left, right] = BUILDING_ANCHORS.beacons.anchors;
  assert.ok(left[0] < ISLAND.launchOrigin[0] && right[0] > ISLAND.launchOrigin[0]);
});

test('масштаб острова: октагон площадки соответствует посадочной зоне sim', () => {
  const padWidthUnits = 256 * ISLAND.unitsPerPx;
  assert.ok(Math.abs(padWidthUnits - 170) < 3, `октагон ${padWidthUnits} ед.`);
  assert.ok(ISLAND.widthUnits > 1000 && ISLAND.widthUnits < 1500);
});
