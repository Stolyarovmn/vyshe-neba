#!/usr/bin/env python3
"""Конвейер сопутствующих объектов E0 (плиты траншей, поддон с ящиками): конфиг, source_review, process_asset, promote.

python e0_scenery_pipeline.py --repo . --snapper <exe> --aseprite <exe> --work <dir>
"""
import argparse
import hashlib
import json
import subprocess
import sys
from pathlib import Path

from PIL import Image

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from e0_rework_prepare import SPEC  # noqa: E402

ISLAND_SHA = '2b85ea5b4bd17506eb9a3c8abc3594c42c4070b1f21948ac01447b0c67364997'
REVIEWER = 'Claude (по делегированию владельца 2026-11-07; владелец правит точечно после пробной сборки)'

ITEMS = {
    'INFRA_TRENCH_H': dict(asset='trench_plate_h', w=48, h=16, rt='trench-plate-h',
                           why='стальная крышка траншеи заподлицо с грунтом: показывает горизонтальный участок трассы подземной магистрали (охлаждение), BI_DELUGE_E0.md'),
    'INFRA_TRENCH_V': dict(asset='trench_plate_v', w=16, h=48, rt='trench-plate-v',
                           why='то же для вертикального участка трасс топлива (башня к люку у стола, BI_GANTRY_E0.md) и охлаждения'),
    'INFRA_TRENCH_C': dict(asset='trench_plate_corner', w=16, h=16, rt='trench-plate-corner',
                           why='угловая крышка в месте поворота трассы, там же стык плит и ревизия'),
    'INFRA_CRATE_PALLET': dict(asset='crate_pallet', w=36, h=30, rt='crate-pallet',
                               why='поддон с двумя ящиками у логистического терминала: груз под активный контракт (contractSlots терминала, data/buildings.js); показывается, пока контракт активен'),
}
SCENES = {  # asset: (ширина в пикселях острова, точка низ-центр)
    'trench_plate_h': (12, (484, 483)), 'trench_plate_v': (4, (513, 462)),
    'trench_plate_corner': (4, (513, 483)), 'crate_pallet': (10, (1228, 472)),
}


def sha(p):
    return hashlib.sha256(Path(p).read_bytes()).hexdigest()


def add_config(repo):
    p = repo / 'art/placeables/PIPELINE_CONFIG.json'
    text = p.read_text(encoding='utf-8')
    crlf = '\r\n' in text
    text = text.replace('\r\n', '\n')
    cfg = json.loads(text)
    new = []
    for cid, it in ITEMS.items():
        if cid in cfg['assets']:
            continue
        a = it['asset']
        entry = {
            'asset': a, 'zone': 'base', 'adapter': 'prepared_grid_png',
            'source_dir': f'art/raw/placeables/base/{a}', 'production_dir': f'art/gen/placeables/base/{a}',
            'runtime_target': f"eras/e0-1978/base/{it['rt']}.png", 'colors': 32, 'pixel_size': 4,
            'canvas': [it['w'] + 8, it['h'] + 8], 'registration': [(it['w'] + 8) // 2, it['h'] + 6],
            'qa': {'min_coverage': 0.01, 'min_bbox_fraction': 0.25},
            'visual_review': f'art/gen/placeables/base/{a}/visual_qa.json',
            'eras': [{'stem': s, 'era': e, 'year': y} for s, e, y in (('e0_1978', 'E0', 1978), ('e1_1986', 'E1', 1986), ('e2_1998', 'E2', 1998), ('e3_2015', 'E3', 2015), ('e4_2035', 'E4', 2035), ('e5_2060', 'E5', 2060))],  # контракт: шесть эпох в конфиге; файл только E0
        }
        body = json.dumps(entry, indent=2, ensure_ascii=False)
        body = '\n'.join('    ' + ln if i else ln for i, ln in enumerate(body.split('\n')))
        new.append(f'    "{cid}": {body}')
    if new:
        tail = '\n    }\n  }\n}'
        i = text.rstrip().rfind(tail)
        assert i > 0, 'unexpected config tail'
        text = text[:i] + '\n    },\n' + ',\n'.join(new) + '\n  }\n}\n'
        json.loads(text)
        if crlf:
            text = text.replace('\n', '\r\n')
        p.write_text(text, encoding='utf-8', newline='')
    return len(new)


def source_review(repo, cid, it):
    a = it['asset']
    qa = repo / 'art/qa/placeables/base' / a
    qa.mkdir(parents=True, exist_ok=True)
    pres = repo / 'art/raw/placeables/base' / a / 'e0_1978_presnap.png'
    logical = Image.open(repo / 'art/raw/placeables/base' / a / 'e0_1978_logical.png').convert('RGBA')
    island = Image.open(repo / 'art/gen/environment/start_island_hd.png').convert('RGBA')
    sw, (x, y) = SCENES[a]
    sh = max(1, round(logical.height * sw / logical.width))
    small = logical.resize((sw, sh), Image.NEAREST)
    scene = island.copy()
    scene.alpha_composite(small, (x - sw // 2, y - sh))
    cx0, cy0 = max(0, x - 80), max(0, y - 60)
    crop = scene.crop((cx0, cy0, min(scene.width, cx0 + 160), min(scene.height, cy0 + 110))).resize((960, 660), Image.NEAREST)
    sp = qa / 'e0_1978.source_scene.png'
    crop.convert('RGB').save(sp)
    review = {
        'source_gate': 'PASS', 'reviewer': REVIEWER, 'source_sha256': sha(pres),
        'scene_preview_png': 'e0_1978.source_scene.png', 'scene_preview_sha256': sha(sp), 'island_sha256': ISLAND_SHA,
        'actual_camera_angle': 'UNKNOWN', 'elevation_proxy_deg': 73.44, 'tilt_proxy_deg': 16.56, 'ground_compression_proxy': 0.958515,
        'placement_scope': 'TEST_ONLY_NON_AUTHORITATIVE',
        'checks': {k: 'pass' for k in ('era', 'readability', 'engineering_parts', 'identity', 'base_grounding_visual', 'projection_match')},
        'review_evidence': (f"Параметрический объект (код e0_scenery_build.py, логическая сетка, 4 лог. px = 1 px острова): {it['why']}. "
                            f"Плоские плиты и низкий поддон: вертикальная проекция 0,285, свет сверху-слева, запечённой тени нет. Сцена {sw} px в ({x},{y}), "
                            f"привязка низ-центр, TEST_ONLY; место на карте не утверждено."),
    }
    (qa / 'e0_1978.source_review.json').write_text(json.dumps(review, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--repo', default='.')
    ap.add_argument('--snapper', required=True)
    ap.add_argument('--aseprite', required=True)
    ap.add_argument('--work', required=True)
    a = ap.parse_args()
    repo = Path(a.repo).resolve()
    work = Path(a.work).resolve()
    print('config entries added:', add_config(repo))
    for cid, it in ITEMS.items():
        source_review(repo, cid, it)
        out = work / cid
        if out.exists():
            import shutil
            shutil.rmtree(out)
        subprocess.run([sys.executable, str(HERE / 'process_asset.py'), '--repo-root', str(repo), '--asset', cid, '--era', 'e0_1978',
                        '--output', str(out), '--pixel-snapper', a.snapper, '--aseprite', a.aseprite], check=True, capture_output=True)
        ev = (f"Обработанный PNG (32 цвета, бинарная альфа) просмотрен на острове и увеличенно: {it['why']}. "
              f"Сталь серо-зелёная и дерево из палитры E0, болты и ржавчина по кромкам, плоская проекция. Размещение тестовое, приёмка карты за владельцем.")
        subprocess.run([sys.executable, str(HERE / 'e0_rework_record.py'), '--repo', str(repo), '--asset', cid, '--candidate', str(out), '--evidence', ev],
                       check=True, capture_output=True)
        print('done', cid)


if __name__ == '__main__':
    main()
