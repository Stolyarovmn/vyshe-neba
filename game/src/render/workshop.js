// Станции мастерской вокруг схемы ракеты: рисуются по бокам прямоугольника, центр остаётся свободным.
// Как и backdrop.js, работают в текущем преобразовании ctx (CSS-пиксели интерфейса).

import { STATION_SIZES, eraYear, spriteName, spriteSize } from './manifest.js';
import { ASSEMBLY_HEIGHT, ASSEMBLY_WIDTH, MODULE_VIEW, assemblyParts } from './rocket-view.js';

/** Девять модулей ракеты в порядке сборки снизу вверх. */
export const MODULE_IDS = ['engine', 'tank', 'hull', 'booster', 'capsule', 'legs', 'fins', 'parachute', 'avionics'];

/** Модули, за которые отвечает станция мастерской (рамка станции — основной хитбокс); остальные — части самой ракеты. */
export const MODULE_STATIONS = {
  engine: 'engine_test_stand',
  hull: 'hull_diagnostics',
  avionics: 'telemetry_post',
};

/** Какая ступень сборки несёт модуль: от неё берутся ширина и положение рамки. */
const MODULE_OWNER = {
  parachute: 'capsule', avionics: 'capsule', capsule: 'capsule',
  tank: 'core', hull: 'core', engine: 'core', fins: 'core', legs: 'core',
  booster: 'booster',
};
const SPREAD = { fins: 0.2, legs: 0.2 }; // лапы и стабилизаторы выступают за корпус: доля ширины ступени с каждой стороны

/** Колонки станций, снизу вверх. Имена спрайтов: bld_factory/bld_control переиспользуют арт построек. */
export const STATION_COLUMNS = {
  left: ['manufacturing_cell', 'hull_diagnostics', 'telemetry_post'],
  right: ['engine_test_stand', 'service_lift'],
};

const SPRITE_OF = {
  manufacturing_cell: (year) => `bld_factory_${year}`,
  telemetry_post: (year) => `bld_control_${year}`,
  hull_diagnostics: (year) => `station_hull_diagnostics_${year}`,
  engine_test_stand: (year) => `station_engine_test_stand_${year}`,
  service_lift: (year) => `station_service_lift_${year}`,
};

const GAP = 0.03; // доля высоты прямоугольника между станциями
const COLUMN_WIDTH = 0.27; // доля ширины прямоугольника на колонку
const MARGIN = 0.02;

/**
 * Раскладка станций в rect: { id, x, y, w, h, side } для каждой (чистая функция, без рисования).
 * Колонки прижаты к левому и правому краю, станции стоят друг над другом от низа rect.
 */
export function layoutStations(rect) {
  const out = [];
  for (const side of ['left', 'right']) {
    const ids = STATION_COLUMNS[side];
    const colW = rect.w * COLUMN_WIDTH;
    const gap = rect.h * GAP;
    const avail = rect.h * (1 - MARGIN * 2);
    const natural = ids.reduce((sum, id) => sum + (colW * STATION_SIZES[id][1]) / STATION_SIZES[id][0], 0) + gap * (ids.length - 1);
    const fit = Math.min(1, avail / natural);
    const x0 = side === 'left' ? rect.x + rect.w * MARGIN : rect.x + rect.w * (1 - MARGIN) - colW;
    let bottom = rect.y + rect.h * (1 - MARGIN);
    for (const id of ids) {
      const [sw, sh] = STATION_SIZES[id];
      const w = colW * fit;
      const h = (w * sh) / sw;
      out.push({ id, side, x: x0 + (colW - w) / 2, y: bottom - h, w, h });
      bottom -= h + gap * fit;
    }
  }
  return out;
}

/**
 * Рамка сборки по умолчанию в rect (когда UI не передал свою): по центру, пропорции ASSEMBLY_WIDTH:ASSEMBLY_HEIGHT.
 * Приблизительна — для точных рамок передавайте params.rocket (та же рамка, что идёт в drawAssembly).
 */
export function defaultRocketRect(rect) {
  const h = Math.min(rect.h * 0.8, rect.w * 1.2, 400);
  const w = (h * ASSEMBLY_WIDTH) / ASSEMBLY_HEIGHT;
  return { x: rect.x + (rect.w - w) / 2, y: rect.y + rect.h * 0.05, w, h };
}

/** Рамки ступеней сборки в координатах rocket (как drawAssembly): { booster, core, capsule } -> { x, y, w, h }. */
function stageRects(rocket, era) {
  const scale = rocket.h / ASSEMBLY_HEIGHT;
  const cx = rocket.x + rocket.w / 2;
  const out = {};
  for (const part of assemblyParts({})) {
    const size = spriteSize(spriteName(part.base, era));
    const h = part.h * scale;
    const w = size ? (h * size[0]) / size[1] : h * 0.5;
    out[part.base] = { x: cx - w / 2, y: rocket.y + rocket.h - part.bottom * scale - h, w, h };
  }
  return out;
}

/**
 * Хитбоксы девяти модулей для выносок и нажатий. params: { era, rect (рамка схемы), rocket (рамка сборки, CSS px),
 * stations (станции нарисованы? по умолчанию true) }. Возвращает { engine: { x, y, w, h, source, station, part }, ... }:
 * source 'station' — рамка станции мастерской (engine -> engine_test_stand, hull -> hull_diagnostics,
 * avionics -> telemetry_post), иначе 'rocket' — часть самой ракеты (по спрайтам капсулы, бака/корпуса, ног,
 * стабилизаторов, парашюта). part — всегда рамка узла на самой ракете, station — id станции или null.
 */
export function moduleBoxes(params) {
  const { era = 0, rect } = params;
  const rocket = params.rocket || defaultRocketRect(rect);
  const stages = stageRects(rocket, era);
  const stations = params.stations === false ? [] : layoutStations(rect);
  const out = {};
  for (const id of MODULE_IDS) {
    const owner = stages[MODULE_OWNER[id]];
    const [t0, t1] = MODULE_VIEW[id].region;
    const spread = owner.w * (SPREAD[id] || 0);
    const y0 = rocket.y + t0 * rocket.h;
    const y1 = rocket.y + t1 * rocket.h;
    const part = { x: owner.x - spread, y: y0, w: owner.w + spread * 2, h: Math.max(1, y1 - y0) };
    const stationId = MODULE_STATIONS[id] || null;
    const station = stationId ? stations.find((item) => item.id === stationId) : null;
    out[id] = station
      ? { x: station.x, y: station.y, w: station.w, h: station.h, source: 'station', station: stationId, part }
      : { ...part, source: 'rocket', station: stationId, part };
  }
  return out;
}

export function createWorkshop(painter) {
  return {
    layoutStations,
    moduleBoxes,

    /**
     * params: { era, rect:{x,y,w,h}, time, rocket?:{x,y,w,h}, stations?:boolean }. Рисует станции эпохи и возвращает их
     * рамки ([{ id, x, y, w, h, side }]) — например, для подсказок и нажатий. У массива есть свойство modules:
     * хитбокс каждого из девяти модулей (см. moduleBoxes); rocket — рамка сборки для точных рамок частей ракеты.
     */
    drawStations(ctx, params) {
      const { era = 0, rect, time = 0 } = params;
      const year = eraYear(era);
      const transform = ctx.getTransform ? ctx.getTransform() : null;
      const scale = (transform && transform.a) || 1;
      const items = layoutStations(rect);
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      for (const item of items) {
        drawShadow(ctx, item);
        const asset = painter.assets.get(SPRITE_OF[item.id](year));
        if (!asset) {
          ctx.fillStyle = 'rgba(160,190,200,0.25)';
          ctx.fillRect(item.x, item.y, item.w, item.h);
          continue;
        }
        const src = painter.source(asset, item.w * scale, item.h * scale);
        ctx.drawImage(src, item.x, item.y, item.w, item.h);
        drawIndicator(ctx, item, time);
      }
      ctx.restore();
      items.modules = moduleBoxes({ era, rect, rocket: params.rocket, stations: params.stations });
      return items;
    },
  };
}

function drawShadow(ctx, item) {
  ctx.fillStyle = 'rgba(4,8,14,0.32)';
  ctx.beginPath();
  ctx.ellipse(item.x + item.w / 2, item.y + item.h - item.h * 0.01, item.w * 0.46, Math.max(2, item.h * 0.035), 0, 0, Math.PI * 2);
  ctx.fill();
}

/** Маленький мигающий индикатор у основания станции: признак, что оборудование «живое». */
function drawIndicator(ctx, item, time) {
  const phase = (time * 0.8 + (item.x + item.y) * 0.013) % 1;
  const on = phase < 0.5;
  const size = Math.max(2, Math.round(item.w * 0.022));
  ctx.fillStyle = on ? '#8fe9a8' : '#2a4a36';
  ctx.fillRect(Math.round(item.x + item.w * 0.08), Math.round(item.y + item.h - size * 2), size, size);
}
