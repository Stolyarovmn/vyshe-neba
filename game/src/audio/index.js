// Public entry point of the procedural audio engine (see ARCHITECTURE section 7).
//
//   const audio = createAudio();
//   audio.unlock();                     // first user gesture (also wired automatically)
//   audio.update(dt, frame);            // every game frame
//   audio.sfx('coin');                  // one-shot effects
//   audio.music.set({ scene: 'flight' });

import { analyze, encodeWav } from './analyze.js';
import { createCore } from './core.js';
import { SFX_NAMES, ZONES, SCENES, sfxForEvent } from './names.js';
import { renderOffline } from './offline.js';

const GESTURES = ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown'];
const KEEP_ALIVE_MS = 90;
const MAX_QUEUED_SFX = 4;

export function createAudio(options = {}) {
  const seed = options.seed ?? 1;
  const ContextClass = options.AudioContext ?? globalThis.AudioContext ?? globalThis.webkitAudioContext ?? null;
  const doc = globalThis.document ?? null;

  let ctx = null;
  let core = null;
  let userSuspended = false;
  let hidden = false;
  let unlocking = null;
  let keepAlive = null;
  let lastUpdateAt = -1;
  let queuedSfx = [];
  let volumes = { master: 0.8, music: 0.6, sfx: 0.9 };
  let muted = false;
  let musicState = {};
  const listeners = [];

  const running = () => Boolean(core) && ctx.state === 'running';

  // ---- lifecycle ----

  function build() {
    ctx = options.context ?? new ContextClass({ latencyHint: 'interactive' });
    core = createCore({ ctx, seed, volumes, muted });
    core.music.set(musicState);
    ctx.addEventListener?.('statechange', () => {
      if (ctx.state === 'running') startKeepAlive();
    });
  }

  function unlock() {
    if (unlocking) return unlocking;
    if (!core) {
      if (!ContextClass && !options.context) return Promise.resolve(false);
      try {
        build();
      } catch {
        return Promise.resolve(false);
      }
    }
    unlocking = Promise.resolve(userSuspended || hidden ? null : ctx.resume())
      .catch(() => {})
      .then(() => {
        unlocking = null;
        if (running()) {
          flushQueue();
          startKeepAlive();
          removeGestureListeners();
        }
        return running();
      });
    return unlocking;
  }

  function suspend() {
    userSuspended = true;
    stopKeepAlive();
    return core ? ctx.suspend().catch(() => {}) : Promise.resolve();
  }

  function resume() {
    userSuspended = false;
    if (!core || hidden) return Promise.resolve();
    return Promise.resolve(ctx.resume()).then(startKeepAlive).catch(() => {});
  }

  function onVisibility() {
    hidden = Boolean(doc?.hidden);
    if (!core) return;
    if (hidden) {
      stopKeepAlive();
      ctx.suspend().catch(() => {});
    } else if (!userSuspended) {
      Promise.resolve(ctx.resume()).then(startKeepAlive).catch(() => {});
    }
  }

  function addGestureListeners() {
    if (options.autoUnlock === false || !globalThis.addEventListener) return;
    const handler = () => {
      unlock();
    };
    for (const type of GESTURES) {
      globalThis.addEventListener(type, handler, { capture: true, passive: true });
      listeners.push([globalThis, type, handler]);
    }
    if (doc && options.autoSuspend !== false) {
      doc.addEventListener('visibilitychange', onVisibility);
      listeners.push([doc, 'visibilitychange', onVisibility]);
    }
  }

  function removeGestureListeners() {
    for (let i = listeners.length - 1; i >= 0; i--) {
      const [target, type, handler] = listeners[i];
      if (type === 'visibilitychange') continue;
      target.removeEventListener(type, handler, { capture: true });
      listeners.splice(i, 1);
    }
  }

  // Refills the music look-ahead when the game is not calling update() (menus).
  function startKeepAlive() {
    if (keepAlive !== null || !core) return;
    const loop = () => {
      keepAlive = null;
      if (!running()) return;
      if (ctx.currentTime - lastUpdateAt > 0.12) core.tick();
      keepAlive = setTimeout(loop, KEEP_ALIVE_MS);
      keepAlive.unref?.();
    };
    keepAlive = setTimeout(loop, KEEP_ALIVE_MS);
    keepAlive.unref?.();
  }

  function stopKeepAlive() {
    if (keepAlive !== null) clearTimeout(keepAlive);
    keepAlive = null;
  }

  function flushQueue() {
    const list = queuedSfx;
    queuedSfx = [];
    for (const [name, params] of list) core.sfx(name, params);
  }

  // ---- public API ----

  function update(dt, frame) {
    if (!running()) return;
    lastUpdateAt = ctx.currentTime;
    core.update(Number.isFinite(dt) && dt > 0 ? Math.min(dt, 0.25) : 1 / 60, frame);
  }

  function sfx(name, params) {
    if (muted) return false;
    if (running()) return core.sfx(name, params);
    if (unlocking && queuedSfx.length < MAX_QUEUED_SFX) queuedSfx.push([name, params]);
    return false;
  }

  function setVolumes(next) {
    volumes = { ...volumes, ...next };
    core?.setVolumes(volumes);
  }

  function setMuted(value) {
    muted = Boolean(value);
    core?.setMuted(muted);
  }

  const music = {
    set(partial) {
      musicState = { ...musicState, ...partial };
      core?.music.set(partial);
    },
    get: () => ({ ...musicState }),
  };

  function dispose() {
    stopKeepAlive();
    for (const [target, type, handler] of listeners) target.removeEventListener(type, handler, { capture: true });
    listeners.length = 0;
    core?.dispose();
    core = null;
    if (ctx && !options.context) ctx.close?.().catch(() => {});
    ctx = null;
  }

  addGestureListeners();

  return {
    unlock,
    suspend,
    resume,
    update,
    sfx,
    // Plays the sound that belongs to a simulation event, if there is one.
    event(ev) {
      const mapped = sfxForEvent(ev);
      return mapped ? sfx(mapped.name, mapped.params) : false;
    },
    events(list) {
      for (const ev of list ?? []) this.event(ev);
    },
    music,
    setVolumes,
    getVolumes: () => ({ ...volumes }),
    setMuted,
    isMuted: () => muted,
    renderOffline: (opts) => renderOffline({ seed, ...opts }),
    dispose,
    get state() {
      return ctx ? ctx.state : 'none';
    },
    get analyser() {
      return core?.graph.getAnalyser() ?? null;
    },
    get stats() {
      return core ? core.stats() : null;
    },
  };
}

export { SFX_NAMES, ZONES, SCENES, analyze, encodeWav, renderOffline, sfxForEvent };
