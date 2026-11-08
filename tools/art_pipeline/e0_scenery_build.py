#!/usr/bin/env python3
"""Параметрические сопутствующие объекты E0: плиты подземных трасс и поддон с ящиками.

Назначение (из игры и брифов владельца, см. art/docs/E0_SCENERY_RULES.md):
  * trench_plate_h / trench_plate_v / trench_plate_corner: стальные крышки траншей, под которыми идут подземные магистрали
    (топливо: башня -> люк у стола; охлаждение: отвод бака -> распределитель, BI_GANTRY_E0.md, BI_DELUGE_E0.md);
  * crate_pallet: поддон с двумя ящиками у логистического терминала; показывается, пока есть активный контракт
    (`contractSlots` терминала, game/src/data/buildings.js).

Рисуется сразу в логическую пиксельную сетку (4 логических пикселя = 1 пиксель острова при шкале 7,2 px/м);
дальше обычный конвейер: adapter prepared_grid_png, transport_scale 4, Pixel Snapper pixel_size 4, Aseprite, QA.
Верхний левый свет, холодная тень снизу справа, без запечённой тени.

python e0_scenery_build.py --repo .
"""
import argparse
import hashlib
import json
from pathlib import Path

from PIL import Image, ImageDraw

OUT = (30, 32, 30, 255)
STEEL_M = (110, 118, 104, 255)
STEEL_L = (152, 160, 140, 255)
STEEL_D = (74, 80, 72, 255)
BOLT = (196, 200, 182, 255)
RUST = (170, 98, 56, 255)
WOOD_L = (206, 162, 104, 255)
WOOD_M = (158, 118, 76, 255)
WOOD_D = (100, 74, 48, 255)
STRAP = (96, 100, 96, 255)
STRAP_L = (132, 138, 128, 255)

ASSETS = {
    # asset: (slug в конфиге, ширина, высота, canvas, registration, scene_w, scene_xy, label, config id)
    'trench_plate_h': ('INFRA_TRENCH_H', 48, 16),
    'trench_plate_v': ('INFRA_TRENCH_V', 16, 48),
    'trench_plate_corner': ('INFRA_TRENCH_C', 16, 16),
    'crate_pallet': ('INFRA_CRATE_PALLET', 36, 30),
}


def plate(w, h, bolts, seams=()):
    """Стальная крышка траншеи заподлицо: тонкая кромка, свет сверху слева, болты, швы, редкая ржавчина по кромкам."""
    im = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rectangle([0, 0, w - 1, h - 1], fill=OUT)
    d.rectangle([1, 1, w - 2, h - 2], fill=STEEL_M)
    d.line([(1, 1), (w - 2, 1)], fill=STEEL_L)
    d.line([(1, 1), (1, h - 2)], fill=STEEL_L)
    d.line([(2, h - 2), (w - 2, h - 2)], fill=STEEL_D)
    d.line([(w - 2, 2), (w - 2, h - 2)], fill=STEEL_D)
    for sx, sy, ex, ey in seams:
        d.line([(sx, sy), (ex, ey)], fill=STEEL_D)
    for bx, by in bolts:
        d.rectangle([bx, by, bx + 1, by + 1], fill=BOLT)
        d.point((bx + 2, by + 2), fill=OUT)
    # ржавчина по кромкам детерминированно
    for i in range(0, w * h, 37):
        x, y = (i * 7) % w, (i * 13) % h
        if x in (1, w - 2) or y in (1, h - 2):
            if im.getpixel((x, y))[3]:
                im.putpixel((x, y), RUST)
    for corner in ((0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)):
        im.putpixel(corner, (0, 0, 0, 0))
    return im


def trench_h():
    return plate(48, 16, [(4, 4), (42, 4), (4, 10), (42, 10)], seams=[(24, 2, 24, 13)])


def trench_v():
    return plate(16, 48, [(4, 4), (10, 4), (4, 42), (10, 42)], seams=[(2, 24, 13, 24)])


def trench_corner():
    return plate(16, 16, [(3, 3), (11, 3), (3, 11), (11, 11)])


def crate_pallet():
    """Поддон 1,2 x 0,8 м с двумя ящиками 0,6 м: вид сверху-3/4 (стенка видна на 0,285 высоты)."""
    im = Image.new('RGBA', (36, 30), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    # настил поддона
    d.rectangle([0, 12, 35, 24], fill=OUT)
    d.rectangle([1, 13, 34, 23], fill=WOOD_M)
    for y in (16, 19, 22):
        d.line([(1, y), (34, y)], fill=WOOD_D)
    d.line([(1, 13), (34, 13)], fill=WOOD_L)
    # передний торец и ножки
    d.rectangle([0, 25, 35, 27], fill=OUT)
    d.rectangle([1, 25, 34, 26], fill=WOOD_M)
    for x0 in (2, 15, 28):
        d.rectangle([x0, 27, x0 + 4, 29], fill=OUT)
        d.rectangle([x0 + 1, 27, x0 + 3, 28], fill=WOOD_D)
    # ящики
    for x0 in (2, 19):
        d.rectangle([x0, 3, x0 + 15, 20], fill=OUT)
        d.rectangle([x0 + 1, 4, x0 + 14, 15], fill=WOOD_L)               # крышка
        d.line([(x0 + 1, 4), (x0 + 14, 4)], fill=(236, 200, 140, 255))   # свет сверху
        d.rectangle([x0 + 1, 16, x0 + 14, 19], fill=WOOD_M)              # передняя стенка
        d.line([(x0 + 14, 4), (x0 + 14, 19)], fill=WOOD_D)               # тень справа
        for sx in (x0 + 4, x0 + 11):                                     # стальные ленты
            d.line([(sx, 4), (sx, 15)], fill=STRAP)
            d.line([(sx, 16), (sx, 19)], fill=STRAP_L)
    return im


BUILDERS = {'trench_plate_h': trench_h, 'trench_plate_v': trench_v, 'trench_plate_corner': trench_corner, 'crate_pallet': crate_pallet}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--repo', default='.')
    a = ap.parse_args()
    repo = Path(a.repo).resolve()
    out = {}
    for asset, build in BUILDERS.items():
        im = build()
        raw = repo / 'art/raw/placeables/base' / asset
        raw.mkdir(parents=True, exist_ok=True)
        logical = raw / 'e0_1978_logical.png'
        im.save(logical)  # авторский исходник в логической сетке, неизменный
        p = raw / 'e0_1978_presnap.png'
        im.resize((im.width * 4, im.height * 4), Image.NEAREST).save(p)  # транспорт: увеличение ближайшим соседом x4 под pixel_size 4
        sha = hashlib.sha256(p.read_bytes()).hexdigest()
        meta = {
            'source_sha256': sha,
            'source_original_sha256': hashlib.sha256(logical.read_bytes()).hexdigest(),
            'original_png_file': f'art/raw/placeables/base/{asset}/e0_1978_presnap.png',
            'source_storage': {'provider': 'google_drive', 'drive_file_id': 'PENDING_UPLOAD'},
            'parametric': {'builder': 'tools/art_pipeline/e0_scenery_build.py', 'size': list(im.size), 'palette': 'E0: сталь серо-зелёная, дерево, болты, ржавчина по кромкам',
                           'light': 'верх-лево, тень холодная вниз-вправо, запечённой тени нет'},
        }
        (raw / 'e0_1978_presnap.json').write_text(json.dumps(meta, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
        out[asset] = {'size': im.size, 'sha256': sha}
    print(json.dumps(out, ensure_ascii=False))


if __name__ == '__main__':
    main()
