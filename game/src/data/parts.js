// Nine rocket modules, 18 levels each (three per era). levels[i] describes level i + 1.
// Stats are absolute values on the simulation scale; `base` holds the values of level 0.
// The requirements of every module follow the table in DESIGN.md section 4.3.

import { STAGE_DEFAULTS } from '../sim/config.js';
import { MAX_PART_LEVEL, PART_LEVELS_PER_ERA } from './economy.js';

const core = STAGE_DEFAULTS.core;
const capsule = STAGE_DEFAULTS.capsule;
const booster = STAGE_DEFAULTS.booster;

const LEVELS = Array.from({ length: MAX_PART_LEVEL }, (_, i) => i + 1);
const ceilDiv = (level, divisor) => Math.ceil(level / divisor);
const round = (value, digits = 0) => Math.round(value * 10 ** digits) / 10 ** digits;

// Prices end in round numbers so the cards stay readable.
function nice(value) {
  if (value < 500) return Math.max(5, Math.round(value / 5) * 5);
  if (value < 5000) return Math.round(value / 10) * 10;
  if (value < 50000) return Math.round(value / 50) * 50;
  return Math.round(value / 100) * 100;
}

// Data needed for a level, before the module weight. Cheap levels are free: data is a late-game brake.
const DATA_CURVE = [0, 0, 0, 2, 3, 5, 8, 12, 18, 27, 40, 60, 90, 130, 190, 280, 400, 580];

function costs(base, growth) {
  const out = [];
  for (const level of LEVELS) {
    const value = nice(base * growth ** (level - 1));
    out.push(out.length && value <= out[out.length - 1] ? out[out.length - 1] + 5 : value);
  }
  return out;
}

function eraRequirement(level, minEra = 0) {
  const era = Math.max(minEra, ceilDiv(level, PART_LEVELS_PER_ERA) - 1);
  return era > 0 ? [{ era }] : [];
}

function buildPart(spec) {
  const priceList = costs(spec.cost.base, spec.cost.growth);
  return {
    id: spec.id,
    name: spec.name,
    desc: spec.desc,
    need: spec.need,
    base: spec.stats(0),
    statInfo: spec.statInfo,
    levels: LEVELS.map((level) => ({
      cost: priceList[level - 1],
      data: Math.round(DATA_CURVE[level - 1] * spec.dataWeight),
      stats: spec.stats(level),
      requires: [...eraRequirement(level, spec.minEra), ...spec.requires(level)],
    })),
  };
}

const stat = (key, label, unit, dir, digits = 0) => ({ key, label, unit, dir, digits });

export const PARTS = {
  engine: buildPart({
    id: 'engine',
    name: 'Двигатель',
    desc: 'Тяга, предел скорости и расход топлива. Сильный двигатель быстрее набирает высоту и тратит меньше.',
    need: 'Нужен двигатель',
    cost: { base: 150, growth: 1.32 },
    dataWeight: 1,
    stats: (level) => ({
      thrust: round(core.thrust * (1 + level / 12), 1),
      burnRate: round(core.burnRate / (1 + 0.045 * level), 2),
      speed: Math.min(190, round(68 + 5.5 * level)),
    }),
    statInfo: [stat('thrust', 'Тяга', 'ед./с²', 1, 0), stat('speed', 'Предел скорости', 'ед./с', 1, 0), stat('burnRate', 'Расход', 'ед./с', -1, 1)],
    requires: (level) => [
      { building: 'service', level: ceilDiv(level, 3) },
      { building: 'factory', level: ceilDiv(level, 6) },
    ],
  }),
  tank: buildPart({
    id: 'tank',
    name: 'Топливный бак',
    desc: 'Ёмкость маршевой ступени. Больше топлива — выше потолок и запас на посадку.',
    need: 'Нужен топливный бак',
    cost: { base: 70, growth: 1.3 },
    dataWeight: 0.8,
    stats: (level) => ({ fuel: round(core.fuel * (1 + 0.16 * level)) }),
    statInfo: [stat('fuel', 'Топливо', 'ед.', 1, 0)],
    requires: (level) => [{ building: 'fuel', level: ceilDiv(level, 3) }],
  }),
  hull: buildPart({
    id: 'hull',
    name: 'Обшивка',
    desc: 'Прочность корпуса и защита от обломков.',
    need: 'Нужна обшивка',
    cost: { base: 100, growth: 1.3 },
    dataWeight: 0.8,
    stats: (level) => ({ hp: 100 + 35 * level, debrisResist: Math.min(0.6, round(0.033 * level, 3)) }),
    statInfo: [stat('hp', 'Прочность', 'ед.', 1, 0), stat('debrisResist', 'Защита от обломков', '%', 1, 3)],
    requires: (level) => [{ building: 'factory', level: ceilDiv(level, 3) }],
  }),
  booster: buildPart({
    id: 'booster',
    name: 'Разгонный блок',
    desc: 'Отдельная стартовая ступень с собственным топливом. Мощность растёт с уровнем башни обслуживания.',
    need: 'Нужен разгонный блок',
    minEra: 1,
    cost: { base: 190, growth: 1.33 },
    dataWeight: 1.1,
    stats: (level) => ({
      fuel: level === 0 ? 0 : booster.fuel + 18 * level,
      thrustRatio: level === 0 ? 0 : round(booster.thrust / core.thrust + 0.012 * level, 3),
    }),
    statInfo: [stat('fuel', 'Топливо блока', 'ед.', 1, 0), stat('thrustRatio', 'Тяга блока', '×', 1, 2)],
    requires: () => [{ building: 'gantry', level: 1 }],
  }),
  capsule: buildPart({
    id: 'capsule',
    name: 'Капсула',
    desc: 'Последняя ступень: запасной бак, возврат и посадка.',
    need: 'Нужна капсула',
    cost: { base: 110, growth: 1.31 },
    dataWeight: 1,
    stats: (level) => ({
      fuel: capsule.fuel + 7 * level,
      thrustRatio: round(Math.min(1, capsule.thrust / core.thrust + 0.0085 * level), 3),
    }),
    statInfo: [stat('fuel', 'Запас капсулы', 'ед.', 1, 0), stat('thrustRatio', 'Тяга капсулы', '×', 1, 2)],
    requires: (level) => [{ building: 'rescue', level: ceilDiv(level, 3) }],
  }),
  legs: buildPart({
    id: 'legs',
    name: 'Посадочные опоры',
    desc: 'Допуск посадки: вертикальная и горизонтальная скорость, наклон корпуса.',
    need: 'Нужны посадочные опоры',
    cost: { base: 60, growth: 1.29 },
    dataWeight: 0.6,
    stats: (level) => ({
      vTol: round(13 + 2.2 * level, 1),
      hTol: round(18 + 2 * level, 1),
      angTol: round(0.32 + 0.035 * level, 3),
    }),
    statInfo: [stat('vTol', 'Вертикальная скорость', 'ед./с', 1, 1), stat('hTol', 'Горизонтальная скорость', 'ед./с', 1, 1), stat('angTol', 'Допуск наклона', 'рад', 1, 2)],
    requires: (level) => [{ building: 'beacons', level: ceilDiv(level, 3) }],
  }),
  fins: buildPart({
    id: 'fins',
    name: 'Стабилизаторы и РСУ',
    desc: 'Скорость поворота и снос под ветром.',
    need: 'Нужны стабилизаторы',
    cost: { base: 55, growth: 1.29 },
    dataWeight: 0.6,
    stats: (level) => ({ turn: round(1 + 0.11 * level, 2), dragCut: round(1 - 1 / (1 + 0.06 * level), 3) }),
    statInfo: [stat('turn', 'Поворот', '×', 1, 2), stat('dragCut', 'Меньше сноса', '%', 1, 3)],
    requires: (level) => [{ building: 'service', level: ceilDiv(level, 4) }],
  }),
  parachute: buildPart({
    id: 'parachute',
    name: 'Парашют',
    desc: 'Аварийный спуск в плотной атмосфере. Выше уровень — ниже скорость снижения.',
    need: 'Нужен парашют',
    cost: { base: 45, growth: 1.28 },
    dataWeight: 0.5,
    stats: (level) => ({ level, descent: Math.max(3.5, round(12 - 0.65 * level, 2)) }),
    statInfo: [stat('level', 'Купол', 'ур.', 1, 0), stat('descent', 'Скорость снижения', 'ед./с', -1, 1)],
    requires: (level) => [{ building: 'rescue', level: ceilDiv(level, 4) }],
  }),
  avionics: buildPart({
    id: 'avionics',
    name: 'Авионика',
    desc: 'Линия прогноза, зона посадки, автостабилизация и экономный перелёт.',
    need: 'Нужна авионика',
    cost: { base: 140, growth: 1.34 },
    dataWeight: 1.2,
    stats: (level) => ({
      predict: level >= 10 ? 2 : level >= 4 ? 1 : 0,
      assist: level >= 7 ? 1 : 0,
      transferSave: round(0.012 * level, 3),
    }),
    statInfo: [stat('predict', 'Линия прогноза', 'ур.', 1, 0), stat('assist', 'Автостабилизация', '', 1, 0), stat('transferSave', 'Экономия на перелёте', '%', 1, 3)],
    requires: (level) => [
      { building: 'control', level: ceilDiv(level, 3) },
      { building: 'radar', level: ceilDiv(level, 4) },
    ],
  }),
};

export const PART_IDS = Object.keys(PARTS);
