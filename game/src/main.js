// Вход приложения «Выше неба»: холст, загрузка профиля, цикл кадров, размеры и безопасные зоны,
// пауза при скрытии вкладки и тестовый хук globalThis.__VN_TEST__. Логика состояний — в ui/app.js.

import { createApp } from './ui/app.js';
import { createInput } from './input/index.js';
import { createAudioSafe, createRendererSafe, createStore, getModules, loadPrefs, savePrefs } from './ui/bridge.js';
import { t } from './i18n/index.js';

const errors = [];
const recordError = (e) => {
  if (errors.length < 50) errors.push(String(e?.stack || e?.message || e));
};
window.addEventListener('error', (e) => recordError(e.error || e.message));
window.addEventListener('unhandledrejection', (e) => recordError(e.reason));

/** Безопасные отступы (чёлка, жесты) через env(safe-area-inset-*): читаются с невидимого элемента. */
function createSafeProbe() {
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;'
    + 'padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)';
  document.body.appendChild(el);
  return () => {
    const cs = getComputedStyle(el);
    return {
      t: parseFloat(cs.paddingTop) || 0,
      r: parseFloat(cs.paddingRight) || 0,
      b: parseFloat(cs.paddingBottom) || 0,
      l: parseFloat(cs.paddingLeft) || 0,
    };
  };
}

function viewportSize() {
  const vv = window.visualViewport;
  return { w: Math.max(1, Math.round(vv?.width || window.innerWidth)), h: Math.max(1, Math.round(vv?.height || window.innerHeight)) };
}

async function boot() {
  const canvas = document.getElementById('game');
  const mods = getModules();
  const store = createStore();
  const loaded = store.load();
  let profile = loaded.profile;
  try {
    profile = mods.rules.refillContracts(profile);
  } catch (err) {
    recordError(err);
  }
  const prefs = loadPrefs();
  const audio = createAudioSafe();
  const { renderer, missing } = await createRendererSafe(canvas);
  if (missing.length) console.info('[main] рендер дополнен заглушкой:', missing.join(', '));

  let app = null;
  const input = createInput(canvas, () => app?.layout);
  app = createApp({ canvas, mods, store, prefs, savePrefs, input, renderer, audio, profile });
  if (loaded.status === 'corrupt') app.kit.toast(t('save.corrupt'), { kind: 'bad' });

  const safeInsets = createSafeProbe();
  let lastKey = '';
  function resize() {
    const { w, h } = viewportSize();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const safe = safeInsets();
    const key = `${w}x${h}@${dpr}|${safe.t},${safe.r},${safe.b},${safe.l}`;
    if (key === lastKey) return;
    lastKey = key;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    app.resize(w, h, dpr, safe);
  }
  resize();
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 120));
  window.visualViewport?.addEventListener('resize', resize);

  document.addEventListener('visibilitychange', () => (document.hidden ? app.onHidden() : app.onVisible()));
  window.addEventListener('pagehide', () => app.save());

  app.start();

  let last = performance.now();
  function tick(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    try {
      app.frame(dt, now / 1000);
    } catch (err) {
      recordError(err);
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  installTestHook(app);
  globalThis.__VN_APP__ = app;
}

/** Тестовый хук: включён всегда (см. game/test/browser.cjs). */
function installTestHook(app) {
  globalThis.__VN_TEST__ = {
    screen: () => app.screen,
    target: (id) => app.target(id),
    profile: () => structuredClone(app.profile),
    setProfile: (p) => app.commit(p),
    flight: () => app.session?.flight ?? null,
    get errors() {
      return [...errors, ...app.errors];
    },
    step: (n = 1) => app.advanceFlight(n),
    seed: (n) => {
      app.fixedSeed = n;
    },
    app,
  };
}

boot().catch((err) => {
  recordError(err);
  console.error(err);
  globalThis.__VN_TEST__ = globalThis.__VN_TEST__ || { screen: () => 'error', target: () => null, profile: () => null, setProfile() {}, flight: () => null, errors, step() {}, seed() {} };
});
