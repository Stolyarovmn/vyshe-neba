"""Общий запекатель листа: куски слева направо -> файлы с заданной шириной.
argv: root src spec, spec = 'relpath:width,relpath:width,...' (relpath от game/assets/eras/e0-1978)."""
import sys
from pathlib import Path
import numpy as np
from PIL import Image
sys.path.insert(0, str(Path(__file__).parent))
import hdpixel as hp

root = Path(sys.argv[1]); src = Path(sys.argv[2])
spec = [(p.rsplit(':', 1)[0], p.rsplit(':', 1)[1]) for p in sys.argv[3].split(',')]  # ширина или ШxВ (точный холст)
era = root / 'game/assets/eras/e0-1978'
img = hp.key_out(Image.open(src))
parts = hp.pieces(img, min_area=800)
print('pieces', parts)
assert len(parts) == len(spec), (len(parts), len(spec))
pal = hp.island_palette(root)
acc = hp.accents(img, pal, n=8)
full = np.vstack([pal, acc]) if len(acc) else pal
for (rel, width), bb in zip(spec, parts):
    c = img.crop(bb)
    if 'x' in width:
        W, H = (int(v) for v in width.split('x'))
        k = min(W / c.width, H / c.height)
        s = hp.resize_premul(c, (max(1, round(c.width * k)), max(1, round(c.height * k))))
        box = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        box.paste(s, ((W - s.width) // 2, (H - s.height) // 2))
        out = hp.remap(box, full)
    else:
        w = int(width)
        out = hp.remap(hp.resize_premul(c, (w, max(1, round(c.height * w / c.width)))), full)
    out.save(era / rel)
    print(rel, out.size)
