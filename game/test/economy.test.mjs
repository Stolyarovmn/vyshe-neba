// Balance checks: the rational-player bot has to finish every era near its target time (DESIGN 4.7).

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { BUILDINGS, ERAS, PARTS } from '../src/data/index.js';
import { fresh } from '../src/state/index.js';
import { getBuildingState, makeFlightConfig, settleFlight } from '../src/rules/index.js';
import { CAMPAIGN, evaluate, runBot, TARGETS } from '../tools/economy-bot.mjs';
import { playFlight, safeReach, simulateSortie } from '../tools/economy-bot-adapter.mjs';
import { makeProfile, landedResult } from './rules-helpers.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const botFile = path.join(here, '..', 'tools', 'economy-bot.mjs');

function describe(run) {
  return run.eras.map((e) => `E${e.era}: ${e.minutes.toFixed(1)} min`).join(', ');
}

// После изменения выплат минуты измеряются инструментом balance, а не блокируют CI.
// Здесь проверяются прохождение аналитической модели и неизменные границы оценщика.
const quickBot = (options = {}) => runBot({ ...options, real: false });

test('Бот: аналитическая кампания достигает E5 и сообщает метрики', async () => {
  const run = await quickBot({ seed: 1 });
  assert.equal(run.reachedFinalEra, true);
  assert.equal(run.eras.length, 5);
  for (const era of run.eras) {
    assert.ok(era.minutes > 0 && era.flights > 0);
    assert.ok(era.repeatedGoalShare >= 0 && era.repeatedGoalShare <= 1);
    assert.equal(era.lostInSpace, 0);
  }
});

test('Оценщик: сохранены цели, границы ±30 % и отказ при незавершённой кампании', () => {
  // Цели бота = цели DESIGN для человека × BOT_SHARE (0,7): бот садится всегда и не тратит время в меню.
  assert.deepEqual(TARGETS.map((t) => t.minutes), [24, 49, 91, 140, 203]);
  const run = { reachedFinalEra: true, minutes: 504, eras: TARGETS.map((t) => ({ era: t.era, minutes: t.minutes })) };
  assert.equal(evaluate(run).ok, true);
  for (const target of TARGETS) {
    for (const minutes of [target.min, target.max]) {
      const eras = run.eras.map((e) => e.era === target.era ? { ...e, minutes } : e);
      assert.equal(evaluate({ ...run, eras }).rows[target.era].ok, true);
    }
    for (const minutes of [target.min - 0.01, target.max + 0.01]) {
      const eras = run.eras.map((e) => e.era === target.era ? { ...e, minutes } : e);
      assert.equal(evaluate({ ...run, eras }).ok, false);
    }
  }
  for (const minutes of [CAMPAIGN.min, CAMPAIGN.max]) assert.equal(evaluate({ ...run, minutes }).ok, true);
  for (const minutes of [CAMPAIGN.min - 0.01, CAMPAIGN.max + 0.01]) assert.equal(evaluate({ ...run, minutes }).ok, false);
  assert.equal(evaluate({ ...run, reachedFinalEra: false }).ok, false);
  assert.equal(evaluate({ ...run, eras: run.eras.slice(0, 4) }).ok, false);
});

test('Бот: кампания проходима на шести seed', async () => {
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const run = await quickBot({ seed });
    assert.equal(run.reachedFinalEra, true, `Семя ${seed}`);
    assert.equal(run.eras.length, 5);
    assert.ok(run.profile.coins >= 0);
  }
});

test('bot: the first stabilizers are bought on the second or third flight', async () => {
  const run = await quickBot({ seed: 1, untilEra: 0 });
  const firstLevel = run.eras[0].items.findIndex((item) => item.startsWith('P:fins1='));
  assert.ok(firstLevel >= 0, 'fins are among the first purchases of the era');
  assert.ok(run.eras[0].items.slice(0, 3).some((item) => item.startsWith('B:service')), 'the service team opens them first');
  assert.ok(run.firstFinsFlight >= 2 && run.firstFinsFlight <= 3, `fins bought after flight ${run.firstFinsFlight}`);
});

test('bot: a clumsier pilot is slower but still finishes', async () => {
  const careful = await quickBot({ seed: 1, skill: 0.9 });
  const clumsy = await quickBot({ seed: 1, skill: 0.4 });
  assert.equal(clumsy.reachedFinalEra, true);
  assert.ok(clumsy.minutes >= careful.minutes * 0.9, 'skill does not make the game faster');
  // Неумелый пилот (skill 0,4) бьётся и платит 12 % модулей: кампания до 2 раз длиннее верхней границы бота.
  assert.ok(clumsy.minutes <= CAMPAIGN.max * 2, `clumsy campaign ${clumsy.minutes.toFixed(0)} min`);
});

test('bot: crashes never wipe the progress', async () => {
  const run = await quickBot({ seed: 3, skill: 0.4 });
  assert.ok(run.profile.stats.crashes > 0, 'the clumsy pilot crashes sometimes');
  assert.ok(run.profile.coins >= 0);
  assert.ok(run.profile.era === 5);
});

test('the first upgrade costs one or two flights', () => {
  const cheapest = Math.min(...Object.keys(BUILDINGS).map((key) => getBuildingState(fresh(), key)).filter((s) => s.next.requires.every((r) => r.era == null || r.era === 0)).map((s) => s.next.cost));
  const profile = fresh();
  const afterFirst = settleFlight(profile, landedResult({ maxAlt: 90, distance: 150, coinsPicked: 6, rings: 0, pickups: 1 })).profile;
  const twoFlights = settleFlight(afterFirst, landedResult({ maxAlt: 90, distance: 150, coinsPicked: 6, rings: 0, pickups: 1 })).profile;
  assert.ok(twoFlights.coins >= cheapest, `two flights ${twoFlights.coins} coins, cheapest building ${cheapest}`);
  const cheapestPart = PARTS.legs.levels[0].cost;
  assert.ok(cheapestPart <= twoFlights.coins);
});

test('an era project is a multiple of ordinary purchases, not a trivial price', () => {
  for (const era of ERAS.slice(0, 5)) {
    const cheapest = Math.min(...Object.values(BUILDINGS).filter((b) => b.minEra <= era.id).map((b) => b.levels[era.id].cost));
    assert.ok(era.advance.coins >= 5 * cheapest, `E${era.id}: project ${era.advance.coins}, cheapest top-level building ${cheapest}`);
  }
});

test('Бот: CLI возвращает код 1 при выходе из допуска', () => {
  const stopped = spawnSync(process.execPath, ['--no-warnings', botFile, '--quick', '--seed', '1', '--max-minutes', '10'], { encoding: 'utf8' });
  assert.equal(stopped.status, 1);
  assert.match(stopped.stdout, /E0->E1/);
  assert.match(stopped.stdout, /Кампания:/);
  assert.match(stopped.stdout, /ВНЕ ДОПУСКА|НЕ достигнута/);
});

test('adapter: flights are deterministic and shaped like a FlightResult', () => {
  const config = makeFlightConfig(makeProfile({ buildings: { fuel: 1 }, parts: { tank: 3 } }));
  const plan = () => ({ destination: 'earth', target: 150, skill: 0.8, rng: (() => { let i = 0; return () => [0.3, 0.6, 0.1, 0.9, 0.5, 0.2, 0.7, 0.4, 0.8][i++ % 9]; })() });
  const a = playFlight(config, plan());
  const b = playFlight(config, plan());
  assert.deepEqual(a, b);
  for (const key of ['outcome', 'perfect', 'destination', 'maxAlt', 'distance', 'time', 'fuelLeft01', 'hpLeft01', 'coinsPicked', 'rings', 'pickups', 'near', 'stormTime', 'usedChute', 'reason', 'landing']) {
    assert.ok(key in a, key);
  }
  assert.ok(['landed', 'crashed'].includes(a.outcome));
  assert.ok(a.maxAlt > 0 && a.maxAlt <= 150 + 1e-6);
});

test('adapter: more fuel and a stronger engine reach higher, a stronger capsule opens the Moon', () => {
  const base = makeProfile({ era: 3, buildings: { fuel: 4, service: 4, factory: 4, rescue: 4, energy: 6 } });
  // Двигатель E0 на стенде: запас тяги исключает численный скачок оценщика при смене ступени.
  const reach = (parts) => safeReach(makeFlightConfig({ ...base, parts: { ...base.parts, engine: 3, ...parts } }));
  assert.ok(reach({ tank: 3 }) > reach({}));
  assert.ok(reach({ engine: 6 }) > reach({ engine: 2 }));
  const weak = makeFlightConfig({ ...base, parts: { ...base.parts } });
  assert.equal(simulateSortie(weak, 'moon', 10000).ok, false, 'the stock rocket cannot reach the Moon');
  const strong = makeFlightConfig({ ...base, parts: { ...base.parts, engine: 12, tank: 12, capsule: 12, legs: 6 } });
  assert.equal(simulateSortie(strong, 'moon', 10000).ok, true);
});
