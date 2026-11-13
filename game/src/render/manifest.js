// Каталог ассетов рендера. Чистые данные без DOM: этот файл читает и Node (tools/build.mjs, тесты).
//
// ASSET_FILES: логическое имя -> путь от корня репозитория (или { file, kind:'json' }).
// SPRITE_SIZES: размеры подготовленных PNG. Поле crop/scale из live/world-assets.js здесь не
// нужно: crop описывает вырезку из исходного листа, а лежащие в assets/world PNG уже вырезаны
// (проверено: размер файла == w,h для всех спрайтов, scale == 1 везде).
// Единицы мира: 1 ед. = 10 м; размеры отрисовки (в единицах мира) лежат в sizes.js.

import { SHOP } from '../data/shop.js';

export const ERA_YEARS = [1978, 1986, 1998, 2015, 2035, 2060];

/** Девять модулей ракеты в порядке сборки снизу вверх; общий список мастерской и иконок. */
export const MODULE_IDS = ['engine', 'tank', 'hull', 'booster', 'capsule', 'legs', 'fins', 'parachute', 'avionics'];
/** Необязательные иконки расходников E0 используют реальные id лавки. */
export const E0_ITEM_ICON_IDS = SHOP.map((item) => item.id);

// Раскладка game/assets: shared/ — общее для всех эпох; eras/e<N>-<год>/ — по эпохам, внутри эпохи по темам:
//   rocket (ядро, ступень, капсула, parachute), base (постройки базы), workshop (станции мастерской),
//   aircraft, aerostats, orbital (спутники), pickups (монеты, топливо, ремкомплекты, магниты, кольца), environment.
export const ASSET_ROOT = 'game/assets/';
const SHARED = `${ASSET_ROOT}shared/`;
/** Ракурсы подъёма камеры база → полёт (градусы над горизонтом), файлы shared/island/tilt-<угол>.webp, раскладка tilt.json. */
export const TILT_ANGLES = [44, 48, 52, 56, 60, 64, 68, 73];
export const eraFolder = (eraIndex) => `${ASSET_ROOT}eras/e${eraIndex}-${ERA_YEARS[eraIndex]}/`;

/** Тема и файл спрайта эпохи по базовому имени: имя_ГОД -> eras/e<N>-<год>/<тема>/<файл>.png */
const ERA_SPRITE_PLACE = {
  core: 'rocket/core', booster: 'rocket/booster', capsule: 'rocket/capsule',
  stack_booster: 'rocket/stack_booster', stack_core: 'rocket/stack_core', stack_capsule: 'rocket/stack_capsule',
  ring_h_back: 'pickups/ring_h_back', ring_h_front: 'pickups/ring_h_front',
  canopy: 'rocket/parachute/canopy', pack: 'rocket/parachute/pack',
  low_primary: 'aircraft/low-primary', low_multiwing: 'aircraft/low-multiwing',
  medium_passenger: 'aircraft/medium-passenger', medium_cargo: 'aircraft/medium-cargo',
  high_fighter: 'aircraft/high-fighter', high_experimental: 'aircraft/high-experimental',
  satellite: 'orbital/satellite', panel: 'orbital/satellite-panel',
  coin: 'pickups/coin', fuel: 'pickups/fuel', repair: 'pickups/repair', ring: 'pickups/ring', magnet: 'pickups/magnet',
  pad_moon: 'environment/pad-moon', pad_mars: 'environment/pad-mars',
  outpost_moon: 'environment/outpost-moon', outpost_mars: 'environment/outpost-mars',
};
/** Спрайты, нужные не во всех эпохах: площадки E0 и E5 берут early/future, поэтому годовые версии только для E1–E4. */
const ERA_RANGE = { pad_moon: [1, 4], pad_mars: [1, 4] };
/** Спрайты природы и фона без эпох. */
const FLAT_PLACE = {
  cloud_0: 'nature/cloud-0', cloud_1: 'nature/cloud-1', cloud_2: 'nature/cloud-2', cloud_3: 'nature/cloud-3',
  rock_0: 'nature/rock-0', rock_1: 'nature/rock-1', rock_2: 'nature/rock-2', rock_3: 'nature/rock-3',
  earth: 'nature/earth', moon: 'nature/moon', terrain_moon: 'nature/terrain-moon', terrain_mars: 'nature/terrain-mars',
  base_drone_0: 'base-drones/base-drone-0', base_drone_1: 'base-drones/base-drone-1',
};
/** Крайние эпохи: имя -> [индекс эпохи, тема/файл]. */
const EXTREME_PLACE = {
  pad_moon_early: [0, 'environment/pad-moon-early'], pad_moon_future: [5, 'environment/pad-moon-future'],
  pad_mars_early: [0, 'environment/pad-mars-early'], pad_mars_future: [5, 'environment/pad-mars-future'],
};

/** Файл мирового спрайта по логическому имени (name_ГОД, плоское имя или крайняя эпоха). */
export function worldSpriteFile(name) {
  const hd = /^bld_([a-z]+)_1978$/.exec(name);
  if (hd) return `${eraFolder(0)}base/${hd[1]}.png`;
  if (FLAT_PLACE[name]) return `${SHARED}${FLAT_PLACE[name]}.png`;
  if (EXTREME_PLACE[name]) return `${eraFolder(EXTREME_PLACE[name][0])}${EXTREME_PLACE[name][1]}.png`;
  const balloon = /^balloon_(\d{4})_(envelope|pod)$/.exec(name);
  if (balloon) return `${eraFolder(ERA_YEARS.indexOf(Number(balloon[1])))}aerostats/balloon-${balloon[2]}.png`;
  const m = /^(.*)_(\d{4})$/.exec(name);
  if (!m || !ERA_SPRITE_PLACE[m[1]]) throw new Error(`неизвестный спрайт ${name}`);
  return `${eraFolder(ERA_YEARS.indexOf(Number(m[2])))}${ERA_SPRITE_PLACE[m[1]]}.png`;
}

export const ISLAND_FILE = `${SHARED}island/start-island.png`;
export const ISLAND_LAND_FILE = `${SHARED}island/start-island.land.json`;
// Фоны экранов: атласы по эпохам (сетки в BACKDROP_ATLAS).
export const BACKDROP_INTERIOR_FILE = `${SHARED}backdrops/interior-eras.webp`;
export const BACKDROP_ENV_FILE = `${SHARED}backdrops/environments.webp`;
export const BACKDROP_BASE_FILE = `${SHARED}backdrops/base-eras.webp`;
export const AIRCRAFT_FX_FILE = `${SHARED}effects/aircraft-effects.json`;

/** Спрайты, у которых есть вариант на каждую эпоху: имя_ГОД. */
export const ERA_SPRITES = [
  'core', 'booster', 'capsule', 'canopy', 'pack', 'coin', 'fuel', 'repair', 'ring',
  'satellite', 'panel', 'pad_moon', 'pad_mars', 'magnet', 'outpost_moon', 'outpost_mars',
  'low_primary', 'low_multiwing', 'medium_passenger', 'medium_cargo', 'high_fighter', 'high_experimental',
];
/** Спрайты природы и фона без эпох. */
export const FLAT_SPRITES = [
  'cloud_0', 'cloud_1', 'cloud_2', 'cloud_3', 'rock_0', 'rock_1', 'rock_2', 'rock_3',
  'earth', 'moon', 'terrain_moon', 'terrain_mars', 'base_drone_0', 'base_drone_1',
  'pad_moon_early', 'pad_moon_future', 'pad_mars_early', 'pad_mars_future',
];
/** Шары собираются из двух частей: оболочка и гондола (balloon_ГОД_envelope / balloon_ГОД_pod). */
export const BALLOON_PARTS = ['envelope', 'pod'];
/** Необязательный арт: отсутствие файла сохраняет прежнюю отрисовку. */
export const OPTIONAL_ERA_SPRITES = ['stack_booster', 'stack_core', 'stack_capsule', 'ring_h_back', 'ring_h_front'];
/** Постройки с готовым артом: infrastructure/<ключ>/<год>.png. */
export const ART_BUILDINGS = ['beacons', 'gantry', 'deluge', 'service', 'rescue', 'fuel'];
/** Постройки базы: ключ -> файл в eras/e<N>-<год>/base/<ключ>.png. */
export const PLACEABLE_BUILDINGS = {
  weather: 'base/weather-complex',
  factory: 'base/factory',
  control: 'base/control',
};
/** Станции мастерской вокруг схемы ракеты: id -> eras/e<N>-<год>/workshop/<файл>.png. */
export const STATION_DIRS = {
  service_lift: 'workshop/service-lift',
  engine_test_stand: 'workshop/engine-test-stand',
  hull_diagnostics: 'workshop/hull-diagnostics',
};
/** Размеры [w, h] PNG станций (одинаковы для всех эпох). */
export const STATION_SIZES = {
  service_lift: [190, 230],
  engine_test_stand: [190, 126],
  hull_diagnostics: [184, 220],
  manufacturing_cell: [176, 134],
  telemetry_post: [156, 124],
};
/** Размеры фонов [w, h] и сетки [колонки, ряды]. */
export const BACKDROP_ATLAS = {
  backdrop_interior: { size: [1774, 887], grid: [3, 2] },
  backdrop_env: { size: [1536, 1024], grid: [2, 2] },
  backdrop_base: { size: [1774, 887], grid: [3, 2] },
};

/**
 * Постройки, которые пока рисуются кодом (арта нет). Как только в ASSET_FILES появятся
 * bld_<ключ>_<год>, рендер возьмёт спрайт, а силуэт останется запасным.
 */
export const PROCEDURAL_BUILDINGS = ['logistics', 'radar', 'energy', 'observation', 'recovery'];
/**
 * HD-спрайты построек эпохи E0 (bld_<ключ>_1978, art/gen/runtime): низ по центру, высота на острове — BUILDING_ANCHORS[key].size.
 * Размеры [w, h] PNG. Для остальных эпох остаются прежние файлы infrastructure/ и программные силуэты.
 */
export const E0_BUILDING_SIZES = {
  // Срез HD-пикселя: PNG запечены 1:1 с пикселем острова (размер PNG = e0.size), палитра острова, альфа 0/255.
  // 2026-11-11: постройки перерисованы для камеры полёта (tools/hd_pixel/bake_top.py); ширина = ширине iso-спрайта той же постройки.
  beacons: [319, 644], gantry: [90, 208], deluge: [100, 180], service: [110, 140], rescue: [110, 155], fuel: [110, 108],
  logistics: [120, 150], radar: [70, 107], energy: [95, 91], observation: [60, 90], recovery: [110, 110],
};
/**
 * ON-клипы построек E0: кадр 0 — обычный спрайт, кадры 1..N-1 того же размера и с той же привязкой.
 * sequence — порядок кадров за один показ, fps — частота. Клип играет один раз по событию хаба (завершение стройки,
 * нажатие на постройку) и не зацикливается; при «меньше движения» не играет.
 * С 2026-11-12 изометрическая база играет клипы из частей самих спрайтов (render/iso-clips.js, ASSET_STATE_SPEC §6) и эту
 * покадровую спеку не использует; она остаётся для прежнего хаба сверху. Кадры вида сверху (base/anim/) сняты
 * 2026-11-11 вместе с перерисовкой построек для камеры полёта: к новым спрайтам они не подходят; без кадров
 * рисуется статичный спрайт (drawBuilding берёт базовое имя, если кадра нет).
 */
export const E0_BUILDING_CLIPS = {
  control: { frames: 4, fps: 8, sequence: [0, 1, 2, 3, 3, 3, 2, 1, 0] },
  logistics: { frames: 7, fps: 10, sequence: [0, 1, 2, 3, 4, 5, 6, 5, 4, 3, 2, 1, 0] },
  recovery: { frames: 5, fps: 10, sequence: [0, 1, 2, 3, 4, 3, 2, 1, 0] },
  factory: { frames: 7, fps: 10, sequence: [0, 1, 2, 3, 4, 5, 6, 5, 4, 3, 2, 1, 0] },
  fuel: { frames: 5, fps: 10, sequence: [0, 1, 2, 3, 4, 3, 2, 1, 0] },
  deluge: { frames: 5, fps: 8, sequence: [0, 1, 2, 3, 4, 3, 2, 1, 0] },
  rescue: { frames: 7, fps: 10, sequence: [0, 1, 2, 3, 4, 5, 6, 5, 4, 3, 2, 1, 0] },
  energy: { frames: 4, fps: 8, sequence: [0, 1, 2, 3, 3, 3, 2, 1, 0] },
};

/**
 * Плиты подземных трасс E0 (в пикселях острова). Магистрали идут под землёй (решение владельца, BI_GANTRY_E0.md, BI_DELUGE_E0.md),
 * на поверхности видны только стальные крышки траншей заподлицо. Трасса показывается, пока куплена и достроена постройка requires.
 */
export const E0_TRENCH_ROUTES = [
  { id: 'fuel', requires: 'gantry', points: [[448, 335], [448, 363]], corners: [] },
  { id: 'cooling', requires: 'deluge', points: [[513, 447], [513, 483], [455, 483], [455, 473]], corners: [[513, 483], [455, 483]] },
];

/** Поддон с ящиками у логистического терминала: показывается, пока есть активный контракт (contractSlots терминала). */
export const E0_CRATE_PALLET = { anchor: [1228, 472], width: 10 };

/** Имя спрайта кадра клипа постройки E0: 'bld_control_1978_on2' (кадр 0 — сам bld_control_1978). */
export function buildingClipFrameName(key, index) {
  return `bld_${key}_${ERA_YEARS[0]}${index > 0 ? `_on${index}` : ''}`;
}

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

/**
 * Битые PNG: эпохи, для которых целого спрайта нет (ошибка контрольных сумм в исходнике). Рендер берёт ближайшую целую
 * эпоху. Когда арт перегенерируют, запись удаляют.
 */
export const BROKEN_PLACEABLE_ERAS = {
  'workshop/service-lift': [2, 3, 5],
  'base/factory': [1],
  'base/control': [2],
};

/** Файл постройки/станции по теме и эпохе 0..5 с подменой битых файлов ближайшей целой эпохой. */
export function placeableFile(place, eraIndex) {
  const broken = BROKEN_PLACEABLE_ERAS[place] || [];
  let index = eraIndex;
  for (let step = 1; broken.includes(index) && step < ERA_YEARS.length; step++) {
    const lower = eraIndex - step;
    const higher = eraIndex + step;
    if (lower >= 0 && !broken.includes(lower)) index = lower;
    else if (higher < ERA_YEARS.length && !broken.includes(higher)) index = higher;
  }
  return `${eraFolder(index)}${place}.png`;
}

/** UI-спрайты эпохи E0 (образцы референса controls-displays): грибовидная кнопка и чёрный диск. */
export const UI_SPRITES = ['redbtn', 'dial'];

function buildAssetFiles() {
  const files = {};
  for (const n of UI_SPRITES) files[`ui_${n}`] = `game/assets/ui/e0/${n}.png`;
  for (const base of ERA_SPRITES) {
    const [from, to] = ERA_RANGE[base] || [0, ERA_YEARS.length - 1];
    for (let e = from; e <= to; e++) files[`${base}_${ERA_YEARS[e]}`] = worldSpriteFile(`${base}_${ERA_YEARS[e]}`);
  }
  for (const name of FLAT_SPRITES) files[name] = worldSpriteFile(name);
  for (const year of ERA_YEARS) {
    for (const part of BALLOON_PARTS) files[`balloon_${year}_${part}`] = worldSpriteFile(`balloon_${year}_${part}`);
  }
  for (const key of ART_BUILDINGS) {
    ERA_YEARS.forEach((year, i) => {
      files[`bld_${key}_${year}`] = `${eraFolder(i)}base/${key}.png`;
    });
  }
  for (const key of PROCEDURAL_BUILDINGS) {
    // у программных построек арт есть только для E0; для остальных эпох рисуется силуэт кодом
    if (key in E0_BUILDING_SIZES) files[`bld_${key}_${ERA_YEARS[0]}`] = worldSpriteFile(`bld_${key}_${ERA_YEARS[0]}`);
  }
  for (const [key, place] of Object.entries(PLACEABLE_BUILDINGS)) {
    ERA_YEARS.forEach((year, i) => {
      files[`bld_${key}_${year}`] = placeableFile(place, i);
    });
  }
  for (const [id, place] of Object.entries(STATION_DIRS)) {
    ERA_YEARS.forEach((year, i) => {
      files[`station_${id}_${year}`] = placeableFile(place, i);
    });
  }
  files.backdrop_interior = BACKDROP_INTERIOR_FILE;
  files.backdrop_env = BACKDROP_ENV_FILE;
  files.backdrop_base = BACKDROP_BASE_FILE;
  files.island_start = ISLAND_FILE;
  files.island_land = { file: ISLAND_LAND_FILE, kind: 'json' };
  files.aircraft_fx = { file: AIRCRAFT_FX_FILE, kind: 'json' };
  return files;
}

export const ASSET_FILES = {
  ...buildAssetFiles(),
  island_base_iso: { file: `${SHARED}island/base-iso.png`, optional: true },
  base_iso_layout: { file: `${SHARED}island/base-iso.json`, kind: 'json', optional: true },
  // Подъём камеры база → полёт: промежуточные ракурсы острова (tools/hd_pixel/bake_tilt.py), кадры в tilt.json.
  // 8 ракурсов через 4° (2026-11-12): соседние кадры почти совпадают, растворение одного в другом не «двоит» остров.
  ...Object.fromEntries(TILT_ANGLES.map((a) => [`island_tilt_${a}`, { file: `${SHARED}island/tilt-${a}.webp`, optional: true }])),
  island_tilt_layout: { file: `${SHARED}island/tilt.json`, kind: 'json', optional: true },
  // изометрия построек по уровню: ур.N — папка эпохи N−1 (ур.1 — e0-1978/iso, ур.2 — e1-1986/iso, …); без файла уровня
  // хаб берёт младший уровень (hub-iso.js isoBuildingSprite)
  ...Object.fromEntries(ERA_YEARS.flatMap((year, era) => BUILDING_KEYS.map((key) => [
    `iso_${key}_${year}`, { file: `${eraFolder(era)}iso/${key}.png`, optional: true },
  ]))),
  // Детали ракеты E0 (2026-11-13): посадочные опоры трёх уровней (левая; правая — зеркально) и сопло кабины.
  rocket_leg1_1978: { file: `${eraFolder(0)}rocket/leg1.png`, optional: true },
  rocket_leg2_1978: { file: `${eraFolder(0)}rocket/leg2.png`, optional: true },
  rocket_leg3_1978: { file: `${eraFolder(0)}rocket/leg3.png`, optional: true },
  rocket_nozzle_capsule_1978: { file: `${eraFolder(0)}rocket/nozzle_capsule.png`, optional: true },
  // Объекты-входы изометрической базы (ангар, доска, лавка, памятник) — те же ключи, что ENTRY_KEYS ниже.
  ...Object.fromEntries(['workshop', 'board', 'shop', 'monument'].map((key) => [
    `iso_entry_${key}_1978`, { file: `${eraFolder(0)}iso/entry_${key}.png`, optional: true },
  ])),
  // Изометрические клипы используют только свои кадры, никогда кадры старой камеры.
  ...Object.fromEntries(Object.entries(E0_BUILDING_CLIPS).flatMap(([key, clip]) =>
    Array.from({ length: clip.frames - 1 }, (_, i) => [
      `iso_${key}_1978_on${i + 1}`, { file: `${eraFolder(0)}iso/anim/${key}_on${i + 1}.png`, optional: true },
    ]))),
  ...Object.fromEntries(OPTIONAL_ERA_SPRITES.flatMap((base) => ERA_YEARS.map((year, era) => [
    `${base}_${year}`, { file: worldSpriteFile(spriteName(base, era)), optional: true },
  ]))),
  ...Object.fromEntries(BUILDING_KEYS.map((key) => [
    `icon_${key}_1978`, { file: `${eraFolder(0)}icons/${key}.png`, optional: true },
  ])),
  ...Object.fromEntries(MODULE_IDS.map((id) => [
    `icon_module_${id}_1978`, { file: `${eraFolder(0)}icons/module_${id}.png`, optional: true },
  ])),
  ...Object.fromEntries(E0_ITEM_ICON_IDS.map((id) => [
    `icon_item_${id}_1978`, { file: `${eraFolder(0)}icons/item_${id}.png`, optional: true },
  ])),
  deluge_nozzle_1978: `${eraFolder(0)}base/deluge-nozzle.png`,
  pad_gate_pedestal_1978: `${eraFolder(0)}base/pad-gate-pedestal.png`,
  pad_gate_receiver_1978: `${eraFolder(0)}base/pad-gate-receiver.png`,
  deluge_manifold_1978: `${eraFolder(0)}base/deluge-manifold.png`,
  deluge_outlet_1978: `${eraFolder(0)}base/deluge-outlet.png`,
  gantry_inlet_1978: `${eraFolder(0)}base/gantry-inlet.png`,
  beacons_junction_1978: `${eraFolder(0)}base/beacons-junction.png`,
  feeder_pole_1978: `${eraFolder(0)}base/feeder-pole.png`,
  entry_shop_1978: `${eraFolder(0)}base/entry-shop.png`,
  entry_board_1978: `${eraFolder(0)}base/entry-contract-board.png`,
  trench_plate_h_1978: `${eraFolder(0)}base/trench-plate-h.png`,
  trench_plate_v_1978: `${eraFolder(0)}base/trench-plate-v.png`,
  trench_plate_corner_1978: `${eraFolder(0)}base/trench-plate-corner.png`,
  crate_pallet_1978: `${eraFolder(0)}base/crate-pallet.png`,
};

// Размеры [ширина, высота] по эпохам (индекс = эпоха 0..5).
export const ERA_SPRITE_SIZES = {
  core: [[206, 425], [223, 426], [197, 435], [197, 437], [202, 440], [205, 441]],
  booster: [[218, 221], [230, 222], [228, 222], [229, 222], [219, 224], [244, 224]],
  capsule: [[167, 211], [166, 212], [178, 216], [179, 216], [186, 216], [186, 222]],
  canopy: [[264, 122], [251, 194], [243, 195], [249, 195], [248, 193], [257, 198]],
  pack: [[72, 53], [211, 176], [207, 177], [211, 178], [213, 180], [223, 179]],
  coin: [[64, 64], [157, 157], [157, 157], [157, 157], [158, 159], [156, 160]],
  fuel: [[77, 96], [158, 193], [157, 199], [164, 190], [167, 200], [165, 203]],
  repair: [[96, 78], [197, 156], [190, 162], [203, 166], [207, 162], [208, 164]],
  ring: [[175, 222], [168, 219], [167, 219], [185, 219], [171, 219], [178, 219]],
  satellite: [[222, 258], [203, 273], [214, 270], [166, 215], [250, 303], [251, 265]],
  panel: [[164, 92], [214, 108], [241, 131], [282, 132], [282, 161], [240, 169]],
  pad_moon: [[246, 123], [235, 123], [231, 125], [233, 123], [239, 132], [242, 132]],
  pad_mars: [[246, 123], [235, 123], [232, 125], [233, 125], [239, 132], [242, 134]],
  low_primary: [[224, 105], [236, 178], [247, 187], [226, 177], [248, 177], [245, 155]],
  low_multiwing: [[258, 127], [232, 189], [247, 189], [256, 190], [272, 211], [261, 199]],
  medium_passenger: [[487, 167], [251, 147], [255, 160], [261, 133], [249, 167], [259, 135]],
  medium_cargo: [[477, 168], [650, 333], [274, 169], [264, 142], [312, 157], [252, 138]],
  high_fighter: [[233, 90], [250, 141], [224, 166], [253, 146], [253, 143], [279, 181]],
  high_experimental: [[238, 84], [228, 115], [256, 135], [268, 114], [262, 113], [276, 93]],
  magnet: [[70, 72], [173, 178], [165, 182], [172, 177], [194, 180], [195, 178]],
  outpost_moon: [[227, 233], [225, 309], [216, 209], [216, 271], [218, 281], [255, 281]],
  outpost_mars: [[232, 214], [222, 304], [207, 223], [224, 278], [233, 288], [250, 285]],
};

/** Размеры целого спрайта шара balloon_ГОД (в каталог не входит: шар рисуется из частей, а размеры нужны для сборки). */
export const BALLOON_FULL_SIZES = [[183, 337], [201, 353], [208, 386], [250, 437], [244, 426], [313, 410]];

/** Размеры частей шара [w, h] по эпохам и доли их рамок в целом спрайте balloon_ГОД (art/balloon-parts.json). */
export const BALLOON_PART_SIZES = {
  envelope: [[183, 177], [199, 193], [207, 204], [250, 235], [244, 332], [313, 224]],
  pod: [[53, 98], [56, 100], [70, 112], [95, 126], [84, 58], [150, 116]],
};
export const BALLOON_PART_BOXES = {
  envelope: [[0, 0, 1, 0.5252], [0, 0, 0.99, 0.5467], [0, 0, 0.9952, 0.5285], [0, 0, 1, 0.5378], [0, 0, 1, 0.7793], [0, 0, 1, 0.5463]],
  pod: [
    [0.3443, 0.7033, 0.6339, 0.9941], [0.3632, 0.7167, 0.6418, 1], [0.3413, 0.7073, 0.6779, 0.9974],
    [0.352, 0.7117, 0.732, 1], [0.332, 0.8615, 0.6762, 0.9977], [0.3003, 0.7171, 0.7796, 1],
  ],
};

export const FLAT_SPRITE_SIZES = {
  cloud_0: [361, 230], cloud_1: [363, 177], cloud_2: [385, 266], cloud_3: [313, 202],
  rock_0: [341, 340], rock_1: [306, 307], rock_2: [304, 303], rock_3: [304, 328],
  earth: [320, 321], moon: [310, 311],
  terrain_moon: [729, 174], terrain_mars: [728, 185],
  base_drone_0: [606, 354], base_drone_1: [738, 365],
  pad_moon_early: [675, 220], pad_moon_future: [691, 257], pad_mars_early: [667, 218], pad_mars_future: [704, 264],
  ui_redbtn: [330, 353], ui_dial: [268, 266],
};

/** Размер подготовленного PNG [w, h] по логическому имени ('core_1998', 'cloud_2') или undefined. */
export function spriteSize(name) {
  if (FLAT_SPRITE_SIZES[name]) return FLAT_SPRITE_SIZES[name];
  const building = /^bld_([a-z]+)_1978$/.exec(name);
  if (building && E0_BUILDING_SIZES[building[1]]) return E0_BUILDING_SIZES[building[1]];
  const part = /^balloon_(\d{4})_(envelope|pod)$/.exec(name);
  if (part) {
    const era = ERA_YEARS.indexOf(Number(part[1]));
    return era < 0 ? undefined : BALLOON_PART_SIZES[part[2]][era];
  }
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
/** Площадки крайних эпох: pad_*_early (E0) и pad_*_future (E5) — длинные платформы, точка касания измерена так же. */
export const PAD_EXTREME_ANCHOR_Y = {
  pad_moon: { early: 0.4455, future: 0.2996 },
  pad_mars: { early: 0.445, future: 0.3333 },
};

/** Имя спрайта посадочной площадки: для E0 — early, для E5 — future, между ними — по году. */
export function padSpriteName(base, era) {
  const e = Math.max(0, Math.min(5, era | 0));
  return e === 0 ? `${base}_early` : e === 5 ? `${base}_future` : `${base}_${ERA_YEARS[e]}`;
}

/** Точка касания площадки (доля высоты спрайта сверху) для базы 'pad_moon'|'pad_mars' и эпохи. */
export function padLandingAnchor(base, era) {
  const e = Math.max(0, Math.min(5, era | 0));
  if (e === 0) return PAD_EXTREME_ANCHOR_Y[base].early;
  if (e === 5) return PAD_EXTREME_ANCHOR_Y[base].future;
  return PAD_LANDING_ANCHOR_Y[base][e];
}

/** Станция-база на дальнем плане Луны и Марса по эпохе. */
export function outpostSpriteName(body, era) {
  return `${body === 'mars' ? 'outpost_mars' : 'outpost_moon'}_${eraYear(era)}`;
}

/** Расходники, у которых есть спрайт эпохи (для реестра иконок интерфейса: spriteName(имя, эпоха)). */
export const CONSUMABLE_SPRITES = { magnet: 'magnet' };
/** Сопла: низ по центру (anchor [0.5, 1]); ступени рисуются от этой точки вверх. */
export const STAGE_ANCHOR = [0.5, 1];

/** Опорная точка спрайта в долях его размера: [ax, ay]. */
export function spriteAnchor(name) {
  if (/^(stack_)?(core|booster|capsule)_/.test(name) || name.startsWith('bld_')) return STAGE_ANCHOR;
  const pad = /^(pad_moon|pad_mars)_(\d{4})$/.exec(name);
  if (pad) return [0.5, PAD_LANDING_ANCHOR_Y[pad[1]][ERA_YEARS.indexOf(Number(pad[2]))]];
  const extreme = /^(pad_moon|pad_mars)_(early|future)$/.exec(name);
  if (extreme) return [0.5, PAD_EXTREME_ANCHOR_Y[extreme[1]][extreme[2]]];
  if (/^(outpost_moon|outpost_mars)_/.test(name)) return STAGE_ANCHOR;
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

// Остров и якоря построек: art/placeables/BASE_ISLAND_LAYOUT.json (version 3, генерируется game/tools/island-layout.py).
// Арт — HD-остров (вид сверху-3/4, 1916x821). Якоря и размеры — в пикселях острова (ось Y вниз), якорь —
// низ спрайта по центру; мировые единицы отсчитываются от центра стартовой площадки (там стоит ракета).
export const ISLAND = {
  width: 1916,
  height: 821,
  launchOrigin: [388, 375],
  unitsPerPx: 0.665, // октагон площадки 256 px = 170 ед. (ширина посадочной зоны sim)
  padCore: { center: [388, 375], radius: 52, trench: [372, 403, 405, 486] },
};
ISLAND.widthUnits = ISLAND.width * ISLAND.unitsPerPx;
ISLAND.heightUnits = ISLAND.height * ISLAND.unitsPerPx;
ISLAND.leftUnits = -ISLAND.launchOrigin[0] * ISLAND.unitsPerPx;
ISLAND.topUnits = -ISLAND.launchOrigin[1] * ISLAND.unitsPerPx;

// anchors: [[x, y], ...] px острова; size: видимый спрайт [w, h] px; footprint: след на земле [w, глубина] px.
export const BUILDING_ANCHORS = {
  beacons: {
    zone: 'launch_core', anchors: [[284, 396], [492, 396]], size: [44, 89], footprint: [40, 16],
    e0: {
      anchors: [[284, 396], [492, 396]], size: [4, 7], footprint: [4, 3.5],
      lamp: [2.5 / 4, 0.5 / 7], smooth: false,
    },
  },
  gantry: {
    zone: 'launch_core', anchors: [[484, 267]], size: [125, 190], footprint: [108, 32],
    e0: { anchors: [[458, 330]], size: [90, 208], footprint: [90, 66] },
  },
  deluge: {
    zone: 'launch_core', anchors: [[526, 528]], size: [122, 150], footprint: [105, 30],
    e0: { anchors: [[542, 461]], size: [100, 180], footprint: [100, 58] },
  },
  service: {
    zone: 'service_central', anchors: [[660, 451]], size: [140, 96], footprint: [120, 28],
    e0: { anchors: [[623, 381]], size: [110, 140], footprint: [109, 50] },
  },
  rescue: {
    zone: 'service_central', anchors: [[740, 340]], size: [139, 84], footprint: [120, 26],
    e0: { anchors: [[830, 501]], size: [110, 155], footprint: [76, 90] },
  },
  fuel: {
    zone: 'fuel_east', anchors: [[870, 470]], size: [160, 82], footprint: [138, 26],
    e0: { anchors: [[960, 457]], size: [110, 108], footprint: [69, 33] },
  },
  logistics: {
    zone: 'logistics_east', anchors: [[1200, 470]], size: [141, 125], footprint: [121, 30],
    e0: { anchors: [[1200, 470]], size: [120, 150], footprint: [120, 50] },
  },
  factory: {
    zone: 'industrial_east', anchors: [[920, 255]], size: [190, 145], footprint: [171, 34],
    e0: { anchors: [[920, 255]], size: [175, 166], footprint: [170, 108] },
  },
  weather: {
    zone: 'command_north', anchors: [[1000, 350]], size: [140, 171], footprint: [100, 28],
    e0: { anchors: [[1060, 280]], size: [60, 82], footprint: [60, 36], smooth: false },
  },
  control: {
    zone: 'command_north', anchors: [[1320, 250]], size: [170, 135], footprint: [153, 34],
    e0: { anchors: [[1320, 250]], size: [120, 141], footprint: [120, 84] },
  },
  radar: {
    zone: 'command_north', anchors: [[798, 174]], size: [150, 88], footprint: [92, 24],
    e0: { anchors: [[830, 265]], size: [70, 107], footprint: [70, 40], smooth: false },
  },
  energy: {
    zone: 'utility_east', anchors: [[1500, 380]], size: [139, 125], footprint: [120, 30],
    e0: { anchors: [[1615, 376]], size: [95, 91], footprint: [90, 50] },
  },
  observation: {
    zone: 'perimeter_east', anchors: [[1378, 378]], size: [138, 150], footprint: [119, 30],
    e0: { anchors: [[1420, 273]], size: [60, 90], footprint: [58, 55] },
  },
  recovery: {
    zone: 'recovery_east', anchors: [[1610, 478]], size: [140, 95], footprint: [120, 28],
    e0: { anchors: [[1485, 463]], size: [110, 110], footprint: [107, 44] },
  },
};

export const E0_DELUGE_NOZZLES = [
  [351, 443, 1], [426, 443, -1],
  [351, 456, 1], [426, 456, -1],
];

// Объекты-входы в мире (не покупаются): тап открывает экран. Раздел entries в BASE_ISLAND_LAYOUT.json.
export const ENTRY_KEYS = ['workshop', 'board', 'shop', 'monument'];
export const WORLD_ENTRIES = {
  workshop: { zone: 'launch_core', anchors: [[330, 262]], size: [130, 157], footprint: [114, 28],
    e0Scale: 0.3, e0Anchor: [365, 270] },
  monument: { zone: 'launch_core', anchors: [[232, 276]], size: [50, 120], footprint: [44, 22],
    e0Size: [14, 12], e0Anchor: [295, 307] },
  board: { zone: 'launch_core', anchors: [[210, 352]], size: [78, 72], footprint: [60, 20],
    e0Scale: 0.2, e0Anchor: [225, 360], e0Sprite: 'entry_board_1978', e0Size: [13, 7] },
  shop: { zone: 'launch_core', anchors: [[578, 352]], size: [120, 98], footprint: [110, 30],
    e0Scale: 0.3, e0Anchor: [542, 369], e0Sprite: 'entry_shop_1978', e0Size: [30, 18] },
};

// Дороги острова (пиксели острова): по ним ездят машины и летают дроны.
export const ISLAND_ROADS = [
  { id: 'east', points: [[525, 392], [745, 392], [745, 338]] },
];

/** Ширина отрисовки самолёта (ед. мира) по линейке — DISPLAY_WIDTH из live/aircraft.js. */
export const AIRCRAFT_DISPLAY_WIDTH = {
  low_primary: 98, low_multiwing: 98, medium_passenger: 118, medium_cargo: 120, high_fighter: 105, high_experimental: 110,
};
