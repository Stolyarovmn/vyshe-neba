// Диагностика: что доступно игроку в E0 и какой высоты достигает ракета с максимумом улучшений E0.
import { fresh } from '../src/state/index.js';
import { buyBuilding, buyPart, makeFlightConfig, getEraState } from '../src/rules/index.js';
import { runFlight } from '../src/sim/index.js';
import { BUILDING_KEYS, PART_IDS } from '../src/data/index.js';

let p = fresh();
p.coins = 1e9;
p.data = 1e6;
let bought = 0;
for (let round = 0; round < 40; round++) {
  let changed = false;
  for (const k of BUILDING_KEYS) { const r = buyBuilding(p, k); if (r.ok) { p = r.profile; changed = true; bought++; } }
  for (const k of PART_IDS) { const r = buyPart(p, k); if (r.ok) { p = r.profile; changed = true; bought++; } }
  if (!changed) break;
}
console.log('куплено шагов в E0:', bought);
console.log('модули:', JSON.stringify(p.parts));
console.log('постройки:', JSON.stringify(p.buildings));
const era = getEraState(p);
console.log('переход в E1: веха', JSON.stringify(era.conditions || era).slice(0, 400));
for (const target of [90, 200, 300, 500]) {
  const config = makeFlightConfig(p, { destination: 'earth', consumables: {}, seed: 3 });
  const { result } = runFlight(config, { skill: 1, mission: 'hop', targetAlt: target, seed: 3, maxTime: 600 });
  console.log(`цель ${target * 10} м: достигнуто ${Math.round(result.maxAlt * 10)} м, исход ${result.outcome}`);
}
