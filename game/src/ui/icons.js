// Единый реестр иконок интерфейса. Два источника в одном стиле «пиксель-HD»:
//  1. готовые спрайты рендера по эпохе профиля (монета, топливо, ремкомплект, купол, ступени, спутник, постройки);
//  2. векторные иконки на сетке 32×32: контур тёмным хроматическим цветом, 2–3 тона на материал, свет сверху-слева,
//     рисуются сразу в разрешении устройства и кэшируются (не растягиваются из мелких картинок).
// Вызов один: draw(ctx, имя, cx, cy, размер, цвет, alpha). Имя 'bld:<ключ>:<уровень>' — спрайт постройки по эпохе.

import { mix, nearestPalette, PALETTE } from './theme.js';
import { spriteName, buildingSpriteName } from '../render/manifest.js';

export const ICON_GRID = 32;

// ---------- мини-язык фигур ----------
const P = (tone, pts, flat) => ({ k: 'p', tone, pts, flat });
const R = (tone, x, y, w, h, flat) => ({ k: 'p', tone, pts: [x, y, x + w, y, x + w, y + h, x, y + h], flat });
const C = (tone, x, y, r, flat) => ({ k: 'c', tone, x, y, r, flat });
const L = (tone, w, pts) => ({ k: 'l', tone, w, pts });

function ngon(cx, cy, r1, r2, n) {
  const pts = [];
  for (let i = 0; i < n * 2; i++) {
    const a = (Math.PI * i) / n - Math.PI / 2;
    const r = i % 2 ? r2 : r1;
    pts.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  return pts;
}

// полумесяц: внешний круг без перекрытия со вторым (точки по дуге)
function crescent() {
  const outer = [];
  const inner = [];
  for (let a = 0; a < 360; a += 8) {
    const x = 16 + 13 * Math.cos((a * Math.PI) / 180);
    const y = 16 + 13 * Math.sin((a * Math.PI) / 180);
    if (Math.hypot(x - 22, y - 11) >= 11) outer.push([x, y]);
    const x2 = 22 + 11 * Math.cos((a * Math.PI) / 180);
    const y2 = 11 + 11 * Math.sin((a * Math.PI) / 180);
    if (Math.hypot(x2 - 16, y2 - 16) <= 13) inner.push([x2, y2]);
  }
  // внутренняя дуга идёт навстречу внешней
  const d = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);
  const last = outer[outer.length - 1];
  const ordered = d(last, inner[0]) < d(last, inner[inner.length - 1]) ? inner : [...inner].reverse();
  return [...outer, ...ordered].flat();
}

const STAR = [16, 3, 19.7, 12, 29, 12.6, 21.8, 18.7, 24.2, 28, 16, 22.8, 7.8, 28, 10.2, 18.7, 3, 12.6, 12.3, 12];

const ROCKET = [P('bd', [11, 17, 5, 26, 11, 24]), P('bd', [21, 17, 27, 26, 21, 24]), P('b', [16, 2, 21, 9, 21, 24, 11, 24, 11, 9]), P('red', [16, 2, 21, 9, 11, 9]), C('cyan', 16, 14, 3.2), P('amber', [12.5, 25, 16, 31, 19.5, 25])];
const BOLT = [P('b', [19, 2, 7, 18, 14, 18, 12, 30, 25, 13, 17.5, 13])];
const CHUTE = [P('b', [3, 15, 5, 9, 10, 4.5, 16, 3, 22, 4.5, 27, 9, 29, 15, 22, 13, 16, 15, 10, 13]), L('bd', 1.4, [3, 15, 16, 27]), L('bd', 1.4, [29, 15, 16, 27]), L('bd', 1.4, [16, 15, 16, 27]), R('bd', 13.5, 26, 5, 4)];
const FLAME = [P('b', [16, 2, 25, 15, 22, 27, 10, 27, 7, 15, 12, 18]), P('w', [16, 12, 20.5, 20, 18.5, 25.5, 13.5, 25.5, 11.5, 20], true)];

/** Описания иконок. Тона: b (цвет вызова), bl/bd (светлее/темнее), w, k, и фиксированные (gold, cyan, red, amber, green, glass). */
const ICONS = {
  coin: [C('b', 16, 16, 13), C('bd', 16, 16, 9.2), P('bl', [16, 9.5, 22.5, 16, 16, 22.5, 9.5, 16])],
  data: [P('b', [6, 11, 12, 4, 20, 4, 26, 11, 16, 28]), P('bl', [6, 11, 12, 4, 16, 11]), P('bl', [12, 4, 20, 4, 16, 11]), P('bd', [26, 11, 20, 4, 16, 11]), P('bd', [16, 11, 26, 11, 16, 28])],
  bolt: BOLT,
  boost: BOLT,
  fuel: [P('b', [16, 3, 25, 17, 7, 17]), C('b', 16, 19.5, 9.5), P('w', [11, 19, 12.8, 19, 13.8, 23.5, 11.5, 24], true)],
  shield: [P('b', [16, 3, 27, 7, 27, 16, 16, 29, 5, 16, 5, 7]), P('bd', [16, 7, 23, 10, 23, 16, 16, 24, 9, 16, 9, 10]), P('bl', [16, 7, 23, 10, 16, 16])],
  rocket: ROCKET,
  launch: ROCKET,
  base: [P('b', [16, 4, 29, 15, 25, 15, 25, 28, 7, 28, 7, 15, 3, 15]), R('bd', 13, 19, 6, 9), R('cyan', 20, 17, 3.5, 3.5)],
  journal: [R('b', 6, 4, 20, 24), R('bd', 6, 4, 4, 24), L('bd', 1.6, [13, 10, 22, 10]), L('bd', 1.6, [13, 14.5, 22, 14.5]), L('bd', 1.6, [13, 19, 19, 19])],
  more: [C('b', 6.5, 16, 3), C('b', 16, 16, 3), C('b', 25.5, 16, 3)],
  engine: [R('b', 11, 4, 10, 8), P('bd', [11, 12, 21, 12, 27, 26, 5, 26]), R('bl', 4, 26, 24, 3), P('amber', [13, 29.5, 16, 31.5, 19, 29.5])],
  tank: [P('b', [9, 8, 12, 5, 20, 5, 23, 8, 23, 25, 20, 28, 12, 28, 9, 25]), R('bd', 9, 13, 14, 2.4), R('bd', 9, 20, 14, 2.4), P('bl', [11, 8, 13, 6, 13, 26, 11, 24])],
  hull: [R('b', 4, 7, 24, 18), R('bd', 4, 15, 24, 2.2), C('bl', 8, 11, 1.3, true), C('bl', 24, 11, 1.3, true), C('bl', 8, 21, 1.3, true), C('bl', 24, 21, 1.3, true)],
  booster: [P('bd', [6, 12, 10, 12, 10, 26, 6, 26]), P('bd', [22, 12, 26, 12, 26, 26, 22, 26]), P('b', [11, 8, 21, 8, 21, 27, 11, 27]), P('red', [11, 8, 16, 2, 21, 8]), R('bd', 11, 16, 10, 2.4), P('amber', [13, 28, 16, 31.5, 19, 28])],
  capsule: [P('b', [16, 3, 24, 22, 8, 22]), C('cyan', 16, 14, 3.4), R('bd', 7, 22, 18, 4), L('bd', 2, [10, 26, 7, 30]), L('bd', 2, [22, 26, 25, 30])],
  legs: [R('b', 11, 5, 10, 9), L('b', 2.8, [12, 14, 5, 27]), L('b', 2.8, [20, 14, 27, 27]), R('bd', 2, 27, 8, 2.4), R('bd', 22, 27, 8, 2.4)],
  fins: [P('bd', [12, 17, 5, 28, 12, 26]), P('bd', [20, 17, 27, 28, 20, 26]), P('b', [16, 3, 20, 12, 20, 26, 12, 26, 12, 12])],
  parachute: CHUTE,
  chute: CHUTE,
  avionics: [P('b', [5, 9, 27, 9, 21, 18, 11, 18]), L('bd', 3, [16, 18, 16, 27]), R('bd', 10, 27, 12, 3), L('cyan', 1.8, [9, 5, 16, 3, 23, 5])],
  canister: [P('b', [8, 10, 10, 7, 22, 7, 24, 10, 24, 28, 8, 28]), R('bd', 11, 3, 6, 4), R('bl', 12, 15, 8, 7), R('bd', 8, 24, 16, 2.4)],
  repair: [L('b', 5, [8, 24, 19, 13]), C('b', 22, 10, 6.5), C('k', 24, 8, 2.8, true)],
  pause: [R('b', 7, 5, 6.5, 22), R('b', 18.5, 5, 6.5, 22)],
  play: [P('b', [8, 4, 27, 16, 8, 28])],
  transfer: [C('b', 11, 21, 8), L('bd', 1.8, [3, 24, 19, 17]), L('b', 3, [15, 16, 26, 6]), P('b', [28, 4, 28, 14, 18, 4])],
  stand: FLAME,
  flame: FLAME,
  back: [P('b', [3, 16, 14, 5, 14, 12, 28, 12, 28, 20, 14, 20, 14, 27])],
  close: [L('b', 4.4, [7, 7, 25, 25]), L('b', 4.4, [25, 7, 7, 25])],
  check: [L('b', 4.8, [6, 17, 13, 24, 26, 8])],
  lock: [L('b', 3.6, [10, 14, 10, 9, 13, 5.5, 19, 5.5, 22, 9, 22, 14]), R('b', 6, 14, 20, 14), C('k', 16, 19.5, 2.4, true), R('k', 15, 20.5, 2, 5, true)],
  arrow: [P('b', [3, 13, 18, 13, 18, 6, 29, 16, 18, 26, 18, 19, 3, 19])],
  plus: [R('b', 13, 5, 6, 22), R('b', 5, 13, 22, 6)],
  up: [P('b', [16, 4, 28, 18, 20, 18, 20, 28, 12, 28, 12, 18, 4, 18])],
  down: [P('b', [16, 28, 28, 14, 20, 14, 20, 4, 12, 4, 12, 14, 4, 14])],
  star: [P('b', STAR)],
  trophy: [L('b', 2.8, [8, 7, 4, 7, 4, 12, 9, 15]), L('b', 2.8, [24, 7, 28, 7, 28, 12, 23, 15]), P('b', [8, 4, 24, 4, 24, 14, 20, 19, 12, 19, 8, 14]), R('bd', 14, 19, 4, 5), R('bd', 9, 24, 14, 4)],
  gear: [P('b', ngon(16, 16, 14, 10.5, 8)), C('bd', 16, 16, 7), C('k', 16, 16, 3.4, true)],
  sound: [P('b', [4, 12, 10, 12, 17, 6, 17, 26, 10, 20, 4, 20]), L('b', 2.2, [20.5, 11, 23, 16, 20.5, 21]), L('b', 2.2, [24, 8, 28.5, 16, 24, 24])],
  mute: [P('b', [4, 12, 10, 12, 17, 6, 17, 26, 10, 20, 4, 20]), L('b', 2.8, [21, 12, 28, 20]), L('b', 2.8, [28, 12, 21, 20])],
  music: [P('b', [14, 5, 27, 2.5, 27, 8, 14, 10.5]), L('b', 3, [14, 24, 14, 6]), L('b', 3, [26, 21, 26, 4]), C('b', 10, 24, 4.6), C('b', 22, 21, 4.6)],
  warn: [P('b', [16, 3, 30, 28, 2, 28]), R('k', 14.6, 11, 2.8, 9, true), C('k', 16, 23.8, 1.9, true)],
  info: [C('b', 16, 16, 13), C('k', 16, 10.5, 2, true), R('k', 14.8, 14, 2.4, 9.5, true)],
  target: [C('b', 16, 16, 13), C('bd', 16, 16, 9), C('b', 16, 16, 5.2), C('bd', 16, 16, 1.8)],
  altitude: [P('b', [22, 3, 29, 12, 24, 12, 24, 26, 20, 26, 20, 12, 15, 12]), R('bd', 3, 28, 26, 2.6), L('bd', 2, [7, 8, 11, 8]), L('bd', 2, [7, 14, 11, 14]), L('bd', 2, [7, 20, 11, 20])],
  speed: [C('b', 16, 17, 13), L('k', 2.6, [16, 17, 23, 9]), C('k', 16, 17, 2.4, true), L('bd', 1.6, [6, 17, 8.5, 17]), L('bd', 1.6, [16, 7, 16, 9.5]), L('bd', 1.6, [26, 17, 23.5, 17])],
  wind: [L('b', 2.8, [4, 10, 19, 10, 23, 7, 20, 4]), L('b', 2.8, [4, 17, 25, 17, 28, 14, 25, 11]), L('b', 2.8, [4, 24, 15, 24, 19, 27, 16, 30])],
  radar: [C('b', 16, 16, 13), C('bd', 16, 16, 9), P('bl', [16, 16, 16, 3, 27, 9]), C('w', 21, 20, 1.9, true), C('w', 11, 22, 1.5, true)],
  contract: [R('b', 7, 4, 18, 24), R('bd', 12, 2, 8, 5), L('bd', 1.8, [11, 12, 21, 12]), L('bd', 1.8, [11, 17, 21, 17]), L('bd', 1.8, [11, 22, 17, 22])],
  brush: [L('b', 4, [23, 5, 13, 15]), P('bd', [13, 15, 9, 14, 4, 27, 18, 21, 17, 18])],
  cart: [P('b', [3, 7, 8, 7, 10, 20, 25, 20, 28, 10, 9.4, 10]), C('bd', 12, 25, 2.8), C('bd', 22, 25, 2.8)],
  era: [C('b', 16, 16, 13), L('k', 2.4, [16, 16, 16, 7.5]), L('k', 2.4, [16, 16, 22, 19.5]), C('k', 16, 16, 1.8, true)],
  moon: [P('b', crescent()), C('bd', 11, 18, 2, true)],
  mars: [C('b', 16, 16, 13), C('bd', 11, 12, 2.6), C('bd', 21, 18, 3.3), C('bd', 14, 23, 1.9)],
  earth: [C('b', 16, 16, 13), P('bd', [8, 10, 14, 8, 17, 12, 12, 16, 9, 15]), P('bd', [18, 17, 24, 16, 25, 22, 20, 25, 17, 22])],
  export: [P('b', [3, 18, 3, 28, 29, 28, 29, 18, 25, 18, 25, 24, 7, 24, 7, 18]), P('b', [16, 3, 25, 12, 19.5, 12, 19.5, 21, 12.5, 21, 12.5, 12, 7, 12])],
  import: [P('b', [3, 18, 3, 28, 29, 28, 29, 18, 25, 18, 25, 24, 7, 24, 7, 18]), P('b', [16, 21, 25, 12, 19.5, 12, 19.5, 3, 12.5, 3, 12.5, 12, 7, 12])],
  tap: [P('b', [13, 3, 18, 3, 18, 15, 22, 15, 26, 17, 26, 26, 22, 29, 12, 29, 8, 22, 8, 18, 12, 20, 13, 20])],
  building: [R('bd', 7, 4, 18, 3), R('b', 9, 6, 14, 22), R('cyan', 12, 10, 3, 3, true), R('cyan', 17, 10, 3, 3, true), R('cyan', 12, 16, 3, 3, true), R('cyan', 17, 16, 3, 3, true), R('bd', 14, 22, 4, 6)],
  eye: [P('b', [2, 16, 9, 9, 16, 7, 23, 9, 30, 16, 23, 23, 16, 25, 9, 23]), C('k', 16, 16, 5.2, true), C('w', 17.6, 14.4, 1.7, true)],
  heart: [P('b', [16, 28, 4, 15, 4, 9, 8, 5, 13, 5, 16, 9, 19, 5, 24, 5, 28, 9, 28, 15])],
  fullscreen: [L('b', 3, [4, 11, 4, 4, 11, 4]), L('b', 3, [21, 4, 28, 4, 28, 11]), L('b', 3, [4, 21, 4, 28, 11, 28]), L('b', 3, [28, 21, 28, 28, 21, 28])],
};

// Иконка → спрайт рендера (базовое имя в manifest, по эпохе): настоящий арт вместо векторной заглушки.
// плоские спрайты без эпохи
const SPRITE_FLAT = { earth: 'earth', moon: 'moon' };

const SPRITE_OF = {
  coin: 'coin', fuel: 'fuel', canister: 'fuel', repair: 'repair',
  chute: 'canopy', parachute: 'canopy', capsule: 'capsule', booster: 'booster',
};

// запасные векторные иконки построек, пока для них нет спрайта эпохи
const BUILDING_FALLBACK = {
  beacons: 'target', gantry: 'building', deluge: 'fuel', service: 'repair', rescue: 'shield', fuel: 'canister', logistics: 'cart',
  factory: 'gear', weather: 'wind', control: 'avionics', radar: 'radar', energy: 'bolt', observation: 'eye', recovery: 'chute',
};

export const ICON_NAMES = Object.keys(ICONS);
export const hasIcon = (name) => name in ICONS || name.startsWith('bld:');

const FIXED = { gold: '#ffd23f', cyan: '#52d8ff', red: '#f0584a', amber: '#e6a020', green: '#3aa860', w: '#f6f1e4', k: '#0b0f1a' };

const PIX = 24; // сетка пиксельной иконки; вокруг неё поле в 1 пиксель под контур
const PAD = 1;

function pointInPoly(pts, x, y) {
  let inside = false;
  for (let i = 0, j = pts.length - 2; i < pts.length; j = i, i += 2) {
    const xi = pts[i];
    const yi = pts[i + 1];
    const xj = pts[j];
    const yj = pts[j + 1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function covers(shape, x, y) {
  if (shape.k === 'c') return (x - shape.x) ** 2 + (y - shape.y) ** 2 <= shape.r * shape.r;
  if (shape.k === 'p') return pointInPoly(shape.pts, x, y);
  for (let i = 0; i + 3 < shape.pts.length; i += 2) {
    if (distToSegment(x, y, shape.pts[i], shape.pts[i + 1], shape.pts[i + 2], shape.pts[i + 3]) <= shape.w / 2) return true;
  }
  return false;
}

export function createIcons() {
  let dpr = 1;
  let era = 0;
  let painter = null;
  const cache = new Map();

  function toneColor(tone, base) {
    if (tone === 'b') return base;
    if (tone === 'bl') return mix(base, '#ffffff', 0.45);
    if (tone === 'bd') return mix(base, '#0a1224', 0.42);
    return FIXED[tone] || base;
  }

  /**
   * Пиксельная растеризация векторного описания без сглаживания: каждый пиксель сетки принадлежит одной фигуре;
   * свет сверху-слева, тень снизу-справа и тёмный контур — как в пиксельной графике. Все цвета сводятся к палитре.
   */
  function pixels(name, color) {
    const key = `${name}|${color}`;
    let bm = cache.get(`px:${key}`);
    if (bm) return bm;
    const shapes = ICONS[name] || ICONS.info;
    const N = PIX + PAD * 2;
    const idx = new Int16Array(N * N).fill(-1);
    for (let py = 0; py < N; py++) {
      for (let px = 0; px < N; px++) {
        const x = ((px - PAD + 0.5) * ICON_GRID) / PIX;
        const y = ((py - PAD + 0.5) * ICON_GRID) / PIX;
        for (let si = 0; si < shapes.length; si++) if (covers(shapes[si], x, y)) idx[py * N + px] = si;
      }
    }
    const tones = shapes.map((sh) => {
      const base = nearestPalette(toneColor(sh.tone, color));
      return { base, light: nearestPalette(mix(base, '#fff4d6', 0.5)), dark: nearestPalette(mix(base, '#0b0f1a', 0.5)) };
    });
    const at = (x, y) => (x < 0 || y < 0 || x >= N || y >= N ? -1 : idx[y * N + x]);
    const out = new Array(N * N).fill(null);
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const si = idx[y * N + x];
        if (si < 0) {
          let near = false;
          for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && at(x + dx, y + dy) >= 0) near = true;
          if (near) out[y * N + x] = PALETTE.ink;
          continue;
        }
        const tn = tones[si];
        if (shapes[si].flat) {
          out[y * N + x] = tn.base;
          continue;
        }
        const up = at(x, y - 1);
        const left = at(x - 1, y);
        const down = at(x, y + 1);
        const right = at(x + 1, y);
        const tl = up === -1 || left === -1;
        const br = down === -1 || right === -1 || down > si || right > si;
        out[y * N + x] = br && !tl ? tn.dark : tl && !br ? tn.light : tn.base;
      }
    }
    bm = { N, out };
    cache.set(`px:${key}`, bm);
    return bm;
  }

  function vector(name, color, k) {
    const key = `${name}|${color}|${k}`;
    let canvas = cache.get(key);
    if (canvas) return canvas;
    const { N, out } = pixels(name, color);
    canvas = document.createElement('canvas');
    canvas.width = canvas.height = N * k;
    const g = canvas.getContext('2d');
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const col = out[y * N + x];
        if (!col) continue;
        g.fillStyle = col;
        g.fillRect(x * k, y * k, k, k);
      }
    }
    cache.set(key, canvas);
    return canvas;
  }

  function spriteFor(name) {
    if (!painter) return null;
    let sprite = null;
    if (name.startsWith('bld:')) {
      const [, key, lv] = name.split(':');
      sprite = buildingSpriteName(key, Math.max(1, Number(lv) || era + 1));
    } else if (SPRITE_FLAT[name]) sprite = SPRITE_FLAT[name];
    else if (SPRITE_OF[name]) sprite = spriteName(SPRITE_OF[name], era);
    const asset = sprite && painter.assets.get(sprite);
    return asset || null;
  }

  function setDpr(v) {
    if (v !== dpr) {
      dpr = v;
      cache.clear();
    }
  }

  /**
   * Иконка по центру (cx, cy), размер size — сторона квадрата в CSS-пикселях.
   * Спрайт арта (если есть) вписывается по большей стороне и не красится; пиксельная иконка красится цветом color.
   */
  function draw(ctx, name, cx, cy, size, color = '#fff', alpha = 1) {
    const prev = ctx.globalAlpha;
    if (alpha !== 1) ctx.globalAlpha = prev * alpha;
    const asset = spriteFor(name);
    let actual = size;
    if (asset) {
      const k = Math.min(size / asset.w, size / asset.h);
      const wDev = Math.max(1, Math.round(asset.w * k * dpr));
      const hDev = Math.max(1, Math.round(asset.h * k * dpr));
      const src = painter.source(asset, wDev, hDev);
      ctx.drawImage(src, Math.round((cx - wDev / dpr / 2) * dpr) / dpr, Math.round((cy - hDev / dpr / 2) * dpr) / dpr, wDev / dpr, hDev / dpr);
    } else {
      const vname = name.startsWith('bld:') ? BUILDING_FALLBACK[name.split(':')[1]] || 'building' : name;
      const N = PIX + PAD * 2;
      const k = Math.max(1, Math.round((size * dpr) / PIX));
      const bm = vector(vname in ICONS ? vname : 'info', color, k);
      actual = (N * k) / dpr;
      const prevSmooth = ctx.imageSmoothingEnabled;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(bm, Math.round((cx - actual / 2) * dpr) / dpr, Math.round((cy - actual / 2) * dpr) / dpr, actual, actual);
      ctx.imageSmoothingEnabled = prevSmooth;
    }
    if (alpha !== 1) ctx.globalAlpha = prev;
    return actual;
  }

  return {
    draw,
    setDpr,
    setEra(v) {
      era = v | 0;
    },
    setPainter(p) {
      painter = p || null;
    },
    /** Есть ли у иконки готовый спрайт (для проверок и экранов, которые рисуют крупнее). */
    hasSprite: (name) => !!spriteFor(name),
  };
}
