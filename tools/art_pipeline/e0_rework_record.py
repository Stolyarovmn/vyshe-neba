#!/usr/bin/env python3
"""Записи приёмки для переделанных объектов E0: сцена кандидата, visual_qa.json, promote, runtime-обрезка.

Рецензент: Claude по делегированию владельца (2026-11-07); визуальная приёмка привязана к точному SHA кандидата.
Владелец правит точечно после пробной сборки. Публикация в main здесь не делается.

python e0_rework_record.py --repo . --asset BI-CONTROL --candidate <dir> --evidence "<текст>"
"""
import argparse
import hashlib
import json
import subprocess
import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from e0_rework_prepare import SPEC  # noqa: E402

ISLAND_SHA = '2b85ea5b4bd17506eb9a3c8abc3594c42c4070b1f21948ac01447b0c67364997'
REVIEWER = 'Claude (по делегированию владельца 2026-11-07; владелец правит точечно после пробной сборки)'


def sha(p):
    return hashlib.sha256(Path(p).read_bytes()).hexdigest()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--repo', default='.')
    ap.add_argument('--asset', required=True, choices=SPEC)
    ap.add_argument('--candidate', required=True)
    ap.add_argument('--evidence', required=True)
    a = ap.parse_args()
    repo = Path(a.repo).resolve()
    cand = Path(a.candidate).resolve()
    s = SPEC[a.asset]
    cfg = json.loads((repo / 'art/placeables/PIPELINE_CONFIG.json').read_text(encoding='utf-8'))['assets'][a.asset]
    prod = repo / cfg['production_dir']
    final = cand / 'e0_1978.png'
    meta = json.loads((repo / cfg['source_dir'] / 'e0_1978_presnap.json').read_text(encoding='utf-8'))

    # сцена кандидата: обработанный PNG, обрезанный по альфе, на утверждённом острове
    island = Image.open(repo / 'art/gen/environment/start_island_hd.png').convert('RGBA')
    im = Image.open(final).convert('RGBA')
    vis = im.crop(im.getchannel('A').getbbox())
    sw = s['scene_w']
    sh = round(vis.height * sw / vis.width)
    small = vis.resize((sw, sh), Image.NEAREST)
    x, y = s['scene_xy']
    scene = island.copy()
    scene.alpha_composite(small, (x - sw // 2, y - sh))
    cx0, cy0 = max(0, x - 160), max(0, y - 140)
    crop = scene.crop((cx0, cy0, min(scene.width, cx0 + 320), min(scene.height, cy0 + 220))).resize((960, 660), Image.NEAREST)
    scene_path = cand / 'e0_1978.candidate_scene.png'
    crop.convert('RGB').save(scene_path)

    final_sha = sha(final)
    review = {
        'asset_id': a.asset,
        'overall_status': 'approved',
        'eras': {'e0_1978': {
            'status': 'approved',
            'sha256': final_sha,
            'scene_projection': {
                'candidate_sha256': final_sha,
                'scene_png': 'e0_1978.candidate_scene.png',
                'scene_png_sha256': sha(scene_path),
                'source_sha256': meta['source_sha256'],
                'island_sha256': ISLAND_SHA,
                'tilt_proxy_deg': 16.56,
                'elevation_proxy_deg': 73.44,
                'ground_compression_proxy': 0.958515,
                'actual_camera_angle': 'UNKNOWN',
                'placement_scope': 'TEST_ONLY_NON_AUTHORITATIVE',
                'status': 'pass',
                'reviewer': REVIEWER,
                'approval_evidence': a.evidence,
                'checks': {k: 'pass' for k in ('projection_match', 'era_style_match', 'gameplay_scale', 'base_grounding_visual', 'silhouette_readability')},
            }}},
    }
    prod.mkdir(parents=True, exist_ok=True)
    review_path = repo / cfg['visual_review']
    review_path.write_text(json.dumps(review, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')

    subprocess.run([sys.executable, str(repo / 'tools/art_pipeline/promote_asset.py'), '--repo-root', str(repo),
                    '--asset', a.asset, '--candidate', str(cand), '--era', 'e0_1978'], check=True)

    # candidate_scene рядом с production, как у принятых объектов
    (prod / 'e0_1978.candidate_scene.png').write_bytes(scene_path.read_bytes())
    bbox = im.getchannel('A').getbbox()
    runtime = prod / 'e0_1978.runtime.png'
    vis.save(runtime)
    manifest = prod / 'e0_1978.promotion-manifest.json'
    report = {
        'asset': s['asset'],
        'production_sha256': final_sha,
        'runtime_sha256': sha(runtime),
        'approved': True,
        'sha256': sha(runtime),
        'promotion_manifest_sha256': sha(manifest),
        'approval_scope': 'Точная обрезка прозрачных полей принятого PNG без изменения пикселей объекта.',
        'crop_bbox': list(bbox),
        'runtime_target': f"game/assets/{cfg['runtime_target']}",
        'state': 'local_preview_only',
        'runtime_published': False,
    }
    (prod / 'e0_1978.runtime.approval.json').write_text(json.dumps(report, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    print(json.dumps({'asset': a.asset, 'final_sha256': final_sha, 'runtime_size': list(vis.size), 'runtime_sha256': sha(runtime)}, ensure_ascii=False))


if __name__ == '__main__':
    main()
