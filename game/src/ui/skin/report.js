// Носитель отчёта о полёте (экран итогов) по эпохам: у каждой эпохи свой материал, а не один бежевый лист.
//   E0 — зелёная перфобумага матричного принтера: полосы, тракторная перфорация по краям;
//   E1 — термобумага рулона: кремовая лента с рваными краями;
//   E2 — серая пластиковая панель с цветным ЭЛТ-экраном (строки развёртки);
//   E3 — плоская карточка-дисплей в алюминиевой рамке;
//   E4 — проекция: тёмная плёнка с голубыми скобками по углам;
//   E5 — голографический отчёт: стекло, светящиеся грани и бегущая линия.
// Цвета текста на носителе — skin.report (era-skins.js); всё рисуется примитивами кита (прямоугольниками): ни градиентов,
// ни скруглений, ни текста вне пиксельного шрифта.

import { mix } from '../theme.js';

const TEETH = [2, 1, 2, 2, 1, 1, 2, 1];

/** Токены носителя текущей эпохи. */
export const reportOf = (kit) => kit.S.skin.report;

/** Добавочные поля листа (по горизонтали и вертикали): место под перфорацию, рваный край, рамку экрана. */
export function sheetInset(kit) {
  const cc = kit.cell();
  switch (reportOf(kit).kind) {
    case 'perf':
      return { x: cc * 9, y: cc * 2 };
    case 'thermal':
      return { x: cc * 2, y: cc * 4 };
    case 'plastic':
      return { x: cc * 8, y: cc * 8 };
    default:
      return { x: cc * 3, y: cc * 3 };
  }
}

function brackets(kit, r, color, arm) {
  const cc = kit.cell();
  for (const [x, y, sx, sy] of [[r.x, r.y, 1, 1], [r.x + r.w, r.y, -1, 1], [r.x, r.y + r.h, 1, -1], [r.x + r.w, r.y + r.h, -1, -1]]) {
    kit.rect(sx > 0 ? x : x - arm, sy > 0 ? y : y - cc, arm, cc, color);
    kit.rect(sx > 0 ? x : x - cc, sy > 0 ? y : y - arm, cc, arm, color);
  }
}

function withAlpha(kit, a, fn) {
  const ctx = kit.S.ctx;
  const prev = ctx.globalAlpha;
  ctx.globalAlpha = prev * a;
  fn();
  ctx.globalAlpha = prev;
}

/** Лист-подложка отчёта в прямоугольнике card. */
export function drawSheet(kit, card) {
  const cc = kit.cell();
  const c = kit.c;
  const M = reportOf(kit);
  const { x, y, w, h } = card;
  switch (M.kind) {
    case 'perf': {
      withAlpha(kit, 0.5, () => kit.rect(x + cc * 3, y + cc * 3, w, h, c.ink));
      const band = cc * 10;
      for (let yy = 0, i = 0; yy < h; yy += band, i++) kit.rect(x, y + yy, w, Math.min(band, h - yy), i % 2 ? M.bg2 : M.bg);
      // тракторная перфорация: полоса по краям, пунктир отрыва и отверстия
      const strip = cc * 7;
      const shade = mix(M.bg2, '#000000', 0.12);
      const hole = mix(M.bg2, '#000000', 0.62);
      for (const sx of [x, x + w - strip]) {
        kit.rect(sx, y, strip, h, shade);
        const cx = sx + strip / 2 - cc * 1.5;
        for (let yy = cc * 4; yy + cc * 3 <= h; yy += cc * 10) {
          kit.rect(Math.round(cx), Math.round(y + yy), cc * 3, cc * 3, hole);
          kit.rect(Math.round(cx + cc), Math.round(y + yy + cc), cc, cc, mix(hole, '#ffffff', 0.25));
        }
      }
      for (const lx of [x + strip - cc, x + w - strip]) for (let yy = 0; yy < h; yy += cc * 4) kit.rect(lx, y + yy, cc, Math.min(cc * 2, h - yy), mix(M.bg2, '#000000', 0.35));
      return;
    }
    case 'thermal': {
      withAlpha(kit, 0.45, () => kit.rect(x + cc * 3, y + cc * 3, w, h, c.ink));
      kit.rect(x, y, w, h, M.bg);
      // рваные края ленты: зубцы разной высоты сверху и снизу
      for (let xx = 0, i = 0; xx < w; xx += cc * 2, i++) {
        const t = TEETH[i % TEETH.length] * cc;
        kit.rect(x + xx, y - t, Math.min(cc * 2, w - xx), t, M.bg);
        kit.rect(x + xx, y + h, Math.min(cc * 2, w - xx), TEETH[(i + 3) % TEETH.length] * cc, M.bg);
      }
      // выцветание термопечати: бледная полоса вдоль левой кромки
      kit.rect(x, y, cc, h, mix(M.bg, '#000000', 0.07));
      return;
    }
    case 'plastic': {
      kit.nine('raised', x, y, w, h);
      const m = cc * 6;
      const s = { x: x + m, y: y + m, w: w - m * 2, h: h - m * 2 };
      kit.rect(s.x - cc, s.y - cc, s.w + cc * 2, s.h + cc * 2, c.ink);
      kit.rect(s.x, s.y, s.w, s.h, M.bg);
      withAlpha(kit, 0.2, () => {
        for (let yy = cc; yy < s.h; yy += cc * 2) kit.rect(s.x, s.y + yy, s.w, cc, '#000000');
      });
      // блик стекла в левом верхнем углу
      withAlpha(kit, 0.18, () => {
        kit.rect(s.x + cc * 2, s.y + cc * 2, cc * 10, cc, '#ffffff');
        kit.rect(s.x + cc * 2, s.y + cc * 2, cc, cc * 8, '#ffffff');
      });
      return;
    }
    case 'flat': {
      kit.rect(x, y, w, h, c.ink);
      kit.rect(x + cc, y + cc, w - cc * 2, h - cc * 2, c.mat1);
      kit.rect(x + cc * 2, y + cc * 2, w - cc * 4, h - cc * 4, M.bg);
      kit.rect(x + cc * 2, y + cc * 2, w - cc * 4, cc, c.mat2);
      return;
    }
    default: {
      // проекция и голограмма: ровная подложка, поверх неё светящиеся скобки
      withAlpha(kit, M.alpha, () => kit.rect(x, y, w, h, M.bg));
      brackets(kit, card, M.cyan, cc * 6);
      withAlpha(kit, 0.3, () => {
        kit.rect(x + cc * 2, y + cc * 2, w - cc * 4, cc, M.cyan);
        kit.rect(x + cc * 2, y + h - cc * 3, w - cc * 4, cc, M.cyan);
      });
      if (M.kind === 'holo') {
        withAlpha(kit, 0.35, () => {
          kit.rect(x, y + cc * 6, cc, h - cc * 12, M.cyan);
          kit.rect(x + w - cc, y + cc * 6, cc, h - cc * 12, M.cyan);
        });
        if (!kit.S.settings.reduceMotion) {
          const yy = y + Math.floor(((kit.S.time * 0.3) % 1) * (h / cc)) * cc;
          withAlpha(kit, 0.16, () => kit.rect(x + cc * 2, yy, w - cc * 4, cc * 2, M.cyan));
        }
      }
    }
  }
}

/** Разделитель между шапкой и телом отчёта. */
export function drawRule(kit, x, y, w) {
  const cc = kit.cell();
  const M = reportOf(kit);
  if (M.kind === 'perf') return;
  if (M.kind === 'holo' || M.kind === 'projection') {
    withAlpha(kit, 0.55, () => kit.rect(x, y, w, cc, M.cyan));
    return;
  }
  withAlpha(kit, 0.7, () => {
    for (let xx = 0; xx < w; xx += cc * 4) kit.rect(x + xx, y, Math.min(cc * 2, w - xx), cc, M.dim);
  });
}
