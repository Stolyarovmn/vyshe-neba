"""Сборка превью базы: изометрический остров + спрайты iso/<ключ>.png по base-iso.json + ракета-стек. argv: root out.png"""
import json, sys
from pathlib import Path
from PIL import Image

root = Path(sys.argv[1]); out = Path(sys.argv[2])
lay = json.load(open(root / 'game/assets/shared/island/base-iso.json', encoding='utf-8'))
isl = Image.open(root / 'game/assets/shared/island/base-iso.png').convert('RGBA')
canvas = Image.new('RGBA', isl.size, (36, 96, 150, 255))
canvas.alpha_composite(isl)
items = []
for key, b in lay['buildings'].items():
    for (x, y) in b.get('anchors', [b['anchor']]):
        items.append((y, key, x))
pad = lay['pad']
items.append((pad['y'], '__rocket', pad['x']))
era = root / 'game/assets/eras/e0-1978'
for y, key, x in sorted(items):
    if key == '__rocket':
        parts = [Image.open(era / f'rocket/stack_{n}.png').convert('RGBA') for n in ('capsule', 'core', 'booster')]
        k = 24 * pad['rocketScale'] / parts[0].width  # STACK_W=24 ед.
        joint = {'core': 4, 'booster': 36}
        ims = [p.resize((max(1, round(p.width * k)), max(1, round(p.height * k))), Image.LANCZOS) for p in parts]
        total = ims[0].height + ims[1].height - round(4 * k) + ims[2].height - round(36 * k)
        top = round(y - total)
        canvas.alpha_composite(ims[0], (round(x - ims[0].width / 2), top))
        cy = top + ims[0].height - round(4 * k)
        canvas.alpha_composite(ims[1], (round(x - ims[1].width / 2), cy))
        by = cy + ims[1].height - round(36 * k)
        canvas.alpha_composite(ims[2], (round(x - ims[2].width / 2), by))
        continue
    sp_file = next((era / f'iso/{key}{ext}' for ext in ('.webp', '.png') if (era / f'iso/{key}{ext}').exists()), era / f'iso/{key}.webp')
    sp = Image.open(sp_file).convert('RGBA')
    # iso-спрайты плотнее карты (ISO_DENSITY в write_layout.py): размер на карте — из base-iso.json
    w, h = lay['buildings'][key]['size']
    if sp.size != (w, h):
        sp = sp.resize((w, h), Image.LANCZOS)
    canvas.alpha_composite(sp, (round(x - sp.width / 2), round(y - sp.height)))
canvas.convert('RGB').save(out)
print('ok', canvas.size)
