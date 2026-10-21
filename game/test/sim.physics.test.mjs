import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BODIES, DT, SPACE_ALT, advance, createFlight, densityAt, gravityAt, startRocket, step,
} from '../src/sim/index.js';

// Free rotation (a fully upgraded RCS module): the default rocket may only lean a little.
const FREE_FINS = { turn: 1, maxTilt: Math.PI };

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
  const turning = airborne(SPACE_ALT + 500, { vx: 12, vy: -25 }, { fins: FREE_FINS });
  const still = airborne(SPACE_ALT + 500, { vx: 12, vy: -25 }, { fins: FREE_FINS });
  turning.objects = []; // a turned hull has a different outline, so keep hazards out of this comparison
  still.objects = [];
  advance(turning, { throttle: 0, tilt: 1 }, 4);
  advance(still, { throttle: 0, tilt: 0 }, 4);
  assert.ok(Math.abs(turning.angle) > 1, 'the rocket must actually have turned');
  assert.equal(turning.vx, still.vx);
  assert.equal(turning.vy, still.vy);

  const inAir = airborne(3000, { vx: 20, vy: 10 }, { fins: FREE_FINS });
  const inAirStill = airborne(3000, { vx: 20, vy: 10 }, { fins: FREE_FINS });
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
    // A boost ring lifts the limit for a few seconds and a collision bounces the hull, so those moments are left out.
    advance(state, { throttle: 1 }, 20, (s) => {
      if (s.ringBoost === 0 && s.hitTimer === 0) worst = Math.max(worst, air(s) - s.limits.speed);
    });
    return { state, worst };
  };
  const weak = climb(72);
  const strong = climb(160);
  assert.ok(weak.worst <= 1e-9 && strong.worst <= 1e-9, 'never faster through the air than the limit');
  assert.ok(strong.state.limits.speed > weak.state.limits.speed);
  assert.ok(air(strong.state) > air(weak.state));
});

test('the turn rate belongs to the RCS module: the same in air and in vacuum, scaled by fins.turn', () => {
  const spin = (alt, fins) => {
    const state = airborne(alt, {}, { fins });
    advance(state, { tilt: 1 }, 0.5);
    return state.angle;
  };
  const air = spin(500, FREE_FINS);
  const vacuum = spin(SPACE_ALT + 500, FREE_FINS);
  assert.ok(Math.abs(air - vacuum) < 0.01, `${air} in air, ${vacuum} in vacuum`);
  assert.ok(spin(500, { turn: 1.6, maxTilt: Math.PI }) > air * 1.4);
  assert.ok(spin(500, { turn: 0.5, maxTilt: Math.PI }) < air * 0.7);
  const moon = createFlight(startRocket({ fins: FREE_FINS, start: { body: 'moon', alt: 600 } }));
  advance(moon, { tilt: 1 }, 0.5);
  assert.ok(Math.abs(moon.angle - air) < 0.01, 'the same on the Moon');
});

test('stabilize levels the rocket again', () => {
  const state = airborne(3000, {}, { fins: FREE_FINS });
  advance(state, { tilt: 1 }, 0.6);
  assert.ok(state.angle > 0.3);
  advance(state, { stabilize: true }, 2);
  assert.ok(Math.abs(state.angle) < 0.02);
});

// --- attitude control grows with the RCS module -----------------------------------------------------------------

test('without the RCS module the lean from vertical never passes the soft limit, in air, vacuum and on other bodies', () => {
  const cases = [
    ['air', createFlight(startRocket({ weather: 'clear', start: { body: 'earth', alt: 3000 } }))],
    ['vacuum', createFlight(startRocket({ weather: 'clear', start: { body: 'earth', alt: SPACE_ALT + 500 } }))],
    ['moon', createFlight(startRocket({ start: { body: 'moon', alt: 800 } }))],
    ['mars', createFlight(startRocket({ start: { body: 'mars', alt: 800 } }))],
  ];
  for (const [name, state] of cases) {
    const limit = state.cfg.fins.maxTilt;
    assert.equal(limit, 0.2, 'default limit is 0.2 rad (about 11 degrees)');
    let worst = 0;
    for (const tilt of [1, -1, 1, 1, -1]) {
      advance(state, { tilt, throttle: 0.2 }, 3, (s) => { worst = Math.max(worst, Math.abs(s.angle)); });
    }
    assert.ok(worst <= limit + 0.005, `${name}: leaned ${worst} rad`);
    assert.ok(worst > limit * 0.85, `${name}: the rocket does lean up to the limit (${worst})`);
  }
});

test('the limit is soft: no sudden stop, the turn just slows down and the hull settles back when the stick is released', () => {
  const state = airborne(3000);
  const rate = state.turnRate || state.stages[0].turn * state.cfg.fins.turn;
  const angles = [];
  advance(state, { tilt: 1 }, 2, (s) => angles.push(s.angle));
  let biggestStep = 0;
  for (let i = 1; i < angles.length; i++) {
    assert.ok(angles[i] >= angles[i - 1] - 1e-9, 'it only leans one way while the stick is held');
    biggestStep = Math.max(biggestStep, angles[i] - angles[i - 1]);
  }
  assert.ok(biggestStep <= state.stages[0].turn * state.cfg.fins.turn * DT * 1.2 + 1e-9, 'never faster than the turn rate');
  const last = angles.slice(-30);
  assert.ok(last[last.length - 1] - last[0] < 0.01, 'the lean has levelled off near the limit');
  assert.ok(angles.at(-1) > 0.17 && rate > 0);

  const held = state.angle;
  advance(state, { tilt: 0 }, 2);
  assert.ok(Math.abs(state.angle) < held - 0.04, 'the restoring moment brings the nose back toward vertical');
});

test('slow at the start: the unimproved rocket turns far slower than a fully equipped one', () => {
  const basic = airborne(3000);
  const equipped = airborne(3000, {}, { fins: FREE_FINS });
  advance(basic, { tilt: 1 }, 0.3);
  advance(equipped, { tilt: 1 }, 0.3);
  assert.ok(basic.turnRate < equipped.turnRate * 0.6, `${basic.turnRate} vs ${equipped.turnRate}`);
  assert.ok(basic.cfg.fins.turn < 0.8, 'fins.turn at level 0 is well below the old fixed 1');
});

test('with a high RCS level the rocket rotates freely, all the way round', () => {
  const state = airborne(SPACE_ALT + 500, {}, { fins: { turn: 1.5, maxTilt: Math.PI } });
  let turned = 0;
  let previous = state.angle;
  advance(state, { tilt: 1 }, 6, (s) => {
    let step = s.angle - previous;
    if (step < -Math.PI) step += 2 * Math.PI;
    turned += step;
    previous = s.angle;
  });
  assert.ok(turned > 2 * Math.PI, `turned ${turned} rad in 6 s`);
  const high = airborne(3000, {}, { fins: { turn: 1, maxTilt: 1.5 } });
  advance(high, { tilt: 1 }, 4);
  assert.ok(high.angle > 1.2 && high.angle <= 1.5, 'a mid-level module leans further, up to its own limit');
});

test('turbulence cannot shake the hull past the limit either', () => {
  const state = airborne(500, { }, { fins: { turn: 0.5, maxTilt: 0.2 } });
  state.clouds.push({ id: 5, kind: 'storm', x: 0, alt: 520, w: 3000, h: 800, density: 1, storm: true, vx: 0 });
  let worst = 0;
  advance(state, (s) => ({ throttle: Math.min(1, Math.max(0, (s.g + 0.8 * (500 - s.alt) - 1.5 * s.climb) / s.maxAccel)), tilt: Math.sin(s.time * 3) }), 20, (s) => {
    worst = Math.max(worst, Math.abs(s.angle));
    s.clouds[s.clouds.length - 1].x = s.x;
  });
  assert.ok(worst <= 0.205, `leaned ${worst} rad in the storm`);
  assert.ok(state.stormTime > 5);
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
