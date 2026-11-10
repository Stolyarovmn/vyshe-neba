"""Инструменты стиль-гайда HD-пикселя: палитра острова + акценты эпохи, жёсткая альфа, вырезание фона-хромакея."""
from pathlib import Path
import numpy as np
from PIL import Image

W8 = np.array([0.30, 0.59, 0.11]) ** 0.5
_ISLAND = None


def island_palette(root):
    global _ISLAND
    if _ISLAND is None:
        im = Image.open(Path(root) / 'game/assets/shared/island/start-island.png').convert('RGB')
        cols = np.unique(np.asarray(im).reshape(-1, 3), axis=0)
        _ISLAND = cols[cols.sum(axis=1) > 0].astype(np.int32)
    return _ISLAND


def _nearest(rgb, pal):
    out = np.empty(len(rgb), dtype=np.int64)
    for i in range(0, len(rgb), 20000):
        c = rgb[i:i + 20000]
        out[i:i + 20000] = ((((c[:, None, :] - pal[None, :, :]) * W8) ** 2).sum(-1)).argmin(1)
    return out


def accents(rgba, pal, n=8, far=28.0):
    """До n акцентных цветов ассета, которых нет в палитре острова (k-средних по «далёким» пикселям)."""
    a = np.asarray(rgba).astype(np.int32)
    rgb = a[..., :3][a[..., 3] >= 128]
    if len(rgb) == 0:
        return np.zeros((0, 3), np.int32)
    idx = _nearest(rgb, pal)
    dist = np.sqrt((((rgb - pal[idx]) * W8) ** 2).sum(-1))
    fr = rgb[dist > far].astype(np.float64)
    if len(fr) < 20:
        return np.zeros((0, 3), np.int32)
    rng = np.random.default_rng(1)
    cent = fr[rng.choice(len(fr), size=min(n, len(fr)), replace=False)]
    for _ in range(12):
        lab = ((((fr[:, None, :] - cent[None]) * W8) ** 2).sum(-1)).argmin(1)
        for k in range(len(cent)):
            if (lab == k).any():
                cent[k] = fr[lab == k].mean(0)
    cent = np.round(cent).astype(np.int32)
    # пурпурные «акценты» — это ореол хромакея, не цвет ассета
    purple = (cent[:, 1] < cent[:, 0] - 40) & (cent[:, 1] < cent[:, 2] - 40)
    return cent[~purple]


def remap(rgba, pal):
    a = np.asarray(rgba).astype(np.int32)
    rgb = a[..., :3].reshape(-1, 3)
    res = pal[_nearest(rgb, pal)].reshape(a.shape[0], a.shape[1], 3)
    alpha = np.where(a[..., 3] >= 128, 255, 0)
    return Image.fromarray(np.dstack([res, alpha]).astype(np.uint8), 'RGBA')


def key_out(img, key=(255, 0, 255), tol=90):
    """Хромакей: пиксели близко к цвету фона -> прозрачные; розовый ореол по краю тоже уходит."""
    a = np.asarray(img.convert('RGBA')).astype(np.int32)
    d = np.sqrt(((a[..., :3] - np.array(key)) ** 2).sum(-1))
    magenta_ish = (a[..., 0] > 150) & (a[..., 2] > 150) & (a[..., 1] < 110)
    alpha = np.where((d < tol) | magenta_ish, 0, 255)
    a[..., 3] = alpha
    return Image.fromarray(a.astype(np.uint8), 'RGBA')


def resize_premul(img, size):
    arr = np.asarray(img.convert('RGBA')).astype(np.float32)
    arr[..., :3] *= arr[..., 3:4] / 255
    s = np.asarray(Image.fromarray(arr.clip(0, 255).astype(np.uint8), 'RGBA').resize(size, Image.LANCZOS)).astype(np.float32)
    al = s[..., 3:4]
    s[..., :3] = np.where(al > 0, s[..., :3] * 255 / np.maximum(al, 1), 0)
    return Image.fromarray(s.clip(0, 255).astype(np.uint8), 'RGBA')


def pieces(img, min_area=400):
    """Отдельные непрозрачные куски слева направо: список (bbox)."""
    a = np.asarray(img)[..., 3] > 0
    cols = a.any(axis=0)
    out, x = [], 0
    W = len(cols)
    while x < W:
        if cols[x]:
            x0 = x
            while x < W and cols[x]:
                x += 1
            sub = a[:, x0:x]
            ys = np.nonzero(sub.any(axis=1))[0]
            if sub.sum() >= min_area:
                out.append((x0, int(ys[0]), x, int(ys[-1]) + 1))
        x += 1
    return out
