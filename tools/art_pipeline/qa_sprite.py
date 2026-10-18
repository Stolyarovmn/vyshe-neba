#!/usr/bin/env python3
import argparse, hashlib, json
from pathlib import Path
from PIL import Image

p = argparse.ArgumentParser()
p.add_argument('--input', required=True)
p.add_argument('--width', type=int, required=True)
p.add_argument('--height', type=int, required=True)
p.add_argument('--max-colors', type=int, default=32)
p.add_argument('--min-coverage', type=float, default=0.01)
p.add_argument('--min-bbox-fraction', type=float, default=0.25)
p.add_argument('--report', required=True)
a = p.parse_args()

im = Image.open(a.input).convert('RGBA')
if im.size != (a.width, a.height):
    raise SystemExit(f'QA_FAIL: size {im.size} != {(a.width, a.height)}')

alpha_image = im.getchannel('A')
alpha_values = set(alpha_image.getdata())
if not alpha_values.issubset({0, 255}):
    raise SystemExit(f'QA_FAIL: non-binary alpha values present: {sorted(alpha_values)[:12]}')

opaque_pixel_count = sum(1 for value in alpha_image.getdata() if value == 255)
visible_bbox = alpha_image.getbbox()
if opaque_pixel_count == 0 or visible_bbox is None:
    raise SystemExit('QA_FAIL: sprite has no visible opaque pixels')

left, top, right, bottom = visible_bbox
bbox_width = right - left
bbox_height = bottom - top
coverage = opaque_pixel_count / (a.width * a.height)
if bbox_width < a.width * a.min_bbox_fraction or bbox_height < a.height * a.min_bbox_fraction:
    raise SystemExit(
        f'QA_FAIL: visible bbox {visible_bbox} ({bbox_width}x{bbox_height}) is too small for '
        f'{a.width}x{a.height}; min bbox fraction={a.min_bbox_fraction}'
    )
if coverage < a.min_coverage:
    raise SystemExit(
        f'QA_FAIL: opaque coverage {coverage:.6f} < min coverage {a.min_coverage:.6f}'
    )

colors = {(r, g, b) for r, g, b, aa in im.getdata() if aa}
if len(colors) > a.max_colors:
    raise SystemExit(f'QA_FAIL: {len(colors)} opaque RGB colors > {a.max_colors}')

b = Path(a.input).read_bytes()
report = {
    'size': [a.width, a.height],
    'opaque_colors': len(colors),
    'binary_alpha': True,
    'opaque_pixel_count': opaque_pixel_count,
    'coverage': round(coverage, 6),
    'visible_bbox': [left, top, right, bottom],
    'visible_bbox_size': [bbox_width, bbox_height],
    'min_coverage': a.min_coverage,
    'min_bbox_fraction': a.min_bbox_fraction,
    'sha256': hashlib.sha256(b).hexdigest(),
}
Path(a.report).parent.mkdir(parents=True, exist_ok=True)
Path(a.report).write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
print(json.dumps(report))
