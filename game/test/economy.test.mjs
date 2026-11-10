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

test('bot: the default run fits every era window and the 10-14 hour campaign', async () => {
  const run = await runBot({ seed: 1 });
  const verdict = evaluate(run);
  assert.equal(run.reachedFinalEra, true, 'E5 is reached');
  for (const row of verdict.rows) {
    assert.ok(row.ok, `E${row.era}->E${row.era + 1}: ${row.actual?.minutes.toFixed(1)} min, window ${row.min}-${row.max}`);
  }
  assert.ok(verdict.totalOk, `campaign ${run.minutes.toFixed(0)} min, window ${CAMPAIGN.min}-${CAMPAIGN.max}`);
});

test('bot: the first era takes 25-35 minutes on average (DESIGN 4.7)', async () => {
  const seeds = [1, 2, 3, 4, 5, 6];
  let total = 0;
  for (const seed of seeds) total += (await runBot({ seed, untilEra: 0 })).eras[0].minutes;
  const mean = total / seeds.length;
  assert.ok(mean >= TARGETS[0].design.min && mean <= TARGETS[0].design.max, `mean first era ${mean.toFixed(1)} min`);
});

test('bot: luck moves single runs, not the balance', async () => {
  // Every era: the mean over six seeds is within +-15% of the target, no single run is further than +-40%.
  const seeds = [1, 2, 3, 4, 5, 6];
  const runs = [];
  for (const seed of seeds) runs.push(await runBot({ seed }));
  for (const target of TARGETS) {
    const minutes = runs.map((run, i) => {
      assert.equal(run.reachedFinalEra, true, `seed ${seeds[i]}`);
      return run.eras.find((e) => e.era === target.era).minutes;
    });
    const mean = minutes.reduce((a, b) => a + b, 0) / minutes.length;
    assert.ok(Math.abs(mean - target.minutes) / target.minutes <= 0.15, `E${target.era}: mean ${mean.toFixed(1)} min, target ${target.minutes}`);
    minutes.forEach((m, i) => assert.ok(Math.abs(m - target.minutes) / target.minutes <= 0.4, `seed ${seeds[i]}: E${target.era} took ${m.toFixed(1)} min (target ${target.minutes}); ${describe(runs[i])}`));
  }
  for (const run of runs) assert.ok(run.minutes >= CAMPAIGN.min && run.minutes <= CAMPAIGN.max, `campaign ${run.minutes.toFixed(0)} min`);
});

test('bot: the first stabilizers are bought on the second or third flight', async () => {
  const run = await runBot({ seed: 1, untilEra: 0 });
  const firstLevel = run.eras[0].items.findIndex((item) => item.startsWith('P:fins1='));
  assert.ok(firstLevel >= 0, 'fins are among the first purchases of the era');
  assert.ok(run.eras[0].items.slice(0, 3).some((item) => item.startsWith('B:service')), 'the service team opens them first');
  assert.ok(run.firstFinsFlight >= 1 && run.firstFinsFlight <= 3, `fins bought after flight ${run.firstFinsFlight}`);
});

test('bot: a clumsier pilot is slower but still finishes', async () => {
  const careful = await runBot({ seed: 1, skill: 0.9 });
  const clumsy = await runBot({ seed: 1, skill: 0.4 });
  assert.equal(clumsy.reachedFinalEra, true);
  assert.ok(clumsy.minutes >= careful.minutes * 0.9, 'skill does not make the game faster');
  assert.ok(clumsy.minutes <= CAMPAIGN.max * 1.6, `clumsy campaign ${clumsy.minutes.toFixed(0)} min`);
});

test('bot: crashes never wipe the progress', async () => {
  const run = await runBot({ seed: 3, skill: 0.4 });
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

test('the economy bot exits with a non-zero code when a target is missed', () => {
  const ok = spawnSync(process.execPath, ['--no-warnings', botFile, '--seed', '1'], { encoding: 'utf8' });
  assert.equal(ok.status, 0, ok.stdout + ok.stderr);
  assert.match(ok.stdout, /E0->E1/);
  assert.match(ok.stdout, /Campaign:/);
  const stopped = spawnSync(process.execPath, ['--no-warnings', botFile, '--seed', '1', '--max-minutes', '10'], { encoding: 'utf8' });
  assert.equal(stopped.status, 1);
  assert.match(stopped.stdout, /OUT OF RANGE|NOT reached/);
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
  const reach = (parts) => safeReach(makeFlightConfig({ ...base, parts: { ...base.parts, ...parts } }));
  assert.ok(reach({ tank: 3 }) > reach({}));
  assert.ok(reach({ engine: 6 }) > reach({ engine: 2 }));
  const weak = makeFlightConfig({ ...base, parts: { ...base.parts } });
  assert.equal(simulateSortie(weak, 'moon', 10000).ok, false, 'the stock rocket cannot reach the Moon');
  const strong = makeFlightConfig({ ...base, parts: { ...base.parts, engine: 12, tank: 12, capsule: 12, legs: 6 } });
  assert.equal(simulateSortie(strong, 'moon', 10000).ok, true);
});
