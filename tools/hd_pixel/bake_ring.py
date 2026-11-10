"""Горизонтальное кольцо E0: хромакей, обрезка по краю, ширина TARGET_W, палитра острова + акценты,
разрез по средней линии на заднюю (верх) и переднюю (низ) половины на общем холсте. argv: root src outdir"""
import sys
from pathlib import Path
import numpy as np
from PIL import Image
sys.path.insert(0, str(Path(__file__).parent))
import hdpixel as hp

root = Path(sys.argv[1]); src = Path(sys.argv[2]); outdir = Path(sys.argv[3])
TARGET_W = 600
img = hp.key_out(Image.open(src))
img = img.crop(img.getbbox())
k = TARGET_W / img.width
img = hp.resize_premul(img, (TARGET_W, max(1, round(img.height * k))))
pal = hp.island_palette(root)
acc = hp.accents(img, pal, n=8)
print('accents', ['#%02x%02x%02x' % tuple(c) for c in acc])
img = hp.remap(img, np.vstack([pal, acc]) if len(acc) else pal)
# центр отверстия: средняя строка между верхним и нижним краем отверстия по центральному столбцу
a = np.asarray(img)[..., 3] > 0
col = a[:, a.shape[1] // 2]
ys = np.nonzero(col)[0]
gaps = np.nonzero(np.diff(ys) > 1)[0]
cy = (ys[gaps[0]] + ys[gaps[0] + 1]) // 2 if len(gaps) else a.shape[0] // 2
# холст симметричен относительно cy, чтобы центр кольца был в центре холста
H = 2 * max(cy, a.shape[0] - cy)
canvas = Image.new('RGBA', (img.width, H), (0, 0, 0, 0))
top = H // 2 - cy
canvas.paste(img, (0, top))
arr = np.asarray(canvas).copy()
back = arr.copy(); back[H // 2:, :, 3] = 0
front = arr.copy(); front[:H // 2, :, 3] = 0
outdir.mkdir(parents=True, exist_ok=True)
Image.fromarray(back).save(outdir / 'ring_h_back.png')
Image.fromarray(front).save(outdir / 'ring_h_front.png')
canvas.save(outdir / 'ring_h_full.png')
print('size', canvas.size, 'cy', cy, 'aspect', round(H / img.width, 3))
