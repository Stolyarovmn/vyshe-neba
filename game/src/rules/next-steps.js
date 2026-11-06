// "What next?": the nearest useful actions for the player, ready to show on the hub.
//
// getNextSteps(profile, limit) -> [{ kind, id, cost, affordable, reasons, text, ... }]
//   kind 'buy-part' | 'buy-building'  id is the module / building key, cost in coins (+ `data`), `level` is the
//                                     level that would be bought;
//   kind 'era'                        id is the id of the next era; cost is the project price; reasons lists
//                                     what is missing (coins, data, milestone, buildings);
//   kind 'fly'                        a flight is needed: `goal` says what for (altitude, landing, moon, mars,
//                                     coins, data) with the current value and the target;
//   kind 'wait'                       nothing left to do in this era.
// Order: purchases the player can pay for now (cheapest first), the era card when the project is ready, a flight
// when nothing can be bought, purchases that wait for coins or data (cheapest first), the era card with its gaps.
// Items locked by the base or the era cap are not offered: they are not the "nearest" action.

import { BUILDINGS, BUILDING_KEYS, ERAS, PARTS, PART_IDS } from '../data/index.js';
import { getBuildingState, getPartState } from './purchases.js';
import { coinsText } from './common.js';
import { getEraState } from './eras.js';

const RESOURCE_LOCKS = new Set(['coins', 'data']);

export function kmText(meters) {
  const km = Math.round(meters / 100) / 10;
  return `${String(km).replace('.', ',')} км`;
}

function purchase(kind, id, state) {
  const level = state.next.level;
  const building = kind === 'buy-building';
  const name = building ? BUILDINGS[id].name : PARTS[id].name;
  const text = building && state.level === 0 ? `Построить: ${name}` : `Улучшить: ${name} до ур. ${level}`;
  return { kind, id, level, cost: state.next.cost, data: state.next.data, affordable: state.canBuy, reasons: state.locked, text };
}

// Everything that can be bought except for coins or data.
function collectPurchases(profile) {
  const out = [];
  for (const key of BUILDING_KEYS) {
    const state = getBuildingState(profile, key);
    if (state.maxed || state.locked.some((lock) => !RESOURCE_LOCKS.has(lock.kind))) continue;
    out.push(purchase('buy-building', key, state));
  }
  for (const id of PART_IDS) {
    const state = getPartState(profile, id);
    if (state.maxed || state.locked.some((lock) => !RESOURCE_LOCKS.has(lock.kind))) continue;
    out.push(purchase('buy-part', id, state));
  }
  const byCost = (a, b) => a.cost - b.cost || (a.kind === b.kind ? 0 : a.kind === 'buy-building' ? -1 : 1) || a.id.localeCompare(b.id);
  return {
    affordable: out.filter((step) => step.affordable).sort(byCost),
    waiting: out.filter((step) => !step.affordable).sort(byCost),
  };
}

// A failed era condition as a reason with a short Russian text and the progress where there is one.
function eraReasons(state) {
  const reasons = [];
  for (const condition of state.reasons) {
    if (condition.kind === 'coins') {
      reasons.push({ kind: 'coins', need: condition.need, have: condition.have, text: `Нужно ещё ${coinsText(condition.need - condition.have)}` });
    } else if (condition.kind === 'data') {
      reasons.push({ kind: 'data', need: condition.need, have: condition.have, text: `Нужно ещё ${condition.need - condition.have} данных` });
    } else if (condition.kind === 'milestone') {
      for (const item of condition.items.filter((i) => !i.ok)) reasons.push(milestoneReason(item));
    } else if (condition.kind === 'buildings') {
      const missing = condition.need - condition.have;
      reasons.push({
        kind: 'buildings',
        need: condition.need,
        have: condition.have,
        level: condition.level,
        text: condition.level > 1 ? `Построек ур. ${condition.level}+: ещё ${missing}` : `Построек: ещё ${missing}`,
      });
    }
  }
  return reasons;
}

function milestoneReason(item) {
  switch (item.type) {
    case 'maxAlt':
      return { kind: 'milestone', type: item.type, have: item.have, need: item.need, text: `Высота ${kmText(item.need)}: сейчас ${kmText(item.have)}` };
    case 'softLandings':
      return { kind: 'milestone', type: item.type, have: item.have, need: item.need, text: 'Нужна мягкая посадка' };
    case 'moonLanding':
      return { kind: 'milestone', type: item.type, have: 0, need: 1, text: 'Нужна посадка на Луне' };
    case 'marsLanding':
      return { kind: 'milestone', type: item.type, have: 0, need: 1, text: 'Нужна посадка на Марсе' };
    default:
      return { kind: 'milestone', type: item.type, have: item.have, need: item.need, text: item.text };
  }
}

function eraStep(profile, state) {
  const next = ERAS[state.era + 1];
  const { advance } = ERAS[state.era];
  const reasons = eraReasons(state);
  const text = state.ok ? `Эпоха ${next.year}: можно перейти` : `Эпоха ${next.year}: ${reasons.slice(0, 2).map((r) => r.text.charAt(0).toLowerCase() + r.text.slice(1)).join(', ')}`;
  return { kind: 'era', id: next.id, cost: advance.coins, data: advance.data, affordable: state.ok, reasons, text };
}

// The flight that moves the player forward: the unmet milestone first, then the missing coins or data.
function flyStep(eraState, reasons, waiting) {
  const milestone = reasons.find((r) => r.kind === 'milestone');
  if (milestone) {
    const goalType = { maxAlt: 'altitude', softLandings: 'landing', moonLanding: 'moon', marsLanding: 'mars' }[milestone.type] ?? 'milestone';
    const text = {
      altitude: `Полёт: поднимись на ${kmText(milestone.need)} (рекорд ${kmText(milestone.have)})`,
      landing: 'Полёт: сядь мягко',
      moon: 'Полёт: сядь на Луне',
      mars: 'Полёт: сядь на Марсе',
    }[goalType] ?? `Полёт: ${milestone.text}`;
    return { kind: 'fly', id: goalType, cost: 0, affordable: true, reasons: [], text, goal: { type: goalType, have: milestone.have, need: milestone.need } };
  }
  const shortage = waiting[0]?.reasons.find((r) => r.kind === 'coins' || r.kind === 'data') ?? reasons.find((r) => r.kind === 'coins' || r.kind === 'data');
  if (!shortage) return null;
  const missing = shortage.need - shortage.have;
  if (shortage.kind === 'data') {
    return { kind: 'fly', id: 'data', cost: 0, affordable: true, reasons: [], text: `Полёт: ещё ${missing} данных (новые высоты дают данные)`, goal: { type: 'data', have: shortage.have, need: shortage.need } };
  }
  return { kind: 'fly', id: 'coins', cost: 0, affordable: true, reasons: [], text: `Полёт: ещё ${coinsText(missing)}`, goal: { type: 'coins', have: shortage.have, need: shortage.need } };
}

export function getNextSteps(profile, limit = 4) {
  const count = Math.max(1, Math.floor(limit));
  const { affordable, waiting } = collectPurchases(profile);
  const eraState = getEraState(profile);
  const era = eraState.final ? null : eraStep(profile, eraState);
  const fly = era && !era.affordable ? flyStep(eraState, era.reasons, waiting) : flyStep(eraState, [], waiting);

  const steps = [...affordable];
  if (era?.affordable) steps.push(era);
  // A flight is the next action when there is nothing to pay for, or when the era is waiting for a milestone.
  const needsFlight = affordable.length === 0 || era?.reasons.some((r) => r.kind === 'milestone');
  if (needsFlight && fly && !era?.affordable) steps.push(fly);
  steps.push(...waiting);
  if (era && !era.affordable) steps.push(era);

  if (steps.length === 0) {
    steps.push({ kind: 'wait', id: 'done', cost: 0, affordable: false, reasons: [], text: 'Всё куплено' });
  }

  const shown = steps.slice(0, count);
  // The ready era card must stay visible even behind a long list of cheap purchases.
  if (era?.affordable && !shown.includes(era)) shown[count - 1] = era;
  return shown;
}
