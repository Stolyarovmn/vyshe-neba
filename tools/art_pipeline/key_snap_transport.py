#!/usr/bin/env python3
"""Транспортная конверсия хромакей-исходника: фон ChatGPT около #FF00FF с шумом -> ровно #FF00FF.

Решение владельца 2026-11-07: ключ с допуском принят. Скрипт трогает только пиксели фона,
связанные с границей кадра (flood по близости к ключу); пиксели объекта не меняются.
Неизменённый оригинал остаётся в Drive; SHA-256 оригинала и результата печатаются и записываются
в брифе. Это конверсия транспорта (SOURCE_ALPHA_TRANSPORT.md п.7), а не ремонт геометрии.

python key_snap_transport.py <original.png> <out.png> [--tol 90]
"""
import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

KEY = (255, 0, 255)


def sha(p):
    return hashlib.sha256(Path(p).read_bytes()).hexdigest()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('src')
    ap.add_argument('dst')
    ap.add_argument('--tol', type=float, default=90.0, help='допуск по евклидову расстоянию до ближайшего типичного фона')
    a = ap.parse_args()
    im = np.array(Image.open(a.src).convert('RGB')).astype(int)
    border = np.concatenate([im[0], im[-1], im[:, 0], im[:, -1]])
    ref = np.median(border, axis=0)
    d = np.sqrt(((im - ref) ** 2).sum(axis=2))
    bg = d <= a.tol
    lab, _ = ndimage.label(bg)
    ids = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    mask = np.isin(lab, list(ids))
    out = im.copy()
    out[mask] = KEY
    Image.fromarray(out.astype(np.uint8), 'RGB').save(a.dst)
    print(json.dumps({'src': a.src, 'src_sha256': sha(a.src), 'dst': a.dst, 'dst_sha256': sha(a.dst),
                      'background_ref_rgb': [int(v) for v in ref], 'tol': a.tol,
                      'snapped_pixels': int(mask.sum()),
                      'object_pixels_changed': int((((out != im).any(axis=2)) & ~mask).sum())}))


if __name__ == '__main__':
    main()
