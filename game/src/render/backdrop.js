// Фоны экранов (мастерская, лавка, стартовые комплексы) и станции мастерской.
//
// Рисуют в текущем преобразовании ctx (обычно CSS-пиксели, масштаб dpr уже задан интерфейсом),
// в отличие от сцен хаба и полёта, которые работают в пикселях устройства.

import { BACKDROP_ATLAS } from './manifest.js';
import { clamp } from './util.js';

const CELL_INSET = 2; // как в старой игре: 2 px по краям ячейки отрезают швы сетки

/** Ячейка [колонка, ряд] фона для вида и эпохи. */
export function backdropCell(kind, era, variant = 0) {
  switch (kind) {
    case 'workshop': {
      const e = clamp(era | 0, 0, 5);
      return { atlas: 'backdrop_interior', col: e % 3, row: Math.floor(e / 3) };
    }
    case 'shop':
      return variant === 1 ? { atlas: 'backdrop_env', col: 1, row: 0 } : { atlas: 'backdrop_env', col: 0, row: 1 };
    case 'launch-moon':
      return { atlas: 'backdrop_env', col: 1, row: 1 };
    case 'launch-earth':
    default:
      return { atlas: 'backdrop_env', col: 0, row: 0 };
  }
}

/**
 * Область исходника, которой «покрывается» прямоугольник dst (cover) без искажения пропорций.
 * zoom >= 1 приближает; focus* — точка интереса (0..1), к которой смещается обрезка.
 */
export function coverCrop(srcW, srcH, dstW, dstH, zoom = 1, focusX = 0.5, focusY = 0.5) {
  const srcAspect = srcW / srcH;
  const dstAspect = dstW / dstH;
  let w = srcW;
  let h = srcH;
  if (dstAspect > srcAspect) h = srcW / dstAspect;
  else w = srcH * dstAspect;
  const z = Math.max(1, zoom);
  w /= z;
  h /= z;
  return {
    sx: clamp((srcW - w) * focusX, 0, srcW - w),
    sy: clamp((srcH - h) * focusY, 0, srcH - h),
    sw: w,
    sh: h,
  };
}

export function createBackdrop(painter) {
  return {
    /**
     * params: { kind: 'workshop'|'shop'|'launch-earth'|'launch-moon', era, rect:{x,y,w,h}, time, dim: 0..1, variant? }.
     * Рисует панель с покрытием rect, лёгким «дыханием» света и затемнением dim.
     * Возвращает true, если нарисован арт, false — запасная заливка.
     */
    draw(ctx, params) {
      const { kind, era = 0, rect, time = 0, dim = 0 } = params;
      const cell = backdropCell(kind, era, params.variant || 0);
      const asset = painter.assets.get(cell.atlas);
      const { x, y, w, h } = rect;
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, w, h);
      ctx.clip();
      if (asset) {
        const [cols, rows] = BACKDROP_ATLAS[cell.atlas].grid;
        const cw = asset.w / cols;
        const ch = asset.h / rows;
        const breath = Math.sin(time * 0.35);
        const crop = coverCrop(cw - CELL_INSET * 2, ch - CELL_INSET * 2, w, h, 1.02 + 0.012 * (breath + 1), 0.5 + 0.03 * Math.sin(time * 0.21), 0.5);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(
          asset.img,
          cell.col * cw + CELL_INSET + crop.sx, cell.row * ch + CELL_INSET + crop.sy, crop.sw, crop.sh,
          x, y, w, h,
        );
        breathingLight(ctx, kind, rect, time);
      } else {
        ctx.fillStyle = '#243749';
        ctx.fillRect(x, y, w, h);
      }
      if (dim > 0) {
        ctx.fillStyle = `rgba(5,10,20,${clamp(dim, 0, 1).toFixed(3)})`;
        ctx.fillRect(x, y, w, h);
      }
      ctx.restore();
      return !!asset;
    },
  };
}

/** Тёплое или холодное мягкое свечение, чуть меняющее яркость: свет «дышит». */
function breathingLight(ctx, kind, rect, time) {
  const { x, y, w, h } = rect;
  const pulse = 0.5 + 0.5 * Math.sin(time * 0.9);
  const cold = kind === 'launch-moon';
  const color = cold ? '150,190,255' : '255,196,120';
  const cx = x + w * 0.5;
  const cy = y + h * (kind === 'workshop' ? 0.2 : 0.3);
  const radius = Math.max(w, h) * 0.7;
  const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
  glow.addColorStop(0, `rgba(${color},${(0.05 + 0.05 * pulse).toFixed(3)})`);
  glow.addColorStop(1, `rgba(${color},0)`);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = glow;
  ctx.fillRect(x, y, w, h);
  ctx.restore();
}
