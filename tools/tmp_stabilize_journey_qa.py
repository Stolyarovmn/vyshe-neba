#!/usr/bin/env python3
from pathlib import Path
p=Path(__file__).resolve().parents[1]/'outputs/rocket/qa-journey.cjs'
s=p.read_text()
old="await page.waitForTimeout(700);await page.evaluate(()=>Game.start());await page.keyboard.down('KeyW');"
new="await page.waitForTimeout(700);await page.evaluate(()=>{Game.setLaunchSeed?.(424242);Game.start();});await page.keyboard.down('KeyW');"
if s.count(old)!=1: raise SystemExit(f'journey start count={s.count(old)}')
s=s.replace(old,new)
old="assert(run.max<=89&&run.bounds);"
new="assert(run.max<=89&&run.bounds,'50s ascent camera/speed contract: '+JSON.stringify(run));"
if s.count(old)!=1: raise SystemExit(f'journey assertion count={s.count(old)}')
p.write_text(s)
print('journey QA stabilized on deterministic weather seed')
