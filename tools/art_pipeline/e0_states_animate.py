#!/usr/bin/env python3
"""ON-анимации оставшихся покупаемых зданий E0 из частей утверждённых спрайтов (топливо, охлаждение, спасение, энергоузел; башня и остальные см. states.json).

Метод тот же, что в e0_rework_animate.py: часть вырезается из runtime-обрезки утверждённого PNG, пустое место восстанавливается
копией ближайшего фона того же спрайта (новых цветов нет), часть сдвигается на целое число пикселей той же сетки. Для
поворотных частей (маховик вентиля) пиксели переносятся по ближайшему соседу без интерполяции, поэтому палитра не растёт.
Свет, звук, дым, пар и тень принадлежат коду.

python e0_states_animate.py --repo .
"""
import math
import sys
from pathlib import Path

import numpy as np
from scipy import ndimage

sys.path.insert(0, str(Path(__file__).resolve().parent))
import e0_rework_animate as A  # noqa: E402


def nearest_fill(arr, mask, keep=None):
    """Закрасить пиксели mask цветом ближайшего пикселя вне mask (и вне keep, если задан)."""
    ok = ~mask if keep is None else (~mask & keep)
    idx = ndimage.distance_transform_edt(~ok, return_distances=False, return_indices=True)
    out = arr.copy()
    ys, xs = np.where(mask)
    for y, x in zip(ys, xs):
        out[y, x] = arr[idx[0][y, x], idx[1][y, x]]
    return out


def rotate_part(base, mask, center, angle_deg, squash=1.0):
    """Перенос пикселей части mask поворотом вокруг center по ближайшему соседу. squash: отношение осей эллипса вращения (rx/ry)."""
    h, w = mask.shape
    cx, cy = center
    ca, sa = math.cos(math.radians(angle_deg)), math.sin(math.radians(angle_deg))
    out = np.zeros_like(base)
    placed = np.zeros(mask.shape, bool)
    ys, xs = np.where(mask)
    # прямое отображение с «заполнением дыр» через обратное: для каждого целевого пикселя ищем исходный
    x0, x1, y0, y1 = xs.min() - 3, xs.max() + 4, ys.min() - 3, ys.max() + 4
    for ty in range(max(0, y0), min(h, y1)):
        for tx in range(max(0, x0), min(w, x1)):
            dx, dy = (tx - cx), (ty - cy) * squash
            sx = ca * dx + sa * dy
            sy = -sa * dx + ca * dy
            sx, sy = sx + cx, sy / squash + cy
            ix, iy = int(round(sx)), int(round(sy))
            if 0 <= ix < w and 0 <= iy < h and mask[iy, ix]:
                out[ty, tx] = base[iy, ix]
                placed[ty, tx] = True
    return out, placed


def ellipse_mask(shape, cx, cy, rx, ry):
    yy, xx = np.mgrid[0:shape[0], 0:shape[1]]
    return ((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2 <= 1.0


def lum(a):
    return a[:, :, :3].astype(int).sum(axis=2) / 3


def warm(a):
    return a[:, :, 0].astype(int) - a[:, :, 2].astype(int)


# --- топливо: рукоять ручного насоса качается (сдвиг столбцов, «сдвиг-наклон» на целые пиксели)
def fuel(base):
    h, w = base.shape[:2]
    mask = np.zeros((h, w), bool)
    # рукоять: параллелограмм плеча и захват (границы измерены по крупному плану)
    for x in range(194, 231):
        top = int(round(33 - (x - 190) * 0.5)) if x < 205 else 22
        bot = int(round(40 - (x - 190) * 0.55)) if x < 205 else 34
        mask[top:bot + 1, x] = True
    mask &= base[:, :, 3] > 0
    tank = (base[:, :, 0] > 150) & (warm(base) > 70) & (lum(base) < 160)  # красный бак
    # на плече и захвате убираем только красный фон бака
    arm = mask & ~(tank & ~((np.arange(w)[None, :] >= 205) & (np.arange(h)[:, None] >= 22) & (np.arange(h)[:, None] <= 34)))
    clean = base.copy()
    # восстановление: красный бак слева от диагонали кромки, пустота справа (кромка бака идёт по прямой)
    ys, xs = np.where(arm)
    for y, x in zip(ys, xs):
        yref = 19 if y < 28 else 37
        sx = x - int(round(0.78 * (y - yref)))
        clean[y, x] = base[yref, sx] if base[yref, sx, 3] > 0 or True else (0, 0, 0, 0)
    seq = [0, 1, 2, 3, 4, 3, 2, 1, 0]
    frames = []
    for k in seq:
        f = clean.copy()
        for x in range(194, 231):
            col = arm[:, x]
            if not col.any():
                continue
            dy = int(round(k * (x - 194) / (230 - 194) * 1.6))
            for y in np.where(col)[0]:
                ty = y + dy
                if 0 <= ty < h:
                    f[ty, x] = base[y, x]
        frames.append(f)
    return frames, dict(part='pump_handle', box=[194, 20, 231, 42], pivot=[190, 38], motion='column_shear_y', range_px=[0, 6],
                        why='рукоять ручного насоса качается: топливо перекачивается в ракету вручную (1978 г., без электрического привода)')


# --- башня обслуживания: маховик запорного вентиля НЕ анимируется из плоского спрайта (проверено 2026-11-08).
# Попытки поворота спиц (радиус 10,8; 12,5; шаги 10–60°) ломали обод и нижние спицы, которые уходят под корпус вентиля
# и не могут вращаться отдельно от него. Нужен отдельный слой маховика (генерация части или ручная работа), см. states.json.

# --- охлаждение: маховик вентиля отвода бака поворачивается, открывая воду на защиту стола
def deluge(base):
    h, w = base.shape[:2]
    cx, cy = 36.5, 133.0
    inner = ellipse_mask(base.shape, cx, cy, 8.5, 6.5)
    part = inner
    clean = base.copy()
    frames = []
    for ang in [0, 15, 30, 45, 60]:
        rot, placed = rotate_part(base, part, (cx, cy), ang, squash=11.0 / 8.5)
        f = clean.copy()
        f[placed & inner] = rot[placed & inner]  # не покрытые поворотом пиксели остаются из опорного кадра
        frames.append(f)
    return frames, dict(part='outlet_valve_wheel', box=[26, 125, 47, 141], pivot=[36, 133], motion='rotate_nearest_ellipse', range_px=[0, 60],
                        why='маховик вентиля у отвода бака поворачивается: вода идёт на защиту стола при запуске')


# --- спасение: створка ангара уезжает влево, открывая проём для выезда машины
def rescue(base):
    box = (41, 187, 125, 204)
    dark = A.darkest_color(base)
    clean = base.copy()
    clean[box[1] + 1:box[3] - 1, box[0] + 1:box[2] - 1] = (*dark, 255)
    part = np.zeros(base.shape[:2], bool)
    part[box[1]:box[3], box[0]:box[2]] = True
    seq = [0, -5, -10, -15, -20, -25, -30, -25, -20, -15, -10, -5, 0]
    frames = []
    for dx in seq:
        f = base.copy()
        f[box[1]:box[3], box[0]:box[2]] = clean[box[1]:box[3], box[0]:box[2]]
        A.paste(f, base, part, dx, 0)
        frames.append(f)
    return frames, dict(part='hangar_door_leaf', box=list(box), pivot=[41, 187], motion='translate_x', range_px=[-30, 0],
                        why='створка ангара уезжает по рельсу, освобождая выезд спасательной машины к месту посадки')


# --- энергоузел: рычаг рубильника на щите переходит во включённое положение
def power_node(base):
    h, w = base.shape[:2]
    box = (205, 133, 223, 150)
    sub = base[box[1]:box[3], box[0]:box[2]].astype(int)
    lever = np.zeros((h, w), bool)
    lever[box[1]:box[3], box[0]:box[2]] = ((sub[:, :, 0] > 170) & (sub[:, :, 0] - sub[:, :, 2] > 110))
    lever = ndimage.binary_dilation(lever, iterations=1) & (base[:, :, 3] > 0)
    clean = nearest_fill(base, lever)
    seq = [(0, 0), (0, -1), (1, -2), (1, -3), (1, -3)]
    frames = []
    for dx, dy in seq:
        f = clean.copy()
        A.paste(f, base, lever, dx, dy)
        frames.append(f)
    return frames, dict(part='breaker_lever', box=list(box), pivot=[212, 148], motion='translate_xy_steps', range_px=[[0, 0], [1, -3]],
                        why='рычаг рубильника на щите переводится во включённое положение: узел отдаёт энергию на площадку')


JOBS = {'fuel': (fuel, 10), 'deluge': (deluge, 8), 'rescue': (rescue, 10), 'power_node': (power_node, 8)}

if __name__ == '__main__':
    A.JOBS = JOBS
    A.main()
