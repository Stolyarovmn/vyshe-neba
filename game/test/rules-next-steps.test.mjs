// getNextSteps: the short list of nearest useful actions for the interface.

import test from 'node:test';
import assert from 'node:assert/strict';
import { BUILDINGS, ERAS, PARTS } from '../src/data/index.js';
import { buyBuilding, buyPart, getNextSteps, kmText } from '../src/rules/index.js';
import { deepFreeze, makeProfile } from './rules-helpers.mjs';

// Buys everything the era allows (with unlimited coins), then sets the purse to `coins`.
function everythingOfTheEra(profile, coins = 0, data = 0) {
  let current = { ...profile, coins: 1e9, data: 1e9 };
  for (let guard = 0; guard < 300; guard++) {
    let bought = false;
    for (const key of Object.keys(BUILDINGS)) {
      const r = buyBuilding(current, key);
      if (r.ok) { current = { ...r.profile, coins: 1e9, data: 1e9 }; bought = true; }
    }
    for (const id of Object.keys(PARTS)) {
      const r = buyPart(current, id);
      if (r.ok) { current = { ...r.profile, coins: 1e9, data: 1e9 }; bought = true; }
    }
    if (!bought) break;
  }
  return { ...current, coins, data };
}

test('a new game: nothing to pay for yet, so the first step is a flight and the rest are the cheapest buildings', () => {
  const steps = getNextSteps(makeProfile());
  assert.equal(steps.length, 4);
  assert.deepEqual(steps[0], {
    kind: 'fly', id: 'landing', cost: 0, affordable: true, reasons: [], text: 'Полёт: сядь мягко', goal: { type: 'landing', have: 0, need: 1 },
  });
  assert.ok(steps.slice(1).every((s) => s.kind === 'buy-building' && !s.affordable));
  assert.ok(steps.slice(1).every((s, i, all) => i === 0 || s.cost >= all[i - 1].cost), 'cheapest first');
  assert.ok(steps[1].reasons.every((r) => r.kind === 'coins'));
  assert.match(steps[1].reasons[0].text, /^Нужно ещё \d+ монет[аы]?$/);
  assert.match(steps[1].text, /^Построить: /);
});

test('with some coins the buildings the player can pay for come first, cheapest first', () => {
  const steps = getNextSteps(makeProfile({ coins: 60 }), 6);
  const affordable = steps.filter((s) => s.affordable);
  assert.ok(affordable.length >= 2);
  assert.deepEqual(steps.slice(0, affordable.length), affordable, 'affordable steps lead the list');
  assert.ok(affordable.every((s, i) => i === 0 || s.cost >= affordable[i - 1].cost));
  assert.ok(affordable.every((s) => s.cost <= 60 && s.reasons.length === 0));
  const waiting = steps.slice(affordable.length);
  assert.ok(waiting.every((s) => !s.affordable && s.cost > 60));
  // Example texts: «Построить: Стартовые маяки», «Построить: Сервисная команда».
  assert.deepEqual(affordable.slice(0, 2).map((s) => s.text), ['Построить: Стартовые маяки', 'Построить: Сервисная команда']);
});

test('only what is buildable now is offered: modules appear when the base allows them', () => {
  const rich = makeProfile({ coins: 1e6 });
  const ids = (profile) => getNextSteps(profile, 40).filter((s) => s.kind === 'buy-part').map((s) => s.id);
  assert.deepEqual(ids(rich), [], 'every module needs a level-1 building first');
  assert.deepEqual(ids({ ...rich, buildings: { ...rich.buildings, fuel: 1 } }), ['tank']);
  const withService = { ...rich, buildings: { ...rich.buildings, fuel: 1, service: 1, factory: 1 } };
  assert.deepEqual(ids(withService).sort(), ['engine', 'fins', 'hull', 'tank']);
  const part = getNextSteps(withService, 40).find((s) => s.id === 'engine');
  assert.equal(part.level, 1);
  assert.equal(part.text, 'Улучшить: Двигатель до ур. 1');
  assert.ok(part.cost > 0 && part.affordable);
});

test('upgrades are worded as upgrades and carry the level', () => {
  const profile = makeProfile({ coins: 1e6, era: 1, buildings: { fuel: 1, energy: 1 } });
  const step = getNextSteps(profile, 40).find((s) => s.kind === 'buy-building' && s.id === 'fuel');
  assert.equal(step.level, 2);
  assert.equal(step.text, 'Улучшить: Топливный комплекс до ур. 2');
});

test('data shortage: the item stays on the list with a data reason', () => {
  const profile = makeProfile({ era: 3, coins: 1e6, data: 0, buildings: { fuel: 4, energy: 3 }, parts: { tank: 9 } });
  const tank = getNextSteps(profile, 60).find((s) => s.kind === 'buy-part' && s.id === 'tank');
  assert.ok(tank, 'the tank level 10 is offered');
  assert.equal(tank.level, 10);
  assert.equal(tank.affordable, false);
  assert.ok(tank.data > 0);
  assert.deepEqual(tank.reasons.map((r) => r.kind), ['data']);
  assert.match(tank.reasons[0].text, /^Нужно ещё \d+ данных$/);
  const paid = getNextSteps({ ...profile, data: 1000 }, 60).find((s) => s.id === 'tank');
  assert.equal(paid.affordable, true);
});

test('only data missing for the era: the flight goal is to collect data', () => {
  const profile = everythingOfTheEra(makeProfile({ era: 1, milestones: { maxAlt: 30000, softLandings: 1 } }), ERAS[1].advance.coins, 0);
  const steps = getNextSteps(profile);
  assert.deepEqual(steps.map((s) => s.kind), ['fly', 'era']);
  assert.equal(steps[0].id, 'data');
  assert.match(steps[0].text, /^Полёт: ещё \d+ данных/);
  assert.deepEqual(steps[1].reasons.map((r) => r.kind), ['data']);
});

test('everything of the era bought: the era card shows what is missing, with the altitude progress', () => {
  const profile = deepFreeze(everythingOfTheEra(makeProfile({ milestones: { maxAlt: 1200, softLandings: 1 } }), 100, 3));
  const steps = getNextSteps(profile);
  assert.deepEqual(steps.map((s) => s.kind), ['fly', 'era']);
  const [fly, era] = steps;
  assert.equal(fly.id, 'altitude');
  assert.equal(fly.text, 'Полёт: поднимись на 3 км (рекорд 1,2 км)');
  assert.deepEqual(fly.goal, { type: 'altitude', have: 1200, need: 3000 });
  assert.equal(era.id, 1);
  assert.equal(era.cost, ERAS[0].advance.coins);
  assert.equal(era.affordable, false);
  const kinds = era.reasons.map((r) => r.kind);
  assert.deepEqual(kinds, ['coins', 'data', 'milestone']);
  assert.match(era.reasons[0].text, /^Нужно ещё \d+ монет[аы]?$/);
  assert.equal(era.reasons[1].text, `Нужно ещё ${ERAS[0].advance.data - 3} данных`);
  assert.equal(era.reasons[2].text, 'Высота 3 км: сейчас 1,2 км');
  assert.equal(era.reasons[2].have, 1200);
  assert.equal(era.reasons[2].need, 3000);
  assert.match(era.text, /^Эпоха 1986: /);
});

test('the milestone of the first landing asks for a flight too', () => {
  const profile = everythingOfTheEra(makeProfile(), 1e6, 1e6);
  const steps = getNextSteps(profile);
  assert.equal(steps[0].kind, 'fly');
  assert.equal(steps[0].id, 'landing');
  const era = steps.find((s) => s.kind === 'era');
  assert.deepEqual(era.reasons.map((r) => r.kind), ['milestone', 'milestone']);
  assert.deepEqual(era.reasons.map((r) => r.type), ['softLandings', 'maxAlt']);
});

test('only coins missing: the flight goal is to earn them', () => {
  const profile = everythingOfTheEra(makeProfile({ milestones: { maxAlt: 3000, softLandings: 1 } }), 10, ERAS[0].advance.data);
  const steps = getNextSteps(profile);
  assert.deepEqual(steps.map((s) => s.kind), ['fly', 'era']);
  assert.equal(steps[0].id, 'coins');
  assert.match(steps[0].text, /^Полёт: ещё \d+ монет[аы]?$/);
  assert.equal(steps[0].goal.type, 'coins');
});

test('the era card is ready when every condition holds, and it stays visible behind cheap purchases', () => {
  const ready = everythingOfTheEra(makeProfile({ milestones: { maxAlt: 3000, softLandings: 1 } }), ERAS[0].advance.coins, ERAS[0].advance.data);
  const steps = getNextSteps(ready);
  assert.deepEqual(steps.map((s) => s.kind), ['era']);
  assert.equal(steps[0].affordable, true);
  assert.deepEqual(steps[0].reasons, []);
  assert.equal(steps[0].text, 'Эпоха 1986: можно перейти');
  assert.equal(steps[0].cost, ERAS[0].advance.coins);

  // The same player one era later has 38 new things to buy; the ready card must not disappear.
  const crowded = makeProfile({ era: 0, coins: 1e6, data: 1e6, milestones: { maxAlt: 3000, softLandings: 1 }, buildings: { beacons: 1, gantry: 1, deluge: 1, service: 1, rescue: 1, fuel: 1, logistics: 1, factory: 1 } });
  const list = getNextSteps(crowded, 4);
  assert.equal(list.length, 4);
  assert.equal(list[3].kind, 'era', 'the ready card replaces the last slot');
  assert.ok(list.slice(0, 3).every((s) => s.kind.startsWith('buy-') && s.affordable));
});

test('the last era with everything bought: nothing to do', () => {
  const profile = everythingOfTheEra(makeProfile({ era: 5 }), 5, 5);
  assert.deepEqual(getNextSteps(profile), [{ kind: 'wait', id: 'done', cost: 0, affordable: false, reasons: [], text: 'Всё куплено' }]);
});

test('limit: default four, any positive number, never fewer than one', () => {
  const profile = makeProfile({ coins: 1e6 });
  assert.equal(getNextSteps(profile).length, 4);
  assert.equal(getNextSteps(profile, 1).length, 1);
  assert.equal(getNextSteps(profile, 0).length, 1);
  assert.equal(getNextSteps(profile, 10).length, 10);
  assert.ok(getNextSteps(profile, 100).length <= 14 + 8);
});

test('getNextSteps is pure: the profile is not touched and the answer is JSON', () => {
  const profile = deepFreeze(makeProfile({ coins: 500, buildings: { fuel: 1 } }));
  const steps = getNextSteps(profile, 6);
  assert.deepEqual(JSON.parse(JSON.stringify(steps)), steps);
  assert.deepEqual(getNextSteps(profile, 6), steps, 'deterministic');
});

test('every step has the documented fields', () => {
  for (const profile of [makeProfile(), makeProfile({ coins: 300 }), everythingOfTheEra(makeProfile(), 20, 0)]) {
    for (const step of getNextSteps(profile, 8)) {
      assert.ok(['buy-part', 'buy-building', 'era', 'fly', 'wait'].includes(step.kind));
      assert.ok(step.id !== undefined);
      assert.equal(typeof step.cost, 'number');
      assert.equal(typeof step.affordable, 'boolean');
      assert.ok(Array.isArray(step.reasons));
      assert.ok(typeof step.text === 'string' && step.text.length > 0 && step.text.length <= 60, step.text);
      if (!step.affordable && step.kind.startsWith('buy-')) assert.ok(step.reasons.length > 0, 'a waiting purchase says why');
    }
  }
});

test('kmText writes kilometres the Russian way', () => {
  assert.equal(kmText(3000), '3 км');
  assert.equal(kmText(1200), '1,2 км');
  assert.equal(kmText(0), '0 км');
  assert.equal(kmText(100000), '100 км');
});
