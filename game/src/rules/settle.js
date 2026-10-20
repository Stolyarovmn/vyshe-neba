// Applying the outcome of a flight to the profile: rewards, crash loss, statistics, milestones,
// contracts and achievements. Pure: the input profile is never modified.

import { PARTS, PART_IDS } from '../data/index.js';
import { CRASH_LOSS, DATA_GAIN, METERS_PER_UNIT, PAYOUT, ZONES } from '../data/economy.js';
import { deriveBase } from './base.js';
import { produce } from './common.js';
import { applyProgress } from './progress.js';
import { deriveRocket, resolveConsumables } from './rocket.js';

const BODY_IDS = ['earth', 'moon', 'mars'];
const num = (value) => (typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0);

// Everything ever paid for rocket modules; the crash loss is a small share of it.
export function partsValue(profile) {
  let total = 0;
  for (const id of PART_IDS) {
    for (let level = 0; level < (profile.parts[id] ?? 0); level++) total += PARTS[id].levels[level].cost;
  }
  return total;
}

export function crashLoss(profile, body, base = deriveBase(profile)) {
  const raw = Math.max(CRASH_LOSS.minimum, Math.round(CRASH_LOSS.partValueShare * partsValue(profile)));
  const refund = Math.min(0.95, base.effects.rescueRefund + (body === 'earth' ? 0 : base.effects.salvage));
  return Math.round(raw * (1 - refund));
}

export function travelPay(altM, distM, body, income) {
  const km = altM / 1000;
  const raw = PAYOUT.travelK * (km + PAYOUT.travelOffsetKm) ** PAYOUT.travelExp + PAYOUT.distanceK * Math.sqrt(distM);
  return Math.round(raw * PAYOUT.body[body].mult * income);
}

function zonesCrossed(previousAltM, altM) {
  return ZONES.filter((zone) => zone.from > 0 && zone.from > previousAltM && zone.from <= altM);
}

const CRASH_HINTS = {
  'landing-speed': { part: 'legs', text: (v, tol) => `Слишком быстро: ${v} ед./с при допуске ${tol}. Помогут посадочные опоры и парашют.` },
  'landing-drift': { part: 'fins', text: (v, tol) => `Снос при касании: ${v} ед./с при допуске ${tol}. Помогут стабилизаторы и опоры.` },
  'landing-tilt': { part: 'fins', text: (v, tol) => `Корпус наклонён: ${v}° при допуске ${tol}°. Помогут стабилизаторы и авионика.` },
};

function explainCrash(profile, result, config) {
  const legs = config?.legs ?? deriveRocket(profile).legs;
  const landing = result.landing ?? {};
  const hint = CRASH_HINTS[result.reason];
  if (!hint) {
    return { code: result.reason ?? 'crash', part: 'hull', text: 'Ракета разбита. Прочная обшивка и ремонт сохраняют корпус.' };
  }
  const deg = (rad) => Math.round((rad * 180) / Math.PI);
  if (result.reason === 'landing-speed') return { code: result.reason, part: hint.part, building: 'beacons', text: hint.text(Math.round(num(landing.v)), Math.round(legs.vTol)) };
  if (result.reason === 'landing-drift') return { code: result.reason, part: hint.part, building: 'beacons', text: hint.text(Math.round(num(landing.h)), Math.round(legs.hTol)) };
  return { code: result.reason, part: hint.part, building: 'control', text: hint.text(deg(num(landing.ang)), deg(legs.angTol)) };
}

export function settleFlight(profile, result, config = null) {
  const outcome = ['landed', 'crashed', 'abandoned'].includes(result.outcome) ? result.outcome : 'abandoned';
  const landed = outcome === 'landed';
  const crashed = outcome === 'crashed';
  const body = BODY_IDS.includes(result.body) ? result.body : BODY_IDS.includes(result.destination) ? result.destination : 'earth';
  const altM = num(result.maxAlt) * METERS_PER_UNIT;
  const distM = num(result.distance) * METERS_PER_UNIT;
  const base = deriveBase(profile);
  const { effects } = base;
  const era = profile.era;

  // Coins.
  let travel = outcome === 'abandoned' ? 0 : travelPay(altM, distM, body, base.flight.income);
  if (crashed) travel = Math.round(travel * PAYOUT.crashTravelShare);
  const loot = Math.round(num(result.coinsPicked));
  const eraScale = 1 + PAYOUT.eraScale * era;
  const landing = landed ? Math.round(PAYOUT.landingBonus * eraScale) : 0;
  const perfect = landed && result.perfect ? Math.round(PAYOUT.perfectBonus * eraScale * base.flight.perfectBonus) : 0;
  const expedition = landed && body !== 'earth' ? Math.round(PAYOUT.body[body].expedition * (1 + effects.expeditionPay)) : 0;
  const storm = landed && num(result.stormTime) > 0 ? Math.round(travel * effects.stormBonus * Math.min(1, num(result.stormTime) / 20)) : 0;
  const gross = travel + loot + landing + perfect + expedition + storm;

  // Data: lump sums for new altitude zones and first landings, a trickle for every landing.
  const dataMult = base.flight.dataMult;
  const zones = outcome === 'abandoned' ? [] : zonesCrossed(profile.milestones.maxAlt, altM);
  const zoneData = Math.round(zones.reduce((sum, zone) => sum + zone.data, 0) * dataMult);
  const firstOnBody = landed && body !== 'earth' && !(body === 'moon' ? profile.milestones.moonLanding : profile.milestones.marsLanding);
  const bodyData = landed && body !== 'earth'
    ? Math.round((firstOnBody ? DATA_GAIN.firstLanding[body] : DATA_GAIN.repeatLanding[body]) * dataMult)
    : 0;
  const trickle = landed ? Math.max(1, Math.round((DATA_GAIN.landingBase + DATA_GAIN.landingPerSqrtKm * Math.sqrt(altM / 1000)) * dataMult)) : 0;
  const dataGain = zoneData + bodyData + trickle;

  const potentialLoss = crashLoss(profile, body, base);
  const consumables = config?.consumables ?? result.consumables ?? null;
  const spent = consumables ? resolveSpent(profile, consumables) : {};

  const stormLanding = landed && num(result.stormTime) >= 5;
  const after = produce(profile, (draft) => {
    const purse = draft.coins + gross;
    const charged = crashed ? Math.min(potentialLoss, Math.floor(purse * CRASH_LOSS.purseShare)) : 0;
    draft.coins = Math.max(0, purse - charged);
    draft.data += dataGain;

    const st = draft.stats;
    st.flights += 1;
    if (landed) {
      st.landings += 1;
      st.streak += 1;
      st.bestStreak = Math.max(st.bestStreak, st.streak);
      st.saved += potentialLoss;
      if (result.perfect) st.perfect += 1;
      if (result.usedChute) st.parachutes += 1;
      if (body === 'moon') st.moon += 1;
      if (body === 'mars') st.mars += 1;
      if (stormLanding) st.storm += 1;
    } else if (crashed) {
      st.crashes += 1;
      st.streak = 0;
    }
    st.distance += Math.round(distM);
    st.earned += gross;
    st.rings += Math.round(num(result.rings));
    st.pickups += Math.round(num(result.pickups));
    st.near += Math.round(num(result.near));
    st.airtime = Math.max(st.airtime, Math.round(num(result.time)));

    const ms = draft.milestones;
    ms.maxAlt = Math.max(ms.maxAlt, Math.round(altM));
    if (landed) ms.softLandings += 1;
    if (landed && body === 'moon') ms.moonLanding = true;
    if (landed && body === 'mars') ms.marsLanding = true;

    for (const [id, count] of Object.entries(spent)) draft.inventory[id] = Math.max(0, draft.inventory[id] - count);
  });
  const charged = crashed ? profile.coins + gross - after.coins : 0;

  const ctx = { result, body, landed };
  const progressed = applyProgress(after, ctx);

  const report = {
    outcome,
    body,
    reason: result.reason ?? null,
    perfect: landed && !!result.perfect,
    hint: crashed ? explainCrash(profile, result, config) : null,
    coins: { travel, loot, landing, perfect, expedition, storm, gross, charged, saved: landed ? potentialLoss : 0 },
    multipliers: { income: base.flight.income, perfectBonus: base.flight.perfectBonus, dataMult, expeditionPay: effects.expeditionPay, stormBonus: effects.stormBonus },
    data: { zones: zoneData, body: bodyData, trickle, total: dataGain },
    newZones: zones.map(({ id, name, data }) => ({ id, name, data })),
    milestones: {
      newMaxAlt: Math.round(altM) > profile.milestones.maxAlt,
      firstSoftLanding: landed && profile.milestones.softLandings === 0,
      firstMoonLanding: landed && body === 'moon' && !profile.milestones.moonLanding,
      firstMarsLanding: landed && body === 'mars' && !profile.milestones.marsLanding,
    },
    awarded: progressed.awarded,
    consumablesSpent: spent,
    coinsBefore: profile.coins,
    coinsAfter: progressed.profile.coins,
  };
  return { profile: progressed.profile, report };
}

// Which stocked consumables a flight used up (free ones from the base are not taken from the stock).
function resolveSpent(profile, active) {
  const { paid } = resolveConsumables(profile, active);
  return Object.fromEntries(Object.entries(paid).filter(([, count]) => count > 0));
}
