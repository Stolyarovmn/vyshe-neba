"""Проба правила: перевести ассет в палитру острова (жёсткая альфа, без сглаживания) и положить рядом с островом.
Выход: reference.png (куски острова ×3), offenders.png (как есть ×3), remapped.png (в палитре острова ×3), palette.json."""
import sys, json
from pathlib import Path
import numpy as np
from PIL import Image

root = Path(sys.argv[1]); out = Path(sys.argv[2])
island = Image.open(root / 'shared/island/start-island.png').convert('RGB')
a = np.asarray(island).reshape(-1, 3)
cols, counts = np.unique(a, axis=0, return_counts=True)
keep = cols.sum(axis=1) > 0  # чёрный — поле за краем острова
pal = cols[keep]; cnt = counts[keep]
order = np.argsort(-cnt)
pal = pal[order]
json.dump(['#%02x%02x%02x' % tuple(int(v) for v in c) for c in pal], open(out / 'palette.json', 'w'))

def remap(im):
    rgba = np.asarray(im.convert('RGBA')).astype(int)
    rgb = rgba[..., :3].reshape(-1, 3)
    # ближайший цвет палитры (взвешенная яркость)
    w = np.array([0.30, 0.59, 0.11]) ** 0.5
    d = (((rgb[:, None, :] - pal[None, :, :]) * w) ** 2).sum(-1)
    idx = d.argmin(1)
    res = pal[idx].reshape(rgba.shape[0], rgba.shape[1], 3)
    alpha = np.where(rgba[..., 3] >= 128, 255, 0)
    return Image.fromarray(np.dstack([res, alpha]).astype(np.uint8), 'RGBA')

def on_grass(im):
    bg = Image.new('RGBA', im.size, (86, 104, 52, 255))
    bg.alpha_composite(im)
    return bg.convert('RGB')

def x3(im):
    return im.resize((im.width * 3, im.height * 3), Image.NEAREST)

def row(tiles, gap=10):
    h = max(t.height for t in tiles); w = sum(t.width for t in tiles) + gap * (len(tiles) - 1)
    r = Image.new('RGB', (w, h), (28, 26, 32)); x = 0
    for t in tiles:
        r.paste(t, (x, 0)); x += t.width + gap
    return r

ref = row([x3(island.crop(b)) for b in [(120, 330, 290, 450), (820, 300, 990, 420), (1500, 120, 1670, 240)]])
ref.save(out / 'reference.png')

names = ['eras/e0-1978/rocket/core.png', 'eras/e0-1978/pickups/coin.png', 'eras/e0-1978/base/control.png']
def half(p):
    im = Image.open(root / p).convert('RGBA')
    s = 150 / max(im.size)  # примерно как на экране
    return im.resize((max(1, round(im.width * s)), max(1, round(im.height * s))), Image.LANCZOS)
srcs = [half(n) for n in names]
row([x3(on_grass(s)) for s in srcs]).save(out / 'offenders.png')
row([x3(on_grass(remap(s))) for s in srcs]).save(out / 'remapped.png')
print('palette size', len(pal))
