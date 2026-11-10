// Диагностика: как часто автопилот садится на Луну/Марс с профилем нужной эпохи (для настройки баланса).
// Использование: node game/tools/probe-landing.mjs [moon|mars] [skill] [runs]
import { fresh } from '../src/state/index.js';
import { makeFlightConfig } from '../src/rules/index.js';
import { runFlight } from '../src/sim/index.js';

const dest = process.argv[2] || 'moon';
const skill = Number(process.argv[3] ?? 1);
const runs = Number(process.argv[4] ?? 20);

function profileFor(destination) {
  const p = fresh();
  const moon = destination === 'moon';
  p.era = moon ? 3 : 4;
  const lvl = moon ? 10 : 13;
  for (const k of Object.keys(p.parts)) p.parts[k] = lvl;
  for (const k of Object.keys(p.buildings)) p.buildings[k] = moon ? 4 : 5;
  p.milestones.moonLanding = !moon;
  return p;
}

const profile = profileFor(dest);
const tally = {};
let landed = 0;
for (let i = 0; i < runs; i++) {
  const config = makeFlightConfig(profile, { destination: dest, consumables: {}, seed: i + 1 });
  const { result } = runFlight(config, { skill, mission: 'space', seed: i + 1, maxTime: 900 });
  const key = result.outcome === 'landed' ? (result.perfect ? 'landed-perfect' : 'landed') : `${result.outcome}:${result.reason}`;
  tally[key] = (tally[key] || 0) + 1;
  if (result.outcome === 'landed') landed++;
}
console.log(`${dest} skill=${skill}: ${landed}/${runs} landed`, tally);
