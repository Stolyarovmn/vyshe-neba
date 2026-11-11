#!/usr/bin/env python3
"""Лёгкие рантайм-копии спрайтов: PNG-8 с альфой (256 цветов, без дизеринга).

Исходники — подготовленные спрайты outputs/rocket/dist/assets/world/<имя>.png (результат tools/ref2game/prep.py).
Результат — art/gen/runtime/<имя>.png: пиксель-арт теряет в среднем ~4 из 255 по цвету (на глаз не видно), а файлы
легче в 4-5 раз. Подготовленные оригиналы не меняются; манифест рендера (game/src/render/manifest.js) берёт для этих имён
runtime-копии (RUNTIME_SPRITE_PATTERN). Для имён из других групп добавьте шаблон там и здесь.

Запуск:  work/venv/Scripts/python.exe game/tools/optimize-sprites.py [--all-new]   (нужны pillow, numpy)
"""
import hashlib
import json
import os
import re
import sys

import numpy as np
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
SRC_DIRS = [os.path.join(ROOT, 'outputs', 'rocket', 'dist', 'assets', 'world'), os.path.join(ROOT, 'art', 'gen')]
OUT_DIR = os.path.join(ROOT, 'art', 'gen', 'runtime')
# должен совпадать с RUNTIME_SPRITE_PATTERN в manifest.js
PATTERN = re.compile(
    r'^(outpost_(moon|mars)_\d{4}|magnet_\d{4}|balloon_\d{4}_(envelope|pod)|pad_(moon|mars)_(early|future)|'
    r'bld_(beacons|gantry|deluge|service|rescue|fuel|logistics|radar|energy|observation|recovery)_1978)$'
)
# Спрайты, нарисованные сразу в art/gen/runtime (HD-постройки E0): подготовленного исходника нет, сжатию не подлежат —
# в метаданные попадают только размер, вес и хеш, чтобы тесты ловили подмену файла.
AUTHORED = re.compile(r'^bld_[a-z]+_1978$')



def sha256(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        h.update(f.read())
    return h.hexdigest()


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    report = {}
    total_in = total_out = 0
    sources = {}
    for src_dir in SRC_DIRS:
        for file in os.listdir(src_dir):
            sources.setdefault(file, os.path.join(src_dir, file))
    for file in sorted(sources):
        name, ext = os.path.splitext(file)
        if ext != '.png' or not PATTERN.match(name):
            continue
        src = sources[file]
        dst = os.path.join(OUT_DIR, file)
        image = Image.open(src).convert('RGBA')
        quantized = image.quantize(colors=256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE)
        quantized.save(dst, optimize=True)
        a = np.array(image)
        b = np.array(Image.open(dst).convert('RGBA'))
        mask = a[:, :, 3] > 128
        error = float(np.abs(a[:, :, :3].astype(int) - b[:, :, :3].astype(int))[mask].mean())
        report[name] = {
            'size': list(image.size), 'source_sha256': sha256(src), 'output_sha256': sha256(dst),
            'bytes_in': os.path.getsize(src), 'bytes_out': os.path.getsize(dst), 'mean_rgb_error': round(error, 2),
        }
        total_in += os.path.getsize(src)
        total_out += os.path.getsize(dst)
    old_meta = {}
    meta_path = os.path.join(OUT_DIR, 'runtime-sprites.meta.json')
    if os.path.exists(meta_path):
        with open(meta_path, encoding='utf-8') as f:
            old_meta = json.load(f).get('sprites', {})
    for file in sorted(os.listdir(OUT_DIR)):
        name, ext = os.path.splitext(file)
        if ext != '.png' or name in report or not AUTHORED.match(name) or not PATTERN.match(name):
            continue
        dst = os.path.join(OUT_DIR, file)
        image = Image.open(dst)
        if image.mode == 'P' and name in old_meta:
            # уже сжат раньше: оставляем прежние сведения об исходнике, обновляем только хеш и вес
            entry = dict(old_meta[name])
        else:
            rgba = image.convert('RGBA')
            entry = {'size': list(rgba.size), 'authored': True, 'source_sha256': sha256(dst), 'bytes_in': os.path.getsize(dst)}
            quantized = rgba.quantize(colors=256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE)
            quantized.save(dst, optimize=True)
            a = np.array(rgba)
            b = np.array(Image.open(dst).convert('RGBA'))
            mask = a[:, :, 3] > 128
            entry['mean_rgb_error'] = round(float(np.abs(a[:, :, :3].astype(int) - b[:, :, :3].astype(int))[mask].mean()), 2)
        entry['output_sha256'] = sha256(dst)
        entry['bytes_out'] = os.path.getsize(dst)
        report[name] = entry
    meta = {
        'encoding': 'PNG-8 + альфа, 256 цветов (FASTOCTREE), без дизеринга',
        'status': 'derived_runtime_copy_of_prepared_art',
        'note': 'Только сжатие для веса сборки; размеры и композиция не менялись.',
        'sprites': report,
    }
    with open(os.path.join(OUT_DIR, 'runtime-sprites.meta.json'), 'w', encoding='utf-8') as f:
        json.dump(meta, f, ensure_ascii=False, indent=1)
    print(f'{len(report)} спрайтов: {total_in // 1024} КБ -> {total_out // 1024} КБ')


if __name__ == '__main__':
    sys.exit(main())
