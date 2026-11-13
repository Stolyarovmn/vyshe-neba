// Повторяемые замеры прохода 2, отчёт JSON: node game/tools/balance-probe.mjs.
import { pathToFileURL } from 'node:url';
import { ERAS, PART_IDS, BUILDINGS, BUILDING_KEYS, SPACE_ALT } from '../src/data/index.js';
import { fresh } from '../src/state/index.js';
import { makeFlightConfig, settleFlight } from '../src/rules/index.js';
import { runFlight } from '../src/sim/run.js';
import { planChain } from './economy-bot.mjs';

export function cappedProfile(era) {
  const profile = structuredClone(fresh());
  profile.era = era;
  for (const id of PART_IDS) profile.parts[id] = ERAS[era].cap.part;
  for (const id of BUILDING_KEYS) profile.buildings[id] = Math.min(BUILDINGS[id].levels.length, ERAS[era].cap.building + (BUILDINGS[id].lead ?? 0));
  return profile;
}

export function firstFlight({ perfect = false, seed = 7 } = {}) {
  const profile = fresh();
  const config = makeFlightConfig(profile, { seed });
  const { result } = runFlight(config, { skill: 0.85, mission: 'hop', targetAlt: 100, seed, maxTime: 420 });
  // Одинаковый реальный маршрут: меняется только качество касания, чтобы сравнить награды.
  const settled = settleFlight(profile, { ...result, perfect }, config);
  const { coins, awarded } = settled.report;
  const achievements = awarded.achievements.reduce((sum, a) => sum + a.reward, 0);
  const contracts = awarded.contracts.reduce((sum, c) => sum + c.reward, 0);
  return { outcome: result.outcome, altitudeM: Math.round(result.maxAlt * 10),
    total: settled.profile.coins, flight: coins.gross, achievements, contracts, coins };
}

export function ceilingFlight(era, { seed = 7, skill = 1, targetAlt = SPACE_ALT * 1.2 } = {}) {
  const config = makeFlightConfig(cappedProfile(era), { seed });
  const { result } = runFlight(config, { skill, mission: targetAlt < SPACE_ALT ? 'hop' : 'space', targetAlt, seed, maxTime: 420 });
  return { era, seed, skill, targetM: targetAlt * 10, altitudeM: Math.round(result.maxAlt * 10),
    outcome: result.outcome, reason: result.reason, time: result.time };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const report = { firstFlight: { normal: firstFlight(), perfect: firstFlight({ perfect: true }) },
    moduleEntry: Object.fromEntries(PART_IDS.map((id) => [id, planChain(fresh(), 'part', id, 1).cost])),
    ceilings: [0, 1, 2].flatMap((era) => [7, 1, 3].map((seed) => ceilingFlight(era, { seed }))) };
  console.log(JSON.stringify(report, null, 2));
}
