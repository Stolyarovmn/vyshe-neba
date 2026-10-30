import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  ASSET_FILES, BUILDING_ANCHORS, BUILDING_KEYS, E0_BUILDING_SIZES, ENTRY_KEYS, ISLAND, ISLAND_ROADS, WORLD_ENTRIES,
} from '../src/render/manifest.js';
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

test('раскладка: спрайты заметные (по ширине от 60 до 240 px острова; маяк — одна стойка) и пропорциональны следу', () => {
  for (const key of BUILDING_KEYS) {
    const { size, footprint } = BUILDING_ANCHORS[key];
    assert.ok(size[0] >= (key === 'beacons' ? 60 : 90) && size[0] <= 240, `${key}: ширина ${size[0]}`);
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

// --- объекты-входы и дороги -----------------------------------------------------------------------

function entryFootprints() {
  return ENTRY_KEYS.map((key) => {
    const anchor = WORLD_ENTRIES[key].anchors[0];
    return { tag: key, key, anchor, rect: footprintOf(anchor, WORLD_ENTRIES[key].footprint) };
  });
}

test('объекты-входы: на суше, внутри острова, рядом с площадкой', () => {
  const core = ISLAND.padCore;
  for (const item of entryFootprints()) {
    assert.ok(isLand(item.anchor[0], item.anchor[1] - 2), `${item.tag}: якорь в воде`);
    assert.ok(item.rect.x0 >= 0 && item.rect.x1 <= ISLAND.width && item.rect.y0 >= 0 && item.rect.y1 <= ISLAND.height, `${item.tag}: за пределами острова`);
    assert.ok(landFraction(item.rect) >= 0.9, `${item.tag}: след не на суше (${landFraction(item.rect).toFixed(2)})`);
    assert.ok(Math.hypot(item.anchor[0] - core.center[0], item.anchor[1] - core.center[1]) < 260, `${item.tag}: далеко от площадки`);
  }
});

test('объекты-входы: не перекрываются между собой, с покупками, площадкой и каналом пламени', () => {
  const entries = entryFootprints();
  const purchases = allFootprints();
  const core = ISLAND.padCore;
  const trench = { x0: core.trench[0], y0: core.trench[1], x1: core.trench[2], y1: core.trench[3] };
  entries.forEach((a, i) => {
    const nearestX = Math.min(Math.max(core.center[0], a.rect.x0), a.rect.x1);
    const nearestY = Math.min(Math.max(core.center[1], a.rect.y0), a.rect.y1);
    assert.ok(Math.hypot(nearestX - core.center[0], nearestY - core.center[1]) >= core.radius, `${a.tag} задевает ракету на столе`);
    assert.ok(!overlaps(a.rect, trench), `${a.tag} задевает пламенный канал`);
    for (const b of entries.slice(i + 1)) assert.ok(!overlaps(a.rect, b.rect), `${a.tag} пересекается с ${b.tag}`);
    for (const b of purchases) assert.ok(!overlaps(a.rect, b.rect), `${a.tag} стоит на месте покупки ${b.tag}`);
  });
});

test('объекты-входы: размеры читаются на карте, а следы пропорциональны спрайтам', () => {
  for (const key of ENTRY_KEYS) {
    const { size, footprint } = WORLD_ENTRIES[key];
    assert.ok(size[0] >= 50 && size[1] >= 70 && size[1] <= 200, `${key}: размер ${size}`);
    assert.ok(footprint[0] <= size[0] + 1 && footprint[0] >= size[0] * 0.55, `${key}: след ${footprint[0]} при ширине ${size[0]}`);
  }
});

test('дороги островной жизни проложены по суше и не пересекают площадку', () => {
  const core = ISLAND.padCore;
  for (const road of ISLAND_ROADS) {
    for (let i = 0; i + 1 < road.points.length; i++) {
      const [x0, y0] = road.points[i];
      const [x1, y1] = road.points[i + 1];
      const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 6);
      let wet = 0;
      for (let k = 0; k <= steps; k++) {
        const x = x0 + ((x1 - x0) * k) / steps;
        const y = y0 + ((y1 - y0) * k) / steps;
        if (!isLand(x, y)) wet++;
        assert.ok(Math.hypot(x - core.center[0], y - core.center[1]) > core.radius, `${road.id}: дорога по столу`);
      }
      assert.ok(wet / (steps + 1) < 0.1, `${road.id}: участок ${i} в воде`);
    }
  }
});

test('HD-постройки E0: размеры спрайта на острове сохраняют пропорции PNG, соседи не перекрываются по спрайтам и следам', () => {
  const heights = {};
  for (const key of Object.keys(E0_BUILDING_SIZES)) {
    const [pw, ph] = E0_BUILDING_SIZES[key];
    const [w, h] = BUILDING_ANCHORS[key].size;
    assert.ok(Math.abs(w / h - pw / ph) < 0.015 * (pw / ph) + 0.01, `${key}: пропорции ${(w / h).toFixed(3)} против PNG ${(pw / ph).toFixed(3)}`);
    assert.ok(h >= 80 && h <= 200, `${key}: высота ${h}`);
    heights[key] = h;
  }
  // спрайты (низ по центру) покупок E0 в пределах острова и не накрывают ракету на столе
  const core = ISLAND.padCore;
  const sprites = [];
  for (const key of Object.keys(E0_BUILDING_SIZES)) {
    BUILDING_ANCHORS[key].anchors.forEach((anchor, i) => {
      const [w, h] = BUILDING_ANCHORS[key].size;
      const rect = { x0: anchor[0] - w / 2, y0: anchor[1] - h, x1: anchor[0] + w / 2, y1: anchor[1] };
      assert.ok(rect.x0 >= 0 && rect.x1 <= ISLAND.width && rect.y0 >= 0 && rect.y1 <= ISLAND.height, `${key}[${i}]: спрайт за островом`);
      sprites.push({ tag: `${key}[${i}]`, rect, key });
    });
  }
  for (const a of sprites) {
    const nx = Math.min(Math.max(core.center[0], a.rect.x0), a.rect.x1);
    // ракета на столе — вертикаль до 110 px над центром площадки (мачта и корпус): спрайт её не закрывает
    const hitsRocket = nx > core.center[0] - 22 && nx < core.center[0] + 22 && a.rect.y1 > core.center[1] - 110 && a.rect.y0 < core.center[1] + 30;
    assert.ok(!hitsRocket, `${a.tag} закрывает ракету на столе`);
  }
  // два спрайта, у которых нижние кромки близко (стоят «рядом», а не друг за другом), не должны перекрываться по площади больше чем на 18 %
  for (let i = 0; i < sprites.length; i++) {
    for (let j = i + 1; j < sprites.length; j++) {
      const a = sprites[i].rect;
      const b = sprites[j].rect;
      const ox = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
      const oy = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
      if (ox <= 0 || oy <= 0) continue;
      const smaller = Math.min((a.x1 - a.x0) * (a.y1 - a.y0), (b.x1 - b.x0) * (b.y1 - b.y0));
      assert.ok((ox * oy) / smaller < 0.18, `${sprites[i].tag} и ${sprites[j].tag}: перекрытие спрайтов ${(100 * (ox * oy) / smaller).toFixed(0)} %`);
    }
  }
});
