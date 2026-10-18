#!/usr/bin/env python3
from pathlib import Path
p=Path(__file__).resolve().parents[1]/'live/aircraft.js'
s=p.read_text()
old=""" if(y<300)return variant%3===2?'balloon':'plane';
 if(y<1200)return variant%4===3?'balloon':'plane';
 if(y<1800)return variant%4===3?'balloon':'plane';"""
new=""" if(y<300)return variant===0?'plane':'balloon';
 if(y<1200)return variant===0?'plane':'balloon';
 if(y<1800)return variant===0?'plane':'balloon';"""
if s.count(old)!=1: raise SystemExit('aircraft density block not found exactly once')
p.write_text(s.replace(old,new))
print('aircraft density patch applied')
