// Раскладка кадра: ориентация, масштаб интерфейса, безопасные зоны, якорь ракеты, масштаб мира.
// Размеры layout — в CSS-пикселях; пиксельный масштаб мира `world.px` — в пикселях устройства.
// Геометрию кнопок и приборов (hud) считает ui/layout.js и накладывает на эту раскладку.

import { clamp } from './util.js';

const NO_SAFE = Object.freeze({ t: 0, r: 0, b: 0, l: 0 });

/** Масштаб интерфейса: clamp(min(w,h)/420, 1, 3). */
export function uiScale(w, h) {
  return clamp(Math.min(w, h) / 420, 1, 3);
}

// Сколько единиц мира должно умещаться по важной стороне кадра: в ландшафте по высоте,
// в портрете по ширине.
const TARGET_UNITS = {
  flight: { landscape: 400, portrait: 360 },
  hub: { landscape: 340, portrait: 280 },
};

/**
 * Целочисленный масштаб мира (пикселей устройства на единицу при zoom = 1), чтобы пиксель
 * игры всегда был целым числом пикселей экрана.
 */
export function worldPixelScale(w, h, dpr, orientation, mode) {
  const basis = (orientation === 'portrait' ? w : h) * dpr;
  return Math.max(1, Math.round(basis / TARGET_UNITS[mode][orientation]));
}

/** Масштаб мира для раскладки, у которой нет поля `world` (например, пришла из другого модуля). */
export function ensureWorld(layout) {
  if (layout.world) return layout.world;
  const orientation = layout.h > layout.w ? 'portrait' : 'landscape';
  const dpr = layout.dpr || 1;
  return {
    px: worldPixelScale(layout.w, layout.h, dpr, orientation, 'flight'),
    hubPx: worldPixelScale(layout.w, layout.h, dpr, orientation, 'hub'),
  };
}

/**
 * Layout кадра. `safe` — безопасные отступы {t,r,b,l} в CSS-пикселях.
 * rocketAnchor — где в кадре держится ракета при вертикальном движении (портрет: нижняя треть,
 * ландшафт: левая треть); rocketAnchorH — при горизонтальном (ландшафт: центр кадра).
 */
export function computeLayout(w, h, dpr = 1, safe) {
  const s = safe ? { t: safe.t || 0, r: safe.r || 0, b: safe.b || 0, l: safe.l || 0 } : { ...NO_SAFE };
  const orientation = h > w ? 'portrait' : 'landscape';
  const inner = { x: s.l, y: s.t, w: Math.max(1, w - s.l - s.r), h: Math.max(1, h - s.t - s.b) };

  const rocketAnchor = orientation === 'portrait'
    ? { x: inner.x + inner.w * 0.5, y: inner.y + inner.h * 0.64 }
    : { x: inner.x + inner.w * 0.33, y: inner.y + inner.h * 0.62 };
  const rocketAnchorH = orientation === 'portrait'
    ? { x: rocketAnchor.x, y: rocketAnchor.y }
    : { x: inner.x + inner.w * 0.5, y: inner.y + inner.h * 0.58 };

  return {
    w,
    h,
    dpr,
    orientation,
    ui: uiScale(w, h),
    safe: s,
    inner,
    rocketAnchor,
    rocketAnchorH,
    world: {
      px: worldPixelScale(w, h, dpr, orientation, 'flight'),
      hubPx: worldPixelScale(w, h, dpr, orientation, 'hub'),
    },
    hud: {},
  };
}
