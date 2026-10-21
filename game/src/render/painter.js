// Рисование спрайтов и примитивов в единицах мира с привязкой к пикселям устройства.
//
// Painter знает хранилище ассетов и кэш уменьшенных спрайтов. Все методы принимают
// `view` (см. camera.js): преобразование мир -> пиксели устройства.

import { createSpriteCache, defaultMakeCanvas } from './assets.js';

export function createPainter(assets, makeCanvas) {
  const cache = createSpriteCache(makeCanvas);
  const tintCache = new Map();
  const create = makeCanvas || defaultMakeCanvas;

  /** Размер спрайта в единицах мира по заданной высоте или ширине. */
  function unitSize(asset, h, w) {
    if (h !== undefined && w !== undefined) return [w, h];
    if (h !== undefined) return [h * asset.w / asset.h, h];
    if (w !== undefined) return [w, w * asset.h / asset.w];
    return [asset.w, asset.h];
  }

  const painter = {
    assets,
    cache,
    makeCanvas: create,

    has(name) {
      return assets.has(name);
    },

    /**
     * Спрайт в мировой точке. opts: { h | w (ед. мира), ax, ay (якорь, по умолчанию из ассета),
     * angle, flipX, alpha, tint }. Возвращает true, если нарисован.
     */
    sprite(ctx, view, name, wx, wy, opts = {}) {
      const asset = assets.get(name);
      if (!asset) return false;
      const [uw, uh] = unitSize(asset, opts.h, opts.w);
      const ax = opts.ax ?? asset.anchor[0];
      const ay = opts.ay ?? asset.anchor[1];
      return painter.blit(ctx, view, asset, view.sx(wx), view.sy(wy), uw, uh, ax, ay, opts);
    },

    /** Спрайт в экранной точке (пиксели устройства); размер задаётся в пикселях устройства. */
    spriteScreen(ctx, view, name, sx, sy, devH, opts = {}) {
      const asset = assets.get(name);
      if (!asset) return false;
      const devW = devH * asset.w / asset.h;
      const ax = opts.ax ?? 0.5;
      const ay = opts.ay ?? 0.5;
      return painter.blitDev(ctx, asset, sx, sy, devW, devH, ax, ay, opts);
    },

    /** Исходник для рисования спрайта размером uw x uh единиц в этом виде (с ступенчатым масштабом карты). */
    sourceFor(view, asset, uw, uh, tint, hue) {
      let baseW = uw * view.px;
      let baseH = uh * view.px;
      if (view.quantizeScale) {
        // Масштаб карты плавно меняется (зум, высота): уменьшенные копии берём ступенями 6 %,
        // иначе кэш пересоздавался бы каждый кадр.
        const q = quantizeSize(baseW);
        baseH = (baseH * q) / baseW;
        baseW = q;
      }
      return painter.source(asset, baseW, baseH, tint, hue);
    },

    blit(ctx, view, asset, sx, sy, uw, uh, ax, ay, opts) {
      const src = painter.sourceFor(view, asset, uw, uh, opts.tint, opts.hue);
      const smooth = opts.smooth ?? view.smooth;
      return painter.blitSource(ctx, src, sx, sy, uw * view.S, uh * view.S, ax, ay, opts, smooth);
    },

    blitDev(ctx, asset, sx, sy, devW, devH, ax, ay, opts) {
      const src = painter.source(asset, devW, devH, opts.tint, opts.hue);
      return painter.blitSource(ctx, src, sx, sy, devW, devH, ax, ay, opts);
    },

    blitSource(ctx, src, sx, sy, dw, dh, ax, ay, opts, smooth) {
      const w = Math.max(1, Math.round(dw));
      const h = Math.max(1, Math.round(dh));
      const alpha = opts.alpha ?? 1;
      if (alpha <= 0) return true;
      const angle = opts.angle || 0;
      const flip = opts.flipX ? -1 : 1;
      if (alpha < 1) ctx.globalAlpha *= alpha;
      const wasSmooth = ctx.imageSmoothingEnabled;
      if (smooth !== undefined && smooth !== wasSmooth) ctx.imageSmoothingEnabled = !!smooth;
      if (angle || flip < 0) {
        ctx.save();
        ctx.translate(sx, sy);
        if (angle) ctx.rotate(angle);
        if (flip < 0) ctx.scale(-1, 1);
        ctx.drawImage(src, -Math.round(ax * w), -Math.round(ay * h), w, h);
        ctx.restore();
      } else {
        ctx.drawImage(src, sx - Math.round(ax * w), sy - Math.round(ay * h), w, h);
      }
      if (smooth !== undefined && smooth !== wasSmooth) ctx.imageSmoothingEnabled = wasSmooth;
      if (alpha < 1) ctx.globalAlpha /= alpha;
      return true;
    },

    /** Исходник для рисования: уменьшенная копия (при необходимости с оттенком). */
    source(asset, w, h, tint, hue) {
      let scaled = cache.scaled(asset, w, h);
      if (hue) scaled = hueShifted(asset, scaled, w, h, hue);
      if (!tint) return scaled;
      return tinted(asset, scaled, w, h, tint, hue);
    },

    /** Точная ширина в единицах мира для высоты h (по пропорциям PNG). */
    widthFor(name, h) {
      const asset = assets.get(name);
      return asset ? h * asset.w / asset.h : h;
    },
  };

  /** Оттенённая копия: tint = { r, g, b, a } с мягким слоем «source-atop» (кэшируется по ключу). */
  function tinted(asset, scaled, w, h, tint, hue) {
    const level = Math.round(tint.a * 8) / 8;
    const key = `${asset.name}|${Math.round(w)}x${Math.round(h)}|${tint.r},${tint.g},${tint.b},${level}|${hue || 0}`;
    let entry = tintCache.get(key);
    if (!entry) {
      if (tintCache.size > 300) tintCache.clear();
      const width = Math.max(1, Math.round(w));
      const height = Math.max(1, Math.round(h));
      entry = create(width, height);
      const g = entry.getContext('2d');
      g.imageSmoothingEnabled = false;
      g.drawImage(scaled, 0, 0, width, height);
      g.globalCompositeOperation = 'source-atop';
      g.fillStyle = `rgba(${tint.r},${tint.g},${tint.b},${level})`;
      g.fillRect(0, 0, width, height);
      tintCache.set(key, entry);
    }
    return entry;
  }

  /** Копия спрайта со сдвигом оттенка (раскраски ракеты); без ctx.filter, чтобы работало везде. */
  function hueShifted(asset, scaled, w, h, hue) {
    const width = Math.max(1, Math.round(w));
    const height = Math.max(1, Math.round(h));
    const key = `${asset.name}|${width}x${height}|hue${hue}`;
    let entry = tintCache.get(key);
    if (!entry) {
      if (tintCache.size > 300) tintCache.clear();
      entry = create(width, height);
      const g = entry.getContext('2d', { willReadFrequently: true });
      g.imageSmoothingEnabled = false;
      g.drawImage(scaled, 0, 0, width, height);
      const data = g.getImageData(0, 0, width, height);
      rotateHue(data.data, hue);
      g.putImageData(data, 0, 0);
      tintCache.set(key, entry);
    }
    return entry;
  }

  return painter;
}

/** Поворот оттенка в RGBA-массиве по матрице CSS hue-rotate. */
export function rotateHue(pixels, degrees) {
  const a = (degrees * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const m = [
    0.213 + cos * 0.787 - sin * 0.213, 0.715 - cos * 0.715 - sin * 0.715, 0.072 - cos * 0.072 + sin * 0.928,
    0.213 - cos * 0.213 + sin * 0.143, 0.715 + cos * 0.285 + sin * 0.14, 0.072 - cos * 0.072 - sin * 0.283,
    0.213 - cos * 0.213 - sin * 0.787, 0.715 - cos * 0.715 + sin * 0.715, 0.072 + cos * 0.928 + sin * 0.072,
  ];
  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    pixels[i] = clampByte(m[0] * r + m[1] * g + m[2] * b);
    pixels[i + 1] = clampByte(m[3] * r + m[4] * g + m[5] * b);
    pixels[i + 2] = clampByte(m[6] * r + m[7] * g + m[8] * b);
  }
  return pixels;
}

function clampByte(v) {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

const SIZE_STEP = Math.log(1.06);

/** Ширина, округлённая до ступени геометрической сетки (шаг 6 %). */
export function quantizeSize(width) {
  return Math.round(Math.exp(Math.round(Math.log(Math.max(1, width)) / SIZE_STEP) * SIZE_STEP));
}

/** Прямоугольник в мировых координатах, привязанный к пикселям устройства без зазоров. */
export function fillWorldRect(ctx, view, wx, wy, ww, wh, color) {
  const x0 = view.sx(wx);
  const y0 = view.sy(wy);
  const x1 = view.sx(wx + ww);
  const y1 = view.sy(wy + wh);
  ctx.fillStyle = color;
  ctx.fillRect(x0, y0, Math.max(1, x1 - x0), Math.max(1, y1 - y0));
}
