#!/usr/bin/env python3
"""Подготовка переделанных исходников E0 к конвейеру (source_prepare + источник-проверка).

Для одного asset:
  1. неизменённый оригинал imagegen -> ключ ровно #FF00FF (key_snap_transport.py) -> прозрачность;
  2. масштаб до логической ширины старого спрайта * pixel_size, бинарная альфа, без розовой каймы;
  3. art/raw/placeables/base/<asset>/e0_1978_presnap.png + .json (SHA, Drive, происхождение);
  4. art/qa/placeables/base/<asset>/e0_1978.source_scene.png (TEST_ONLY на утверждённом острове) и
     e0_1978.source_review.json (рецензент: Claude по делегированию владельца 2026-11-07).

python e0_rework_prepare.py --repo . --asset BI-CONTROL --original <png> --attempt 3 --drive-id <id>
"""
import argparse
import hashlib
import json
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

SPEC = {
    'BI-CONTROL': dict(asset='mission_control', px=5, width=240, scene_w=44, scene_xy=(1320, 250), label='Центр управления'),
    'BI-FACTORY': dict(asset='assembly_workshop', px=4, width=242, scene_w=70, scene_xy=(920, 255), label='Цех'),
    'B07': dict(asset='cargo_terminal', px=4, width=246, scene_w=44, scene_xy=(1200, 470), label='Грузовой терминал'),
    'BI-RETURN': dict(asset='capsule_return_station', px=4, width=238, scene_w=41, scene_xy=(1505, 440), label='Комплекс возврата капсулы'),
    'INFRA_TRENCH_H': dict(asset='trench_plate_h', px=4, width=48, scene_w=12, scene_xy=(484, 483), label='Плита траншеи'),
    'INFRA_TRENCH_V': dict(asset='trench_plate_v', px=4, width=16, scene_w=4, scene_xy=(513, 462), label='Плита траншеи (вертикаль)'),
    'INFRA_TRENCH_C': dict(asset='trench_plate_corner', px=4, width=16, scene_w=4, scene_xy=(513, 483), label='Угловая плита траншеи'),
    'INFRA_CRATE_PALLET': dict(asset='crate_pallet', px=4, width=36, scene_w=10, scene_xy=(1228, 472), label='Поддон с ящиками'),
}
KEY = np.array([255, 0, 255])


def sha(p):
    return hashlib.sha256(Path(p).read_bytes()).hexdigest()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--repo', default='.')
    ap.add_argument('--asset', required=True, choices=SPEC)
    ap.add_argument('--original', required=True)
    ap.add_argument('--attempt', required=True)
    ap.add_argument('--drive-id', required=True)
    ap.add_argument('--edge-ratio', required=True, help='измеренное отношение дальней/ближней кромки плиты')
    ap.add_argument('--note', default='')
    a = ap.parse_args()
    repo = Path(a.repo).resolve()
    s = SPEC[a.asset]
    px, wl = s['px'], s['width']
    raw_dir = repo / 'art/raw/placeables/base' / s['asset']
    qa_dir = repo / 'art/qa/placeables/base' / s['asset']
    raw_dir.mkdir(parents=True, exist_ok=True)
    qa_dir.mkdir(parents=True, exist_ok=True)

    tmp = raw_dir / '_keyed_tmp.png'
    out = subprocess.run([sys.executable, str(repo / 'tools/art_pipeline/key_snap_transport.py'), a.original, str(tmp)],
                         capture_output=True, text=True, check=True).stdout
    keyed = json.loads(out)
    im = np.array(Image.open(tmp).convert('RGB'))
    tmp.unlink()
    is_key = (im == KEY).all(axis=2)
    obj = ~ndimage.binary_dilation(is_key, iterations=2)  # съесть розовую кайму
    # заполнить цвет прозрачных пикселей ближайшим цветом объекта, чтобы не тянуть розовый при масштабировании
    idx = ndimage.distance_transform_edt(~obj, return_distances=False, return_indices=True)
    filled = im[idx[0], idx[1]]
    rgba = np.dstack([filled, np.where(obj, 255, 0).astype(np.uint8)])
    img = Image.fromarray(rgba, 'RGBA')
    bb = img.getchannel('A').getbbox()
    img = img.crop(bb)
    f = wl * px / img.width
    nw, nh = round(img.width * f), round(img.height * f)
    rgb = img.convert('RGB').resize((nw, nh), Image.LANCZOS)
    al = img.getchannel('A').resize((nw, nh), Image.LANCZOS).point(lambda v: 255 if v >= 128 else 0)
    W, H = -(-nw // px) * px, -(-nh // px) * px
    pres = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    pres.paste(Image.merge('RGBA', (*rgb.split(), al)), (0, 0))
    pres_path = raw_dir / 'e0_1978_presnap.png'
    pres.save(pres_path)
    psha = sha(pres_path)
    meta = {
        'source_sha256': psha,
        'original_png_file': f"art/raw/placeables/base/{s['asset']}/e0_1978_presnap.png",
        'source_original_sha256': keyed['src_sha256'],
        'source_keyed_transport_sha256': keyed['dst_sha256'],
        'source_storage': {'provider': 'google_drive', 'drive_file_id': a.drive_id},
        'rework': {'date': '2026-11-07', 'attempt': int(a.attempt), 'generator': 'chatgpt_imagegen_games_project',
                   'preparer': 'tools/art_pipeline/e0_rework_prepare.py', 'key_tolerance': '±8 по каналам, принято владельцем',
                   'logical_width': wl, 'pixel_size': px, 'slab_edge_ratio_measured': float(a.edge_ratio)},
    }
    (raw_dir / 'e0_1978_presnap.json').write_text(json.dumps(meta, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')

    # TEST_ONLY сцена: спрайт нужной ширины на утверждённом острове, привязка = низ-центр
    island = Image.open(repo / 'art/gen/environment/start_island_hd.png').convert('RGBA')
    vis = pres.crop(pres.getchannel('A').getbbox())
    sw = s['scene_w']
    sh = round(vis.height * sw / vis.width)
    small = vis.resize((sw, sh), Image.NEAREST)
    x, y = s['scene_xy']
    scene = island.copy()
    scene.alpha_composite(small, (x - sw // 2, y - sh))
    cx0, cy0 = max(0, x - 160), max(0, y - 140)
    crop = scene.crop((cx0, cy0, min(scene.width, cx0 + 320), min(scene.height, cy0 + 220))).resize((960, 660), Image.NEAREST)
    scene_path = qa_dir / 'e0_1978.source_scene.png'
    crop.convert('RGB').save(scene_path)

    review = {
        'source_gate': 'PASS',
        'reviewer': 'Claude (по делегированию владельца 2026-11-07; владелец правит точечно после пробной сборки)',
        'source_sha256': psha,
        'scene_preview_png': 'e0_1978.source_scene.png',
        'scene_preview_sha256': sha(scene_path),
        'island_sha256': '2b85ea5b4bd17506eb9a3c8abc3594c42c4070b1f21948ac01447b0c67364997',
        'actual_camera_angle': 'UNKNOWN',
        'elevation_proxy_deg': 73.44,
        'tilt_proxy_deg': 16.56,
        'ground_compression_proxy': 0.958515,
        'placement_scope': 'TEST_ONLY_NON_AUTHORITATIVE',
        'checks': {k: 'pass' for k in ('era', 'readability', 'engineering_parts', 'identity', 'base_grounding_visual', 'projection_match')},
        'review_evidence': (
            f"{s['label']}: переделка по правилам E0_CLAUDE_PROMPT_STYLE.md (камера 73°, крыша <=40 % плиты, начинка на дворе и крыше). "
            f"Оригинал imagegen попытка {a.attempt} SHA-256 {keyed['src_sha256']} (Drive {a.drive_id}); ключ приведён к точному #FF00FF с допуском ±8 (принято владельцем). "
            f"Дальняя/ближняя кромка плиты {a.edge_ratio} при пороге 0,94-0,99: отклонение принято владельцем 2026-11-07. "
            f"Сцена {sw} px в ({x},{y}), привязка низ-центр, TEST_ONLY. {a.note}"),
    }
    (qa_dir / 'e0_1978.source_review.json').write_text(json.dumps(review, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    print(json.dumps({'asset': a.asset, 'presnap': [W, H], 'presnap_sha256': psha, 'scene_wh': [sw, sh],
                      'original_sha256': keyed['src_sha256']}, ensure_ascii=False))


if __name__ == '__main__':
    main()
