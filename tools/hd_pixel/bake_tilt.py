"""Кадры «подъёма камеры» база → полёт: промежуточные ракурсы острова между изометрией (40°) и картой полёта.

Рендеры делает iso_render.py (Blender) для каждого угла места, например:
  blender -b -P iso_render.py -- island_alpha.png height.npy anchors.json <dir52> 52
  blender -b -P iso_render.py -- island_alpha.png height.npy anchors.json <dir64> 64
  blender -b -P iso_render.py -- island_alpha.png height.npy anchors.json <dir73> 73.44
Этот скрипт пакует их: WebP в game/assets/shared/island/tilt-<угол>.webp и tilt.json с размером, столом и
якорями построек каждого кадра (пиксели кадра). Полёт рисует кадры по очереди с перекрёстным растворением
(render/flight.js), последним идёт сама карта полёта start-island.png.
argv: root dir1 dir2 ... (в каждом base_iso_raw.png и layout_proj.json)"""
import json
import sys
from pathlib import Path

from PIL import Image

root = Path(sys.argv[1])
out_dir = root / 'game/assets/shared/island'
frames = []
for d in sys.argv[2:]:
    d = Path(d)
    proj = json.load(open(d / 'layout_proj.json', encoding='utf-8'))
    elev = proj['elev']
    tag = str(int(round(elev)))
    im = Image.open(d / 'base_iso_raw.png').convert('RGBA')
    assert list(im.size) == list(proj['size']), (im.size, proj['size'])
    name = f'tilt-{tag}.webp'
    im.save(out_dir / name, 'WEBP', quality=86, method=6)
    pts = proj['points']
    buildings = {}
    for key, p in pts.items():
        if key == 'pad':
            continue
        base = key.split('_')[0]
        buildings.setdefault(base, []).append(p)
    frames.append({'elev': elev, 'asset': f'island_tilt_{tag}', 'file': name, 'size': proj['size'],
                   'pad': pts['pad'], 'buildings': buildings})
    print(name, im.size, (out_dir / name).stat().st_size // 1024, 'KB')
frames.sort(key=lambda f: f['elev'])
json.dump({'frames': frames}, open(out_dir / 'tilt.json', 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
print('tilt.json', [f['elev'] for f in frames])
