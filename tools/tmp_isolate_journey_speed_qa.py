#!/usr/bin/env python3
from pathlib import Path
p=Path(__file__).resolve().parents[1]/'outputs/rocket/qa-journey.cjs'
s=p.read_text()
old="for(let o of Game.objects)if(o.type==='hazard')o.active=false;Game.step(1/120);let r=Game.rocket,pos=Game.project(r.x,r.y);"
new="for(let o of Game.objects)o.active=false;Game.step(1/120);let r=Game.rocket,pos=Game.project(r.x,r.y);"
if s.count(old)!=1: raise SystemExit(f'expected one ascent isolation block, got {s.count(old)}')
s=s.replace(old,new)
old="assert(run.max<=89&&run.bounds);"
new="assert(run.max<=89&&run.bounds,'50s ascent camera/speed contract: '+JSON.stringify(run));"
if s.count(old)!=1: raise SystemExit(f'expected one ascent assertion, got {s.count(old)}')
p.write_text(s)
print('journey speed QA isolated from all world pickups/gates')
