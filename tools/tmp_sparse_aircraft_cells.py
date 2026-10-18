#!/usr/bin/env python3
from pathlib import Path
root=Path(__file__).resolve().parents[1]

# Make random aircraft eligible only in sparse deterministic world cells.
p=root/'live/aircraft.js'
s=p.read_text()
old="""const objectKind0=J.objectKind.bind(J);
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
new="""const objectKind0=J.objectKind.bind(J);
const planeSlot=(y,era,variant,ix=0,iy=0,j=0)=>variant===0&&((Math.floor(y/225)+era)&1)===0&&Math.abs(ix*17+iy*31+j*7)%4===0;
J.objectKind=function(y,mode,era,variant,ix=0,iy=0,j=0){
 if(mode===2||mode===4)return objectKind0(y,mode,era,variant);
 era=Math.max(0,Math.min(5,Number(era)||0));
 if(y<30)return objectKind0(y,mode,era,variant);
 if(y<300)return planeSlot(y,era,variant,ix,iy,j)?'plane':'balloon';
 if(y<1200)return planeSlot(y,era,variant,ix,iy,j)?'plane':'balloon';
 if(y<1800)return planeSlot(y,era,variant,ix,iy,j)?'plane':'balloon';
 const ceiling=(traffic.experimentalCeilingByEraWorldY||DEFAULT_TRAFFIC.experimentalCeilingByEraWorldY)[era]||2000;
 if(y<ceiling)return planeSlot(y,era,variant,ix,iy,j)?'plane':'rock';
 if(y<3500)return 'balloon';
 if(y<8500)return 'rock';
 return variant%2?'satellite':'rock';
};"""
if s.count(old)!=1: raise SystemExit('aircraft planeSlot block not found exactly once')
p.write_text(s.replace(old,new))

p=root/'outputs/rocket/dist/game.js'
s=p.read_text()
old="let variant=Math.floor(rng()*3),kind=J.objectKind(hy,rocket.mode,profile.base,variant);"
new="let variant=Math.floor(rng()*3),kind=J.objectKind(hy,rocket.mode,profile.base,variant,ix,iy,j);"
if s.count(old)!=1: raise SystemExit('game objectKind call not found exactly once')
s=s.replace(old,new)
old_api="project:worldToScreen,start:startFlight,goto,save,finish:finishFlight,step:updateFlight,render,renderAt(t){clock=t;trafficClock=t;render();},get result(){return result;}};"
new_api="project:worldToScreen,start:startFlight,goto,save,finish:finishFlight,step:updateFlight,render,renderAt(t){clock=t;trafficClock=t;render();},setLaunchSeed(n){launchSeed=(Number(n)>>>0)%1000000;homeTrafficCache=null;},get result(){return result;}};"
if s.count(old_api)!=1: raise SystemExit('Game API tail not found exactly once')
p.write_text(s.replace(old_api,new_api))
print('sparse aircraft cell patch applied')
