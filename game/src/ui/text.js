// Текст на canvas: жирный гротеск системного шрифта, растеризация в повышенном разрешении
// с кэшем (статичные строки) и прямым выводом (меняющиеся числа HUD), перенос слов, измерение.

import { FONT_FAMILY } from './theme.js';

const MAX_CACHE = 500;

/** Перенос по словам. measure(str) -> ширина. Длинные слова режутся по символам. Чистая функция. */
export function wrapWords(str, maxWidth, measure) {
  const out = [];
  for (const para of String(str).split('\n')) {
    const words = para.split(/(?<=[  ])|(?<=-)/u).filter((w) => w.length);
    let line = '';
    for (const word of words) {
      const trial = line + word;
      if (line && measure(trial.trimEnd()) > maxWidth) {
        out.push(line.trimEnd());
        line = word;
      } else {
        line = trial;
      }
      while (measure(line.trimEnd()) > maxWidth && line.length > 1) {
        let cut = line.length - 1;
        while (cut > 1 && measure(line.slice(0, cut)) > maxWidth) cut--;
        out.push(line.slice(0, cut));
        line = line.slice(cut);
      }
    }
    out.push(line.trimEnd());
  }
  return out;
}

/** Обрезка с многоточием по ширине. */
export function ellipsize(str, maxWidth, measure) {
  if (measure(str) <= maxWidth) return str;
  let lo = 0;
  let hi = str.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (measure(`${str.slice(0, mid)}…`) <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return `${str.slice(0, lo).trimEnd()}…`;
}

export function createText() {
  let scale = 2;
  let dpr = 1;
  let mctx = null;
  const widths = new Map();
  const bitmaps = new Map();

  function measureCtx() {
    if (!mctx) mctx = document.createElement('canvas').getContext('2d');
    return mctx;
  }

  const fontOf = (size, weight) => `${weight} ${size}px ${FONT_FAMILY}`;

  function setDpr(value) {
    if (value === dpr) return;
    dpr = value;
    scale = Math.max(2, Math.ceil(dpr));
    bitmaps.clear();
  }

  function measure(str, size, weight = 800) {
    const key = `${size}|${weight}|${str}`;
    let w = widths.get(key);
    if (w === undefined) {
      const c = measureCtx();
      c.font = fontOf(size, weight);
      w = c.measureText(str).width;
      if (widths.size > 4000) widths.clear();
      widths.set(key, w);
    }
    return w;
  }

  const measurer = (size, weight) => (s) => measure(s, size, weight);

  function wrap(str, maxWidth, size, weight = 800) {
    return wrapWords(str, maxWidth, measurer(size, weight));
  }

  function fit(str, maxWidth, size, weight = 800, minScale = 0.72) {
    let s = size;
    const min = Math.max(8, size * minScale);
    while (s > min && measure(str, s, weight) > maxWidth) s -= 0.5;
    if (measure(str, s, weight) > maxWidth) return { str: ellipsize(str, maxWidth, measurer(s, weight)), size: s };
    return { str, size: s };
  }

  function bitmapFor(str, size, weight, color, shadow, outline) {
    const key = `${size}|${weight}|${color}|${shadow || ''}|${outline || ''}|${str}`;
    let bm = bitmaps.get(key);
    if (bm) {
      bitmaps.delete(key);
      bitmaps.set(key, bm);
      return bm;
    }
    const pad = Math.ceil(size * 0.2) + (shadow ? Math.ceil(size * 0.12) : 0) + (outline ? 2 : 0);
    const w = Math.ceil(measure(str, size, weight)) + pad * 2;
    const h = Math.ceil(size * 1.4) + pad * 2;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.ceil(w * scale));
    canvas.height = Math.max(1, Math.ceil(h * scale));
    const c = canvas.getContext('2d');
    c.scale(scale, scale);
    c.font = fontOf(size, weight);
    c.textBaseline = 'middle';
    c.textAlign = 'left';
    c.lineJoin = 'round';
    const cy = h / 2;
    if (shadow) {
      c.fillStyle = shadow;
      c.fillText(str, pad, cy + Math.max(1, size * 0.09));
    }
    if (outline) {
      c.strokeStyle = outline;
      c.lineWidth = Math.max(2, size * 0.16);
      c.strokeText(str, pad, cy);
    }
    c.fillStyle = color;
    c.fillText(str, pad, cy);
    bm = { canvas, w, h, pad };
    bitmaps.set(key, bm);
    if (bitmaps.size > MAX_CACHE) bitmaps.delete(bitmaps.keys().next().value);
    return bm;
  }

  const snap = (v) => Math.round(v * dpr) / dpr;

  /**
   * Одна строка. Возвращает { w, h } занятой области (в CSS-пикселях).
   * o: size, weight, color, align (left|center|right), baseline (top|middle|bottom), shadow, outline,
   *    maxWidth (ужать/обрезать), alpha, dynamic (не кэшировать)
   */
  function draw(ctx, str, x, y, o = {}) {
    str = String(str ?? '');
    let { size = 16 } = o;
    const { weight = 800, color = '#fff', align = 'left', baseline = 'middle', shadow, outline, alpha = 1, dynamic } = o;
    if (!str) return { w: 0, h: size };
    if (o.maxWidth) {
      const f = fit(str, o.maxWidth, size, weight);
      str = f.str;
      size = f.size;
    }
    const tw = measure(str, size, weight);
    const lineH = size * 1.2;
    const cy = baseline === 'top' ? y + lineH / 2 : baseline === 'bottom' ? y - lineH / 2 : y;
    const prevAlpha = ctx.globalAlpha;
    if (alpha !== 1) ctx.globalAlpha = prevAlpha * alpha;
    if (dynamic) {
      ctx.font = fontOf(size, weight);
      ctx.textBaseline = 'middle';
      ctx.textAlign = align;
      ctx.lineJoin = 'round';
      const px = snap(x);
      const py = snap(cy);
      if (shadow) {
        ctx.fillStyle = shadow;
        ctx.fillText(str, px, py + Math.max(1, size * 0.09));
      }
      if (outline) {
        ctx.strokeStyle = outline;
        ctx.lineWidth = Math.max(2, size * 0.16);
        ctx.strokeText(str, px, py);
      }
      ctx.fillStyle = color;
      ctx.fillText(str, px, py);
    } else {
      const bm = bitmapFor(str, size, weight, color, shadow, outline);
      const left = align === 'center' ? x - bm.w / 2 : align === 'right' ? x - (bm.w - bm.pad) : x - bm.pad;
      ctx.drawImage(bm.canvas, snap(left), snap(cy - bm.h / 2), bm.w, bm.h);
    }
    if (alpha !== 1) ctx.globalAlpha = prevAlpha;
    return { w: tw, h: lineH };
  }

  /** Абзац с переносом. Возвращает занятую высоту. */
  function block(ctx, str, x, y, maxWidth, o = {}) {
    const size = o.size ?? 16;
    const lh = size * (o.lineHeight ?? 1.25);
    const lines = wrap(str, maxWidth, size, o.weight ?? 800);
    const max = o.maxLines ?? Infinity;
    const shown = lines.length > max ? lines.slice(0, max) : lines;
    if (lines.length > max) shown[max - 1] = ellipsize(`${shown[max - 1]} ${lines[max]}`, maxWidth, measurer(size, o.weight ?? 800));
    const ax = o.align === 'center' ? x + maxWidth / 2 : o.align === 'right' ? x + maxWidth : x;
    shown.forEach((ln, i) => draw(ctx, ln, ax, y + i * lh, { ...o, baseline: 'top', maxWidth: undefined }));
    return shown.length * lh;
  }

  function blockHeight(str, maxWidth, size, lineHeight = 1.25, weight = 800) {
    return wrap(str, maxWidth, size, weight).length * size * lineHeight;
  }

  return { draw, block, blockHeight, measure, wrap, fit, setDpr, clear: () => bitmaps.clear(), get cacheSize() { return bitmaps.size; } };
}
