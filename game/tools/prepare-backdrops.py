#!/usr/bin/env python3
"""Готовит лёгкие рантайм-копии фонов мастерской и стартовых комплексов.

Исходники (утверждённый арт): outputs/rocket/dist/assets/interior-eras.png (3,3 МБ) и environments.png (3,0 МБ).
PNG такого размера, встроенные в один HTML как base64, весят около 8 МБ, поэтому рантайм берёт WebP q88
(≈1 МБ на оба файла). Кадры и композиция не меняются; сетки: interior 3x2, environments 2x2.

Запуск:  work/venv/Scripts/python.exe game/tools/prepare-backdrops.py   (нужны pillow)
"""
import hashlib
import json
import os
import sys

from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT_DIR = os.path.join(ROOT, 'art', 'gen', 'environment')
QUALITY = 88

JOBS = [
    ('outputs/rocket/dist/assets/interior-eras.png', 'backdrop_interior_eras.webp', {'grid': [3, 2], 'cells': 'E0..E5 слева направо, сверху вниз'}),
    ('outputs/rocket/dist/assets/environments.png', 'backdrop_environments.webp', {'grid': [2, 2], 'cells': 'launch-earth, shop, shop, launch-moon'}),
]


def sha256(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        h.update(f.read())
    return h.hexdigest()


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    for source, target, extra in JOBS:
        src_path = os.path.join(ROOT, source)
        image = Image.open(src_path).convert('RGB')
        out_path = os.path.join(OUT_DIR, target)
        image.save(out_path, 'WEBP', quality=QUALITY, method=6)
        meta = {
            'asset': target,
            'source': source,
            'source_sha256': sha256(src_path),
            'size': list(image.size),
            'encoding': f'WebP lossy q{QUALITY}, method 6, RGB (без альфы)',
            'output_sha256': sha256(out_path),
            'output_bytes': os.path.getsize(out_path),
            'status': 'derived_runtime_copy_of_approved_art',
            'note': 'Только перекодирование для веса сборки; композиция и кадры не менялись.',
            **extra,
        }
        with open(out_path.replace('.webp', '.meta.json'), 'w', encoding='utf-8') as f:
            json.dump(meta, f, ensure_ascii=False, indent=2)
            f.write('\n')
        print(f"{target}: {meta['output_bytes'] // 1024} КБ из {os.path.getsize(src_path) // 1024} КБ")


if __name__ == '__main__':
    sys.exit(main())
