// Profile, saving, import/export, migration and the import of the previous edition's save.

import test from 'node:test';
import assert from 'node:assert/strict';
import { BUILDINGS, PARTS } from '../src/data/index.js';
import { powerBalance } from '../src/rules/index.js';
import {
  createMemoryStorage, createSaveStore, exportJson, fresh, importJson, importLegacySave, isLegacySave, MIGRATIONS,
  normalizeProfile, parseSave, serialize, validateProfile,
} from '../src/state/index.js';
import { makeProfile } from './rules-helpers.mjs';

function playedProfile() {
  const profile = makeProfile({
    coins: 1234,
    data: 56,
    era: 2,
    parts: { engine: 5, tank: 7, legs: 3 },
    buildings: { fuel: 3, service: 2, energy: 2 },
    inventory: { chute: 2 },
    skins: ['classic', 'wasp'],
    skin: 'wasp',
    milestones: { maxAlt: 45000, softLandings: 12, moonLanding: false, marsLanding: false },
    stats: { flights: 20, landings: 12, crashes: 8, distance: 123456, earned: 9999 },
    achievements: ['first', 'land1'],
    settings: { master: 0.5, controlMode: 'pilot', reduceMotion: true },
  });
  profile.contracts = { active: ['m04', 'm05', 'm06'], done: ['m01', 'm02', 'm03'], seed: 7 };
  return profile;
}

test('fresh(): the profile of ARCHITECTURE 3', () => {
  const profile = fresh();
  assert.equal(profile.v, 1);
  assert.deepEqual(Object.keys(profile.parts).sort(), Object.keys(PARTS).sort());
  assert.deepEqual(Object.keys(profile.buildings).sort(), Object.keys(BUILDINGS).sort());
  assert.deepEqual(profile.inventory, { chute: 0, repair: 0, canister: 0, magnet: 0 });
  assert.deepEqual(profile.skins, ['classic']);
  assert.deepEqual(profile.milestones, { maxAlt: 0, softLandings: 0, moonLanding: false, marsLanding: false });
  assert.deepEqual(Object.keys(profile.stats).sort(), ['airtime', 'bestStreak', 'crashes', 'distance', 'earned', 'flights', 'landings', 'mars', 'moon', 'near', 'perfect', 'pickups', 'parachutes', 'rings', 'saved', 'storm', 'streak'].sort());
  assert.deepEqual(profile.contracts, { active: [], done: [], seed: 1 });
  assert.equal(profile.settings.controlMode, 'arcade');
  assert.deepEqual(profile.settings.tutorial, { done: false, step: 0 });
  assert.deepEqual(validateProfile(profile), []);
  assert.notEqual(fresh(), fresh(), 'every call builds a new object');
});

test('validateProfile finds broken fields and normalizeProfile repairs them', () => {
  const broken = playedProfile();
  broken.parts.engine = 99;
  broken.coins = -5;
  broken.era = 9;
  broken.skin = 'ghost';
  broken.achievements.push('nonsense');
  assert.ok(validateProfile(broken).length >= 4);
  const { ok, profile, issues } = normalizeProfile(broken);
  assert.equal(ok, true);
  assert.ok(issues.length >= 4);
  assert.equal(profile.parts.engine, 18);
  assert.equal(profile.coins, 0);
  assert.equal(profile.era, 5);
  assert.equal(profile.skin, 'classic');
  assert.ok(!profile.achievements.includes('nonsense'));
  assert.deepEqual(validateProfile(profile), []);
  assert.equal(normalizeProfile('hello').ok, false);
  assert.equal(normalizeProfile({ coins: 1 }).ok, false);
});

test('save: serialize -> parse is a round trip', () => {
  const profile = playedProfile();
  const text = serialize(profile, { now: 1700000000000 });
  const parsed = parseSave(text);
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.profile, profile);
  assert.equal(parsed.migratedFrom, null);
  assert.equal(JSON.parse(text).format, 'vyshe-neba-save');
  assert.equal(JSON.parse(text).savedAt, 1700000000000);
  assert.deepEqual(importJson(exportJson(profile)).profile, profile);
});

test('save: a bare profile JSON is accepted too', () => {
  const profile = playedProfile();
  assert.deepEqual(parseSave(JSON.stringify(profile)).profile, profile);
});

test('save: damaged files never throw', () => {
  for (const text of ['', '{', 'null', '[]', '42', '"x"', '{"profile":{}}', JSON.stringify({ format: 'vyshe-neba-save', v: 1, profile: { coins: 'lots' } }), 'undefined']) {
    const result = parseSave(text);
    assert.equal(result.ok, false, JSON.stringify(text));
    assert.deepEqual(validateProfile(result.profile), [], 'a failed parse still hands back a usable fresh profile');
    assert.ok(result.issues.length > 0);
  }
});

test('migration: an older v:1 save without newer fields is filled with defaults', () => {
  const old = { v: 1, coins: 77, parts: { engine: 2 }, buildings: {}, era: 1 };
  const result = parseSave(JSON.stringify(old));
  assert.equal(result.ok, true);
  assert.equal(result.profile.coins, 77);
  assert.equal(result.profile.parts.engine, 2);
  assert.equal(result.profile.parts.tank, 0);
  assert.deepEqual(result.profile.settings.tutorial, { done: false, step: 0 });
  assert.deepEqual(result.profile.milestones, fresh().milestones);
  assert.deepEqual(validateProfile(result.profile), []);
});

test('migration: the removed parachute module is dropped without an error', () => {
  const old = { ...playedProfile(), parts: { ...playedProfile().parts, parachute: 7 } };
  const result = parseSave(JSON.stringify(old));
  assert.equal(result.ok, true);
  assert.equal('parachute' in result.profile.parts, false);
  assert.equal(Object.keys(result.profile.parts).length, 8);
  assert.deepEqual(result.profile.parts, playedProfile().parts, 'the other modules stay as they were');
  assert.equal(result.profile.coins, 1234, 'no refund: the coins stay as they were');
  assert.ok(result.issues.some((issue) => /Парашют/.test(issue)), 'the player is told why');
  assert.deepEqual(validateProfile(result.profile), []);
  // A save that never had the module raises no note, and a strict check flags a stray key.
  assert.deepEqual(parseSave(serialize(playedProfile())).issues, []);
  assert.ok(validateProfile(old).length > 0);
  const store = createSaveStore({ storage: createMemoryStorage({ 'vyshe-neba:save': JSON.stringify(old) }) });
  assert.equal(store.load().status, 'loaded');
});

test('migration: a newer version is refused, the table is ready for the next version', () => {
  const result = parseSave(JSON.stringify({ ...playedProfile(), v: 99 }));
  assert.equal(result.ok, false);
  assert.match(result.issues[0], /новой версии/);
  assert.deepEqual(MIGRATIONS, {}, 'no migrations are needed while the version is 1');
});

function legacySave(overrides = {}) {
  // The shape of outputs/rocket/dist/engine.js fresh() with some progress.
  return {
    v: 2,
    location: 'earth',
    equipment: { booster: true },
    coins: 1500,
    base: 3,
    upgrades: { fuel: 12, engine: 14, legs: 8, reserve: 5, hull: 9, magnet: 3, fins: 10, parachute: 6, booster: 4 },
    inventory: { chute: 2, repair: 1, boost: 3, magnet: 0 },
    skins: ['classic', 'wasp'],
    skin: 'wasp',
    settings: { muted: true, shake: false },
    stats: { flights: 60, landings: 40, crashes: 20, best: 0, distance: 250000, earned: 40000, rings: 80, pickups: 300, perfect: 12, streak: 2, bestStreak: 9, alt: 52000, airtime: 75, near: 30, modes: 21, parachutes: 4, saved: 900, moon: 6, storm: 3, cargo: 0 },
    achievements: ['first', 'land1', 'moon1', 'unknown-id'],
    missions: ['m01', 'm02', 'm07'],
    skippedMissions: ['m03'],
    mode: 0,
    ...overrides,
  };
}

test('legacy: the previous edition save is recognised and converted', () => {
  const old = legacySave();
  assert.equal(isLegacySave(old), true);
  assert.equal(isLegacySave(fresh()), false);
  const result = parseSave(JSON.stringify(old));
  assert.equal(result.ok, true);
  assert.equal(result.migratedFrom, 'legacy');
  const p = result.profile;
  assert.deepEqual(validateProfile(p), []);
  assert.equal(p.era, 3);
  assert.ok(p.coins >= 1500, 'refunds only add coins');
  assert.ok(p.parts.tank > 0 && p.parts.engine > 0 && p.parts.legs > 0);
  assert.ok(Object.values(p.parts).every((level) => level <= 3 * (p.era + 1)), 'modules respect the era cap');
  assert.equal(p.parts.capsule, 0);
  assert.equal(p.parts.avionics, 0);
  assert.equal('parachute' in p.parts, false, 'the old parachute upgrade has no counterpart');
  assert.equal(p.inventory.canister, 3, 'the old boost canister');
  assert.equal(p.skin, 'wasp');
  assert.deepEqual(p.skins, ['classic', 'wasp']);
  assert.equal(p.stats.flights, 60);
  assert.equal(p.stats.mars, 0);
  assert.equal(p.stats.moon, 6);
  assert.equal(p.milestones.maxAlt, 52000);
  assert.equal(p.milestones.moonLanding, true);
  assert.equal(p.milestones.marsLanding, false);
  assert.equal(p.milestones.softLandings, 40);
  assert.deepEqual(p.achievements, ['first', 'land1', 'moon1']);
  assert.deepEqual(p.contracts.done.sort(), ['m01', 'm02', 'm03', 'm07']);
  assert.equal(p.settings.master, 0);
  assert.equal(p.settings.reduceMotion, true);
  assert.ok(result.issues.some((i) => /старой версии/.test(i)));
});

test('legacy: the converted base satisfies every imported module and its power', () => {
  for (const base of [0, 1, 2, 3, 4, 5]) {
    const { profile } = importLegacySave(legacySave({ base, upgrades: { fuel: 20, engine: 20, legs: 12, reserve: 20, hull: 15, magnet: 15, fins: 18, parachute: 12, booster: 8 } }));
    for (const [id, level] of Object.entries(profile.parts)) {
      for (let l = 1; l <= level; l++) {
        for (const req of PARTS[id].levels[l - 1].requires) {
          if (req.building) assert.ok(profile.buildings[req.building] >= req.level, `era ${base}: ${id} ${l} needs ${req.building} ${req.level}`);
          if (req.era != null) assert.ok(profile.era >= req.era, `era ${base}: ${id} ${l} needs era ${req.era}`);
        }
      }
    }
    assert.equal(powerBalance(profile).ratio, 1, `era ${base} power`);
    assert.deepEqual(validateProfile(profile), [], `era ${base}`);
  }
});

test('legacy: engine upgrades of an era-0 garage are refunded, not lost', () => {
  const old = legacySave({ base: 0, coins: 100, upgrades: { fuel: 2, engine: 3, legs: 1, reserve: 0, hull: 3, magnet: 0, fins: 1, parachute: 0, booster: 0 } });
  const { profile } = importLegacySave(old);
  assert.equal(profile.parts.engine, 0, 'the new engine needs a factory, which starts in 1986');
  assert.ok(profile.coins > 100, 'the price of the removed levels comes back as coins');
});

test('storage: save and load through the memory adapter', () => {
  const storage = createMemoryStorage();
  const store = createSaveStore({ storage, now: () => 5 });
  assert.equal(store.load().status, 'empty');
  const profile = playedProfile();
  assert.deepEqual(store.save(profile), { ok: true });
  const loaded = store.load();
  assert.equal(loaded.status, 'loaded');
  assert.deepEqual(loaded.profile, profile);
  assert.equal(JSON.parse(storage.getItem(store.key)).savedAt, 5);
  assert.deepEqual(store.clear(), { ok: true });
  assert.equal(store.load().status, 'empty');
});

test('storage: corrupted data gives a fresh profile and keeps a backup of the broken text', () => {
  const storage = createMemoryStorage({ 'vyshe-neba:save': '{"v":1, oops' });
  const store = createSaveStore({ storage });
  const loaded = store.load();
  assert.equal(loaded.status, 'corrupt');
  assert.deepEqual(loaded.profile, fresh());
  assert.equal(storage.getItem('vyshe-neba:save:corrupt'), '{"v":1, oops');
});

test('storage: an old save in the store is migrated on load', () => {
  const storage = createMemoryStorage({ 'vyshe-neba:save': JSON.stringify(legacySave()) });
  const loaded = createSaveStore({ storage }).load();
  assert.equal(loaded.status, 'migrated');
  assert.equal(loaded.migratedFrom, 'legacy');
  assert.equal(loaded.profile.era, 3);
});

test('storage: failures are reported, never thrown', () => {
  const throwing = {
    getItem() { throw new Error('denied'); },
    setItem() { throw new DOMException('full', 'QuotaExceededError'); },
    removeItem() { throw new Error('denied'); },
  };
  const store = createSaveStore({ storage: throwing });
  assert.equal(store.load().status, 'unavailable');
  assert.deepEqual(store.save(fresh()), { ok: false, error: 'quota' });
  assert.equal(store.clear().ok, false);
  const none = createSaveStore({ storage: null });
  assert.equal(none.load().status, 'unavailable');
  assert.deepEqual(none.save(fresh()), { ok: false, error: 'unavailable' });
  // Without an injected storage the default lookup must not throw even where localStorage is missing.
  assert.doesNotThrow(() => createSaveStore().load());
});
