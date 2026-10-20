// Связка с соседними модулями (статические импорты: сборка esbuild в IIFE) и мелкие адаптеры.
// Контракт: game/docs/ARCHITECTURE.md. Заглушки лежат только в ui/dev/ и подставляются
// лишь там, где настоящая реализация не отдала нужный кусок (например, render.flight, пока рендер дописывается).

import * as data from '../data/index.js';
import * as rules from '../rules/index.js';
import * as state from '../state/index.js';
import * as sim from '../sim/index.js';
import * as audioMod from '../audio/index.js';
import * as renderMod from '../render/index.js';
import { createNullAudio, createStubRenderer } from './dev/stubs.js';

export function getModules() {
  return { data, rules, sim, state, audioMod, renderMod };
}

export function createAudioSafe() {
  try {
    return audioMod.createAudio();
  } catch (err) {
    console.warn('[bridge] аудио не создалось:', err);
    return createNullAudio();
  }
}

const noop = () => {};

/**
 * Рендер: настоящий, дополненный недостающими частями заглушки (flight / events), пока их нет.
 * Возвращает { renderer, missing } — missing перечисляет подставленное.
 */
export async function createRendererSafe(canvas) {
  const stub = createStubRenderer();
  let real = null;
  try {
    const assets = await renderMod.loadAssets(renderMod.manifest);
    real = renderMod.createRenderer(canvas, assets);
  } catch (err) {
    console.warn('[bridge] рендер не создался:', err);
  }
  if (!real) return { renderer: stub, missing: ['all'] };
  const missing = [];
  const pick = (name, fallback) => {
    if (real[name]) return real[name];
    missing.push(name);
    return fallback;
  };
  const renderer = {
    canvas,
    real,
    layout: pick('layout', stub.layout),
    hub: pick('hub', stub.hub),
    flight: pick('flight', stub.flight),
    events: pick('events', noop),
  };
  return { renderer, missing };
}

// ---------- имена звуков интерфейса ----------

const SFX_ALIASES = {
  hover: 'ui-hover',
  press: 'ui-press',
  deny: 'ui-deny',
  back: 'ui-back',
  tab: 'ui-press',
  buy: 'purchase',
  era: 'era-up',
  tick: 'countdown-tick',
  go: 'countdown-go',
};

/** Звук интерфейса по логическому имени; ошибки звука никогда не ломают игру. */
export function createSfx(getAudio) {
  return (name, params) => {
    try {
      getAudio().sfx(SFX_ALIASES[name] || name, params);
    } catch {
      /* звук необязателен */
    }
  };
}

// ---------- сохранение ----------

const PREFS_KEY = 'vyshe-neba:ui';

function storage() {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}

/** Хранилище профиля поверх state/: createSaveStore (localStorage), экспорт и импорт текста. */
export function createStore() {
  const native = state.createSaveStore();
  return {
    create: state.fresh,
    load: () => native.load(),
    save: (profile) => native.save(profile).ok,
    exportText: (profile) => native.exportJson(profile),
    /** { ok, profile, issues } — нормализовано и мигрировано state/ (принимает и сохранение старой редакции). */
    importText: (text) => native.importJson(text),
    clear: () => native.clear(),
  };
}

// ---------- настройки интерфейса (не часть профиля) ----------

const DEFAULT_PREFS = { seen: {}, touchControls: 'auto', muted: false, sensitivity: 1 };

export function loadPrefs() {
  try {
    const raw = storage()?.getItem(PREFS_KEY);
    return { ...DEFAULT_PREFS, seen: {}, ...(raw ? JSON.parse(raw) : null) };
  } catch {
    return { ...DEFAULT_PREFS, seen: {} };
  }
}

export function savePrefs(prefs) {
  try {
    storage()?.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* хранилище может быть недоступно */
  }
}

// ---------- лавка и раскраски ----------

/** Товары лавки из data.SHOP: { id, name, desc, price }. */
export function shopItems(mods) {
  return (mods.data.SHOP || []).map((it) => ({ id: it.id, name: it.name, desc: it.desc, price: it.price }));
}

export function skinItems(mods) {
  return (mods.data.SKINS || []).map((it) => ({ id: it.id, name: it.name, color: it.color, price: it.price }));
}

/** Тексты причин: строки или объекты { text }. */
export const reasonText = (r) => (typeof r === 'string' ? r : r?.text || '');
