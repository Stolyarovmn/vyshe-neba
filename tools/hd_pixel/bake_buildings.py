"""Запекание зданий E0 по стиль-гайду: размер на острове = старый e0.size × K, 1 px спрайта = 1 px острова,
палитра острова, альфа 0/255. Пишет PNG прямо в ассеты ветки среза и печатает новые e0.size/footprint.
argv: root (корень ветки), ref_root (откуда брать исходные HD-спрайты и остров)."""
import json, re, sys
from pathlib import Path
import numpy as np
from PIL import Image

root = Path(sys.argv[1]); ref = Path(sys.argv[2])
K = {'gantry': 2.2, 'deluge': 1.8, 'service': 1.6, 'rescue': 1.7, 'fuel': 3.0, 'logistics': 2.8, 'factory': 2.5,
     'control': 2.8, 'energy': 2.8, 'observation': 2.4, 'recovery': 2.6}
NEAREST = {'weather': 2, 'radar': 2, 'beacons': 2}  # мелкие пиксельные спрайты: целое увеличение

island = Image.open(ref / 'game/assets/shared/island/start-island.png').convert('RGB')
a = np.asarray(island).reshape(-1, 3)
cols, counts = np.unique(a, axis=0, return_counts=True)
pal = cols[cols.sum(axis=1) > 0].astype(np.int32)
W8 = np.array([0.30, 0.59, 0.11]) ** 0.5

def remap(im):
    rgba = np.asarray(im).astype(np.int32)
    rgb = rgba[..., :3].reshape(-1, 3)
    out = np.empty_like(rgb)
    for i in range(0, len(rgb), 20000):
        chunk = rgb[i:i + 20000]
        d = (((chunk[:, None, :] - pal[None, :, :]) * W8) ** 2).sum(-1)
        out[i:i + 20000] = pal[d.argmin(1)]
    res = out.reshape(rgba.shape[0], rgba.shape[1], 3)
    alpha = np.where(rgba[..., 3] >= 128, 255, 0)
    return Image.fromarray(np.dstack([res, alpha]).astype(np.uint8), 'RGBA')

src = (ref / 'game/src/render/manifest.js').read_text(encoding='utf-8')
pat = re.compile(r"^\s+(\w+): \{\n\s+zone: '[^']+', anchors: \[\[.*?\]\], size: \[\d+, \d+\], footprint: \[[\d.]+, [\d.]+\],\n\s+e0: \{ anchors: (\[\[.*?\]\]), size: \[([\d.]+), ([\d.]+)\], footprint: \[([\d.]+), ([\d.]+)\]", re.M)
base_in = ref / 'game/assets/eras/e0-1978/base'
base_out = root / 'game/assets/eras/e0-1978/base'
result = {}
for m in pat.finditer(src):
    key = m.group(1)
    h0 = float(m.group(4)); fw, fh = float(m.group(5)), float(m.group(6))
    p = base_in / f'{key}.png'
    if not p.exists():
        continue
    frames = [p] + sorted((base_in / 'anim').glob(f'{key}_on*.png'), key=lambda q: int(re.search(r'on(\d+)', q.name).group(1)))
    im0 = Image.open(p).convert('RGBA')
    if key in NEAREST:
        k = NEAREST[key]
        for f in frames:
            im = Image.open(f).convert('RGBA')
            im = im.resize((im.width * k, im.height * k), Image.NEAREST)
            (base_out / f.relative_to(base_in)).parent.mkdir(parents=True, exist_ok=True)
            im.save(base_out / f.relative_to(base_in))
        size = [round(float(m.group(3)) * k, 2), round(h0 * k, 2)]
        result[key] = {'size': size, 'footprint': [round(fw * k, 2), round(fh * k, 2)], 'png': [im0.width * k, im0.height * k]}
        continue
    k = K.get(key)
    if not k:
        continue
    H = round(h0 * k)
    W = round(H * im0.width / im0.height)
    for f in frames:
        im = Image.open(f).convert('RGBA')
        # премультипликация, чтобы край не тянул тёмный ореол при уменьшении
        arr = np.asarray(im).astype(np.float32)
        arr[..., :3] *= arr[..., 3:4] / 255
        small = Image.fromarray(arr.clip(0, 255).astype(np.uint8), 'RGBA').resize((W, H), Image.LANCZOS)
        s = np.asarray(small).astype(np.float32)
        al = s[..., 3:4]
        s[..., :3] = np.where(al > 0, s[..., :3] * 255 / np.maximum(al, 1), 0)
        small = Image.fromarray(s.clip(0, 255).astype(np.uint8), 'RGBA')
        dst = base_out / f.relative_to(base_in)
        dst.parent.mkdir(parents=True, exist_ok=True)
        remap(small).save(dst)
    result[key] = {'size': [W, H], 'footprint': [round(fw * k), round(fh * k)], 'png': [W, H], 'k': k, 'frames': len(frames)}
json.dump(result, open(Path(sys.argv[0]).parent / 'baked_sizes.json', 'w'), indent=1)
for k_, v in result.items():
    print(k_, v)
