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
# Объекты-входы базы (2026-11-12, спрайты iso/entry_<ключ>.png): места выбраны на карте изометрии вручную, низ по центру
# в px карты — ангар в конце бетонного съезда между сервисом и спасателями, памятник и доска по краям площадки у стола,
# лавка у дороги южнее пульта. При перерендере острова под другим углом их нужно переставить заново.
ENTRIES = {'workshop': [767, 300], 'board': [490, 384], 'shop': [1405, 372], 'monument': [372, 386]}
entries = {}
for key, p in ENTRIES.items():
    f = iso_dir / f'entry_{key}.png'
    if f.exists():
        w, h = Image.open(f).size
        entries[key] = {'anchor': p, 'size': [w, h]}
layout = {
    'size': proj['size'],
    'elev': proj['elev'],
    'pad': {'x': pts['pad'][0], 'y': pts['pad'][1], 'rocketScale': round(1 / UNITS_PER_PX, 4)},
    # стартовый вид: на широком экране вся застройка (hub-iso.js считает зум по полосе построек, не мельче minZoom 1.3);
    # на узком — стол и ближние поляны крупно (portraitZoom 2.2, как прежний хаб)
    'camera': {'home': [pts['pad'][0] + 330, pts['pad'][1] - 20], 'minZoom': 1.3, 'portraitZoom': 2.2, 'maxZoom': 7},
    'buildings': buildings,
    'entries': entries,
}
out = root / 'game/assets/shared/island/base-iso.json'
json.dump(layout, open(out, 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
print(json.dumps(layout)[:600])
