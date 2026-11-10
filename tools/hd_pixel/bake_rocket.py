"""Р Р°РєРµС‚Р° E0 РґР»СЏ СЃСЂРµР·Р°: С…СЂРѕРјР°РєРµР№, С‚СЂРё РєСѓСЃРєР° СЃР»РµРІР° РЅР°РїСЂР°РІРѕ (booster, core, capsule), РѕР±С‰Р°СЏ С€РёСЂРёРЅР° РєРѕСЂРїСѓСЃР°,
РїР°Р»РёС‚СЂР° РѕСЃС‚СЂРѕРІР° + Р°РєС†РµРЅС‚С‹, Р¶С‘СЃС‚РєР°СЏ Р°Р»СЊС„Р°. РџР»РѕС‚РЅРѕСЃС‚СЊ РїРѕР»С‘С‚Р°: TARGET_W px РЅР° С€РёСЂРёРЅСѓ РєРѕСЂРїСѓСЃР°.
argv: root src.png outdir"""
import sys
from pathlib import Path
import numpy as np
from PIL import Image
sys.path.insert(0, str(Path(__file__).parent))
import hdpixel as hp

root = Path(sys.argv[1]); src = Path(sys.argv[2]); outdir = Path(sys.argv[3])
TARGET_W = 120  # px С€РёСЂРёРЅС‹ РєРѕСЂРїСѓСЃР° (Сѓ СЃС‚Р°СЂРѕРіРѕ СЏРґСЂР° РєРѕСЂРїСѓСЃ ~110 px РїСЂРё РІС‹СЃРѕС‚Рµ 425)

img = hp.key_out(Image.open(src))
parts = hp.pieces(img)
print('pieces', parts)
assert len(parts) == 3, parts
names = ['stack_booster', 'stack_core', 'stack_capsule']
crops = [img.crop(b) for b in parts]

def body_width(im):
    # С€РёСЂРёРЅР° РєРѕСЂРїСѓСЃР°: РјРµРґРёР°РЅР° С€РёСЂРёРЅС‹ РЅРµРїСЂРѕР·СЂР°С‡РЅС‹С… СЃС‚СЂРѕРє РІ СЃСЂРµРґРЅРµР№ С‚СЂРµС‚Рё РІС‹СЃРѕС‚С‹
    a = np.asarray(im)[..., 3] > 0
    h = a.shape[0]
    rows = a[h // 3: 2 * h // 3]
    w = [np.ptp(r.nonzero()[0]) + 1 for r in rows if r.any()]
    return float(np.median(w))

widths = [body_width(c) for c in crops]
print('body widths px', widths)
# РєР°РїСЃСѓР»Р°: РєРѕСЂРїСѓСЃ Р±РµСЂС‘Рј РїРѕ РЅРёР¶РЅРµР№ С‡РµС‚РІРµСЂС‚Рё (РІРµСЂС… вЂ” РєРѕРЅСѓСЃ)
a = np.asarray(crops[2])[..., 3] > 0
h = a.shape[0]
w_caps = [np.ptp(r.nonzero()[0]) + 1 for r in a[int(h * 0.7): int(h * 0.95)] if r.any()]
widths[2] = float(np.median(w_caps))
print('capsule body width', widths[2])

pal = hp.island_palette(root)
acc = hp.accents(img, pal, n=8)
print('accents', ['#%02x%02x%02x' % tuple(c) for c in acc])
full = np.vstack([pal, acc]) if len(acc) else pal
outdir.mkdir(parents=True, exist_ok=True)
sizes = {}
for name, c, w in zip(names, crops, widths):
    k = TARGET_W / w
    size = (max(1, round(c.width * k)), max(1, round(c.height * k)))
    res = hp.remap(hp.resize_premul(c, size), full)
    res.save(outdir / f'{name}.png')
    sizes[name] = size
print(sizes)

