#!/usr/bin/env python3
"""Числовая сверка силуэтов runtime-спрайтов E0 (единообразие камеры, симметрия, трапеция).

Это грубая проверка по альфа-маске, а не замена source gate `production_guard.py` и не замена просмотру глазами:
флаги отправляют спрайт на осмотр, вердикт ставит человек. Метрики:

* sym        — пересечение/объединение маски и её зеркала по вертикальной оси (1,00 — зеркальный силуэт; у зданий с
               несимметричным оборудованием значение законно ниже, у повёрнутых к камере — заметно ниже);
* cx         — центр масс по ширине (0,5 — по оси);
* slab_far_near — ширина маски на строке дальней кромки плиты / ширина на ближней строке (порог источника 0,94–0,99;
               считается только там, где плита образует контур; строка дальней кромки — первая строка шире 0,8 максимума);
* axis_aligned — эвристика: у фронтального здания верхняя и нижняя строки плиты вертикальны по краям (края масок
               смещаются меньше 6 % ширины между строками 25 % и 75 % высоты). Повёрнутый к камере спрайт даёт параллелограмм.

python tools/art_pipeline/e0_geometry_audit.py [--root art/gen/placeables/base] [--md]
"""
import argparse
import sys
from pathlib import Path

import numpy as np
from PIL import Image


def metrics(path: Path) -> dict:
    a = np.array(Image.open(path).convert('RGBA'))[:, :, 3] > 0
    ys, xs = np.where(a)
    x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
    crop = a[y0:y1 + 1, x0:x1 + 1]
    h, w = crop.shape
    flip = crop[:, ::-1]
    sym = (crop & flip).sum() / max(1, (crop | flip).sum())
    cx = (np.where(crop)[1].mean() + 0.5) / w
    rw = crop.sum(axis=1)
    far = int(np.argmax(rw >= 0.8 * rw.max()))
    near = rw[-2:].mean()
    slab = float(rw[far:far + 2].mean() / near) if near else 0.0
    if not 0.8 <= slab <= 1.2:
        slab = None  # плита не образует контур (мачта, крыша, оборудование выше плиты): метрика не применима

    def edges(row):
        c = np.where(crop[row])[0]
        return (c.min(), c.max()) if len(c) else (0, 0)

    ra, rb = int(h * 0.25), int(h * 0.75)
    (l1, r1), (l2, r2) = edges(ra), edges(rb)
    drift = max(abs(l1 - l2), abs(r1 - r2)) / w
    return {'w': int(w), 'h': int(h), 'sym': round(float(sym), 3), 'cx': round(float(cx), 3),
            'slab_far_near': None if slab is None else round(slab, 3), 'edge_drift': round(float(drift), 3), 'axis_aligned': bool(drift < 0.06)}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--root', default='art/gen/placeables/base')
    ap.add_argument('--md', action='store_true', help='таблица Markdown')
    args = ap.parse_args()
    rows = []
    for d in sorted(Path(args.root).iterdir()):
        p = d / 'e0_1978.runtime.png'
        if p.exists():
            rows.append((d.name, metrics(p)))
    if not rows:
        print('нет e0_1978.runtime.png в', args.root, file=sys.stderr)
        return 1
    if args.md:
        print('| Каталог | Видимая область | sym | cx | дальн./ближн. плиты | дрейф краёв | по оси камеры |')
        print('| --- | --- | --- | --- | --- | --- | --- |')
    for name, m in rows:
        if args.md:
            print(f"| `{name}` | {m['w']}×{m['h']} | {m['sym']} | {m['cx']} | {'—' if m['slab_far_near'] is None else m['slab_far_near']} | {m['edge_drift']} | {'да' if m['axis_aligned'] else '**нет**'} |")
        else:
            print(name, m)
    return 0


if __name__ == '__main__':
    sys.exit(main())
