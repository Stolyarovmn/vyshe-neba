// Текст интерфейса: пиксельный шрифт (font-pixel.js), целый масштаб без сглаживания, атласы глифов в offscreen,
// перенос слов, измерение. Системный шрифт и fillText не используются.

import { GLYPH_CHARS, GLYPH_H, ADVANCE, advanceOf, glyphRows, normalize, textUnits } from './font-pixel.js';

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

const MAX_ATLASES = 40;

export function createText() {
  let dpr = 1;
  // страж текста: пока он включён, каждая выведенная строка записывается (рамка, строка, область отсечения),
  // а обрезанные многоточием строки и выход за поля контейнера попадают в issues
  let audit = null;
  let clip = null;
  const atlases = new Map();
  const unitCache = new Map();

  /** Масштаб шрифта (CSS-пикселей на пиксель глифа) по «размеру» в CSS px: не меньше ×2 — мельче текст не рисуется никогда. */
  const scaleFor = (size) => Math.max(2, Math.round(size / 7));

  /** Пикселей устройства на пиксель глифа и тот же шаг в CSS-пикселях. */
  function stepFor(size) {
    const dev = Math.max(1, Math.round(scaleFor(size) * dpr));
    return { dev, css: dev / dpr };
  }

  function units(str) {
    let u = unitCache.get(str);
    if (u === undefined) {
      u = textUnits(str);
      if (unitCache.size > 6000) unitCache.clear();
      unitCache.set(str, u);
    }
    return u;
  }

  function atlasFor(dev, color, shadow) {
    const key = `${dev}|${color}|${shadow || ''}`;
    let at = atlases.get(key);
    if (at) {
      atlases.delete(key);
      atlases.set(key, at);
      return at;
    }
    const cellW = ADVANCE * dev;
    const cellH = (GLYPH_H + 1) * dev;
    const canvas = document.createElement('canvas');
    canvas.width = cellW * GLYPH_CHARS.length;
    canvas.height = cellH;
    const g = canvas.getContext('2d');
    const index = new Map();
    GLYPH_CHARS.forEach((ch, i) => {
      index.set(ch, i);
      const rows = glyphRows(ch);
      for (const [pass, col] of shadow ? [[1, shadow], [0, color]] : [[0, color]]) {
        g.fillStyle = col;
        rows.forEach((row, y) => {
          for (let x = 0; x < row.length; x++) if (row[x] === '#') g.fillRect(i * cellW + (x + pass) * dev, (y + pass) * dev, dev, dev);
        });
      }
    });
    at = { canvas, index, cellW, cellH };
    atlases.set(key, at);
    if (atlases.size > MAX_ATLASES) atlases.delete(atlases.keys().next().value);
    return at;
  }

  const setAudit = (a) => {
    audit = a;
  };
  const setClip = (r) => {
    clip = r;
  };

  function setDpr(v) {
    if (v !== dpr) {
      dpr = v;
      atlases.clear();
    }
  }

  const measure = (str, size) => units(normalize(str)) * stepFor(size).css;
  const measurer = (size) => (s) => measure(s, size);
  const wrap = (str, maxWidth, size) => wrapWords(str, maxWidth, measurer(size));

  /**
   * Подбор масштаба под ширину: уменьшает шаг до ×2 (minScale — выше, если нужен единый масштаб в группе кнопок), затем обрезает
   * многоточием. Мельче ×2 не бывает: слово, не влезающее в ×2, нужно сократить или дать ему больше места.
   */
  function fit(str, maxWidth, size, _weight, minScale) {
    const s0 = scaleFor(size);
    const floor = Math.min(s0, Math.max(2, minScale || 2));
    let s = s0;
    while (s > floor && measure(str, s * 7) > maxWidth) s--;
    const sz = s * 7;
    if (measure(str, sz) <= maxWidth) return { str, size: sz };
    return { str: ellipsize(str, maxWidth, measurer(sz)), size: sz };
  }

  /** Размер, при котором самое длинное слово помещается (не меньше ×1). */
  function fitWords(str, maxWidth, size) {
    const words = String(str).split(/\s+/);
    let s = scaleFor(size);
    while (s > 2 && words.some((w) => measure(w, s * 7) > maxWidth)) s--;
    return s * 7;
  }

  /**
   * Одна строка. Возвращает { w, h }. o: size, color, align (left|center|right), baseline (top|middle|bottom),
   * shadow (цвет тени), maxWidth (ужать/обрезать), alpha.
   */
  function draw(ctx, str, x, y, o = {}) {
    let size = o.size ?? 14;
    const { color = '#fff', align = 'left', baseline = 'middle', alpha = 1 } = o;
    let text = normalize(str);
    if (!text) return { w: 0, h: size, scale: scaleFor(size) };
    const original = text;
    if (o.maxWidth) {
      const f = fit(text, o.maxWidth, size);
      text = normalize(f.str);
      size = f.size;
    }
    const { dev, css } = stepFor(size);
    const total = units(text) * css;
    const lineH = size * 1.2;
    const glyphH = GLYPH_H * css;
    const top = baseline === 'top' ? y + (lineH - glyphH) / 2 : baseline === 'bottom' ? y - (lineH + glyphH) / 2 : y - glyphH / 2;
    let cx = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;
    const scale = scaleFor(size);
    if (audit && !o.noAudit) {
      const rect = { x: cx, y: top, w: total, h: glyphH, str: text, clip, scale, color: ctx.globalAlpha * alpha >= 0.99 ? color : null };
      if (scale < 2) audit.issues.push({ kind: 'tiny', str: text, rect });
      audit.rects.push(rect);
      if (text !== original && !o.allowCut) audit.issues.push({ kind: 'truncated', str: original, shown: text, rect });
      if (o.box) {
        const m = 2 * css;
        const b = o.box;
        if (cx < b.x + m - 0.01 || cx + total > b.x + b.w - m + 0.01 || top < b.y + css - 0.01 || top + glyphH > b.y + b.h - css + 0.01) audit.issues.push({ kind: 'margin', str: text, rect, box: b });
      }
    }
    const shadow = o.shadow || o.outline ? (typeof (o.shadow || o.outline) === 'string' ? o.shadow || o.outline : '#05070e') : null;
    const at = atlasFor(dev, color, shadow ? '#05070e' : null);
    const prevAlpha = ctx.globalAlpha;
    if (alpha !== 1) ctx.globalAlpha = prevAlpha * alpha;
    const prevSmooth = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = false;
    const snap = (v) => Math.round(v * dpr) / dpr;
    const dy = snap(top);
    for (const ch of text) {
      const i = at.index.get(ch);
      if (i !== undefined) ctx.drawImage(at.canvas, i * at.cellW, 0, at.cellW, at.cellH, snap(cx), dy, at.cellW / dpr, at.cellH / dpr);
      cx += advanceOf(ch) * css;
    }
    ctx.imageSmoothingEnabled = prevSmooth;
    if (alpha !== 1) ctx.globalAlpha = prevAlpha;
    return { w: total, h: lineH, scale };
  }

  /** Абзац с переносом. Возвращает занятую высоту. */
  function block(ctx, str, x, y, maxWidth, o = {}) {
    const size = o.size ?? 14;
    const lh = Math.max(size * (o.lineHeight ?? 1.4), stepFor(size).css * 9);
    const lines = wrap(str, maxWidth, size);
    const max = o.maxLines ?? Infinity;
    const shown = lines.length > max ? lines.slice(0, max) : lines;
    if (lines.length > max) {
      shown[max - 1] = ellipsize(`${shown[max - 1]} ${lines[max]}`, maxWidth, measurer(size));
      if (audit && !o.allowCut) audit.issues.push({ kind: 'truncated', str: String(str), shown: shown[max - 1], rect: { x, y, w: maxWidth, h: lh, str: shown[max - 1], clip } });
    }
    const ax = o.align === 'center' ? x + maxWidth / 2 : o.align === 'right' ? x + maxWidth : x;
    shown.forEach((ln, i) => draw(ctx, ln, ax, y + i * lh, { ...o, baseline: 'top', maxWidth: undefined }));
    return shown.length * lh;
  }

  /** Шаг строк абзаца: не меньше 1,25 высоты строки (7 клеток шрифта + 2 клетки зазора). */
  function lineStep(size, lineHeight = 1.4) {
    return Math.max(size * lineHeight, stepFor(size).css * 9);
  }

  function blockHeight(str, maxWidth, size, lineHeight = 1.4) {
    return wrap(str, maxWidth, size).length * Math.max(size * lineHeight, stepFor(size).css * 9);
  }

  return {
    draw, block, blockHeight, measure, wrap, fit, fitWords, setDpr, scaleFor, stepFor, setAudit, setClip, lineStep, clear: () => atlases.clear(),
    get cacheSize() { return atlases.size; },
  };
}
