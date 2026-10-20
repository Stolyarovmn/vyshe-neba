// Achievements and state-based contracts. Run after any change of the profile that can complete them.

import { ACHIEVEMENTS } from '../data/index.js';
import { produce } from './common.js';
import { completeContracts } from './contracts.js';
import { evalCondition } from './goals.js';

export function checkAchievements(profile) {
  let current = profile;
  const awarded = [];
  // A reward raises stats.earned, which can unlock the next achievement, so repeat until nothing changes.
  for (;;) {
    const fresh = ACHIEVEMENTS.filter((a) => !current.achievements.includes(a.id) && evalCondition(a.cond, current));
    if (fresh.length === 0) break;
    current = produce(current, (draft) => {
      for (const a of fresh) {
        draft.achievements.push(a.id);
        draft.coins += a.reward;
        draft.stats.earned += a.reward;
      }
    });
    awarded.push(...fresh.map(({ id, name, reward }) => ({ id, name, reward })));
  }
  return { profile: current, awarded };
}

// Contracts first (their rewards count towards the earned-coins achievements), then achievements.
// `ctx` is the flight context for flight goals or null.
export function applyProgress(profile, ctx = null) {
  const contracts = completeContracts(profile, ctx);
  const achievements = checkAchievements(contracts.profile);
  return {
    profile: achievements.profile,
    awarded: { achievements: achievements.awarded, contracts: contracts.completed },
  };
}
