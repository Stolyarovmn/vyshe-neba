// Buying modules and buildings, locked reasons, energy balance and era transitions.

import test from 'node:test';
import assert from 'node:assert/strict';
import { BUILDINGS, ERAS, PARTS } from '../src/data/index.js';
import {
  advanceEra, buyBuilding, buyPart, deriveBase, getBuildingState, getEraState, getPartState, powerBalance,
} from '../src/rules/index.js';
import { deepFreeze, makeProfile } from './rules-helpers.mjs';

test('getPartState explains every lock with a Russian text', () => {
  const state = getPartState(makeProfile(), 'engine');
  assert.equal(state.level, 0);
  assert.equal(state.max, 18);
  assert.equal(state.canBuy, false);
  const kinds = state.locked.map((l) => l.kind);
  assert.ok(kinds.includes('building') && kinds.includes('coins'));
  const texts = state.locked.map((l) => l.text);
  assert.ok(texts.includes('Нужна сервисная команда ур. 1'));
  assert.ok(texts.includes('Нужен производственный цех ур. 1'));
  assert.ok(texts.some((t) => /^Нужно ещё \d+ монет[аы]?$/.test(t)));
  assert.ok(state.next.cost > 0 && state.next.stats.thrust > state.current.thrust);
});

test('buyPart: not enough coins', () => {
  const profile = deepFreeze(makeProfile({ coins: 10, buildings: { fuel: 1 } }));
  const result = buyPart(profile, 'tank');
  assert.equal(result.ok, false);
  assert.ok(result.reasons.some((r) => r.kind === 'coins'));
  assert.equal(result.profile, profile, 'a failed purchase returns the same profile');
});

test('buyPart: success is immutable and charges the discounted price', () => {
  const profile = deepFreeze(makeProfile({ coins: 500, buildings: { fuel: 1 } }));
  const cost = getPartState(profile, 'tank').next.cost;
  const result = buyPart(profile, 'tank');
  assert.equal(result.ok, true);
  assert.notEqual(result.profile, profile);
  assert.equal(result.profile.parts.tank, 1);
  assert.equal(profile.parts.tank, 0);
  assert.ok(result.profile.coins >= 500 - cost, 'achievement rewards may add coins, never remove them');
  assert.equal(result.profile.coins - result.awarded.achievements.reduce((s, a) => s + a.reward, 0) - result.awarded.contracts.reduce((s, c) => s + c.reward, 0), 500 - cost);
  assert.ok(result.awarded.achievements.some((a) => a.id === 'up1'), 'the first upgrade is an achievement');
});

test('buyPart: the era caps the level', () => {
  const profile = makeProfile({ coins: 1e6, data: 1e6, buildings: { fuel: 3 }, parts: { tank: 3 } });
  const state = getPartState(profile, 'tank');
  assert.equal(state.cap, 3);
  assert.equal(state.canBuy, false);
  assert.ok(state.locked.some((l) => l.kind === 'era' && l.era === 1 && l.text === 'Нужна эпоха 1986'));
  assert.equal(buyPart(profile, 'tank').ok, false);
  const next = { ...profile, era: 1 };
  assert.equal(buyPart(next, 'tank').ok, true);
});

test('buyPart: the base must reach the level of the module (DESIGN 4.3)', () => {
  const profile = makeProfile({ coins: 1e6, data: 1e6, era: 1, buildings: { service: 1, factory: 1 }, parts: { engine: 3 } });
  const result = buyPart(profile, 'engine'); // level 4 needs service 2
  assert.equal(result.ok, false);
  assert.deepEqual(result.reasons.map((r) => r.text), ['Нужна сервисная команда ур. 2']);
  const upgraded = { ...profile, buildings: { ...profile.buildings, service: 2 } };
  assert.equal(buyPart(upgraded, 'engine').ok, true);
});

test('buyPart: expensive levels need data', () => {
  const profile = makeProfile({ coins: 1e6, data: 0, era: 3, buildings: { fuel: 4 }, parts: { tank: 9 } });
  const result = buyPart(profile, 'tank');
  assert.equal(result.ok, false);
  assert.ok(result.reasons.some((r) => r.kind === 'data'));
  assert.equal(buyPart({ ...profile, data: 1000 }, 'tank').ok, true);
});

test('buyPart: a maxed module has no next level', () => {
  const profile = makeProfile({ coins: 1e9, data: 1e9, era: 5, parts: { avionics: 18 } });
  const state = getPartState(profile, 'avionics');
  assert.equal(state.maxed, true);
  assert.equal(state.next, null);
  assert.equal(buyPart(profile, 'avionics').ok, false);
  assert.throws(() => getPartState(profile, 'parachute'), /Unknown part/);
});

test('buyBuilding: energy node and dependencies (level N needs energy N-1)', () => {
  const profile = makeProfile({ coins: 1e6, era: 1, buildings: { beacons: 1 } });
  const state = getBuildingState(profile, 'beacons');
  assert.equal(state.canBuy, false);
  assert.ok(state.locked.some((l) => l.building === 'energy' && l.level === 1 && l.text === 'Нужен энергетический узел ур. 1'));
  const withEnergy = { ...profile, buildings: { ...profile.buildings, energy: 1 } };
  assert.equal(buyBuilding(withEnergy, 'beacons').ok, true);
});

test('buyBuilding: all fourteen buildings can be built at level 1 in the first era; the second level waits', () => {
  const profile = makeProfile({ coins: 1e6, era: 0 });
  for (const key of Object.keys(BUILDINGS)) {
    assert.equal(getBuildingState(profile, key).canBuy, true, `${key} level 1`);
  }
  const built = makeProfile({ coins: 1e6, era: 0, buildings: Object.fromEntries(Object.keys(BUILDINGS).map((k) => [k, 1])) });
  const state = getBuildingState(built, 'factory');
  assert.ok(state.locked.some((l) => l.kind === 'era' && l.text === 'Нужна эпоха 1986'), 'level 2 needs the next era');
  assert.equal(getBuildingState(built, 'recovery').locked.find((l) => l.kind === 'era').era, 1);
});

test('buyBuilding: immutability and power in the answer', () => {
  const profile = deepFreeze(makeProfile({ coins: 1000 }));
  const result = buyBuilding(profile, 'fuel');
  assert.equal(result.ok, true);
  assert.equal(result.profile.buildings.fuel, 1);
  assert.equal(profile.buildings.fuel, 0);
  assert.equal(result.power.ratio, 1);
});

test('discounts: era, factory and service lower the module price', () => {
  const plain = makeProfile({ buildings: { fuel: 1 } });
  const base = getPartState(plain, 'tank').next.cost;
  const era1 = getPartState({ ...plain, era: 1 }, 'tank').next.cost;
  assert.ok(era1 < base);
  const withFactory = getPartState({ ...plain, buildings: { ...plain.buildings, factory: 1, energy: 1 } }, 'tank').next.cost;
  assert.ok(withFactory < base);
  const engineBase = PARTS.engine.levels[0].cost;
  const engineDiscounted = getPartState({ ...plain, buildings: { ...plain.buildings, service: 1, factory: 1, energy: 1 } }, 'engine').next.cost;
  assert.ok(engineDiscounted < engineBase);
});

test('powerBalance: the table generator carries the first buildings', () => {
  const profile = makeProfile({ buildings: { beacons: 1, gantry: 1, deluge: 1, service: 1, rescue: 1, fuel: 1 } });
  const balance = powerBalance(profile);
  assert.equal(balance.ratio, 1);
  assert.ok(balance.supply >= balance.demand);
});

test('powerBalance: a deficit weakens every continuous effect proportionally', () => {
  const heavy = { factory: 6, control: 6, radar: 6, weather: 6, service: 6 };
  const starved = makeProfile({ era: 5, buildings: heavy });
  const powered = makeProfile({ era: 5, buildings: { ...heavy, energy: 6 } });
  const deficit = powerBalance(starved);
  assert.ok(deficit.ratio < 0.5, `ratio ${deficit.ratio}`);
  assert.equal(powerBalance(powered).ratio, 1);
  const low = deriveBase(starved).effects;
  const full = deriveBase(powered).effects;
  assert.ok(low.partDiscount < full.partDiscount);
  assert.ok(Math.abs(low.partDiscount - full.partDiscount * deficit.ratio) < 0.002);
  assert.ok(low.radar01 < full.radar01);
  assert.ok(deriveBase(starved).flight.radar < deriveBase(powered).flight.radar);
});

test('powerBalance: discrete effects switch off below half power', () => {
  const starved = makeProfile({ era: 5, buildings: { rescue: 6, factory: 6, control: 6, radar: 6, fuel: 6 } });
  const powered = makeProfile({ era: 5, buildings: { rescue: 6, factory: 6, control: 6, radar: 6, fuel: 6, energy: 6 } });
  assert.equal(deriveBase(starved).effects.freeChute, 0);
  assert.equal(deriveBase(powered).effects.freeChute, 1);
  assert.equal(deriveBase(powered).effects.freeCanister, 1);
});

test('deriveBase: FlightConfig.base has exactly the fields of ARCHITECTURE 6.1', () => {
  const { flight } = deriveBase(makeProfile());
  assert.deepEqual(Object.keys(flight).sort(), ['beacons', 'dataMult', 'fuelDropRate', 'income', 'padSafety', 'perfectBonus', 'radar', 'rescueRefund', 'repairOnLand', 'weather'].sort());
  assert.deepEqual(flight, { radar: 0, beacons: 0, weather: 0, income: 1, fuelDropRate: 1, repairOnLand: 0, rescueRefund: 0, padSafety: 0, dataMult: 1, perfectBonus: 1 });
});

function readyForEraZero(patch = {}) {
  return makeProfile({
    coins: ERAS[0].advance.coins,
    data: ERAS[0].advance.data,
    buildings: { fuel: 1, beacons: 1, gantry: 1, deluge: 1, service: 1, rescue: 1, logistics: 1, factory: 1 },
    milestones: { maxAlt: 3000, softLandings: 1 },
    ...patch,
  });
}

test('getEraState lists the four conditions of the transition', () => {
  const state = getEraState(makeProfile());
  assert.deepEqual(state.conditions.map((c) => c.kind), ['coins', 'data', 'milestone', 'buildings']);
  assert.equal(state.ok, false);
  assert.equal(state.reasons.length, 4);
  assert.equal(state.next.year, 1986);
  const ready = getEraState(readyForEraZero());
  assert.equal(ready.ok, true);
  assert.deepEqual(ready.reasons, []);
});

test('advanceEra: success spends the project and opens the next era', () => {
  const profile = deepFreeze(readyForEraZero({ coins: ERAS[0].advance.coins + 50, data: ERAS[0].advance.data + 3 }));
  const result = advanceEra(profile);
  assert.equal(result.ok, true);
  assert.equal(result.profile.era, 1);
  assert.equal(profile.era, 0);
  assert.ok(result.profile.coins >= 50 && result.profile.coins < 50 + 1000, 'the project price was paid');
  assert.equal(result.profile.data, 3);
  assert.ok(result.awarded.achievements.some((a) => a.id === 'base1'));
});

test('advanceEra: every condition blocks it', () => {
  const cases = {
    coins: readyForEraZero({ coins: 10 }),
    data: readyForEraZero({ data: 0 }),
    'milestone altitude': readyForEraZero({ milestones: { maxAlt: 2999, softLandings: 1 } }),
    'milestone landing': readyForEraZero({ milestones: { maxAlt: 3000, softLandings: 0 } }),
    buildings: readyForEraZero({ buildings: { fuel: 1, beacons: 0 } }),
  };
  for (const [name, profile] of Object.entries(cases)) {
    const result = advanceEra(profile);
    assert.equal(result.ok, false, name);
    assert.ok(result.reasons.length >= 1, name);
    assert.equal(result.profile, profile);
  }
});

test('advanceEra: later eras ask for their own milestone and building level', () => {
  const need = ERAS[1].advance;
  const base = makeProfile({ era: 1, coins: need.coins, data: need.data, milestones: { maxAlt: 30000, softLandings: 1 }, buildings: { fuel: 2, beacons: 2, service: 2, energy: 2, gantry: 2, deluge: 2, rescue: 2, logistics: 2 } });
  assert.equal(advanceEra(base).ok, true);
  assert.equal(advanceEra({ ...base, buildings: { ...base.buildings, energy: 1 } }).ok, false, 'eight buildings of level 2 are required');
  const moon = makeProfile({ era: 3, coins: 1e9, data: 1e9, buildings: Object.fromEntries(Object.keys(BUILDINGS).map((k) => [k, 4])) });
  assert.equal(advanceEra(moon).ok, false, 'needs a Moon landing');
  assert.equal(advanceEra({ ...moon, milestones: { ...moon.milestones, moonLanding: true } }).ok, true);
});

test('advanceEra: the last era cannot be left', () => {
  const profile = makeProfile({ era: 5, coins: 1e9, data: 1e9 });
  assert.equal(getEraState(profile).final, true);
  assert.equal(advanceEra(profile).ok, false);
});
