// The tables of DESIGN.md (4.2, 4.3, 4.4) and the prose around them must agree with src/data.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { BUILDINGS, BUILDING_KEYS, DESTINATIONS, ERAS, PARTS, PART_IDS } from '../src/data/index.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const design = readFileSync(path.join(here, '..', 'docs', 'DESIGN.md'), 'utf8');

// The rows of the first markdown table that follows `heading`.
function tableAfter(heading) {
  const start = design.indexOf(heading);
  assert.ok(start >= 0, `heading "${heading}" exists`);
  const rows = [];
  let inTable = false;
  for (const line of design.slice(start).split('\n').slice(1)) {
    if (line.startsWith('|')) {
      inTable = true;
      const cells = line.split('|').slice(1, -1).map((cell) => cell.trim());
      if (!cells.every((cell) => /^-+$/.test(cell))) rows.push(cells);
    } else if (inTable) break;
  }
  return rows.slice(1); // drop the header
}

const MODULE_NAMES = {
  'Двигатель': 'engine',
  'Топливный бак': 'tank',
  'Обшивка': 'hull',
  'Разгонный блок': 'booster',
  'Капсула': 'capsule',
  'Посадочные опоры': 'legs',
  'Стабилизаторы и РСУ': 'fins',
  'Авионика': 'avionics',
};

const BUILDING_NAMES = {
  'Сервис': 'service',
  'Завод': 'factory',
  'Топливный комплекс': 'fuel',
  'Башня обслуживания': 'gantry',
  'Спасательная станция': 'rescue',
  'Маяки/наведение': 'beacons',
  'Центр управления': 'control',
  'Радар': 'radar',
};

const ceilDiv = (a, b) => Math.ceil(a / b);

function parseModuleRequirements(cell) {
  const out = [];
  for (const match of cell.matchAll(/([А-Яа-я/ ]+?)\s*≥\s*(?:ceil\(ур\/(\d+)\)|(\d+))/g)) {
    const name = match[1].trim().replace(/^,\s*/, '');
    const building = BUILDING_NAMES[name];
    assert.ok(building, `known building name in "${cell}": ${name}`);
    out.push({ building, divisor: match[2] ? Number(match[2]) : null, fixed: match[3] ? Number(match[3]) : null });
  }
  return out;
}

test('DESIGN 4.3: eight modules, 18 levels, requirements per level', () => {
  const rows = tableAfter('### 4.3 Модули ракеты');
  assert.equal(rows.length, 8, 'eight rows: the parachute is a consumable');
  assert.match(design, /### 4\.3 Модули ракеты \(8 слотов\)/);
  assert.deepEqual(rows.map((row) => MODULE_NAMES[row[0]]).sort(), [...PART_IDS].sort());
  for (const row of rows) {
    const id = MODULE_NAMES[row[0]];
    const part = PARTS[id];
    assert.equal(part.name, row[0], `${id} keeps its name from the table`);
    assert.equal(part.levels.length, 18);
    const expected = parseModuleRequirements(row[2]);
    const tableBuildings = new Set(expected.map((r) => r.building));
    for (const [index, level] of part.levels.entries()) {
      const upLevel = index + 1;
      const actual = level.requires.filter((r) => r.building);
      assert.deepEqual(new Set(actual.map((r) => r.building)), tableBuildings, `${id} level ${upLevel}: buildings match the table`);
      for (const req of expected) {
        const need = req.fixed ?? ceilDiv(upLevel, req.divisor);
        const found = actual.find((r) => r.building === req.building);
        assert.equal(found.level, need, `${id} level ${upLevel}: ${req.building} >= ${need}`);
      }
    }
  }
});

test('DESIGN 4.3: the booster waits for the first era after the garage; capsule destinations need the recovery system', () => {
  const rows = tableAfter('### 4.3 Модули ракеты');
  const booster = rows.find((row) => row[0] === 'Разгонный блок');
  assert.match(booster[2], /E1\+/);
  assert.ok(PARTS.booster.levels.every((l) => l.requires.some((r) => r.era >= 1)), 'booster needs era >= 1 on every level');
  const capsule = rows.find((row) => row[0] === 'Капсула');
  assert.match(capsule[2], /Система возврата для Луны\/Марса/);
  for (const body of ['moon', 'mars']) {
    assert.ok(DESTINATIONS[body].requires.some((r) => r.building === 'recovery'), `${body} requires the recovery system`);
  }
  const avionics = rows.find((row) => row[0] === 'Авионика');
  assert.deepEqual(parseModuleRequirements(avionics[2]).map((r) => [r.building, r.divisor]), [['control', 3], ['radar', 4]]);
});

test('DESIGN 4.4: fourteen purchases with the keys of the data package', () => {
  const rows = tableAfter('### 4.4 Постройки базы');
  assert.equal(rows.length, 14);
  const keys = rows.map((row) => /`(\w+)`/.exec(row[0])[1]);
  assert.deepEqual([...keys].sort(), [...BUILDING_KEYS].sort());
  for (const row of rows) {
    const key = /`(\w+)`/.exec(row[0])[1];
    const name = row[0].replace(/\s*\(`\w+`\)/, '');
    assert.equal(BUILDINGS[key].name, name, `${key} keeps its name from the table`);
  }
});

test('DESIGN 4.4: first eras of the delayed buildings', () => {
  const sentence = /Некоторые постройки доступны только с эпохи \(([^)]+)\)/.exec(design)[1];
  const names = {
    'энергоузел': 'energy',
    'радар': 'radar',
    'центр управления': 'control',
    'наблюдательный комплекс': 'observation',
    'система возврата': 'recovery',
    'логистика': 'logistics',
    'завод': 'factory',
    'метеостанция': 'weather',
  };
  const listed = new Set();
  for (const part of sentence.split(',')) {
    const [, name, era] = /^\s*(.+?)\s+E(\d)\s*$/.exec(part);
    assert.ok(names[name], `known building "${name}"`);
    assert.equal(BUILDINGS[names[name]].minEra, Number(era), `${names[name]} first era`);
    listed.add(names[name]);
  }
  for (const key of BUILDING_KEYS) if (!listed.has(key)) assert.equal(BUILDINGS[key].minEra, 0, `${key} is available from the start`);
});

test('DESIGN 4.4: levels follow the era cap (era + 1)', () => {
  assert.match(design, /потолок = текущая эпоха \+ 1/);
  for (const key of BUILDING_KEYS) {
    BUILDINGS[key].levels.forEach((level, index) => {
      const era = level.requires.find((r) => r.era != null)?.era ?? 0;
      const expected = Math.max(BUILDINGS[key].minEra, index + 1 - 1 - BUILDINGS[key].lead);
      assert.equal(era, expected, `${key} level ${index + 1} era`);
    });
  }
});

test('DESIGN 4.2: milestones and the number of buildings per transition', () => {
  const rows = tableAfter('Переход в следующую эпоху');
  assert.equal(rows.length, 5);
  rows.forEach((row, index) => {
    assert.equal(Number(row[2]), ERAS[index].advance.buildings.count, `transition ${row[0]}: building count`);
  });
  const altitudes = rows.map((row) => /высота ≥ (\d+) км/.exec(row[1])?.[1]);
  assert.deepEqual(altitudes, ['3', '30', '100', undefined, undefined]);
  assert.equal(ERAS[0].advance.milestone.items.find((i) => i.type === 'maxAlt').min, 3000);
  assert.equal(ERAS[1].advance.milestone.items.find((i) => i.type === 'maxAlt').min, 30000);
  assert.equal(ERAS[2].advance.milestone.items.find((i) => i.type === 'maxAlt').min, 100000);
  assert.ok(ERAS[0].advance.milestone.items.some((i) => i.type === 'softLandings'));
  assert.ok(ERAS[3].advance.milestone.items.some((i) => i.type === 'moonLanding'));
  assert.ok(ERAS[4].advance.milestone.items.some((i) => i.type === 'marsLanding'));
});

test('DESIGN 4.5: three contracts plus one per logistics level up to five', () => {
  assert.match(design, /Три активных контракта \(\+1 за уровень логистики до 5\)/);
  assert.equal(BUILDINGS.logistics.levels[0].effects.contractSlots, 1);
  assert.equal(Math.min(5, 3 + BUILDINGS.logistics.levels[1].effects.contractSlots), 5);
});
