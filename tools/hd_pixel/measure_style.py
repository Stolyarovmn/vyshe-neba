"""Измерение «HD-пиксельности» ассетов: размер, шаг пиксельной сетки, число цветов, мягкость краёв, свет, контур."""
import sys, json, colorsys
from pathlib import Path
import numpy as np
from PIL import Image

def grid_score(a, k):
    # доля блоков k×k, где все пиксели (по RGB) почти одинаковы
    h, w = a.shape[:2]
    h2, w2 = h // k * k, w // k * k
    if h2 < k * 4 or w2 < k * 4:
        return 0.0
    b = a[:h2, :w2, :3].astype(int).reshape(h2 // k, k, w2 // k, k, 3)
    spread = b.max(axis=(1, 3)) - b.min(axis=(1, 3))
    return float((spread.max(axis=-1) <= 6).mean())

def best_grid(a):
    best = (1, 0.0)
    scores = {}
    for k in range(1, 9):
        # перебор сдвигов сетки
        s = max(grid_score(a[dy:, dx:], k) for dy in range(k) for dx in range(k)) if k > 1 else 1.0
        scores[k] = round(s, 3)
    # наибольший k, где блоки однородны хотя бы в 80 % случаев
    for k in range(8, 0, -1):
        if scores[k] >= 0.8:
            return k, scores
    return 1, scores

def measure(p):
    im = Image.open(p).convert('RGBA')
    a = np.asarray(im)
    alpha = a[..., 3]
    opaque = alpha > 200
    semi = (alpha > 10) & (alpha <= 200)
    rgb = a[..., :3][opaque]
    k, scores = best_grid(np.where(opaque[..., None], a, 0))
    cols = len(np.unique(rgb.reshape(-1, 3) // 4, axis=0)) if len(rgb) else 0
    hsv = np.array([colorsys.rgb_to_hsv(*(c / 255)) for c in rgb[:: max(1, len(rgb) // 4000)]]) if len(rgb) else np.zeros((1, 3))
    # контур: самые тёмные 3 % непрозрачных пикселей
    lum = rgb @ np.array([0.299, 0.587, 0.114]) if len(rgb) else np.zeros(1)
    dark = rgb[lum <= np.percentile(lum, 3)] if len(rgb) else np.zeros((1, 3))
    # направление света: средняя яркость левой/правой и верхней/нижней половины силуэта
    ys, xs = np.nonzero(opaque)
    L = a[..., :3].astype(float) @ np.array([0.299, 0.587, 0.114])
    lr = tb = 0.0
    if len(xs):
        cx, cy = xs.mean(), ys.mean()
        lr = float(L[ys[xs < cx], xs[xs < cx]].mean() - L[ys[xs >= cx], xs[xs >= cx]].mean())
        tb = float(L[ys[ys < cy], xs[ys < cy]].mean() - L[ys[ys >= cy], xs[ys >= cy]].mean())
    return {
        'file': str(p), 'size': list(im.size), 'grid_px': k, 'grid_scores': scores,
        'colors_q4': cols, 'semi_alpha_share': round(float(semi.sum() / max(1, (alpha > 10).sum())), 3),
        'sat_mean': round(float(hsv[:, 1].mean()), 3), 'val_mean': round(float(hsv[:, 2].mean()), 3),
        'outline_rgb': [int(v) for v in dark.mean(axis=0)] if len(dark) else None,
        'light_left_minus_right': round(lr, 1), 'light_top_minus_bottom': round(tb, 1),
    }

if __name__ == '__main__':
    out = [measure(Path(p)) for p in sys.argv[1:]]
    print(json.dumps(out, ensure_ascii=False, indent=1))
