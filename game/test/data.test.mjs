// Structure of the data package: shapes, monotonic curves, requirement graph, reachability.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import * as data from '../src/data/index.js';
import { BODIES as SIM_BODIES } from '../src/sim/bodies.js';
import { STAGE_DEFAULTS } from '../src/sim/config.js';
import { buyBuilding, buyPart } from '../src/rules/index.js';
import { makeProfile } from './rules-helpers.mjs';

const { ERAS, PARTS, BUILDINGS, PART_IDS, BUILDING_KEYS } = data;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

test('eras: six eras with caps and the transitions of DESIGN 4.2', () => {
  assert.equal(ERAS.length, 6);
  ERAS.forEach((era, i) => {
    assert.equal(era.id, i);
    assert.equal(era.cap.part, 3 * (i + 1));
    assert.equal(era.cap.building, i + 1);
    assert.ok(era.name && era.desc);
  });
  assert.deepEqual(ERAS.map((e) => e.year), [1978, 1986, 1998, 2015, 2035, 2060]);
  assert.deepEqual(ERAS.slice(0, 5).map((e) => e.advance.buildings.count), [2, 4, 6, 8, 10]);
  assert.deepEqual(ERAS.slice(0, 5).map((e) => e.advance.buildings.level), [1, 2, 3, 4, 5]);
  assert.equal(ERAS[5].advance, null);
  for (const key of ['fuel', 'income', 'discount']) {
    const series = ERAS.map((e) => e.bonus[key]);
    assert.ok(series.every((v, i) => i === 0 || v > series[i - 1]), `${key} bonus grows with the era`);
  }
  const coins = ERAS.slice(0, 5).map((e) => e.advance.coins);
  assert.ok(coins.every((v, i) => i === 0 || v > coins[i - 1]), 'projects get more expensive');
});

test('parts: nine modules with 18 monotonic levels', () => {
  assert.equal(PART_IDS.length, 9);
  assert.deepEqual([...PART_IDS].sort(), ['avionics', 'booster', 'capsule', 'engine', 'fins', 'hull', 'legs', 'parachute', 'tank']);
  for (const id of PART_IDS) {
    const part = PARTS[id];
    assert.equal(part.levels.length, 18, `${id} levels`);
    assert.ok(part.name && part.desc && part.need);
    for (let i = 1; i < 18; i++) {
      assert.ok(part.levels[i].cost > part.levels[i - 1].cost, `${id} cost rises at level ${i + 1}`);
      assert.ok(part.levels[i].data >= part.levels[i - 1].data, `${id} data does not fall at level ${i + 1}`);
    }
    // Price growth stays near the 1.28..1.34 corridor of DESIGN 4.7 once rounding no longer matters.
    for (let i = 8; i < 18; i++) {
      const ratio = part.levels[i].cost / part.levels[i - 1].cost;
      assert.ok(ratio > 1.2 && ratio < 1.42, `${id} growth ${ratio.toFixed(3)} at level ${i + 1}`);
    }
    // Every stat moves in its declared direction and every level improves something.
    const chain = [part.base, ...part.levels.map((l) => l.stats)];
    for (let i = 1; i < chain.length; i++) {
      let improved = false;
      for (const info of part.statInfo) {
        const delta = (chain[i][info.key] - chain[i - 1][info.key]) * info.dir;
        assert.ok(delta >= -1e-9, `${id}.${info.key} regresses at level ${i}`);
        if (delta > 1e-9) improved = true;
      }
      assert.ok(improved, `${id} level ${i} improves nothing`);
    }
    assert.deepEqual(Object.keys(part.base).sort(), part.statInfo.map((s) => s.key).sort(), `${id} statInfo matches stats`);
  }
});

test('parts: the stock rocket equals the simulation reference stages', () => {
  assert.equal(PARTS.engine.base.thrust, STAGE_DEFAULTS.core.thrust);
  assert.equal(PARTS.engine.base.burnRate, STAGE_DEFAULTS.core.burnRate);
  assert.equal(PARTS.tank.base.fuel, STAGE_DEFAULTS.core.fuel);
  assert.equal(PARTS.capsule.base.fuel, STAGE_DEFAULTS.capsule.fuel);
  assert.equal(PARTS.booster.levels[0].stats.fuel > STAGE_DEFAULTS.booster.fuel, true);
});

test('buildings: fourteen keys that match the island layout, six levels each', () => {
  const layout = JSON.parse(readFileSync(path.join(root, 'art', 'placeables', 'BASE_ISLAND_LAYOUT.json'), 'utf8'));
  assert.deepEqual([...BUILDING_KEYS].sort(), Object.keys(layout.purchases).sort());
  assert.equal(BUILDING_KEYS.length, 14);
  for (const key of BUILDING_KEYS) {
    const building = BUILDINGS[key];
    assert.equal(building.levels.length, 6, key);
    assert.equal(building.name, layout.purchases[key].name, `${key} name matches the layout`);
    assert.ok(building.desc && building.need);
    for (let i = 1; i < 6; i++) {
      assert.ok(building.levels[i].cost > building.levels[i - 1].cost, `${key} cost rises`);
      assert.ok(building.levels[i].power.use >= building.levels[i - 1].power.use, `${key} power use does not fall`);
      for (const [name, value] of Object.entries(building.levels[i].effects)) {
        assert.ok(value >= building.levels[i - 1].effects[name], `${key}.${name} does not fall`);
      }
    }
    assert.deepEqual(Object.keys(building.levels[0].effects).sort(), building.effectInfo.map((e) => e.key).sort(), `${key} effectInfo`);
    assert.ok(building.levels.every((l) => l.power.use > 0), `${key} uses power`);
  }
  const supply = BUILDINGS.energy.levels.map((l) => l.power.supply);
  assert.ok(supply.every((v, i) => i === 0 || v > supply[i - 1]), 'energy supply grows');
  assert.ok(BUILDING_KEYS.filter((k) => k !== 'energy').every((k) => BUILDINGS[k].levels.every((l) => l.power.supply === 0)));
});

function* allRequirements() {
  for (const id of PART_IDS) for (const [i, level] of PARTS[id].levels.entries()) for (const req of level.requires) yield { owner: `part ${id} ${i + 1}`, req };
  for (const key of BUILDING_KEYS) for (const [i, level] of BUILDINGS[key].levels.entries()) for (const req of level.requires) yield { owner: `building ${key} ${i + 1}`, req };
}

test('requirements refer to existing buildings, valid levels and eras', () => {
  for (const { owner, req } of allRequirements()) {
    if (req.era != null) {
      assert.ok(Number.isInteger(req.era) && req.era >= 0 && req.era <= 5, `${owner}: era ${req.era}`);
    } else {
      assert.ok(BUILDINGS[req.building], `${owner}: unknown building ${req.building}`);
      assert.ok(Number.isInteger(req.level) && req.level >= 1 && req.level <= 6, `${owner}: level ${req.level}`);
    }
  }
  for (const [dest, spec] of Object.entries(data.DESTINATIONS)) {
    for (const req of spec.requires) {
      if (req.building) assert.ok(BUILDINGS[req.building] && req.level <= 6, `${dest}: ${req.building}`);
      if (req.part) assert.ok(PARTS[req.part] && req.level <= 18, `${dest}: ${req.part}`);
    }
  }
});

test('requirements form no cycles', () => {
  // Nodes are (building, level); an edge goes from a level to every level it requires.
  const edges = new Map();
  const nodeId = (building, level) => `${building}:${level}`;
  for (const key of BUILDING_KEYS) {
    BUILDINGS[key].levels.forEach((level, i) => {
      const needs = [];
      for (const req of level.requires) if (req.building) for (let l = 1; l <= req.level; l++) needs.push(nodeId(req.building, l));
      if (i > 0) needs.push(nodeId(key, i)); // a level needs the previous one
      edges.set(nodeId(key, i + 1), needs);
    });
  }
  const state = new Map();
  function visit(node, trail) {
    if (state.get(node) === 'done') return;
    assert.notEqual(state.get(node), 'open', `cycle: ${[...trail, node].join(' -> ')}`);
    state.set(node, 'open');
    for (const next of edges.get(node)) visit(next, [...trail, node]);
    state.set(node, 'done');
  }
  for (const node of edges.keys()) visit(node, []);
});

test('every level is reachable: a player with unlimited funds buys the whole tree era by era', () => {
  let profile = makeProfile({ coins: 1e9, data: 1e9 });
  for (let era = 0; era <= 5; era++) {
    profile = { ...profile, era, coins: 1e9, data: 1e9 };
    for (let guard = 0; guard < 400; guard++) {
      let bought = false;
      for (const key of BUILDING_KEYS) {
        const result = buyBuilding(profile, key);
        if (result.ok) { profile = { ...result.profile, coins: 1e9, data: 1e9 }; bought = true; }
      }
      for (const id of PART_IDS) {
        const result = buyPart(profile, id);
        if (result.ok) { profile = { ...result.profile, coins: 1e9, data: 1e9 }; bought = true; }
      }
      if (!bought) break;
    }
    const cap = ERAS[era].cap;
    for (const id of PART_IDS) {
      const expected = id === 'avionics' && era < 2 ? 0 : id === 'booster' && era < 1 ? 0 : null;
      if (expected !== null) assert.equal(profile.parts[id], expected, `${id} in era ${era}`);
    }
    // The era caps are met by everything that is not delayed by a building's first era.
    for (const key of BUILDING_KEYS) {
      const spec = BUILDINGS[key];
      if (spec.minEra <= era) assert.equal(profile.buildings[key], Math.min(6, cap.building + spec.lead), `${key} in era ${era}`);
      else assert.equal(profile.buildings[key], 0, `${key} locked in era ${era}`);
    }
  }
  assert.ok(PART_IDS.every((id) => profile.parts[id] === 18), 'all modules reach level 18');
  assert.ok(BUILDING_KEYS.every((key) => profile.buildings[key] === 6), 'all buildings reach level 6');
});

test('destinations: Moon and Mars need their base and rocket', () => {
  assert.deepEqual(data.DESTINATIONS.earth.requires, []);
  assert.ok(data.DESTINATIONS.moon.requires.some((r) => r.building === 'recovery'));
  assert.ok(data.DESTINATIONS.mars.requires.some((r) => r.building === 'recovery'));
  assert.ok(data.DESTINATIONS.moon.requires.some((r) => r.building === 'control') && data.DESTINATIONS.moon.requires.some((r) => r.building === 'radar'));
  assert.ok(data.TRANSFER_COST.moon > 0 && data.TRANSFER_COST.mars > data.TRANSFER_COST.moon);
});

test('bodies mirror the simulation constants', () => {
  for (const id of ['earth', 'moon', 'mars']) {
    assert.equal(data.BODIES[id].gravity, SIM_BODIES[id].gravity);
    assert.deepEqual(data.BODIES[id].atmo, SIM_BODIES[id].atmo);
    assert.ok(data.BODIES[id].name);
  }
  assert.equal(data.BODIES.earth.parachute, true);
  assert.equal(data.BODIES.moon.parachute, false);
});

test('content: 44 achievements, 30 contracts, shop and skins', () => {
  assert.equal(data.ACHIEVEMENTS.length, 44);
  assert.equal(data.CONTRACT_TEMPLATES.length, 30);
  assert.equal(new Set(data.ACHIEVEMENTS.map((a) => a.id)).size, 44);
  assert.equal(new Set(data.CONTRACT_TEMPLATES.map((t) => t.id)).size, 30);
  // Old rewards are scaled like the end of content.js: max(10, round(r * .45)) and max(15, round(r * .55)).
  assert.equal(data.ACHIEVEMENTS.find((a) => a.id === 'first').reward, 14);
  assert.equal(data.ACHIEVEMENTS.find((a) => a.id === 'base5').reward, 450);
  assert.equal(data.CONTRACT_TEMPLATES.find((t) => t.id === 'm01').reward, 33);
  assert.equal(data.CONTRACT_TEMPLATES.find((t) => t.id === 'm30').reward, 550);
  assert.ok(data.ACHIEVEMENTS.every((a) => a.name && a.desc && a.reward >= 10 && a.cond.type));
  assert.ok(data.CONTRACT_TEMPLATES.every((t) => t.name && t.desc && t.reward >= 15 && t.goal.type && t.from));
  assert.deepEqual(data.SHOP.map((s) => s.id), ['chute', 'repair', 'canister', 'magnet']);
  assert.deepEqual(data.SKINS.map((s) => s.id), ['classic', 'wasp', 'arctic', 'cosmos']);
  assert.equal(data.SKINS[0].price, 0);
});

test('the data package is plain JSON', () => {
  const snapshot = { ERAS, PARTS, BUILDINGS, CONTRACT_TEMPLATES: data.CONTRACT_TEMPLATES, ACHIEVEMENTS: data.ACHIEVEMENTS, SHOP: data.SHOP, SKINS: data.SKINS, BODIES: data.BODIES, DESTINATIONS: data.DESTINATIONS };
  assert.deepEqual(JSON.parse(JSON.stringify(snapshot)), snapshot);
});
