// Горизонтальные кольца ускорения: кэш мастер-текстур по эпохам (ringart.js), отрисовка задней и передней половин,
// огни (мерцание, бег огней, пульсация) и вспышка-призрак после пролёта (с учётом quality/offset).
//
// Кольцо — тор, лежащий горизонтально. Задняя половина рисуется под ракетой, передняя — поверх, поэтому ракета
// пролетает «сквозь» отверстие. После пролёта sim удаляет кольцо, а ringFx оставляет его «призрак»: разрастается и гаснет.

import {
  ERA_SPECS, MASTER_HALF_WIDTH_PX, RING_EXTENT, TORUS, lampScreenPosition, masterSize, renderRingMaster,
} from './ringart.js';
import { clamp, smoothstep } from './util.js';

const GHOST_DURATION = 0.7; // с
const GHOST_DURATION_CALM = 0.3; // при reduceMotion: без расширения и ряби
const GLINT_COLORS = { center: '255,214,110', edge: '120,225,255' };

/** Высота отрисовки кольца в долях его полуширины: (2 * HH) / (2 * HW) по мастер-текстуре. */
export function ringAspect() {
  const [w, h] = masterSize();
  return h / w;
}

/** Мировая ширина мастер-текстуры для кольца с полушириной halfWidth (ед. мира): учитывает поля и хомуты. */
export function ringSpriteWidth(halfWidth) {
  const [w] = masterSize();
  return (w * halfWidth) / MASTER_HALF_WIDTH_PX;
}

function toCanvas(makeCanvas, pixels, width, height) {
  const canvas = makeCanvas(width, height);
  const g = canvas.getContext('2d');
  if (g && g.createImageData) {
    const image = g.createImageData(width, height);
    if (image && image.data) {
      image.data.set(pixels);
      g.putImageData(image, 0, 0);
    }
  }
  return canvas;
}

/** Кэш мастер-текстур колец: по одной паре слоёв (back/front) на эпоху, строятся при первом обращении. */
export function createRingCache(makeCanvas) {
  const entries = new Map();
  return {
    get size() {
      return entries.size;
    },
    clear() {
      entries.clear();
    },
    has(era) {
      return entries.has(clamp(era | 0, 0, 5));
    },
    /** { back, front } — ассеты { name, img, w, h, anchor } для painter.blit; lamps — огни эпохи с экранными позициями. */
    get(era) {
      const key = clamp(era | 0, 0, 5);
      let entry = entries.get(key);
      if (!entry) {
        const master = renderRingMaster(key);
        const { width, height } = master;
        const asset = (layer, pixels) => ({
          name: `ring_h_${key}_${layer}`, img: toCanvas(makeCanvas, pixels, width, height), w: width, h: height, anchor: [0.5, 0.5],
        });
        const lamps = ERA_SPECS[key].lamps.map((lamp) => {
          const position = lampScreenPosition(lamp, { x: 0, y: 0, front: false });
          return { ...lamp, nx: position.x, ny: position.y, front: position.front };
        });
        entry = { era: key, width, height, back: asset('back', master.back), front: asset('front', master.front), lamps };
        entries.set(key, entry);
      }
      return entry;
    },
  };
}

/** Яркость лампы 0..1 по роду и времени: blink — ровное мигание, pulse — плавное дыхание, chase — бегущий огонь. */
export function lampBrightness(lamp, time) {
  switch (lamp.kind) {
    case 'blink':
      return Math.floor(time * 1.6 + lamp.phase) % 2 === 0 ? 1 : 0.25;
    case 'pulse':
      return 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(time * 2.4 + lamp.phase));
    default: {
      const wave = Math.sin(time * 3.6 - lamp.phase * 2.2);
      return 0.35 + 0.65 * smoothstep(-0.2, 0.9, wave);
    }
  }
}

/** Состояние вспышек пролёта: sim удаляет пройденное кольцо, поэтому «призраки» живут здесь. */
export function createRingFx() {
  const ghosts = [];
  const MAX = 8;
  let clock = 0;
  return {
    ghosts,
    get clock() {
      return clock;
    },
    update(dt) {
      clock += dt;
      for (let i = ghosts.length - 1; i >= 0; i--) {
        if (clock - ghosts[i].t0 > ghosts[i].life) ghosts.splice(i, 1);
      }
    },
    clear() {
      ghosts.length = 0;
    },
    /**
     * Пролёт: e — событие sim { x, y, halfWidth, offset (0 центр .. 1 край), quality: 'center'|'edge' };
     * passX — где ракета пересекла плоскость кольца. Яркость вспышки падает с offset, у центра — шире и золотая.
     */
    trigger(e, passX, era, reduce) {
      if (ghosts.length >= MAX) ghosts.shift();
      const offset = clamp(e.offset ?? 0, 0, 1);
      ghosts.push({
        x: e.x, y: e.y, halfWidth: e.halfWidth || 60, passX: passX ?? e.x, era, t0: clock,
        life: reduce ? GHOST_DURATION_CALM : GHOST_DURATION, quality: e.quality === 'center' ? 'center' : 'edge',
        power: clamp(1 - 0.45 * offset, 0.4, 1), reduce: !!reduce,
      });
    },
  };
}

const GLOW_PX = 32;
const glowSprites = new Map();

/** Круглый мягкий блик цвета 'r,g,b' (кэш по цвету): рисуется аддитивно и масштабируется под лампу. */
function glowSprite(painter, color) {
  let sprite = glowSprites.get(color);
  if (!sprite) {
    sprite = painter.makeCanvas(GLOW_PX, GLOW_PX);
    const g = sprite.getContext('2d');
    const gradient = g.createRadialGradient(GLOW_PX / 2, GLOW_PX / 2, 0, GLOW_PX / 2, GLOW_PX / 2, GLOW_PX / 2);
    gradient.addColorStop(0, `rgba(${color},1)`);
    gradient.addColorStop(0.3, `rgba(${color},0.55)`);
    gradient.addColorStop(1, `rgba(${color},0)`);
    g.fillStyle = gradient;
    g.fillRect(0, 0, GLOW_PX, GLOW_PX);
    glowSprites.set(color, sprite);
  }
  return sprite;
}

function drawLamps(ctx, painter, view, o, entry, time, front) {
  const half = o.halfWidth;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.imageSmoothingEnabled = true;
  const s = view.S;
  for (const lamp of entry.lamps) {
    if (lamp.front !== front) continue;
    const b = lampBrightness(lamp, time);
    const sx = view.sx(o.x + (lamp.nx * half) / RING_EXTENT);
    const sy = view.sy(o.y - (lamp.ny * half) / RING_EXTENT);
    const radius = Math.max(4, half * 0.15 * s);
    ctx.globalAlpha = 0.55 * b;
    ctx.drawImage(glowSprite(painter, lamp.glow), sx - radius, sy - radius * 0.8, radius * 2, radius * 1.6);
  }
  ctx.restore();
}

/** Мягкое свечение «ворот» позади кольца: дышит, чтобы кольцо хотелось пролететь. */
export function ringGlow(ctx, view, o, time) {
  const pulse = 0.5 + 0.5 * Math.sin(time * 2.6 + (o.id | 0));
  const sx = view.sx(o.x);
  const sy = view.sy(o.y);
  const rx = (o.halfWidth || 40) * 1.18 * view.S;
  const ry = rx * ringAspect() * 1.1;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.translate(sx, sy);
  ctx.scale(1, ry / rx);
  const glow = ctx.createRadialGradient(0, 0, rx * 0.45, 0, 0, rx);
  glow.addColorStop(0, `rgba(120,220,255,${(0.04 + 0.07 * pulse).toFixed(3)})`);
  glow.addColorStop(1, 'rgba(120,220,255,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(-rx, -rx, rx * 2, rx * 2);
  ctx.restore();
}

/**
 * Половина кольца o: layer 'back' (под ракетой) или 'front' (поверх). extra: { scale, alpha, additive } для призрака.
 */
export function drawRingLayer(ctx, painter, view, cache, o, era, time, layer, extra) {
  const entry = cache.get(era);
  const front = layer === 'front';
  const half = (o.halfWidth || 38) * (extra && extra.scale ? extra.scale : 1);
  const scale = half / MASTER_HALF_WIDTH_PX;
  const uw = entry.width * scale;
  const uh = entry.height * scale;
  const alpha = extra && extra.alpha !== undefined ? extra.alpha : 1;
  const asset = front ? entry.front : entry.back;
  const sx = view.sx(extra && extra.x !== undefined ? extra.x : o.x);
  const sy = view.sy(extra && extra.y !== undefined ? extra.y : o.y);
  if (extra && extra.additive) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    painter.blit(ctx, view, asset, sx, sy, uw, uh, 0.5, 0.5, { alpha, smooth: false });
    ctx.restore();
  } else {
    painter.blit(ctx, view, asset, sx, sy, uw, uh, 0.5, 0.5, { alpha, smooth: false });
  }
  if (!extra) drawLamps(ctx, painter, view, o, entry, time, front);
}

/** Вспышки пролёта (призраки): слой 'back' или 'front'; ряби и луч рисуются в заднем слое. */
export function drawRingGhosts(ctx, painter, view, cache, fx, layer, time) {
  for (const g of fx.ghosts) {
    const age = fx.clock - g.t0;
    const k = clamp(age / g.life, 0, 1);
    const ease = 1 - (1 - k) * (1 - k);
    const o = { x: g.x, y: g.y, halfWidth: g.halfWidth };
    const fade = (1 - k) * (1 - k) * g.power;
    const grow = g.reduce ? 1 : 1 + 0.4 * ease;
    drawRingLayer(ctx, painter, view, cache, o, g.era, time, layer, { scale: grow, alpha: fade, additive: false });
    drawRingLayer(ctx, painter, view, cache, o, g.era, time, layer, { scale: grow, alpha: Math.min(1, fade * 1.25), additive: true });
    if (layer === 'back' && !g.reduce) drawRipple(ctx, view, g, k, ease);
  }
}

function drawRipple(ctx, view, g, k, ease) {
  const color = GLINT_COLORS[g.quality];
  const sx = view.sx(g.x);
  const sy = view.sy(g.y);
  const aspect = ringAspect() * 1.05;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineWidth = Math.max(1, Math.round(view.S * (g.quality === 'center' ? 2.4 : 1.6) * (1 - k * 0.6)));
  for (let ring = 0; ring < (g.quality === 'center' ? 2 : 1); ring++) {
    const delay = ring * 0.18;
    const kk = clamp((k - delay) / (1 - delay), 0, 1);
    if (kk <= 0) continue;
    const e = 1 - (1 - kk) * (1 - kk);
    const rx = g.halfWidth * view.S * (0.9 + 0.9 * e);
    ctx.strokeStyle = `rgba(${color},${(0.7 * (1 - kk) * g.power).toFixed(3)})`;
    ctx.beginPath();
    ctx.ellipse(sx, sy, rx, rx * aspect, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  if (g.quality === 'center') {
    // луч ворот: короткая колонна света вверх и вниз от центра
    const beam = g.halfWidth * view.S * 0.5;
    const height = g.halfWidth * view.S * 1.6 * (0.4 + 0.6 * ease);
    const gradient = ctx.createLinearGradient(0, sy - height, 0, sy + height);
    gradient.addColorStop(0, `rgba(${color},0)`);
    gradient.addColorStop(0.5, `rgba(${color},${(0.22 * (1 - k) * g.power).toFixed(3)})`);
    gradient.addColorStop(1, `rgba(${color},0)`);
    ctx.fillStyle = gradient;
    ctx.fillRect(view.sx(g.passX) - beam / 2, sy - height, beam, height * 2);
  }
  ctx.restore();
}

export { TORUS };
