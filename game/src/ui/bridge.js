// Связка с чужими модулями: динамическая загрузка (с заглушками при отсутствии), адаптеры имён и сохранение.
// Контракт: game/docs/ARCHITECTURE.md. Всё, чего в контракте нет, помечено «адаптер» и подменяемо.

import { stubData, stubRules, stubSim, createStubProfile, createNullAudio, createStubRenderer } from './dev/stubs.js';

async function tryImport(loader) {
  try {
    return await loader();
  } catch (err) {
    if (!/Failed to fetch|Cannot find|Failed to resolve|error loading|404|Unexpected token|not found/i.test(String(err?.message || err))) {
      console.warn('[bridge] модуль не загрузился:', err);
    }
    return null;
  }
}

/** Загружает настоящие модули, где они есть; остальное подменяется заглушками. flags — что реальное. */
export async function loadModules() {
  const [data, rules, state, sim, audio, render] = await Promise.all([
    tryImport(() => import('../data/index.js')),
    tryImport(() => import('../rules/index.js')),
    tryImport(() => import('../state/index.js')),
    tryImport(() => import('../sim/index.js')),
    tryImport(() => import('../audio/index.js')),
    tryImport(() => import('../render/index.js')),
  ]);
  const realRules = rules && typeof rules.getPartState === 'function' ? rules : null;
  const realSim = sim && typeof sim.createFlight === 'function' ? sim : null;
  return {
    data: data && data.PARTS ? data : stubData,
    rules: realRules || stubRules,
    sim: realSim || stubSim,
    state: state || null,
    audioMod: audio && typeof audio.createAudio === 'function' ? audio : null,
    renderMod: render && typeof render.createRenderer === 'function' ? render : null,
    flags: {
      data: !!(data && data.PARTS),
      rules: !!realRules,
      sim: !!realSim,
      state: !!state,
      audio: !!(audio && audio.createAudio),
      render: !!(render && render.createRenderer),
    },
  };
}

export async function createAudioSafe(mods) {
  try {
    if (mods.audioMod) return mods.audioMod.createAudio();
  } catch (err) {
    console.warn('[bridge] аудио не создалось:', err);
  }
  return createNullAudio();
}

export async function createRendererSafe(mods, canvas) {
  if (mods.renderMod) {
    try {
      let assets = null;
      try {
        const manifest = await import('../render/manifest.js');
        const loader = mods.renderMod.loadAssets || (await import('../render/assets.js')).loadAssets;
        assets = await loader(manifest.default || manifest.MANIFEST || manifest);
      } catch (err) {
        console.warn('[bridge] ассеты не загрузились:', err);
      }
      return mods.renderMod.createRenderer(canvas, assets);
    } catch (err) {
      console.warn('[bridge] рендер не создался:', err);
    }
  }
  return createStubRenderer();
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
export function createStore(stateMod) {
  const native = stateMod?.createSaveStore ? stateMod.createSaveStore() : null;
  const fresh = stateMod?.fresh || createStubProfile;

  function load() {
    if (native) {
      const res = native.load();
      return { profile: res.profile, status: res.status, issues: res.issues || [] };
    }
    try {
      const raw = storage()?.getItem('vyshe-neba:stub-save');
      if (raw) return { profile: JSON.parse(raw), status: 'loaded', issues: [] };
    } catch {
      /* повреждённое сохранение игнорируем */
    }
    return { profile: fresh(), status: 'empty', issues: [] };
  }

  function save(profile) {
    if (native) return native.save(profile).ok;
    try {
      storage()?.setItem('vyshe-neba:stub-save', JSON.stringify(profile));
      return true;
    } catch {
      return false;
    }
  }

  const exportText = (profile) => (native ? native.exportJson(profile) : JSON.stringify(profile));

  /** { ok, profile, issues } — профиль нормализован state/ или принят как есть. */
  function importText(text) {
    if (native) return native.importJson(text);
    try {
      return { ok: true, profile: JSON.parse(text), issues: [] };
    } catch {
      return { ok: false, profile: null, issues: ['Файл повреждён'] };
    }
  }

  return { create: fresh, load, save, exportText, importText, native: !!native };
}

// ---------- настройки интерфейса (не часть профиля) ----------

export function loadPrefs() {
  try {
    const raw = storage()?.getItem(PREFS_KEY);
    return { seen: {}, touchControls: 'auto', ...(raw ? JSON.parse(raw) : null) };
  } catch {
    return { seen: {}, touchControls: 'auto' };
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
  return (mods.data.SHOP || []).map((it) => ({ id: it.id, name: it.name, desc: it.desc, price: it.price ?? it.cost ?? 0 }));
}

export function skinItems(mods) {
  return (mods.data.SKINS || []).map((it) => ({ id: it.id, name: it.name, color: it.color, price: it.price ?? it.cost ?? 0 }));
}

/** Тексты причин: строки или объекты { text }. */
export const reasonText = (r) => (typeof r === 'string' ? r : r?.text || '');
