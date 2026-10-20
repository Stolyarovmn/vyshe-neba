// Каталог ассетов рендера. Чистые данные без DOM: этот файл читает и Node (tools/build.mjs, тесты).
//
// ASSET_FILES: логическое имя -> путь от корня репозитория (или { file, kind:'json' }).
// SPRITE_SIZES: размеры подготовленных PNG. Поле crop/scale из live/world-assets.js здесь не
// нужно: crop описывает вырезку из исходного листа, а лежащие в assets/world PNG уже вырезаны
// (проверено: размер файла == w,h для всех спрайтов, scale == 1 везде).
// Единицы мира: 1 ед. = 10 м; размеры отрисовки (в единицах мира) лежат в sizes.js.

export const ERA_YEARS = [1978, 1986, 1998, 2015, 2035, 2060];

const WORLD_DIR = 'outputs/rocket/dist/assets/world/';
const INFRA_DIR = 'outputs/rocket/dist/assets/infrastructure/';
const PLACEABLE_DIR = 'outputs/rocket/dist/assets/placeables/';

export const ISLAND_FILE = 'art/gen/environment/start_island_e0.png';
export const AIRCRAFT_FX_FILE = 'outputs/rocket/dist/assets/aircraft/effects.json';

/** Спрайты, у которых есть вариант на каждую эпоху: имя_ГОД. */
export const ERA_SPRITES = [
  'core', 'booster', 'capsule', 'canopy', 'pack', 'coin', 'fuel', 'repair', 'ring', 'balloon',
  'satellite', 'panel', 'pad_moon', 'pad_mars',
  'low_primary', 'low_multiwing', 'medium_passenger', 'medium_cargo', 'high_fighter', 'high_experimental',
];
/** Спрайты природы и фона без эпох. */
export const FLAT_SPRITES = [
  'cloud_0', 'cloud_1', 'cloud_2', 'cloud_3', 'rock_0', 'rock_1', 'rock_2', 'rock_3',
  'earth', 'moon', 'terrain_moon', 'terrain_mars', 'base_drone_0', 'base_drone_1',
];
/** Постройки с готовым артом: infrastructure/<ключ>/<год>.png. */
export const ART_BUILDINGS = ['beacons', 'gantry', 'deluge', 'service', 'rescue', 'fuel'];
/** Постройки, арт которых лежит в placeables: ключ -> каталог (файлы e<эпоха>_<год>.png). */
export const PLACEABLE_BUILDINGS = {
  weather: 'base/weather_complex',
  factory: 'workshop/manufacturing_cell',
  control: 'workshop/telemetry_post',
};
/**
 * Постройки, которые пока рисуются кодом (арта нет). Как только в ASSET_FILES появятся
 * bld_<ключ>_<год>, рендер возьмёт спрайт, а силуэт останется запасным.
 */
export const PROCEDURAL_BUILDINGS = ['logistics', 'radar', 'energy', 'observation', 'recovery'];
export const BUILDING_KEYS = [
  'beacons', 'gantry', 'deluge', 'service', 'rescue', 'fuel', 'logistics', 'factory',
  'weather', 'control', 'radar', 'energy', 'observation', 'recovery',
];

export function eraYear(era) {
  return ERA_YEARS[Math.max(0, Math.min(5, era | 0))];
}

/** Логическое имя спрайта эпохи: spriteName('core', 2) -> 'core_1998'. */
export function spriteName(base, era) {
  return `${base}_${eraYear(era)}`;
}

/** Имя спрайта постройки: buildingSpriteName('gantry', 3) -> 'bld_gantry_2015' (уровень 1..6 = эпоха 0..5). */
export function buildingSpriteName(key, level) {
  return `bld_${key}_${eraYear((level | 0) - 1)}`;
}

function buildAssetFiles() {
  const files = {};
  for (const base of ERA_SPRITES) {
    for (const year of ERA_YEARS) files[`${base}_${year}`] = `${WORLD_DIR}${base}_${year}.png`;
  }
  for (const name of FLAT_SPRITES) files[name] = `${WORLD_DIR}${name}.png`;
  for (const key of ART_BUILDINGS) {
    for (const year of ERA_YEARS) files[`bld_${key}_${year}`] = `${INFRA_DIR}${key}/${year}.png`;
  }
  for (const [key, dir] of Object.entries(PLACEABLE_BUILDINGS)) {
    ERA_YEARS.forEach((year, i) => {
      files[`bld_${key}_${year}`] = `${PLACEABLE_DIR}${dir}/e${i}_${year}.png`;
    });
  }
  files.island_start = ISLAND_FILE;
  files.aircraft_fx = { file: AIRCRAFT_FX_FILE, kind: 'json' };
  return files;
}

export const ASSET_FILES = buildAssetFiles();

// Размеры [ширина, высота] по эпохам (индекс = эпоха 0..5).
export const ERA_SPRITE_SIZES = {
  core: [[206, 425], [223, 426], [197, 435], [197, 437], [202, 440], [205, 441]],
  booster: [[218, 221], [230, 222], [228, 222], [229, 222], [219, 224], [244, 224]],
  capsule: [[167, 211], [166, 212], [178, 216], [179, 216], [186, 216], [186, 222]],
  canopy: [[252, 192], [251, 194], [243, 195], [249, 195], [248, 193], [257, 198]],
  pack: [[218, 176], [211, 176], [207, 177], [211, 178], [213, 180], [223, 179]],
  coin: [[153, 156], [157, 157], [157, 157], [157, 157], [158, 159], [156, 160]],
  fuel: [[167, 195], [158, 193], [157, 199], [164, 190], [167, 200], [165, 203]],
  repair: [[200, 159], [197, 156], [190, 162], [203, 166], [207, 162], [208, 164]],
  ring: [[175, 222], [168, 219], [167, 219], [185, 219], [171, 219], [178, 219]],
  balloon: [[183, 337], [201, 353], [208, 386], [250, 437], [244, 426], [313, 410]],
  satellite: [[222, 258], [203, 273], [214, 270], [166, 215], [250, 303], [251, 265]],
  panel: [[164, 92], [214, 108], [241, 131], [282, 132], [282, 161], [240, 169]],
  pad_moon: [[246, 123], [235, 123], [231, 125], [233, 123], [239, 132], [242, 132]],
  pad_mars: [[246, 123], [235, 123], [232, 125], [233, 125], [239, 132], [242, 134]],
  low_primary: [[247, 177], [236, 178], [247, 187], [226, 177], [248, 177], [245, 155]],
  low_multiwing: [[262, 189], [232, 189], [247, 189], [256, 190], [272, 211], [261, 199]],
  medium_passenger: [[740, 327], [251, 147], [255, 160], [261, 133], [249, 167], [259, 135]],
  medium_cargo: [[741, 363], [650, 333], [274, 169], [264, 142], [312, 157], [252, 138]],
  high_fighter: [[233, 141], [250, 141], [224, 166], [253, 146], [253, 143], [279, 181]],
  high_experimental: [[238, 130], [228, 115], [256, 135], [268, 114], [262, 113], [276, 93]],
};

export const FLAT_SPRITE_SIZES = {
  cloud_0: [361, 230], cloud_1: [363, 177], cloud_2: [385, 266], cloud_3: [313, 202],
  rock_0: [341, 340], rock_1: [306, 307], rock_2: [304, 303], rock_3: [304, 328],
  earth: [320, 321], moon: [310, 311],
  terrain_moon: [729, 174], terrain_mars: [728, 185],
  base_drone_0: [606, 354], base_drone_1: [738, 365],
};

/** Размер подготовленного PNG [w, h] по логическому имени ('core_1998', 'cloud_2') или undefined. */
export function spriteSize(name) {
  if (FLAT_SPRITE_SIZES[name]) return FLAT_SPRITE_SIZES[name];
  const m = /^(.+)_(\d{4})$/.exec(name);
  if (!m) return undefined;
  const era = ERA_YEARS.indexOf(Number(m[2]));
  return era < 0 ? undefined : ERA_SPRITE_SIZES[m[1]]?.[era];
}

// Измеренные якоря (доли высоты спрайта сверху), из assets/world/manifest.json.
// Площадки и грунт: точка касания колёс по вертикали.
export const PAD_LANDING_ANCHOR_Y = {
  pad_moon: [0.1382, 0.122, 0.12, 0.122, 0.1061, 0.1061],
  pad_mars: [0.1301, 0.122, 0.112, 0.12, 0.1061, 0.1119],
};
export const TERRAIN_LANDING_ANCHOR_Y = { terrain_moon: 0.2011, terrain_mars: 0.2486 };
/** Сопла: низ по центру (anchor [0.5, 1]); ступени рисуются от этой точки вверх. */
export const STAGE_ANCHOR = [0.5, 1];

/** Опорная точка спрайта в долях его размера: [ax, ay]. */
export function spriteAnchor(name) {
  if (/^(core|booster|capsule)_/.test(name) || name.startsWith('bld_')) return STAGE_ANCHOR;
  const pad = /^(pad_moon|pad_mars)_(\d{4})$/.exec(name);
  if (pad) return [0.5, PAD_LANDING_ANCHOR_Y[pad[1]][ERA_YEARS.indexOf(Number(pad[2]))]];
  if (TERRAIN_LANDING_ANCHOR_Y[name] !== undefined) return [0.5, TERRAIN_LANDING_ANCHOR_Y[name]];
  return [0.5, 0.5];
}

// Панели спутников: [левый шарнир, правый шарнир] и корень панели (доли размера спутника).
export const SATELLITE_PANELS = [
  { joints: [[0.2162, 0.5659], [0.7613, 0.5698]], root: [0.0671, 0.4674] },
  { joints: [[0.1724, 0.5568], [0.6502, 0.5568]], root: [0.0514, 0.5926] },
  { joints: [[0.1308, 0.6333], [0.7804, 0.5407]], root: [0.0496, 0.6031] },
  { joints: [[0.0843, 0.5488], [0.9036, 0.5488]], root: [0.0390, 0.5909] },
  { joints: [[0.264, 0.5677], [0.752, 0.4653]], root: [0.0426, 0.5988] },
  { joints: [[0.2470, 0.4981], [0.8008, 0.5358]], root: [0.05, 0.5621] },
];

// Вентиляторы фоновых дронов хаба: [x, y, радиус] в пикселях исходника (art/base-drones.json).
export const BASE_DRONES = [
  { name: 'base_drone_0', size: [606, 354], fans: [[301, 25, 45], [68, 115, 40], [530, 143, 40]] },
  { name: 'base_drone_1', size: [738, 365], fans: [[396, 28, 46], [134, 56, 37], [656, 57, 37], [81, 130, 39], [658, 154, 39]] },
];

// Остров и якоря построек: art/placeables/BASE_ISLAND_LAYOUT.json (version 2).
// Ось Y здесь вверх от стартового стола (как в JSON); в мире sim ось Y вниз: worldY = -y.
export const ISLAND = {
  left: -330,
  top: 510,
  width: 1650,
  waterSurfaceY: 150,
  launchOrigin: [0, 0],
};

export const BUILDING_ANCHORS = {
  beacons: { zone: 'launch_core', anchors: [[-92, 4], [92, 4]] },
  gantry: { zone: 'launch_core', anchors: [[150, 12]] },
  deluge: { zone: 'launch_core', anchors: [[235, 8]] },
  service: { zone: 'service_central', anchors: [[335, 12]] },
  rescue: { zone: 'service_central', anchors: [[445, 14]] },
  fuel: { zone: 'fuel_east', anchors: [[560, 16]] },
  logistics: { zone: 'logistics_east', anchors: [[685, 12]] },
  factory: { zone: 'industrial_east', anchors: [[815, 16]] },
  weather: { zone: 'command_north', anchors: [[760, 92]] },
  control: { zone: 'command_north', anchors: [[905, 78]] },
  radar: { zone: 'command_north', anchors: [[1035, 96]] },
  energy: { zone: 'utility_east', anchors: [[1085, 30]] },
  observation: { zone: 'perimeter_east', anchors: [[1180, 102]] },
  recovery: { zone: 'recovery_east', anchors: [[1210, 14]] },
};

// Слои движения самолётов по высоте (ед. мира) — как art/aircraft/traffic.json и live/aircraft.js.
export const AIRCRAFT_LAYERS = [
  { min: 30, max: 300, weights: { low_primary: 0.7, low_multiwing: 0.3 } },
  { min: 300, max: 600, weights: { medium_cargo: 0.5, medium_passenger: 0.35, low_primary: 0.1, low_multiwing: 0.05 } },
  { min: 600, max: 1200, weights: { medium_passenger: 0.6, medium_cargo: 0.35, high_fighter: 0.05 } },
  { min: 1200, max: 1800, weights: { high_fighter: 0.7, high_experimental: 0.3 } },
  { min: 1800, max: 2400, weights: { high_experimental: 1 } },
];
export const AIRCRAFT_PREVIOUS_ERA_MIX = 0.18;
/** Ширина отрисовки самолёта (ед. мира) по линейке — DISPLAY_WIDTH из live/aircraft.js. */
export const AIRCRAFT_DISPLAY_WIDTH = {
  low_primary: 98, low_multiwing: 98, medium_passenger: 118, medium_cargo: 120, high_fighter: 105, high_experimental: 110,
};
