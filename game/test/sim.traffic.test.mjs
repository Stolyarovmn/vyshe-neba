// Air traffic is checked against the design documents, read as data:
//   outputs/rocket/study/aircraft-traffic-by-altitude-and-era.md   (aircraft lineages and bands)
//   outputs/rocket/docs/AEROSTAT_TRAFFIC.md                        (balloons and airships)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  DT, SPACE_ALT, createAutopilot, createFlight, startRocket, step,
} from '../src/sim/index.js';
import {
  AEROSTATS, AIRCRAFT, OBSTACLE_FLOOR, aircraftWeight, pickGeneration, spawnHazards,
} from '../src/sim/hazards.js';
import { createRngState, hashSeed } from '../src/sim/rng.js';

const read = (path) => readFileSync(new URL(`../../outputs/rocket/${path}`, import.meta.url), 'utf8');
const ERA_OF_YEAR = { 1978: 0, 1986: 1, 1998: 2, 2015: 3, 2035: 4, 2060: 5 };
const km = (text) => Math.round(Number(text.replace(',', '.')) * 100);

function aircraftTable() {
  const rows = [];
  const re = /^\|\s*`([a-z_]+)_(\d{4})`\s*\|.*\|\s*([\d,]+)\s*[–-]\s*([\d,]+)\s*км\s*\|\s*$/gm;
  const source = read('study/aircraft-traffic-by-altitude-and-era.md');
  for (let m = re.exec(source); m; m = re.exec(source)) {
    rows.push({ lineage: m[1], era: ERA_OF_YEAR[m[2]], min: km(m[3]), max: km(m[4]) });
  }
  return rows;
}

function aerostatTable() {
  const rows = [];
  const re = /^\|\s*(\d{4})\s*\|\s*`(low|mid|high)_\d{4}_[a-z_]+`\s*\|.*\|\s*`y\s*(\d+)[–-](\d+)`\s*\|/gm;
  const source = read('docs/AEROSTAT_TRAFFIC.md');
  for (let m = re.exec(source); m; m = re.exec(source)) {
    rows.push({ line: m[2], era: ERA_OF_YEAR[m[1]], min: Number(m[3]), max: Number(m[4]) });
  }
  return rows;
}

function sample(era, rows, columns = 30) {
  const found = [];
  let id = 1;
  for (let iy = 0; iy < rows; iy++) {
    for (let ix = -columns; ix < columns; ix++) {
      const rs = createRngState(hashSeed(5, ix, iy, era));
      found.push(...spawnHazards(rs, {
        bodyId: 'earth', era, x0: ix * 600, alt0: iy * 300, width: 600, height: 300, padX: 0, nextId: () => id++,
      }));
    }
  }
  return found;
}

test('the documents are really there: 36 aircraft rows and 18 aerostat rows', () => {
  assert.equal(aircraftTable().length, 36);
  assert.equal(aerostatTable().length, 18);
});

test('every aircraft band of every era matches the study document', () => {
  for (const row of aircraftTable()) {
    const def = AIRCRAFT[row.lineage];
    assert.ok(def, `unknown lineage ${row.lineage}`);
    assert.equal(def.min[row.era], row.min, `${row.lineage} era ${row.era} lower edge`);
    assert.equal(def.max[row.era], row.max, `${row.lineage} era ${row.era} upper edge`);
  }
});

test('every balloon and airship band of every era matches the aerostat document', () => {
  for (const row of aerostatTable()) {
    const def = AEROSTATS[row.line];
    assert.equal(def.min[row.era], row.min, `${row.line} era ${row.era} lower edge`);
    assert.equal(def.max[row.era], row.max, `${row.line} era ${row.era} upper edge`);
  }
  for (const def of Object.values(AEROSTATS)) assert.ok(def.max.every((value) => value <= 5300), 'no balloons above 53 km');
});

test('spawned aircraft respect the era bands, the launch zone and the space line', () => {
  const table = aircraftTable();
  const band = 100; // the documents ask for soft +-500 m transitions (+-1 km at 12 and 20 km)
  for (let era = 0; era <= 5; era++) {
    const planes = sample(era, 100).filter((h) => h.kind === 'plane');
    assert.ok(planes.length > 100, `era ${era} has traffic`);
    for (const plane of planes) {
      const alt = -plane.oy;
      const row = table.find((r) => r.lineage === plane.lineage && r.era === era);
      assert.ok(alt >= OBSTACLE_FLOOR, `no aircraft in the first 4 km (${alt})`);
      assert.ok(alt < SPACE_ALT, 'no aircraft in space');
      assert.ok(alt >= row.min - band && alt <= row.max + band, `${plane.lineage} era ${era} at ${alt}, band ${row.min}-${row.max}`);
    }
  }
});

test('spawned balloons stay inside their bands', () => {
  const table = aerostatTable();
  for (let era = 0; era <= 5; era++) {
    const balloons = sample(era, 100).filter((h) => h.kind === 'balloon');
    assert.ok(balloons.length > 30);
    for (const balloon of balloons) {
      const row = table.find((r) => r.line === balloon.lineage && r.era === era);
      assert.ok(-balloon.oy >= row.min && -balloon.oy <= row.max, `${balloon.lineage} era ${era} at ${-balloon.oy}`);
    }
  }
});

test('altitude orders the lineages: light aircraft lowest, then airliners and freighters, then fighters, then experimental', () => {
  const median = (values) => values.sort((a, b) => a - b)[Math.floor(values.length / 2)];
  const planes = sample(4, 100).filter((h) => h.kind === 'plane');
  const at = (lineage) => median(planes.filter((p) => p.lineage === lineage).map((p) => -p.oy));
  const order = [
    Math.max(at('low_primary'), at('low_multiwing')),
    Math.min(at('medium_passenger'), at('medium_cargo')),
    Math.max(at('medium_passenger'), at('medium_cargo')),
    at('high_fighter'),
    at('high_experimental'),
  ];
  for (let i = 1; i < order.length; i++) assert.ok(order[i] > order[i - 1], `median altitudes ${order}`);
  assert.ok(order[0] < 950 && order[2] < 1900 && order[3] < 3100 && order[4] > 3100);
});

test('the first 4 km are clean of every obstacle: aircraft, balloons, airships, rocks and debris', () => {
  assert.equal(OBSTACLE_FLOOR, 400);
  assert.equal(Math.min(...AIRCRAFT.low_primary.min, ...AIRCRAFT.low_multiwing.min), 450, 'light aircraft start at 4.5 km');
  assert.ok(Math.min(...Object.values(AEROSTATS).flatMap((def) => def.min)) >= 450, 'balloons are not closer to the ground than aircraft');
  for (let era = 0; era <= 5; era++) {
    const all = sample(era, 40);
    assert.ok(all.length > 20);
    assert.ok(all.every((h) => -h.oy >= OBSTACLE_FLOOR), `era ${era} has something below 4 km`);
  }
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const state = createFlight(startRocket({ seed, start: { body: 'earth', alt: 500 } }));
    const hazards = state.objects.filter((o) => o.hazard);
    assert.ok(hazards.every((o) => -o.oy >= OBSTACLE_FLOOR), `seed ${seed}: something low`);
  }
});

test('coins, rings and fuel still fill the low sky', () => {
  const kinds = new Set();
  for (let seed = 1; seed <= 6; seed++) {
    for (const o of createFlight(startRocket({ seed })).objects) if (-o.y < OBSTACLE_FLOOR) kinds.add(o.kind);
  }
  assert.ok(kinds.has('coin') && kinds.has('ring') && kinds.has('fuel'), `low objects: ${[...kinds]}`);
  assert.ok(![...kinds].some((kind) => ['plane', 'balloon', 'asteroid', 'debris'].includes(kind)));
});

test('a rocket that tops out at 3.1 km (the best of era 0) meets no traffic at all and keeps landing', () => {
  for (let seed = 1; seed <= 24; seed++) {
    const state = createFlight(startRocket({ seed }));
    const pilot = createAutopilot({ skill: 1, mission: 'hop', targetAlt: 310, seed });
    let lowestHazard = Infinity;
    while (!state.ended && state.time < 120) {
      step(state, pilot.next(state, DT), DT);
      for (const o of state.objects) if (o.hazard && o.active) lowestHazard = Math.min(lowestHazard, -o.y);
    }
    assert.equal(state.outcome, 'landed', `seed ${seed}: ${state.reason}`);
    assert.equal(state.hits, 0);
    assert.ok(lowestHazard >= OBSTACLE_FLOOR - 15, `seed ${seed}: hazard seen at ${lowestHazard}`);
    assert.ok(state.maxAlt >= 300);
  }
});

test('class shares follow the document: 70/30 low, cargo over passenger above the low layer, passenger over cargo higher, fighters 70/30 over experimental', () => {
  const ratio = (era, alt, a, b) => aircraftWeight(a, era, alt) / aircraftWeight(b, era, alt);
  assert.ok(Math.abs(ratio(2, 600, 'low_primary', 'low_multiwing') - 70 / 30) < 1e-9);
  assert.ok(Math.abs(ratio(2, 1000, 'medium_cargo', 'medium_passenger') - 50 / 35) < 1e-9, 'cargo 50%, passenger 35% in the mixed layer');
  assert.ok(aircraftWeight('low_primary', 5, 930) > 0 && aircraftWeight('low_primary', 5, 930) < aircraftWeight('medium_cargo', 5, 930), 'late light aircraft still reach the mixed layer, but cargo dominates there');
  assert.ok(Math.abs(ratio(3, 1500, 'medium_passenger', 'medium_cargo') - 60 / 35) < 1e-9, 'passenger 60%, cargo 35% in the airliner layer');
  assert.equal(aircraftWeight('high_fighter', 3, 1000), 0, 'fighters live at their own layer and above');
  assert.ok(aircraftWeight('high_fighter', 3, 1730) > 0, 'a rare fighter shows in the upper part of the airliner layer');
  assert.ok(aircraftWeight('high_fighter', 3, 1730) < aircraftWeight('medium_passenger', 3, 1730) / 5);
  assert.ok(Math.abs(ratio(0, 2200, 'high_fighter', 'high_experimental') - 70 / 30) < 1e-9, 'where both fly, fighters 70% and experimental 30%');
  assert.equal(aircraftWeight('high_fighter', 3, 3200), 0, 'only experimental craft in the top layer');
  assert.ok(aircraftWeight('high_experimental', 3, 4000) > 0);
});

test('traffic thins out in the rare layers and starts above the obstacle floor', () => {
  assert.equal(aircraftWeight('low_primary', 0, 10), 0);
  assert.equal(aircraftWeight('low_primary', 0, 399), 0);
  assert.equal(aircraftWeight('low_primary', 0, OBSTACLE_FLOOR), 0);
  assert.ok(aircraftWeight('low_primary', 0, 470) > 0);
  assert.ok(aircraftWeight('low_primary', 0, 430) < aircraftWeight('low_primary', 0, 520), 'they fade in above the floor');
  const dense = aircraftWeight('high_experimental', 5, 4000);
  const near = aircraftWeight('high_experimental', 5, 7000);
  const edge = aircraftWeight('high_experimental', 5, 9200);
  assert.ok(near < dense / 2, 'the near-space layer is rare');
  assert.ok(edge < near / 3 && edge <= 0.05 * 0.9 + 1e-9, 'the last layer: no more than 5% of the traffic');
  assert.equal(aircraftWeight('high_experimental', 4, 9200), 0, 'only the last era reaches 96 km');
  assert.ok(Math.max(...AIRCRAFT.high_experimental.max) < SPACE_ALT, 'no aircraft band reaches the space line');
});

test('class boundaries blend instead of switching on a single line', () => {
  const lowAt = (alt) => aircraftWeight('low_primary', 0, alt);
  const cargoAt = (alt) => aircraftWeight('medium_cargo', 0, alt);
  assert.ok(lowAt(760) > lowAt(800) && lowAt(800) > lowAt(840) && lowAt(840) > 0, 'light aircraft fade out around 8 km');
  assert.ok(cargoAt(840) > cargoAt(780) && cargoAt(780) >= 0, 'freighters fade in around 8 km');
  const fighterAt = (alt) => aircraftWeight('high_fighter', 3, alt);
  assert.ok(fighterAt(1730) > 0 && fighterAt(1830) > fighterAt(1730), 'fighters appear gradually across 18 km');
});

test('experimental craft only fly as high as the era allows', () => {
  const top = (era) => Math.max(...sample(era, 110).filter((h) => h.lineage === 'high_experimental').map((h) => -h.oy));
  const ceilings = [3000, 3300, 4300, 5800, 7600, 9650];
  for (let era = 0; era <= 5; era++) {
    const highest = top(era);
    assert.ok(highest <= ceilings[era] + 100, `era ${era}: ${highest} > ${ceilings[era]}`);
    assert.ok(highest > ceilings[era] * 0.6, `era ${era}: the sky should reach near the ceiling (${highest})`);
  }
});

test('generations mix as the documents say', () => {
  const tally = (era, choice, alt, n = 6000) => {
    const rs = createRngState(77);
    const counts = {};
    for (let i = 0; i < n; i++) {
      const gen = pickGeneration(rs, era, choice, alt);
      counts[gen] = (counts[gen] ?? 0) + 1;
    }
    for (const gen of Object.keys(counts)) counts[gen] /= n;
    return counts;
  };
  const light = { kind: 'plane', def: AIRCRAFT.low_primary };
  const fighter = { kind: 'plane', def: AIRCRAFT.high_fighter };
  const experimental = { kind: 'plane', def: AIRCRAFT.high_experimental };
  const balloon = { kind: 'balloon', def: AEROSTATS.low };
  const near = (value, expected, tolerance = 0.03) => assert.ok(Math.abs(value - expected) <= tolerance, `${value} vs ${expected}`);

  assert.deepEqual(tally(0, light, 100), { 0: 1 }, 'era 0 shows only 1978');
  near(tally(1, light, 100)[1], 0.8);
  const light4 = tally(4, light, 100);
  near(light4[4], 0.75);
  near(light4[3], 0.2);
  near(1 - light4[4] - light4[3], 0.05);
  near(tally(3, fighter, 1400)[3], 0.85);
  near(tally(3, fighter, 1400)[2], 0.15);
  assert.deepEqual(tally(4, experimental, 6000), { 4: 1 }, 'above the previous ceiling only the current era flies');
  near(tally(4, experimental, 3000)[4], 0.9);
  const balloons = tally(4, balloon, 300);
  near(balloons[4], 0.7);
  near(balloons[3], 0.25);
});
