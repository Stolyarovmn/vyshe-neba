// Дизайн-пространство: объект рисуется в пикселях острова с нулём в точке опоры (низ по центру)
// и масштабируется в мир множителем k. Нужен программным силуэтам построек и объектам-входам.

import { fillWorldRect } from './painter.js';

/** Вид-обёртка: sx/sy принимают дизайн-координаты, S — пикселей устройства на дизайн-единицу. */
export function designView(view, wx, wy, k) {
  return {
    S: view.S * k,
    px: view.px,
    sx: (x) => view.sx(wx + x * k),
    sy: (y) => view.sy(wy + y * k),
  };
}

/** Закрашенный прямоугольник в дизайн-координатах (края привязаны к пикселям устройства без зазоров). */
export function designRect(ctx, dv, x, y, w, h, color) {
  fillWorldRect(ctx, dv, x, y, w, h, color);
}
