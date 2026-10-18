#!/usr/bin/env python3
from pathlib import Path
p=Path(__file__).resolve().parents[1]/'outputs/rocket/dist/world-art.js'
s=p.read_text()
old="if(baseRig&&top>-132&&bottom<600){"
new="if(baseRig&&top>-132&&bottom<600&&right>LEFT&&left<LEFT+WIDTH){"
if s.count(old)!=1: raise SystemExit(f'base rig visibility block count={s.count(old)}')
p.write_text(s.replace(old,new))
print('remote base rig culling applied')
