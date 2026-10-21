// Палитра интерфейса — не больше 32 цветов, пиксельные рамки из трёх тонов со светом сверху-слева.
// Эпоха базы подменяет часть цветов и рамок (skin/era-skins.js), число цветов палитры остаётся прежним: 32.
// Цвета ресурсов: монеты — золото, данные — циан, мощность — зелёный, предупреждение — красный, акцент — янтарь.

import { skinFor } from './skin/era-skins.js';

export const PALETTE = Object.freeze({
  ink: '#05070e',
  navy0: '#0b0f1a',
  navy1: '#141b2e',
  navy2: '#222b3f',
  steel0: '#3a465f',
  steel1: '#56658a',
  steel2: '#8a9bb8',
  steel3: '#c4d0e4',
  white: '#f6f1e4',
  amber0: '#874c08',
  amber1: '#e6a020',
  amber2: '#ffd978',
  gold: '#ffd23f',
  red0: '#7a1c1c',
  red1: '#f86a5a',
  red2: '#ff9a8a',
  red3: '#c03a2b',
  green0: '#1c6038',
  green1: '#3aa860',
  green2: '#9af0b4',
  cyan0: '#185a70',
  cyan1: '#52d8ff',
  cyan2: '#b8f0ff',
  paper0: '#b09a68',
  paper1: '#e8d6a8',
  paper2: '#fff4d8',
  cork0: '#6e4a26',
  cork1: '#a8743a',
  cork2: '#d09a5a',
  // три тона материала корпуса (бакелит, слоновая кость, алюминий, карбон…): задаются эпохой
  mat0: '#6d7884',
  mat1: '#a3adb8',
  mat2: '#d0d7de',
});

// режим для дальтоников: зелёно-красная пара и янтарь заменяются (ещё три цвета, всего 31)
const CB = { blue: '#6cc3f2', orange: '#ff7a30', yellow: '#f0e442' };

const P = PALETTE;

/** Пиксельные рамки: hi — свет (сверху-слева), mid — основной тон, lo — тень (снизу-справа), edge — контур 1 пиксель. */
const FRAMES = {
  panel: { hi: 'steel1', mid: 'navy2', lo: 'ink', edge: 'ink', rivets: true },
  raised: { hi: 'steel2', mid: 'steel1', lo: 'steel0', edge: 'ink', rivets: true },
  inset: { hi: 'ink', mid: 'navy1', lo: 'steel0', edge: 'ink' },
  screen: { hi: 'ink', mid: 'navy0', lo: 'navy2', edge: 'ink' },
  btn: { hi: 'steel2', mid: 'steel1', lo: 'navy2', edge: 'ink', rivets: true },
  btnHover: { hi: 'steel3', mid: 'steel1', lo: 'navy2', edge: 'ink', rivets: true },
  btnPress: { hi: 'navy2', mid: 'steel0', lo: 'steel1', edge: 'ink' },
  primary: { hi: 'amber2', mid: 'amber1', lo: 'amber0', edge: 'ink', rivets: true },
  primaryHover: { hi: 'white', mid: 'amber1', lo: 'amber0', edge: 'ink', rivets: true },
  primaryPress: { hi: 'amber0', mid: 'amber1', lo: 'amber2', edge: 'ink' },
  danger: { hi: 'red2', mid: 'red3', lo: 'red0', edge: 'ink', rivets: true },
  dangerHover: { hi: 'white', mid: 'red1', lo: 'red0', edge: 'ink', rivets: true },
  dangerPress: { hi: 'red0', mid: 'red3', lo: 'red2', edge: 'ink' },
  good: { hi: 'green2', mid: 'green1', lo: 'green0', edge: 'ink', rivets: true },
  goodHover: { hi: 'white', mid: 'green1', lo: 'green0', edge: 'ink', rivets: true },
  goodPress: { hi: 'green0', mid: 'green1', lo: 'green2', edge: 'ink' },
  disabled: { hi: 'steel0', mid: 'navy2', lo: 'navy1', edge: 'ink' },
  card: { hi: 'steel1', mid: 'steel0', lo: 'navy2', edge: 'ink' },
  cardOn: { hi: 'amber2', mid: 'steel0', lo: 'amber0', edge: 'ink' },
  warn: { hi: 'red1', mid: 'red0', lo: 'ink', edge: 'ink' },
  paper: { hi: 'paper2', mid: 'paper1', lo: 'paper0', edge: 'cork0' },
  cork: { hi: 'cork2', mid: 'cork1', lo: 'cork0', edge: 'ink' },
  // «стекло» без полупрозрачности: тёмная шашечная сетка пикселей, сквозь которую виден фон
  // кнопки и подсказки полёта: сплошной тёмный фон — под подписями шахматки нет
  hud: { hi: 'steel1', mid: 'navy0', lo: 'ink', edge: 'ink' },
  glass: { hi: 'steel1', mid: 'navy0', lo: 'ink', edge: 'ink', dither: true },
  panelGlass: { hi: 'steel1', mid: 'navy1', lo: 'ink', edge: 'ink' },
};

const LABEL = {
  btn: 'white', btnHover: 'white', btnPress: 'steel3',
  primary: 'ink', primaryHover: 'ink', primaryPress: 'ink',
  danger: 'white', dangerHover: 'ink', dangerPress: 'white',
  good: 'ink', goodHover: 'ink', goodPress: 'ink',
  disabled: 'steel2',
};

const cache = new Map();

/** Тема по настройкам профиля и эпохе базы (0–5). Объекты кэшируются, повторный вызов бесплатен. */
export function getTheme(settings = {}, era = 0) {
  const cb = !!settings.colorblind;
  const skin = skinFor(era);
  const key = `${cb ? 'cb' : 'std'}:${skin.id}`;
  let theme = cache.get(key);
  if (theme) return theme;
  const pal = { ...P, ...skin.palette };
  if (cb) {
    pal.green1 = CB.blue;
    pal.green2 = '#b6defa';
    pal.green0 = '#1d5f8c';
    pal.red1 = CB.orange;
    pal.red2 = '#ffb48a';
    pal.red0 = '#8a3a10';
    pal.red3 = '#b04a10';
    pal.amber1 = CB.yellow;
    pal.amber2 = '#fff7a8';
    pal.amber0 = '#5c5200';
  }
  const c = {
    bg: pal.navy0,
    panel: pal.navy2,
    panelHi: pal.steel1,
    panelLo: pal.ink,
    card: pal.steel0,
    edge: pal.ink,
    inset: pal.navy1,
    screen: pal.navy0,
    line: pal.steel1,
    text: pal.white,
    textDim: pal.steel3,
    textMute: pal.steel2,
    textDark: pal.ink,
    amber: pal.amber1,
    amberLight: pal.amber2,
    amberDeep: pal.amber0,
    gold: pal.gold,
    cyan: pal.cyan1,
    cyanDark: pal.cyan0,
    green: pal.green1,
    greenLight: pal.green2,
    greenDark: pal.green0,
    red: pal.red1,
    redLight: pal.red2,
    redDark: pal.red0,
    white: pal.white,
    ink: pal.ink,
    steel0: pal.steel0,
    steel1: pal.steel1,
    steel2: pal.steel2,
    steel3: pal.steel3,
    navy0: pal.navy0,
    navy1: pal.navy1,
    navy2: pal.navy2,
    paper0: pal.paper0,
    paper1: pal.paper1,
    paper2: pal.paper2,
    cork0: pal.cork0,
    cork1: pal.cork1,
    cork2: pal.cork2,
    mat0: pal.mat0,
    mat1: pal.mat1,
    mat2: pal.mat2,
    shade: pal.ink,
    phosphor: skin.crt.tint,
  };
  const frames = {};
  for (const [name, base] of Object.entries(FRAMES)) {
    const f = { ...base, ...(skin.frames[name] || {}) };
    frames[name] = { hi: pal[f.hi], mid: pal[f.mid], lo: pal[f.lo], edge: pal[f.edge], rivets: f.rivets === undefined ? false : f.rivets === true ? 'screw' : f.rivets === 'none' ? false : f.rivets, tex: f.tex || null, dither: !!f.dither };
  }
  const labels = { ...LABEL, ...skin.labels };
  theme = {
    key,
    era: skin.id,
    skin,
    colorblind: cb,
    palette: pal,
    c,
    variants: frames,
    /** Цвет подписи на кнопке данного варианта. */
    labelColor: (variant) => pal[labels[variant] || 'white'],
    good: c.green,
    bad: c.red,
    coin: c.gold,
    data: c.cyan,
    power: c.green,
    accent: c.amber,
  };
  cache.set(key, theme);
  return theme;
}

// --- контраст WCAG ---

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const v = h.length === 3 ? [...h].map((x) => x + x).join('') : h.slice(0, 6);
  return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16));
}

export function luminance(hex) {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

/** Смешать два #rrggbb в долях k (0..1) от b. */
export function mix(a, b, k) {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  const m = ca.map((v, i) => Math.round(v + (cb[i] - v) * k));
  return `#${m.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

export function withAlpha(hex, a) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

/** Ближайший цвет палитры (для иконок: все тона сводятся к палитре интерфейса). */
export function nearestPalette(hex, pal = PALETTE) {
  const [r, g, b] = hexToRgb(hex);
  let best = null;
  let bestD = Infinity;
  for (const v of Object.values(pal)) {
    const [pr, pg, pb] = hexToRgb(v);
    const d = (pr - r) ** 2 + (pg - g) ** 2 + (pb - b) ** 2;
    if (d < bestD) {
      bestD = d;
      best = v;
    }
  }
  return best;
}

export const THEME_SOURCE = { PALETTE, CB, FRAMES };
export { skinFor };
export const FONT_FAMILY = 'monospace'; // запасной шрифт на случай сбоя пиксельного (не используется при нормальной работе)
