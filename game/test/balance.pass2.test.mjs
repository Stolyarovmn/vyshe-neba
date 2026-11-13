import test from 'node:test';
import assert from 'node:assert/strict';
import { firstFlight, ceilingFlight, cappedProfile } from '../tools/balance-probe.mjs';
import { planChain } from '../tools/economy-bot.mjs';
import { PART_IDS, DESTINATIONS } from '../src/data/index.js';
import { flightBonus } from '../src/data/economy.js';
import { fresh } from '../src/state/index.js';
import { buyBuilding, buyPart, getEraState, makeFlightConfig, settleFlight } from '../src/rules/index.js';
import { runFlight } from '../src/sim/run.js';
import { reach, eraCap } from '../tools/probe-levels.mjs';
import { simulateSortie } from '../tools/economy-bot-adapter.mjs';

test('Проход 2: каждый ранний уровень даёт высоту безопасного возврата', () => {
  const base = reach({});
  assert.ok(base >= 3.5 && base <= 5.5, `База: ${base}`);
  for (const id of ['engine', 'tank', 'booster']) {
    let previous = base;
    for (const level of [1, 2, 3]) {
      const altitude = reach({ [id]: level });
      assert.ok(altitude - previous >= 1.5, `${id} L${level}: ${previous} → ${altitude}`);
      previous = altitude;
    }
  }
  let previous = base;
  for (const [level, low, high] of [[1, 7, 10], [2, 12, 15], [3, 17, 22]]) {
    const altitude = reach(Object.fromEntries(PART_IDS.map((id) => [id, level])));
    assert.ok(altitude >= low && altitude <= high && altitude > previous, `Все L${level}: ${altitude}`);
    previous = altitude;
  }
  // Три покупки: топливный комплекс и два уровня бака.
  assert.ok(base < 6 && reach({ tank: 2 }) >= 6);
  const gate = cappedProfile(0);
  gate.coins = gate.data = 1e6;
  gate.milestones = { ...gate.milestones, maxAlt: 8000, maxLandAlt: base * 1000, softLandings: 3 };
  assert.equal(getEraState(gate).ok, false, 'Аварийный подъём базы выше 6 км не завершает веху');
  let upgraded = { ...structuredClone(fresh()), coins: 1e6 };
  for (const buy of [buyBuilding, buyPart, buyPart]) {
    const bought = buy(upgraded, buy === buyBuilding ? 'fuel' : 'tank');
    assert.equal(bought.ok, true);
    upgraded = bought.profile;
  }
  const config = makeFlightConfig(upgraded, { seed: 7 });
  const { result } = runFlight(config, { skill: 1, mission: 'hop', targetAlt: 650, seed: 7, maxTime: 600 });
  assert.equal(result.outcome, 'landed');
  assert.ok(result.maxAlt >= 600);
  gate.milestones.maxLandAlt = result.maxAlt * 10;
  assert.equal(getEraState(gate).ok, true, 'После трёх покупок достижим возврат с 6 км');
});

test('Проход 2: первый вылет на 1 км даёт 50–90 монет, идеальный не более 140', () => {
  const normal = firstFlight();
  const perfect = firstFlight({ perfect: true });
  assert.equal(normal.outcome, 'landed');
  assert.equal(perfect.outcome, 'landed');
  assert.ok(normal.total >= 50 && normal.total <= 90, JSON.stringify(normal));
  assert.ok(perfect.total > normal.total && perfect.total <= 140, JSON.stringify(perfect));
  for (const result of [normal, perfect]) {
    assert.ok(result.achievements + result.contracts <= result.flight);
    assert.equal(result.total, result.flight + result.achievements + result.contracts);
  }
  assert.ok(perfect.coins.perfect <= perfect.coins.landing);
});

for (const perfect of [false, true]) {
  test(`Проход 2: первый модуль после второго вылета, идеальная посадка: ${perfect}`, () => {
    let profile = fresh();
    for (let flight = 1; flight <= 2; flight++) {
      const config = makeFlightConfig(profile, { seed: 7 });
      const { result } = runFlight(config, { skill: 0.85, mission: 'hop', targetAlt: config.goalAlt / 10, seed: 7, maxTime: 420 });
      assert.equal(result.outcome, 'landed');
      profile = settleFlight(profile, { ...result, perfect }, config).profile;
      if (flight === 1) {
        // Проверяем все цепочки предпосылок, включая скидки построек.
        for (const id of PART_IDS) assert.ok(planChain(profile, 'part', id, 1).cost > profile.coins, id);
        const fuel = buyBuilding(profile, 'fuel');
        assert.equal(fuel.ok, true);
        profile = fuel.profile;
        assert.equal(buyPart(profile, 'tank').ok, false);
      }
    }
    assert.equal(buyPart(profile, 'tank').ok, true);
  });
}

for (const seed of [1, 3, 7]) {
  test(`Проход 2: потолки E0–E2 на настоящей симуляции, лучший пилот, seed ${seed}`, () => {
    const e1 = ceilingFlight(1, { seed });
    const e2 = ceilingFlight(2, { seed });
    assert.ok(e1.altitudeM >= 35000 && e1.altitudeM <= 80000, JSON.stringify(e1));
    assert.ok(e2.altitudeM >= 100000, JSON.stringify(e2));
    assert.equal(e2.outcome, 'landed', 'E2 возвращается с линии космоса');
    const lowBaseE1 = eraCap(1, { seed });
    const lowBaseE2 = eraCap(2, { seed });
    assert.ok(lowBaseE1.maxAlt >= 3500 && lowBaseE1.maxAlt <= 8000, JSON.stringify(lowBaseE1));
    assert.ok(lowBaseE2.maxAlt >= 10000, JSON.stringify(lowBaseE2));
    assert.equal(lowBaseE2.outcome, 'landed');
  });
}

test('Проход 2: вехи достигаются до потолка эпохи; Луна и Марс сохраняют эпохи открытия', () => {
  for (const [era, targetAlt] of [[0, 650], [1, 3200]]) {
    const flight = ceilingFlight(era, { targetAlt });
    assert.equal(flight.outcome, 'landed', JSON.stringify(flight));
    assert.ok(flight.altitudeM >= (era === 0 ? 6000 : 30000));
  }
  assert.equal(DESTINATIONS.moon.requires.find((r) => r.era != null).era, 3);
  assert.equal(DESTINATIONS.mars.requires.find((r) => r.era != null).era, 4);
  assert.equal(cappedProfile(0).parts.engine, 3);
});

test('Проход 2: бонус цели для интерфейса совпадает с расчётом E0 и E1–E5', () => {
  for (let era = 0; era <= 5; era++) {
    const profile = { ...structuredClone(fresh()), era };
    const { report } = settleFlight(profile, { outcome: 'landed', body: 'earth', maxAlt: 100, goalAlt: 1000 });
    assert.equal(report.coins.goal, Math.round(flightBonus('goal', era)));
    assert.equal(report.coins.landing, Math.round(flightBonus('landing', era)));
    assert.equal(report.coins.goal, era === 0 ? 10 : Math.round(20 * (1 + 0.2 * era)));
  }
});

test('Проход 2: первый разгонный блок взлетает и в аналитической модели', () => {
  const profile = structuredClone(fresh());
  profile.parts.booster = 1;
  profile.buildings.gantry = 1;
  const sortie = simulateSortie(makeFlightConfig(profile), 'earth', 40);
  assert.ok(sortie.apex > 0, 'Баки должны выдерживать первый шаг оценщика, без мгновенной аварии на земле');
  assert.equal(sortie.ok, true);
});
