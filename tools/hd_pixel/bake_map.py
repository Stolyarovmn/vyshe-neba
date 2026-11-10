"""Радар и метеостанция E0 для карты: хромакей, 1:1 с пикселем острова, палитра острова. argv: root src"""
import sys
from pathlib import Path
import numpy as np
from PIL import Image
sys.path.insert(0, str(Path(__file__).parent))
import hdpixel as hp

root = Path(sys.argv[1]); src = Path(sys.argv[2])
base = root / 'game/assets/eras/e0-1978/base'
img = hp.key_out(Image.open(src))
parts = hp.pieces(img, min_area=1500)
assert len(parts) == 2, parts
pal = hp.island_palette(root)
acc = hp.accents(img, pal, n=6)
full = np.vstack([pal, acc]) if len(acc) else pal
for (name, width), bb in zip([('radar', 72), ('weather-complex', 64)], parts):
    c = img.crop(bb)
    k = width / c.width
    out = hp.remap(hp.resize_premul(c, (width, max(1, round(c.height * k)))), full)
    out.save(base / f'{name}.png')
    print(name, out.size)
