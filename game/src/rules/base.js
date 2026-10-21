// Power balance and the aggregated effects of the base buildings.

import { BUILDINGS, BUILDING_KEYS, ERAS } from '../data/index.js';
import { BASE_POWER_SUPPLY, MAX_BUILDING_LEVEL } from '../data/economy.js';

const levelData = (key, level) => (level > 0 ? BUILDINGS[key].levels[Math.min(level, MAX_BUILDING_LEVEL) - 1] : null);

// ratio < 1 means a deficit and weakens every building effect proportionally.
export function powerBalance(profile) {
  let supply = BASE_POWER_SUPPLY;
  let demand = 0;
  for (const key of BUILDING_KEYS) {
    const level = levelData(key, profile.buildings[key]);
    if (!level) continue;
    supply += level.power.supply;
    demand += level.power.use;
  }
  return { supply, demand, ratio: demand > 0 ? Math.min(1, supply / demand) : 1 };
}

// Every effect key with its neutral value 0, so consumers can read any key without checks.
function emptyEffects() {
  const out = {};
  for (const key of BUILDING_KEYS) {
    for (const info of BUILDINGS[key].effectInfo) out[info.key] = 0;
  }
  return out;
}

const round3 = (value) => Math.round(value * 1000) / 1000;

export function deriveBase(profile) {
  const power = powerBalance(profile);
  const effects = emptyEffects();
  for (const key of BUILDING_KEYS) {
    const level = levelData(key, profile.buildings[key]);
    if (!level) continue;
    const infos = new Map(BUILDINGS[key].effectInfo.map((info) => [info.key, info]));
    for (const [name, value] of Object.entries(level.effects)) {
      const discrete = infos.get(name)?.discrete;
      effects[name] = discrete ? (power.ratio >= 0.5 ? value : 0) : round3(value * power.ratio);
    }
  }
  const era = ERAS[profile.era].bonus;
  // FlightConfig.base, exactly the fields the simulation reads (ARCHITECTURE 6.1).
  const flight = {
    radar: effects.radar01,
    beacons: effects.beacons01,
    weather: effects.forecast,
    income: round3((1 + era.income) * (1 + effects.flightIncome)),
    fuelDropRate: round3(1 + effects.fuelDropRate),
    repairOnLand: effects.repairOnLand,
    rescueRefund: effects.rescueRefund,
    padSafety: effects.padSafety,
    dataMult: round3(1 + effects.dataMult),
    perfectBonus: round3(1 + effects.perfectBonus),
  };
  return { power, era, effects, flight };
}
