import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BODIES, DT, SPACE_ALT, advance, createFlight, densityAt, gravityAt, startRocket, step,
} from '../src/sim/index.js';

const airborne = (alt, extra = {}, config = {}) => createFlight(startRocket({ weather: 'clear', ...config, start: { body: 'earth', alt, ...extra } }));

test('without thrust the rocket falls: altitude drops, speed grows, then the fall limit holds', () => {
  const state = airborne(5000);
  const heights = [];
  const speeds = [];
  advance(state, { throttle: 0 }, 3, (s) => {
    heights.push(s.alt);
    speeds.push(s.vy);
  });
  for (let i = 1; i < heights.length; i++) {
    assert.ok(heights[i] < heights[i - 1], 'altitude must keep dropping');
    assert.ok(speeds[i] >= speeds[i - 1] - 1e-3, 'speed must not drop while falling');
  }
  assert.ok(speeds.at(-1) > 40);
  advance(state, { throttle: 0 }, 6);
  const airSpeed = Math.hypot(state.vx - state.weather.felt, state.vy);
  assert.ok(airSpeed <= state.limits.fall + 1e-9, 'never faster through the air than the fall limit');
  assert.ok(airSpeed > state.limits.fall - 0.05, `fall speed ${airSpeed} should sit at the limit ${state.limits.fall}`);
  assert.ok(state.vy > 0, 'vy > 0 means falling');
});

test('gravity depends on altitude, not on the screen position', () => {
  const earth = BODIES.earth;
  assert.equal(gravityAt(earth, 0), earth.gravity);
  let previous = Infinity;
  for (const alt of [0, 1000, 3000, 5000, 7000, 9000, 9900]) {
    const g = gravityAt(earth, alt);
    assert.ok(g < previous, `gravity at ${alt} should be weaker than below`);
    previous = g;
  }
  assert.equal(gravityAt(earth, SPACE_ALT), 0);
  assert.equal(gravityAt(earth, SPACE_ALT * 3), 0);

  for (const alt of [100, 2500, 6000, 9500]) {
    const state = airborne(alt);
    step(state, { throttle: 0 }, DT);
    const g = gravityAt(earth, alt);
    assert.ok(Math.abs(state.vy / DT - g) < g * 1e-3, `first-tick acceleration at ${alt}`); // minus a whisper of drag
  }
});

test('weightlessness: above the boundary there is no gravity and no drag', () => {
  const state = airborne(SPACE_ALT + 2000, { vx: 20, vy: -30 });
  assert.equal(state.phase, 'space');
  assert.equal(state.weightless, true);
  assert.equal(state.atmo, 0);
  advance(state, { throttle: 0 }, 5);
  assert.ok(Math.abs(state.vx - 20) < 1e-12);
  assert.ok(Math.abs(state.vy + 30) < 1e-12);
  assert.ok(Math.abs(state.alt - (SPACE_ALT + 2000 + 150)) < 1e-6);
});

test('turning without thrust never changes the velocity vector', () => {
  const turning = airborne(SPACE_ALT + 500, { vx: 12, vy: -25 });
  const still = airborne(SPACE_ALT + 500, { vx: 12, vy: -25 });
  turning.objects = []; // a turned hull has a different outline, so keep hazards out of this comparison
  still.objects = [];
  advance(turning, { throttle: 0, tilt: 1 }, 4);
  advance(still, { throttle: 0, tilt: 0 }, 4);
  assert.ok(Math.abs(turning.angle) > 1, 'the rocket must actually have turned');
  assert.equal(turning.vx, still.vx);
  assert.equal(turning.vy, still.vy);

  const inAir = airborne(3000, { vx: 20, vy: 10 });
  const inAirStill = airborne(3000, { vx: 20, vy: 10 });
  inAir.objects = []; // a turned hull has a different outline, so keep hazards out of this comparison
  inAirStill.objects = [];
  advance(inAir, { throttle: 0, tilt: 1 }, 2);
  advance(inAirStill, { throttle: 0 }, 2);
  assert.ok(Math.abs(inAir.vx - inAirStill.vx) < 1e-12);
  assert.ok(Math.abs(inAir.vy - inAirStill.vy) < 1e-12);
});

test('the atmosphere thins with height and ends at the space line', () => {
  assert.equal(densityAt(BODIES.earth, 0), 1);
  assert.ok(Math.abs(densityAt(BODIES.earth, 5000) - 0.25) < 1e-12);
  assert.equal(densityAt(BODIES.earth, SPACE_ALT), 0);
  assert.equal(densityAt(BODIES.moon, 0), 0);
  assert.ok(densityAt(BODIES.mars, 0) > 0 && densityAt(BODIES.mars, 0) < 0.3);
});

test('the Moon and Mars use their own gravity and the Moon has no drag', () => {
  for (const body of ['moon', 'mars']) {
    const state = createFlight(startRocket({ start: { body, alt: 1000, vy: 0 } }));
    step(state, { throttle: 0 }, DT);
    const g = gravityAt(BODIES[body], 1000);
    assert.ok(Math.abs(state.vy / DT - g) < g * 1e-3);
    assert.ok(state.g < BODIES.earth.gravity / 2);
  }
  const moon = createFlight(startRocket({ start: { body: 'moon', alt: 1000, vy: 10 } }));
  advance(moon, { throttle: 0 }, 2);
  const expected = 10 + gravityAt(BODIES.moon, 1000) * 2;
  assert.ok(Math.abs(moon.vy - expected) < 0.2, 'no drag in vacuum, so speed follows gravity alone');
});

test('thrust builds up smoothly and fades smoothly', () => {
  const state = createFlight(startRocket({ weather: 'clear' }));
  step(state, { throttle: 1 }, DT);
  assert.ok(state.throttle > 0 && state.throttle < 0.1, 'first tick only starts the engine');
  advance(state, { throttle: 1 }, 0.1);
  assert.ok(state.throttle > 0.2 && state.throttle < 0.9);
  advance(state, { throttle: 1 }, 0.5);
  assert.equal(state.throttle, 1);
  step(state, { throttle: 0 }, DT);
  assert.ok(state.throttle > 0.9, 'does not drop to zero in one tick');
  advance(state, { throttle: 0 }, 0.5);
  assert.equal(state.throttle, 0);
});

test('the pad holds the rocket until thrust beats gravity', () => {
  const state = createFlight(startRocket({ weather: 'clear' }));
  const weak = advance(state, { throttle: 0.5 }, 2);
  assert.equal(state.phase, 'pad');
  assert.equal(state.alt, 0);
  assert.ok(!weak.some((e) => e.type === 'liftoff'));
  const strong = advance(state, { throttle: 1 }, 1);
  assert.equal(strong.filter((e) => e.type === 'liftoff').length, 1);
  assert.equal(state.phase, 'ascent');
  assert.ok(state.alt > 1);
});

test('speed is limited and a stronger engine allows more', () => {
  const air = (s) => Math.hypot(s.vx - s.weather.felt, s.vy);
  const climb = (thrust) => {
    const state = airborne(2000, {}, { stages: [{ id: 'core', thrust, fuel: 5000, burnRate: 1 }] });
    let worst = 0;
    // A boost ring lifts the limit for a few seconds, so those moments are left out.
    advance(state, { throttle: 1 }, 20, (s) => {
      if (s.ringBoost === 0) worst = Math.max(worst, air(s) - s.limits.speed);
    });
    return { state, worst };
  };
  const weak = climb(72);
  const strong = climb(160);
  assert.ok(weak.worst <= 1e-9 && strong.worst <= 1e-9, 'never faster through the air than the limit');
  assert.ok(strong.state.limits.speed > weak.state.limits.speed);
  assert.ok(air(strong.state) > air(weak.state));
});

test('rotation is faster in vacuum and fins speed it up', () => {
  const air = airborne(500);
  const vacuum = airborne(SPACE_ALT + 500);
  advance(air, { tilt: 1 }, 0.5);
  advance(vacuum, { tilt: 1 }, 0.5);
  assert.ok(vacuum.angle > air.angle * 1.5);
  const finned = airborne(500, {}, { fins: { turn: 1.6 } });
  advance(finned, { tilt: 1 }, 0.5);
  assert.ok(finned.angle > air.angle * 1.3);
});

test('stabilize levels the rocket again', () => {
  const state = airborne(3000);
  advance(state, { tilt: 1 }, 0.6);
  assert.ok(state.angle > 0.3);
  advance(state, { stabilize: true }, 2);
  assert.ok(Math.abs(state.angle) < 0.02);
});

test('afterburner adds thrust, burns more fuel and overheats', () => {
  const normal = airborne(3000);
  const boosted = airborne(3000);
  advance(normal, { throttle: 1 }, 1.5);
  const events = advance(boosted, { throttle: 1, boost: true }, 1.5);
  assert.ok(boosted.vy < normal.vy, 'boosted rocket climbs faster (more negative vy)');
  assert.ok(boosted.fuelTotal < normal.fuelTotal);
  assert.ok(boosted.boost.heat > 0.2);
  const later = advance(boosted, { throttle: 1, boost: true }, 5);
  assert.ok(events.concat(later).some((e) => e.type === 'thrust-cut' && e.reason === 'overheat'));
});

test('paused input does not advance time', () => {
  const state = airborne(3000);
  const before = JSON.stringify(state);
  const events = step(state, { throttle: 1, pause: true }, 1);
  assert.deepEqual(events, []);
  assert.equal(JSON.stringify(state), before);
});
