"""base-iso.json из проекции якорей и размеров спрайтов iso/<ключ>.png. argv: root layout_proj.json"""
import json, sys
from pathlib import Path
from PIL import Image

root = Path(sys.argv[1]); proj = json.load(open(sys.argv[2]))
pts = proj['points']
iso_dir = root / 'game/assets/eras/e0-1978/iso'
UNITS_PER_PX = 0.665
buildings = {}
# ручные поправки после примерки: крупные здания в изометрии наезжали друг на друга
OVERRIDES = {'fuel': [1000, 352], 'energy': [1655, 300], 'recovery': [1525, 356]}
pts = {k: OVERRIDES.get(k, v) for k, v in pts.items()}
for key, p in pts.items():
    if key == 'pad' or '_' in key:
        continue
    f = iso_dir / f'{key}.png'
    if not f.exists():
        continue
    w, h = Image.open(f).size
    buildings[key] = {'anchor': p, 'size': [w, h]}
    extra = [v for k, v in pts.items() if k.startswith(key + '_')]
    if extra:
        buildings[key]['anchors'] = [p] + extra
layout = {
    'size': proj['size'],
    'elev': proj['elev'],
    'pad': {'x': pts['pad'][0], 'y': pts['pad'][1], 'rocketScale': round(1 / UNITS_PER_PX, 4)},
    # стартовый вид: стол и ближние поляны крупно; minZoom 2.2 — остров не мельчит до точки (как прежний хаб)
    'camera': {'home': [pts['pad'][0] + 330, pts['pad'][1] - 20], 'minZoom': 2.2, 'maxZoom': 7},
    'buildings': buildings,
}
out = root / 'game/assets/shared/island/base-iso.json'
json.dump(layout, open(out, 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
print(json.dumps(layout)[:600])
