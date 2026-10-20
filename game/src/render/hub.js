// Космодром: стартовый остров на непрерывном море, постройки по якорям (только купленные),
// ракета на столе, облака, волны, погода, самолёты и дроны; тап по постройкам и подсветка выбора.

import { createView } from './camera.js';
import { ensureWorld } from './layout.js';
import {
  BUILDING_ANCHORS, BUILDING_KEYS, ISLAND, eraYear, spriteName,
} from './manifest.js';
import { CLOUD_LAYERS_HUB, drawClouds, drawRain, drawSky, drawSun } from './sky.js';
import { drawIsland, drawOcean } from './ground.js';
import { drawPlacedBuildings } from './buildings.js';
import { createRocketPose, drawRocket, stackHeight } from './rocket.js';
import { drawAircraft, drawDrone } from './traffic.js';
import { drawLaunchTable } from './launchpad.js';
import { fillWorldRect } from './painter.js';
import { clamp, damp, hash2 } from './util.js';
import { weatherMood } from './weather.js';

const GROUND_FRACTION = { landscape: 0.66, portrait: 0.6 };
const FOCUS_RATE = 5;
const MIN_TOUCH_CSS = 48;
const CAPSULE_DISPLAY_X = -50;

export function createHub(painter, shared) {
  const view = createView();
  const pose = createRocketPose();
  const rects = new Map();
  const state = {
    focusX: null,
    targetX: null,
    lastView: { devPerCss: 1, vw: 0, unitsPerCss: 1 },
    selected: null,
    lastTime: null,
  };

  function rectFor(key) {
    let r = rects.get(key);
    if (!r) {
      r = { key, x0: 0, y0: 0, x1: 0, y1: 0, cx: 0, cy: 0, active: false };
      rects.set(key, r);
    }
    return r;
  }

  /** Добавляет рамку (в пикселях устройства); повторный вызов за кадр объединяет рамки (пара маяков). */
  function addRect(key, x0, y0, x1, y1, devPerCss) {
    const r = rectFor(key);
    const nx0 = x0 / devPerCss;
    const ny0 = y0 / devPerCss;
    const nx1 = x1 / devPerCss;
    const ny1 = y1 / devPerCss;
    if (r.active) {
      r.x0 = Math.min(r.x0, nx0);
      r.y0 = Math.min(r.y0, ny0);
      r.x1 = Math.max(r.x1, nx1);
      r.y1 = Math.max(r.y1, ny1);
    } else {
      r.x0 = nx0;
      r.y0 = ny0;
      r.x1 = nx1;
      r.y1 = ny1;
      r.active = true;
    }
    r.cx = (r.x0 + r.x1) / 2;
    r.cy = (r.y0 + r.y1) / 2;
    return r;
  }

  function clampFocus(x, vw) {
    const lo = ISLAND.left + vw * 0.12;
    const hi = ISLAND.left + ISLAND.width - vw * 0.12;
    return clamp(x, Math.min(lo, hi), Math.max(lo, hi));
  }

  const hub = {
    /** Подвинуть вид на dxCss экранных пикселей (перетаскивание пальцем). Положительное — мир уезжает вправо. */
    pan(dxCss) {
      if (state.targetX === null) return;
      state.targetX = clampFocus(state.targetX - dxCss * state.lastView.unitsPerCss, state.lastView.vw);
    },

    /** Плавно навести вид на постройку (ключ) или на мировую координату x; immediate — без плавности. */
    focus(target, immediate = false) {
      const anchors = typeof target === 'string' && BUILDING_ANCHORS[target];
      const x = anchors ? anchors.anchors[0][0] : Number(target);
      if (!Number.isFinite(x)) return;
      state.targetX = clampFocus(x, state.lastView.vw || 300);
      if (immediate) state.focusX = state.targetX;
    },

    /** Вернуть вид на стартовый стол. */
    reset() {
      state.targetX = null;
      state.focusX = null;
    },

    setSelected(key) {
      state.selected = key || null;
    },

    get selected() {
      return state.selected;
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
      const devPerCss = devW / layout.w;
      const px = ensureWorld(layout).hubPx;
      const vw = devW / px;
      const dt = state.lastTime === null ? 0 : clamp(time - state.lastTime, 0, 0.1);
      state.lastTime = time;

      const mood = weatherMood(weather);
      const defaultFocus = vw * 0.12;
      if (state.targetX === null) state.targetX = clampFocus(defaultFocus, vw);
      if (state.focusX === null) state.focusX = state.targetX;
      state.targetX = clampFocus(state.targetX, vw);
      state.focusX = dt > 0 ? damp(state.focusX, state.targetX, FOCUS_RATE, dt) : state.focusX;
      state.lastView.devPerCss = devPerCss;
      state.lastView.vw = vw;
      state.lastView.unitsPerCss = devPerCss / px;

      const groundY = devH * GROUND_FRACTION[layout.orientation];
      view.setStatic(state.focusX, 0, devW / 2, groundY, px, devW, devH);

      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.imageSmoothingEnabled = false;
      for (const r of rects.values()) r.active = false;

      drawSky(ctx, view, 'earth', mood, ISLAND.waterSurfaceY);
      drawSun(ctx, view, 0.8, 0.1, clamp(1 - mood.cloud * 0.85, 0, 1));
      drawClouds(ctx, painter, view, CLOUD_LAYERS_HUB, time, 0.5 + mood.cloud * 0.5, mood.wind, mood.storm, 1);
      drawHubPlanes(ctx, painter, view, time, profile);
      drawOcean(ctx, view, time, mood);
      drawIsland(ctx, painter, view);

      drawPlacedBuildings(ctx, painter, view, profile, time, (key, x0, y0, x1, y1) => addRect(key, x0, y0, x1, y1, devPerCss));
      drawLaunchPad(ctx, painter, view, profile, pose, time, devPerCss, addRect);
      drawHubDrones(ctx, painter, view, profile, time);

      if (mood.rain > 0.05) drawRain(ctx, view, time, mood.rain, mood.wind);
      if (mood.storm > 0.3) {
        ctx.fillStyle = `rgba(20,28,40,${(0.18 * mood.storm).toFixed(2)})`;
        ctx.fillRect(0, 0, devW, devH);
      }
      if (state.selected) drawSelection(ctx, view, rects.get(state.selected), devPerCss, time);
      ctx.restore();
    },
  };
  return hub;
}

// --- стартовая площадка ------------------------------------------------------------------

function drawLaunchPad(ctx, painter, view, profile, pose, time, devPerCss, addRect) {
  const era = profile ? clamp(profile.era | 0, 0, 5) : 0;
  drawLaunchTable(ctx, view, era);

  const parts = profile && profile.parts ? profile.parts : {};
  pose.x = 0;
  pose.y = 0;
  pose.angle = 0;
  pose.era = era;
  pose.kind = (parts.booster | 0) > 0 ? 'booster' : 'core';
  pose.throttle = 0;
  pose.atmo = 1;
  pose.skin = (profile && profile.skin) || 'classic';
  pose.visible = true;
  if ((parts.capsule | 0) > 0) drawCapsuleOnCart(ctx, painter, view, era);
  drawRocket(ctx, painter, view, pose, time);

  const height = stackHeight(pose.kind);
  const wide = 34;
  addRect('rocket', view.sx(-wide / 2), view.sy(-height), view.sx(wide / 2), view.sy(0), devPerCss);
}

function drawCapsuleOnCart(ctx, painter, view, era) {
  const x = CAPSULE_DISPLAY_X;
  fillWorldRect(ctx, view, x - 15, -7, 30, 3, '#59606a');
  fillWorldRect(ctx, view, x - 17, -4, 4, 4, '#2a3038');
  fillWorldRect(ctx, view, x + 13, -4, 4, 4, '#2a3038');
  fillWorldRect(ctx, view, x - 12, -11, 3, 4, '#8f98a1');
  fillWorldRect(ctx, view, x + 9, -11, 3, 4, '#8f98a1');
  painter.sprite(ctx, view, spriteName('capsule', era), x, -10, { h: 33 });
}

// --- живность ---------------------------------------------------------------------------------

const PLANE_LANES = [
  { alt: 200, speed: 14, width: 52, dir: 1, phase: 0.1 },
  { alt: 245, speed: 9, width: 62, dir: -1, phase: 0.55 },
  { alt: 285, speed: 20, width: 48, dir: 1, phase: 0.8 },
];

function drawHubPlanes(ctx, painter, view, time, profile) {
  const era = profile ? clamp(profile.era | 0, 0, 5) : 0;
  const count = 1 + (era >= 2 ? 1 : 0) + (era >= 4 ? 1 : 0);
  const span = 3400;
  for (let i = 0; i < count; i++) {
    const lane = PLANE_LANES[i];
    const t = (time * lane.speed + lane.phase * span) % span;
    const wx = lane.dir > 0 ? -span / 2 + t : span / 2 - t;
    const lineage = i === 1 ? 'medium_passenger' : i === 2 ? 'high_fighter' : 'low_primary';
    // Второй самолёт — техника предыдущей эпохи: небо не меняется целиком за один шаг.
    const name = `${lineage}_${eraYear(i === 1 ? era - 1 : era)}`;
    const world = -lane.alt - Math.sin(time * 0.3 + i) * 3;
    drawAircraft(ctx, painter, view, name, lineage, wx, world, lane.dir, time, lane.width);
  }
}

const DRONE_ROUTES = [
  { cx: 150, alt: 78, rx: 70, ry: 14, speed: 0.35, width: 34, index: 0 },
  { cx: 560, alt: 92, rx: 110, ry: 18, speed: 0.28, width: 38, index: 1 },
];

function drawHubDrones(ctx, painter, view, profile, time) {
  const built = profile && profile.buildings ? BUILDING_KEYS.filter((key) => (profile.buildings[key] | 0) > 0).length : 0;
  const count = Math.min(DRONE_ROUTES.length, Math.floor(built / 3) + ((profile && profile.era | 0) >= 2 ? 1 : 0));
  for (let i = 0; i < count; i++) {
    const route = DRONE_ROUTES[i];
    const a = time * route.speed + hash2(i, 3) * 6;
    const wx = route.cx + Math.sin(a) * route.rx;
    const wy = -(route.alt + Math.sin(a * 1.7 + 1) * route.ry + Math.sin(time * 2.1 + i) * 1.5);
    drawDrone(ctx, painter, view, route.index, wx, wy, route.width, time);
  }
}

// --- подсветка выбора ---------------------------------------------------------------------

function drawSelection(ctx, view, rect, devPerCss, time) {
  if (!rect || !rect.active) return;
  const pulse = 0.55 + 0.45 * Math.sin(time * 4.2);
  const pad = 4 * view.px;
  const x0 = Math.round(rect.x0 * devPerCss) - pad;
  const y0 = Math.round(rect.y0 * devPerCss) - pad;
  const x1 = Math.round(rect.x1 * devPerCss) + pad;
  const y1 = Math.round(rect.y1 * devPerCss) + pad;
  const arm = Math.max(6 * view.px, Math.min(x1 - x0, y1 - y0) * 0.22);
  const t = Math.max(1, Math.round(view.px));
  ctx.save();
  ctx.fillStyle = `rgba(239,194,99,${(0.55 + 0.4 * pulse).toFixed(2)})`;
  for (const [cx, cy, sx, sy] of [[x0, y0, 1, 1], [x1, y0, -1, 1], [x0, y1, 1, -1], [x1, y1, -1, -1]]) {
    ctx.fillRect(sx > 0 ? cx : cx - arm, sy > 0 ? cy : cy - t, arm, t);
    ctx.fillRect(sx > 0 ? cx : cx - t, sy > 0 ? cy : cy - arm, t, arm);
  }
  ctx.strokeStyle = `rgba(239,194,99,${(0.25 + 0.3 * pulse).toFixed(2)})`;
  ctx.lineWidth = t;
  ctx.beginPath();
  const baseY = y1 - pad;
  ctx.ellipse((x0 + x1) / 2, baseY, (x1 - x0) * 0.55, Math.max(3, 4 * view.px), 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}
