// Приборы полёта по эпохам (skin.instr): E0 стрелочные и барабанные счётчики на лампах, E1 светодиодные семисегментные табло,
// E2 цифровые шкалы и точечные матрицы, E3 плоские индикаторы, E4 проекция, E5 голографика.
// Раскладка и размеры одни на все эпохи (layout.hudLayout): меняется только то, что нарисовано в прямоугольнике прибора.

import { clamp } from '../format.js';
import { mix } from '../theme.js';
import { t } from '../../i18n/index.js';

const kindOf = (kit) => kit.S.skin.instr;

// ---------- высота ----------

/** Барабанный счётчик (E0): каждый разряд — тёмный барабан с цифрой, младший крутится плавно, остальные — при переносе. */
function drumCounter(kit, r, meters, digits) {
  const c = kit.c;
  const cc = kit.cell();
  const n = digits;
  const pad = cc * 3;
  const dw = Math.min(Math.floor((r.w - pad * 2) / n), Math.round(r.h * 0.62));
  const dh = r.h - pad * 2;
  const total = dw * n;
  const x0 = Math.round(r.x + (r.w - total) / 2);
  const y0 = r.y + pad;
  const size = kit.text.fit('8', dw - cc * 2, Math.round(dh * 0.8)).size;
  const value = Math.max(0, meters);
  for (let i = 0; i < n; i++) {
    const power = n - 1 - i;
    const wx = x0 + i * dw;
    const unit = 10 ** power;
    const digit = Math.floor(value / unit) % 10;
    // дробная часть текущего разряда: старшие барабаны поворачиваются только в конце оборота младшего
    const frac = (value / unit) % 1;
    const roll = power === 0 ? frac : clamp((frac - 0.9) * 10, 0, 1);
    kit.rect(wx, y0, dw, dh, c.ink);
    kit.pushClip({ x: wx + cc, y: y0 + cc, w: dw - cc * 2, h: dh - cc * 2 });
    const step = dh - cc * 2;
    const cy = y0 + dh / 2 - roll * step;
    kit.drawText(String(digit), wx + dw / 2, cy, { size, color: c.white, align: 'center' });
    if (roll > 0.001) kit.drawText(String((digit + 1) % 10), wx + dw / 2, cy + step, { size, color: c.white, align: 'center' });
    kit.popClip();
    // объём барабана: затенённые края и блик по центру
    kit.rect(wx + cc, y0 + cc, cc, dh - cc * 2, mix(c.navy1, '#000000', 0.2));
    kit.rect(wx + dw - cc * 2, y0 + cc, cc, dh - cc * 2, mix(c.navy1, '#000000', 0.2));
    kit.rect(wx + cc, y0 + cc, dw - cc * 2, cc, c.navy1);
    kit.rect(wx + cc, y0 + dh - cc * 2, dw - cc * 2, cc, c.navy1);
  }
}

/**
 * Высота. alt = fmtAlt(...), meters — высота в метрах, alarm — горит ли лампа тревоги.
 * Рисует рамку прибора, лампу тревоги слева и показание по эпохе.
 */
export function altitude(kit, r, f, o) {
  const c = kit.c;
  const cc = kit.cell();
  const kind = kindOf(kit);
  const { alt, unit, alarm, meters } = o;
  const str = alt.value.replace(/[\s ]/g, '');
  const lampW = Math.round(r.h * 0.55);
  const lampX = r.x + lampW / 2 + cc;
  const lampColor = alarm ? c.red : c.green;
  if (kind === 'analog') {
    kit.nine('raised', r.x, r.y, r.w, r.h);
    kit.lamp(r.x + lampW * 0.55, r.y + r.h / 2, Math.round(r.h * 0.34), alarm ? c.red : c.amber, alarm || true, alarm);
    // барабаны всегда показывают метры: механический счётчик не умеет переключать единицы
    const meterUnit = t('unit.m');
    const unitW = kit.text.measure(meterUnit, kit.fs(10)) + cc * 5;
    drumCounter(kit, { x: r.x + lampW, y: r.y, w: r.w - lampW - unitW, h: r.h }, meters, meters >= 99999.5 ? 6 : 5);
    kit.drawText(meterUnit, r.x + r.w - cc * 3, r.y + r.h / 2, { size: kit.fs(10), color: c.amberLight, align: 'right' });
    return;
  }
  if (kind === 'led') {
    const unitW = kit.text.measure(unit, kit.fs(10)) + cc * 3;
    kit.segDisplay({ x: r.x + lampW, y: r.y, w: r.w - lampW, h: r.h }, str, { lit: c.amber, ghost: c.navy2, digits: 4, h: Math.round(r.h * 0.56), padRight: unitW + cc * 2 });
    kit.nine('screen', r.x, r.y, lampW + cc * 2, r.h);
    kit.lamp(lampX, r.y + r.h / 2, Math.round(r.h * 0.34), lampColor, true, alarm);
    kit.drawText(unit, r.x + r.w - cc * 3, r.y + r.h - cc * 5, { size: kit.fs(10), color: c.amber, align: 'right' });
    return;
  }
  // цифровые и плоские эпохи: число пиксельным шрифтом крупно
  const size = Math.round(r.h * 0.46);
  if (kind === 'digital') {
    kit.nine('screen', r.x, r.y, r.w, r.h);
    kit.rect(r.x + cc * 2, r.y + cc * 2, r.w - cc * 4, r.h - cc * 4, c.navy1);
    kit.lamp(lampX, r.y + r.h / 2, Math.round(r.h * 0.34), lampColor, true, alarm);
    kit.drawText(str, r.x + r.w - cc * 4 - kit.text.measure(unit, kit.fs(10)) - cc * 2, r.y + r.h / 2, { size, color: c.greenLight, align: 'right', maxWidth: r.w - lampW - cc * 14 });
    kit.drawText(unit, r.x + r.w - cc * 3, r.y + r.h - cc * 5, { size: kit.fs(10), color: c.green, align: 'right' });
    return;
  }
  kit.nine('glass', r.x, r.y, r.w, r.h);
  const col = kind === 'projection' ? c.cyan : kind === 'holo' ? (alarm ? c.redLight : c.greenLight) : c.white;
  kit.lamp(lampX, r.y + r.h / 2, Math.round(r.h * 0.34), alarm ? c.red : kind === 'holo' ? c.cyan : c.green, true, alarm);
  kit.drawText(str, r.x + r.w - cc * 4 - kit.text.measure(unit, kit.fs(10)) - cc * 2, r.y + r.h / 2, { size, color: col, align: 'right', shadow: true, maxWidth: r.w - lampW - cc * 14 });
  kit.drawText(unit, r.x + r.w - cc * 3, r.y + r.h - cc * 5, { size: kit.fs(10), color: col, align: 'right' });
  kit.rect(r.x + lampW, r.y + r.h - cc, r.w - lampW - cc * 2, cc, mix(col, '#000000', 0.45));
}

// ---------- вертикальная скорость ----------

/** Стрелочный указатель (E0): шкала дугой вокруг оси ниже прибора, стрелка, красная зона — быстрее допуска посадки. */
function needleMeter(kit, r, climb, tol, full) {
  const c = kit.c;
  const cc = kit.cell();
  kit.nine('screen', r.x, r.y, r.w, r.h);
  const cx = r.x + r.w / 2;
  const R = Math.max(r.h * 1.1, r.w * 0.34);
  const cy = r.y + r.h - cc * 4 + R * 0.62;
  kit.pushClip({ x: r.x + cc, y: r.y + cc, w: r.w - cc * 2, h: r.h - cc * 2 });
  const span = 0.62; // половина дуги, радианы
  const tolK = clamp(tol / full, 0, 1);
  for (let i = -10; i <= 10; i++) {
    const k = i / 10;
    const th = -Math.PI / 2 + k * span;
    const major = i % 5 === 0;
    const len = major ? cc * 4 : cc * 2;
    const danger = k < -tolK;
    const color = i === 0 ? c.white : danger ? c.red : c.steel3;
    kit.line(cx + Math.cos(th) * R, cy + Math.sin(th) * R, cx + Math.cos(th) * (R - len), cy + Math.sin(th) * (R - len), color);
  }
  const k = clamp(climb / full, -1, 1);
  const th = -Math.PI / 2 + k * span;
  kit.line(cx, cy, cx + Math.cos(th) * (R - cc), cy + Math.sin(th) * (R - cc), c.amberLight);
  kit.popClip();
}

/** Вертикальная скорость: число и лента допуска посадки (эпоха выбирает вид). */
export function vspeed(kit, r, o) {
  const c = kit.c;
  const cc = kit.cell();
  const kind = kindOf(kit);
  const { climb, tol, vcol, numStr } = o;
  const full = Math.max(tol * 3, 20);
  const topRow = r.y + r.h * 0.34;
  const iconName = climb >= 0 ? 'up' : 'down';
  if (kind === 'analog') {
    needleMeter(kit, r, climb, tol > 0 ? tol : 25, full);
    kit.icon(iconName, r.x + cc * 8, r.y + r.h - cc * 8, Math.round(r.h * 0.34), vcol);
    kit.drawText(numStr, r.x + r.w - cc * 3, r.y + r.h - cc * 7, { size: Math.max(9, Math.round(r.h * 0.34)), color: vcol, align: 'right', maxWidth: r.w * 0.45, shadow: true });
    return;
  }
  kit.nine(kind === 'led' || kind === 'digital' ? 'screen' : 'glass', r.x, r.y, r.w, r.h);
  kit.icon(iconName, r.x + cc * 8, topRow, Math.round(r.h * 0.4), vcol);
  kit.drawText(numStr, r.x + r.w - cc * 3, topRow, { size: Math.max(9, Math.round(r.h * 0.4)), color: vcol, align: 'right', maxWidth: r.w - cc * 16 });
  const ribbon = { x: r.x + cc * 3, y: r.y + r.h * 0.62, w: r.w - cc * 6, h: r.h * 0.28 };
  ribbonScale(kit, ribbon, climb, tol > 0 ? tol : 25, vcol, kind);
}

/** Лента от нуля: вправо — набор высоты, влево — спуск; белая риска — допуск посадки. */
function ribbonScale(kit, r, climb, tol, color, kind) {
  const c = kit.c;
  const cc = kit.cell();
  const n = kind === 'digital' ? 21 : 15;
  const mid = (n - 1) / 2;
  const gap = cc;
  const w = Math.max(cc, Math.floor((r.w - gap * (n - 1)) / n));
  const total = w * n + gap * (n - 1);
  const x0 = Math.round(r.x + (r.w - total) / 2);
  const full = Math.max(tol * 3, 20);
  const lit = Math.round(clamp(Math.abs(climb) / full, 0, 1) * mid);
  const dir = climb >= 0 ? 1 : -1;
  const tolCells = Math.round(clamp(tol / full, 0, 1) * mid);
  if (kind === 'flat' || kind === 'projection' || kind === 'holo') {
    // тонкая линия шкалы и маркер текущего значения
    const yy = Math.round(r.y + r.h / 2);
    const line = kind === 'projection' ? c.cyan : kind === 'holo' ? c.cyan : c.steel2;
    kit.rect(x0, yy, total, cc, mix(line, '#000000', 0.5));
    for (let i = 0; i < n; i += 2) kit.rect(x0 + i * (w + gap), yy - cc * 2, w, cc * 2, mix(line, '#000000', 0.2));
    kit.rect(x0 + Math.round(mid) * (w + gap) - cc, yy - cc * 3, w + cc * 2, cc * 7, c.steel3);
    const mx = x0 + Math.round(mid + dir * lit) * (w + gap);
    kit.rect(mx - cc, yy - cc * 4, w + cc * 2, cc * 9, color);
    kit.rect(x0 + (mid - tolCells) * (w + gap), yy - cc * 4, cc, cc * 9, c.red);
    return;
  }
  for (let i = 0; i < n; i++) {
    const off = i - mid;
    const on = off === 0 || (Math.sign(off) === dir && Math.abs(off) <= lit);
    const isTol = Math.abs(off) === tolCells && off < 0;
    const zone = kind === 'digital' ? (off < -tolCells ? c.red : off < 0 ? c.amber : c.green) : color;
    kit.rect(x0 + i * (w + gap), r.y, w, r.h, on ? (kind === 'digital' ? zone : color) : isTol ? c.steel1 : c.navy2);
    if (isTol) kit.rect(x0 + i * (w + gap), r.y - cc, w, cc, c.white);
  }
}

// ---------- шкалы топлива и прочности ----------

/**
 * Шкала запаса: r — полоска (горизонтальная или вертикальная), v 0..1, color, lowAt — порог тревоги.
 * Лампа накаливания на лампах (E0), светодиодные сегменты (E1), цветные деления (E2), тонкая линия (E3–E5).
 */
export function gauge(kit, r, v, color, lowAt) {
  const c = kit.c;
  const cc = kit.cell();
  const kind = kindOf(kit);
  const vertical = r.h > r.w;
  const low = v <= lowAt;
  if (kind === 'analog') {
    kit.nine('screen', r.x, r.y, r.w, r.h);
    const len = vertical ? r.h : r.w;
    const thick = vertical ? r.w : r.h;
    const size = Math.max(cc * 5, Math.round(thick * 0.9));
    const n = clamp(Math.floor(len / (size * 1.25)), 4, 12);
    const lit = Math.round(v * n);
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const cx = vertical ? r.x + r.w / 2 : r.x + len * t;
      const cy = vertical ? r.y + r.h - len * t : r.y + r.h / 2;
      kit.lamp(cx, cy, size, low ? c.red : color, i < lit, low && i === lit - 1);
    }
    return;
  }
  if (kind === 'led') {
    kit.ledBar(r, { value: v, color, warn: lowAt, vertical, segments: vertical ? 8 : 10 });
    return;
  }
  if (kind === 'digital') {
    // мелкие цветные деления: зелёные, жёлтые, красные
    kit.nine('screen', r.x, r.y, r.w, r.h);
    const inner = { x: r.x + cc * 2, y: r.y + cc * 2, w: r.w - cc * 4, h: r.h - cc * 4 };
    const len = vertical ? inner.h : inner.w;
    const n = clamp(Math.floor(len / (cc * 2)), 10, 40);
    const lit = Math.round(v * n);
    const seg = Math.max(cc, Math.floor((len - (n - 1)) / n));
    for (let i = 0; i < n; i++) {
      const t = i / n;
      const col = t < 0.2 ? c.red : t < 0.5 ? c.amber : color;
      const on = i < lit;
      const pos = Math.round(i * (seg + 1));
      if (vertical) kit.rect(inner.x, inner.y + inner.h - pos - seg, inner.w, seg, on ? col : c.navy2);
      else kit.rect(inner.x + pos, inner.y, seg, inner.h, on ? col : c.navy2);
    }
    return;
  }
  // плоские эпохи: тонкая линия с засечками; проекция и голографика добавляют свечение цвета состояния
  const accent = low ? c.red : kind === 'projection' ? c.cyan : kind === 'holo' ? mix(color, c.cyan, 0.4) : color;
  kit.nine('glass', r.x, r.y, r.w, r.h);
  const len = vertical ? r.h - cc * 2 : r.w - cc * 2;
  const fill = Math.round(clamp(v, 0, 1) * len);
  if (vertical) {
    kit.rect(r.x + r.w / 2 - cc, r.y + cc, cc * 2, len, mix(accent, '#000000', 0.65));
    kit.rect(r.x + r.w / 2 - cc, r.y + cc + len - fill, cc * 2, fill, accent);
    for (let i = 0; i <= 4; i++) kit.rect(r.x + cc * 2, r.y + cc + Math.round((len * i) / 4), r.w - cc * 4, cc, mix(accent, '#000000', 0.5));
  } else {
    kit.rect(r.x + cc, r.y + r.h / 2 - cc, len, cc * 2, mix(accent, '#000000', 0.65));
    kit.rect(r.x + cc, r.y + r.h / 2 - cc, fill, cc * 2, accent);
    for (let i = 0; i <= 4; i++) kit.rect(r.x + cc + Math.round((len * i) / 4), r.y + cc * 2, cc, r.h - cc * 4, mix(accent, '#000000', 0.5));
  }
}

// ---------- цифровые табло для итогов и счётчиков ----------

/**
 * Рамка табло с числом (итоги полёта): барабанные ячейки (E0), светодиодные сегменты (E1), цифры на ЖК (E2), плоские цифры (E3–E5).
 * o: lit (цвет), digits (число знакомест), h (высота цифр).
 */
export function readout(kit, r, str, o = {}) {
  const c = kit.c;
  const cc = kit.cell();
  const kind = kindOf(kit);
  const s = String(str);
  const lit = o.lit || c.green;
  if (kind === 'led') {
    kit.segDisplay(r, s, { lit: kind === 'led' ? c.amber : lit, digits: o.digits, h: o.h });
    return;
  }
  kit.nine(kind === 'analog' || kind === 'digital' ? 'screen' : 'glass', r.x, r.y, r.w, r.h);
  const cells = Math.max(o.digits || s.length, s.length);
  const size = kit.text.fit('8', Math.floor((r.w - cc * 6) / cells) - cc, Math.round((o.h || r.h * 0.5) * 1.1)).size;
  const step = kit.text.stepFor(size).css * 6;
  const total = cells * (step + cc);
  let x = r.x + r.w - cc * 3 - total;
  const pad = cells - s.length;
  for (let i = 0; i < cells; i++) {
    const ch = i < pad ? '' : s[i - pad];
    if (kind === 'analog') {
      // барабанные ячейки: тёмный барабан со светлой цифрой
      kit.rect(x, r.y + cc * 3, step + cc, r.h - cc * 6, c.ink);
      kit.rect(x + cc, r.y + cc * 3, cc, r.h - cc * 6, c.navy1);
    }
    if (ch) kit.drawText(ch, x + (step + cc) / 2, r.y + r.h / 2, { size, color: kind === 'analog' ? c.white : lit, align: 'center' });
    x += step + cc;
  }
}

/** Крупное число без рамки (счётчики монет и данных): семисегментное в E1, пиксельный шрифт в остальных эпохах. */
export function bigDigits(kit, str, x, y, h, color, align = 'left') {
  const kind = kindOf(kit);
  if (kind === 'led') return kit.bigNumber(str, x, y, h, color, align);
  const c = kit.c;
  const size = Math.round(h * 0.9);
  const w = kit.text.measure(String(str), size);
  kit.drawText(String(str), align === 'right' ? x : align === 'center' ? x + w / 2 : x + w, y + h / 2, { size, color: kind === 'analog' ? c.amberLight : color, align: 'right', shadow: true });
  return w;
}
