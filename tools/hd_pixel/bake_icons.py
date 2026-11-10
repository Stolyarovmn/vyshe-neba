"""Иконки магазина E0 и монета: хромакей, куски слева направо, квадратный холст ICON px, палитра острова + акценты.
argv: root src outdir_icons coin_out"""
import sys
from pathlib import Path
import numpy as np
from PIL import Image
sys.path.insert(0, str(Path(__file__).parent))
import hdpixel as hp

root = Path(sys.argv[1]); src = Path(sys.argv[2]); out_icons = Path(sys.argv[3]); coin_out = Path(sys.argv[4])
ICON = 96
img = hp.key_out(Image.open(src))
parts = hp.pieces(img, min_area=1500)
print('pieces', parts)
pal = hp.island_palette(root)
acc = hp.accents(img, pal, n=8)
full = np.vstack([pal, acc]) if len(acc) else pal
print('accents', ['#%02x%02x%02x' % tuple(c) for c in acc])
names = sys.argv[5].split(',') if len(sys.argv) > 5 else ['gantry', 'control', 'factory', 'fuel', 'coin']
assert len(parts) == len(names), parts
out_icons.mkdir(parents=True, exist_ok=True)
for name, bb in zip(names, parts):
    c = img.crop(bb)
    side = ICON if name != 'coin' else 64
    k = (side - 4) / max(c.width, c.height)
    c = hp.remap(hp.resize_premul(c, (max(1, round(c.width * k)), max(1, round(c.height * k)))), full)
    canvas = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    canvas.paste(c, ((side - c.width) // 2, side - 2 - c.height if name != 'coin' else (side - c.height) // 2))
    if name == 'coin':
        canvas.save(coin_out)
    else:
        canvas.save(out_icons / f'{name}.png')
    print(name, canvas.size)

