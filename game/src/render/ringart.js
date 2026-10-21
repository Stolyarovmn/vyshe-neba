// Объёмное горизонтальное кольцо ускорения: тор, лежащий горизонтально, виден сбоку-сверху.
// Чистый код без DOM: трассировка луча по расстоянию до тора (ортографическая камера), ступенчатая пиксельная
// раскраска по палитре спрайта ring_ГОД, тёмный контур. Результат — два RGBA-слоя: задняя половина (z < 0,
// рисуется под ракетой) и передняя (z >= 0, поверх ракеты), поэтому ракета пролетает «сквозь» кольцо.
//
// Освещение по style_bible: ключевой свет сверху-слева, тёплые света, холодные тени. Размеры нормированы:
// внешняя полуширина кольца (с хомутами) = 1.

import { TAU, clamp, smoothstep } from './util.js';

export const TORUS = {
  tilt: 0.36, // sin угла возвышения камеры: вид под небольшим углом сверху
  ringRadius: 0.82, // радиус осевой линии трубы
  tubeRadius: 0.15, // радиус трубы
};
const COS_TILT = Math.sqrt(1 - TORUS.tilt * TORUS.tilt);
const MAX_BUMP = 1.28; // самый толстый хомут относительно трубы
export const RING_EXTENT = TORUS.ringRadius + TORUS.tubeRadius * MAX_BUMP; // внешний радиус по X — нормировка размера

/** Пикселей мастер-текстуры на единицу нормированного размера (полуширина кольца = RING_EXTENT единиц). */
export const MASTER_HALF_WIDTH_PX = 186;
const MARGIN = 3;
const OUTLINE = [20, 16, 26];
const KEY_LIGHT = normalize([-0.62, 0.7, 0.28]);

function normalize(v) {
  const l = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / l, v[1] / l, v[2] / l];
}

function hex(h) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const ramp = (list) => list.map(hex);

// --- палитры эпох (из спрайтов ring_1978..2060; ступени от холодной тени к тёплому блику) ------------------

const STEEL = ramp(['#23232b', '#3c3c43', '#6c696f', '#a29085', '#d9c8b0']);
const DARK_STEEL = ramp(['#0d1015', '#232b34', '#3a4350', '#6e7480', '#bdb8bb']);
const LIGHT_STEEL = ramp(['#1b1d22', '#504f57', '#827e82', '#c7bdb7', '#ece4dc']);
const AMBER = ramp(['#3d2c33', '#8a5a36', '#e5922e', '#efb55a', '#f6dda4']);
const RED = ramp(['#2c0c10', '#6d0e10', '#c1161a', '#f3352f', '#ff8a78']);
const RED_CLAMP = ramp(['#3a0709', '#7a0c0f', '#c40f13', '#e42a27', '#ff7a68']);
const WHITE = ramp(['#2c323c', '#6b6a72', '#a39b9b', '#ded2ca', '#f5efea']);
const CREAM = ramp(['#4a3f48', '#90878a', '#beada7', '#e9dcd3', '#fbf6f0']);
const SILVER = ramp(['#2c4150', '#506b7b', '#b2d4d4', '#e8f3ee', '#fbf7e8']);
const GOLD = ramp(['#3d2a1e', '#835730', '#c07c2c', '#e8b64e', '#f8e08a']);
const BLACK_PANEL = ramp(['#0a0808', '#1c1614', '#2e2421', '#565358', '#8a8286']);
// лампы: [тёмная кромка, тусклая, средняя, яркая]
const CYAN_LAMP = ramp(['#1f3a44', '#3a7d86', '#67bec4', '#b8f6f8']);
const RED_LAMP = ramp(['#280e0e', '#7a1214', '#e42a27', '#ff9a86']);
const AMBER_LAMP = ramp(['#2e2010', '#8a5a1c', '#e5a23a', '#ffe0a0']);

const TOP = Math.PI / 2; // верх трубы по углу сечения v: 0 — наружу, PI/2 — вверх, PI — внутрь

/**
 * Спецификация эпохи:
 * tube — основная рампа трубы; sections — цветные дуги [от, до] по углу кольца u (0 — вправо, PI/2 — к зрителю);
 * clamps — хомуты { u, half, bump, ramp }; lamps — лампы { u, du, ramp, glow, phase, kind } на верху трубы;
 * bands — полосы по сечению { v, dv, ramp }; rivets — заклёпки на хомутах; seam — шаг швов трубы (рад.) или 0.
 */
export const ERA_SPECS = [
  { // 1978: оранжевые дуги, серые хомуты с заклёпками, чёрные боковые панели
    tube: STEEL,
    sections: [[0.4, 1.17, AMBER], [1.97, 2.74, AMBER], [3.54, 4.31, AMBER], [5.11, 5.88, AMBER]],
    clamps: [
      { u: 0, half: 0.2, bump: 1.26, ramp: BLACK_PANEL }, { u: Math.PI, half: 0.2, bump: 1.26, ramp: BLACK_PANEL },
      { u: TOP, half: 0.2, bump: 1.14, ramp: STEEL }, { u: TOP * 3, half: 0.2, bump: 1.14, ramp: STEEL },
    ],
    lamps: [
      { u: 0, du: 0.07, ramp: AMBER_LAMP, glow: '255,170,60', phase: 0, kind: 'blink' },
      { u: Math.PI, du: 0.07, ramp: AMBER_LAMP, glow: '255,170,60', phase: Math.PI, kind: 'blink' },
    ],
    bands: [],
    rivets: [[TOP - 0.09, TOP], [TOP + 0.09, TOP], [TOP * 3 - 0.09, TOP], [TOP * 3 + 0.09, TOP]],
    seam: 0,
  },
  { // 1986: красная труба, серые хомуты, красные панели с линзами
    tube: RED,
    sections: [],
    clamps: [
      { u: 0, half: 0.21, bump: 1.26, ramp: LIGHT_STEEL }, { u: Math.PI, half: 0.21, bump: 1.26, ramp: LIGHT_STEEL },
      { u: TOP, half: 0.18, bump: 1.14, ramp: LIGHT_STEEL }, { u: TOP * 3, half: 0.18, bump: 1.14, ramp: LIGHT_STEEL },
    ],
    lamps: [
      { u: 0, du: 0.09, ramp: RED_LAMP, glow: '255,70,60', phase: 0, kind: 'pulse' },
      { u: Math.PI, du: 0.09, ramp: RED_LAMP, glow: '255,70,60', phase: 1.6, kind: 'pulse' },
    ],
    bands: [],
    rivets: [[TOP - 0.1, TOP], [TOP + 0.1, TOP], [TOP * 3 - 0.1, TOP], [TOP * 3 + 0.1, TOP]],
    seam: 0,
  },
  { // 1998: белая труба, серые хомуты, голубые светодиодные панели
    tube: WHITE,
    sections: [],
    clamps: [
      { u: 0, half: 0.21, bump: 1.26, ramp: LIGHT_STEEL }, { u: Math.PI, half: 0.21, bump: 1.26, ramp: LIGHT_STEEL },
      { u: TOP, half: 0.2, bump: 1.16, ramp: LIGHT_STEEL }, { u: TOP * 3, half: 0.2, bump: 1.16, ramp: LIGHT_STEEL },
    ],
    lamps: [
      { u: 0, du: 0.1, ramp: CYAN_LAMP, glow: '120,230,240', phase: 0, kind: 'chase' },
      { u: TOP, du: 0.13, ramp: CYAN_LAMP, glow: '120,230,240', phase: 0.8, kind: 'chase' },
      { u: Math.PI, du: 0.1, ramp: CYAN_LAMP, glow: '120,230,240', phase: 1.6, kind: 'chase' },
      { u: TOP * 3, du: 0.13, ramp: CYAN_LAMP, glow: '120,230,240', phase: 2.4, kind: 'chase' },
    ],
    bands: [],
    rivets: [[TOP - 0.14, TOP + 0.5], [TOP + 0.14, TOP + 0.5], [TOP * 3 - 0.14, TOP + 0.5], [TOP * 3 + 0.14, TOP + 0.5]],
    seam: TAU / 16,
  },
  { // 2015: кремовая труба, красные хомуты спереди и сзади, красные боковые линзы
    tube: CREAM,
    sections: [],
    clamps: [
      { u: 0, half: 0.19, bump: 1.24, ramp: DARK_STEEL }, { u: Math.PI, half: 0.19, bump: 1.24, ramp: DARK_STEEL },
      { u: TOP, half: 0.24, bump: 1.2, ramp: RED_CLAMP }, { u: TOP * 3, half: 0.24, bump: 1.2, ramp: RED_CLAMP },
    ],
    lamps: [
      { u: 0, du: 0.08, ramp: RED_LAMP, glow: '255,60,50', phase: 0, kind: 'pulse' },
      { u: Math.PI, du: 0.08, ramp: RED_LAMP, glow: '255,60,50', phase: 1.5, kind: 'pulse' },
      { u: TOP, du: 0.1, ramp: RED_LAMP, glow: '255,60,50', phase: 3, kind: 'pulse' },
      { u: TOP * 3, du: 0.1, ramp: RED_LAMP, glow: '255,60,50', phase: 4.5, kind: 'pulse' },
    ],
    bands: [],
    rivets: [],
    seam: TAU / 12,
  },
  { // 2035: тёмная труба с голубыми светодиодными дугами по кругу, светлые боковые хомуты
    tube: DARK_STEEL,
    sections: [],
    clamps: [
      { u: 0, half: 0.2, bump: 1.26, ramp: LIGHT_STEEL }, { u: Math.PI, half: 0.2, bump: 1.26, ramp: LIGHT_STEEL },
      { u: TOP, half: 0.2, bump: 1.18, ramp: DARK_STEEL }, { u: TOP * 3, half: 0.2, bump: 1.18, ramp: DARK_STEEL },
    ],
    lamps: dashes(10, [0, Math.PI, TOP, TOP * 3], 0.2, 0.15, CYAN_LAMP, '90,220,240').concat([
      { u: 0, du: 0.1, ramp: CYAN_LAMP, glow: '120,230,240', phase: 0, kind: 'chase' },
      { u: Math.PI, du: 0.1, ramp: CYAN_LAMP, glow: '120,230,240', phase: 3, kind: 'chase' },
    ]),
    bands: [],
    rivets: [],
    seam: TAU / 20,
  },
  { // 2060: серебристая труба, золотые хомуты, голубые огни и золотая внутренняя полоса
    tube: SILVER,
    sections: [],
    clamps: [
      { u: 0, half: 0.19, bump: 1.24, ramp: SILVER }, { u: Math.PI, half: 0.19, bump: 1.24, ramp: SILVER },
      { u: TOP, half: 0.26, bump: 1.22, ramp: GOLD }, { u: TOP * 3, half: 0.26, bump: 1.22, ramp: GOLD },
    ],
    lamps: dashes(8, [0, Math.PI, TOP, TOP * 3], 0.2, 0.14, CYAN_LAMP, '90,230,240').concat([
      { u: 0, du: 0.09, ramp: CYAN_LAMP, glow: '120,230,240', phase: 0, kind: 'chase' },
      { u: Math.PI, du: 0.09, ramp: CYAN_LAMP, glow: '120,230,240', phase: 3, kind: 'chase' },
    ]),
    bands: [{ v: Math.PI, dv: 0.42, ramp: GOLD }],
    rivets: [],
    seam: TAU / 16,
  },
];

/** n равномерных светодиодных штрихов по кольцу, пропуская зоны хомутов (clampU ± skip). */
function dashes(n, clampU, skip, du, lampRamp, glow) {
  const out = [];
  for (let i = 0; i < n * 2; i++) {
    const u = ((i + 0.5) / (n * 2)) * TAU;
    if (clampU.some((c) => Math.abs(wrap(u - c)) < skip)) continue;
    out.push({ u, du, ramp: lampRamp, glow, phase: u * 1.3, kind: 'chase' });
  }
  return out;
}

function wrap(a) {
  let v = a % TAU;
  if (v > Math.PI) v -= TAU;
  else if (v < -Math.PI) v += TAU;
  return v;
}

/** Положение лампы на экране в нормированных единицах: x вправо, y вверх; layer 'front' (z >= 0) или 'back'. */
export function lampScreenPosition(lamp, out = { x: 0, y: 0, front: false }) {
  const radius = TORUS.ringRadius + TORUS.tubeRadius * 1.05 * Math.cos(TOP - 0.1);
  const px = radius * Math.cos(lamp.u);
  const pz = radius * Math.sin(lamp.u);
  const py = TORUS.tubeRadius * 1.1;
  out.x = px;
  out.y = py * COS_TILT - pz * TORUS.tilt;
  out.front = pz >= 0;
  return out;
}

// --- геометрия -----------------------------------------------------------------------------------------

function bumpAt(spec, u) {
  let bump = 0;
  for (const clamp of spec.clamps) {
    const d = Math.abs(wrap(u - clamp.u));
    const w = 1 - smoothstep(clamp.half - 0.014, clamp.half + 0.014, d);
    const b = (clamp.bump - 1) * w;
    if (b > bump) bump = b;
  }
  return bump;
}

function distance(spec, x, y, z) {
  const rho = Math.hypot(x, z);
  const u = Math.atan2(z, x);
  const radius = TORUS.tubeRadius * (1 + bumpAt(spec, u));
  return Math.hypot(rho - TORUS.ringRadius, y) - radius;
}

const BUMP_CELLS = 1024;
const bumpTables = new WeakMap();

function bumpTable(spec) {
  let table = bumpTables.get(spec);
  if (!table) {
    table = new Float32Array(BUMP_CELLS + 1);
    for (let k = 0; k <= BUMP_CELLS; k++) table[k] = bumpAt(spec, (k / BUMP_CELLS) * TAU - Math.PI);
    bumpTables.set(spec, table);
  }
  return table;
}

/**
 * Быстрое расстояние для шагов луча: вдали считает по самой толстой трубе (оценка снизу, поэтому безопасно),
 * вблизи берёт толщину хомутов из таблицы. Точный distance() нужен только для нормалей.
 */
function distanceFast(table, x, y, z) {
  const rho = Math.sqrt(x * x + z * z);
  const q = Math.sqrt((rho - TORUS.ringRadius) * (rho - TORUS.ringRadius) + y * y);
  const far = q - TORUS.tubeRadius * MAX_BUMP;
  if (far > 0.04) return far;
  const position = ((Math.atan2(z, x) + Math.PI) / TAU) * BUMP_CELLS;
  const cell = position | 0;
  const frac = position - cell;
  const bump = table[cell] + (table[cell + 1] - table[cell]) * frac;
  return q - TORUS.tubeRadius * (1 + bump);
}

function clampAt(spec, u) {
  let best = null;
  let bestWeight = 0.35;
  for (const clampSpec of spec.clamps) {
    const d = Math.abs(wrap(u - clampSpec.u));
    const w = 1 - smoothstep(clampSpec.half - 0.014, clampSpec.half + 0.014, d);
    if (w > bestWeight) {
      bestWeight = w;
      best = clampSpec;
    }
  }
  return best;
}

// --- раскраска ------------------------------------------------------------------------------------------

const LEVELS = [0.2, 0.42, 0.66, 0.9];

/** Ступень света 0..4: рассеянный свет ключевого источника сверху-слева, без мягких градиентов (ступенчатая тень). */
function toneLevel(n) {
  const diffuse = Math.max(0, n[0] * KEY_LIGHT[0] + n[1] * KEY_LIGHT[1] + n[2] * KEY_LIGHT[2]);
  const light = 0.1 + 0.88 * diffuse + 0.03 * n[1];
  let level = 0;
  for (let i = 0; i < LEVELS.length; i++) if (light > LEVELS[i]) level = i + 1;
  return level;
}

function sectionRamp(spec, u) {
  for (const [from, to, ramp] of spec.sections) if (u >= from && u <= to) return ramp;
  return spec.tube;
}

/** Цвет и признак «лампа» для точки трубы: u — угол кольца, v — угол сечения, level — ступень света. */
function paint(spec, u, v, level, out) {
  const clampSpec = clampAt(spec, u);
  let colors = clampSpec ? clampSpec.ramp : sectionRamp(spec, u);
  let idx = level;
  out.lamp = false;
  const dv = Math.abs(wrap(v - TOP));

  // швы между секциями трубы
  if (!clampSpec && spec.seam) {
    const m = ((u % spec.seam) + spec.seam) % spec.seam;
    if (Math.min(m, spec.seam - m) < 0.0052) idx = Math.max(0, idx - 1);
  }
  // кромка хомута: тёмная канавка на краю
  if (clampSpec) {
    const d = Math.abs(wrap(u - clampSpec.u));
    if (d > clampSpec.half - 0.026) idx = Math.max(0, idx - 1);
  }
  // золотая внутренняя полоса
  for (const band of spec.bands) {
    if (Math.abs(wrap(v - band.v)) < band.dv && !clampSpec) {
      colors = band.ramp;
      idx = level;
    }
  }
  // заклёпки
  for (const [ru, rv] of spec.rivets) {
    const du = (u - ru) / 0.013;
    const dvr = wrap(v - rv) / 0.07;
    if (du * du + dvr * dvr < 1) {
      colors = clampSpec ? colors : LIGHT_STEEL;
      idx = Math.min(4, level + 1);
    }
  }
  // лампы
  for (const lamp of spec.lamps) {
    const du = Math.abs(wrap(u - lamp.u));
    if (du < lamp.du && dv < 0.52) {
      const edge = du > lamp.du - 0.02 || dv > 0.4;
      colors = lamp.ramp;
      idx = edge ? 0 : level >= 3 ? 3 : level >= 1 ? 2 : 1;
      out.lamp = !edge;
      break;
    }
  }
  out.color = colors[idx];
}

const paintOut = { color: null, lamp: false };

// --- рендер -------------------------------------------------------------------------------------------------

/** Размеры мастер-текстуры [ширина, высота] в пикселях. */
export function masterSize() {
  const pxu = MASTER_HALF_WIDTH_PX / RING_EXTENT;
  const halfH = Math.ceil((TORUS.ringRadius * TORUS.tilt + TORUS.tubeRadius * MAX_BUMP) * pxu) + MARGIN;
  return [(MASTER_HALF_WIDTH_PX + MARGIN) * 2, halfH * 2];
}

/**
 * Мастер-текстура кольца эпохи era (0..5): { width, height, back, front } — RGBA-слои (Uint8ClampedArray),
 * {pxPerUnit} — пикселей на нормированную единицу. Детерминирована; слои не перекрываются.
 */
export function renderRingMaster(era) {
  const spec = ERA_SPECS[clamp(era | 0, 0, ERA_SPECS.length - 1)];
  const [width, height] = masterSize();
  const pxu = MASTER_HALF_WIDTH_PX / RING_EXTENT;
  const count = width * height;
  const depth = new Float32Array(count).fill(-9);
  const rgb = new Uint8Array(count * 3);
  const normals = new Float32Array(count * 3);
  const front = new Uint8Array(count);
  const lampMask = new Uint8Array(count);
  const sinE = TORUS.tilt;
  const cosE = COS_TILT;
  const eps = 0.004;
  const table = bumpTable(spec);

  for (let j = 0; j < height; j++) {
    const syUp = -(j + 0.5 - height / 2) / pxu;
    for (let i = 0; i < width; i++) {
      const sx = (i + 0.5 - width / 2) / pxu;
      if (Math.abs(sx) > RING_EXTENT + 0.01) continue;
      let t = 1.25;
      let hit = false;
      let x = 0;
      let y = 0;
      let z = 0;
      for (let step = 0; step < 64; step++) {
        x = sx;
        y = syUp * cosE + t * sinE;
        z = -syUp * sinE + t * cosE;
        const d = distanceFast(table, x, y, z);
        if (d < 0.0012) {
          hit = true;
          break;
        }
        t -= d * 0.8;
        if (t < -1.3) break;
      }
      if (!hit) continue;
      const index = j * width + i;
      const nx = distance(spec, x + eps, y, z) - distance(spec, x - eps, y, z);
      const ny = distance(spec, x, y + eps, z) - distance(spec, x, y - eps, z);
      const nz = distance(spec, x, y, z + eps) - distance(spec, x, y, z - eps);
      const nl = Math.hypot(nx, ny, nz) || 1;
      const n = [nx / nl, ny / nl, nz / nl];
      const u = ((Math.atan2(z, x) % TAU) + TAU) % TAU;
      const rho = Math.hypot(x, z);
      const v = ((Math.atan2(y, rho - TORUS.ringRadius) % TAU) + TAU) % TAU;
      paint(spec, u, v, toneLevel(n), paintOut);
      const c = paintOut.color;
      rgb[index * 3] = c[0];
      rgb[index * 3 + 1] = c[1];
      rgb[index * 3 + 2] = c[2];
      normals[index * 3] = n[0];
      normals[index * 3 + 1] = n[1];
      normals[index * 3 + 2] = n[2];
      depth[index] = t;
      front[index] = z >= 0 ? 1 : 0;
      lampMask[index] = paintOut.lamp ? 1 : 0;
    }
  }

  // контур: по силуэту и по скачку глубины (на ближнем крае); на освещённой стороне слабее
  const outlined = new Uint8Array(count);
  const strength = new Float32Array(count);
  const neighbours = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (let j = 0; j < height; j++) {
    for (let i = 0; i < width; i++) {
      const index = j * width + i;
      if (depth[index] < -8 || lampMask[index]) continue;
      let silhouette = false;
      let jump = false;
      for (const [dx, dy] of neighbours) {
        const ni = i + dx;
        const nj = j + dy;
        if (ni < 0 || nj < 0 || ni >= width || nj >= height || depth[nj * width + ni] < -8) silhouette = true;
        else if (depth[nj * width + ni] < depth[index] - 0.11) jump = true;
      }
      if (!silhouette && !jump) continue;
      const lit = normals[index * 3] * KEY_LIGHT[0] + normals[index * 3 + 1] * KEY_LIGHT[1] + normals[index * 3 + 2] * KEY_LIGHT[2];
      outlined[index] = 1;
      strength[index] = silhouette && lit > 0.55 ? 0.5 : 0.88;
    }
  }

  const back = new Uint8ClampedArray(count * 4);
  const frontPixels = new Uint8ClampedArray(count * 4);
  for (let index = 0; index < count; index++) {
    if (depth[index] < -8) continue;
    const target = front[index] ? frontPixels : back;
    const k = outlined[index] ? strength[index] : 0;
    target[index * 4] = rgb[index * 3] + (OUTLINE[0] - rgb[index * 3]) * k;
    target[index * 4 + 1] = rgb[index * 3 + 1] + (OUTLINE[1] - rgb[index * 3 + 1]) * k;
    target[index * 4 + 2] = rgb[index * 3 + 2] + (OUTLINE[2] - rgb[index * 3 + 2]) * k;
    target[index * 4 + 3] = 255;
  }
  return { width, height, back, front: frontPixels, pxPerUnit: pxu };
}
