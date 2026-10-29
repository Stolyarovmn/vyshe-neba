// The "Модернизация космодрома" project: conditions of the next era and the transition itself.

import { BUILDING_KEYS, ERAS } from '../data/index.js';
import { MAX_ERA } from '../data/economy.js';
import { emptyAward } from './purchases.js';
import { coinsText, produce } from './common.js';
import { applyProgress } from './progress.js';

function milestoneItem(profile, item) {
  switch (item.type) {
    case 'softLandings':
      return { type: item.type, ok: profile.milestones.softLandings >= item.min, have: profile.milestones.softLandings, need: item.min, text: 'Нужна мягкая посадка' };
    case 'maxAlt':
      return {
        type: item.type,
        ok: profile.milestones.maxAlt >= item.min,
        have: profile.milestones.maxAlt,
        need: item.min,
        text: `Нужна высота ${item.min / 1000} км`,
      };
    case 'moonLanding':
      return { type: item.type, ok: profile.milestones.moonLanding, have: profile.milestones.moonLanding ? 1 : 0, need: 1, text: 'Нужна мягкая посадка на Луне' };
    case 'marsLanding':
      return { type: item.type, ok: profile.milestones.marsLanding, have: profile.milestones.marsLanding ? 1 : 0, need: 1, text: 'Нужна мягкая посадка на Марсе' };
    default:
      throw new Error(`Unknown milestone type "${item.type}"`);
  }
}

export function countBuildingsAtLevel(profile, level) {
  return BUILDING_KEYS.filter((key) => profile.buildings[key] >= level).length;
}

export function getEraState(profile) {
  const era = ERAS[profile.era];
  const final = !era.advance;
  const state = {
    era: profile.era,
    year: era.year,
    name: era.name,
    cap: era.cap,
    bonus: era.bonus,
    final,
    next: final ? null : { id: ERAS[profile.era + 1].id, year: ERAS[profile.era + 1].year, name: ERAS[profile.era + 1].name, bonus: ERAS[profile.era + 1].bonus },
    conditions: [],
    ok: false,
    reasons: [],
  };
  if (final) return state;

  const { advance } = era;
  const items = advance.milestone.items.map((item) => milestoneItem(profile, item));
  const built = countBuildingsAtLevel(profile, advance.buildings.level);
  state.conditions = [
    { kind: 'coins', ok: profile.coins >= advance.coins, have: profile.coins, need: advance.coins, text: `Нужно ${coinsText(advance.coins)}` },
    { kind: 'data', ok: profile.data >= advance.data, have: profile.data, need: advance.data, text: `Нужно ${advance.data} данных` },
    { kind: 'milestone', ok: items.every((item) => item.ok), items, text: advance.milestone.text },
    {
      kind: 'buildings',
      ok: built >= advance.buildings.count,
      have: built,
      need: advance.buildings.count,
      level: advance.buildings.level,
      text: `Нужно построек ур. ${advance.buildings.level}+: ${advance.buildings.count}`,
    },
  ];
  state.ok = state.conditions.every((condition) => condition.ok);
  state.reasons = state.conditions.filter((condition) => !condition.ok);
  return state;
}

export function advanceEra(profile) {
  const state = getEraState(profile);
  if (state.final || profile.era >= MAX_ERA) {
    return { ok: false, reasons: [{ kind: 'final', text: 'Это последняя эпоха' }], profile, awarded: emptyAward() };
  }
  if (!state.ok) return { ok: false, reasons: state.reasons, profile, awarded: emptyAward() };
  const { advance } = ERAS[profile.era];
  const next = produce(profile, (draft) => {
    draft.coins -= advance.coins;
    draft.data -= advance.data;
    draft.era += 1;
  });
  const progressed = applyProgress(next);
  return { ok: true, reasons: [], profile: progressed.profile, awarded: progressed.awarded };
}
