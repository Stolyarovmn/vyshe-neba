#!/usr/bin/env python3
import argparse, hashlib, json
from pathlib import Path
from PIL import Image

p=argparse.ArgumentParser()
p.add_argument('--input', required=True)
p.add_argument('--width', type=int, required=True)
p.add_argument('--height', type=int, required=True)
p.add_argument('--max-colors', type=int, default=32)
p.add_argument('--report', required=True)
a=p.parse_args()

im=Image.open(a.input).convert('RGBA')
if im.size != (a.width,a.height):
    raise SystemExit(f'QA_FAIL: size {im.size} != {(a.width,a.height)}')
alpha=set(im.getchannel('A').getdata())
if not alpha.issubset({0,255}):
    raise SystemExit(f'QA_FAIL: non-binary alpha values present: {sorted(alpha)[:12]}')
colors={(r,g,b) for r,g,b,aa in im.getdata() if aa}
if len(colors)>a.max_colors:
    raise SystemExit(f'QA_FAIL: {len(colors)} opaque RGB colors > {a.max_colors}')
b=Path(a.input).read_bytes()
report={'size':[a.width,a.height],'opaque_colors':len(colors),'binary_alpha':True,'sha256':hashlib.sha256(b).hexdigest()}
Path(a.report).parent.mkdir(parents=True,exist_ok=True)
Path(a.report).write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
print(json.dumps(report))
