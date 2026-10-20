// Приложение: состояния hub → launch → flight → results → hub, цикл с фиксированным шагом симуляции,
// интеграция с rules / sim / render / audio, сохранение и команды для экранов.

import { createKit } from './kit.js';
import { ICON_NAMES } from './icons.js';
import { computeLayout, mergeLayouts, dockLayout, sheetRect } from './layout.js';
import { createSfx, reasonText } from './bridge.js';
import { sfxForEvent } from '../audio/names.js';
import { clamp } from './format.js';
import { t } from '../i18n/index.js';
import hub from './screens/hub.js';
import rocket from './screens/rocket.js';
import base from './screens/base.js';
import journal from './screens/journal.js';
import launch from './screens/launch.js';
import flight from './screens/flight-hud.js';
import results from './screens/results.js';
import settings from './screens/settings.js';
import { drawBlueprint } from './screens/common.js';
import { drawNewCard } from './screens/newcards.js';

export const DT = 1 / 120;
const MAX_FRAME = 0.1;
const MAX_STEPS = 24;
const END_DELAY = { landed: 1.5, crashed: 2.4, abandoned: 0.1 };

const SCREENS = { hub, rocket, base, journal, launch, flight, results, settings };
const PULSES = ['parachute', 'canister', 'repair', 'transfer', 'pause'];
// постройки, открывающие новую механику: при первой покупке показывается карточка «Новое»
const NEW_MECHANICS = ['gantry', 'weather', 'control', 'radar', 'observation', 'recovery', 'logistics'];

export function createApp({ canvas, mods, store, prefs, savePrefs, input, renderer, audio, profile }) {
  const ctx = canvas.getContext('2d', { alpha: false });
  const sfx = createSfx(() => app.audio);
  const kit = createKit({ sfx });

  const app = {
    canvas,
    ctx,
    mods,
    rules: mods.rules,
    sim: mods.sim,
    data: mods.data,
    store,
    prefs,
    input,
    renderer,
    audio,
    kit,
    sfx,
    profile,
    layout: null,
    time: 0,
    screen: 'hub',
    params: {},
    history: [],
    fade: 1,
    session: null,
    countdown: null,
    results: null,
    cards: [],
    dirty: false,
    saveTimer: 0,
    errors: [],
    standFrame: null,
    pendingSave: false,
    ui: {},
    stats: { sceneMs: 0, uiMs: 0 },
    iconNames: ICON_NAMES,
    hudTargets: {},
    hubSelected: null,
  };

  // ---------- размеры ----------

  app.resize = (w, h, dpr, safe) => {
    const base0 = computeLayout(w, h, dpr, safe);
    let rl = null;
    try {
      rl = renderer.layout ? renderer.layout(w, h, dpr, safe) : null;
    } catch (err) {
      console.warn('[app] renderer.layout:', err);
    }
    app.layoutInputs = { base0, rl };
    app.layout = mergeLayouts(base0, rl, { mirror: app.settings.touchLayout === 'left' });
    input.releaseAll();
  };

  Object.defineProperty(app, 'settings', { get: () => app.profile.settings });

  // сенсорные элементы: по настройке, а в режиме «авто» — когда замечено касание или экран сенсорный
  const coarse = () => {
    try {
      return !!globalThis.matchMedia?.('(pointer: coarse)').matches || (navigator.maxTouchPoints || 0) > 0;
    } catch {
      return false;
    }
  };
  Object.defineProperty(app, 'touchUi', {
    get() {
      const pref = app.prefs.touchControls;
      if (pref === 'on') return true;
      if (pref === 'off') return false;
      return input.touchSeen || coarse();
    },
  });

  app.relayout = () => {
    if (app.layoutInputs) app.layout = mergeLayouts(app.layoutInputs.base0, app.layoutInputs.rl, { mirror: app.settings.touchLayout === 'left' });
  };

  // ---------- навигация ----------

  app.go = (name, params = {}, { push = false } = {}) => {
    if (!SCREENS[name]) return;
    SCREENS[app.screen]?.leave?.(app);
    if (push) app.history.push({ name: app.screen, params: app.params });
    app.screen = name;
    app.params = params;
    app.fade = 1;
    SCREENS[name].enter?.(app, params);
    input.setMode(name === 'flight' ? 'flight' : 'ui');
    syncMusic();
  };

  app.back = () => {
    const prev = app.history.pop();
    sfx('back');
    if (prev) app.go(prev.name, prev.params);
    else app.go('hub');
  };

  function syncMusic() {
    try {
      // зона и интенсивность в полёте выводятся звуком из кадров audio.update
      const scene = app.screen === 'flight' ? 'flight' : app.screen === 'results' ? 'results' : 'hub';
      audio.music.set({ scene, zone: null, intensity: null });
    } catch {
      /* музыка необязательна */
    }
  }

  // ---------- профиль и сохранение ----------

  app.commit = (next, { immediate = true } = {}) => {
    app.profile = next;
    if (immediate) app.save();
    else app.dirty = true;
  };

  app.save = () => {
    app.dirty = false;
    app.store.save(app.profile);
  };

  app.setSetting = (key, value) => {
    const p = app.profile;
    app.commit({ ...p, settings: { ...p.settings, [key]: value } }, { immediate: false });
    applySettings();
    if (key === 'touchLayout') app.relayout();
  };

  app.toggleMute = () => {
    app.prefs.muted = !app.prefs.muted;
    savePrefs(app.prefs);
    applySettings();
  };

  function applySettings() {
    const s = app.settings;
    try {
      audio.setMuted(!!app.prefs.muted);
    } catch {
      /* аудио необязательно */
    }
    try {
      audio.setVolumes({ master: s.master, music: s.music, sfx: s.sfx });
    } catch {
      /* аудио необязательно */
    }
    input.setSettings({ controlMode: s.controlMode, sensitivity: s.sensitivity ?? 1 });
  }
  app.applySettings = applySettings;

  app.haptic = (pattern) => {
    if (app.settings.vibrate === false || app.settings.reduceMotion) return;
    try {
      navigator.vibrate?.(pattern);
    } catch {
      /* вибрация необязательна */
    }
  };

  app.toast = (msg, o) => kit.toast(msg, o);

  /** Заменить профиль целиком (импорт сохранения): состояние интерфейса сбрасывается. */
  app.replaceProfile = (p) => {
    let next = p;
    try {
      next = app.rules.refillContracts ? app.rules.refillContracts(p) : p;
    } catch {
      next = p;
    }
    app.commit(next);
    app.ui = {};
    app.history.length = 0;
    applySettings();
    app.relayout();
  };

  app.resetProgress = () => {
    const fresh = store.create();
    app.prefs.seen = {};
    savePrefs(app.prefs);
    app.replaceProfile({ ...fresh, settings: { ...app.settings, tutorial: { done: false, step: 0 } } });
    app.go('hub');
  };

  /** Прямоугольник цели интерфейса по id (для тестов): области кадра или геометрия полётных элементов. */
  app.target = (id) => kit.rectOf(id) || app.hudTargets[id] || null;

  // ---------- команды экранов ----------

  app.buyPart = (id) => {
    const res = app.rules.buyPart(app.profile, id);
    if (!res.ok) {
      sfx('deny');
      return res;
    }
    app.commit(res.profile);
    sfx('buy');
    app.haptic(12);
    return res;
  };

  app.buyBuilding = (key) => {
    const before = app.profile;
    const res = app.rules.buyBuilding(before, key);
    if (!res.ok) {
      sfx('deny');
      return res;
    }
    app.commit(res.profile);
    sfx(before.buildings[key] === 0 ? 'build-complete' : 'build');
    app.haptic([10, 30, 16]);
    if (before.buildings[key] === 0 && NEW_MECHANICS.includes(key)) queueCard(`building:${key}`);
    return res;
  };

  app.advanceEra = () => {
    const res = app.rules.advanceEra(app.profile);
    if (!res.ok) {
      sfx('deny');
      return res;
    }
    app.commit(res.profile);
    sfx('era');
    app.haptic([20, 40, 30]);
    queueCard(`era:${res.profile.era}`);
    return res;
  };

  app.buyConsumable = (id) => {
    const res = app.rules.buyConsumable(app.profile, id);
    if (res.ok) {
      app.commit(res.profile);
      sfx('buy');
    } else sfx('deny');
    return res;
  };

  app.buySkin = (id) => {
    const res = app.rules.buySkin(app.profile, id);
    if (res.ok) {
      app.commit(res.profile);
      sfx('buy');
    } else sfx('deny');
    return res;
  };

  app.selectSkin = (id) => {
    const res = app.rules.selectSkin(app.profile, id);
    if (res.ok) {
      app.commit(res.profile);
      sfx('press');
    }
    return res;
  };

  app.reasonText = reasonText;

  // карточки «Новое»
  function queueCard(id, force = false) {
    if ((!force && app.prefs.seen[id]) || app.cards.includes(id)) return;
    app.cards.push(id);
  }
  app.queueCard = queueCard;
  app.dismissCard = () => {
    const id = app.cards.shift();
    if (id) {
      app.prefs.seen[id] = 1;
      savePrefs(app.prefs);
    }
  };

  // ---------- запуск ----------

  /** Начать обратный отсчёт: сборка конфигурации — сразу, чтобы ошибки правил были видны до старта. */
  app.startLaunch = ({ destination = 'earth', consumables = {} } = {}) => {
    let config;
    try {
      config = app.rules.makeFlightConfig(app.profile, { destination, consumables, seed: app.fixedSeed ?? ((Math.random() * 1e9) | 0) });
    } catch (err) {
      console.error('[app] makeFlightConfig:', err);
      kit.toast(t('launch.error'), { kind: 'bad' });
      return false;
    }
    app.countdown = { t: 0, n: 3, config, destination, consumables };
    app.go('launch', { countdown: true });
    return true;
  };

  function tickCountdown(dt) {
    const c = app.countdown;
    if (!c) return;
    const step = 0.8;
    const prevN = c.n;
    c.t += dt;
    c.n = 3 - Math.floor(c.t / step);
    if (c.n !== prevN && c.n > 0) sfx('tick');
    if (c.t >= step * 3 + 0.35) {
      sfx('go');
      app.countdown = null;
      beginFlight(c.config, c);
    }
  }

  function beginFlight(config, c) {
    const state = app.sim.createFlight(config);
    app.session = {
      config,
      flight: state,
      acc: 0,
      phase: 'flying',
      endTimer: 0,
      paused: false,
      events: [],
      lastInput: null,
      destination: c.destination,
      consumables: c.consumables,
      startedAt: app.time,
      hint: null,
      hintUntil: 0,
      shake: 0,
      warn: {},
      cues: {},
      alarmUntil: 0,
      flash: 0,
      lowFuelShown: false,
    };
    input.resetFlight();
    app.go('flight');
    try {
      renderer.flight?.start?.(state, config);
    } catch (err) {
      console.warn('[app] renderer.flight.start:', err);
    }
  }

  const stripPulses = (inp) => {
    const out = { ...inp };
    for (const k of PULSES) out[k] = false;
    return out;
  };

  /** Выполнить n шагов симуляции с входом inp (или автопилота, если он включён). Возвращает события. */
  function simulate(s, n, inp) {
    const events = [];
    let cur = inp;
    for (let i = 0; i < n; i++) {
      if (s.autopilot) cur = s.autopilot.next(s.flight, DT);
      const ev = app.sim.step(s.flight, cur, DT) || [];
      for (const e of ev) events.push(e);
      cur = stripPulses(inp);
      const ph = s.flight.phase;
      if (ph === 'landed' || ph === 'crashed') s.phase = 'ending';
    }
    return events;
  }

  // визуальные дубли звуковых сигналов: подписи событий и красная пульсация по краям при тревоге
  const CUES = {
    'stage-sep': { key: 'cue.stageSep', icon: 'launch', kind: 'tip' },
    parachute: { key: 'cue.parachute', icon: 'chute', kind: 'good' },
    'fuel-empty': { key: 'cue.fuelEmpty', icon: 'fuel', kind: 'bad' },
    hit: { key: 'cue.hit', icon: 'warn', kind: 'bad', pri: 3 },
    'transfer-start': { key: 'cue.transferStart', icon: 'transfer', kind: 'good' },
    'transfer-done': { key: 'cue.transferDone', icon: 'transfer', kind: 'good' },
    touch: { key: 'cue.touch', icon: 'down', kind: 'tip' },
    storm: { key: 'cue.storm', icon: 'wind', kind: 'bad' },
  };
  function visualCue(s, e) {
    const cue = CUES[e.type];
    if (cue) s.cues[e.type] = { ...cue, text: t(cue.key), at: app.time };
    if (e.type === 'thrust-cut' && e.reason === 'fuel') s.cues['fuel-empty'] = { ...CUES['fuel-empty'], text: t('cue.fuelEmpty'), at: app.time };
    const alarm = e.type === 'low-fuel' || e.type === 'hit' || (e.type === 'warn' && (e.kind === 'hull' || e.kind === 'hazard' || e.kind === 'brake'));
    if (alarm) s.alarmUntil = app.time + (e.type === 'low-fuel' ? 2.4 : 1.2);
  }

  function handleFlightEvents(s, events) {
    if (!events.length) return;
    try {
      renderer.events?.(events, s.flight);
    } catch (err) {
      console.warn('[app] renderer.events:', err);
    }
    for (const e of events) {
      s.events.push(e);
      if (s.events.length > 40) s.events.shift();
      const cue = sfxForEvent(e);
      if (cue) sfx(cue.name, cue.params);
      if (e.type === 'touch') app.haptic(18);
      if (e.type === 'crashed') app.haptic([60, 40, 120]);
      if (e.type === 'landed') app.haptic([20, 30, 20]);
      if (e.type === 'hit') app.haptic(40);
      if (e.type === 'warn') s.warn[e.kind] = app.time;
      visualCue(s, e);
      if (e.type === 'low-fuel') s.warn.fuel = app.time;
      if (e.type === 'pickup' || e.type === 'ring') s.flash = 1;
    }
  }

  function audioFrame(s, dt) {
    const f = s.flight;
    const ceiling = 10000;
    const stage = f.stageIndex || 0;
    const maxFuel = f.maxFuel || 1;
    const frame = {
      throttle: f.throttle || 0,
      atmo: f.atmo ?? 1,
      alt01: clamp((f.alt || 0) / ceiling, 0, 1),
      speed01: clamp((f.speed || 0) / 60, 0, 1),
      stage,
      rcs: f.rcs || { left: 0, right: 0 },
      fuel01: clamp((f.fuel ?? 0) / maxFuel, 0, 1),
      danger01: clamp(1 - (f.hp ?? 1) / (f.maxHp || 1), 0, 1) * 0.6 + (s.warn.hazard && app.time - s.warn.hazard < 1.5 ? 0.4 : 0),
      storm: f.weather?.storm || 0,
      body: f.body || 'earth',
      phase: f.phase,
      paused: s.paused,
    };
    try {
      audio.update(dt, frame);
    } catch {
      /* аудио необязательно */
    }
  }

  const simulateIdle = () => ({ throttle: 0, tilt: 0, stabilize: false, boost: false, parachute: false, canister: false, repair: false, transfer: false, pause: false });

  function flightTick(dt) {
    const s = app.session;
    if (!s) return;
    let inp = input.poll(dt);
    // под автопилотом ввод игрока игнорируется, кроме паузы
    if (s.autopilot) inp = { ...simulateIdle(), pause: inp.pause };
    s.lastInput = inp;
    if (inp.pause && !s.paused && s.phase === 'flying') app.pause();
    if (s.paused) {
      audioFrame(s, dt);
      return;
    }
    // замедление в момент касания и аварии отдаёт рендер (fx.slowmo)
    const scale = renderer.flight?.timeScale ?? 1;
    if (s.phase === 'flying') {
      s.acc += Math.min(dt, MAX_FRAME) * scale;
      const n = Math.min(MAX_STEPS, Math.floor(s.acc / DT));
      s.acc -= n * DT;
      if (n > 0) handleFlightEvents(s, simulate(s, n, inp));
    } else if (s.phase === 'ending') {
      s.acc += Math.min(dt, MAX_FRAME) * scale;
      const n = Math.min(MAX_STEPS, Math.floor(s.acc / DT));
      s.acc -= n * DT;
      if (n > 0) handleFlightEvents(s, simulate(s, n, stripPulses(inp)));
      s.endTimer += dt;
      if (s.endTimer >= (END_DELAY[s.flight.phase] ?? 1.5)) app.finishFlight();
    }
    s.shake = Math.max(0, s.shake - dt * 3);
    s.flash = Math.max(0, s.flash - dt * 2.5);
    audioFrame(s, dt);
  }

  /** Для тестов и ускоренной перемотки: n шагов без отрисовки (с автопилотом, если он включён). */
  app.advanceFlight = (n) => {
    const s = app.session;
    if (!s || s.paused) return;
    const inp = input.poll(DT);
    if (s.phase === 'flying') handleFlightEvents(s, simulate(s, n, inp));
    else if (s.phase === 'ending') handleFlightEvents(s, simulate(s, n, stripPulses(inp)));
  };

  /**
   * Включает на текущем полёте драйвер ввода из sim.createAutopilot вместо клавиатуры и касаний:
   * { mission: 'hop'|'space'|'land', skill, targetAlt }. Работает до конца полёта; ввод игрока игнорируется.
   */
  app.autoplay = (o = {}) => {
    const s = app.session;
    if (!s || !app.sim.createAutopilot) return false;
    s.autopilot = app.sim.createAutopilot({ seed: s.config.seed, skill: o.skill ?? 1, mission: o.mission ?? 'hop', targetAlt: o.targetAlt });
    return true;
  };

  /** Крутит симуляцию без отрисовки до конца полёта или на seconds секунд игрового времени; возвращает краткое состояние. */
  app.fastForward = (seconds = Infinity) => {
    const s = app.session;
    if (!s) return null;
    if (!s.autopilot) app.autoplay({});
    const limit = s.flight.time + seconds;
    const idle = { throttle: 0, tilt: 0, stabilize: false, boost: false, parachute: false, canister: false, repair: false, transfer: false, pause: false };
    s.paused = false;
    while (!s.flight.ended && s.flight.time < limit && s.flight.time < 1500) handleFlightEvents(s, simulate(s, 120, idle));
    const f = s.flight;
    return { ended: f.ended, phase: f.phase, body: f.body, time: f.time, alt: f.alt, outcome: f.outcome, reason: f.reason };
  };

  app.pause = () => {
    const s = app.session;
    if (!s || s.paused) return;
    s.paused = true;
    input.setMode('ui');
    sfx('press');
  };

  app.resume = () => {
    const s = app.session;
    if (!s) return;
    s.paused = false;
    input.setMode('flight');
    input.resetFlight();
    sfx('press');
  };

  app.abandon = () => {
    const s = app.session;
    if (!s) return;
    s.abandoned = true;
    app.finishFlight();
  };

  app.finishFlight = () => {
    const s = app.session;
    if (!s || s.finished) return;
    s.finished = true;
    let result;
    try {
      result = app.sim.summarize(s.flight);
      if (s.abandoned && result.outcome !== 'landed' && result.outcome !== 'crashed') result = { ...result, outcome: 'abandoned' };
    } catch (err) {
      console.error('[app] summarize:', err);
      result = { outcome: 'abandoned', maxAlt: 0, distance: 0, time: 0, coinsPicked: 0, landing: { v: 0, h: 0, ang: 0 } };
    }
    const before = app.profile;
    let settled = { profile: before, report: {} };
    try {
      settled = app.rules.settleFlight(before, result, s.config) || settled;
    } catch (err) {
      console.error('[app] settleFlight:', err);
    }
    app.commit(settled.profile);
    if (!app.settings.tutorial?.done && (result.outcome === 'landed' || result.outcome === 'crashed')) app.setSetting('tutorial', { done: true, step: 99 });
    app.results = { result, report: settled.report || {}, before, after: settled.profile, config: s.config, destination: s.destination, consumables: s.consumables };
    app.session = null;
    app.go('results');
  };

  // ---------- кадр ----------

  function drawBackground(screen) {
    const L = app.layout;
    let bg = SCREENS[screen].background || 'hub';
    if (app.countdown) bg = 'hub';
    if (bg === 'flight' && app.session) {
      renderer.flight.draw(ctx, { flight: app.session.flight, config: app.session.config, time: app.time, layout: L, settings: app.settings });
    } else if (bg === 'blueprint') {
      drawBlueprint(ctx, L, app.time, app.profile.era);
    } else {
      try {
        renderer.hub.draw(ctx, { profile: app.profile, time: app.time, layout: L, selected: app.screen === 'hub' ? app.hubSelected : null });
      } catch (err) {
        drawBlueprint(ctx, L, app.time, app.profile.era);
        if (!app.hubErrored) {
          app.hubErrored = true;
          console.error('[app] renderer.hub.draw:', err);
        }
      }
      if (bg === 'hubdim') {
        ctx.fillStyle = 'rgba(5,8,16,0.82)';
        ctx.fillRect(0, 0, L.w, L.h);
      }
    }
  }

  /** В ландшафте с открытой карточкой постройки справа уведомления центрируются в свободной левой части. */
  function toastArea(L) {
    if (app.screen === 'hub' && app.hubSelected && !L.portrait && !app.countdown) {
      const sheet = sheetRect(L, { dock: true });
      return { x: L.area.x, y: L.area.y, w: Math.max(120, sheet.x - L.area.x), h: L.area.h };
    }
    return null;
  }

  /** Уведомления встают внизу по центру: над доком в хабе, над органами управления в полёте. */
  function toastBottom(L) {
    const safeBottom = L.area.y + L.area.h - L.gap * 1.5;
    if (app.screen === 'hub' && !app.countdown) return dockLayout(L).bar.y - L.gap;
    if (app.screen === 'flight') {
      const hud = L.hud;
      if (L.portrait) return Math.min(hud.lever.y, hud.buttons.transfer.y, hud.disc.cy - hud.disc.r) - L.gap * 2;
      return safeBottom - (app.touchUi ? 0 : Math.round(30 * L.ui));
    }
    return safeBottom;
  }

  app.frame = (dt, nowSec) => {
    const L = app.layout;
    if (!L) return;
    app.time = nowSec;
    dt = Math.min(dt, MAX_FRAME);
    ctx.setTransform(L.dpr, 0, 0, L.dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;

    L.hud.touchVisible = app.touchUi;
    kit.setToastBottom(toastBottom(L), toastArea(L));
    if (app.countdown) tickCountdown(dt);
    if (app.screen === 'flight') flightTick(dt);
    else if (app.standFrame) {
      /* экран ракеты сам озвучивает стенд через app.standFrame */
    }

    const events = input.drain(dt);
    kit.begin(ctx, { L, settings: app.settings, time: app.time, dt, events });
    try {
      const t0 = performance.now();
      drawBackground(app.screen);
      const t1 = performance.now();
      const screen = SCREENS[app.screen];
      if (app.countdown) drawCountdown();
      else screen.draw(app, kit, L, dt);
      const t2 = performance.now();
      // скользящее среднее: сцена (рендер) и интерфейс по отдельности
      app.stats.sceneMs += (t1 - t0 - app.stats.sceneMs) * 0.05;
      app.stats.uiMs += (t2 - t1 - app.stats.uiMs) * 0.05;
      if (!app.countdown && app.cards.length && app.screen !== 'flight') {
        if (drawNewCard(app, kit, app.cards[0])) app.dismissCard();
      }
      if (kit.back && !kit.modalOpen && !app.countdown && !app.cards.length) {
        if (screen.onBack?.(app) !== true && app.screen !== 'hub' && app.screen !== 'flight') app.back();
      }
    } catch (err) {
      if (app.errors.length < 20) app.errors.push(String(err?.stack || err));
      console.error('[app] draw:', err);
    }
    drawFade(dt);
    kit.end();
    canvas.style.cursor = kit.cursor;

    if (!app.session && app.screen !== 'flight') {
      try {
        audio.update(dt, { throttle: app.standFrame?.throttle || 0, atmo: 1, alt01: 0, speed01: 0, stage: 0, rcs: { left: 0, right: 0 }, fuel01: 1, danger01: 0, body: 'earth', phase: app.standFrame ? 'pad' : 'hub', paused: false });
      } catch {
        /* аудио необязательно */
      }
    }
    if (app.dirty) {
      app.saveTimer += dt;
      if (app.saveTimer > 0.6) {
        app.saveTimer = 0;
        app.save();
      }
    }
  };

  function drawFade(dt) {
    if (app.fade <= 0) return;
    app.fade = app.settings.reduceMotion ? 0 : Math.max(0, app.fade - dt / 0.18);
    if (app.fade <= 0) return;
    ctx.fillStyle = `rgba(4,7,14,${app.fade * 0.85})`;
    ctx.fillRect(0, 0, app.layout.w, app.layout.h);
  }

  function drawCountdown() {
    const L = app.layout;
    const c = app.countdown;
    const label = c.n > 0 ? String(c.n) : t('launch.go');
    const k = (c.t % 0.8) / 0.8;
    const size = Math.round(Math.min(L.w, L.h) * (0.22 + 0.06 * (1 - k)));
    ctx.globalAlpha = 1 - k * 0.6;
    kit.drawText(label, L.w / 2, L.h * 0.38, { size, color: c.n > 0 ? kit.c.amber : kit.c.green, align: 'center', weight: 900, shadow: 'rgba(0,0,0,0.7)', outline: 'rgba(0,0,0,0.5)', dynamic: true });
    ctx.globalAlpha = 1;
    kit.drawText(t('launch.countdown'), L.w / 2, L.h * 0.38 + size * 0.75, { size: kit.fs(16), color: kit.c.text, align: 'center', shadow: 'rgba(0,0,0,0.8)' });
    const r = { x: L.w / 2 - L.touch(70), y: L.h - L.area.y - L.touch(64) - L.gap, w: L.touch(140), h: L.touch(48) };
    if (kit.button('countdown-cancel', r, { label: t('common.cancel'), variant: 'btn' })) {
      app.countdown = null;
      app.go('launch', {});
    }
  }

  // ---------- видимость вкладки ----------

  app.onHidden = () => {
    input.releaseAll();
    if (app.session && app.session.phase === 'flying') app.pause();
    try {
      audio.suspend();
    } catch {
      /* аудио необязательно */
    }
    app.save();
  };

  app.onVisible = () => {
    try {
      audio.resume();
    } catch {
      /* аудио необязательно */
    }
  };

  app.start = () => {
    applySettings();
    SCREENS.hub.enter?.(app, {});
    input.setMode('ui');
    syncMusic();
  };

  return app;
}

export { SCREENS };
