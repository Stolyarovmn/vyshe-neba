#!/usr/bin/env python3
import argparse
from pathlib import Path
from PIL import Image

p=argparse.ArgumentParser()
p.add_argument('--input', required=True)
p.add_argument('--output', required=True)
p.add_argument('--width', type=int, required=True)
p.add_argument('--height', type=int, required=True)
p.add_argument('--anchor-x', type=int, required=True)
p.add_argument('--anchor-y', type=int, required=True)
p.add_argument('--alpha-threshold', type=int, default=8)
p.add_argument('--padding', type=int, default=2)
a=p.parse_args()

im=Image.open(a.input).convert('RGBA')
alpha=im.getchannel('A')
mask=alpha.point(lambda v: 255 if v > a.alpha_threshold else 0)
bbox=mask.getbbox()
if not bbox:
    raise SystemExit('QA_FAIL: sprite has no visible pixels')
obj=im.crop(bbox)
r,g,b,aa=obj.split()
aa=aa.point(lambda v: 255 if v > a.alpha_threshold else 0)
obj=Image.merge('RGBA',(r,g,b,aa))
max_w=a.width-2*a.padding
max_h=a.anchor_y-a.padding
if obj.width > max_w or obj.height > max_h:
    raise SystemExit(
        f'QA_FAIL: snapped object {obj.width}x{obj.height} exceeds target envelope '
        f'{max_w}x{max_h}; increase Pixel Snapper --pixel-size instead of rescaling')
left=round(a.anchor_x-obj.width/2)
top=a.anchor_y-obj.height
if left < a.padding or left+obj.width > a.width-a.padding or top < a.padding:
    raise SystemExit(f'QA_FAIL: placement out of canvas: left={left}, top={top}')
canvas=Image.new('RGBA',(a.width,a.height),(0,0,0,0))
canvas.alpha_composite(obj,(left,top))
Path(a.output).parent.mkdir(parents=True,exist_ok=True)
canvas.save(a.output)
print(f'normalized={a.output} size={canvas.size} object={obj.size} anchor=({a.anchor_x},{a.anchor_y})')
