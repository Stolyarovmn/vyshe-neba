"""base-iso.json из проекции якорей и размеров спрайтов iso/<ключ>.png. argv: root layout_proj.json"""
import json, sys
from pathlib import Path
from PIL import Image

root = Path(sys.argv[1]); proj = json.load(open(sys.argv[2]))
pts = proj['points']
iso_dir = root / 'game/assets/eras/e0-1978/iso'
UNITS_PER_PX = 0.665
# Плотность iso-спрайтов (решение владельца 2026-11-13): PNG в 3 раза плотнее карты, чтобы база при увеличении
# не мылилась. Размер в base-iso.json — в px карты: PNG / ISO_DENSITY.
ISO_DENSITY = 3


def map_size(png):
    w, h = Image.open(png).size
    return [round(w / ISO_DENSITY), round(h / ISO_DENSITY)]


def iso_file(name):
    """iso-спрайт хранится в WebP без потерь (с 2026-11-13); старые PNG тоже читаются."""
    for ext in ('.webp', '.png'):
        f = iso_dir / f'{name}{ext}'
        if f.exists():
            return f
    return iso_dir / f'{name}.webp'

buildings = {}
# ручные поправки после примерки: крупные здания в изометрии наезжали друг на друга
OVERRIDES = {'fuel': [1000, 352], 'energy': [1655, 300], 'recovery': [1525, 356]}
pts = {k: OVERRIDES.get(k, v) for k, v in pts.items()}
for key, p in pts.items():
    if key == 'pad' or '_' in key:
        continue
    f = iso_file(key)
    if not f.exists():
        continue
    buildings[key] = {'anchor': p, 'size': map_size(f)}
    extra = [v for k, v in pts.items() if k.startswith(key + '_')]
    if extra:
        buildings[key]['anchors'] = [p] + extra
# Объекты-входы базы (2026-11-12, спрайты iso/entry_<ключ>.png): места выбраны на карте изометрии вручную, низ по центру
# в px карты — ангар в конце бетонного съезда между сервисом и спасателями, памятник и доска по краям площадки у стола,
# лавка у дороги южнее пульта. При перерендере острова под другим углом их нужно переставить заново.
ENTRIES = {'workshop': [767, 300], 'board': [490, 384], 'shop': [1405, 372], 'monument': [372, 386]}
entries = {}
for key, p in ENTRIES.items():
    f = iso_file(f'entry_{key}')
    if f.exists():
        entries[key] = {'anchor': p, 'size': map_size(f)}
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
