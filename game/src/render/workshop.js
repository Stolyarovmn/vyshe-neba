// Станции мастерской вокруг схемы ракеты: рисуются по бокам прямоугольника, центр остаётся свободным.
// Как и backdrop.js, работают в текущем преобразовании ctx (CSS-пиксели интерфейса).

import { STATION_SIZES, eraYear } from './manifest.js';

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

export function createWorkshop(painter) {
  return {
    layoutStations,

    /**
     * params: { era, rect:{x,y,w,h}, time }. Рисует станции эпохи и возвращает их рамки
     * ([{ id, x, y, w, h, side }]) — например, для подсказок и нажатий.
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
