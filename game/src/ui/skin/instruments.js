// Приборы по эпохам (skin.instr). У каждой эпохи свои ФОРМЫ приборов, а не только цвет:
//   E0 analog     — барабанный счётчик высоты, стрелка скорости, ряд ламп накаливания вместо шкал, рычаг и штурвал из металла;
//   E1 led        — семисегментные табло, ряд светодиодных квадратов, светодиодная колонка тяги;
//   E2 digital    — точечная матрица (каждый пиксель цифры — отдельная точка), цветные деления, цифровая шкала тяги;
//   E3 flat       — плоские дисплеи на чистом тёмном фоне с тонкой рамкой: цифры, бегущая линейка, дуга скорости, тонкие линии,
//                   плавная анимация стрелок и значений;
//   E4 projection — проекция поверх стекла: тонкие светящиеся контуры и дуги, полупрозрачные шкалы, адаптивные метки
//                   (шаг линейки растёт с высотой, светится окно допуска посадки, метка ближайшего рубежа);
//   E5 holo       — голографика: плавающие полупрозрачные шкалы из точек, цвет по состоянию (норма / внимание / тревога),
//                   живое мерцание.
// Раскладка и размеры одни на все эпохи (layout.hudLayout): меняется только то, что нарисовано в прямоугольнике прибора.
// Под цифрами нигде нет шахматного узора: фон чистый (непрозрачный или ровный полупрозрачный), контраст цифр проверяет тест.

import { clamp } from '../format.js';
import { mix } from '../theme.js';
import { t } from '../../i18n/index.js';
import { glyphRows, normalize } from '../font-pixel.js';

const kindOf = (kit) => kit.S.skin.instr;
const isCrtEra = (kind) => kind === 'analog' || kind === 'led' || kind === 'digital';
const isGlassEra = (kind) => kind === 'projection' || kind === 'holo';

// ---------- общие помощники ----------

const damped = new Map();

/** Плавное приближение показания к значению (E3–E5 «мягкая анимация»); при «меньше движения» — без сглаживания. */
function soft(kit, key, value, rate = 8) {
  if (kit.S.settings.reduceMotion) return value;
  const prev = damped.get(key);
  const next = prev === undefined || !Number.isFinite(prev) ? value : prev + (value - prev) * (1 - Math.exp(-rate * Math.min(0.1, kit.dt || 1 / 60)));
  damped.set(key, next);
  return next;
}

/** Живое мерцание яркости 0..1 (E5, лёгкое — E4 и ЭЛТ). */
function flicker(kit, seed, amp = 0.06) {
  if (kit.S.settings.reduceMotion) return 1;
  const t0 = kit.time;
  return 1 - amp * (0.5 + 0.5 * Math.sin(t0 * 31 + seed * 1.7)) * (0.6 + 0.4 * Math.sin(t0 * 5.3 + seed));
}

/** Высота глифа, кратная масштабу шрифта, не больше availH (но не меньше ×2). */
const fitSize = (availH) => Math.max(2, Math.floor(availH / 7)) * 7;

/** Цвет состояния: 0 — норма, 1 — внимание, 2 — тревога. */
function stateColor(kit, level, normal) {
  const c = kit.c;
  return level >= 2 ? c.red : level === 1 ? c.amber : normal || c.cyan;
}

const withAlpha = (kit, a, fn) => {
  const ctx = kit.S.ctx;
  const prev = ctx.globalAlpha;
  ctx.globalAlpha = prev * a;
  try {
    fn();
  } finally {
    ctx.globalAlpha = prev;
  }
};

/** Точки по дуге окружности (толщина — одна клетка). */
function arcDots(kit, cx, cy, R, a0, a1, color, o = {}) {
  const cc = kit.cell();
  const pitch = (o.pitch || 1.6) * cc;
  const n = Math.max(2, Math.ceil((Math.abs(a1 - a0) * R) / pitch));
  const size = o.size || cc;
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    kit.rect(Math.round((cx + Math.cos(a) * R) / cc) * cc, Math.round((cy + Math.sin(a) * R) / cc) * cc, size, size, color);
  }
}

/** Подложка прибора под цифры: чистая, без шахматного узора. Проекция и голограмма — ровная полупрозрачная заливка с кромкой. */
export function panelFor(kit, r, kind, o = {}) {
  const c = kit.c;
  const cc = kit.cell();
  const tok = kit.S.skin.hud;
  const bg = c[tok.bg] || c.navy0;
  if (kind === 'flat') {
    kit.rect(r.x, r.y, r.w, r.h, c.steel2);
    kit.rect(r.x + cc, r.y + cc, r.w - cc * 2, r.h - cc * 2, bg);
    return;
  }
  const accent = o.accent || c.cyan;
  const a = tok.bgAlpha * (kind === 'holo' ? flicker(kit, r.x, 0.08) : 1);
  withAlpha(kit, a, () => kit.rect(r.x, r.y, r.w, r.h, bg));
  if (kind === 'projection') {
    // тонкие светящиеся уголки-скобки: контур проецируется на стекло
    const arm = Math.min(cc * 5, Math.floor(r.h / 3));
    for (const [x, y, sx, sy] of [[r.x, r.y, 1, 1], [r.x + r.w, r.y, -1, 1], [r.x, r.y + r.h, 1, -1], [r.x + r.w, r.y + r.h, -1, -1]]) {
      kit.rect(sx > 0 ? x : x - arm, sy > 0 ? y : y - cc, arm, cc, accent);
      kit.rect(sx > 0 ? x : x - cc, sy > 0 ? y : y - arm, cc, arm, accent);
    }
  } else {
    // голограмма: светящиеся кромки сверху и снизу и «живая» полоса развёртки
    withAlpha(kit, 0.7 * flicker(kit, r.y, 0.1), () => {
      kit.rect(r.x + cc * 2, r.y, r.w - cc * 4, cc, accent);
      kit.rect(r.x + cc * 2, r.y + r.h - cc, r.w - cc * 4, cc, accent);
    });
    if (!kit.S.settings.reduceMotion) {
      const yy = r.y + cc + Math.floor(((kit.time * 0.45 + r.x * 0.003) % 1) * ((r.h - cc * 2) / cc)) * cc;
      withAlpha(kit, 0.22, () => kit.rect(r.x + cc, yy, r.w - cc * 2, cc, accent));
    }
  }
}

/** Шаг линейки по высоте, метры: растёт с высотой (адаптивная шкала). */
function rulerStep(meters) {
  if (meters < 100) return 5;
  if (meters < 1000) return 50;
  if (meters < 10000) return 500;
  if (meters < 100000) return 5000;
  return 50000;
}

/**
 * Бегущая линейка: деления сдвигаются под неподвижной отметкой, каждое пятое — длинное. marks — метки на шкале
 * (например, ближайший рубеж), подсвечиваются своим цветом.
 */
function ruler(kit, r, value, step, color, o = {}) {
  const cc = kit.cell();
  const pitch = cc * 4;
  const cx = r.x + r.w / 2;
  const base = value / step;
  const first = Math.floor(base - r.w / 2 / pitch) - 1;
  const last = Math.ceil(base + r.w / 2 / pitch) + 1;
  kit.pushClip(r);
  for (let i = first; i <= last; i++) {
    if (i < 0) continue;
    const x = Math.round((cx + (i - base) * pitch) / cc) * cc;
    const major = i % 5 === 0;
    kit.rect(x, r.y + (major ? 0 : cc), cc, major ? r.h : r.h - cc, major ? color : mix(color, '#000000', 0.5));
  }
  for (const m of o.marks || []) {
    const x = Math.round((cx + (m.value / step - base) * pitch) / cc) * cc;
    if (x > r.x && x < r.x + r.w) kit.rect(x - cc, r.y, cc * 3, r.h, m.color);
  }
  kit.popClip();
  // неподвижная отметка: «носик» над линейкой
  const mx = Math.round(cx / cc) * cc;
  kit.rect(mx - cc, r.y - cc, cc * 3, cc, o.caret || kit.c.white);
  kit.rect(mx, r.y, cc, cc, o.caret || kit.c.white);
}

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
    kit.drawText(String(digit), wx + dw / 2, cy, { size, color: c.white, align: 'center', noAudit: true });
    if (roll > 0.001) kit.drawText(String((digit + 1) % 10), wx + dw / 2, cy + step, { size, color: c.white, align: 'center', noAudit: true });
    kit.popClip();
    // объём барабана: затенённые края и блик по центру
    kit.rect(wx + cc, y0 + cc, cc, dh - cc * 2, mix(c.navy1, '#000000', 0.2));
    kit.rect(wx + dw - cc * 2, y0 + cc, cc, dh - cc * 2, mix(c.navy1, '#000000', 0.2));
    kit.rect(wx + cc, y0 + cc, dw - cc * 2, cc, c.navy1);
    kit.rect(wx + cc, y0 + dh - cc * 2, dw - cc * 2, cc, c.navy1);
  }
}

/**
 * Точечная матрица (E2): каждый «пиксель» глифа — отдельная точка, неяркие точки видны на фоне.
 * Число выровнено вправо по xRight, вертикально по центру yMid. pitch — шаг точек (в клетках).
 */
function dotMatrix(kit, str, xRight, yMid, pitch, on, off) {
  const cc = kit.cell();
  const s = normalize(String(str));
  const step = pitch * cc;
  const glyphW = 5 * step;
  const adv = 6 * step;
  const total = s.length * adv - step;
  let x = Math.round((xRight - total) / cc) * cc;
  const y0 = Math.round((yMid - (7 * step) / 2) / cc) * cc;
  const dot = Math.max(cc, step - cc);
  for (const ch of s) {
    const rows = glyphRows(ch) || [];
    for (let ry = 0; ry < 7; ry++) {
      for (let rx = 0; rx < 5; rx++) {
        const lit = rows[ry]?.[rx] === '#';
        if (ch === ' ') continue;
        kit.rect(x + rx * step, y0 + ry * step, dot, dot, lit ? on : off);
      }
    }
    x += adv;
  }
  return { w: total, h: 7 * step, glyphW };
}

/**
 * Высота. alt = fmtAlt(...), meters — высота в метрах, alarm — горит ли лампа тревоги, nextZone — высота ближайшего рубежа, м.
 * Рисует рамку прибора, лампу тревоги слева и показание по эпохе.
 */
export function altitude(kit, r, f, o) {
  const c = kit.c;
  const cc = kit.cell();
  const kind = kindOf(kit);
  const { alt, unit, alarm, meters, nextZone } = o;
  const str = alt.value.replace(/[\s ]/g, '');
  const lampW = Math.round(r.h * 0.55);
  const lampX = r.x + lampW / 2 + cc;
  const lampColor = alarm ? c.red : c.green;
  if (kind === 'analog') {
    kit.nine('raised', r.x, r.y, r.w, r.h);
    kit.lamp(r.x + lampW * 0.55, r.y + r.h / 2, Math.round(r.h * 0.34), alarm ? c.red : c.amber, true, alarm);
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
  const unitW = kit.text.measure(unit, kit.fs(9)) + cc * 4;
  if (kind === 'digital') {
    // E2: цифры точечной матрицей; неяркие точки показывают всю сетку знакоместа
    kit.nine('screen', r.x, r.y, r.w, r.h);
    kit.rect(r.x + cc * 2, r.y + cc * 2, r.w - cc * 4, r.h - cc * 4, c.navy1);
    kit.lamp(lampX, r.y + r.h / 2, Math.round(r.h * 0.34), lampColor, true, alarm);
    const pitch = r.h >= 54 ? 3 : 2;
    const areaR = r.x + r.w - cc * 3 - unitW;
    dotMatrix(kit, str.padStart(4, ' '), areaR, r.y + r.h / 2, pitch, c.greenLight, mix(c.navy1, c.steel0, 0.45));
    kit.drawText(unit, r.x + r.w - cc * 3, r.y + r.h - cc * 5, { size: kit.fs(9), color: c.green, align: 'right' });
    return;
  }

  // E3–E5: число на чистой подложке и бегущая линейка под ним
  const level = alarm ? 2 : 0;
  const accent = kind === 'flat' ? c.white : kind === 'holo' ? stateColor(kit, level, c.cyan) : alarm ? c.red : c.cyan;
  panelFor(kit, r, kind, { accent });
  kit.lamp(lampX, r.y + r.h * 0.46, Math.round(r.h * 0.3), lampColor, true, alarm);
  const rulerH = cc * 3;
  const rr = { x: r.x + lampW + cc * 3, y: r.y + r.h - cc * 3 - rulerH, w: r.x + r.w - cc * 4 - (r.x + lampW + cc * 3), h: rulerH };
  const avail = rr.y - cc * 3 - (r.y + cc * 2);
  const size = fitSize(avail);
  const shown = soft(kit, 'alt', meters, 7);
  const digitColor = kind === 'flat' ? c.white : kind === 'projection' ? (alarm ? c.redLight : c.cyan) : stateColor(kit, level, c.cyan);
  const numR = r.x + r.w - cc * 4 - unitW;
  kit.drawText(str, numR, r.y + cc * 2 + avail / 2, { size, color: digitColor, align: 'right', shadow: isGlassEra(kind), maxWidth: numR - (r.x + lampW + cc * 2) });
  kit.drawText(unit, r.x + r.w - cc * 3, r.y + cc * 2 + avail / 2, { size: kit.fs(9), color: mix(digitColor, '#000000', 0.25), align: 'right' });
  const step = rulerStep(shown);
  const marks = [];
  if (isGlassEra(kind) && nextZone > 0 && Math.abs(nextZone - shown) < step * 30) marks.push({ value: nextZone, color: c.amber });
  const rc = kind === 'flat' ? c.steel2 : kind === 'projection' ? c.cyan : mix(stateColor(kit, level, c.cyan), '#ffffff', 0.15);
  withAlpha(kit, kind === 'holo' ? 0.8 * flicker(kit, 3, 0.1) : kind === 'projection' ? 0.9 : 1, () => ruler(kit, rr, shown, step, rc, { marks, caret: digitColor }));
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
  if (kind === 'led' || kind === 'digital') {
    kit.nine('screen', r.x, r.y, r.w, r.h);
    kit.icon(iconName, r.x + cc * 8, topRow, Math.round(r.h * 0.4), vcol);
    kit.drawText(numStr, r.x + r.w - cc * 3, topRow, { size: Math.max(9, Math.round(r.h * 0.4)), color: vcol, align: 'right', maxWidth: r.w - cc * 16 });
    ribbonScale(kit, { x: r.x + cc * 3, y: r.y + r.h * 0.62, w: r.w - cc * 6, h: r.h * 0.28 }, climb, tol > 0 ? tol : 25, vcol, kind);
    return;
  }
  const level = tol > 0 && climb < 0 && -climb > tol ? 2 : climb < 0 ? 1 : 0;
  const accent = kind === 'flat' ? vcol : stateColor(kit, level, c.cyan);
  panelFor(kit, r, kind, { accent });
  const shown = soft(kit, 'vs', climb, 9);
  const tolV = tol > 0 ? tol : 25;
  if (kind === 'flat') {
    // E3: сплошная дуга-«прогресс» от нуля вверх по часовой (набор) и против (спуск); красная часть — за допуском
    const cx = r.x + r.w / 2;
    const R = Math.max(cc * 8, Math.min(r.w * 0.4, r.h * 0.95));
    const cy = r.y + r.h * 1.02;
    const half = 0.78;
    const k = clamp(shown / full, -1, 1);
    const tolK = clamp(tolV / full, 0, 1);
    arcDots(kit, cx, cy, R, -Math.PI / 2 - half, -Math.PI / 2 + half, c.steel0, { pitch: 1.2 });
    arcDots(kit, cx, cy, R, -Math.PI / 2 - half, -Math.PI / 2 - tolK * half, mix(c.red, c.navy0, 0.45), { pitch: 1.2 });
    if (Math.abs(k) > 0.01) arcDots(kit, cx, cy, R, -Math.PI / 2, -Math.PI / 2 + k * half, vcol, { pitch: 0.9, size: cc * 2 });
    const tipA = -Math.PI / 2 + k * half;
    kit.rect(Math.round((cx + Math.cos(tipA) * (R - cc * 4)) / cc) * cc, Math.round((cy + Math.sin(tipA) * (R - cc * 4)) / cc) * cc, cc * 2, cc * 2, c.white);
    kit.icon(iconName, r.x + cc * 7, r.y + r.h * 0.34, Math.round(r.h * 0.36), vcol);
    kit.drawText(numStr, cx, r.y + r.h * 0.7, { size: fitSize(r.h * 0.4), color: c.white, align: 'center', maxWidth: r.w * 0.5 });
    return;
  }
  if (kind === 'projection') {
    // E4: шкала с нулём по центру, подсвечено окно допуска посадки, плавающая метка-«каретка» и число над шкалой
    const sx = r.x + cc * 4;
    const sw = r.w - cc * 8;
    const my = r.y + r.h * 0.68;
    const mid = sx + sw / 2;
    const k = clamp(shown / full, -1, 1);
    withAlpha(kit, 0.85, () => {
      for (let i = -10; i <= 10; i++) {
        const x = Math.round((mid + (i / 10) * (sw / 2)) / cc) * cc;
        kit.rect(x, my - (i % 5 === 0 ? cc * 3 : cc * 2), cc, i % 5 === 0 ? cc * 5 : cc * 3, c.cyan);
      }
      kit.rect(sx, my, sw, cc, mix(c.cyan, c.navy0, 0.4));
      // окно допуска: на спуске безопасно медленнее допуска
      const wx = Math.round((mid - (clamp(tolV / full, 0, 1) * sw) / 2) / cc) * cc;
      kit.rect(wx, my - cc * 4, mid - wx, cc, c.green);
      kit.rect(sx, my - cc * 4, wx - sx, cc, mix(c.red, c.navy0, 0.2));
    });
    const mx = Math.round((mid + (k * sw) / 2) / cc) * cc;
    for (let i = 0; i < 3; i++) kit.rect(mx - (2 - i) * cc, my + cc * 2 + i * cc, (2 - i) * cc * 2 + cc, cc, accent);
    kit.icon(iconName, r.x + cc * 7, r.y + r.h * 0.3, Math.round(r.h * 0.32), accent);
    kit.drawText(numStr, r.x + r.w - cc * 4, r.y + r.h * 0.3, { size: fitSize(r.h * 0.38), color: accent, align: 'right', shadow: true, maxWidth: r.w - cc * 18 });
    return;
  }
  // E5: плавающая дуга из точек, цвет по состоянию, лёгкое мерцание
  {
    const cx = r.x + r.w / 2;
    const R = Math.max(cc * 8, Math.min(r.w * 0.42, r.h * 0.95));
    const cy = r.y + r.h * 1.0;
    const half = 0.78;
    const k = clamp(shown / full, -1, 1);
    const fl = flicker(kit, 5, 0.12);
    withAlpha(kit, 0.55 * fl, () => arcDots(kit, cx, cy, R, -Math.PI / 2 - half, -Math.PI / 2 + half, mix(accent, c.navy0, 0.5), { pitch: 2.2 }));
    withAlpha(kit, fl, () => {
      if (Math.abs(k) > 0.01) arcDots(kit, cx, cy, R, -Math.PI / 2, -Math.PI / 2 + k * half, accent, { pitch: 1.4, size: cc * 2 });
      const tipA = -Math.PI / 2 + k * half;
      kit.rect(Math.round((cx + Math.cos(tipA) * (R + cc * 3)) / cc) * cc, Math.round((cy + Math.sin(tipA) * (R + cc * 3)) / cc) * cc, cc * 3, cc * 3, mix(accent, '#ffffff', 0.5));
    });
    kit.icon(iconName, r.x + cc * 7, r.y + r.h * 0.34, Math.round(r.h * 0.34), accent);
    kit.drawText(numStr, cx, r.y + r.h * 0.7, { size: fitSize(r.h * 0.38), color: accent, align: 'center', shadow: true, maxWidth: r.w * 0.5 });
  }
}

/** Лента от нуля: вправо — набор высоты, влево — спуск; белая риска — допуск посадки (E1, E2). */
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
  for (let i = 0; i < n; i++) {
    const off = i - mid;
    const on = off === 0 || (Math.sign(off) === dir && Math.abs(off) <= lit);
    const isTol = Math.abs(off) === tolCells && off < 0;
    const zone = kind === 'digital' ? (off < -tolCells ? c.red : off < 0 ? c.amber : c.green) : color;
    kit.rect(x0 + i * (w + gap), r.y, w, r.h, on ? zone : isTol ? c.steel1 : c.navy2);
    if (isTol) kit.rect(x0 + i * (w + gap), r.y - cc, w, cc, c.white);
  }
}

// ---------- шкалы топлива и прочности ----------

/**
 * Шкала запаса: r — полоска (горизонтальная или вертикальная), v 0..1, color, lowAt — порог тревоги.
 * E0 лампы накаливания, E1 светодиодные сегменты, E2 цветные деления, E3 тонкая линия с засечками,
 * E4 проекционный контур со светящейся линией и меткой порога, E5 плавающие точки с цветом по состоянию.
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
      const tt = (i + 0.5) / n;
      const cx = vertical ? r.x + r.w / 2 : r.x + len * tt;
      const cy = vertical ? r.y + r.h - len * tt : r.y + r.h / 2;
      kit.lamp(cx, cy, size, low ? c.red : color, i < lit, low && i === lit - 1);
    }
    return;
  }
  if (kind === 'led') {
    kit.ledBar(r, { value: v, color, warn: lowAt, vertical, segments: vertical ? 8 : 10 });
    return;
  }
  if (kind === 'digital') {
    // мелкие цветные деления: красные, жёлтые, зелёные
    kit.nine('screen', r.x, r.y, r.w, r.h);
    const inner = { x: r.x + cc * 2, y: r.y + cc * 2, w: r.w - cc * 4, h: r.h - cc * 4 };
    const len = vertical ? inner.h : inner.w;
    const n = clamp(Math.floor(len / (cc * 2)), 10, 40);
    const lit = Math.round(v * n);
    const seg = Math.max(cc, Math.floor((len - (n - 1)) / n));
    for (let i = 0; i < n; i++) {
      const tt = i / n;
      const col = tt < 0.2 ? c.red : tt < 0.5 ? c.amber : color;
      const on = i < lit;
      const pos = Math.round(i * (seg + 1));
      if (vertical) kit.rect(inner.x, inner.y + inner.h - pos - seg, inner.w, seg, on ? col : c.navy2);
      else kit.rect(inner.x + pos, inner.y, seg, inner.h, on ? col : c.navy2);
    }
    return;
  }
  const level = v <= lowAt ? 2 : v <= lowAt * 1.8 ? 1 : 0;
  const shown = soft(kit, `g${vertical ? 'v' : 'h'}${Math.round(r.x)}${Math.round(r.y)}`, v, 6);
  const len = vertical ? r.h : r.w;
  const fill = Math.round(clamp(shown, 0, 1) * (len - cc * 4));
  const accent = kind === 'flat' ? (level >= 2 ? c.red : level === 1 ? c.amber : color) : stateColor(kit, level, color === c.cyan ? c.cyan : c.green);
  if (kind === 'flat') {
    // E3: чистый тёмный фон, тонкая рамка, линия-трек с засечками и заливкой
    panelFor(kit, r, 'flat');
    const x0 = vertical ? r.x + r.w / 2 - cc : r.x + cc * 2;
    const y0 = vertical ? r.y + cc * 2 : r.y + r.h / 2 - cc;
    if (vertical) {
      kit.rect(x0, y0, cc * 2, len - cc * 4, c.steel0);
      kit.rect(x0, y0 + len - cc * 4 - fill, cc * 2, fill, accent);
    } else {
      kit.rect(x0, y0, len - cc * 4, cc * 2, c.steel0);
      kit.rect(x0, y0, fill, cc * 2, accent);
    }
    for (let i = 0; i <= 4; i++) {
      const p = Math.round(((len - cc * 4) * i) / 4);
      if (vertical) kit.rect(r.x + cc * 2, y0 + p, r.w - cc * 4, cc, c.steel1);
      else kit.rect(x0 + p, r.y + cc * 2, cc, r.h - cc * 4, c.steel1);
    }
    return;
  }
  if (kind === 'projection') {
    // E4: контур из тонких линий, светящаяся линия заполнения, красная метка порога тревоги и «носик» уровня
    panelFor(kit, r, 'projection', { accent: accent });
    const x0 = vertical ? r.x + r.w / 2 - cc : r.x + cc * 3;
    const y0 = vertical ? r.y + cc * 3 : r.y + r.h / 2 - cc;
    const span = len - cc * 6;
    const f2 = Math.round(clamp(shown, 0, 1) * span);
    withAlpha(kit, 0.95, () => {
      if (vertical) {
        kit.rect(x0, y0 + span - f2, cc * 2, f2, accent);
        kit.rect(r.x + cc * 2, y0 + span - f2, r.w - cc * 4, cc, mix(accent, '#ffffff', 0.4));
        kit.rect(r.x + cc * 2, y0 + Math.round(span * (1 - lowAt)), r.w - cc * 4, cc, c.red);
      } else {
        kit.rect(x0, y0, f2, cc * 2, accent);
        kit.rect(x0 + f2, r.y + cc * 2, cc, r.h - cc * 4, mix(accent, '#ffffff', 0.4));
        kit.rect(x0 + Math.round(span * lowAt), r.y + cc * 2, cc, r.h - cc * 4, c.red);
      }
    });
    return;
  }
  // E5: плавающие полупрозрачные точки; цвет по состоянию, по горящим точкам бежит волна яркости
  {
    withAlpha(kit, 0.45 * flicker(kit, r.x, 0.1), () => kit.rect(r.x, r.y, r.w, r.h, c.navy0));
    const n = clamp(Math.floor(len / (cc * 4)), 6, 14);
    const lit = shown * n;
    const size = cc * 2;
    const pitch = len / n;
    for (let i = 0; i < n; i++) {
      const on = i + 0.5 <= lit + 0.5;
      const wave = kit.S.settings.reduceMotion ? 0 : 0.5 + 0.5 * Math.sin(kit.time * 4 - i * 0.7);
      const px = vertical ? r.x + r.w / 2 - size / 2 : r.x + pitch * (i + 0.5) - size / 2;
      const py = vertical ? r.y + r.h - pitch * (i + 0.5) - size / 2 : r.y + r.h / 2 - size / 2;
      withAlpha(kit, on ? 0.75 + 0.25 * wave : 0.25, () => kit.rect(Math.round(px / cc) * cc, Math.round(py / cc) * cc, size, size, on ? mix(accent, '#ffffff', 0.25 * wave) : c.steel1));
    }
  }
}

// ---------- рычаг тяги ----------

/**
 * Рычаг тяги по эпохе. V — область, lv = { value, touched }, thr — фактическая тяга 0..1, boost — идёт ли форсаж,
 * mode — arcade/pilot. Возвращает { thumb } — прямоугольник рукоятки (для подписи).
 */
export function lever(kit, V, o) {
  const c = kit.c;
  const cc = kit.cell();
  const kind = kindOf(kit);
  const { lv, thr, boost, mode, u } = o;
  const thumbH = Math.round(30 * u);
  const ty = Math.round(V.y + 8 * u + (1 - lv.value) * (V.h - 16 * u - thumbH));
  const thumb = { x: V.x + cc * 2, y: ty, w: V.w - cc * 4, h: thumbH };
  const track = { x: V.x + V.w * 0.4, y: V.y + 12 * u, w: V.w * 0.2, h: V.h - 24 * u };
  const latch = mode === 'pilot';
  if (kind === 'analog' || kind === 'led') {
    kit.nine('inset', V.x, V.y, V.w, V.h);
    kit.ledBar(track, { value: thr, color: boost ? c.red : c.amber, vertical: true, segments: 12 });
    for (let i = 0; i <= 4; i++) kit.rect(V.x + cc * 3, Math.round(track.y + (track.h * i) / 4 - cc / 2), Math.round(V.w * 0.22), cc, c.steel2);
    kit.nine(lv.touched ? 'primaryPress' : 'primary', thumb.x, thumb.y, thumb.w, thumb.h);
    for (let i = 0; i < 2; i++) kit.rect(V.x + cc * 6, ty + thumbH * 0.16 + i * cc * 2, V.w - cc * 12, cc, c.amberDeep);
    kit.lamp(V.x + V.w - cc * 5, V.y + cc * 5, cc * 4, latch ? c.green : c.navy2, latch);
    return { thumb, label: c.ink };
  }
  if (kind === 'digital') {
    // E2: цифровая шкала: частые деления с цветом, рукоятка-«бегунок» и процент на экране
    kit.nine('screen', V.x, V.y, V.w, V.h);
    const n = 20;
    for (let i = 0; i <= n; i++) {
      const y = Math.round(track.y + track.h - (track.h * i) / n);
      const on = i / n <= thr + 1e-6;
      const col = i / n > 0.8 ? c.red : i / n > 0.5 ? c.amber : c.green;
      kit.rect(V.x + cc * 4, y, Math.round(V.w * (i % 5 === 0 ? 0.5 : 0.3)), cc, on ? col : c.navy2);
    }
    kit.nine(lv.touched ? 'btnPress' : 'btn', thumb.x, thumb.y, thumb.w, thumb.h);
    kit.rect(V.x + cc * 6, ty + thumbH * 0.5, V.w - cc * 12, cc, c.amberLight);
    kit.lamp(V.x + V.w - cc * 5, V.y + cc * 5, cc * 4, latch ? c.green : c.navy2, latch);
    return { thumb, label: c.white };
  }
  const level = boost ? 2 : lv.touched ? 0 : 0;
  const accent = kind === 'flat' ? (boost ? c.red : c.amber) : stateColor(kit, level, c.cyan);
  if (kind === 'flat') {
    // E3: тонкий ползунок: чистая подложка, линия-трек, алюминиевая рукоятка
    panelFor(kit, V, 'flat');
    const lx = Math.round(V.x + V.w / 2 - cc);
    kit.rect(lx, track.y, cc * 2, track.h, c.steel0);
    const f2 = Math.round(track.h * clamp(soft(kit, 'thr', thr, 10), 0, 1));
    kit.rect(lx, track.y + track.h - f2, cc * 2, f2, accent);
    for (let i = 0; i <= 4; i++) kit.rect(V.x + cc * 3, Math.round(track.y + (track.h * i) / 4), Math.round(V.w * 0.2), cc, c.steel1);
    kit.nine(lv.touched ? 'btnPress' : 'btn', thumb.x, thumb.y, thumb.w, thumb.h);
    kit.lamp(V.x + V.w - cc * 5, V.y + cc * 5, cc * 4, latch ? c.green : c.navy2, latch);
    return { thumb, label: c.white };
  }
  if (kind === 'projection') {
    // E4: проекция: светящиеся деления и «каретка» уровня, рукоятка — контур с тёмной серединой
    panelFor(kit, V, 'projection', { accent });
    for (let i = 0; i <= 8; i++) {
      const y = Math.round(track.y + (track.h * i) / 8);
      withAlpha(kit, i % 2 ? 0.55 : 0.9, () => kit.rect(V.x + cc * 4, y, Math.round(V.w * (i % 2 ? 0.16 : 0.26)), cc, c.cyan));
    }
    const f2 = Math.round(track.h * clamp(soft(kit, 'thr', thr, 10), 0, 1));
    kit.rect(Math.round(V.x + V.w * 0.7), track.y + track.h - f2, cc * 2, f2, accent);
    withAlpha(kit, 0.9, () => kit.rect(thumb.x, thumb.y, thumb.w, thumb.h, c.ink));
    for (const [x, y, w, h] of [[thumb.x, thumb.y, thumb.w, cc], [thumb.x, thumb.y + thumb.h - cc, thumb.w, cc], [thumb.x, thumb.y, cc, thumb.h], [thumb.x + thumb.w - cc, thumb.y, cc, thumb.h]]) kit.rect(x, y, w, h, lv.touched ? c.white : accent);
    kit.lamp(V.x + V.w - cc * 5, V.y + cc * 5, cc * 4, latch ? c.green : c.navy2, latch);
    return { thumb, label: accent };
  }
  // E5: плавающая лестница: полупрозрачные деления-точки, цвет по состоянию, рукоятка — призрачная плашка
  const fl = flicker(kit, 9, 0.1);
  panelFor(kit, V, 'holo', { accent });
  const f2 = Math.round(track.h * clamp(soft(kit, 'thr', thr, 10), 0, 1));
  for (let i = 0; i <= 12; i++) {
    const y = Math.round(track.y + (track.h * i) / 12);
    const on = (12 - i) / 12 <= thr + 1e-6;
    withAlpha(kit, (on ? 0.9 : 0.35) * fl, () => kit.rect(Math.round(V.x + V.w / 2 - cc * (i % 3 === 0 ? 3 : 2)), y, cc * (i % 3 === 0 ? 6 : 4), cc, on ? accent : c.steel1));
  }
  void f2;
  withAlpha(kit, 0.8 * fl, () => kit.rect(thumb.x, thumb.y, thumb.w, thumb.h, c.navy0));
  withAlpha(kit, fl, () => {
    kit.rect(thumb.x, thumb.y, thumb.w, cc, accent);
    kit.rect(thumb.x, thumb.y + thumb.h - cc, thumb.w, cc, accent);
    kit.rect(thumb.x, thumb.y, cc, thumb.h, mix(accent, c.navy0, 0.4));
    kit.rect(thumb.x + thumb.w - cc, thumb.y, cc, thumb.h, mix(accent, c.navy0, 0.4));
  });
  kit.lamp(V.x + V.w - cc * 5, V.y + cc * 5, cc * 4, latch ? c.green : c.navy2, latch);
  return { thumb, label: accent };
}

// ---------- диск наклона ----------

/**
 * Основание диска наклона по эпохе (дуга ограничителя рисуется поверх вызывающим кодом). finger — палец на диске,
 * knobX — положение рукоятки, kr — её радиус. Возвращает цвет подписей.
 */
export function wheel(kit, D, o) {
  const c = kit.c;
  const cc = kit.cell();
  const kind = kindOf(kit);
  const { finger, knobX, kr, hot } = o;
  const accent = hot ? c.red : c.cyan;
  if (kind === 'analog' || kind === 'led' || kind === 'digital') {
    kit.ring(D.cx, D.cy, D.r, D.r, c.ink);
    kit.ring(D.cx, D.cy, D.r - cc * 2, D.r - cc * 2, finger ? c.steel0 : c.steel1);
    kit.ring(D.cx, D.cy, D.r - cc * 5, D.r - cc * 5, c.navy1);
    return { knob: () => {
      kit.ring(knobX, D.cy, kr, kr, c.ink);
      kit.ring(knobX, D.cy, kr - cc, kr - cc, finger ? c.amber : c.steel1);
      kit.ring(knobX - cc, D.cy - cc, kr - cc * 3, kr - cc * 3, finger ? c.amberLight : c.steel2);
      kit.rect(Math.round(knobX - cc), Math.round(D.cy - kr * 0.5), cc * 2, Math.round(kr), c.ink);
    } };
  }
  if (kind === 'flat') {
    // E3: тонкое алюминиевое кольцо, чистый тёмный диск, плоская рукоятка с точкой
    kit.ring(D.cx, D.cy, D.r, cc, c.steel2);
    kit.ring(D.cx, D.cy, D.r - cc, D.r - cc, c.navy0);
    return { knob: () => {
      kit.ring(knobX, D.cy, kr, kr, finger ? c.steel3 : c.steel2);
      kit.ring(knobX, D.cy, kr - cc * 2, kr - cc * 2, finger ? c.steel2 : c.steel1);
      kit.rect(Math.round(knobX - cc), Math.round(D.cy - cc), cc * 2, cc * 2, c.ink);
    } };
  }
  if (kind === 'projection') {
    // E4: полупрозрачный диск с тонким светящимся кольцом; рукоятка — контурное кольцо с перекрестием
    withAlpha(kit, 0.6, () => kit.ring(D.cx, D.cy, D.r - cc, D.r - cc, c.ink));
    kit.ring(D.cx, D.cy, D.r, cc, accent);
    return { knob: () => {
      withAlpha(kit, 0.8, () => kit.ring(knobX, D.cy, kr - cc, kr - cc, c.ink));
      kit.ring(knobX, D.cy, kr, cc, finger ? c.white : accent);
      kit.rect(Math.round(knobX - cc * 3), Math.round(D.cy), cc * 6, cc, finger ? c.white : accent);
      kit.rect(Math.round(knobX), Math.round(D.cy - cc * 3), cc, cc * 6, finger ? c.white : accent);
    } };
  }
  // E5: диск из плавающих точек; цвет по состоянию; рукоятка — светящийся полупрозрачный шар
  const fl = flicker(kit, 11, 0.1);
  withAlpha(kit, 0.5 * fl, () => kit.ring(D.cx, D.cy, D.r - cc, D.r - cc, c.navy0));
  const n = Math.max(24, Math.round((D.r * 2 * Math.PI) / (cc * 3)));
  withAlpha(kit, 0.85 * fl, () => {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      kit.rect(Math.round((D.cx + Math.cos(a) * D.r) / cc) * cc, Math.round((D.cy + Math.sin(a) * D.r) / cc) * cc, cc * (i % 6 === 0 ? 2 : 1), cc * (i % 6 === 0 ? 2 : 1), accent);
    }
  });
  return { knob: () => {
    withAlpha(kit, 0.55 * fl, () => kit.ring(knobX, D.cy, kr, kr, mix(accent, c.navy0, 0.5)));
    withAlpha(kit, fl, () => {
      kit.ring(knobX, D.cy, kr, cc, finger ? c.white : accent);
      kit.ring(knobX, D.cy, Math.round(kr * 0.35), Math.round(kr * 0.35), finger ? c.white : mix(accent, '#ffffff', 0.35));
    });
  } };
}

// ---------- цифровые табло для итогов и счётчиков ----------

/**
 * Рамка табло с числом (итоги полёта): барабанные ячейки (E0), светодиодные сегменты (E1), точечная матрица (E2),
 * чистые цифры на плоской или проекционной подложке (E3–E5). o: lit (цвет), digits (число знакомест), h (высота цифр).
 */
export function readout(kit, r, str, o = {}) {
  const c = kit.c;
  const cc = kit.cell();
  const kind = kindOf(kit);
  const s = String(str);
  const lit = o.lit || c.green;
  if (kind === 'led') {
    kit.segDisplay(r, s, { lit: c.amber, digits: o.digits, h: o.h });
    return;
  }
  if (kind === 'digital') {
    kit.nine('screen', r.x, r.y, r.w, r.h);
    kit.rect(r.x + cc * 2, r.y + cc * 2, r.w - cc * 4, r.h - cc * 4, c.navy1);
    const pitch = r.h >= 48 ? 3 : 2;
    dotMatrix(kit, s, r.x + r.w - cc * 3, r.y + r.h / 2, pitch, c.greenLight, mix(c.navy1, c.steel0, 0.45));
    return;
  }
  if (isGlassEra(kind) || kind === 'flat') {
    const tok = kit.S.skin.hud;
    panelFor(kit, r, kind, { accent: kind === 'holo' ? lit : c.cyan });
    const size = fitSize(Math.min(r.h - cc * 6, (o.h || r.h * 0.5) * 1.3));
    const col = kind === 'flat' ? c[tok.digit] : lit === c.green ? c[tok.digit] : lit;
    kit.drawText(s, r.x + r.w - cc * 4, r.y + r.h / 2, { size, color: col, align: 'right', shadow: isGlassEra(kind), maxWidth: r.w - cc * 8 });
    return;
  }
  // E0: барабанные ячейки: тёмный барабан со светлой цифрой
  kit.nine('screen', r.x, r.y, r.w, r.h);
  const cells = Math.max(o.digits || s.length, s.length);
  const size = kit.text.fit('8', Math.floor((r.w - cc * 6) / cells) - cc, Math.round((o.h || r.h * 0.5) * 1.1)).size;
  const step = kit.text.stepFor(size).css * 6;
  const total = cells * (step + cc);
  let x = r.x + r.w - cc * 3 - total;
  const pad = cells - s.length;
  for (let i = 0; i < cells; i++) {
    const ch = i < pad ? '' : s[i - pad];
    kit.rect(x, r.y + cc * 3, step + cc, r.h - cc * 6, c.ink);
    kit.rect(x + cc, r.y + cc * 3, cc, r.h - cc * 6, c.navy1);
    if (ch) kit.drawText(ch, x + (step + cc) / 2, r.y + r.h / 2, { size, color: c.white, align: 'center' });
    x += step + cc;
  }
}

/** Крупное число без рамки (счётчики монет и данных): семисегментное в E1, пиксельный шрифт в остальных эпохах. */
export function bigDigits(kit, str, x, y, h, color, align = 'left') {
  const kind = kindOf(kit);
  if (kind === 'led') return kit.bigNumber(str, x, y, h, color, align);
  const c = kit.c;
  const size = fitSize(h);
  const w = kit.text.measure(String(str), size);
  const col = kind === 'analog' ? c.amberLight : color;
  kit.drawText(String(str), align === 'right' ? x : align === 'center' ? x + w / 2 : x + w, y + h / 2, { size, color: col, align: 'right', shadow: true });
  return w;
}
