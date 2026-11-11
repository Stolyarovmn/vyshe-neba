import test from 'node:test';
import assert from 'node:assert/strict';
import { fresh } from '../src/state/index.js';
import { makeFlightConfig } from '../src/rules/index.js';
import { createFlight } from '../src/sim/flight.js';
import { SPACE_ALT } from '../src/sim/bodies.js';
import { advance, runFlight } from '../src/sim/run.js';

function rocket(level = 9) {
  const p = fresh();
  p.era = 2;
  for (const key in p.parts) p.parts[key] = level;
  for (const key in p.buildings) p.buildings[key] = 3;
  return p;
}

test('Космос: модули ур. 9, база ур. 3, мастерство 0,8 — не менее восьми посадок на seed 1–10', (t) => {
  let landed = 0;
  for (let seed = 1; seed <= 10; seed++) {
    const { result, events } = runFlight(makeFlightConfig(rocket(), { seed }), { skill: 0.8, mission: 'space', maxTime: 600 });
    assert.ok(result.maxAlt >= SPACE_ALT, `Семя ${seed}: достигнут космос`);
    assert.ok(events.some((e) => e.type === 'warn' && e.kind === 'space-turn'), `Семя ${seed}: подсказка разворота`);
    assert.ok(events.some((e) => e.type === 'warn' && e.kind === 'space-brake'), `Семя ${seed}: подсказка торможения`);
    if (result.outcome === 'landed') landed++;
  }
  assert.ok(landed >= 8, `Посадок ${landed}/10`);
  t.diagnostic(`Посадок: ${landed}/10`);
});

test('Без свободного вращения миссия space остаётся ниже SPACE_ALT − 200 и возвращается', () => {
  const p = rocket();
  p.parts.fins = 8;
  for (const seed of [1, 2, 3]) {
    const { result } = runFlight(makeFlightConfig(p, { seed }), { mission: 'space', targetAlt: SPACE_ALT * 1.03, skill: 0.8, maxTime: 1200 });
    assert.ok(result.maxAlt <= SPACE_ALT - 200, `Семя ${seed}: ${result.maxAlt}`);
    assert.equal(result.outcome, 'landed', `Семя ${seed}: ${result.reason}`);
  }
});

test('Подсказки космоса зависят от топлива, носа и свободного вращения; при возврате — торможение', () => {
  for (const [maxTilt, expected] of [[Math.PI, 'space-turn'], [0.9, 'space-fins']]) {
    const s = createFlight({ quietSky: true, fins: { maxTilt }, start: { body: 'earth', alt: SPACE_ALT + 10, vy: -20 } });
    assert.ok(advance(s, {}, 0.1).some((e) => e.kind === expected));
    assert.equal(advance(s, {}, 0.1).filter((e) => e.kind === expected).length, 0, 'Выдержан интервал предупреждений');
  }
  for (const patch of [{ angle: Math.PI }, { fuel01: 0 }]) {
    const s = createFlight({ quietSky: true, fins: { maxTilt: Math.PI }, start: { body: 'earth', alt: SPACE_ALT + 10, vy: -20, ...patch } });
    assert.ok(!advance(s, {}, 0.1).some((e) => ['space-turn', 'space-fins'].includes(e.kind)));
  }
  const s = createFlight({ quietSky: true, fins: { maxTilt: Math.PI }, start: { body: 'earth', alt: SPACE_ALT + 1, vy: 50 } });
  assert.ok(advance(s, {}, 3).some((e) => e.kind === 'space-brake'));
});
