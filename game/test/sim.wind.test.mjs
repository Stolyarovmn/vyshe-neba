import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BODIES, DT, SPACE_ALT, advance, createFlight, startRocket, step,
} from '../src/sim/index.js';
import { createWeather, updateWeather, windAt, windProfile } from '../src/sim/weather.js';

const EARTH_MAX = BODIES.earth.wind;

// Wind speed at one altitude, sampled every tick for `seconds`.
function windSeries(seed, kind, alt, seconds) {
  const w = createWeather(seed, 'earth', kind);
  updateWeather(w, 'earth', alt, 0, false);
  const series = [];
  for (let i = 0; i < seconds / DT; i++) {
    updateWeather(w, 'earth', alt, DT, false);
    series.push(w.wind);
  }
  return { w, series };
}

test('wind never jumps between neighbouring ticks and moves only a little in one second', () => {
  for (const [seed, kind] of [[1, 'clear'], [2, 'cloudy'], [3, 'rain'], [4, 'storm'], [5, 'clear'], [6, 'storm']]) {
    const { series } = windSeries(seed, kind, 600, 600);
    const perSecond = Math.round(1 / DT);
    let worstTick = 0;
    let worstSecond = 0;
    let calm = 0;
    for (let i = 1; i < series.length; i++) worstTick = Math.max(worstTick, Math.abs(series[i] - series[i - 1]));
    for (let i = perSecond; i < series.length; i++) {
      const change = Math.abs(series[i] - series[i - perSecond]);
      worstSecond = Math.max(worstSecond, change);
      if (change <= 0.08 * EARTH_MAX) calm += 1;
    }
    assert.ok(worstTick < 0.05, `seed ${seed}: a tick moved the wind by ${worstTick}`);
    assert.ok(worstSecond <= 0.2 * EARTH_MAX, `seed ${seed}: one second moved the wind by ${worstSecond}`);
    assert.ok(calm / (series.length - perSecond) > 0.97, `seed ${seed}: the wind is calm in almost every second`);
  }
});

test('the wind is strongly autocorrelated at one second and still drifts over a minute', () => {
  const { series } = windSeries(7, 'cloudy', 600, 900);
  const lag = (ticks) => {
    let sum = 0;
    let a = 0;
    let b = 0;
    const mean = series.reduce((x, y) => x + y, 0) / series.length;
    for (let i = ticks; i < series.length; i++) {
      const x = series[i] - mean;
      const y = series[i - ticks] - mean;
      sum += x * y;
      a += x * x;
      b += y * y;
    }
    return sum / Math.sqrt(a * b);
  };
  assert.ok(lag(120) > 0.995, `1 s autocorrelation ${lag(120)}`);
  const minute = lag(120 * 60);
  assert.ok(minute < lag(120), 'a minute later the wind is less like itself than a second later');

  let drifted = 0;
  for (let i = 7200; i < series.length; i += 600) if (Math.abs(series[i] - series[i - 7200]) > 1) drifted += 1;
  assert.ok(drifted > 3, 'over a minute the wind does change');
  assert.ok(Math.max(...series) - Math.min(...series) > 3, 'and its strength wanders');
});

test('the prevailing direction holds for a flight and turns around rarely', () => {
  let turns = 0;
  let long = 0;
  for (let seed = 1; seed <= 30; seed++) {
    const { series } = windSeries(seed, 'cloudy', 800, 150);
    const positive = series.filter((v) => v > 0.5).length;
    const negative = series.filter((v) => v < -0.5).length;
    const dominant = Math.max(positive, negative) / Math.max(1, positive + negative);
    if (dominant > 0.9) long += 1;
    let flips = 0;
    for (let i = 1; i < series.length; i++) if (series[i] * series[i - 1] < 0) flips += 1;
    turns += flips;
  }
  assert.ok(long >= 24, `${long} of 30 flights keep one direction`);
  assert.ok(turns / 30 < 0.5, `${turns / 30} turn-arounds per 150 s flight`);
});

test('every wind value is a real speed with a direction, gusts are 0..1', () => {
  const { w } = windSeries(8, 'storm', 600, 300);
  assert.ok(w.windDir === 1 || w.windDir === -1);
  assert.ok(w.gust >= 0 && w.gust <= 1);
  assert.equal(Math.sign(w.wind) === 0 || Math.sign(w.wind) === w.windDir || Math.abs(w.wind) < 2, true);
  let gusty = false;
  const probe = createWeather(8, 'earth', 'storm');
  for (let i = 0; i < 120 * 200; i++) {
    updateWeather(probe, 'earth', 600, DT, false);
    if (probe.gust > 0.2) gusty = true;
    assert.ok(probe.gust >= 0 && probe.gust <= 1);
  }
  assert.ok(gusty, 'a storm has real gusts');
});

test('the wind profile: weak near the ground, strongest at 3-12 km, none in vacuum, weak and dusty on Mars', () => {
  const ground = windProfile('earth', 0);
  const jet = windProfile('earth', 700);
  assert.ok(ground > 0 && ground < 0.35);
  assert.ok(jet > 0.95 && jet <= 1);
  assert.ok(windProfile('earth', 300) > ground && windProfile('earth', 1200) > 0.9);
  assert.ok(windProfile('earth', 3000) < jet);
  assert.equal(windProfile('earth', SPACE_ALT), 0);
  assert.equal(windProfile('earth', SPACE_ALT * 2), 0);
  assert.equal(windProfile('moon', 0), 0);
  assert.equal(BODIES.moon.wind, 0);
  assert.ok(BODIES.mars.wind * windProfile('mars', 0) < BODIES.earth.wind * jet / 3, 'Mars wind is weak');

  const w = createWeather(3, 'earth', 'cloudy');
  assert.equal(windAt(w, 'earth', SPACE_ALT + 500), 0);
  assert.ok(Math.abs(windAt(w, 'earth', 700)) > Math.abs(windAt(w, 'earth', 5)));

  const calm = createWeather(3, 'mars', 'clear');
  const dust = createWeather(3, 'mars', 'dust');
  assert.ok(Math.abs(windAt(dust, 'mars', 100)) <= BODIES.mars.wind * 1.3);
  assert.ok(dust.stormLevel > calm.stormLevel);
});

test('the Moon has no wind at all', () => {
  const moon = createFlight(startRocket({ start: { body: 'moon', alt: 600 } }));
  advance(moon, { throttle: 0 }, 5);
  assert.equal(moon.weather.wind, 0);
  assert.equal(moon.weather.push, 0);
  assert.equal(moon.weather.gust, 0);
});

test('state.weather exposes the wind at the height of the rocket', () => {
  const low = createFlight(startRocket({ seed: 5, weather: 'cloudy', start: { body: 'earth', alt: 5 } }));
  const high = createFlight(startRocket({ seed: 5, weather: 'cloudy', start: { body: 'earth', alt: 700 } }));
  const space = createFlight(startRocket({ seed: 5, weather: 'cloudy', start: { body: 'earth', alt: SPACE_ALT + 100 } }));
  for (const flight of [low, high, space]) {
    assert.equal(typeof flight.weather.wind, 'number');
    assert.ok(flight.weather.windDir === 1 || flight.weather.windDir === -1);
    assert.ok(flight.weather.gust >= 0 && flight.weather.gust <= 1);
  }
  assert.ok(Math.abs(high.weather.wind) > Math.abs(low.weather.wind) * 2);
  assert.equal(space.weather.wind, 0);
});

test('the wind carries the rocket through the air drag, not through a push on the hull', () => {
  const state = createFlight(startRocket({ seed: 9, weather: 'cloudy', start: { body: 'earth', alt: 700 } }));
  state.objects = [];
  const wind = state.weather.wind;
  assert.ok(Math.abs(wind) > 3);
  step(state, { throttle: 0 }, DT);
  const k = Math.abs(state.weather.push / (wind - 0));
  assert.ok(k > 0.02 && k < 0.3, `coupling ${k}`);
  assert.ok(Math.sign(state.weather.push) === Math.sign(wind), 'the push points the way the wind blows');

  advance(state, { throttle: 0 }, 6);
  assert.ok(Math.sign(state.vx) === Math.sign(wind));
  assert.ok(Math.abs(state.vx) < Math.abs(wind) + 3, 'the rocket never gets faster than the air that carries it');

  // The closer to the wind speed, the smaller the push.
  const early = Math.abs(state.weather.push);
  const fresh = createFlight(startRocket({ seed: 9, weather: 'cloudy', start: { body: 'earth', alt: 700 } }));
  step(fresh, { throttle: 0 }, DT);
  assert.ok(early < Math.abs(fresh.weather.push));
});

test('in vacuum nothing pushes the rocket sideways', () => {
  const state = createFlight(startRocket({ seed: 9, weather: 'storm', start: { body: 'earth', alt: SPACE_ALT + 300, vx: 5 } }));
  advance(state, { throttle: 0 }, 10);
  assert.equal(state.vx, 5);
  assert.equal(state.weather.push, 0);
});

test('stabilizers reduce the drift', () => {
  const seed = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].find((n) => Math.abs(createFlight(startRocket({ seed: n, weather: 'cloudy', start: { body: 'earth', alt: 700 } })).weather.wind) > 12);
  const drift = (dragCut) => {
    const state = createFlight(startRocket({ seed, weather: 'cloudy', fins: { dragCut }, start: { body: 'earth', alt: 700 } }));
    state.objects = [];
    advance(state, { throttle: 0 }, 5);
    return Math.abs(state.vx);
  };
  assert.ok(seed, 'one of the first seeds blows hard enough');
  assert.ok(drift(0) > 3);
  assert.ok(drift(0.5) < drift(0) * 0.6);
});

test('the forecast opens with a weather station or avionics and tells the next kind and wind', () => {
  const closed = createFlight(startRocket({ seed: 4, start: { body: 'earth', alt: 500 } }));
  advance(closed, { throttle: 0 }, 0.5);
  assert.equal(closed.weather.forecast, null);

  for (const config of [{ base: { weather: 1 } }, { avionics: { predict: 1 } }]) {
    const open = createFlight(startRocket({ seed: 4, ...config, start: { body: 'earth', alt: 500 } }));
    advance(open, { throttle: 0 }, 0.5);
    const forecast = open.weather.forecast;
    assert.ok(['clear', 'cloudy', 'rain', 'storm'].includes(forecast.kind));
    assert.ok(forecast.in > 0 && forecast.windIn > 0);
    assert.ok(forecast.windDir === 1 || forecast.windDir === -1);
    assert.equal(typeof forecast.wind, 'number');
  }
});

test('the weather kind changes over time on Earth but stays fixed when forced', () => {
  const free = createFlight(startRocket({ seed: 6, start: { body: 'earth', alt: 9500 } }));
  const kinds = new Set();
  advance(free, { throttle: 0 }, 150, (s) => kinds.add(s.weather.kind));
  assert.ok(kinds.size >= 2, `weather stayed ${[...kinds]}`);

  const forced = createFlight(startRocket({ seed: 6, weather: 'rain', start: { body: 'earth', alt: 9500 } }));
  const seen = new Set();
  advance(forced, { throttle: 0 }, 150, (s) => seen.add(s.weather.kind));
  assert.deepEqual([...seen], ['rain']);
});
