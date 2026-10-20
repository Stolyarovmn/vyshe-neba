#!/usr/bin/env python3
"""Готовит рантайм-ассет стартового острова в полном разрешении из оригинала с Google Drive.

Оригинал: work/island-src/start_island_E0_original.png (1916x821, RGBA, вид сверху-3/4), Drive id
109IFUuj4paHf6Chdbj-5ABRoyLmDj8mw (art-originals/environment/start_island). Скрипт:
  1. убирает запечённую башню, её тень и опорное кольцо со стартовой площадки: башня — покупаемая
     «Башня обслуживания», а ракета должна стоять на чистой площадке;
  2. достраивает бетон и траву способом «лоскутного» синтеза (image quilting) из чистых участков
     рядом с вырезом, восстанавливает кромку площадки и жёлтую пунктирную окружность;
  3. сохраняет art/gen/environment/start_island_hd.png (+ .meta.json с происхождением).
Всё остальное (бирюзовая кайма, скалы, пляжи, мелкие постройки по краю площадки) остаётся как есть.

Запуск (нужны pillow и numpy):
    python -m venv work/venv && work/venv/Scripts/pip install pillow numpy
    work/venv/Scripts/python game/tools/prepare-island-hd.py [--no-quantize]
"""
import argparse
import hashlib
import json
import math
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
SOURCE = os.path.join(ROOT, 'work', 'island-src', 'start_island_E0_original.png')
OUT_DIR = os.path.join(ROOT, 'art', 'gen', 'environment')
OUT_PNG = os.path.join(OUT_DIR, 'start_island_hd.png')
OUT_META = os.path.join(OUT_DIR, 'start_island_hd.meta.json')
OUT_LAND = os.path.join(OUT_DIR, 'start_island_hd.land.json')
LAND_CELL = 8  # размер ячейки маски суши в пикселях
DRIVE_ID = '109IFUuj4paHf6Chdbj-5ABRoyLmDj8mw'
DRIVE_PATH = 'art-originals/environment/start_island'

# Координаты в пикселях оригинала (1916x821). Измерено по сетке 10 px.
PAD_EDGE_Y = 277              # верхняя кромка бетонной площадки
PAD_CENTER = (388, 375)       # центр пусковой площадки (основание башни)
CIRCLE_RADIUS = 83            # радиус жёлтой пунктирной окружности вокруг центра
GRASS_MASK = [(364, 186, 414, PAD_EDGE_Y - 6)]                         # башня над площадкой (трава)
CONCRETE_MASK = [(334, PAD_EDGE_Y + 8, 442, 403), (324, 392, 372, 418), (404, 395, 444, 416)]  # башня, кольцо и обломки основания на бетоне
SHADOW_MASK = [(276, 338, 346, 400)]                                   # тень башни слева
EDGE_BAND = (PAD_EDGE_Y - 6, PAD_EDGE_Y + 8)                           # полоса кромки между травой и бетоном
EDGE_DONOR_X = (342, 362)                                              # чистый участок кромки для повтора
GRASS_MIRROR_SOURCE = (322, 364)                                       # чистая трава слева от башни: отражается внутрь выреза
CONCRETE_DONORS = [(284, 286, 336, 336), (440, 290, 470, 340), (410, 408, 470, 446), (290, 410, 336, 468)]


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def rect_mask(shape, rects):
    mask = np.zeros(shape, dtype=bool)
    for x0, y0, x1, y1 in rects:
        mask[y0:y1, x0:x1] = True
    return mask


def hsv_arrays(rgb):
    arr = rgb.astype(np.float32) / 255.0
    mx = arr.max(axis=2)
    mn = arr.min(axis=2)
    sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0)
    return mx, sat


def concrete_pixels(rgb):
    """Серый бетон: низкая насыщенность, средняя яркость, без жёлтых линий и тёмных контуров."""
    val, sat = hsv_arrays(rgb)
    r, g, b = (rgb[..., i].astype(np.int32) for i in range(3))
    yellow = ((r - b) > 62) | (g - b > 52)
    return (sat < 0.34) & (val > 0.55) & (val < 0.8) & ~yellow


def grass_pixels(rgb):
    """Трава: оливковый оттенок, средняя яркость (без деревьев, камней и песчаной тропинки)."""
    r, g, b = (rgb[..., i].astype(np.int32) for i in range(3))
    val, _ = hsv_arrays(rgb)
    return (g > b + 30) & (r > b + 24) & (np.abs(r - g) < 48) & (val > 0.34) & (val < 0.72)


def donor_valid(pixel_ok, donors, block):
    """Допустимые левые верхние углы блоков: весь блок целиком из чистых пикселей доноров."""
    h, w = pixel_ok.shape
    donor_area = rect_mask((h, w), donors) & pixel_ok
    integral = donor_area.astype(np.int32).cumsum(0).cumsum(1)
    integral = np.pad(integral, ((1, 0), (1, 0)))
    ys, xs = np.mgrid[0:h - block, 0:w - block]
    total = (integral[ys + block, xs + block] - integral[ys, xs + block] - integral[ys + block, xs] + integral[ys, xs])
    # допускаем 8 % «грязных» пикселей, чтобы выборка не вырождалась
    ok = total >= int(block * block * 0.92)
    return np.argwhere(ok)


def quilt(img, mask, donors, pixel_ok, block=16, overlap=5, candidates=700, seed=1):
    """Заполняет mask лоскутами из donors, подбирая лучший по совпадению с уже известными соседями."""
    rng = np.random.default_rng(seed)
    out = img.astype(np.float32).copy()
    known = ~mask
    positions = donor_valid(pixel_ok, donors, block)
    if len(positions) == 0:
        raise RuntimeError('нет подходящих участков-доноров')
    ys, xs = np.nonzero(mask)
    y_min, y_max, x_min, x_max = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    step = block - overlap
    for ty in range(y_min - overlap, y_max, step):
        for tx in range(x_min - overlap, x_max, step):
            y0, x0 = max(ty, 0), max(tx, 0)
            y1, x1 = min(ty + block, img.shape[0]), min(tx + block, img.shape[1])
            region_mask = mask[y0:y1, x0:x1]
            if not region_mask.any():
                continue
            target = out[y0:y1, x0:x1]
            target_known = known[y0:y1, x0:x1]
            pick = positions[rng.integers(0, len(positions), size=candidates)]
            best, best_cost = None, None
            for sy, sx in pick:
                cand = img[sy:sy + (y1 - y0), sx:sx + (x1 - x0)].astype(np.float32)
                if cand.shape[:2] != target.shape[:2]:
                    continue
                diff = ((cand - target) ** 2).sum(axis=2)
                cost = (diff * target_known).sum() / max(1, target_known.sum())
                if best_cost is None or cost < best_cost:
                    best, best_cost = cand, cost
            if best is None:
                continue
            write = region_mask & ~target_known
            target[write] = best[write]
            known[y0:y1, x0:x1] |= region_mask
    return np.clip(out, 0, 255).astype(np.uint8)


def feather_composite(original, filled, mask, radius=2.2):
    """Мягко смешивает залитую область с оригиналом по краю маски (скрывает стыки)."""
    alpha = Image.fromarray((mask * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(radius))
    a = np.asarray(alpha, dtype=np.float32)[..., None] / 255.0
    # внутри маски — всегда заливка, на краю — переход
    a = np.maximum(a, mask[..., None].astype(np.float32) * 0.0 + a)
    mixed = original.astype(np.float32) * (1 - a) + filled.astype(np.float32) * a
    mixed[mask] = filled[mask]
    return np.clip(mixed, 0, 255).astype(np.uint8)


def mirror_fill(rgb, mask, source_x):
    """Заполняет вырез травой, зеркально повторяя примыкающую слева полосу (шов-отражение незаметен)."""
    out = rgb.copy()
    x_edge, x_start = source_x[1], source_x[0]
    span = x_edge - x_start
    ys, xs = np.nonzero(mask)
    for y, x in zip(ys, xs):
        d = (x - x_edge) % (2 * span)
        offset = d if d < span else 2 * span - 1 - d
        out[y, x] = rgb[y, x_edge - 1 - offset]
    return out


def match_boundary(filled, original, mask, rect, ramp_power=1.5, window=15):
    """Подгоняет средний цвет залитой травы к цвету справа от выреза плавным градиентом по ширине."""
    x0, y0, x1, y1 = rect
    rows = slice(y0, y1)
    inner = filled[rows, x1 - 8:x1 - 2].astype(np.float32).mean(axis=1)
    outer = original[rows, x1 + 2:x1 + 8].astype(np.float32).mean(axis=1)
    delta = outer - inner
    kernel = np.ones(window) / window
    delta = np.stack([np.convolve(np.pad(delta[:, c], window // 2, mode='edge'), kernel, mode='valid') for c in range(3)], axis=1)
    ramp = (np.arange(x0, x1) - x0) / max(1, x1 - x0 - 1)
    ramp = ramp ** ramp_power
    patch = filled[rows, x0:x1].astype(np.float32) + delta[:, None, :] * ramp[None, :, None]
    out = filled.copy()
    out[rows, x0:x1] = np.clip(patch, 0, 255).astype(np.uint8)
    return out


def paste_edge_strip(rgb, x_range, y_range, donor_x):
    """Повторяет чистый участок кромки площадки (с зеркалированием) поперёк выреза."""
    y0, y1 = y_range
    dx0, dx1 = donor_x
    strip = rgb[y0:y1, dx0:dx1].copy()
    width = dx1 - dx0
    x = x_range[0]
    flip = False
    while x < x_range[1]:
        piece = strip[:, ::-1] if flip else strip
        span = min(width, x_range[1] - x)
        rgb[y0:y1, x:x + span] = piece[:, :span]
        x += span
        flip = not flip


def draw_dashed_circle(rgb, color, center, radius, mask, dash=11, gap=8, width=2):
    """Дорисовывает участок жёлтой пунктирной окружности внутри маски (по образцу соседних штрихов)."""
    layer = Image.new('L', (rgb.shape[1], rgb.shape[0]), 0)
    d = ImageDraw.Draw(layer)
    circumference = 2 * math.pi * radius
    period = dash + gap
    count = int(circumference // period)
    for i in range(count):
        a0 = (i * period) / radius
        a1 = (i * period + dash) / radius
        steps = 6
        pts = [(center[0] + radius * math.cos(a0 + (a1 - a0) * s / steps),
                center[1] + radius * math.sin(a0 + (a1 - a0) * s / steps)) for s in range(steps + 1)]
        d.line(pts, fill=255, width=width)
    layer_arr = np.asarray(layer, dtype=np.float32)[..., None] / 255.0 * mask[..., None]
    col = np.array(color, dtype=np.float32)
    rgb[:] = np.clip(rgb.astype(np.float32) * (1 - layer_arr * 0.9) + col * layer_arr * 0.9, 0, 255).astype(np.uint8)


def remove_tower(image):
    rgba = np.asarray(image.convert('RGBA'))
    rgb = rgba[..., :3].copy()
    alpha = rgba[..., 3].copy()
    h, w = rgb.shape[:2]
    original = rgb.copy()

    grass_mask = rect_mask((h, w), GRASS_MASK)
    concrete_mask = rect_mask((h, w), CONCRETE_MASK) | rect_mask((h, w), SHADOW_MASK)

    concrete_ok = concrete_pixels(original) & ~concrete_mask & ~grass_mask

    filled_grass = mirror_fill(original, grass_mask, GRASS_MIRROR_SOURCE)
    filled = np.where(grass_mask[..., None], filled_grass, original)
    filled = match_boundary(filled, original, grass_mask, GRASS_MASK[0])
    filled_concrete = quilt(filled, concrete_mask, CONCRETE_DONORS, concrete_ok, block=18, overlap=6, seed=5)
    filled = np.where(concrete_mask[..., None], filled_concrete, filled)

    # кромка площадки между травой и бетоном
    edge_x = (GRASS_MASK[0][0] - 2, GRASS_MASK[0][2] + 2)
    paste_edge_strip(filled, edge_x, EDGE_BAND, EDGE_DONOR_X)

    full_mask = grass_mask | concrete_mask
    full_mask[EDGE_BAND[0]:EDGE_BAND[1], edge_x[0]:edge_x[1]] = True
    result = feather_composite(original, filled, full_mask, radius=3.0)

    # восстановить пунктирную окружность вокруг центра пусковой площадки там, где её закрывала башня
    dash_color = (206, 178, 70)
    near = rect_mask((h, w), [(318, 282, 460, 300)])
    draw_dashed_circle(result, dash_color, PAD_CENTER, CIRCLE_RADIUS, near.astype(np.float32))

    out = np.dstack([result, alpha])
    return Image.fromarray(out, 'RGBA'), full_mask


def land_mask(image, cell=LAND_CELL):
    """Грубая маска суши (1 = суша): непрозрачно и не бирюзовая вода/кайма. Ячейка cell x cell."""
    arr = np.asarray(image.convert('RGBA')).astype(np.int32)
    r, g, b, a = arr[..., 0], arr[..., 1], arr[..., 2], arr[..., 3]
    water = (b > r + 30) & (g > r + 10)
    land = (a > 128) & ~water
    h, w = land.shape
    rows, cols = h // cell, w // cell
    blocks = land[: rows * cell, : cols * cell].reshape(rows, cell, cols, cell).mean(axis=(1, 3))
    return blocks >= 0.6


def land_mask_rows(mask):
    """Строки маски в hex (4 ячейки на символ, лишние биты справа нулевые)."""
    rows = []
    for row in mask:
        bits = ''.join('1' if v else '0' for v in row)
        bits += '0' * (-len(bits) % 4)
        rows.append(''.join('%x' % int(bits[i:i + 4], 2) for i in range(0, len(bits), 4)))
    return rows


def quantize_rgba(image, colors=256):
    """Индексированная палитра с прозрачностью без дизеринга: меньше вес, вид сохраняется."""
    rgba = image.convert('RGBA')
    alpha = rgba.getchannel('A')
    quant = rgba.convert('RGB').quantize(colors=colors - 1, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    palette = quant.getpalette()[: (colors - 1) * 3]
    indices = np.asarray(quant, dtype=np.uint8) + 1  # индекс 0 резервируем под прозрачность
    indices[np.asarray(alpha) < 128] = 0
    out = Image.fromarray(indices, 'P')
    out.putpalette([0, 0, 0] + palette)
    out.info['transparency'] = 0
    return out


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--no-quantize', action='store_true', help='сохранить полноцветный RGBA')
    parser.add_argument('--preview', help='дополнительно сохранить сравнение до/после в этот файл')
    args = parser.parse_args()

    if not os.path.exists(SOURCE):
        print(f'нет исходника {SOURCE}: скачайте оригинал с Drive (id {DRIVE_ID}) в work/island-src/', file=sys.stderr)
        return 1
    source_sha = sha256_file(SOURCE)
    image = Image.open(SOURCE).convert('RGBA')
    cleaned, mask = remove_tower(image)

    os.makedirs(OUT_DIR, exist_ok=True)
    if args.no_quantize:
        cleaned.save(OUT_PNG, optimize=True)
        encoding = 'RGBA PNG, полноцветный'
    else:
        quantize_rgba(cleaned).save(OUT_PNG, optimize=True)
        encoding = 'PNG-8, палитра 255 цветов + прозрачность, без дизеринга'
    if args.preview:
        crop = (230, 160, 560, 500)
        sheet = Image.new('RGBA', ((crop[2] - crop[0]) * 2 + 10, crop[3] - crop[1]), (60, 60, 80, 255))
        sheet.alpha_composite(image.crop(crop), (0, 0))
        sheet.alpha_composite(Image.open(OUT_PNG).convert('RGBA').crop(crop), (crop[2] - crop[0] + 10, 0))
        sheet = sheet.resize((sheet.width * 3 // 2, sheet.height * 3 // 2), Image.NEAREST)
        sheet.convert('RGB').save(args.preview)

    meta = {
        'asset_id': 'ENV_START_ISLAND_HD',
        'asset': 'start_island_hd',
        'source': {
            'file': 'work/island-src/start_island_E0_original.png',
            'sha256': source_sha,
            'size': [image.width, image.height],
            'drive_id': DRIVE_ID,
            'drive_path': DRIVE_PATH,
            'role': 'оригинал в высоком разрешении (вид сверху-3/4), прозрачный фон',
        },
        'processing': [
            'удалены запечённая башня обслуживания, её тень и опорное кольцо со стартовой площадки (image quilting из чистого бетона и травы)',
            'восстановлены кромка площадки и жёлтая пунктирная окружность',
            'бирюзовая кайма мелководья, скалы, пляжи и мелкие постройки по краю площадки оставлены без изменений',
            encoding,
        ],
        'tool': 'game/tools/prepare-island-hd.py',
        'size': [image.width, image.height],
        'output_sha256': sha256_file(OUT_PNG),
        'output_bytes': os.path.getsize(OUT_PNG),
        'pad_center_px': list(PAD_CENTER),
        'contains_rocket': False,
        'contains_starter_tower': False,
        'status': 'pending',
        'approved_by_user': False,
        'supersedes': 'art/gen/environment/start_island_e0.png (384x166, approved 2026-10-19)',
        'note': 'Ждёт утверждения пользователя; до этого рантайм может использовать его, а start_island_e0.png остаётся резервом.',
    }
    with open(OUT_META, 'w', encoding='utf-8') as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)
        f.write('\n')
    mask = land_mask(cleaned)
    with open(OUT_LAND, 'w', encoding='utf-8') as f:
        json.dump({
            'asset': 'start_island_hd',
            'cell_px': LAND_CELL,
            'size': [image.width, image.height],
            'cols': int(mask.shape[1]),
            'rows': int(mask.shape[0]),
            'land_hex_rows': land_mask_rows(mask),
            'note': '1 = суша (непрозрачно и не вода/кайма); строки в hex, 4 ячейки на символ. Нужна тестам раскладки построек.',
        }, f, ensure_ascii=False, indent=0)
        f.write('\n')
    print(f"{os.path.relpath(OUT_PNG, ROOT)}: {meta['output_bytes'] // 1024} KB, sha256 {meta['output_sha256'][:12]}")
    return 0


if __name__ == '__main__':
    sys.exit(main())
