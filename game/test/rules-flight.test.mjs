// FlightConfig, rocket stats, destinations and the settlement of a flight.

import test from 'node:test';
import assert from 'node:assert/strict';
import { ACHIEVEMENTS, BUILDINGS, CONTRACT_TEMPLATES } from '../src/data/index.js';
import {
  availableDestinations, deriveRocket, listContracts, makeFlightConfig, resolveConsumables, settleFlight,
} from '../src/rules/index.js';
import { normalizeConfig } from '../src/sim/config.js';
import { crashedResult, deepFreeze, landedResult, makeProfile } from './rules-helpers.mjs';

const everything = (level) => Object.fromEntries(Object.keys(BUILDINGS).map((k) => [k, level]));

test('makeFlightConfig follows ARCHITECTURE 6.1 and survives the simulation normaliser', () => {
  const profile = deepFreeze(makeProfile());
  const config = makeFlightConfig(profile, { destination: 'earth', seed: 42 });
  for (const key of ['seed', 'era', 'destination', 'skin', 'stages', 'hull', 'legs', 'fins', 'parachute', 'avionics', 'base', 'consumables', 'transferCost']) {
    assert.ok(key in config, `config.${key}`);
  }
  assert.equal(config.seed, 42);
  assert.equal(config.destination, 'earth');
  assert.deepEqual(config.stages.map((s) => s.id), ['core', 'capsule'], 'the stock rocket has no booster');
  for (const stage of config.stages) assert.deepEqual(Object.keys(stage).sort(), ['burnRate', 'fuel', 'id', 'mass', 'thrust', 'turn']);
  assert.deepEqual(Object.keys(config.hull).sort(), ['debrisResist', 'hp']);
  assert.deepEqual(Object.keys(config.legs).sort(), ['angTol', 'hTol', 'vTol']);
  assert.deepEqual(Object.keys(config.fins).sort(), ['dragCut', 'turn']);
  assert.deepEqual(config.parachute, { level: 0 });
  assert.deepEqual(config.avionics, { predict: 0, assist: 0 });
  assert.deepEqual(Object.keys(config.transferCost).sort(), ['mars', 'moon']);
  assert.doesNotThrow(() => JSON.stringify(config));
  const normalised = normalizeConfig(config);
  assert.deepEqual(normalised.stages.map(({ id, thrust, fuel, burnRate, mass, turn }) => ({ id, thrust, fuel, burnRate, mass, turn })), config.stages);
  assert.deepEqual(normalised.legs, config.legs);
  assert.deepEqual(normalised.base, config.base);
  assert.deepEqual(normalised.limits, config.limits);
});

test('the stock rocket matches the reference stages of the simulation', () => {
  const stages = makeFlightConfig(makeProfile()).stages;
  assert.deepEqual(stages[0], { id: 'core', thrust: 72, fuel: 175, burnRate: 9, mass: 1, turn: 1.1 });
  assert.deepEqual(stages[1], { id: 'capsule', thrust: 61, fuel: 45, burnRate: 3.15, mass: 0.35, turn: 1.4 });
});

test('stages come in separation order, booster first', () => {
  const profile = makeProfile({ era: 1, parts: { booster: 2, engine: 3 }, buildings: { gantry: 2, service: 2, factory: 1, energy: 1 } });
  const config = makeFlightConfig(profile);
  assert.deepEqual(config.stages.map((s) => s.id), ['booster', 'core', 'capsule']);
  const plain = makeFlightConfig({ ...profile, buildings: { ...profile.buildings, gantry: 1 } });
  assert.ok(config.stages[0].thrust > plain.stages[0].thrust, 'a higher tower gives the booster more power');
  assert.ok(config.stages[0].thrust > config.stages[1].thrust, 'the booster is stronger than the core');
});

test('modules and the base feed the config', () => {
  const profile = makeProfile({
    era: 2,
    parts: { engine: 6, tank: 6, hull: 3, legs: 3, fins: 3, parachute: 3, capsule: 3, avionics: 4 },
    buildings: { ...everything(3), observation: 0, recovery: 0, energy: 5 },
  });
  const config = makeFlightConfig(profile);
  const stock = makeFlightConfig(makeProfile());
  const core = config.stages.find((s) => s.id === 'core');
  assert.ok(core.thrust > 72 && core.fuel > 175 && core.burnRate < 9);
  assert.ok(config.hull.hp > 100 && config.legs.vTol > 13 && config.fins.turn > 1);
  assert.equal(config.parachute.level, 3);
  assert.deepEqual(config.avionics, { predict: 1, assist: 0 });
  assert.ok(config.base.radar > 0 && config.base.beacons > 0 && config.base.weather > 0 && config.base.income > 1);
  assert.ok(config.base.rescueRefund > 0 && config.base.padSafety > 0 && config.base.repairOnLand > 0);
  assert.ok(config.transferCost.moon < stock.transferCost.moon, 'avionics save fuel on the transfer');
  assert.ok(config.limits.speed > stock.limits.speed && config.limits.fall > stock.limits.fall);
  assert.equal(config.era, 2);
});

test('deriveRocket gives flat numbers for the was -> becomes bars', () => {
  const before = deriveRocket(makeProfile({ buildings: { fuel: 1 } })).summary;
  const after = deriveRocket(makeProfile({ buildings: { fuel: 1 }, parts: { tank: 1 } })).summary;
  assert.ok(after.fuel > before.fuel);
  assert.equal(after.thrust, before.thrust);
  assert.ok(after.totalFuel > before.totalFuel);
});

test('destinations: Moon and Mars stay closed with reasons until the base is ready', () => {
  const closed = availableDestinations(makeProfile());
  assert.deepEqual(closed.map((d) => [d.id, d.ok]), [['earth', true], ['moon', false], ['mars', false]]);
  assert.ok(closed[1].reasons.some((r) => r.text === 'Нужна капсула ур. 10'));
  assert.ok(closed[1].reasons.some((r) => r.text === 'Нужен центр управления ур. 3'));
  assert.throws(() => makeFlightConfig(makeProfile(), { destination: 'moon' }), /closed/);
  assert.throws(() => makeFlightConfig(makeProfile(), { destination: 'venus' }), /Unknown/);

  const ready = makeProfile({ era: 3, buildings: { ...everything(4), energy: 6 }, parts: { capsule: 10 } });
  assert.equal(availableDestinations(ready).find((d) => d.id === 'moon').ok, true);
  assert.equal(availableDestinations(ready).find((d) => d.id === 'mars').ok, false);
  assert.equal(makeFlightConfig(ready, { destination: 'moon' }).destination, 'moon');
  const mars = makeProfile({ era: 4, buildings: { ...everything(5), energy: 6 }, parts: { capsule: 13 } });
  assert.equal(availableDestinations(mars).find((d) => d.id === 'mars').ok, true);
});

test('consumables: stock is needed, free ones come from the base', () => {
  const profile = makeProfile({ inventory: { chute: 1, magnet: 0 } });
  const picked = resolveConsumables(profile, { chute: true, magnet: true, repair: true });
  assert.deepEqual(picked.active, { chute: 1, repair: 0, canister: 0, magnet: 0 });
  assert.deepEqual(picked.paid, { chute: 1, repair: 0, canister: 0, magnet: 0 });
  const rich = makeProfile({ era: 5, buildings: { ...everything(6) } });
  const free = resolveConsumables(rich, {});
  assert.equal(free.active.chute, 1);
  assert.equal(free.active.canister, 1);
  assert.deepEqual(free.paid, { chute: 0, repair: 0, canister: 0, magnet: 0 });
  assert.equal(makeFlightConfig(profile, { consumables: { chute: true } }).consumables.chute, 1);
});

test('settleFlight: a soft landing pays, counts and opens milestones', () => {
  const profile = deepFreeze(makeProfile({ buildings: { beacons: 1 } }));
  const { profile: after, report } = settleFlight(profile, landedResult({ maxAlt: 320, distance: 700, perfect: true, rings: 1, pickups: 3, near: 1 }));
  assert.equal(report.outcome, 'landed');
  assert.ok(report.coins.travel > 0 && report.coins.loot === 12 && report.coins.landing > 0 && report.coins.perfect > 0);
  assert.equal(report.coins.gross, report.coins.travel + report.coins.loot + report.coins.landing + report.coins.perfect + report.coins.expedition + report.coins.storm);
  assert.equal(after.stats.flights, 1);
  assert.equal(after.stats.landings, 1);
  assert.equal(after.stats.perfect, 1);
  assert.equal(after.stats.streak, 1);
  assert.equal(after.stats.rings, 1);
  assert.equal(after.milestones.softLandings, 1);
  assert.equal(after.milestones.maxAlt, 3200, 'profile altitudes are meters');
  assert.equal(after.stats.distance, 7000);
  assert.ok(report.data.total >= 1 && after.data === report.data.total);
  assert.ok(report.newZones.some((z) => z.id === 'clouds'));
  assert.ok(report.milestones.firstSoftLanding && report.milestones.newMaxAlt);
  assert.ok(after.stats.earned >= report.coins.gross);
  assert.equal(profile.stats.flights, 0, 'the input is untouched');
});

test('settleFlight: perfect landings and beacons raise the bonus', () => {
  const plain = settleFlight(makeProfile(), landedResult({ perfect: true })).report.coins.perfect;
  const beacons = settleFlight(makeProfile({ buildings: { beacons: 1 } }), landedResult({ perfect: true })).report.coins.perfect;
  assert.ok(beacons > plain);
  assert.equal(settleFlight(makeProfile(), landedResult({ perfect: false })).report.coins.perfect, 0);
});

test('settleFlight: a crash pays less, costs a loss and resets the streak', () => {
  const profile = makeProfile({ coins: 5000, stats: { streak: 4, bestStreak: 4 }, parts: { tank: 6, engine: 6 }, era: 1 });
  const { profile: after, report } = settleFlight(profile, crashedResult({ maxAlt: 200 }));
  assert.equal(report.outcome, 'crashed');
  assert.ok(report.coins.charged > 0, 'a loss is charged');
  assert.equal(report.coins.landing, 0);
  assert.equal(after.stats.crashes, 1);
  assert.equal(after.stats.streak, 0);
  assert.equal(after.stats.bestStreak, 4);
  assert.equal(after.milestones.softLandings, 0);
  assert.equal(after.coins, profile.coins + report.coins.gross - report.coins.charged + report.awarded.achievements.reduce((s, a) => s + a.reward, 0) + report.awarded.contracts.reduce((s, c) => s + c.reward, 0));
  assert.match(report.hint.text, /Слишком быстро/);
  assert.equal(report.hint.part, 'legs');
  const landed = settleFlight(profile, landedResult({ maxAlt: 200 })).report;
  assert.ok(report.coins.travel < landed.coins.travel);
});

test('settleFlight: a crash never pushes the purse below zero', () => {
  const heavy = makeProfile({ coins: 0, era: 5, parts: { engine: 18, tank: 18, hull: 18, booster: 18, capsule: 18, legs: 18, fins: 18, parachute: 18, avionics: 18 } });
  for (const coins of [0, 1, 7, 100]) {
    const { profile: after, report } = settleFlight({ ...heavy, coins }, crashedResult({ maxAlt: 0, distance: 0, coinsPicked: 0 }));
    assert.ok(after.coins >= 0, `coins ${coins} -> ${after.coins}`);
    assert.ok(report.coins.charged <= coins + report.coins.gross);
  }
});

test('settleFlight: the rescue station and the recovery system soften the loss', () => {
  const parts = { tank: 6, engine: 6, capsule: 6 };
  const plain = makeProfile({ coins: 9000, era: 2, parts });
  const rescue = { ...plain, buildings: { ...plain.buildings, rescue: 3 } };
  const lossPlain = settleFlight(plain, crashedResult()).report.coins.charged;
  const lossRescue = settleFlight(rescue, crashedResult()).report.coins.charged;
  assert.ok(lossRescue < lossPlain);
  const far = makeProfile({ coins: 90000, era: 3, parts, buildings: { rescue: 1, recovery: 3 } });
  const nearLoss = settleFlight(far, crashedResult({ destination: 'earth' })).report.coins.charged;
  const moonLoss = settleFlight(far, crashedResult({ destination: 'moon', maxAlt: 10000 })).report.coins.charged;
  assert.ok(moonLoss < nearLoss, 'the recovery system salvages crashes far from home');
});

test('settleFlight: landing on the Moon and Mars sets milestones and pays an expedition', () => {
  const profile = makeProfile({ era: 3, coins: 0, buildings: { recovery: 1 } });
  const first = settleFlight(profile, landedResult({ destination: 'moon', maxAlt: 10050, distance: 9000 }));
  assert.equal(first.profile.milestones.moonLanding, true);
  assert.equal(first.profile.stats.moon, 1);
  assert.ok(first.report.coins.expedition > 0);
  assert.ok(first.report.milestones.firstMoonLanding);
  const again = settleFlight(first.profile, landedResult({ destination: 'moon', maxAlt: 10050, distance: 9000 }));
  assert.ok(first.report.data.body > again.report.data.body, 'the first landing pays the most data');
  const mars = settleFlight({ ...profile, era: 4 }, landedResult({ destination: 'mars', maxAlt: 10050 }));
  assert.equal(mars.profile.milestones.marsLanding, true);
  assert.equal(mars.profile.milestones.moonLanding, false);
  assert.ok(mars.report.coins.expedition > first.report.coins.expedition);
  assert.ok(mars.profile.achievements.includes('cargo1'));
});

test('settleFlight: an abandoned flight pays only the pickups and spares the streak', () => {
  const profile = makeProfile({ stats: { streak: 3, bestStreak: 3 } });
  const { profile: after, report } = settleFlight(profile, { ...landedResult({ coinsPicked: 9 }), outcome: 'abandoned' });
  assert.equal(report.coins.travel, 0);
  assert.equal(report.coins.gross, 9);
  assert.equal(after.stats.streak, 3);
  assert.equal(after.stats.crashes, 0);
  assert.equal(after.stats.landings, 0);
});

test('settleFlight: new altitude zones pay data once', () => {
  const profile = makeProfile();
  const first = settleFlight(profile, landedResult({ maxAlt: 1300 })); // 13 km
  const second = settleFlight(first.profile, landedResult({ maxAlt: 1300 }));
  assert.ok(first.report.data.zones > 0);
  assert.equal(second.report.data.zones, 0);
  assert.deepEqual(first.report.newZones.map((z) => z.id), ['treetops', 'clouds', 'stratosphere']);
});

test('settleFlight: contracts pay once and a new one takes the slot', () => {
  const profile = makeProfile();
  profile.contracts.active = ['m01', 'm02', 'm03'];
  const { profile: after, report } = settleFlight(profile, landedResult({ maxAlt: 90, distance: 150 }));
  const ids = report.awarded.contracts.map((c) => c.id).sort();
  assert.deepEqual(ids, ['m01', 'm02']);
  assert.deepEqual(after.contracts.done.sort(), ['m01', 'm02']);
  assert.equal(after.contracts.active.length, 3);
  assert.ok(after.contracts.active.includes('m03'));
  assert.ok(!after.contracts.active.includes('m01'));
  const rewards = report.awarded.contracts.reduce((s, c) => s + c.reward, 0);
  assert.ok(rewards > 0);
  const repeat = settleFlight(after, landedResult({ maxAlt: 90 }));
  assert.ok(!repeat.report.awarded.contracts.some((c) => ids.includes(c.id)));
});

test('settleFlight: achievements are one-time', () => {
  const first = settleFlight(makeProfile(), landedResult());
  const got = first.report.awarded.achievements.map((a) => a.id);
  assert.ok(got.includes('first') && got.includes('land1'));
  const second = settleFlight(first.profile, landedResult());
  assert.ok(!second.report.awarded.achievements.some((a) => got.includes(a.id)));
  assert.equal(new Set(second.profile.achievements).size, second.profile.achievements.length);
});

test('settleFlight: consumables of the flight leave the stock', () => {
  const profile = makeProfile({ inventory: { chute: 2, magnet: 1 } });
  const config = makeFlightConfig(profile, { consumables: { chute: true, magnet: true } });
  const { profile: after, report } = settleFlight(profile, landedResult(), config);
  assert.equal(after.inventory.chute, 1);
  assert.equal(after.inventory.magnet, 0);
  assert.deepEqual(report.consumablesSpent, { chute: 1, magnet: 1 });
  const free = makeProfile({ era: 5, inventory: { chute: 2 }, buildings: { ...everything(6) } });
  const freeConfig = makeFlightConfig(free, { consumables: { chute: true } });
  assert.equal(settleFlight(free, landedResult(), freeConfig).profile.inventory.chute, 2, 'a free parachute does not use the stock');
});

test('settleFlight: nonsense results do not break the profile', () => {
  const { profile } = settleFlight(makeProfile(), { outcome: 'weird', maxAlt: -5, distance: NaN, coinsPicked: Infinity });
  assert.ok(Number.isFinite(profile.coins) && profile.coins >= 0);
  assert.equal(profile.stats.flights, 1);
});

test('listContracts: opened by era and by the base, slots grow with logistics', () => {
  const start = listContracts(makeProfile());
  assert.equal(start.length, 3);
  assert.ok(start.every((c) => c.reward >= 15 && c.name && c.desc));
  const allIds = new Set();
  let profile = makeProfile();
  for (let i = 0; i < 40; i++) {
    for (const c of listContracts(profile)) allIds.add(c.id);
    profile = { ...profile, contracts: { ...profile.contracts, seed: profile.contracts.seed + 1, active: [] } };
  }
  assert.ok(![...allIds].some((id) => ['m07', 'm15', 'm21', 'm22', 'm29'].includes(id)), 'no Moon, Mars or far-sky contracts at the start');
  const moonOpen = makeProfile({ era: 3, buildings: { ...everything(4), energy: 6 }, parts: { capsule: 10 } });
  const offered = new Set();
  for (let i = 0; i < 60; i++) {
    for (const c of listContracts({ ...moonOpen, contracts: { ...moonOpen.contracts, seed: i + 1, active: [] } })) offered.add(c.id);
  }
  assert.ok(offered.has('m07') || offered.has('m21'), 'Moon contracts appear once the Moon is open');
  const logistics = makeProfile({ era: 1, buildings: { fuel: 1, logistics: 1 } });
  assert.equal(listContracts(logistics).length, 4);
  assert.equal(listContracts({ ...logistics, era: 2, buildings: { ...logistics.buildings, logistics: 6, energy: 6, fuel: 6 } }).length, 5);
  assert.deepEqual(listContracts(makeProfile()).map((c) => c.id), listContracts(makeProfile()).map((c) => c.id), 'the pick is deterministic');
});

test('contracts about the era complete when the era changes', () => {
  const profile = makeProfile({ era: 0 });
  profile.contracts.active = ['m10', 'm01', 'm02'];
  assert.ok(CONTRACT_TEMPLATES.find((t) => t.id === 'm10').goal.type === 'era');
  // Reaching era 1 by hand and settling any flight pays m10 together with the flight contracts.
  const { report } = settleFlight({ ...profile, era: 1 }, landedResult({ maxAlt: 90 }));
  assert.ok(report.awarded.contracts.some((c) => c.id === 'm10'));
  assert.ok(ACHIEVEMENTS.some((a) => a.id === 'base1'));
});

test('cargo contracts get the logistics bonus', () => {
  const profile = makeProfile({ era: 3, buildings: { ...everything(4), energy: 6 }, parts: { capsule: 10 } });
  profile.contracts.active = ['m07', 'm01', 'm02'];
  const base = listContracts(profile).find((c) => c.id === 'm07');
  const boosted = listContracts({ ...profile, buildings: { ...profile.buildings, logistics: 6 } }).find((c) => c.id === 'm07');
  assert.ok(boosted.reward > base.reward);
});
