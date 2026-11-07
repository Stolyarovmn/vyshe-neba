#!/usr/bin/env python3
"""ON-анимации из частей утверждённых спрайтов E0 (терминал, комплекс возврата, цех).

Часть вырезается из runtime-обрезки утверждённого PNG, место под ней восстанавливается копией соседнего фона
из того же спрайта (новых цветов нет), часть смещается на целое число пикселей сетки. Кадры строятся на той же сетке
и привязке, что и опорный кадр. Свет, звук, дым и т.п. принадлежат коду.

python e0_rework_animate.py --repo .
Выход в art/gen/placeables/base/<asset>/animation/: on_sheet.png, on.gif (просмотр), и animation.json рядом со спрайтом.
"""
import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

DARK_KEY = 'darkest'


def sha(p):
    return hashlib.sha256(Path(p).read_bytes()).hexdigest()


def darkest_color(arr):
    op = arr[arr[:, :, 3] > 0][:, :3].astype(int)
    return tuple(int(v) for v in op[np.argmin(op.sum(axis=1))])


def paste(dst, src, mask, dx, dy):
    h, w = mask.shape
    ys, xs = np.where(mask)
    for y, x in zip(ys, xs):
        ty, tx = y + dy, x + dx
        if 0 <= ty < dst.shape[0] and 0 <= tx < dst.shape[1]:
            dst[ty, tx] = src[y, x]


def tile_fill(arr, box, src_box):
    """Залить прямоугольник box копией src_box (если src уже/ниже, повторить плиткой)."""
    x0, y0, x1, y1 = box
    sx0, sy0, sx1, sy1 = src_box
    patch = arr[sy0:sy1, sx0:sx1]
    reps_y = -(-(y1 - y0) // patch.shape[0])
    reps_x = -(-(x1 - x0) // patch.shape[1])
    big = np.tile(patch, (reps_y, reps_x, 1))
    arr[y0:y1, x0:x1] = big[:y1 - y0, :x1 - x0]


def cargo(base):
    """Тележка с ручной тали идёт по балке к приёмной площадке (вправо), крюк и цепь висят на ней."""
    box = (133, 8, 167, 58)
    clean = base.copy()
    tile_fill(clean, (133, 8, 167, 24), (169, 8, 203, 24))     # балка справа от тележки
    tile_fill(clean, (133, 24, 167, 58), (168, 24, 188, 58))   # бетон справа
    part = np.zeros(base.shape[:2], bool)
    part[box[1]:box[3], box[0]:box[2]] = True
    seq = [0, 4, 8, 12, 16, 20, 24, 20, 16, 12, 8, 4, 0]
    frames = []
    for dx in seq:
        f = clean.copy()
        paste(f, base, part, dx, 0)
        frames.append(f)
    return frames, dict(part='trolley_hoist_hook', box=list(box), pivot=[150, 12], motion='translate_x', range_px=[0, 24],
                        why='тележка с цепной талью идёт по балке от стоянки груза к приёмной площадке')


def recovery(base):
    """Крюковая обойма опускается на канате к люльке (вниз), канат удлиняется."""
    # маска крюка: насыщенный золотой и тёмная кайма
    reg = (118, 30, 143, 63)
    sub = base[reg[1]:reg[3], reg[0]:reg[2]].astype(int)
    gold = (sub[:, :, 0] > 170) & (sub[:, :, 1] > 100) & (sub[:, :, 2] < 110) & (sub[:, :, 0] - sub[:, :, 2] > 90)
    gold = ndimage.binary_dilation(gold, iterations=2)
    # вырезать только ниже верха крюка, канат выше остаётся
    ys, xs = np.where(gold)
    top = reg[1] + ys.min()
    mask = np.zeros(base.shape[:2], bool)
    mask[reg[1]:reg[3], reg[0]:reg[2]] = gold
    clean = base.copy()
    # под крюком: балка (y<=46) и бетон ниже; копия справа
    tile_fill(clean, (118, 28, 143, 47), (146, 28, 171, 47))
    tile_fill(clean, (118, 47, 143, 63), (146, 47, 171, 63))
    rope_row = base[top - 2, 123:134].copy()
    seq = [0, 2, 4, 6, 8, 6, 4, 2, 0]
    frames = []
    for dy in seq:
        f = clean.copy()
        for y in range(top - 1, top + dy):
            f[y, 123:134] = rope_row
        paste(f, base, mask, 0, dy)
        frames.append(f)
    return frames, dict(part='hook_block', box=[reg[0], int(top), reg[2], reg[3]], pivot=[126, int(top)], motion='translate_y', range_px=[0, 8],
                        why='крюковая обойма опускается на канате к люльке и поднимается обратно')


def factory(base):
    """Створка ворот уезжает по рельсу вправо, открывая проём; рельсовый путь выходит из тёмного проёма."""
    box = (54, 51, 141, 84)
    dark = darkest_color(base)
    clean = base.copy()
    clean[52:83, 57:138] = (*dark, 255)
    part = np.zeros(base.shape[:2], bool)
    part[box[1]:box[3], box[0]:box[2]] = True
    seq = [0, 5, 10, 15, 20, 25, 30, 25, 20, 15, 10, 5, 0]
    frames = []
    for dx in seq:
        f = base.copy()
        f[box[1]:box[3], box[0]:box[2]] = clean[box[1]:box[3], box[0]:box[2]]
        paste(f, base, part, dx, 0)
        frames.append(f)
    return frames, dict(part='gate_leaf', box=list(box), pivot=[58, 51], motion='translate_x', range_px=[0, 30],
                        why='створка ворот уезжает по рельсу, проём открывает выход секции ступени на путь')


JOBS = {'cargo_terminal': (cargo, 10), 'capsule_return_station': (recovery, 10), 'assembly_workshop': (factory, 10)}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--repo', default='.')
    a = ap.parse_args()
    repo = Path(a.repo).resolve()
    for asset, (fn, fps) in JOBS.items():
        d = repo / 'art/gen/placeables/base' / asset
        runtime = d / 'e0_1978.runtime.png'
        base = np.array(Image.open(runtime).convert('RGBA'))
        frames, info = fn(base)
        out = d / 'animation'
        out.mkdir(exist_ok=True)
        h, w = base.shape[:2]
        sheet = Image.new('RGBA', (w * len(frames), h), (0, 0, 0, 0))
        for i, f in enumerate(frames):
            sheet.paste(Image.fromarray(f, 'RGBA'), (i * w, 0))
        sheet_path = out / 'on_sheet.png'
        sheet.save(sheet_path)
        gif_frames = []
        for f in frames:
            im = Image.fromarray(f, 'RGBA').resize((w * 3, h * 3), Image.NEAREST)
            bg = Image.new('RGBA', im.size, (60, 90, 50, 255))
            bg.alpha_composite(im)
            gif_frames.append(bg.convert('P', palette=Image.ADAPTIVE))
        gif_frames[0].save(out / 'on.gif', save_all=True, append_images=gif_frames[1:], duration=int(1000 / fps), loop=0)
        colors_base = len({tuple(p) for p in base.reshape(-1, 4)[base.reshape(-1, 4)[:, 3] > 0]})
        colors_all = len({tuple(p) for f in frames for p in f.reshape(-1, 4)[f.reshape(-1, 4)[:, 3] > 0]})
        doc = {
            'asset': asset,
            'era': 'E0',
            'source_sprite': {'path': f'art/gen/placeables/base/{asset}/e0_1978.runtime.png', 'sha256': sha(runtime), 'size': [w, h]},
            'clips': {'ON': {
                'trigger': 'см. states.json (ON)', 'frames': len(frames), 'fps': fps, 'loop': False,
                'frame_size': [w, h], 'sheet': 'animation/on_sheet.png', 'sheet_sha256': sha(sheet_path),
                'preview_gif': 'animation/on.gif', 'rest_frame': 0, 'reduce_motion_frame': len(frames) // 2,
                'parts': [info],
                'method': 'часть вырезана из утверждённого спрайта, фон под ней восстановлен копией соседнего фона того же спрайта, смещение целыми пикселями на той же сетке',
                'palette_colors': {'base': colors_base, 'all_frames': colors_all},
            }},
            'pivot_policy': 'измерены по утверждённому спрайту, указаны в parts[].pivot (пиксели runtime-кадра)',
            'code_owned': ['свет', 'звук', 'дым', 'тени событий'],
            'runtime_integration': 'не подключено: рендер берёт статичный кадр; подключение анимации отдельным изменением кода',
        }
        (d / 'animation.json').write_text(json.dumps(doc, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
        print(json.dumps({'asset': asset, 'frames': len(frames), 'colors': [colors_base, colors_all]}, ensure_ascii=False))


if __name__ == '__main__':
    main()
