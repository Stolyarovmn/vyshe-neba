#!/usr/bin/env python3
from pathlib import Path
p=Path(__file__).resolve().parents[1]/'live/aircraft.js'
s=p.read_text()
old="""const objectKind0=J.objectKind.bind(J);
J.objectKind=function(y,mode,era,variant){
 if(mode===2||mode===4)return objectKind0(y,mode,era,variant);
 era=Math.max(0,Math.min(5,Number(era)||0));
 if(y<30)return objectKind0(y,mode,era,variant);
 if(y<300)return variant===0?'plane':'balloon';
 if(y<1200)return variant===0?'plane':'balloon';
 if(y<1800)return variant===0?'plane':'balloon';
 const ceiling=(traffic.experimentalCeilingByEraWorldY||DEFAULT_TRAFFIC.experimentalCeilingByEraWorldY)[era]||2000;
 if(y<ceiling)return variant%3===0?'plane':'rock';
 if(y<3500)return 'balloon';
 if(y<8500)return 'rock';
 return variant%2?'satellite':'rock';
};"""
new="""const objectKind0=J.objectKind.bind(J);
const planeSlot=(y,era,variant)=>variant===0&&((Math.floor(y/225)+era)&1)===0;
J.objectKind=function(y,mode,era,variant){
 if(mode===2||mode===4)return objectKind0(y,mode,era,variant);
 era=Math.max(0,Math.min(5,Number(era)||0));
 if(y<30)return objectKind0(y,mode,era,variant);
 if(y<300)return planeSlot(y,era,variant)?'plane':'balloon';
 if(y<1200)return planeSlot(y,era,variant)?'plane':'balloon';
 if(y<1800)return planeSlot(y,era,variant)?'plane':'balloon';
 const ceiling=(traffic.experimentalCeilingByEraWorldY||DEFAULT_TRAFFIC.experimentalCeilingByEraWorldY)[era]||2000;
 if(y<ceiling)return planeSlot(y,era,variant)?'plane':'rock';
 if(y<3500)return 'balloon';
 if(y<8500)return 'rock';
 return variant%2?'satellite':'rock';
};"""
if s.count(old)!=1: raise SystemExit('aircraft slot block not found exactly once')
p.write_text(s.replace(old,new))
print('aircraft spacing patch applied')
