// Камера полёта и преобразование мир -> экран. Чистая логика без DOM.
//
// Камера хранит мировую точку (x, y), которая показывается в экранной точке-якоре (ax, ay).
// Якорь берётся из layout: в портрете ракета в нижней трети, в ландшафте — в левой трети
// при вертикальном движении и ближе к центру при горизонтальном.

import { clamp, damp, lerp, smoothstep, wobble } from './util.js';

export const CAMERA_TUNING = {
  followX: 5.5,
  followY: 7,
  anchorRate: 2.2,
  zoomRate: 2.2,
  zoomOutSpeed: [30, 150], // ед./с: с какой скорости камера начинает отъезжать и до какой полностью
  zoomOutAmount: 0.2,
  landingBoost: 0.14,
  lookAheadSeconds: 0.35,
  maxShake: 5, // ед. мира при trauma = 1
  traumaDecay: 1.5,
  kickShake: 2, // ед. мира при толчке kick = 1 (близкий пролёт мимо помехи: слабый короткий толчок)
  kickDecay: 4, // 1/с: толчок затухает за ~0,25 с
  horizontalSpeed: 30, // ед./с: выше этой горизонтальной скорости якорь уезжает к центру
  rumbleShake: 0.35, // доля maxShake от постоянной вибрации двигателя
};

/** Масштаб по скорости: 1 на малой скорости, до 1 - zoomOutAmount на большой. */
export function zoomForSpeed(speed) {
  const [lo, hi] = CAMERA_TUNING.zoomOutSpeed;
  return 1 - CAMERA_TUNING.zoomOutAmount * smoothstep(lo, hi, speed);
}

/** Небольшое приближение при посадочном спуске, чтобы лучше видеть опоры и площадку. */
export function landingBoost(alt, vy, speed) {
  if (vy <= 2 || speed > 70) return 0;
  const near = 1 - smoothstep(40, 260, alt);
  return CAMERA_TUNING.landingBoost * near;
}

/** Мягкое «прилипание» масштаба к 1, чтобы пиксельная графика оставалась чёткой почти всегда. */
export function pixelSnapZoom(zoom) {
  const d = Math.abs(zoom - 1);
  return zoom + (1 - zoom) * (1 - smoothstep(0, 0.06, d));
}

export function createCamera() {
  const camera = {
    x: 0,
    y: 0,
    ax: 0,
    ay: 0,
    zoom: 1,
    blend: 0,
    trauma: 0,
    kick: 0,
    rumble: 0,
    time: 0,
    shakeX: 0,
    shakeY: 0,
    ready: false,
    reduceMotion: false,

    /** Мгновенно поставить камеру на цель (начало полёта, смена раскладки). */
    snap(target, layout) {
      camera.ready = true;
      camera.blend = horizontalWeight(target);
      anchorFor(camera, layout);
      camera.zoom = zoomTarget(target);
      const look = lookOffset(target, layout, camera.zoom);
      camera.x = target.x + look.x;
      camera.y = target.y + look.y;
      camera.trauma = 0;
      camera.kick = 0;
      camera.shakeX = 0;
      camera.shakeY = 0;
    },

    /** Шаг камеры за dt секунд. target = { x, y, vx, vy, alt }. */
    update(dt, target, layout, options) {
      if (!camera.ready) {
        camera.snap(target, layout);
        return;
      }
      camera.reduceMotion = !!(options && options.reduceMotion);
      camera.time += dt;
      camera.blend = damp(camera.blend, horizontalWeight(target), CAMERA_TUNING.anchorRate, dt);
      anchorFor(camera, layout);
      camera.zoom = damp(camera.zoom, zoomTarget(target), CAMERA_TUNING.zoomRate, dt);
      const look = lookOffset(target, layout, camera.zoom);
      camera.x = damp(camera.x, target.x + look.x, CAMERA_TUNING.followX, dt);
      camera.y = damp(camera.y, target.y + look.y, CAMERA_TUNING.followY, dt);
      camera.trauma = camera.reduceMotion ? 0 : Math.max(0, camera.trauma - CAMERA_TUNING.traumaDecay * dt);
      camera.kick = camera.reduceMotion ? 0 : Math.max(0, camera.kick - CAMERA_TUNING.kickDecay * dt);
      updateShake(camera);
    },

    /** Добавить тряску (0..1); складывается и затухает. При reduceMotion игнорируется. */
    addTrauma(amount) {
      if (camera.reduceMotion) return;
      camera.trauma = clamp(camera.trauma + amount, 0, 1);
    },

    /** Короткий слабый толчок (0..1), затухает за ~0,25 с, не складывается с trauma. При reduceMotion игнорируется. */
    addKick(amount) {
      if (camera.reduceMotion) return;
      camera.kick = clamp(Math.max(camera.kick, amount), 0, 1);
    },

    /** Постоянная вибрация (тяга, перегрев) 0..1; не складывается и не затухает сама. */
    setRumble(level) {
      camera.rumble = camera.reduceMotion ? 0 : clamp(level, 0, 1);
    },

    reset() {
      camera.ready = false;
      camera.trauma = 0;
      camera.kick = 0;
      camera.rumble = 0;
      camera.shakeX = 0;
      camera.shakeY = 0;
    },
  };
  return camera;
}

function horizontalWeight(target) {
  const vx = Math.abs(target.vx || 0);
  const vy = Math.abs(target.vy || 0);
  return vx > CAMERA_TUNING.horizontalSpeed && vx > vy * 0.8 ? 1 : 0;
}

function anchorFor(camera, layout) {
  const v = layout.rocketAnchor;
  const h = layout.rocketAnchorH || v;
  camera.ax = lerp(v.x, h.x, camera.blend);
  camera.ay = lerp(v.y, h.y, camera.blend);
}

function zoomTarget(target) {
  const speed = Math.hypot(target.vx || 0, target.vy || 0);
  return zoomForSpeed(speed) * (1 + landingBoost(target.alt ?? -target.y, target.vy || 0, speed));
}

/** Смещение фокуса: камера смотрит немного вперёд по скорости, вниз при падении. */
function lookOffset(target, layout, zoom) {
  const viewW = layout.w / (zoom || 1);
  const viewH = layout.h / (zoom || 1);
  const limitX = viewW * 0.12;
  const vx = target.vx || 0;
  const vy = target.vy || 0;
  const downward = clamp(vy * CAMERA_TUNING.lookAheadSeconds, 0, viewH * 0.2);
  const upward = clamp(vy * 0.1, -viewH * 0.04, 0);
  return {
    x: clamp(vx * CAMERA_TUNING.lookAheadSeconds, -limitX, limitX),
    y: downward + upward,
  };
}

function updateShake(camera) {
  const level = Math.max(camera.trauma * camera.trauma, camera.rumble * camera.rumble * CAMERA_TUNING.rumbleShake);
  const kick = camera.kick * CAMERA_TUNING.kickShake;
  if (camera.reduceMotion || (level <= 0 && kick <= 0)) {
    camera.shakeX = 0;
    camera.shakeY = 0;
    return;
  }
  const power = Math.max(level * CAMERA_TUNING.maxShake, kick);
  camera.shakeX = wobble(camera.time, 1) * power;
  camera.shakeY = wobble(camera.time, 2) * power;
}

/**
 * Вид: преобразование мир -> пиксели устройства. Один объект переиспользуется каждый кадр.
 * S — пикселей устройства на единицу мира (целый базовый масштаб `px` * zoom).
 */
export function createView() {
  const view = {
    S: 1,
    px: 1,
    zoom: 1,
    camX: 0,
    camY: 0,
    ax: 0,
    ay: 0,
    devW: 0,
    devH: 0,
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,

    /** Настройка по камере. devPerCss = пикселей устройства в CSS-пикселе. */
    set(camera, layout, px, devW, devH) {
      const devPerCss = devW / layout.w;
      view.px = px;
      view.zoom = pixelSnapZoom(camera.zoom);
      view.S = px * view.zoom;
      view.camX = camera.x + camera.shakeX;
      view.camY = camera.y + camera.shakeY;
      view.ax = camera.ax * devPerCss;
      view.ay = camera.ay * devPerCss;
      view.devW = devW;
      view.devH = devH;
      view.updateBounds();
      return view;
    },

    /** Простая статичная настройка (хаб): центр кадра в мировой точке (cx, cy), якорь по экрану. */
    setStatic(cx, cy, ax, ay, px, devW, devH) {
      view.px = px;
      view.zoom = 1;
      view.S = px;
      view.camX = cx;
      view.camY = cy;
      view.ax = ax;
      view.ay = ay;
      view.devW = devW;
      view.devH = devH;
      view.updateBounds();
      return view;
    },

    updateBounds() {
      view.left = view.camX - view.ax / view.S;
      view.right = view.camX + (view.devW - view.ax) / view.S;
      view.top = view.camY - view.ay / view.S;
      view.bottom = view.camY + (view.devH - view.ay) / view.S;
    },

    sx(x) {
      return Math.round(view.ax + (x - view.camX) * view.S);
    },
    sy(y) {
      return Math.round(view.ay + (y - view.camY) * view.S);
    },
    wx(sx) {
      return view.camX + (sx - view.ax) / view.S;
    },
    wy(sy) {
      return view.camY + (sy - view.ay) / view.S;
    },
  };
  return view;
}
