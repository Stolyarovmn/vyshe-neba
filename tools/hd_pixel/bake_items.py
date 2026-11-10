"""Парашют, бонусы и иконки расходников E0. Лист: canopy, pack, canister, repair, magnet. argv: root src"""
import sys
from pathlib import Path
import numpy as np
from PIL import Image
sys.path.insert(0, str(Path(__file__).parent))
import hdpixel as hp

root = Path(sys.argv[1]); src = Path(sys.argv[2])
era = root / 'game/assets/eras/e0-1978'
img = hp.key_out(Image.open(src))
parts = hp.pieces(img, min_area=1500)
print('pieces', parts)
assert len(parts) == 5, parts
pal = hp.island_palette(root)
acc = hp.accents(img, pal, n=8)
full = np.vstack([pal, acc]) if len(acc) else pal
crops = dict(zip(['canopy', 'pack', 'canister', 'repair', 'magnet'], [img.crop(b) for b in parts]))

def fit(c, maxdim):
    k = maxdim / max(c.width, c.height)
    return hp.remap(hp.resize_premul(c, (max(1, round(c.width * k)), max(1, round(c.height * k)))), full)

def icon(c, side=96):
    s = fit(c, side - 4)
    canvas = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    canvas.paste(s, ((side - s.width) // 2, (side - s.height) // 2))
    return canvas

# рантайм-спрайты (размер в мире задаёт код по пропорциям PNG)
fit(crops['canopy'], 264).save(era / 'rocket/parachute/canopy.png')
fit(crops['pack'], 72).save(era / 'rocket/parachute/pack.png')
fit(crops['canister'], 96).save(era / 'pickups/fuel.png')
fit(crops['repair'], 96).save(era / 'pickups/repair.png')
fit(crops['magnet'], 72).save(era / 'pickups/magnet.png')
# иконки магазина
icon(crops['pack']).save(era / 'icons/item_chute.png')
icon(crops['canister']).save(era / 'icons/item_canister.png')
icon(crops['repair']).save(era / 'icons/item_repair.png')
icon(crops['magnet']).save(era / 'icons/item_magnet.png')
print('ok')
