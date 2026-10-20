// UI-тулкит на canvas: режим «немедленной отрисовки» с областями нажатия по id.
// Кадр N обрабатывает события по областям кадра N-1 (верхний слой, затем более поздняя отрисовка),
// виджеты читают результат (clicked/hover/press) и рисуют себя. Всё в CSS-пикселях.

import { createText } from './text.js';
import { drawSegments, segmentWidth } from './font-pixel.js';
import { createIcons, hasIcon } from './icons.js';
import { getTheme, mix } from './theme.js';
import * as Scroll from './scroll.js';
import { clamp, damp, easeOutCubic, fmtCompact, fmtStat, fmtInt } from './format.js';
import { intersect } from './layout.js';
import { t } from '../i18n/index.js';

const TAP_SLOP = 9;


export function createKit({ sfx = () => {} } = {}) {
  const text = createText();
  const icons = createIcons();
  const anims = new Map();
  const scrolls = new Map();

  const S = {
    ctx: null,
    L: null,
    th: null,
    settings: {},
    time: 0,
    dt: 0,
    frame: 0,
    hits: [],
    prevHits: [],
    pointer: { x: -999, y: -999, type: 'mouse', inside: false },
    press: null,
    clicked: null,
    clickPos: null,
    hover: null,
    hoverSince: 0,
    layer: 0,
    clips: [],
    focusId: null,
    focusVisible: false,
    back: false,
    denied: null,
    tipCandidate: null,
    cursor: 'default',
    sliderDrag: null,
    modalOpen: false,
  };

  // ---------- кадр ----------

  function begin(ctx, frame) {
    S.ctx = ctx;
    S.L = frame.L;
    S.settings = frame.settings || {};
    S.th = getTheme(S.settings);
    S.time = frame.time;
    S.dt = Math.min(0.1, frame.dt || 0);
    S.frame++;
    text.setDpr(frame.L.dpr);
    icons.setDpr(frame.L.dpr);
    S.prevHits = S.hits;
    S.hits = [];
    S.layer = 0;
    S.clips.length = 0;
    S.clicked = null;
    S.clickPos = null;
    S.emptyTap = null;
    S.dragDx = 0;
    S.dragDy = 0;
    S.pinch = null;
    S.wheel = null;
    S.dtap = null;
    S.denied = null;
    S.back = false;
    S.tipCandidate = null;
    S.cursor = 'default';
    S.modalOpen = S.prevHits.some((h) => h.id === 'barrier');
    for (const e of frame.events || []) handleEvent(e);
    S.hover = S.pointer.inside && (S.pointer.type === 'mouse' || S.press) ? pick(S.pointer.x, S.pointer.y)?.id ?? null : null;
    if (S.hover !== S.lastHover) {
      S.lastHover = S.hover;
      S.hoverSince = S.time;
      if (S.hover && S.pointer.type === 'mouse' && S.hover !== 'barrier') sfx('hover');
    }
    for (const [id, s] of scrolls) {
      if (s.lastFrame !== S.frame - 1 && s.lastFrame !== S.frame) continue;
      Scroll.update(s, S.dt);
      s.updatedFrame = S.frame;
    }
  }

  function end() {
    drawSparks();
    drawToasts();
    drawTooltip();
    S.ctx = null;
    S.prevClicked = S.clicked;
  }

  // ---------- события ----------

  function pick(x, y, filter) {
    let best = null;
    for (const h of S.prevHits) {
      if (x < h.x || y < h.y || x >= h.x + h.w || y >= h.y + h.h) continue;
      if (filter && !filter(h)) continue;
      if (!best || h.layer >= best.layer) best = h;
    }
    return best;
  }

  function scrollState(id) {
    let s = scrolls.get(id);
    if (!s) {
      s = Scroll.createScroll();
      scrolls.set(id, s);
    }
    return s;
  }

  function handleEvent(e) {
    if (e.type === 'move' || e.type === 'down' || e.type === 'up') {
      S.pointer.x = e.x;
      S.pointer.y = e.y;
      S.pointer.type = e.pointerType || 'mouse';
      S.pointer.inside = true;
    }
    switch (e.type) {
      case 'down': {
        const hit = pick(e.x, e.y);
        const top = hit?.layer ?? 0;
        const sc = pick(e.x, e.y, (h) => h.scroll && h.layer >= top);
        S.press = { id: hit?.id ?? null, hit, scrollId: sc?.id ?? null, capture: !!hit?.capture, x: e.x, y: e.y, lastY: e.y, moved: false, scrolling: false, cancelled: false, t: S.time };
        S.focusVisible = false;
        if (hit?.capture) S.sliderDrag = { id: hit.id, x: e.x, y: e.y };
        if (hit && hit.id !== 'barrier') sfx('press');
        break;
      }
      case 'move': {
        const p = S.press;
        if (!p) break;
        if (S.sliderDrag) {
          S.sliderDrag.x = e.x;
          S.sliderDrag.y = e.y;
          break;
        }
        if (!p.id) {
          S.dragDx += e.x - (p.lastX ?? p.x);
          S.dragDy += e.y - (p.lastYd ?? p.y);
          p.lastX = e.x;
          p.lastYd = e.y;
        }
        const dist = Math.hypot(e.x - p.x, e.y - p.y);
        if (!p.moved && dist > TAP_SLOP) {
          p.moved = true;
          if (p.scrollId && !p.capture) {
            p.scrolling = true;
            p.cancelled = true;
            Scroll.dragStart(scrollState(p.scrollId));
          } else if (!p.capture) {
            p.cancelled = true;
          }
        }
        if (p.scrolling) {
          Scroll.dragMove(scrollState(p.scrollId), e.y - p.lastY, S.time);
          p.lastY = e.y;
        }
        break;
      }
      case 'up': {
        const p = S.press;
        S.press = null;
        if (S.sliderDrag) {
          S.sliderDrag.released = true;
        }
        if (!p) break;
        if (p.scrolling) {
          Scroll.dragEnd(scrollState(p.scrollId));
          break;
        }
        if (!p.id && !p.moved) S.emptyTap = { x: e.x, y: e.y };
        if (!p.cancelled && p.id) {
          const hit = pick(e.x, e.y);
          if (hit && hit.id === p.id) {
            S.clicked = p.id;
            S.clickPos = { x: e.x, y: e.y };
          }
        }
        break;
      }
      case 'cancel': {
        if (S.press?.scrolling) Scroll.dragEnd(scrollState(S.press.scrollId));
        S.press = null;
        S.sliderDrag = null;
        break;
      }
      case 'leave':
        S.pointer.inside = false;
        break;
      case 'wheel': {
        const sc = pick(e.x, e.y, (h) => h.scroll);
        if (sc) Scroll.wheel(scrollState(sc.id), e.dy);
        else S.wheel = { dy: (S.wheel?.dy || 0) + e.dy, x: e.x, y: e.y };
        break;
      }
      case 'nav':
        navigate(e.dir);
        break;
      case 'activate':
        if (S.focusId && S.prevHits.some((h) => h.id === S.focusId)) {
          S.clicked = S.focusId;
          sfx('press');
        }
        break;
      case 'back':
        S.back = true;
        break;
      case 'pinch':
        S.pinch = { factor: (S.pinch?.factor ?? 1) * (e.factor || 1), x: e.x, y: e.y };
        break;
      case 'dtap':
        S.dtap = { x: e.x, y: e.y };
        break;
      default:
    }
  }

  function navigate(dir) {
    S.focusVisible = true;
    const topLayer = S.prevHits.reduce((m, h) => Math.max(m, h.layer), 0);
    const cands = S.prevHits.filter((h) => h.focusable && h.layer === topLayer && h.w > 0 && h.h > 0);
    if (!cands.length) return;
    const cur = cands.find((h) => h.id === S.focusId);
    if (cur?.slider && (dir === 'left' || dir === 'right')) {
      // на ползунке стрелки меняют значение
      S.sliderNudge = { id: cur.id, delta: dir === 'right' ? 0.05 : -0.05 };
      return;
    }
    if (!cur) {
      cands.sort((a, b) => a.y - b.y || a.x - b.x);
      S.focusId = cands[0].id;
      return;
    }
    const cx = cur.x + cur.w / 2;
    const cy = cur.y + cur.h / 2;
    let best = null;
    let bestScore = Infinity;
    for (const c of cands) {
      if (c === cur) continue;
      const dx = c.x + c.w / 2 - cx;
      const dy = c.y + c.h / 2 - cy;
      const along = dir === 'right' ? dx : dir === 'left' ? -dx : dir === 'down' ? dy : -dy;
      const across = dir === 'left' || dir === 'right' ? Math.abs(dy) : Math.abs(dx);
      if (along <= 1) continue;
      const score = along + across * 2.2;
      if (score < bestScore) {
        bestScore = score;
        best = c;
      }
    }
    if (best) {
      S.focusId = best.id;
      sfx('hover');
    }
  }

  // ---------- области нажатия ----------

  function hit(id, r, flags = {}) {
    let rr = r;
    const clip = S.clips[S.clips.length - 1];
    if (clip) {
      rr = intersect(r, clip);
      if (!rr) return;
    }
    S.hits.push({ id, x: rr.x, y: rr.y, w: rr.w, h: rr.h, fw: r.w, fh: r.h, layer: S.layer, ...flags });
  }

  function pushClip(r) {
    const ctx = S.ctx;
    ctx.save();
    ctx.beginPath();
    ctx.rect(r.x, r.y, r.w, r.h);
    ctx.clip();
    const prev = S.clips[S.clips.length - 1];
    S.clips.push(prev ? intersect(prev, r) || { x: 0, y: 0, w: 0, h: 0 } : r);
  }

  function popClip() {
    S.ctx.restore();
    S.clips.pop();
  }

  function withLayer(layer, fn) {
    const prev = S.layer;
    S.layer = layer;
    fn();
    S.layer = prev;
  }

  function isPressed(id) {
    return !!S.press && S.press.id === id && !S.press.cancelled && (S.press.hit ? true : false);
  }

  function anim(id) {
    let a = anims.get(id);
    if (!a) {
      a = { hover: 0, press: 0, flash: 0, shake: 0, born: S.time };
      anims.set(id, a);
      if (anims.size > 600) anims.delete(anims.keys().next().value);
    }
    return a;
  }

  function stepAnim(id) {
    const a = anim(id);
    const hovering = S.hover === id;
    const pressing = isPressed(id) && hovering;
    a.hover = damp(a.hover, hovering ? 1 : 0, 16, S.dt);
    a.press = damp(a.press, pressing ? 1 : 0, 34, S.dt);
    a.flash = Math.max(0, a.flash - S.dt * 3);
    a.shake = Math.max(0, a.shake - S.dt * 3.5);
    return a;
  }

  // ---------- примитивы ----------

  const px = () => S.L.px;
  const cell = () => S.L.cell;
  const fs = (n) => Math.round(n * S.L.ui * (S.settings.textScale || 1));

  function rect(x, y, w, h, color) {
    S.ctx.fillStyle = color;
    S.ctx.fillRect(x, y, w, h);
  }

  function drawText(str, x, y, o = {}) {
    const c = S.th.c;
    return text.draw(S.ctx, str, x, y, { size: fs(14), color: c.text, ...o });
  }

  function paragraph(str, x, y, w, o = {}) {
    const c = S.th.c;
    return text.block(S.ctx, str, x, y, w, { size: fs(13), color: c.textDim, ...o });
  }

  function icon(name, cx, cy, size, color, alpha = 1) {
    const col = color || S.th.c.text;
    return icons.draw(S.ctx, hasIcon(name) ? name : 'info', cx, cy, size, col, alpha);
  }

  // шашечный узор «стекла»: тёмные пиксели через один, остальное — фон сцены
  const dithers = new Map();
  function ditherPattern(color, cc) {
    const dpr = S.L.dpr;
    const key = `${color}|${cc}|${dpr}`;
    let p = dithers.get(key);
    if (!p) {
      const dev = Math.max(1, Math.round(cc * dpr));
      const tile = document.createElement('canvas');
      tile.width = tile.height = dev * 2;
      const g = tile.getContext('2d');
      g.fillStyle = color;
      g.fillRect(0, 0, dev, dev);
      g.fillRect(dev, dev, dev, dev);
      p = S.ctx.createPattern(tile, 'repeat');
      p.setTransform(new DOMMatrix().scale(1 / dpr));
      dithers.set(key, p);
    }
    return p;
  }

  /**
   * Пиксельная рамка из трёх тонов: контур 1 пиксель, свет сверху-слева (hi), тень снизу-справа (lo),
   * ступенчатые углы, заклёпки на крупных. Без скруглений, градиентов и сглаживания.
   */
  function nine(variant, x, y, w, h) {
    const ctx = S.ctx;
    const f = S.th.variants[variant] || S.th.variants.panel;
    x = Math.round(x);
    y = Math.round(y);
    w = Math.round(w);
    h = Math.round(h);
    const cc = Math.max(1, Math.min(cell(), Math.floor(Math.min(w, h) / 8)));
    if (w < cc * 4 || h < cc * 4) {
      rect(x, y, w, h, f.edge);
      return;
    }
    // тело
    if (f.dither) {
      ctx.fillStyle = ditherPattern(f.mid, cc);
      ctx.fillRect(x + cc, y + cc, w - cc * 2, h - cc * 2);
    } else rect(x + cc, y + cc, w - cc * 2, h - cc * 2, f.mid);
    // свет и тень
    rect(x + cc, y + cc, w - cc * 2, cc, f.hi);
    rect(x + cc, y + cc, cc, h - cc * 2, f.hi);
    rect(x + cc, y + h - cc * 2, w - cc * 2, cc, f.lo);
    rect(x + w - cc * 2, y + cc, cc, h - cc * 2, f.lo);
    // контур со ступенчатыми углами
    ctx.fillStyle = f.edge;
    ctx.fillRect(x + cc * 2, y, w - cc * 4, cc);
    ctx.fillRect(x + cc * 2, y + h - cc, w - cc * 4, cc);
    ctx.fillRect(x, y + cc * 2, cc, h - cc * 4);
    ctx.fillRect(x + w - cc, y + cc * 2, cc, h - cc * 4);
    ctx.fillRect(x + cc, y + cc, cc, cc);
    ctx.fillRect(x + w - cc * 2, y + cc, cc, cc);
    ctx.fillRect(x + cc, y + h - cc * 2, cc, cc);
    ctx.fillRect(x + w - cc * 2, y + h - cc * 2, cc, cc);
    // заклёпки
    if (f.rivets && w >= cc * 16 && h >= cc * 12) {
      const o = cc * 3;
      for (const [rx, ry] of [[x + o, y + o], [x + w - o - cc, y + o], [x + o, y + h - o - cc], [x + w - o - cc, y + h - o - cc]]) {
        rect(rx, ry, cc, cc, f.hi);
        rect(rx + cc, ry + cc, cc, cc, f.edge);
      }
    }
  }

  /** Панель с жёсткой тенью и необязательным заголовком. Возвращает внутреннюю область. */
  function panel(r, o = {}) {
    const { variant = 'panel', title, titleIcon, shadow = true, pad } = o;
    const cc = cell();
    if (!o.passthrough) hit(`panel@${Math.round(r.x)},${Math.round(r.y)}`, r, {});
    if (shadow) {
      S.ctx.globalAlpha = 0.5;
      rect(r.x + cc * 2, r.y + cc * 2, r.w, r.h, S.th.c.ink);
      S.ctx.globalAlpha = 1;
    }
    nine(variant, r.x, r.y, r.w, r.h);
    const p = pad ?? S.L.pad;
    let inner = { x: r.x + p, y: r.y + p, w: r.w - p * 2, h: r.h - p * 2 };
    if (title) {
      const c = S.th.c;
      const th = Math.max(cc * 9, Math.round(fs(24)));
      nine('screen', r.x + cc * 2, r.y + cc * 2, r.w - cc * 4, th);
      let tx = r.x + p;
      if (titleIcon) {
        icon(titleIcon, tx + th * 0.4, r.y + cc * 2 + th / 2, Math.round(th * 0.8), c.amber);
        tx += th * 0.9;
      }
      drawText(title, tx, r.y + cc * 2 + th / 2, { size: fs(14), color: c.amber, maxWidth: r.x + r.w - tx - p });
      const top = r.y + cc * 4 + th + p * 0.5;
      inner = { x: inner.x, y: top, w: inner.w, h: r.y + r.h - p - top };
    }
    return inner;
  }

  /** Красный квадратик-значок с цифрой или «!» в углу кнопки. */
  function badge(cx, cy, label) {
    const c = S.th.c;
    const size = fs(11);
    const s = String(label);
    const cc = cell();
    const w = Math.max(cc * 7, text.measure(s, size) + cc * 3);
    const h = cc * 7;
    nine('danger', cx - w / 2, cy - h / 2, w, h);
    drawText(s, cx, cy, { size, color: c.white, align: 'center' });
  }

  /** Лампа-индикатор: пиксельная «лампочка» 5×5 клеток. on — горит, blink — мигает. */
  function lamp(cx, cy, size, color, on = true, blink = false) {
    const cc = Math.max(1, Math.round(size / 5));
    const lit = on && (!blink || S.settings.reduceMotion || Math.floor(S.time * 4) % 2 === 0);
    const c = S.th.c;
    const x0 = Math.round(cx - cc * 2.5);
    const y0 = Math.round(cy - cc * 2.5);
    const rows = ['.###.', '#####', '#####', '#####', '.###.'];
    const glass = lit ? color : c.navy2;
    rows.forEach((row, ry) => {
      for (let rx = 0; rx < 5; rx++) {
        if (row[rx] !== '#') continue;
        const edge = ry === 0 || ry === 4 || rx === 0 || rx === 4;
        rect(x0 + rx * cc, y0 + ry * cc, cc, cc, edge ? c.ink : glass);
      }
    });
    rect(x0 + cc, y0 + cc, cc, cc, lit ? c.white : c.steel0);
  }

  /** Угловая металлическая табличка с пиксельной иконкой и числом. */
  function plate(x, y, w, h, iconName, value, color) {
    const cc = cell();
    nine('raised', x, y, w, h);
    nine('screen', x + h - cc * 2, y + cc * 3, w - h - cc, h - cc * 6);
    icon(iconName, x + h * 0.5 - cc, y + h / 2, Math.round(h * 0.7), color);
    const size = Math.round(h * 0.42);
    const room = w - h - cc * 5;
    let str = typeof value === 'number' ? fmtInt(value) : String(value);
    if (text.measure(str, size) > room && typeof value === 'number') str = fmtCompact(value);
    drawText(str, x + w - cc * 4, y + h / 2, { size, color, align: 'right', maxWidth: room, shadow: true });
  }

  // ---------- кнопки ----------

  function variantName(base, a, disabled) {
    if (disabled) return 'disabled';
    const v = S.th.variants;
    if (a.press > 0.5 && v[`${base}Press`]) return `${base}Press`;
    if (a.hover > 0.5 && v[`${base}Hover`]) return `${base}Hover`;
    return v[base] ? base : 'btn';
  }

  const sparks = [];
  function spawnSparks(x, y, color) {
    if (S.settings.reduceMotion) return;
    for (let i = 0; i < 7; i++) {
      const a = (Math.PI * 2 * i) / 7 + S.time;
      sparks.push({ x, y, vx: Math.cos(a) * (60 + (i % 3) * 30), vy: Math.sin(a) * (60 + (i % 2) * 30) - 30, t: 0, color });
    }
    if (sparks.length > 80) sparks.splice(0, sparks.length - 80);
  }

  function drawSparks() {
    if (!sparks.length) return;
    const cc = cell();
    for (let i = sparks.length - 1; i >= 0; i--) {
      const p = sparks[i];
      p.t += S.dt;
      if (p.t > 0.45) {
        sparks.splice(i, 1);
        continue;
      }
      p.x += p.vx * S.dt;
      p.y += p.vy * S.dt;
      p.vy += 220 * S.dt;
      rect(Math.round(p.x), Math.round(p.y), cc, cc, p.t < 0.25 ? p.color : S.th.c.steel2);
    }
  }

  /**
   * Кнопка-«физический объект»: утапливается при нажатии, при отказе дрожит, при нажатии даёт искры.
   * o: label, sub, icon, variant (btn|primary|danger|good|card|cardOn|raised), disabled, locked, size, badge, tip,
   *    iconColor, align, lamp (цвет лампы-индикатора), stack
   */
  function button(id, r, o = {}) {
    const { label, sub, icon: iconName, variant = 'btn', locked = false, badge: badgeText, tip } = o;
    const disabled = !!o.disabled;
    const c = S.th.c;
    hit(id, r, { focusable: true });
    const a = stepAnim(id);
    if (S.hover === id && !disabled) S.cursor = 'pointer';
    if (tip && S.hover === id) S.tipCandidate = { id, text: tip };
    const cc = cell();
    const lip = cc * 2;
    const dim = disabled || locked;
    const pressed = a.press > 0.5;
    const shake = a.shake > 0 && !S.settings.reduceMotion ? Math.round(Math.sin(a.shake * 40) * cc * 2 * a.shake) : 0;
    const body = { x: r.x + shake, y: r.y + (pressed ? lip : 0), w: r.w, h: r.h - lip };
    // нижний «борт» кнопки: пока кнопка не утоплена, виден под ней
    rect(r.x + cc + shake, r.y + r.h - lip, r.w - cc * 2, lip, c.ink);
    const name = variantName(variant, a, dim);
    nine(name, body.x, body.y, body.w, body.h);
    const labelColor = dim ? c.textMute : o.color || S.th.labelColor(variant);
    const size = o.size || fs(15);
    const cx = body.x + body.w / 2;
    const cy = body.y + body.h / 2;
    const iconSize = o.iconSize || Math.round(size * 1.5);
    const hasLabel = !!label;
    const pad = cc * 3;
    const labelMax = o.stack ? body.w - pad : body.w - pad * 2 - (iconName ? iconSize + size * 0.4 : 0) - (locked ? iconSize : 0);
    let lbl = label;
    let lblSize = size;
    if (hasLabel) {
      const f = text.fit(label, Math.max(10, labelMax), size);
      lbl = f.str;
      lblSize = f.size;
    }
    const labelW = hasLabel ? text.measure(lbl, lblSize) : 0;
    const contentW = labelW + (iconName ? iconSize + (hasLabel ? size * 0.4 : 0) : 0);
    const startX = o.align === 'left' ? body.x + pad + cc : cx - contentW / 2;
    const midY = sub ? cy - size * 0.42 : cy;
    let x = startX;
    if (o.stack && iconName) {
      const is = Math.round(Math.min(body.h * 0.5, body.w * 0.55));
      icon(iconName, cx, body.y + body.h * 0.4, is, dim ? c.textMute : o.iconColor || labelColor, dim ? 0.6 : 1);
      if (hasLabel) drawText(lbl, cx, body.y + body.h * 0.82, { size: lblSize, color: labelColor, align: 'center', maxWidth: body.w - pad });
    } else {
      if (iconName) {
        icon(iconName, x + iconSize / 2, midY, iconSize, dim ? c.textMute : o.iconColor || labelColor, dim ? 0.6 : 1);
        x += iconSize + (hasLabel ? size * 0.4 : 0);
      }
      if (hasLabel) drawText(lbl, x, midY, { size: lblSize, color: labelColor });
    }
    if (sub) drawText(sub, o.align === 'left' ? startX : cx, cy + size * 0.85, { size: Math.max(9, Math.round(size * 0.7)), color: dim ? c.textMute : labelColor, align: o.align === 'left' ? 'left' : 'center', maxWidth: body.w - pad * 2 });
    if (locked) icon('lock', body.x + body.w - iconSize * 0.75, body.y + iconSize * 0.75, Math.round(iconSize * 0.9), c.amber);
    if (o.lamp) lamp(body.x + body.w - cc * 5, body.y + cc * 5, cc * 5, o.lamp === true ? c.green : o.lamp, !dim);
    if (badgeText !== undefined && badgeText !== null && badgeText !== false) badge(body.x + body.w - cc * 2, body.y + cc * 2, badgeText);
    if (S.focusVisible && S.focusId === id) focusRing(r);
    if (S.clicked === id) {
      if (disabled || locked) {
        S.clicked = null;
        S.denied = id;
        a.shake = 1;
        sfx('deny');
        return false;
      }
      spawnSparks(S.clickPos?.x ?? cx, S.clickPos?.y ?? cy, variant === 'primary' ? c.amberLight : c.steel3);
      return true;
    }
    return false;
  }

  /** Рамка выбора при управлении с клавиатуры/геймпада: мигающие пиксельные уголки-скобы. */
  function focusRing(r, color) {
    const cc = cell();
    const pulse = S.settings.reduceMotion || Math.floor(S.time * 4) % 2 === 0;
    const col = color || (pulse ? S.th.c.amberLight : S.th.c.amber);
    const arm = cc * 4;
    const x0 = Math.round(r.x - cc * 2);
    const y0 = Math.round(r.y - cc * 2);
    const x1 = Math.round(r.x + r.w + cc);
    const y1 = Math.round(r.y + r.h + cc);
    for (const [x, y, sx, sy] of [[x0, y0, 1, 1], [x1, y0, -1, 1], [x0, y1, 1, -1], [x1, y1, -1, -1]]) {
      rect(sx > 0 ? x : x - arm + cc, y, arm, cc, col);
      rect(x, sy > 0 ? y : y - arm + cc, cc, arm, col);
    }
  }

  /** Кнопка-иконка (подпись нужна для подсказки курсора и доступности). */
  function iconButton(id, r, o = {}) {
    return button(id, r, { ...o, label: undefined, tip: o.tip || o.label, size: o.size || fs(15), iconSize: o.iconSize || Math.round(Math.min(r.w, r.h) * 0.5) });
  }

  // ---------- индикаторы ----------

  /**
   * Сегментная светодиодная шкала. o: value 0..1, segments, color, warn (порог красного), vertical, ghost (метка).
   * Возвращает внутреннюю область экрана шкалы.
   */
  function ledBar(r, o = {}) {
    const c = S.th.c;
    const cc = cell();
    const v = clamp(o.value ?? 0, 0, 1);
    const vertical = o.vertical ?? r.h > r.w * 1.5;
    const warn = o.warn !== undefined && v <= o.warn;
    const blink = warn && !S.settings.reduceMotion && Math.floor(S.time * 4) % 2 === 0;
    nine('screen', r.x, r.y, r.w, r.h);
    const inner = { x: r.x + cc * 2, y: r.y + cc * 2, w: r.w - cc * 4, h: r.h - cc * 4 };
    const len = vertical ? inner.h : inner.w;
    const n = o.segments || clamp(Math.floor(len / (cc * 3)), 4, 24);
    const gap = cc;
    const seg = Math.max(cc, Math.floor((len - gap * (n - 1)) / n));
    const lit = Math.round(v * n);
    const onColor = warn ? c.red : o.color || c.green;
    const hiColor = warn ? c.redLight : mix(onColor, '#ffffff', 0.35);
    for (let i = 0; i < n; i++) {
      const on = i < lit && !(blink && i >= lit - 1);
      const pos = Math.round(i * (seg + gap));
      const bx = vertical ? inner.x : inner.x + pos;
      const by = vertical ? inner.y + inner.h - pos - seg : inner.y;
      const bw = vertical ? inner.w : seg;
      const bh = vertical ? seg : inner.h;
      rect(bx, by, bw, bh, on ? onColor : c.navy2);
      if (on) rect(bx, by, bw, Math.max(1, cc), hiColor);
    }
    if (o.ghost !== undefined) {
      const gpos = Math.round(clamp(o.ghost, 0, 1) * (len - cc));
      if (vertical) rect(r.x, inner.y + inner.h - gpos - cc, r.w, cc, c.white);
      else rect(inner.x + gpos, r.y, cc, r.h, c.white);
    }
    return { ...inner, warn };
  }

  const meter = ledBar;

  /** Прогресс-шкала с подписью. */
  function progress(r, v, o = {}) {
    const c = S.th.c;
    const m = ledBar(r, { value: v, color: o.color || c.amber, segments: o.segments });
    if (o.label) drawText(o.label, r.x + r.w / 2, r.y + r.h / 2, { size: Math.min(fs(12), Math.max(9, r.h - 6)), color: c.white, align: 'center', shadow: true });
    return m;
  }

  /**
   * Строка «было → станет»: подпись, значения и пиксельная полоска: серые блоки — было, цветные — прибавка.
   * o: label, before, after, fmt, max, unit, better
   */
  function statDelta(r, o) {
    const c = S.th.c;
    const cc = cell();
    const { label, before, after, unit = '', better = 'up' } = o;
    const fmt = o.fmt || fmtStat;
    const delta = after - before;
    const good = delta === 0 ? null : better === 'up' ? delta > 0 : delta < 0;
    const accent = good === null ? c.textDim : good ? c.green : c.red;
    const size = fs(12);
    const lineY = r.y + r.h * 0.3;
    drawText(label, r.x, lineY, { size, color: c.textDim, maxWidth: r.w * 0.5 });
    const afterStr = `${fmt(after)}${unit}`;
    let x = r.x + r.w;
    drawText(afterStr, x, lineY, { size: fs(13), color: accent, align: 'right' });
    x -= text.measure(afterStr, fs(13)) + cc * 2;
    if (delta !== 0) {
      icon('arrow', x - fs(7), lineY, fs(14), c.textMute);
      x -= fs(18);
      drawText(`${fmt(before)}${unit}`, x, lineY, { size, color: c.textMute, align: 'right' });
    }
    const maxV = o.max ?? Math.max(before, after, 1e-9) * 1.15;
    const barH = Math.max(cc * 3, Math.round(r.h * 0.26));
    const by = r.y + r.h - barH - cc;
    const n = clamp(Math.floor(r.w / (cc * 4)), 8, 28);
    const bw = Math.floor((r.w - cc * (n - 1)) / n);
    const lo = Math.round(clamp(Math.min(before, after) / maxV, 0, 1) * n);
    const hi = Math.round(clamp(Math.max(before, after) / maxV, 0, 1) * n);
    for (let i = 0; i < n; i++) {
      const bx = r.x + Math.round(i * (bw + cc));
      const col = i < lo ? c.steel2 : i < hi ? accent : c.navy2;
      rect(bx, by, bw, barH, c.ink);
      rect(bx, by + cc, Math.max(1, bw), Math.max(1, barH - cc * 2), col);
    }
    return good;
  }

  /** Рычажок-ползунок 0..1 в пазу; возвращает новое значение. */
  function slider(id, r, value, o = {}) {
    const c = S.th.c;
    const cc = cell();
    hit(id, r, { capture: true, focusable: true, slider: true });
    const a = stepAnim(id);
    let v = value;
    const trackH = Math.max(cc * 5, Math.round(r.h * 0.34));
    const track = { x: r.x + cc * 2, y: r.y + (r.h - trackH) / 2, w: r.w - cc * 4, h: trackH };
    if (S.sliderDrag && S.sliderDrag.id === id) {
      v = clamp((S.sliderDrag.x - track.x) / track.w, 0, 1);
      if (o.step) v = Math.round(v / o.step) * o.step;
      if (S.sliderDrag.released) S.sliderDrag = null;
    } else if (S.sliderNudge && S.sliderNudge.id === id) {
      v = clamp(Math.round((value + S.sliderNudge.delta) / (o.step || 0.05)) * (o.step || 0.05), 0, 1);
      S.sliderNudge = null;
    }
    ledBar(track, { value: v, color: o.color || c.amber, segments: o.segments || 16 });
    const kw = cc * 6;
    const kx = Math.round(track.x + (track.w - kw) * v);
    nine(a.press > 0.4 ? 'primaryPress' : 'primary', kx, r.y + cc, kw, r.h - cc * 3);
    if (S.focusVisible && S.focusId === id) focusRing(r);
    return v;
  }

  /** Тумблер вкл/выкл. Возвращает новое значение. */
  function toggle(id, r, value, o = {}) {
    const c = S.th.c;
    const cc = cell();
    const clicked = button(id, r, { variant: 'card', disabled: o.disabled });
    const sw = { x: r.x + r.w - cc * 3 - Math.round(r.h * 1.3), y: r.y + (r.h - cc * 10) / 2 - cc, w: Math.round(r.h * 1.3), h: cc * 10 };
    nine('screen', sw.x, sw.y, sw.w, sw.h);
    const kw = Math.round(sw.w * 0.45);
    nine(value ? 'good' : 'btn', value ? sw.x + sw.w - kw - cc * 2 : sw.x + cc * 2, sw.y + cc * 2, kw, sw.h - cc * 4);
    drawText(value ? t('common.on') : t('common.off'), sw.x - cc * 3, r.y + r.h / 2 - cc, { size: fs(12), color: value ? c.green : c.textMute, align: 'right' });
    return clicked ? !value : value;
  }

  // ---------- прокрутка ----------

  function scrollArea(id, r, contentH, draw) {
    const s = scrollState(id);
    const ch = contentH ?? s.contentH ?? r.h;
    Scroll.setRange(s, ch, r.h);
    s.lastFrame = S.frame;
    if (s.offset > s.max && !s.dragging && s.vel === 0) s.offset = Math.min(s.offset, s.max);
    hit(id, r, { scroll: true });
    pushClip(r);
    const used = draw(Math.round(r.y - s.offset), s.offset);
    popClip();
    if (typeof used === 'number') s.contentH = used;
    if (s.max > 0) {
      const c = S.th.c;
      const cc = cell();
      const barH = Math.max(cc * 6, Math.round((r.h * r.h) / ch));
      const t0 = clamp(s.offset / s.max, 0, 1);
      const by = r.y + Math.round((r.h - barH) * t0);
      rect(r.x + r.w - cc * 2, r.y, cc, r.h, c.ink);
      rect(r.x + r.w - cc * 2, by, cc, barH, s.dragging || !s.settled ? c.amberLight : c.amber);
    }
    return s;
  }

  /** Список с виртуализацией. draw(i, rect) вызывается только для видимых элементов. */
  function scrollList(id, r, o) {
    const { count, itemH, gap = 0 } = o;
    const contentH = Math.max(0, count * (itemH + gap) - gap);
    const innerW = r.w - cell() * 5;
    return scrollArea(id, r, contentH, (top, offset) => {
      const first = Math.max(0, Math.floor(offset / (itemH + gap)));
      const last = Math.min(count - 1, Math.ceil((offset + r.h) / (itemH + gap)));
      for (let i = first; i <= last; i++) o.draw(i, { x: r.x, y: top + i * (itemH + gap), w: innerW, h: itemH });
    });
  }

  function resetScroll(id) {
    const s = scrolls.get(id);
    if (s) {
      s.offset = 0;
      s.vel = 0;
    }
  }

  // ---------- цена ----------

  function costWidth(cost, size = fs(14)) {
    let w = 0;
    const gap = size * 0.5;
    if (cost.coins) w += size * 1.4 + text.measure(fmtCompact(cost.coins), size) + gap;
    if (cost.data) w += size * 1.4 + text.measure(fmtCompact(cost.data), size) + gap;
    return Math.max(0, w - gap);
  }

  /**
   * Цена: монеты (золото) и данные (циан); недостающее подсвечено красным.
   * align: left | center | right относительно x. Возвращает ширину.
   */
  function costChip(x, y, cost, o = {}) {
    const c = S.th.c;
    const size = o.size || fs(14);
    const total = costWidth(cost, size);
    let cx = o.align === 'right' ? x - total : o.align === 'center' ? x - total / 2 : x;
    const items = [];
    if (cost.coins) items.push({ icon: 'coin', val: cost.coins, color: c.gold, ok: o.have ? o.have.coins >= cost.coins : true });
    if (cost.data) items.push({ icon: 'data', val: cost.data, color: c.cyan, ok: o.have ? o.have.data >= cost.data : true });
    for (const it of items) {
      icon(it.icon, cx + size * 0.7, y, size * 1.3, it.color);
      cx += size * 1.4;
      const wd = drawText(fmtCompact(it.val), cx, y, { size, color: it.ok ? it.color : c.red, shadow: true }).w;
      cx += wd + size * 0.5;
    }
    return total;
  }

  // ---------- уведомления ----------

  const MAX_TOASTS = 2;
  const pending = [];
  const toasts = [];

  /** Уведомление: одновременно видны не больше двух, остальные ждут своей очереди. */
  function toast(message, o = {}) {
    if (toasts.some((x) => x.message === message) || pending.some((x) => x.message === message)) return;
    pending.push({ message, kind: o.kind || 'info', icon: o.icon, ttl: o.ttl || 2.3, t0: 0 });
    if (pending.length > 4) pending.shift();
  }

  /**
   * Якорь стопки уведомлений. edge 'bottom': y — нижняя граница, стопка растёт вверх (до двух сразу);
   * edge 'top': y — центр первого, видно по одному. area — область по горизонтали.
   */
  function setToastAnchor(edge, y, area = null) {
    S.toastEdge = edge;
    S.toastY = y;
    S.toastArea = area;
  }

  function drawToasts() {
    const L = S.L;
    const c = S.th.c;
    const top = S.toastEdge === 'top';
    const limit = top ? 1 : MAX_TOASTS;
    for (let i = toasts.length - 1; i >= 0; i--) if (S.time - toasts[i].t0 > toasts[i].ttl) toasts.splice(i, 1);
    while (pending.length && toasts.length < limit) {
      const next = pending.shift();
      next.t0 = S.time;
      toasts.push(next);
    }
    if (!toasts.length) return;
    const size = fs(13);
    const cc = cell();
    const h = Math.round(size * 2.6);
    const zone = S.toastArea || L.area;
    const anchor = S.toastY ?? L.area.y + L.area.h - L.gap * 1.5;
    toasts.forEach((tt, i) => {
      const age = S.time - tt.t0;
      const slide = Math.round(clamp(1 - age / 0.18, 0, 1) * 4) * cc * 2;
      const outK = clamp(1 - (tt.ttl - age) / 0.2, 0, 1);
      const out = Math.round(outK * 3) * cc * 2;
      const w = Math.min(zone.w - L.gap * 2, text.measure(tt.message, size) + size * 3.6);
      const x = zone.x + (zone.w - w) / 2;
      const y = top ? anchor - h / 2 - slide - out : Math.min(anchor, L.area.y + L.area.h - L.gap) - h - i * (h + L.gap) + slide + out;
      const variant = tt.kind === 'bad' ? 'danger' : tt.kind === 'good' ? 'good' : 'raised';
      nine(variant, x, y, w, h);
      const ic = tt.icon || (tt.kind === 'bad' ? 'warn' : tt.kind === 'good' ? 'check' : 'info');
      icon(ic, x + size * 1.4, y + h / 2, size * 1.6, tt.kind === 'info' ? c.amberLight : c.white);
      drawText(tt.message, x + size * 2.6, y + h / 2, { size, color: tt.kind === 'good' ? c.ink : c.white, maxWidth: w - size * 3.2 });
    });
  }

  function drawTooltip() {
    const cand = S.tipCandidate;
    if (!cand || S.pointer.type !== 'mouse' || S.time - S.hoverSince < 0.35) return;
    const L = S.L;
    const c = S.th.c;
    const size = fs(12);
    const maxW = Math.min(L.area.w * 0.5, 260 * L.ui);
    const lines = text.wrap(cand.text, maxW, size);
    const w = Math.max(...lines.map((l) => text.measure(l, size))) + size * 1.6;
    const h = lines.length * size * 1.5 + size;
    const x = clamp(S.pointer.x + 14, L.area.x + 4, L.area.x + L.area.w - w - 4);
    const y = clamp(S.pointer.y + 18, L.area.y + 4, L.area.y + L.area.h - h - 4);
    nine('screen', x, y, w, h);
    lines.forEach((ln, i) => drawText(ln, x + size * 0.8, y + size * 0.5 + i * size * 1.5 + size * 0.6, { size, color: c.text }));
  }

  // ---------- выноска-щиток ----------

  /**
   * Щиток, прикреплённый к объекту хвостиком. anchor — точка объекта (CSS px), size — желаемые {w, h}.
   * o: variant, side ('auto'|'above'|'below'|'left'|'right'), bounds.
   * Возвращает { rect, inner, side } — внутренняя область для содержимого. Щиток перехватывает нажатия.
   */
  function callout(id, anchor, size, o = {}) {
    const L = S.L;
    const cc = cell();
    const m = L.gap;
    const b = o.bounds || L.area;
    const tail = cc * 5;
    const w = Math.min(size.w, b.w - m * 2);
    const h = Math.min(size.h, b.h - m * 2);
    // объект-цель: щиток прикрепляется к середине ближайшей к нему стороны рамки объекта
    const T = o.target || { x: anchor.x, y: anchor.y, w: 0, h: 0 };
    const pt = {
      above: { x: T.x + T.w / 2, y: T.y },
      below: { x: T.x + T.w / 2, y: T.y + T.h },
      left: { x: T.x, y: T.y + T.h / 2 },
      right: { x: T.x + T.w, y: T.y + T.h / 2 },
    };
    const place = {
      above: () => ({ x: pt.above.x - w / 2, y: pt.above.y - h - tail }),
      below: () => ({ x: pt.below.x - w / 2, y: pt.below.y + tail }),
      left: () => ({ x: pt.left.x - w - tail, y: pt.left.y - h / 2 }),
      right: () => ({ x: pt.right.x + tail, y: pt.right.y - h / 2 }),
    };
    const fits = (p) => p.x >= b.x + m && p.y >= b.y + m && p.x + w <= b.x + b.w - m && p.y + h <= b.y + b.h - m;
    const forced = o.side && o.side !== 'auto';
    const order = forced ? [o.side] : L.portrait ? ['above', 'below', 'left', 'right'] : ['right', 'left', 'above', 'below'];
    const cy0 = T.y + T.h / 2;
    let side = order.find((s) => fits(place[s]())) || (forced ? o.side : cy0 > b.y + b.h / 2 ? 'above' : 'below');
    const raw = place[side]();
    const r = {
      x: Math.round(clamp(raw.x, b.x + m, b.x + b.w - m - w)),
      y: Math.round(clamp(raw.y, b.y + m, b.y + b.h - m - h)),
      w: Math.round(w),
      h: Math.round(h),
    };
    const tip = pt[side];
    withLayer(60, () => {
      hit(`callout-${id}`, r, {});
      S.ctx.globalAlpha = 0.5;
      rect(r.x + cc * 2, r.y + cc * 2, r.w, r.h, S.th.c.ink);
      S.ctx.globalAlpha = 1;
      nine(o.variant || 'panel', r.x, r.y, r.w, r.h);
      const f = S.th.variants[o.variant || 'panel'];
      const rows = 4;
      const horizontal = side === 'above' || side === 'below';
      const along = horizontal ? clamp(tip.x, r.x + cc * 6, r.x + r.w - cc * 6) : clamp(tip.y, r.y + cc * 6, r.y + r.h - cc * 6);
      for (const [pass, col] of [[1, f.edge], [0, f.mid]]) {
        for (let i = 0; i < rows; i++) {
          const half = i * cc + (pass ? cc : 0);
          const span = half * 2 + cc;
          const k = rows - 1 - i; // ряд от основания (0) к острию (rows-1)
          if (horizontal) {
            const yy = side === 'above' ? r.y + r.h + k * cc : r.y - (k + 1) * cc;
            rect(Math.round(along - half), yy, span, cc, col);
          } else {
            const xx = side === 'left' ? r.x + r.w + k * cc : r.x - (k + 1) * cc;
            rect(xx, Math.round(along - half), cc, span, col);
          }
        }
      }
    });
    const pad = L.pad;
    return { rect: r, inner: { x: r.x + pad, y: r.y + pad, w: r.w - pad * 2, h: r.h - pad * 2 }, side };
  }

  // ---------- пиксельная окружность и штамп ----------

  /** Кольцо из пикселей: центр, внешний радиус r и толщина th в CSS px; рисуется клетками cc. */
  function ring(cx, cy, r, th, color) {
    const cc = cell();
    const R = Math.max(1, Math.round(r / cc));
    const T = Math.max(1, Math.round(th / cc));
    const ctx = S.ctx;
    ctx.fillStyle = color;
    for (let dy = -R; dy <= R; dy++) {
      const outer = Math.floor(Math.sqrt(R * R - dy * dy) + 0.5);
      const innerR = R - T;
      const inner = Math.abs(dy) <= innerR ? Math.floor(Math.sqrt(innerR * innerR - dy * dy) + 0.5) : -1;
      const y = Math.round(cy + dy * cc - cc / 2);
      if (inner < 0) ctx.fillRect(Math.round(cx - outer * cc - cc / 2), y, (outer * 2 + 1) * cc, cc);
      else {
        ctx.fillRect(Math.round(cx - outer * cc - cc / 2), y, (outer - inner) * cc, cc);
        ctx.fillRect(Math.round(cx + (inner + 1) * cc - cc / 2), y, (outer - inner) * cc, cc);
      }
    }
  }

  /** Штамп: двойная рамка и слово крупным пиксельным шрифтом (ПОСАДКА, АВАРИЯ). */
  function stamp(label, cx, cy, color, size = fs(26)) {
    const cc = cell();
    const w = text.measure(label, size) + cc * 14;
    const h = Math.round(7 * text.stepFor(size).css + cc * 12);
    const x = Math.round(cx - w / 2);
    const y = Math.round(cy - h / 2);
    for (const [off, th] of [[0, cc * 2], [cc * 3, cc]]) {
      rect(x + off, y + off, w - off * 2, th, color);
      rect(x + off, y + h - off - th, w - off * 2, th, color);
      rect(x + off, y + off, th, h - off * 2, color);
      rect(x + w - off - th, y + off, th, h - off * 2, color);
    }
    drawText(label, cx, cy, { size, color, align: 'center' });
    return { x, y, w, h };
  }

  // ---------- плакетка (справка и «Новое») ----------

  /**
   * Небольшая плакетка по центру (справка, «Новое»). Закрывается кнопкой, тапом вне плакетки или Esc.
   * Возвращает true, когда её закрыли. o: title, body, icon, button, kicker, extra(rect), extraH
   */
  function modal(id, o) {
    const L = S.L;
    const c = S.th.c;
    const a = anim(`modal-${id}`);
    const age = S.time - a.born;
    const slide = Math.round(clamp(1 - age / 0.2, 0, 1) * 4) * cell() * 3;
    let closed = false;
    withLayer(100, () => {
      hit('barrier', { x: 0, y: 0, w: L.w, h: L.h }, {});
      S.ctx.fillStyle = ditherPattern(c.ink, cell());
      S.ctx.fillRect(0, 0, L.w, L.h);
      const w = Math.min(L.area.w - L.gap * 4, Math.round(400 * L.ui));
      const bodyH = text.blockHeight(o.body || '', w - L.pad * 4, fs(14), 1.4);
      const h = Math.min(L.area.h - L.gap * 4, Math.round(fs(110) + bodyH + L.touch(56) + (o.extraH || 0)));
      const x = L.area.x + (L.area.w - w) / 2;
      const y = L.area.y + (L.area.h - h) / 2 + slide;
      const inner = panel({ x, y, w, h }, { variant: 'raised' });
      let cy = inner.y + L.gap;
      if (o.icon) {
        const ringS = fs(56);
        nine('screen', x + w / 2 - ringS / 2, cy, ringS, ringS);
        icon(o.icon, x + w / 2, cy + ringS / 2, fs(36), c.amber);
        cy += ringS + L.gap * 1.2;
      }
      if (o.kicker) {
        drawText(o.kicker, x + w / 2, cy + fs(6), { size: fs(12), color: c.amber, align: 'center' });
        cy += fs(18);
      }
      drawText(o.title, x + w / 2, cy + fs(10), { size: fs(20), color: c.text, align: 'center', maxWidth: inner.w, shadow: true });
      cy += fs(30);
      const used = paragraph(o.body || '', inner.x, cy, inner.w, { size: fs(13), lineHeight: 1.4, align: 'center' });
      cy += used + L.gap;
      if (o.extra) cy += o.extra({ x: inner.x, y: cy, w: inner.w }) || 0;
      const bh = L.touch(52);
      if (button(`modal-${id}-ok`, { x: inner.x, y: y + h - L.pad - bh, w: inner.w, h: bh }, { label: o.button || t('common.ok'), variant: 'primary', size: fs(16) })) closed = true;
    });
    if (S.back || S.clicked === 'barrier') closed = true;
    return closed;
  }

  // ---------- пиксельные линии, табло, стрелочный прибор, ирис ----------

  /** Ступенчатая линия клетками (Брезенхем). dash — рисовать каждую вторую клетку пары. */
  function line(x0, y0, x1, y1, color, o = {}) {
    const cc = o.cell || cell();
    const ctx = S.ctx;
    ctx.fillStyle = color;
    let ix = Math.round(x0 / cc);
    let iy = Math.round(y0 / cc);
    const jx = Math.round(x1 / cc);
    const jy = Math.round(y1 / cc);
    const dx = Math.abs(jx - ix);
    const dy = -Math.abs(jy - iy);
    const sx = ix < jx ? 1 : -1;
    const sy = iy < jy ? 1 : -1;
    let err = dx + dy;
    for (let i = 0; i < 600; i++) {
      if (!o.dash || i % 4 < 2) ctx.fillRect(ix * cc, iy * cc, cc, cc);
      if (ix === jx && iy === jy) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        ix += sx;
      }
      if (e2 <= dx) {
        err += dx;
        iy += sy;
      }
    }
  }

  /** Жёлто-чёрная предупреждающая планка из клеток (рисуется один раз в offscreen и переиспользуется). */
  const hazards = new Map();
  function hazard(r, c1, c2) {
    const cc = cell();
    const a = c1 || S.th.c.amber;
    const b = c2 || S.th.c.ink;
    const dpr = S.L.dpr;
    const w = Math.max(1, Math.round(r.w));
    const h = Math.max(1, Math.round(r.h));
    const key = `${w}x${h}|${a}|${b}|${cc}|${dpr}`;
    let cv = hazards.get(key);
    if (!cv) {
      cv = document.createElement('canvas');
      cv.width = Math.ceil(w * dpr);
      cv.height = Math.ceil(h * dpr);
      const g = cv.getContext('2d');
      g.scale(dpr, dpr);
      for (let y = 0; y < h; y += cc) {
        for (let x = 0; x < w; x += cc) {
          g.fillStyle = (Math.floor(x / cc) + Math.floor(y / cc)) % 6 < 3 ? a : b;
          g.fillRect(x, y, cc, cc);
        }
      }
      if (hazards.size > 12) hazards.delete(hazards.keys().next().value);
      hazards.set(key, cv);
    }
    const ctx = S.ctx;
    const smooth = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(cv, Math.round(r.x), Math.round(r.y), w, h);
    ctx.imageSmoothingEnabled = smooth;
  }

  /**
   * Табло из семи сегментов на приборном стекле: погасшие сегменты тускло видны. o: lit, ghost, digits (число знакомест), h.
   * Возвращает область цифр.
   */
  function segDisplay(r, str, o = {}) {
    const c = S.th.c;
    const cc = cell();
    nine('screen', r.x, r.y, r.w, r.h);
    const h = Math.max(cc * 5, o.h || Math.round(r.h - cc * 8));
    const s = String(str);
    const digits = o.digits || s.length;
    const ghostStr = '8'.repeat(digits);
    const total = segmentWidth(ghostStr, h);
    const rp = o.padRight ?? cc * 4;
    const x = Math.round(r.x + r.w - rp - total);
    const y = Math.round(r.y + (r.h - h) / 2);
    drawSegments(S.ctx, ghostStr, x, y, h, o.ghost || c.navy2, null);
    const w = segmentWidth(s, h);
    drawSegments(S.ctx, s, Math.round(r.x + r.w - rp - w), y, h, o.lit || c.green, null);
    return { x, y, w: total, h };
  }

  /** Крупное число пиксельными сегментами без рамки (счётчики на табличках). Возвращает ширину. */
  function bigNumber(str, x, y, h, color, align = 'left') {
    const w = segmentWidth(String(str), h);
    drawSegments(S.ctx, String(str), Math.round(align === 'right' ? x - w : align === 'center' ? x - w / 2 : x), Math.round(y), h, color, null);
    return w;
  }

  /**
   * Стрелочный прибор: шкала из делений по дуге, цветные зоны и стрелка из клеток. r — область прибора,
   * value 0..1, o: zones [{ to, color }], ticks.
   */
  function dial(r, value, o = {}) {
    const c = S.th.c;
    const cc = cell();
    nine('screen', r.x, r.y, r.w, r.h);
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h * 0.68;
    const rad = Math.max(cc * 6, Math.min(r.w / 2 - cc * 4, r.h * 0.62 - cc * 2));
    const a0 = Math.PI * 1.12;
    const a1 = -Math.PI * 0.12;
    const zones = o.zones || [{ to: 0.35, color: c.red }, { to: 1, color: c.green }];
    const ticks = o.ticks || 10;
    for (let i = 0; i <= ticks; i++) {
      const k = i / ticks;
      const a = a0 - k * (a0 - a1);
      const color = (zones.find((z) => k <= z.to + 1e-6) || zones[zones.length - 1]).color;
      const x = Math.round((cx + Math.cos(a) * rad) / cc) * cc;
      const y = Math.round((cy - Math.sin(a) * rad) / cc) * cc;
      rect(x, y, cc, cc, color);
      if (i % 5 === 0) {
        const x2 = Math.round((cx + Math.cos(a) * (rad - cc * 2)) / cc) * cc;
        const y2 = Math.round((cy - Math.sin(a) * (rad - cc * 2)) / cc) * cc;
        rect(x2, y2, cc, cc, color);
      }
    }
    const k = clamp(value, 0, 1);
    const a = a0 - k * (a0 - a1);
    line(cx, cy, cx + Math.cos(a) * rad * 0.82, cy - Math.sin(a) * rad * 0.82, c.white, { cell: cc });
    rect(Math.round(cx / cc) * cc - cc, Math.round(cy / cc) * cc - cc, cc * 2, cc * 2, c.steel2);
    return { cx, cy, rad };
  }

  /** Ирис: закрывающийся/открывающийся круг из клеток. progress 0 — всё видно, 1 — закрыто. (cx, cy) — центр. */
  function iris(progress, cx, cy) {
    const L = S.L;
    const ctx = S.ctx;
    const step = cell() * 2;
    const maxR = Math.hypot(Math.max(cx, L.w - cx), Math.max(cy, L.h - cy)) + step;
    const rad = maxR * (1 - clamp(progress, 0, 1));
    ctx.fillStyle = S.th.c.ink;
    for (let y = 0; y < L.h; y += step) {
      const dy = y + step / 2 - cy;
      const half = rad > Math.abs(dy) ? Math.sqrt(rad * rad - dy * dy) : -1;
      if (half < 0) {
        ctx.fillRect(0, y, L.w, step);
        continue;
      }
      const x0 = Math.floor((cx - half) / step) * step;
      const x1 = Math.ceil((cx + half) / step) * step;
      if (x0 > 0) ctx.fillRect(0, y, x0, step);
      if (x1 < L.w) ctx.fillRect(x1, y, L.w - x1, step);
    }
  }

  // ---------- вспомогательное ----------

  const rectOf = (id) => {
    const h = S.prevHits.find((x) => x.id === id) || S.hits.find((x) => x.id === id);
    return h ? { x: h.x, y: h.y, w: h.w, h: h.h } : null;
  };

  const kit = {
    S,
    text,
    icons,
    begin,
    end,
    hit,
    rect,
    nine,
    panel,
    button,
    iconButton,
    meter,
    ledBar,
    progress,
    statDelta,
    slider,
    toggle,
    scrollArea,
    scrollList,
    resetScroll,
    costChip,
    costWidth,
    plate,
    lamp,
    line,
    hazard,
    segDisplay,
    bigNumber,
    dial,
    iris,
    callout,
    ring,
    stamp,
    modal,
    toast,
    setToastAnchor,
    badge,
    icon,
    drawText,
    paragraph,
    pushClip,
    popClip,
    withLayer,
    focusRing,
    stepAnim,
    anim,
    isPressed,
    rectOf,
    fs,
    cell,
    spawnSparks,
    ditherPattern,
    sfx,
    get L() { return S.L; },
    get th() { return S.th; },
    get c() { return S.th.c; },
    get time() { return S.time; },
    get dt() { return S.dt; },
    get clicked() { return S.clicked; },
    get clickPos() { return S.clickPos; },
    get back() { return S.back; },
    get denied() { return S.denied; },
    get emptyTap() { return S.emptyTap; },
    get dragDx() { return S.dragDx; },
    get dragDy() { return S.dragDy; },
    get pinch() { return S.pinch; },
    get wheel() { return S.wheel; },
    get dtap() { return S.dtap; },
    get cursor() { return S.cursor; },
    get hoverId() { return S.hover; },
    get hitCount() { return S.prevHits.length; },
    get hitsSnapshot() { return S.prevHits.map((h) => ({ id: h.id, x: h.x, y: h.y, w: h.w, h: h.h, fw: h.fw, fh: h.fh, layer: h.layer, focusable: !!h.focusable })); },
    get scrolling() { for (const s of scrolls.values()) if (s.dragging || !s.settled) return true; return false; },
    get modalOpen() { return S.modalOpen; },
    setFocus(id) { S.focusId = id; },
  };
  return kit;
}
