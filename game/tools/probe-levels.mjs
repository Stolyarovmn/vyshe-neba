// Сколько высоты даёт каждый уровень модулей E0 (настоящая симуляция, лучший пилот бота).
// Высота — максимум успешного возврата на сетке внешнего probe_levels.mjs:
// шаг 250 м до 4 км, далее ×1,12; остановка после трёх промахов, seeds 7 и 11.
// node game/tools/probe-levels.mjs [--era-cap]
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const imp = (p) => import(pathToFileURL(path.join(root, p)).href);
const R = await imp('game/src/rules/index.js');
const { fresh } = await imp('game/src/state/index.js');
const { runFlight } = await imp('game/src/sim/run.js');
const { ERAS } = await imp('game/src/data/index.js');

const ALL = ['engine', 'tank', 'hull', 'booster', 'capsule', 'legs', 'fins', 'avionics'];

export function reach(parts, buildings = 1, era = 0) {
  const p = structuredClone(fresh());
  Object.assign(p.parts, parts);
  p.era = era;
  for (const k of Object.keys(p.buildings)) p.buildings[k] = buildings;
  const config = R.makeFlightConfig(p, { destination: 'earth', consumables: {}, seed: 7 });
  const lands = (t) => {
    for (const seed of [7, 11]) {
      const { result } = runFlight({ ...config, seed }, { skill: 1, mission: 'hop', targetAlt: t, seed, maxTime: 600 });
      if (result.outcome === 'landed') return result.maxAlt;
    }
    return 0;
  };
  // грубо вверх шагом 25 ед. (250 м), пока садится; затем последние две неудачи не прерывают поиск
  let best = 0;
  let misses = 0;
  for (let t = 25; t <= 9000 && misses < 3; t = t < 400 ? t + 25 : Math.round(t * 1.12)) {
    const got = lands(t);
    if (got > 0) { best = Math.max(best, got); misses = 0; } else misses++;
  }
  return Math.round(best) / 100; // км
}

export function eraCap(era, { seed = 7, buildings = 1 } = {}) {
  const p = structuredClone(fresh());
  p.era = era;
  for (const id of ALL) p.parts[id] = ERAS[era].cap.part;
  for (const id of Object.keys(p.buildings)) p.buildings[id] = buildings;
  const config = R.makeFlightConfig(p, { seed });
  return runFlight(config, { skill: 1, mission: 'space', targetAlt: 10300, seed, maxTime: 600 }).result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {

  if (process.argv.includes('--era-cap')) {
    console.log('Все постройки уровня 1; максимум подъёма, исход возвращения:');
    for (const era of [0, 1, 2]) {
      const r = eraCap(era);
      console.log(`E${era}, модули L${ERAS[era].cap.part}: ${(r.maxAlt / 100).toFixed(2)} км, ${r.outcome}, ${r.reason ?? '—'}`);
    }
  } else {
    console.log('База (все 0):', reach({}), 'км');
    for (const id of ['engine', 'tank', 'booster', 'capsule', 'fins', 'hull']) {
      const row = [1, 2, 3].map((l) => reach({ [id]: l }));
      console.log(`${id}: ур.1..3 → ${row.join(' / ')} км`);
    }
    for (const l of [1, 2, 3]) {
      console.log(`все модули ур.${l}: ${reach(Object.fromEntries(ALL.map((k) => [k, l])))} км`);
    }
  }
}
