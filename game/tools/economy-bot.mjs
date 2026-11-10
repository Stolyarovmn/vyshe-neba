#!/usr/bin/env node
// Бот проходит кампанию по циклу «полёт → итоги → покупки» и измеряет минуты каждой эпохи.
// Код выхода 1 означает выход за временные допуски, даже если E5 достигнута.
//
//   node game/tools/economy-bot.mjs [--seed 1] [--skill 0.8] [--json] [--verbose] [--quick]
//
// По умолчанию вылеты идут через настоящую симуляцию; --quick включает аналитическую оценку.

import { existsSync } from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
import { BUILDING_KEYS, DESTINATIONS, ERAS, OVERHEAD, PART_IDS, SPACE_ALT } from '../src/data/index.js';
import * as R from '../src/rules/index.js';
import { fresh } from '../src/state/index.js';
import { mulberry32 } from '../src/sim/rng.js';
import { canExpedition, playFlight as analyticFlight, safeReach } from './economy-bot-adapter.mjs';
import { finsTilt } from '../src/data/parts.js';
import { TILT_FREE } from '../src/sim/rocket.js';
import { NO_FLIP_CEILING } from '../src/sim/autopilot.js';

// Minutes of play per era transition for the bot. DESIGN 4.7 gives the targets for a HUMAN player (first era
// 25..40 minutes, campaign 10..14 hours). The rational bot lands every flight, buys the optimal item at once and
// spends no time in menus, so it plays about 0.7x the human time: BOT_SHARE converts the design targets into bot
// targets. The tolerance stays +-30%.
export const BOT_SHARE = 0.7;
const HUMAN_TARGETS = [
  { era: 0, minutes: 34, design: { min: 25, max: 40 } },
  { era: 1, minutes: 70 },
  { era: 2, minutes: 130 },
  { era: 3, minutes: 200 },
  { era: 4, minutes: 290 },
];
export const TARGETS = HUMAN_TARGETS.map((t) => {
  const minutes = Math.round(t.minutes * BOT_SHARE);
  const design = t.design ? { min: Math.round(t.design.min * BOT_SHARE), max: Math.round(t.design.max * BOT_SHARE) } : undefined;
  return { ...t, minutes, design, min: Math.round(minutes * 0.7), max: Math.round(minutes * 1.3) };
});
export const CAMPAIGN = { minutes: Math.round(720 * BOT_SHARE), min: Math.round(600 * BOT_SHARE), max: Math.round(840 * BOT_SHARE) }; // DESIGN 4.7: 10..14 hours for a human

const SAFETY_FRACTION = 0.97; // the rational player stays this far under the safe reach
const MILESTONE_MARGIN = 1.05;

function unitsOf(item) {
  return item.min / 10; // milestone altitudes are meters, the adapter works in game units
}

// ---------------------------------------------------------------------------------------------------
// Purchase planning
// ---------------------------------------------------------------------------------------------------

const levelOf = (profile, kind, id) => (kind === 'part' ? profile.parts[id] : profile.buildings[id]);
const stateOf = (profile, kind, id) => (kind === 'part' ? R.getPartState(profile, id) : R.getBuildingState(profile, id));
const buyOf = (profile, kind, id) => (kind === 'part' ? R.buyPart(profile, id) : R.buyBuilding(profile, id));

function richCopy(profile) {
  return { ...structuredClone(profile), coins: 1e12, data: 1e12 };
}

// Ordered purchases that bring (kind, id) to `level`, prerequisites first. null when the era blocks it.
export function planChain(profile, kind, id, level) {
  let scratch = richCopy(profile);
  const steps = [];
  function ensure(k, i, wanted, depth) {
    if (depth > 12) return false;
    while (levelOf(scratch, k, i) < wanted) {
      const state = stateOf(scratch, k, i);
      if (state.maxed) return false;
      for (const lock of state.locked) {
        if (lock.kind === 'era') return false;
        if (lock.kind === 'building' && !ensure('building', lock.building, lock.level, depth + 1)) return false;
        if (lock.kind === 'part' && !ensure('part', lock.part, lock.level, depth + 1)) return false;
      }
      const ready = stateOf(scratch, k, i);
      if (!ready.canBuy) return false;
      steps.push({ kind: k, id: i, cost: ready.next.cost, data: ready.next.data });
      const bought = buyOf(scratch, k, i);
      if (!bought.ok) return false;
      scratch = { ...bought.profile, coins: 1e12, data: 1e12 };
    }
    return true;
  }
  if (!ensure(kind, id, level, 0)) return null;
  return { steps, cost: steps.reduce((sum, s) => sum + s.cost, 0), data: steps.reduce((sum, s) => sum + s.data, 0), result: scratch };
}

function structureKey(profile) {
  return JSON.stringify([profile.era, profile.parts, profile.buildings, profile.milestones]);
}

function milestoneInfo(profile) {
  const items = ERAS[profile.era].advance?.milestone.items ?? [];
  const altitude = items.find((item) => item.type === 'maxAlt');
  const landAlt = items.find((item) => item.type === 'landAlt');
  const body = items.some((item) => item.type === 'moonLanding') ? 'moon' : items.some((item) => item.type === 'marsLanding') ? 'mars' : null;
  return { altitude, landAlt, body };
}

// How well a config serves the current milestone: a number to maximise and whether it is enough.
function capability(profile, config) {
  const { altitude, landAlt, body } = milestoneInfo(profile);
  if (body) {
    const ok = canExpedition(config, body);
    return { value: (ok ? 1e6 : 0) + safeReach(config), ok };
  }
  if (altitude) {
    const need = unitsOf(altitude) * MILESTONE_MARGIN;
    const reach = safeReach(config);
    const taken = profile.milestones.maxAlt >= altitude.min && (!landAlt || profile.milestones.maxLandAlt >= landAlt.min);
    return { value: reach, ok: taken || reach >= need };
  }
  return { value: 0, ok: true };
}

function configOf(profile, destination = 'earth') {
  return R.makeFlightConfig(profile, { destination, seed: 1 });
}

// The module whose next levels add the most capability per coin.
function bestCapabilityGoal(profile) {
  const now = capability(profile, configOf(profile));
  if (now.ok) return null;
  let best = null;
  for (const id of PART_IDS) {
    for (let k = 1; k <= 3; k++) {
      const level = profile.parts[id] + k;
      if (level > 18) break;
      const chain = planChain(profile, 'part', id, level);
      if (!chain) break;
      const after = capability(chain.result, configOf(chain.result));
      const gain = after.value - now.value;
      if (gain <= 0) continue;
      const score = gain / (chain.cost + 1);
      if (!best || score > best.score) best = { kind: 'part', id, level, score };
    }
  }
  return best;
}

function missingDestinationGoals(profile) {
  const { body } = milestoneInfo(profile);
  if (!body) return [];
  const goals = [];
  for (const req of DESTINATIONS[body].requires) {
    if (req.era != null) continue;
    const kind = req.building ? 'building' : 'part';
    const id = req.building ?? req.part;
    if (levelOf(profile, kind, id) >= req.level) continue;
    const chain = planChain(profile, kind, id, req.level);
    if (chain) goals.push({ kind, id, level: req.level, cost: chain.cost });
  }
  return goals.sort((a, b) => a.cost - b.cost);
}

function gateGoals(profile) {
  const advance = ERAS[profile.era].advance;
  if (!advance) return [];
  const { count, level } = advance.buildings;
  const missing = count - R.countBuildingsAtLevel(profile, level);
  if (missing <= 0) return [];
  const options = [];
  for (const key of BUILDING_KEYS) {
    if (profile.buildings[key] >= level) continue;
    const chain = planChain(profile, 'building', key, level);
    if (chain) options.push({ kind: 'building', id: key, level, cost: chain.cost });
  }
  return options.sort((a, b) => a.cost - b.cost).slice(0, missing);
}

// Бот покупает управление по эпохе; свободное вращение с ур. 9 обязательно перед возвратом со 100 км.
const FINS_BY_ERA = [3, 6, 9, 12, 12, 12];

function controlGoals(profile) {
  const { landAlt } = milestoneInfo(profile);
  const freeLevel = Array.from({ length: 19 }, (_, level) => level).find((level) => finsTilt(level) >= TILT_FREE);
  const level = landAlt?.min >= SPACE_ALT * 10 ? Math.max(FINS_BY_ERA[profile.era], freeLevel) : FINS_BY_ERA[profile.era];
  if (profile.parts.fins >= level) return [];
  const chain = planChain(profile, 'part', 'fins', level);
  return chain ? [{ kind: 'part', id: 'fins', level, cost: chain.cost }] : [];
}

const goalCache = new Map();

// Once the needs are met a player keeps buying: the cheapest available item first (a few at a time, so
// an unaffordable one does not hide the rest). The era project is paid last; the era costs are tuned for that.
function optionalGoals(profile) {
  return R.getNextSteps(profile, 200)
    .filter((step) => step.kind === 'buy-part' || step.kind === 'buy-building')
    .slice(0, 6)
    .map((step) => ({ kind: step.kind === 'buy-part' ? 'part' : 'building', id: step.id, level: step.level, cost: step.cost }));
}

function needs(profile) {
  const key = structureKey(profile);
  if (goalCache.has(key)) return goalCache.get(key);
  const goals = [...controlGoals(profile), ...missingDestinationGoals(profile)];
  const capabilityGoal = bestCapabilityGoal(profile);
  if (capabilityGoal) goals.push(capabilityGoal);
  goals.push(...gateGoals(profile));
  if (goalCache.size > 4000) goalCache.clear();
  goalCache.set(key, goals);
  return goals;
}

// ---------------------------------------------------------------------------------------------------
// Flight planning
// ---------------------------------------------------------------------------------------------------

function estimateRate(profile, config, destination, target, skill) {
  const plan = { destination, target, skill, rng: () => 0.5 };
  const result = analyticFlight(config, plan);
  if (!result.estimate.safe) return { rate: 0, seconds: result.duration };
  const chance = result.estimate.chance;
  const landed = R.settleFlight(profile, { ...result, outcome: 'landed' }, config).report.coins.gross;
  const crashed = R.settleFlight(profile, { ...result, outcome: 'crashed' }, config).report;
  const expected = chance * landed + (1 - chance) * (crashed.coins.gross - crashed.coins.charged);
  const seconds = result.duration + OVERHEAD.cycleSeconds;
  return { rate: expected / seconds, seconds };
}

function bestPlan(profile, skill, caution = 1) {
  let best = null;
  for (const destination of R.availableDestinations(profile).filter((d) => d.ok).map((d) => d.id)) {
    const config = configOf(profile, destination);
    if (destination === 'earth') {
      const reach = safeReach(config) * SAFETY_FRACTION * caution;
      for (const fraction of [0.45, 0.7, 1]) {
        const ceiling = config.fins.maxTilt >= TILT_FREE ? SPACE_ALT * 1.02 : NO_FLIP_CEILING;
        const target = Math.max(40, Math.min(reach * fraction, ceiling));
        const { rate } = estimateRate(profile, config, destination, target, skill);
        if (!best || rate > best.rate) best = { destination, target, rate };
      }
    } else if (canExpedition(config, destination)) {
      const { rate } = estimateRate(profile, config, destination, SPACE_ALT, skill);
      if (!best || rate > best.rate) best = { destination, target: SPACE_ALT, rate };
    }
  }
  return best ?? { destination: 'earth', target: 60, rate: 0 };
}

// `caution` (0.35..1) shrinks the income sorties after failures: the player learns what the rocket can really do.
function choosePlan(profile, skill, caution = 1) {
  const { altitude, landAlt, body } = milestoneInfo(profile);
  const open = new Map(R.availableDestinations(profile).map((d) => [d.id, d.ok]));
  if (body && open.get(body) && canExpedition(configOf(profile, body), body)) {
    return { destination: body, target: SPACE_ALT, reason: 'milestone' };
  }
  if (landAlt && profile.milestones.maxLandAlt < landAlt.min) {
    const config = configOf(profile);
    const need = unitsOf(landAlt) * 1.03;
    const ready = need < SPACE_ALT || config.fins.maxTilt >= TILT_FREE;
    if (ready && safeReach(config) >= need) return { destination: 'earth', target: Math.min(need, SPACE_ALT * 1.03), reason: 'landAlt' };
  }
  if (altitude && profile.milestones.maxAlt < altitude.min) {
    const config = configOf(profile);
    const need = unitsOf(altitude) * MILESTONE_MARGIN;
    if ((need < SPACE_ALT || config.fins.maxTilt >= TILT_FREE) && safeReach(config) >= need) return { destination: 'earth', target: Math.min(need, SPACE_ALT * 1.03), reason: 'milestone' };
  }
  if (!altitude && !body && profile.milestones.softLandings === 0) return { destination: 'earth', target: 120, reason: 'first-landing' };
  const best = bestPlan(profile, skill, caution);
  return { destination: best.destination, target: best.target, reason: 'income' };
}

// ---------------------------------------------------------------------------------------------------
// Optional real simulation
// ---------------------------------------------------------------------------------------------------

// With `--real` every flight runs through game/src/sim (createFlight/step) steered by sim/autopilot.js.
// Planning (reach, which destination) still uses the analytic estimate; the outcome, the payout inputs and
// the flight time come from the real simulation, so a wrong estimate shows up as crashes.
async function loadRealFlight() {
  const file = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'sim', 'run.js');
  if (!existsSync(file) || !existsSync(path.join(path.dirname(file), 'autopilot.js'))) return null;
  const { runFlight } = await import(pathToFileURL(file).href);
  return (config, plan) => {
    // A hop cannot come back from the zero-gravity zone: sorties to the space line use the turn-around mission.
    const mission = plan.destination === 'earth' && plan.target < SPACE_ALT ? 'hop' : 'space';
    const { result } = runFlight(config, { skill: plan.skill, mission, targetAlt: plan.target, seed: config.seed, maxTime: 420 });
    return { ...result, duration: result.time + (plan.destination === 'earth' ? 8 : 12), real: true };
  };
}

// ---------------------------------------------------------------------------------------------------
// The campaign
// ---------------------------------------------------------------------------------------------------

function shop(profile, log, skill) {
  let current = profile;
  for (let guard = 0; guard < 80; guard++) {
    const goals = [...needs(current)];
    if (goals.length === 0) goals.push(...optionalGoals(current));
    let acted = false;
    let saving = false;
    for (const goal of goals) {
      const chain = planChain(current, goal.kind, goal.id, goal.level);
      if (!chain || chain.steps.length === 0) continue;
      const step = chain.steps[0];
      const bought = buyOf(current, step.kind, step.id);
      if (bought.ok) {
        log.items?.push(`${step.kind === 'part' ? 'P' : 'B'}:${step.id}${levelOf(bought.profile, step.kind, step.id)}=${step.cost}`);
        current = bought.profile;
        log.purchases += 1;
        acted = true;
        break;
      }
      const needsCoins = bought.reasons.some((r) => r.kind === 'coins');
      const needsData = bought.reasons.some((r) => r.kind === 'data');
      if (needsCoins && !needsData) { saving = true; break; }
    }
    if (!acted || saving) break;
  }
  return current;
}

// `untilEra` stops the run once that era has been completed (used when calibrating one era at a time).
export async function runBot({ seed = 1, skill = 0.8, maxMinutes = 3000, real = true, verbose = false, untilEra = 5 } = {}) {
  goalCache.clear();
  const rng = mulberry32(seed);
  const fly = real ? (await loadRealFlight()) ?? analyticFlight : analyticFlight;
  let profile = fresh();
  let seconds = 0;
  let eraStart = 0;
  let eraFlights = 0;
  let eraLandings = 0;
  let eraEarned = 0;
  let eraStartEarned = 0;
  let eraDestinations = {};
  let eraLost = 0;
  let lostInSpace = 0;
  let repeated = 0;
  let eraRepeated = 0;
  let previousTarget = null;
  let previousDestination = null;
  const log = { purchases: 0, items: [] };
  const eras = [];
  let flights = 0;
  let caution = 1;
  let firstFinsFlight = null; // flights completed when the first stabilizer level was bought

  while (profile.era < Math.min(5, untilEra + 1) && seconds / 60 < maxMinutes && flights < 20000) {
    const before = log.purchases;
    profile = shop(profile, log, skill);
    seconds += (log.purchases - before) * OVERHEAD.purchaseSeconds;
    if (firstFinsFlight === null && profile.parts.fins >= 1) firstFinsFlight = flights;

    const eraState = R.getEraState(profile);
    if (eraState.ok) {
      const advanced = R.advanceEra(profile);
      if (advanced.ok) {
        const minutes = (seconds - eraStart) / 60;
        eras.push({
          era: profile.era,
          minutes,
          flights: eraFlights,
          landings: eraLandings,
          coinsPerFlight: eraFlights ? eraEarned / eraFlights : 0,
          earnedTotal: profile.stats.earned - eraStartEarned,
          dataAtAdvance: profile.data,
          destinations: eraDestinations,
          lostInSpace: eraLost,
          repeatedGoals: eraRepeated,
          repeatedGoalShare: eraFlights > 1 ? eraRepeated / (eraFlights - 1) : 0,
          items: log.items.splice(0),
          purchases: log.purchases,
          cumulative: seconds / 60,
        });
        if (verbose) console.error(`E${profile.era} -> E${profile.era + 1}: ${minutes.toFixed(1)} мин, ${eraFlights} вылетов`);
        profile = advanced.profile;
        eraStart = seconds;
        eraFlights = 0;
        eraLandings = 0;
        eraEarned = 0;
        eraStartEarned = profile.stats.earned;
        eraDestinations = {};
        eraLost = 0;
        eraRepeated = 0;
        previousTarget = null;
        previousDestination = null;
        continue;
      }
    }

    const plan = choosePlan(profile, skill, caution);
    const config = R.makeFlightConfig(profile, { destination: plan.destination, seed: flights + 1 });
    const result = { ...fly(config, { destination: plan.destination, target: plan.target, skill, rng }), goalAlt: config.goalAlt };
    if (previousDestination === plan.destination && Math.abs(plan.target - previousTarget) <= previousTarget * 0.05 + 1e-9) {
      repeated += 1;
      eraRepeated += 1;
    }
    previousTarget = plan.target;
    previousDestination = plan.destination;
    if (result.reason === 'lost-in-space') { eraLost += 1; lostInSpace += 1; }
    if (verbose) console.error(`  Вылет ${flights + 1}: ${plan.destination}, цель ${Math.round(plan.target)} → ${result.outcome} ${result.reason ?? ''}, высота ${Math.round(result.maxAlt)}, топливо ${(result.fuelLeft01 ?? 0).toFixed(2)}`);
    // Only the real simulation can contradict the estimate, so only there a failure teaches caution.
    if (real) caution = result.outcome === 'landed' ? Math.min(1, caution * 1.05) : Math.max(0.35, caution * 0.8);
    const settled = R.settleFlight(profile, result, config);
    profile = settled.profile;
    seconds += result.duration + OVERHEAD.cycleSeconds;
    flights += 1;
    eraFlights += 1;
    eraDestinations[plan.destination] = (eraDestinations[plan.destination] ?? 0) + 1;
    if (result.outcome === 'landed') eraLandings += 1;
    eraEarned += settled.report.coins.gross;
  }
  return { eras, minutes: seconds / 60, flights, profile, reachedFinalEra: profile.era >= 5, firstFinsFlight, lostInSpace, repeatedGoals: repeated,
    repeatedGoalShare: flights > eras.length + (eraFlights > 0 ? 1 : 0) ? repeated / (flights - eras.length - (eraFlights > 0 ? 1 : 0)) : 0,
    unfinished: { era: profile.era, minutes: (seconds - eraStart) / 60, flights: eraFlights, lostInSpace: eraLost, repeatedGoalShare: eraFlights > 1 ? eraRepeated / (eraFlights - 1) : 0 } };
}

export function evaluate(run) {
  const rows = TARGETS.map((target) => {
    const actual = run.eras.find((e) => e.era === target.era);
    const minutes = actual?.minutes ?? null;
    return { ...target, actual: actual ?? null, ok: minutes != null && minutes >= target.min && minutes <= target.max };
  });
  const totalOk = run.reachedFinalEra && run.minutes >= CAMPAIGN.min && run.minutes <= CAMPAIGN.max;
  return { rows, totalOk, ok: rows.every((row) => row.ok) && totalOk };
}

function formatTable(run, verdict) {
  const lines = [];
  lines.push('Эпоха    Цель    Допуск       Минуты  Разница Вылетов  Посадок   Монет/вылет Потеряно Повторы Итог');
  for (const row of verdict.rows) {
    const a = row.actual;
    const delta = a ? `${(((a.minutes - row.minutes) / row.minutes) * 100).toFixed(0)}%` : '—';
    lines.push([
      `E${row.era}->E${row.era + 1}`.padEnd(8),
      `${row.minutes}`.padStart(6),
      `${row.min}-${row.max}`.padStart(8).padEnd(13),
      (a ? a.minutes.toFixed(1) : '—').padStart(6),
      delta.padStart(7),
      `${a?.flights ?? '-'}`.padStart(8),
      `${a?.landings ?? '-'}`.padStart(9),
      `${a ? a.coinsPerFlight.toFixed(0) : '-'}`.padStart(13),
      `${a?.lostInSpace ?? '-'}`.padStart(8),
      a ? `${(a.repeatedGoalShare * 100).toFixed(1)}%` : '—',
      row.ok ? '  норма' : '  ВНЕ ДОПУСКА',
    ].join(' '));
  }
  const hours = (run.minutes / 60).toFixed(1);
  lines.push(`Кампания: ${run.minutes.toFixed(0)} мин (${hours} ч), цель ${CAMPAIGN.min}-${CAMPAIGN.max} мин, вылетов ${run.flights}, E5 ${run.reachedFinalEra ? 'достигнута' : 'НЕ достигнута'}; потеряно в космосе ${run.lostInSpace}, повторы ${(run.repeatedGoalShare * 100).toFixed(1)}% → ${verdict.totalOk ? 'норма' : 'ВНЕ ДОПУСКА'}`);
  return lines.join('\n');
}

async function main() {
  const args = process.argv.slice(2);
  const option = (name, fallback) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : fallback;
  };
  const run = await runBot({
    seed: Number(option('seed', 1)),
    skill: Number(option('skill', 0.8)),
    real: !args.includes('--quick'),
    verbose: args.includes('--verbose'),
    maxMinutes: Number(option('max-minutes', 3000)),
  });
  const verdict = evaluate(run);
  if (args.includes('--json')) console.log(JSON.stringify({ run: { ...run, profile: undefined }, verdict }, null, 2));
  else console.log(formatTable(run, verdict));
  process.exitCode = verdict.ok ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
