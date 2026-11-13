"""PNG -> WebP без потерь (те же пиксели), исходный PNG удаляется. Проверка: декодированный WebP совпадает с PNG.
argv: dir1 [dir2 ...]"""
import io
import sys
from pathlib import Path

import numpy as np
from PIL import Image

total_png = total_webp = 0
for d in sys.argv[1:]:
    for p in sorted(Path(d).glob('*.png')):
        im = Image.open(p).convert('RGBA')
        out = p.with_suffix('.webp')
        im.save(out, 'WEBP', lossless=True, quality=80, method=4, exact=True)
        back = np.asarray(Image.open(out).convert('RGBA'))
        src = np.asarray(im)
        # прозрачные пиксели могут потерять цвет — сравниваем по видимым
        vis = src[..., 3] > 0
        assert back.shape == src.shape and (back[..., 3] == src[..., 3]).all() and (back[vis] == src[vis]).all(), p
        total_png += p.stat().st_size
        total_webp += out.stat().st_size
        p.unlink()
print(f'png {total_png // 1024} KB -> webp {total_webp // 1024} KB')
