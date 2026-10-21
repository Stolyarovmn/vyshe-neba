// Saving and loading. Everything that touches storage is wrapped in try/catch and takes an injectable
// storage object (getItem/setItem/removeItem), so tests never need a browser.
//
// File format: { format: 'vyshe-neba-save', v: 1, savedAt, profile }. A bare Profile and the previous
// edition's save are accepted on import as well.

import { fresh, normalizeProfile, PROFILE_VERSION } from './profile.js';
import { importLegacySave, isLegacySave } from './legacy.js';

export const SAVE_FORMAT = 'vyshe-neba-save';
export const SAVE_KEY = 'vyshe-neba:save';

// Migrations from an older profile version to the next one: { [fromVersion]: (profile) => profile }.
// The current version is 1, so the table is empty; a bump adds one entry and the loop below applies it.
export const MIGRATIONS = {};

// Modules that were removed from Profile.parts without a version bump. The parachute is now a shop
// consumable (inventory.chute). Old saves load without error: normalizeProfile ignores unknown part keys.
// The coins once spent on the module are NOT refunded: the game is not released yet, and a partial refund
// would need the old price table. migrate() only leaves a note in `issues`.
const REMOVED_PARTS = { parachute: 'Модуль «Парашют» убран: теперь парашют — расходник из лавки' };

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

export function serialize(profile, { now = null } = {}) {
  return JSON.stringify({ format: SAVE_FORMAT, v: profile.v, savedAt: now, profile });
}

function unwrap(raw) {
  if (isObject(raw) && raw.format === SAVE_FORMAT && isObject(raw.profile)) return raw.profile;
  return raw;
}

// Brings any accepted shape to the current profile version.
export function migrate(raw) {
  const body = unwrap(raw);
  if (isLegacySave(body)) {
    const imported = importLegacySave(body);
    return { ok: true, profile: imported.profile, issues: imported.issues, migratedFrom: 'legacy' };
  }
  if (!isObject(body)) return { ok: false, profile: fresh(), issues: ['Это не сохранение игры'], migratedFrom: null };

  let version = Number.isInteger(body.v) ? body.v : 1;
  if (version > PROFILE_VERSION) {
    return { ok: false, profile: fresh(), issues: ['Сохранение сделано в более новой версии игры'], migratedFrom: null };
  }
  const startVersion = version;
  let current = body;
  while (version < PROFILE_VERSION) {
    const step = MIGRATIONS[version];
    if (!step) return { ok: false, profile: fresh(), issues: [`Нет миграции с версии ${version}`], migratedFrom: null };
    current = step(current);
    version += 1;
  }
  const normalized = normalizeProfile({ ...current, v: PROFILE_VERSION });
  if (normalized.ok && isObject(current.parts)) {
    for (const [id, note] of Object.entries(REMOVED_PARTS)) {
      if (Number(current.parts[id]) > 0) normalized.issues.push(note);
    }
  }
  return { ...normalized, migratedFrom: startVersion < PROFILE_VERSION ? startVersion : null };
}

// Text -> profile. Never throws.
export function parseSave(text) {
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, profile: fresh(), issues: ['Файл повреждён: это не JSON'], migratedFrom: null };
  }
  return migrate(raw);
}

export function exportJson(profile, options) {
  return `${serialize(profile, options)}\n`;
}

export function importJson(text) {
  return parseSave(text);
}

export function createMemoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => { map.set(key, String(value)); },
    removeItem: (key) => { map.delete(key); },
    dump: () => Object.fromEntries(map),
  };
}

function defaultStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null; // access itself can throw in private windows
  }
}

export function createSaveStore({ storage = defaultStorage(), key = SAVE_KEY, now = () => null } = {}) {
  const corruptKey = `${key}:corrupt`;

  function load() {
    if (!storage) return { status: 'unavailable', profile: fresh(), issues: ['Хранилище недоступно'] };
    let text;
    try {
      text = storage.getItem(key);
    } catch {
      return { status: 'unavailable', profile: fresh(), issues: ['Хранилище недоступно'] };
    }
    if (text == null) return { status: 'empty', profile: fresh(), issues: [] };
    const parsed = parseSave(text);
    if (!parsed.ok) {
      try {
        storage.setItem(corruptKey, text); // keep the broken data so nothing is lost for good
      } catch { /* the backup is best effort */ }
      return { status: 'corrupt', profile: fresh(), issues: parsed.issues };
    }
    return { status: parsed.migratedFrom != null ? 'migrated' : 'loaded', profile: parsed.profile, issues: parsed.issues, migratedFrom: parsed.migratedFrom };
  }

  function save(profile) {
    if (!storage) return { ok: false, error: 'unavailable' };
    try {
      storage.setItem(key, serialize(profile, { now: now() }));
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error?.name === 'QuotaExceededError' ? 'quota' : 'write-failed' };
    }
  }

  function clear() {
    if (!storage) return { ok: false, error: 'unavailable' };
    try {
      storage.removeItem(key);
      return { ok: true };
    } catch {
      return { ok: false, error: 'write-failed' };
    }
  }

  return { load, save, clear, exportJson, importJson, key };
}
