"""Запекание листа построек E0 для камеры полёта (карта start-island.png): хромакей → ячейки → ширина → палитра острова.

Правило ширины: спрайт вида сверху той же ширины, что изометрический спрайт постройки (eras/e0-1978/iso/<ключ>.png);
1 px спрайта = 1 px плана острова. Тогда в полёте и на базе постройка одного размера и при подъёме камеры
(render/flight.js drawTilt) спрайты совпадают. Высота — по пропорции ячейки.

Пишет eras/e0-1978/base/<файл>.png в root и печатает новые размеры: их нужно перенести в manifest.js
(BUILDING_ANCHORS[key].e0.size, E0_BUILDING_SIZES; footprint = [min(след, ширина), глубина]).
argv: root sheet.png key1,key2,... [--dry]   (ключи — слева направо, как ячейки на листе)
Сделано так 2026-11-11 (13 построек, листы в ChatGPT по art/docs/templates/SPRITE_REQUEST.md)."""
import sys
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).parent))
import hdpixel as hp  # noqa: E402

root = Path(sys.argv[1]); sheet = Path(sys.argv[2]); keys = sys.argv[3].split(','); dry = '--dry' in sys.argv
# --era N: постройки ур.N+1 (папка эпохи N); по умолчанию E0 (2026-11-14: E1 — `--era 1`)
ERA_DIRS = ['e0-1978', 'e1-1986', 'e2-1998', 'e3-2015', 'e4-2035', 'e5-2060']
era = int(sys.argv[sys.argv.index('--era') + 1]) if '--era' in sys.argv else 0
FILE = {'weather': 'weather-complex'}
ISO_DENSITY = 3  # px iso-спрайта на px карты изометрии (write_layout.py, README)
iso_dir = root / f'game/assets/eras/{ERA_DIRS[era]}/iso'
img = hp.key_out(Image.open(sheet))
parts = hp.pieces(img, min_area=1500)
print('ячейки', len(parts), parts)
assert len(parts) == len(keys), f'{len(parts)} ячеек на листе, {len(keys)} ключей'
pal = hp.island_palette(root)
acc = hp.accents(img, pal, n=6)
full = np.vstack([pal, acc]) if len(acc) else pal
out_dir = root / f'game/assets/eras/{ERA_DIRS[era]}/base'
for key, bb in zip(keys, parts):
    c = img.crop(bb)
    # iso-спрайты с 2026-11-13 запечены в ISO_DENSITY раз плотнее карты: ширина на карте = ширина PNG / ISO_DENSITY
    iso_file = next((iso_dir / f'{key}{ext}' for ext in ('.webp', '.png') if (iso_dir / f'{key}{ext}').exists()), iso_dir / f'{key}.png')
    w = round(Image.open(iso_file).width / ISO_DENSITY)
    h = max(1, round(c.height * w / c.width))
    out = hp.remap(hp.resize_premul(c, (w, h)), full)
    if not dry:
        out.save(out_dir / f'{FILE.get(key, key)}.png')
    print(f'{key}: ячейка {c.size} -> e0.size [{w}, {h}]')
