import test from 'node:test';
import assert from 'node:assert/strict';
import { BUILDINGS, ERAS, PARTS } from '../src/data/index.js';
import { CRASH_LOSS, PAYOUT } from '../src/data/economy.js';
import { finsTilt, finsTurn } from '../src/data/parts.js';
import { crashLoss, flightGoal, getEraState, getNextSteps, makeFlightConfig, partsValue, settleFlight } from '../src/rules/index.js';
import { fresh, parseSave, serialize, validateProfile } from '../src/state/index.js';
import { normalizeConfig } from '../src/sim/config.js';
import { createFlight, summarize } from '../src/sim/flight.js';
import { advance } from '../src/sim/run.js';
import { landedResult, crashedResult, makeProfile } from './rules-helpers.mjs';

test('Проход 1: точные точки кривых рулёжки и цены первых уровней', () => {
  for (const [level, turn] of [[0, 0.22], [3, 0.55], [6, 1], [9, 1.5], [12, 2], [18, 2.4]]) assert.equal(finsTurn(level), turn);
  for (const [level, tilt] of [[0, 0.12], [3, 0.45], [6, 0.9], [9, Math.PI], [18, Math.PI]]) assert.equal(finsTilt(level), tilt);
  // Проход 2: первый модуль вместе с сервисом покупается после второго вылета.
  assert.deepEqual(PARTS.fins.levels.slice(0, 3).map((l) => l.cost), [30, 35, 50]);
  assert.equal(finsTurn(1), 0.33);
  assert.equal(finsTilt(1), 0.23);
});

test('Стартовый корпус ограничен 7°, скорость поворота за 2 с растёт от <30° до >60° с ур. 3', () => {
  const config = makeFlightConfig(fresh());
  const plain = createFlight({ ...config, quietSky: true, start: { body: 'earth', alt: 500, vy: 0 } });
  let maxAngle = 0;
  advance(plain, { tilt: 1 }, 2, (s) => { maxAngle = Math.max(maxAngle, Math.abs(s.angle)); });
  assert.ok(maxAngle <= 7 * Math.PI / 180);
  assert.ok(maxAngle < 30 * Math.PI / 180);
  // Для замера скорости РСУ убираем только упор; штатный ур. 3 ограничен 0,45 рад.
  const freeTurn = (level) => {
    const cfg = makeFlightConfig(makeProfile({ parts: { fins: level } }));
    const state = createFlight({ ...cfg, quietSky: true, fins: { ...cfg.fins, maxTilt: Math.PI }, start: { body: 'earth', alt: 11000 } });
    advance(state, { tilt: 1 }, 2);
    return Math.abs(state.angle);
  };
  assert.ok(freeTurn(0) < 30 * Math.PI / 180);
  assert.ok(freeTurn(3) > 60 * Math.PI / 180);
  const level3 = createFlight({ ...makeFlightConfig(makeProfile({ parts: { fins: 3 } })), quietSky: true, start: { body: 'earth', alt: 11000 } });
  advance(level3, { tilt: 1 }, 2);
  assert.ok(level3.angle <= 0.45 && level3.angle > maxAngle * 2);
});

test('Вехи требуют три посадки и подтверждённую посадкой высоту', () => {
  assert.deepEqual(ERAS[0].advance.milestone.items, [{ type: 'maxAlt', min: 6000 }, { type: 'landAlt', min: 6000 }, { type: 'softLandings', min: 3 }]);
  for (const [era, altitude, landAltitude] of [[1, 30000, 20000], [2, 100000, 100000]]) {
    const profile = makeProfile({ era, milestones: { maxAlt: altitude, maxLandAlt: landAltitude - 1 } });
    const milestone = getEraState(profile).conditions.find((c) => c.kind === 'milestone');
    assert.equal(milestone.ok, false);
    assert.equal(milestone.items.find((i) => i.type === 'landAlt').have, landAltitude - 1);
    profile.milestones.maxLandAlt = landAltitude;
    assert.equal(getEraState(profile).conditions.find((c) => c.kind === 'milestone').ok, true);
    const step = getNextSteps({ ...profile, milestones: { ...profile.milestones, maxLandAlt: 0 } }, 100).find((s) => s.id === 'landAlt');
    assert.equal(step.text, `Полёт: поднимись на ${landAltitude / 1000} км и сядь`);
  }
});

test('Рекорд посадки сохраняется, авария его не повышает, миграция начинает с нуля', () => {
  const p = settleFlight(fresh(), landedResult({ maxAlt: 2100 })).profile;
  assert.equal(p.milestones.maxLandAlt, 21000);
  const crashed = settleFlight(p, crashedResult({ maxAlt: 11000 })).profile;
  assert.equal(crashed.milestones.maxLandAlt, 21000);
  assert.equal(crashed.milestones.maxAlt, 110000);
  assert.equal(parseSave(serialize(crashed)).profile.milestones.maxLandAlt, 21000);
  const old = structuredClone(crashed);
  old.v = 1;
  delete old.milestones.maxLandAlt;
  const migrated = parseSave(serialize(old));
  assert.equal(migrated.migratedFrom, 1);
  assert.equal(migrated.profile.milestones.maxLandAlt, 0);
  assert.equal(migrated.profile.milestones.maxAlt, 110000);
  assert.deepEqual(validateProfile(migrated.profile), []);
});

test('Доход: кольца и центры, пролёты с потолком, экономия, цель и нулевые строки', () => {
  const profile = makeProfile({ era: 2 });
  const result = landedResult({ maxAlt: 500, goalAlt: 5000, rings: 3, ringsCenter: 1, near: 9, fuelLeft01: 0.2 });
  const coin = settleFlight(profile, result).report.coins;
  assert.equal(coin.landing, 56);
  assert.equal(coin.rings, Math.round(8 * 4 * 1.4));
  assert.equal(coin.near, 30);
  assert.equal(coin.fuelSaving, Math.round(coin.travel * 0.1));
  assert.equal(coin.goal, 28);
  assert.equal(coin.gross, ['travel', 'loot', 'landing', 'perfect', 'expedition', 'storm', 'rings', 'near', 'fuelSaving', 'goal'].reduce((sum, key) => sum + coin[key], 0));
  const zero = settleFlight(profile, landedResult({ maxAlt: 499, goalAlt: 5000, fuelLeft01: 0.199 })).report.coins;
  for (const key of ['rings', 'near', 'fuelSaving', 'goal']) assert.equal(zero[key], 0, key);
  assert.equal(settleFlight(profile, { ...result, near: 1 }).report.coins.near, 5);
  const crash = settleFlight(profile, { ...result, outcome: 'crashed' }).report.coins;
  for (const key of ['near', 'fuelSaving', 'goal', 'landing', 'perfect']) assert.equal(crash[key], 0, key);
  assert.equal(crash.rings, coin.rings);
  assert.equal(settleFlight(profile, { ...result, outcome: 'abandoned' }).report.coins.rings, 0);
  assert.equal(settleFlight(profile, { ...result, ringsCenter: undefined, ringsCentered: 1 }).report.coins.rings, coin.rings);
  assert.equal(settleFlight(fresh(), landedResult({ perfect: true })).report.coins.perfect, 20);
});

test('Авария: 12 % стоимости, минимум 20, половина добычи и подсказка о сохранённых монетах', () => {
  assert.deepEqual(CRASH_LOSS, { partValueShare: 0.12, minimum: 20, purseShare: 0.5 });
  assert.equal(PAYOUT.crashLootShare, 0.5);
  const profile = makeProfile({ coins: 10000, parts: { engine: 9, tank: 9 } });
  assert.equal(crashLoss(profile, 'earth'), Math.max(20, Math.round(partsValue(profile) * 0.12)));
  assert.equal(crashLoss(fresh(), 'earth'), 20);
  const report = settleFlight(profile, crashedResult({ coinsPicked: 100 })).report;
  assert.equal(report.coins.loot, 50);
  assert.equal(report.hint.savedIfLanded, report.coins.charged + 50);
  assert.equal(settleFlight(profile, landedResult({ coinsPicked: 100 })).report.coins.saved, crashLoss(profile, 'earth') + 50);
  assert.ok(crashLoss(makeProfile({ ...profile, buildings: { rescue: 1 } }), 'earth') < crashLoss(profile, 'earth'));
  const poor = settleFlight(fresh(), crashedResult({ maxAlt: 0, distance: 0, coinsPicked: 0 })).report;
  assert.ok(poor.coins.charged <= Math.floor(poor.coins.gross / 2));
  const lost = settleFlight(profile, crashedResult({ reason: 'lost-in-space' })).report.hint;
  assert.equal(lost.part, 'fins');
  assert.equal(lost.level, 9);
});

test('Цель: первые три вылета, округление, предел невзятой вехи и передача до результата', () => {
  let profile = fresh();
  assert.equal(flightGoal(profile), 1000);
  profile = settleFlight(profile, landedResult({ maxAlt: 100 })).profile;
  assert.equal(flightGoal(profile), 1200);
  profile = settleFlight(profile, landedResult({ maxAlt: 120 })).profile;
  assert.equal(flightGoal(profile), 1400);
  profile.milestones.maxAlt = 5901;
  assert.equal(flightGoal(profile), 6000);
  profile.milestones.maxAlt = 6000;
  assert.equal(flightGoal(profile), 6300);
  const cfg = makeFlightConfig(profile);
  assert.equal(normalizeConfig(cfg).goalAlt, 6300);
  const state = createFlight(cfg);
  assert.equal(summarize(state).goalAlt, 6300);
  assert.equal(summarize(state).maxAlt, 0);
  assert.equal(normalizeConfig({ goalAlt: NaN }).goalAlt, 0);
});

test('Что дальше: приоритет эффекта перед ценой, опоры после аварии, внутри класса цена', () => {
  const p = makeProfile({ coins: 1e6, buildings: { service: 1, factory: 1, fuel: 1, rescue: 1, gantry: 1, beacons: 1 } });
  const steps = getNextSteps(p, 100).filter((s) => s.kind.startsWith('buy-'));
  const indices = Object.fromEntries(steps.map((s, i) => [s.id, i]));
  for (const id of ['engine', 'tank', 'capsule', 'booster', 'fins']) assert.ok(indices[id] < indices.deluge);
  assert.ok(indices.deluge < indices.legs);
  const repaired = getNextSteps({ ...p, lastCrashReason: 'landing-speed' }, 100).filter((s) => s.kind.startsWith('buy-'));
  assert.ok(repaired.findIndex((s) => s.id === 'legs') < repaired.findIndex((s) => s.id === 'deluge'));
  const primary = repaired.filter((s) => ['engine', 'tank', 'capsule', 'booster', 'fins', 'legs'].includes(s.id));
  assert.deepEqual(primary.map((s) => s.cost), primary.map((s) => s.cost).sort((a, b) => a - b));
  const after = settleFlight(p, crashedResult({ reason: 'landing-drift' })).profile;
  assert.equal(parseSave(serialize(after)).profile.lastCrashReason, 'landing-drift');
});

test('Постройки: рост 2,6 и данные с четвёртого уровня', () => {
  assert.deepEqual(BUILDINGS.service.levels.map((l) => l.data), [0, 0, 0, 2, 6, 12]);
  assert.deepEqual(BUILDINGS.beacons.levels.map((l) => l.cost), [65, 95, 190, 650, 1700, 4420]);
});
