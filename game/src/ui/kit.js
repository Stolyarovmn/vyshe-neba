// UI-тулкит на canvas: режим «немедленной отрисовки» с областями нажатия по id.
// Кадр N обрабатывает события по областям кадра N-1 (верхний слой, затем более поздняя отрисовка),
// виджеты читают результат (clicked/hover/press) и рисуют себя. Всё в CSS-пикселях.

import { createText } from './text.js';
import { createIcons, hasIcon } from './icons.js';
import { getTheme, mix, withAlpha } from './theme.js';
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
  const toasts = [];

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
          p.lastX = e.x;
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
      a = { hover: 0, press: 0, flash: 0, born: S.time };
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
    return a;
  }

  // ---------- примитивы ----------

  const px = () => S.L.px;
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

  function chamferPath(ctx, x, y, w, h, c) {
    ctx.beginPath();
    ctx.moveTo(x + c, y);
    ctx.lineTo(x + w - c, y);
    ctx.lineTo(x + w, y + c);
    ctx.lineTo(x + w, y + h - c);
    ctx.lineTo(x + w - c, y + h);
    ctx.lineTo(x + c, y + h);
    ctx.lineTo(x, y + h - c);
    ctx.lineTo(x, y + c);
    ctx.closePath();
  }

  /**
   * Панель «пиксель-HD»: тёмный хроматический контур в 1 ячейку, скошенные углы, вертикальный градиент заливки,
   * скос — свет сверху-слева (тёплый), тень снизу-справа (холодная), на крупных панелях стеклянный блик.
   * cellSize — подсказка масштаба скоса (мелкие чипы — меньше).
   */
  function nine(variant, x, y, w, h, cellSize) {
    const ctx = S.ctx;
    const v = S.th.variants[variant] || S.th.variants.panel;
    const cell = S.L.cell;
    x = Math.round(x);
    y = Math.round(y);
    w = Math.round(w);
    h = Math.round(h);
    if (w < 4 || h < 4) return;
    const c = clamp(Math.round((cellSize || px()) * 1.4), 2, Math.max(2, Math.floor(Math.min(w, h) / 3)));
    ctx.fillStyle = v.edge;
    chamferPath(ctx, x, y, w, h, c);
    ctx.fill();
    const i = cell;
    const iw = w - i * 2;
    const ih = h - i * 2;
    const ci = Math.max(1, c - i);
    if (v.fillTop === v.fillBottom) ctx.fillStyle = v.fillTop;
    else {
      const g = ctx.createLinearGradient(0, y + i, 0, y + i + ih);
      g.addColorStop(0, v.fillTop);
      g.addColorStop(1, v.fillBottom);
      ctx.fillStyle = g;
    }
    chamferPath(ctx, x + i, y + i, iw, ih, ci);
    ctx.fill();
    // скос: свет сверху-слева, тень снизу-справа
    ctx.fillStyle = v.hi;
    ctx.fillRect(x + i + ci, y + i, iw - ci * 2, cell);
    ctx.fillRect(x + i, y + i + ci, cell, ih - ci * 2);
    ctx.fillStyle = v.lo;
    ctx.fillRect(x + i + ci, y + h - i - cell, iw - ci * 2, cell);
    ctx.fillRect(x + w - i - cell, y + i + ci, cell, ih - ci * 2);
    // стеклянный блик в верхней части крупных непрозрачных панелей
    if (v.sheen && ih >= 20) {
      const sh = Math.round(ih * 0.42);
      const g2 = ctx.createLinearGradient(0, y + i + cell, 0, y + i + cell + sh);
      g2.addColorStop(0, 'rgba(255,238,205,0.10)');
      g2.addColorStop(1, 'rgba(255,238,205,0)');
      ctx.fillStyle = g2;
      ctx.fillRect(x + i + cell * 2, y + i + cell, iw - cell * 4, sh);
    }
  }

  /** Панель с тенью и необязательным заголовком. Возвращает внутреннюю область. */
  function panel(r, o = {}) {
    const { variant = 'panel', title, titleIcon, shadow = true, pad } = o;
    const cell = px();
    if (!o.passthrough) hit(`panel@${Math.round(r.x)},${Math.round(r.y)}`, r, {});
    if (shadow) rect(r.x + cell, r.y + cell * 1.5, r.w, r.h, 'rgba(0,0,0,0.38)');
    nine(variant, r.x, r.y, r.w, r.h);
    const p = pad ?? S.L.pad;
    let inner = { x: r.x + p, y: r.y + p, w: r.w - p * 2, h: r.h - p * 2 };
    if (title) {
      const th = Math.round(fs(26));
      const c = S.th.c;
      rect(r.x + cell * 2, r.y + cell * 2, r.w - cell * 4, th, 'rgba(0,0,0,0.28)');
      rect(r.x + cell * 2, r.y + cell * 2 + th, r.w - cell * 4, cell, S.th.c.amber);
      let tx = r.x + p;
      if (titleIcon) {
        icon(titleIcon, tx + fs(8), r.y + cell * 2 + th / 2, fs(16), c.amber);
        tx += fs(24);
      }
      drawText(title, tx, r.y + cell * 2 + th / 2, { size: fs(14), color: c.amber, maxWidth: r.w - (tx - r.x) - p });
      inner = { x: inner.x, y: r.y + cell * 3 + th + p * 0.5, w: inner.w, h: r.y + r.h - p - (r.y + cell * 3 + th + p * 0.5) };
    }
    return inner;
  }

  function badge(cx, cy, label) {
    const c = S.th.c;
    const size = fs(11);
    const s = String(label);
    const w = Math.max(size * 1.5, text.measure(s, size) + size * 0.8);
    nine('danger', cx - w / 2, cy - size * 0.9, w, size * 1.8, Math.max(1, Math.round(px() / 2)));
    drawText(s, cx, cy, { size, color: c.white, align: 'center', weight: 900 });
  }

  // ---------- кнопки ----------

  function variantName(base, a, disabled) {
    if (disabled) return 'disabled';
    const v = S.th.variants;
    if (a.press > 0.5 && v[`${base}Press`]) return `${base}Press`;
    if (a.hover > 0.5 && v[`${base}Hover`]) return `${base}Hover`;
    return v[base] ? base : 'btn';
  }

  /**
   * Кнопка. Возвращает true в кадре клика.
   * o: label, sub, icon, variant (btn|primary|danger|good|card|cardOn|tab|tabOn), disabled, locked, size, badge, tip,
   *    iconColor, active, align
   */
  function button(id, r, o = {}) {
    const { label, sub, icon: iconName, variant = 'btn', locked = false, active = false, badge: badgeText, tip } = o;
    const disabled = !!o.disabled;
    const c = S.th.c;
    hit(id, r, { focusable: true });
    const a = stepAnim(id);
    if (S.hover === id && !disabled) S.cursor = 'pointer';
    if (tip && S.hover === id) S.tipCandidate = { id, text: tip };
    const cell = px();
    const lip = S.L.cell * 2;
    const off = Math.round(a.press * lip);
    const body = { x: r.x, y: r.y + off, w: r.w, h: r.h - lip };
    const name = variantName(active && variant === 'tab' ? 'tabOn' : variant, a, disabled || locked);
    // нижняя «губа» кнопки
    rect(body.x + cell, r.y + r.h - lip - 0, body.w - cell * 2, lip, 'rgba(0,0,0,0.5)');
    if (variant === 'primary' && !disabled && !locked) {
      S.ctx.shadowColor = `rgba(255,182,39,${(0.18 + 0.32 * a.hover).toFixed(2)})`;
      S.ctx.shadowBlur = Math.round(10 * S.L.ui);
    }
    nine(name, body.x, body.y, body.w, body.h);
    S.ctx.shadowBlur = 0;
    S.ctx.shadowColor = 'transparent';
    if (a.hover > 0.01 && !disabled && !S.th.variants[`${variant}Hover`]) {
      S.ctx.globalAlpha = 0.12 * a.hover;
      rect(body.x + cell * 2, body.y + cell * 2, body.w - cell * 4, body.h - cell * 4, '#fff');
      S.ctx.globalAlpha = 1;
    }
    if (a.flash > 0) {
      S.ctx.globalAlpha = a.flash * 0.5;
      rect(body.x + cell * 2, body.y + cell * 2, body.w - cell * 4, body.h - cell * 4, '#fff');
      S.ctx.globalAlpha = 1;
    }
    const dim = disabled || locked;
    const labelColor = dim ? c.textMute : o.color || S.th.labelColor(variant === 'tab' ? (active ? 'btn' : 'btn') : variant);
    const size = o.size || fs(15);
    const cx = body.x + body.w / 2;
    const cy = body.y + body.h / 2;
    const iconSize = o.iconSize || Math.round(size * 1.35);
    const hasLabel = !!label;
    const pad = cell * 3;
    let contentW = 0;
    const labelMax = body.w - pad * 2 - (iconName ? iconSize + size * 0.4 : 0) - (locked ? iconSize : 0);
    let lblSize = size;
    let lbl = label;
    if (hasLabel) {
      const fit = text.fit(label, Math.max(10, labelMax), size);
      lbl = fit.str;
      lblSize = fit.size;
    }
    const labelW = hasLabel ? text.measure(lbl, lblSize) : 0;
    contentW = labelW + (iconName ? iconSize + (hasLabel ? size * 0.4 : 0) : 0);
    const startX = o.align === 'left' ? body.x + pad + cell : cx - contentW / 2;
    const midY = sub ? cy - size * 0.42 : cy;
    let x = startX;
    if (o.stack && iconName) {
      const is = Math.round(Math.min(body.h * 0.46, body.w * 0.5));
      icon(iconName, cx, body.y + body.h * 0.4, is, dim ? c.textMute : o.iconColor || labelColor, dim ? 0.7 : 1);
      if (hasLabel) drawText(lbl, cx, body.y + body.h * 0.82, { size: lblSize, color: labelColor, align: 'center', weight: 900, maxWidth: body.w - pad });
    } else if (iconName) {
      icon(iconName, x + iconSize / 2, midY, iconSize, dim ? c.textMute : o.iconColor || labelColor, dim ? 0.7 : 1);
      x += iconSize + (hasLabel ? size * 0.4 : 0);
    }
    if (hasLabel && !(o.stack && iconName)) {
      drawText(lbl, x, midY, { size: lblSize, color: labelColor, weight: 900 });
    }
    if (sub) drawText(sub, o.align === 'left' ? startX : cx, cy + size * 0.78, { size: Math.round(size * 0.74), color: dim ? c.textMute : mix(labelColor, variant === 'primary' ? '#7a4a00' : '#8a97b5', 0.25), align: o.align === 'left' ? 'left' : 'center', maxWidth: body.w - pad * 2, weight: 800 });
    if (locked) icon('lock', body.x + body.w - iconSize * 0.75, body.y + iconSize * 0.75, Math.round(iconSize * 0.9), c.amber);
    if (badgeText !== undefined && badgeText !== null && badgeText !== false) badge(body.x + body.w - cell * 2, body.y + cell * 2, badgeText);
    if (S.focusVisible && S.focusId === id) focusRing(r);
    if (S.clicked === id) {
      a.flash = 1;
      if (disabled || locked) {
        S.clicked = null;
        S.denied = id;
        sfx('deny');
        return false;
      }
      return true;
    }
    return false;
  }

  function focusRing(r) {
    const cell = px();
    const ctx = S.ctx;
    const pulse = S.settings.reduceMotion ? 1 : 0.8 + 0.2 * Math.sin(S.time * 8);
    ctx.globalAlpha = pulse;
    ctx.strokeStyle = S.th.c.edge;
    ctx.lineWidth = cell * 3;
    ctx.strokeRect(r.x - cell * 1.5, r.y - cell * 1.5, r.w + cell * 3, r.h + cell * 3);
    ctx.strokeStyle = S.th.c.amber;
    ctx.lineWidth = cell * 1.5;
    ctx.strokeRect(r.x - cell * 1.25, r.y - cell * 1.25, r.w + cell * 2.5, r.h + cell * 2.5);
    ctx.globalAlpha = 1;
  }

  /** Кнопка-иконка (подпись нужна для подсказки курсора и доступности). */
  function iconButton(id, r, o = {}) {
    return button(id, r, { ...o, label: undefined, tip: o.tip || o.label, size: o.size || fs(15), iconSize: o.iconSize || Math.round(Math.min(r.w, r.h) * 0.5) });
  }

  // ---------- индикаторы ----------

  function meter(r, o = {}) {
    const c = S.th.c;
    const v = clamp(o.value ?? 0, 0, 1);
    const cell = S.L.cell;
    const warn = o.warn !== undefined && v <= o.warn;
    const pulse = warn && !S.settings.reduceMotion ? 0.65 + 0.35 * Math.sin(S.time * 9) : 1;
    const color = warn ? c.red : o.color || c.green;
    rect(r.x, r.y, r.w, r.h, c.edge);
    rect(r.x + cell, r.y + cell, r.w - cell * 2, r.h - cell * 2, o.bg || c.inset);
    const iw = r.w - cell * 4;
    const ih = r.h - cell * 4;
    const vertical = r.h > r.w * 1.5;
    if (v > 0) {
      S.ctx.globalAlpha = pulse;
      if (vertical) {
        const fh = Math.max(1, Math.round(ih * v));
        rect(r.x + cell * 2, r.y + cell * 2 + ih - fh, iw, fh, color);
        rect(r.x + cell * 2, r.y + cell * 2 + ih - fh, Math.max(1, Math.round(iw * 0.3)), fh, mix(color, '#ffffff', 0.4));
      } else {
        const fw = Math.max(1, Math.round(iw * v));
        rect(r.x + cell * 2, r.y + cell * 2, fw, ih, color);
        rect(r.x + cell * 2, r.y + cell * 2, fw, Math.max(1, Math.round(ih * 0.3)), mix(color, '#ffffff', 0.4));
      }
      S.ctx.globalAlpha = 1;
    }
    if (o.segments) {
      for (let i = 1; i < o.segments; i++) {
        if (vertical) rect(r.x + cell * 2, r.y + cell * 2 + Math.round((ih * i) / o.segments), iw, cell, 'rgba(0,0,0,0.45)');
        else rect(r.x + cell * 2 + Math.round((iw * i) / o.segments), r.y + cell * 2, cell, ih, 'rgba(0,0,0,0.45)');
      }
    }
    if (o.ghost !== undefined) {
      if (vertical) rect(r.x, r.y + r.h - cell * 2 - Math.round(ih * clamp(o.ghost, 0, 1)), r.w, cell, c.white);
      else rect(r.x + cell * 2 + Math.round(iw * clamp(o.ghost, 0, 1)), r.y, cell, r.h, c.white);
    }
    return { x: r.x + cell * 2, y: r.y + cell * 2, w: iw, h: ih, warn };
  }

  /** Прогресс-полоса с подписью. */
  function progress(r, v, o = {}) {
    const c = S.th.c;
    const m = meter(r, { value: v, color: o.color || c.amber, segments: o.segments });
    if (o.label) drawText(o.label, r.x + r.w / 2, r.y + r.h / 2, { size: Math.min(fs(12), r.h - 4), color: c.white, align: 'center', shadow: 'rgba(0,0,0,0.8)', weight: 900 });
    return m;
  }

  /**
   * Строка «было → станет» с двумя полосками. better: 'up' (по умолчанию) или 'down' (меньше лучше).
   * o: label, before, after, fmt, max, unit, better
   */
  function statDelta(r, o) {
    const c = S.th.c;
    const { label, before, after, unit = '', better = 'up' } = o;
    const fmt = o.fmt || fmtStat;
    const delta = after - before;
    const good = delta === 0 ? null : better === 'up' ? delta > 0 : delta < 0;
    const accent = good === null ? c.textDim : good ? c.green : c.red;
    const size = fs(13);
    const half = r.h * 0.5;
    drawText(label, r.x, r.y + half * 0.55, { size, color: c.textDim, maxWidth: r.w * 0.45 });
    const afterStr = `${fmt(after)}${unit}`;
    const beforeStr = `${fmt(before)}${unit}`;
    const arrowW = fs(18);
    let x = r.x + r.w;
    drawText(afterStr, x, r.y + half * 0.55, { size: fs(14), color: accent, align: 'right', weight: 900 });
    x -= text.measure(afterStr, fs(14)) + fs(4);
    if (delta !== 0) {
      icon('arrow', x - arrowW / 2, r.y + half * 0.55, fs(14), c.textMute);
      x -= arrowW;
      drawText(beforeStr, x, r.y + half * 0.55, { size, color: c.textMute, align: 'right' });
    }
    const maxV = o.max ?? Math.max(before, after, 1e-9) * 1.15;
    const barY = r.y + half * 1.15;
    const barH = Math.max(Math.round(px() * 2.5), Math.round(r.h * 0.26));
    const bar = { x: r.x, y: barY, w: r.w, h: barH };
    const inner = meter(bar, { value: 0, color: accent });
    const bv = clamp(before / maxV, 0, 1);
    const av = clamp(after / maxV, 0, 1);
    const lo = Math.min(bv, av);
    const hi = Math.max(bv, av);
    rect(inner.x, inner.y, Math.round(inner.w * lo), inner.h, mix(c.textDim, c.inset, 0.35));
    if (hi > lo) {
      rect(inner.x + Math.round(inner.w * lo), inner.y, Math.round(inner.w * (hi - lo)), inner.h, accent);
      {
        // штриховка отличает «станет» от «было» и без цвета
        S.ctx.save();
        S.ctx.beginPath();
        S.ctx.rect(inner.x + Math.round(inner.w * lo), inner.y, Math.round(inner.w * (hi - lo)), inner.h);
        S.ctx.clip();
        S.ctx.fillStyle = 'rgba(0,0,0,0.22)';
        for (let sx = inner.x; sx < inner.x + inner.w; sx += px() * 3) S.ctx.fillRect(sx, inner.y, px(), inner.h);
        S.ctx.restore();
      }
    }
    return good;
  }

  /** Ползунок 0..1; возвращает новое значение. */
  function slider(id, r, value, o = {}) {
    const c = S.th.c;
    const cell = px();
    hit(id, r, { capture: true, focusable: true, slider: true });
    const a = stepAnim(id);
    let v = value;
    const trackH = Math.max(cell * 3, Math.round(r.h * 0.3));
    const track = { x: r.x + cell * 2, y: r.y + (r.h - trackH) / 2, w: r.w - cell * 4, h: trackH };
    if (S.sliderDrag && S.sliderDrag.id === id) {
      v = clamp((S.sliderDrag.x - track.x) / track.w, 0, 1);
      if (o.step) v = Math.round(v / o.step) * o.step;
      if (S.sliderDrag.released) S.sliderDrag = null;
    } else if (S.sliderNudge && S.sliderNudge.id === id) {
      v = clamp(Math.round((value + S.sliderNudge.delta) / (o.step || 0.05)) * (o.step || 0.05), 0, 1);
      S.sliderNudge = null;
    }
    meter(track, { value: v, color: o.color || c.amber, bg: c.inset });
    const kx = track.x + track.w * v;
    const kw = Math.round(r.h * 0.5);
    nine(a.press > 0.4 ? 'primaryPress' : a.hover > 0.4 ? 'primaryHover' : 'primary', kx - kw / 2, r.y + (r.h - r.h * 0.8) / 2, kw, r.h * 0.8, Math.max(1, Math.round(cell / 2)));
    if (S.focusVisible && S.focusId === id) focusRing(r);
    return v;
  }

  /** Переключатель (вкл/выкл). Возвращает новое значение. */
  function toggle(id, r, value, o = {}) {
    const c = S.th.c;
    const clicked = button(id, r, { variant: 'card', disabled: o.disabled });
    const cell = px();
    const sw = { x: r.x + r.w - cell * 3 - Math.round(r.h * 1.1), y: r.y + (r.h - cell * 6) / 2 - cell, w: Math.round(r.h * 1.1), h: cell * 6 };
    const inner = meter(sw, { value: value ? 1 : 0, color: value ? c.green : c.textMute });
    const kx = value ? sw.x + sw.w - cell * 5 : sw.x + cell * 2;
    rect(kx, sw.y + cell, cell * 3, sw.h - cell * 2, c.white);
    drawText(value ? t('common.on') : t('common.off'), sw.x - cell * 2, r.y + r.h / 2 - cell, { size: fs(12), color: value ? c.green : c.textMute, align: 'right' });
    return clicked ? !value : value;
  }

  // ---------- вкладки ----------

  function tabs(id, r, items, active, o = {}) {
    const cell = px();
    const slots = [];
    const w = (r.w - cell * (items.length - 1)) / items.length;
    items.forEach((it, i) => slots.push({ x: Math.round(r.x + i * (w + cell)), y: r.y, w: Math.round(w), h: r.h }));
    let next = active;
    items.forEach((it, i) => {
      const isOn = it.id === active;
      const clicked = button(`${id}-${it.id}`, slots[i], { label: it.label, icon: it.icon, variant: isOn ? 'tabOn' : 'tab', size: o.size || fs(13), badge: it.badge, active: isOn, color: isOn ? S.th.c.text : S.th.c.textDim, iconColor: isOn ? S.th.c.amber : S.th.c.textDim });
      if (isOn) rect(slots[i].x + cell * 2, slots[i].y + slots[i].h - cell * 2, slots[i].w - cell * 4, cell, S.th.c.amber);
      if (clicked && !isOn) {
        next = it.id;
        sfx('tab');
      }
    });
    return next;
  }

  // ---------- прокрутка ----------

  function scrollArea(id, r, contentH, draw, o = {}) {
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
      const cell = px();
      const barH = Math.max(cell * 6, Math.round((r.h * r.h) / ch));
      const t0 = s.max > 0 ? clamp(s.offset / s.max, 0, 1) : 0;
      const by = r.y + Math.round((r.h - barH) * t0);
      const active = s.dragging || !s.settled;
      S.ctx.globalAlpha = active ? 0.95 : 0.5;
      rect(r.x + r.w - cell * 2, by, cell, barH, c.amber);
      S.ctx.globalAlpha = 1;
      if (s.offset > 2) fadeEdge(r, true);
      if (s.offset < s.max - 2) fadeEdge(r, false);
    }
    return s;
  }

  function fadeEdge(r, topEdge) {
    const ctx = S.ctx;
    const h = Math.min(18, r.h * 0.12);
    const g = ctx.createLinearGradient(0, topEdge ? r.y : r.y + r.h, 0, topEdge ? r.y + h : r.y + r.h - h);
    g.addColorStop(0, o2(S.th.c.panel, 0.9));
    g.addColorStop(1, o2(S.th.c.panel, 0));
    ctx.fillStyle = g;
    ctx.fillRect(r.x, topEdge ? r.y : r.y + r.h - h, r.w, h);
  }

  const o2 = (hex, a) => withAlpha(hex, a);

  /** Список с виртуализацией. draw(i, rect) вызывается только для видимых элементов. */
  function scrollList(id, r, o) {
    const { count, itemH, gap = 0 } = o;
    const contentH = Math.max(0, count * (itemH + gap) - gap);
    const innerW = r.w - px() * 3;
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
    if (cost.coins) w += size * 1.2 + text.measure(fmtCompact(cost.coins), size) + gap;
    if (cost.data) w += size * 1.2 + text.measure(fmtCompact(cost.data), size) + gap;
    return Math.max(0, w - gap);
  }

  /**
   * Цена: монеты (золото) и данные (циан); недостающее подсвечено красным и значком.
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
      icon(it.icon, cx + size * 0.6, y, size * 1.15, it.color);
      cx += size * 1.2;
      const str = fmtCompact(it.val);
      const col = it.ok ? it.color : c.red;
      const wd = drawText(str, cx, y, { size, color: col, weight: 900, shadow: 'rgba(0,0,0,0.6)' }).w;
      cx += wd;
      if (!it.ok) {
        icon('warn', cx + size * 0.55, y, size * 0.9, c.red);
        cx += size * 1.1;
      }
      cx += size * 0.5;
    }
    return total;
  }

  /** Ресурс в капсуле: иконка и число. Возвращает ширину. */
  function resourceChip(x, y, w, h, iconName, value, color, o = {}) {
    const cell = px();
    nine('inset', x, y, w, h, Math.max(1, Math.round(cell * 0.75)));
    const size = Math.round(h * 0.46);
    icon(iconName, x + h * 0.55, y + h / 2, Math.round(h * 0.6), color);
    drawText(fmtInt(value), x + w - cell * 3, y + h / 2, { size, color, align: 'right', weight: 900, dynamic: o.dynamic, maxWidth: w - h * 0.9 });
  }

  // ---------- подсказки и уведомления ----------

  const MAX_TOASTS = 2;
  const pending = [];

  /** Уведомление: одновременно видны не больше двух, остальные ждут своей очереди. */
  function toast(message, o = {}) {
    if (toasts.some((x) => x.message === message) || pending.some((x) => x.message === message)) return;
    pending.push({ message, kind: o.kind || 'info', icon: o.icon, ttl: o.ttl || 2.3, t0: 0 });
    if (pending.length > 4) pending.shift();
  }

  /**
   * Якорь стопки уведомлений. edge 'bottom': y — нижняя граница, стопка растёт вверх (до двух сразу);
   * edge 'top': y — центр первого, видно по одному (экраны без дока: поверх шапки, правее кнопки «назад»).
   * area — область по горизонтали (по умолчанию вся безопасная).
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
    const size = fs(14);
    const h = Math.round(size * 2.4);
    const zone = S.toastArea || L.area;
    const anchor = S.toastY ?? L.area.y + L.area.h - L.gap * 1.5;
    toasts.forEach((tt, i) => {
      const age = S.time - tt.t0;
      const inK = easeOutCubic(age / 0.2);
      const outK = clamp((tt.ttl - age) / 0.25, 0, 1);
      const w = Math.min(zone.w - L.gap * 2, text.measure(tt.message, size) + size * 3.4);
      const x = zone.x + (zone.w - w) / 2;
      const slide = (1 - inK) * 18 + (1 - outK) * 10;
      const y = top ? anchor - h / 2 - slide : Math.min(anchor, L.area.y + L.area.h - L.gap) - h - i * (h + L.gap) + slide;
      S.ctx.globalAlpha = Math.min(inK, outK);
      const variant = tt.kind === 'bad' ? 'warn' : tt.kind === 'good' ? 'good' : 'raised';
      nine(variant, x, y, w, h, Math.max(1, Math.round(px() * 0.75)));
      const ic = tt.icon || (tt.kind === 'bad' ? 'warn' : tt.kind === 'good' ? 'check' : 'info');
      icon(ic, x + size * 1.2, y + h / 2, size * 1.2, tt.kind === 'bad' ? c.red : tt.kind === 'good' ? c.white : c.amber);
      drawText(tt.message, x + size * 2.2, y + h / 2, { size, color: c.text, maxWidth: w - size * 3 });
      S.ctx.globalAlpha = 1;
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
    const w = Math.max(...lines.map((l) => text.measure(l, size))) + size * 1.4;
    const h = lines.length * size * 1.3 + size * 1.0;
    const x = clamp(S.pointer.x + 14, L.area.x + 4, L.area.x + L.area.w - w - 4);
    const y = clamp(S.pointer.y + 18, L.area.y + 4, L.area.y + L.area.h - h - 4);
    nine('raised', x, y, w, h, Math.max(1, Math.round(px() * 0.6)));
    lines.forEach((ln, i) => drawText(ln, x + size * 0.7, y + size * 0.5 + i * size * 1.3 + size * 0.65, { size, color: c.text }));
  }

  // ---------- модальные карточки ----------

  /**
   * Модальная карточка. Возвращает true, когда её закрыли.
   * o: title, body, icon, button, extra(rectInner)
   */
  function modal(id, o) {
    const L = S.L;
    const c = S.th.c;
    const a = anim(`modal-${id}`);
    const age = S.time - a.born;
    const k = easeOutCubic(age / 0.22);
    let closed = false;
    withLayer(100, () => {
      const full = { x: 0, y: 0, w: L.w, h: L.h };
      hit('barrier', full, {});
      S.ctx.globalAlpha = 0.72 * k;
      rect(0, 0, L.w, L.h, c.bg);
      S.ctx.globalAlpha = 1;
      const w = Math.min(L.area.w - L.gap * 4, Math.round(420 * L.ui));
      const bodyH = text.blockHeight(o.body || '', w - L.pad * 4, fs(14), 1.3);
      const h = Math.min(L.area.h - L.gap * 4, Math.round(fs(120) + bodyH + L.touch(56) + (o.extraH || 0)));
      const x = L.area.x + (L.area.w - w) / 2;
      const y = L.area.y + (L.area.h - h) / 2 + (1 - k) * 30;
      S.ctx.globalAlpha = k;
      const inner = panel({ x, y, w, h }, { variant: 'raised' });
      let cy = inner.y + L.gap;
      if (o.icon) {
        const ring = fs(52);
        nine('inset', x + w / 2 - ring / 2, cy, ring, ring);
        icon(o.icon, x + w / 2, cy + ring / 2, fs(32), c.amber);
        cy += ring + L.gap * 1.5;
      }
      if (o.kicker) {
        drawText(o.kicker, x + w / 2, cy, { size: fs(12), color: c.amber, align: 'center', baseline: 'top', weight: 900 });
        cy += fs(16);
      }
      drawText(o.title, x + w / 2, cy, { size: fs(20), color: c.text, align: 'center', baseline: 'top', maxWidth: inner.w, shadow: 'rgba(0,0,0,0.6)' });
      cy += fs(28);
      const used = paragraph(o.body || '', inner.x, cy, inner.w, { size: fs(14), lineHeight: 1.3, align: 'center' });
      cy += used + L.gap;
      if (o.extra) cy += o.extra({ x: inner.x, y: cy, w: inner.w }) || 0;
      const bh = L.touch(52);
      if (button(`modal-${id}-ok`, { x: inner.x, y: y + h - L.pad - bh, w: inner.w, h: bh }, { label: o.button || t('common.ok'), variant: 'primary', size: fs(16) })) closed = true;
      S.ctx.globalAlpha = 1;
    });
    if (S.back || S.clicked === 'barrier') closed = true;
    return closed;
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
    progress,
    statDelta,
    slider,
    toggle,
    tabs,
    scrollArea,
    scrollList,
    resetScroll,
    costChip,
    costWidth,
    resourceChip,
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
    sfx,
    get L() { return S.L; },
    get th() { return S.th; },
    get c() { return S.th.c; },
    get time() { return S.time; },
    get dt() { return S.dt; },
    get clicked() { return S.clicked; },
    get back() { return S.back; },
    get denied() { return S.denied; },
    get emptyTap() { return S.emptyTap; },
    get dragDx() { return S.dragDx; },
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
