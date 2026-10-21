// Космодром: HD-карта острова (вид сверху-3/4), постройки на своих площадках (только купленные),
// ракета на пусковом столе, облака с тенями, самолёты и дроны, погода. Панорама и зум пальцем/мышью,
// тап по постройке, подсветка выбора.

import { createMapView, drawIslandHd, drawSea } from './islandmap.js';
import { ensureWorld } from './layout.js';
import {
  BUILDING_ANCHORS, ENTRY_KEYS, ISLAND, WORLD_ENTRIES, eraYear, spriteName,
} from './manifest.js';
import { buildingSize, drawPlacedBuildings, islandToWorld } from './buildings.js';
import { drawEntry, drawEntryHint, entrySize, entryWorld } from './entries.js';
import { BUILD_DURATION, createHubFx, drawScaffold } from './hubfx.js';
import {
  dayOverlay, daylightAt, drawBirds, drawFoam, drawGlow, drawHeadlights, drawVehicles, lightsAt, shorePoints,
} from './life.js';
import { MOUNT_RADIUS, drawLaunchMount } from './launchpad.js';
import { createRocketPose, drawRocket, stackHeight } from './rocket.js';
import { drawAircraft, drawDrone } from './traffic.js';
import { drawRain } from './sky.js';
import { clamp, damp, hash2, smoothstep } from './util.js';
import { weatherMood } from './weather.js';

const MIN_TOUCH_CSS = 48;
const VIEW_RATE = 7;
const MAX_ZOOM_WIDTH = 150; // самый крупный план: столько единиц по ширине экрана
const DEFAULT_VIEW = {
  // стартовый вид показывает площадку и все четыре объекта-входа (они стоят от -150 до +165 ед. по X, до -180 по Y)
  portrait: { visibleWidth: 340, cx: 12, cy: -40 },
  landscape: { visibleWidth: 780, cx: 230, cy: -50 },
};
const CAPSULE_CART = { x: -42, y: 34 };

/** Масштаб «остров целиком» (пикселей устройства на единицу). */
export function fitScale(devW, devH) {
  return Math.min((devW * 0.98) / ISLAND.widthUnits, (devH * 0.88) / ISLAND.heightUnits);
}

/** Допустимый центр вида: остров всегда остаётся в кадре. */
export function clampCenter(cx, cy, s, devW, devH) {
  const visW = devW / s;
  const visH = devH / s;
  const midX = ISLAND.leftUnits + ISLAND.widthUnits / 2;
  const midY = ISLAND.topUnits + ISLAND.heightUnits / 2;
  const x = visW >= ISLAND.widthUnits * 0.92
    ? midX
    : clamp(cx, ISLAND.leftUnits + visW * 0.35, ISLAND.leftUnits + ISLAND.widthUnits - visW * 0.35);
  const y = visH >= ISLAND.heightUnits * 0.9
    ? midY
    : clamp(cy, ISLAND.topUnits + visH * 0.35, ISLAND.topUnits + ISLAND.heightUnits - visH * 0.35);
  return [x, y];
}

export function createHub(painter, shared) {
  const mv = createMapView();
  const pose = createRocketPose();
  const rects = new Map();
  const mood = { cloud: 0, rain: 0, storm: 0, wind: 0, dust: 0, flash: 0 };
  const state = {
    cx: 0,
    cy: 0,
    zoom: 1,
    tx: 0,
    ty: 0,
    tz: 1,
    ready: false,
    orientation: '',
    selected: null,
    pending: null,
    lastTime: null,
    devW: 1,
    devH: 1,
    devPerCss: 1,
    sFit: 1,
    hints: null,
    daylight: null,
    shore: null,
  };
  const fx = createHubFx();
  const overlay = { r: 0, g: 0, b: 0, a: 0 };
  const vents = [
    { x: -26, y: 20, rate: 5, drift: -1 },
    { x: 27, y: 21, rate: 5, drift: 1 },
    { x: 0, y: 60, rate: 3, drift: 0 },
  ];
  const mistVent = [{ x: 56, y: 22, rate: 8, drift: 2 }];

  /** Рамки хранятся по идентификатору key#n: у парных построек (маяки) их несколько, и ракета между ними остаётся доступной. */
  function rectFor(key, index) {
    const id = index ? `${key}#${index}` : key;
    let r = rects.get(id);
    if (!r) {
      r = { key, x0: 0, y0: 0, x1: 0, y1: 0, cx: 0, cy: 0, active: false };
      rects.set(id, r);
    }
    return r;
  }

  const frameCounts = new Map();

  /** Добавляет рамку постройки (в пикселях устройства); вторая и следующие рамки того же ключа — отдельные цели. */
  function addRect(key, x0, y0, x1, y1) {
    const index = frameCounts.get(key) || 0;
    frameCounts.set(key, index + 1);
    const r = rectFor(key, index);
    const d = state.devPerCss;
    r.x0 = x0 / d;
    r.y0 = y0 / d;
    r.x1 = x1 / d;
    r.y1 = y1 / d;
    r.cx = (r.x0 + r.x1) / 2;
    r.cy = (r.y0 + r.y1) / 2;
    r.active = true;
    return r;
  }

  function scaleFor(zoom) {
    return state.sFit * zoom;
  }

  function maxZoom() {
    return Math.max(1, state.devW / MAX_ZOOM_WIDTH / state.sFit);
  }

  function applyDefault() {
    const spec = DEFAULT_VIEW[state.orientation] || DEFAULT_VIEW.landscape;
    const zoom = clamp(state.devW / spec.visibleWidth / state.sFit, 1, maxZoom());
    const [cx, cy] = clampCenter(spec.cx, spec.cy, scaleFor(zoom), state.devW, state.devH);
    state.tz = zoom;
    state.tx = cx;
    state.ty = cy;
  }

  /** Центр и зум так, чтобы карта-точка (mx, my) осталась под экранной точкой (xDev, yDev). */
  function keepPointUnder(mx, my, xDev, yDev, zoom) {
    const s = scaleFor(zoom);
    return clampCenter(mx - (xDev - state.devW / 2) / s, my - (yDev - state.devH / 2) / s, s, state.devW, state.devH);
  }

  const hub = {
    /** Сдвиг вида на экранные пиксели CSS (перетаскивание): мир едет за пальцем. */
    pan(dxCss, dyCss = 0) {
      if (!state.ready) return;
      const k = state.devPerCss / scaleFor(state.zoom);
      const [x, y] = clampCenter(state.cx - dxCss * k, state.cy - dyCss * k, scaleFor(state.zoom), state.devW, state.devH);
      state.cx = state.tx = x;
      state.cy = state.ty = y;
    },

    /** Зум щипком/колесом: factor > 1 приближает; (xCss, yCss) — точка под пальцами остаётся на месте. */
    zoomBy(factor, xCss, yCss) {
      if (!state.ready) return;
      const xDev = xCss === undefined ? state.devW / 2 : xCss * state.devPerCss;
      const yDev = yCss === undefined ? state.devH / 2 : yCss * state.devPerCss;
      const s = scaleFor(state.zoom);
      const mx = state.cx + (xDev - state.devW / 2) / s;
      const my = state.cy + (yDev - state.devH / 2) / s;
      const zoom = clamp(state.zoom * factor, 1, maxZoom());
      const [cx, cy] = keepPointUnder(mx, my, xDev, yDev, zoom);
      state.zoom = state.tz = zoom;
      state.cx = state.tx = cx;
      state.cy = state.ty = cy;
    },

    /** Двойной тап: из обзора приближает к точке, из крупного плана возвращает к стартовому виду. */
    toggleZoom(xCss, yCss) {
      if (!state.ready) return;
      const spec = DEFAULT_VIEW[state.orientation] || DEFAULT_VIEW.landscape;
      const home = clamp(state.devW / spec.visibleWidth / state.sFit, 1, maxZoom());
      if (state.tz < home * 1.35) {
        const zoom = clamp(Math.max(state.tz * 2.4, home * 1.8), 1, maxZoom());
        const xDev = xCss === undefined ? state.devW / 2 : xCss * state.devPerCss;
        const yDev = yCss === undefined ? state.devH / 2 : yCss * state.devPerCss;
        const s = scaleFor(state.zoom);
        const mx = state.cx + (xDev - state.devW / 2) / s;
        const my = state.cy + (yDev - state.devH / 2) / s;
        const [cx, cy] = keepPointUnder(mx, my, state.devW / 2, state.devH / 2, zoom);
        state.tz = zoom;
        state.tx = cx;
        state.ty = cy;
      } else {
        applyDefault();
      }
    },

    /** Плавно навести вид на постройку (ключ) или на точку карты {x, y} в единицах мира. */
    focus(target, immediate = false) {
      if (!state.ready) {
        state.pending = { target, immediate };
        return;
      }
      let x;
      let y;
      let zoom = clamp(state.devW / 380 / state.sFit, 1, maxZoom());
      if (typeof target === 'string' && BUILDING_ANCHORS[target]) {
        const anchor = BUILDING_ANCHORS[target].anchors[0];
        const [wx, wy] = islandToWorld(anchor[0], anchor[1]);
        const heightUnits = BUILDING_ANCHORS[target].size[1] * ISLAND.unitsPerPx;
        x = wx;
        y = wy - heightUnits * 0.4;
      } else if (typeof target === 'string' && WORLD_ENTRIES[target]) {
        const [wx, wy] = entryWorld(target);
        x = wx;
        y = wy - WORLD_ENTRIES[target].size[1] * ISLAND.unitsPerPx * 0.4;
      } else if (target && typeof target === 'object') {
        x = target.x;
        y = target.y;
        if (target.zoom) zoom = clamp(target.zoom, 1, maxZoom());
      } else {
        return;
      }
      zoom = Math.max(zoom, Math.min(state.tz, maxZoom()));
      const [cx, cy] = clampCenter(x, y, scaleFor(zoom), state.devW, state.devH);
      state.tz = zoom;
      state.tx = cx;
      state.ty = cy;
      if (immediate) {
        state.zoom = zoom;
        state.cx = cx;
        state.cy = cy;
      }
    },

    /** Вернуть стартовый вид (площадка крупно в портрете, широкий кадр в ландшафте). */
    reset(immediate = false) {
      if (!state.ready) return;
      applyDefault();
      if (immediate) {
        state.zoom = state.tz;
        state.cx = state.tx;
        state.cy = state.ty;
      }
    },

    /**
     * Анимация покупки здания key (~1,2 с): леса, пыль, искры, поднимающиеся блоки, вспышка по завершении.
     * Вызывайте сразу после покупки; здание уже в профиле. При reduceMotion — короткая стройка без вспышек.
     */
    playBuild(key) {
      if (BUILDING_ANCHORS[key]) fx.playBuild(key);
    },

    /** Праздник новой эпохи: фейерверк над островом и вспышка огней (при reduceMotion — только мягкое свечение ламп). */
    playEra() {
      fx.playEra();
    },

    /** Длительность анимации стройки, с. */
    buildDuration: BUILD_DURATION,

    /** Идёт ли сейчас анимация стройки или праздника (для UI: держать кадры, не запускать повторно). */
    get animating() {
      return fx.active;
    },

    /** Освещённость 0 (ночь) .. 1 (день) принудительно; null — вернуть автоматическую смену дня и ночи. */
    setDaylight(value) {
      state.daylight = value === null || value === undefined ? null : clamp(value, 0, 1);
    },

    /** Подсветка объектов-входов пульсирующим контуром: true/false или null — решает профиль (первый запуск). */
    setHints(value) {
      state.hints = value === null || value === undefined ? null : !!value;
    },

    setSelected(key) {
      state.selected = key || null;
    },

    get selected() {
      return state.selected;
    },

    /** Текущий вид: { zoom, cx, cy, scale } — для тестов и отладки. */
    get view() {
      return { zoom: state.zoom, cx: state.cx, cy: state.cy, scale: scaleFor(state.zoom) };
    },

    /**
     * Постройка (ключ), 'rocket' или null под точкой (x, y) в CSS-пикселях.
     * Цели нажатия не меньше 48 CSS-пикселей: рамки расширяются вокруг центра.
     */
    hitTest(x, y) {
      let best = null;
      let bestDist = Infinity;
      for (const r of rects.values()) {
        if (!r.active) continue;
        const halfW = Math.max((r.x1 - r.x0) / 2, MIN_TOUCH_CSS / 2);
        const halfH = Math.max((r.y1 - r.y0) / 2, MIN_TOUCH_CSS / 2);
        const dx = Math.abs(x - r.cx);
        const dy = Math.abs(y - r.cy);
        if (dx > halfW || dy > halfH) continue;
        // Приоритет ближайшему центру; ракета проигрывает постройкам при равенстве.
        const dist = (dx / halfW) ** 2 + (dy / halfH) ** 2 + (r.key === 'rocket' ? 0.01 : 0);
        if (dist < bestDist) {
          bestDist = dist;
          best = r.key;
        }
      }
      return best;
    },

    /** Центр постройки на экране (CSS-пиксели) или null, если она не нарисована. */
    screenPos(key) {
      const r = rects.get(key);
      return r && r.active ? { x: r.cx, y: r.cy } : null;
    },

    /** Все экранные рамки постройки (CSS-пиксели): у пары маяков их две. */
    screenRects(key) {
      const out = [];
      for (const r of rects.values()) if (r.active && r.key === key) out.push({ x0: r.x0, y0: r.y0, x1: r.x1, y1: r.y1 });
      return out;
    },

    /**
     * Рисует хаб. params: { profile, time, layout, weather?, selected? }.
     * Рисует в пикселях устройства (внутри сбрасывает transform и восстанавливает его).
     */
    draw(ctx, params) {
      const { profile, time, layout } = params;
      const weather = params.weather || null;
      if (shared) shared.profile = profile;
      if (params.selected !== undefined) state.selected = params.selected;
      const canvas = ctx.canvas;
      const devW = canvas.width;
      const devH = canvas.height;
      ensureWorld(layout);
      state.devW = devW;
      state.devH = devH;
      state.devPerCss = devW / layout.w;
      state.sFit = fitScale(devW, devH);
      if (!state.ready || state.orientation !== layout.orientation) {
        state.ready = true;
        state.orientation = layout.orientation;
        applyDefault();
        state.zoom = state.tz;
        state.cx = state.tx;
        state.cy = state.ty;
      }
      if (state.pending) {
        const { target, immediate } = state.pending;
        state.pending = null;
        hub.focus(target, immediate);
      }
      const dt = state.lastTime === null ? 0 : clamp(time - state.lastTime, 0, 0.1);
      state.lastTime = time;
      if (dt > 0) {
        state.zoom = damp(state.zoom, state.tz, VIEW_RATE, dt);
        state.cx = damp(state.cx, state.tx, VIEW_RATE, dt);
        state.cy = damp(state.cy, state.ty, VIEW_RATE, dt);
      }
      const s = scaleFor(state.zoom);
      [state.cx, state.cy] = clampCenter(state.cx, state.cy, s, devW, devH);

      weatherMood(weather, mood);
      mv.set(devW / 2 - state.cx * s, devH / 2 - state.cy * s, s, devW, devH);

      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.imageSmoothingEnabled = true;
      for (const r of rects.values()) r.active = false;
      frameCounts.clear();

      const reduce = !!(params.settings && params.settings.reduceMotion);
      if (state.shore === null) state.shore = shorePoints(painter.assets.json('island_land'));
      const daylight = params.daylight ?? state.daylight ?? daylightAt(time);
      const night = lightsAt(daylight);

      const era = profile ? clamp(profile.era | 0, 0, 5) : 0;
      const parts = profile && profile.parts ? profile.parts : {};
      const owned = profile && profile.buildings ? profile.buildings : {};
      const ownedCount = Object.keys(owned).filter((key) => (owned[key] | 0) > 0).length;

      // эффекты: стройка, праздник, пар
      fx.update(dt, reduce, (key) => buildBoxes(painter, key, owned[key] | 0), mv);
      fx.steam(dt, vents, reduce ? 0.4 : 1);
      if (owned.deluge > 0) fx.steam(dt, mistVent, reduce ? 0.3 : 0.8);

      drawSea(ctx, mv, time, mood);
      drawIslandHd(ctx, painter, mv);
      if (!reduce) drawFoam(ctx, mv, state.shore, time);
      drawCloudShadows(ctx, painter, mv, time, mood, state.zoom);
      drawVehicles(ctx, mv, time, vehicleCount(ownedCount));

      const rocketItem = {
        y: 0,
        draw() {
          drawLaunchMount(ctx, mv, era, time);
          if ((parts.capsule | 0) > 0) drawCapsuleOnCart(ctx, painter, mv, era);
          pose.x = 0;
          pose.y = 0;
          pose.angle = 0;
          pose.era = era;
          pose.kind = (parts.booster | 0) > 0 ? 'booster' : 'core';
          pose.throttle = 0;
          pose.atmo = 1;
          pose.skin = (profile && profile.skin) || 'classic';
          pose.visible = true;
          drawRocket(ctx, painter, mv, pose, time);
          const height = stackHeight(pose.kind);
          addRect('rocket', mv.sx(-18), mv.sy(-height), mv.sx(18), mv.sy(4));
        },
      };
      const contracts = profile && profile.contracts && profile.contracts.active ? profile.contracts.active.length : 0;
      const entryItems = ENTRY_KEYS.map((key) => {
        const [wx, wy] = entryWorld(key);
        return {
          y: wy,
          draw() {
            drawEntry(ctx, painter, mv, key, wx, wy, time, { era, contracts, pulse: fx.eraPulse, sway: !reduce });
            const [w, h] = entrySize(key, painter, era);
            addRect(key, mv.sx(wx - w / 2), mv.sy(wy - h), mv.sx(wx + w / 2), mv.sy(wy));
          },
        };
      });
      drawPlacedBuildings(ctx, painter, mv, profile, time, addRect, [rocketItem, ...entryItems], {
        build: (key) => fx.buildState(key, reduce),
        scaffold: (c, box, build) => drawScaffold(c, mv, box, build.reveal, build.scaffold, time),
      });
      fx.draw(ctx, mv, 0);
      drawHubDrones(ctx, painter, mv, profile, time);
      drawHubPlanes(ctx, painter, mv, time, profile);
      if (!reduce) drawBirds(ctx, mv, time);
      drawHubClouds(ctx, painter, mv, time, mood, state.zoom);

      if (mood.rain > 0.05) drawRain(ctx, mv, time, mood.rain, mood.wind);
      if (mood.storm > 0.3) {
        ctx.fillStyle = `rgba(20,28,40,${(0.2 * mood.storm).toFixed(2)})`;
        ctx.fillRect(0, 0, devW, devH);
      }

      // сумерки и ночь: затемнение, затем огни поверх (аддитивно)
      dayOverlay(daylight, overlay);
      if (overlay.a > 0.01) {
        ctx.fillStyle = `rgba(${overlay.r},${overlay.g},${overlay.b},${overlay.a.toFixed(3)})`;
        ctx.fillRect(0, 0, devW, devH);
      }
      const lightStrength = Math.max(night, fx.eraPulse * 0.9);
      if (lightStrength > 0.03) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        drawNightLights(ctx, painter, mv, profile, time, lightStrength, era);
        ctx.restore();
        drawHeadlights(ctx, mv, time, vehicleCount(ownedCount), night);
      }
      fx.draw(ctx, mv, 1);

      const hints = state.hints ?? !!(profile && profile.settings && profile.settings.tutorial && !profile.settings.tutorial.done);
      if (hints) {
        const d = state.devPerCss;
        for (const key of ENTRY_KEYS) {
          const r = rects.get(key);
          if (r && r.active) drawEntryHint(ctx, { x0: r.x0 * d, y0: r.y0 * d, x1: r.x1 * d, y1: r.y1 * d }, time, mv.s);
        }
      }
      if (state.selected) {
        for (const r of rects.values()) if (r.active && r.key === state.selected) drawSelection(ctx, mv, r, state.devPerCss, time);
      }
      ctx.restore();
    },
  };
  return hub;
}

/** Сколько машин ездит по дорогам: растёт вместе с базой. */
export function vehicleCount(ownedCount) {
  return ownedCount >= 6 ? 3 : ownedCount >= 2 ? 2 : 1;
}

/** Рамки здания key (ед. мира, y — низ) по его якорям: для стройки и эффектов. */
function buildBoxes(painter, key, level) {
  const spec = BUILDING_ANCHORS[key];
  if (!spec || level <= 0) return null;
  const [w, h] = buildingSize(painter, key, level);
  return spec.anchors.map(([px, py]) => {
    const [x, y] = islandToWorld(px, py);
    return { x, y, w: w * 0.9, h };
  });
}

const GLOW_WARM = '255,206,120';
const GLOW_RED = '255,90,70';

/** Ночные огни построек, стола, объектов-входов: ровные и мигающие; strength 0..1. */
function drawNightLights(ctx, painter, mv, profile, time, strength, era) {
  const owned = profile && profile.buildings ? profile.buildings : {};
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const on = (Math.floor(time * 1.5) + i) % 2 === 0;
    drawGlow(ctx, mv, Math.cos(a) * MOUNT_RADIUS * 0.82, Math.sin(a) * MOUNT_RADIUS * 0.72, 11, GLOW_WARM, strength * (on ? 1 : 0.35));
  }
  for (const key of Object.keys(BUILDING_ANCHORS)) {
    const level = owned[key] | 0;
    if (level <= 0) continue;
    const [w, h] = buildingSize(painter, key, level);
    const blinking = key === 'beacons' || key === 'radar' || key === 'recovery';
    const on = !blinking || Math.floor(time * 1.4 + hash2(key.length, level, 3)) % 2 === 0;
    BUILDING_ANCHORS[key].anchors.forEach(([px, py], i) => {
      const [x, y] = islandToWorld(px, py);
      drawGlow(ctx, mv, x, y - h * (key === 'beacons' ? 0.78 : 0.42), Math.max(w, h) * (key === 'beacons' ? 0.4 : 0.55), blinking ? GLOW_RED : GLOW_WARM, strength * (on ? 0.9 : 0.3));
      if (i === 0 && !blinking) drawGlow(ctx, mv, x + w * 0.25, y - h * 0.2, w * 0.35, GLOW_WARM, strength * 0.6);
    });
  }
  const [wx, wy] = entryWorld('workshop');
  drawGlow(ctx, mv, wx, wy - 50, 34, GLOW_WARM, strength * 0.75);
  const [sx, sy] = entryWorld('shop');
  drawGlow(ctx, mv, sx, sy - 32, 46, GLOW_WARM, strength * 0.9);
  const [mx, my] = entryWorld('monument');
  const k = ISLAND.unitsPerPx;
  for (let i = 0; i <= era; i++) drawGlow(ctx, mv, mx + (-11.5 + i * 4.6) * k, my - 62 * k, 8, GLOW_WARM, strength * 0.9);
  drawGlow(ctx, mv, mx, my - 122 * k, 12, GLOW_WARM, strength);
}

function drawCapsuleOnCart(ctx, painter, mv, era) {
  const { x, y } = CAPSULE_CART;
  const s = mv.S;
  ctx.fillStyle = 'rgba(8,12,18,0.3)';
  ctx.beginPath();
  ctx.ellipse(mv.sx(x), mv.sy(y), 17 * s, 5 * s, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#59606a';
  ctx.fillRect(mv.sx(x - 16), mv.sy(y - 5), Math.round(32 * s), Math.max(2, Math.round(3 * s)));
  ctx.fillStyle = '#2a3038';
  for (const side of [-1, 1]) ctx.fillRect(mv.sx(x + side * 13 - 2), mv.sy(y - 3), Math.max(2, Math.round(4 * s)), Math.max(2, Math.round(3 * s)));
  painter.sprite(ctx, mv, spriteName('capsule', era), x, y - 4, { h: 36, smooth: true });
}

// --- облака ---------------------------------------------------------------------------------------

const CLOUD_CELL = [420, 320];
const CLOUD_DRIFT = 2.6; // ед./с в одну сторону: без качаний

function cloudCells(mv, time, density, fn) {
  const drift = time * CLOUD_DRIFT;
  const x0 = Math.floor((mv.left - drift - 200) / CLOUD_CELL[0]);
  const x1 = Math.floor((mv.right - drift + 200) / CLOUD_CELL[0]);
  const y0 = Math.floor((mv.top - 160) / CLOUD_CELL[1]);
  const y1 = Math.floor((mv.bottom + 160) / CLOUD_CELL[1]);
  for (let iy = y0; iy <= y1; iy++) {
    for (let ix = x0; ix <= x1; ix++) {
      if (hash2(ix, iy, 61) > density) continue;
      const x = (ix + 0.2 + 0.6 * hash2(ix, iy, 62)) * CLOUD_CELL[0] + drift;
      const y = (iy + 0.2 + 0.6 * hash2(ix, iy, 63)) * CLOUD_CELL[1];
      fn(x, y, Math.floor(hash2(ix, iy, 64) * 4), 190 + 120 * hash2(ix, iy, 65));
    }
  }
}

const SHADOW_TINT = { r: 0, g: 0, b: 0, a: 1 };

/** При крупном плане облака растворяются: они не должны закрывать постройки, на которые навели вид. */
function cloudZoomFade(zoom) {
  return 1 - 0.8 * smoothstep(1.6, 3.8, zoom);
}

function drawCloudShadows(ctx, painter, mv, time, mood, zoom) {
  const density = 0.18 + mood.cloud * 0.4;
  const fade = cloudZoomFade(zoom);
  if (fade <= 0.02) return;
  cloudCells(mv, time, density, (x, y, kind, width) => {
    painter.sprite(ctx, mv, `cloud_${kind}`, x + 36, y + 52, { w: width, tint: SHADOW_TINT, alpha: 0.16 * fade });
  });
}

function drawHubClouds(ctx, painter, mv, time, mood, zoom) {
  const density = 0.18 + mood.cloud * 0.4;
  const alpha = (0.42 + mood.cloud * 0.3) * cloudZoomFade(zoom);
  if (alpha <= 0.02) return;
  cloudCells(mv, time, density, (x, y, kind, width) => {
    painter.sprite(ctx, mv, `cloud_${kind}`, x, y, { w: width, alpha });
  });
}

// --- живность ---------------------------------------------------------------------------------------

const PLANE_LANES = [
  { y: -70, speed: 16, width: 78, dir: 1, phase: 0.1 },
  { y: 150, speed: 11, width: 92, dir: -1, phase: 0.55 },
  { y: 30, speed: 22, width: 70, dir: 1, phase: 0.8 },
];

function drawHubPlanes(ctx, painter, mv, time, profile) {
  const era = profile ? clamp(profile.era | 0, 0, 5) : 0;
  const count = 1 + (era >= 2 ? 1 : 0) + (era >= 4 ? 1 : 0);
  const span = 2600;
  for (let i = 0; i < count; i++) {
    const lane = PLANE_LANES[i];
    const t = (time * lane.speed + lane.phase * span) % span;
    const wx = (lane.dir > 0 ? -span / 2 + t : span / 2 - t) + 380;
    const lineage = i === 1 ? 'medium_passenger' : i === 2 ? 'high_fighter' : 'low_primary';
    const name = `${lineage}_${eraYear(i === 1 ? era - 1 : era)}`;
    painter.sprite(ctx, mv, name, wx + 48, lane.y + 70, {
      w: lane.width * 0.92, flipX: lane.dir < 0, tint: SHADOW_TINT, alpha: 0.2,
    });
    drawAircraft(ctx, painter, mv, name, lineage, wx, lane.y, lane.dir, time, lane.width);
  }
}

const DRONE_ROUTES = [
  { cx: 150, cy: -20, rx: 70, ry: 24, speed: 0.35, width: 38, index: 0 },
  { cx: 520, cy: -10, rx: 90, ry: 30, speed: 0.28, width: 42, index: 1 },
];

function drawHubDrones(ctx, painter, mv, profile, time) {
  const owned = profile && profile.buildings ? Object.keys(profile.buildings).filter((key) => (profile.buildings[key] | 0) > 0).length : 0;
  const count = Math.min(DRONE_ROUTES.length, Math.floor(owned / 3) + ((profile && profile.era | 0) >= 2 ? 1 : 0));
  for (let i = 0; i < count; i++) {
    const route = DRONE_ROUTES[i];
    const a = time * route.speed + hash2(i, 3) * 6;
    const wx = route.cx + Math.sin(a) * route.rx;
    const wy = route.cy + Math.sin(a * 1.7 + 1) * route.ry + Math.sin(time * 2.1 + i) * 1.5;
    painter.sprite(ctx, mv, `base_drone_${route.index}`, wx + 14, wy + 30, {
      w: route.width * 0.9, tint: SHADOW_TINT, alpha: 0.2,
    });
    drawDrone(ctx, painter, mv, route.index, wx, wy, route.width, time);
  }
}

// --- подсветка выбора ---------------------------------------------------------------------

function drawSelection(ctx, mv, rect, devPerCss, time) {
  if (!rect || !rect.active) return;
  const pulse = 0.55 + 0.45 * Math.sin(time * 4.2);
  const pad = Math.max(4, 3 * mv.s);
  const x0 = Math.round(rect.x0 * devPerCss) - pad;
  const y0 = Math.round(rect.y0 * devPerCss) - pad;
  const x1 = Math.round(rect.x1 * devPerCss) + pad;
  const y1 = Math.round(rect.y1 * devPerCss) + pad;
  const arm = Math.max(10, Math.min(x1 - x0, y1 - y0) * 0.2);
  const t = Math.max(2, Math.round(mv.s * 1.3));
  ctx.save();
  ctx.fillStyle = `rgba(239,194,99,${(0.6 + 0.4 * pulse).toFixed(2)})`;
  for (const [cx, cy, sx, sy] of [[x0, y0, 1, 1], [x1, y0, -1, 1], [x0, y1, 1, -1], [x1, y1, -1, -1]]) {
    ctx.fillRect(sx > 0 ? cx : cx - arm, sy > 0 ? cy : cy - t, arm, t);
    ctx.fillRect(sx > 0 ? cx : cx - t, sy > 0 ? cy : cy - arm, t, arm);
  }
  ctx.strokeStyle = `rgba(239,194,99,${(0.3 + 0.3 * pulse).toFixed(2)})`;
  ctx.lineWidth = t;
  ctx.beginPath();
  ctx.ellipse((x0 + x1) / 2, y1 - pad, (x1 - x0) * 0.55, Math.max(4, 4 * mv.s), 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

