#!/usr/bin/env python3
from pathlib import Path
import json, re

ROOT=Path(__file__).resolve().parents[1]

def sub_once(text, pattern, replacement, label):
    out,n=re.subn(pattern,replacement,text,count=1,flags=re.S)
    if n!=1:
        raise SystemExit(f'{label}: expected one replacement, got {n}')
    return out

# 1) World background: tile only the distant sky. The recognizable base scene is a single world object.
p=ROOT/'outputs/rocket/dist/world-art.js'
s=p.read_text()
s=s.replace('let atlas=null,atlasEra=-1;','let atlas=null,baseLayer=null,baseLayerEra=-1;')
s=sub_once(s,r'function earthAtlas\(art,era\)\{.*?\n\}\nfunction color',r'''function earthAtlas(art){
 if(!art.routeSky?.naturalWidth)return null;
 if(atlas)return atlas;
 atlas=document.createElement('canvas');atlas.width=WIDTH;atlas.height=TOP-BOTTOM;
 let c=atlas.getContext('2d');c.imageSmoothingEnabled=false;
 c.drawImage(art.routeSky,0,0,WIDTH,TOP+100);
 let cap=c.createLinearGradient(0,0,0,180);cap.addColorStop(0,'#030818');cap.addColorStop(1,'#03081800');c.fillStyle=cap;c.fillRect(0,0,WIDTH,180);
 return atlas;
}
function earthBase(art,era){
 if(!art.base?.naturalWidth)return null;
 if(baseLayer&&baseLayerEra===era)return baseLayer;
 baseLayer=document.createElement('canvas');baseLayer.width=WIDTH;baseLayer.height=800;
 let c=baseLayer.getContext('2d');c.imageSmoothingEnabled=false;
 let tile=document.createElement('canvas');tile.width=1280;tile.height=800;
 let b=tile.getContext('2d'),cw=art.base.naturalWidth/3,ch=art.base.naturalHeight/2;
 b.imageSmoothingEnabled=false;b.drawImage(art.base,era%3*cw+2,Math.floor(era/3)*ch+2,cw-4,ch-4,0,0,1280,800);
 b.globalCompositeOperation='destination-in';let g=b.createLinearGradient(0,0,0,145);g.addColorStop(0,'transparent');g.addColorStop(1,'#fff');b.fillStyle=g;b.fillRect(0,0,1280,800);
 c.drawImage(tile,BASE_LEFT,0);
 c.save();c.translate(BASE_LEFT,0);c.scale(-1,1);c.drawImage(tile,0,0,BASE_LEFT,800,0,0,BASE_LEFT,800);c.restore();
 let right=WIDTH-BASE_LEFT-1280;c.save();c.translate(WIDTH,0);c.scale(-1,1);c.drawImage(tile,1280-right,0,right,800,0,0,right,800);c.restore();
 baseLayerEra=era;return baseLayer;
}
function color''','world atlas split')
s=sub_once(s,r"if\(!local\)\{let map=earthAtlas\(art,p\.base\|\|0\);if\(map\)\{.*?\n  \}\n  let floor=project\(0,BOTTOM\+2\)\.y;",r'''if(!local){let map=earthAtlas(art);if(map){
   for(let band=Math.floor((left-LEFT)/WIDTH);band<=Math.floor((right-LEFT)/WIDTH);band++){
    let q=project(LEFT+band*WIDTH,TOP);ctx.save();
    if(Math.abs(band)%2){ctx.translate(q.x+WIDTH*z,q.y);ctx.scale(-1,1);}else ctx.translate(q.x,q.y);
    ctx.drawImage(map,0,0,map.width,map.height,0,0,WIDTH*z,map.height*z);ctx.restore();
   }
  }
  let base=earthBase(art,p.base||0);if(base){let q=project(LEFT,BASE_FLOOR);ctx.drawImage(base,q.x,q.y,WIDTH*z,base.height*z);}
  let floor=project(0,BOTTOM+2).y;''','world map draw')
s=sub_once(s,r"  const baseRig=root\.WorldSprites\?\.manifest\.base;\n  if\(baseRig&&top>-132&&bottom<600\)\{.*?\n  \}\n  stars\(\);",r'''  const baseRig=root.WorldSprites?.manifest.base;
  if(baseRig&&top>-132&&bottom<600){
   const rig=baseRig.eras[p.base||0],cw=baseRig.size[0]/3,ch=baseRig.size[1]/2,t=r.time||0;
   const point=(u,v)=>{const ax=BASE_LEFT+(u-2)*1280/(cw-4),wy=600-(v-2)*800/(ch-4);return project(LEFT+ax,wy);};
   for(const [kind,list]of [['lamp',rig.lamps],['beacon',rig.beacons]])for(const [i,a]of list.entries()){
    const q=point(a.x,a.y),on=kind==='lamp'?.85+.15*Math.sin(t*1.3+i):((t+i*.19)%1.32<.18?1:0);
    if(!on)continue;ctx.save();ctx.globalAlpha=on;const radius=(kind==='lamp'?12:5)*z,g=ctx.createRadialGradient(q.x,q.y,0,q.x,q.y,radius);
    g.addColorStop(0,a.suggestedColor+'70');g.addColorStop(1,a.suggestedColor+'00');ctx.fillStyle=g;ctx.fillRect(q.x-radius,q.y-radius,radius*2,radius*2);rect(q.x-z,q.y-z,2*z,z,a.suggestedColor);ctx.restore();
   }
   if((p.base||0)===5)for(const [i,[u,v,w,part]]of root.WorldSprites.manifest.baseDrones.placements.entries()){
    const q=point(u+Math.sin(t*.6+i)*1.5,v+Math.sin(t*1.2+i)*1.2);ctx.save();ctx.translate(q.x,q.y);root.WorldSprites.baseDrone(ctx,part,0,0,w*z,t+i);ctx.restore();
   }
  }
  stars();''','base rig single placement')
p.write_text(s)

# 2) Aircraft vertical contract: 10 m per world unit, no aircraft at 80-95 km.
p=ROOT/'live/aircraft.js'
s=p.read_text()
s=sub_once(s,r"const DEFAULT_TRAFFIC=\{previousEraMix:\.18,experimentalCeilingByEraWorldY:\[.*?\],layers:\[.*?\]\};",r'''const DEFAULT_TRAFFIC={previousEraMix:.18,experimentalCeilingByEraWorldY:[2000,2100,2200,2300,2400,2400],layers:[
 {id:'safe',min:0,max:30,weights:{}},
 {id:'low',min:30,max:300,weights:{low_primary:.70,low_multiwing:.30}},
 {id:'mixed',min:300,max:600,weights:{medium_cargo:.50,medium_passenger:.35,low_primary:.10,low_multiwing:.05}},
 {id:'cruise',min:600,max:1200,weights:{medium_passenger:.60,medium_cargo:.35,high_fighter:.05}},
 {id:'high',min:1200,max:1800,weights:{high_fighter:.70,high_experimental:.30}},
 {id:'experimental',min:1800,max:2400,weights:{high_experimental:1}}
]};''','aircraft defaults')
s=sub_once(s,r"J\.objectKind=function\(y,mode,era,variant\)\{.*?\n\};",r'''J.objectKind=function(y,mode,era,variant){
 if(mode===2||mode===4)return objectKind0(y,mode,era,variant);
 era=Math.max(0,Math.min(5,Number(era)||0));
 if(y<30)return objectKind0(y,mode,era,variant);
 if(y<300)return variant%3===2?'balloon':'plane';
 if(y<1200)return variant%4===3?'balloon':'plane';
 if(y<1800)return variant%4===3?'balloon':'plane';
 const ceiling=(traffic.experimentalCeilingByEraWorldY||DEFAULT_TRAFFIC.experimentalCeilingByEraWorldY)[era]||2000;
 if(y<ceiling)return variant%3===0?'plane':'rock';
 if(y<3500)return 'balloon';
 if(y<8500)return 'rock';
 return variant%2?'satellite':'rock';
};''','aircraft height override')
p.write_text(s)

# Keep runtime traffic data aligned with the code fallback.
p=ROOT/'outputs/rocket/dist/assets/aircraft/traffic.json'
data=json.loads(p.read_text())
data['layers']=[
 {'id':'safe','min':0,'max':30,'aircraft':[]},
 {'id':'low','min':30,'max':300,'weights':{'low_primary':0.70,'low_multiwing':0.30}},
 {'id':'mixed','min':300,'max':600,'weights':{'medium_cargo':0.50,'medium_passenger':0.35,'low_primary':0.10,'low_multiwing':0.05}},
 {'id':'cruise','min':600,'max':1200,'weights':{'medium_passenger':0.60,'medium_cargo':0.35,'high_fighter':0.05}},
 {'id':'high','min':1200,'max':1800,'weights':{'high_fighter':0.70,'high_experimental':0.30}},
 {'id':'experimental','min':1800,'max':2400,'weights':{'high_experimental':1.0}},
]
data['experimentalCeilingByEraWorldY']=[2000,2100,2200,2300,2400,2400]
p.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')

# 3) World streaming: viewport-driven cells + safe offscreen traffic recycle.
p=ROOT/'outputs/rocket/dist/game.js'
s=p.read_text()
replacement=r'''const WORLD_CELL_W=600,WORLD_CELL_H=450,TRAFFIC_HALF_ROUTE=1600,WORLD_STREAM_MARGIN=360;
function genWorld(){let z=Math.max(.7,cam.zoom||1),left=cam.x-528/z,right=cam.x+432/z,bottom=cam.y-132/z,top=cam.y+468/z,near=[];
 let minIx=Math.floor((left-TRAFFIC_HALF_ROUTE-WORLD_STREAM_MARGIN-535)/WORLD_CELL_W),maxIx=Math.ceil((right+TRAFFIC_HALF_ROUTE+WORLD_STREAM_MARGIN-65)/WORLD_CELL_W),minIy=Math.max(0,Math.floor((bottom-WORLD_STREAM_MARGIN-420)/WORLD_CELL_H)),maxIy=Math.ceil((top+WORLD_STREAM_MARGIN-100)/WORLD_CELL_H);
 for(let ix=minIx;ix<=maxIx;ix++)for(let iy=minIy;iy<=maxIy;iy++){let id=ix+','+iy;if(!worldCells.has(id)){let rng=seed(rocket.seed+ix*8121+iy*28411),list=[],baseY=iy*WORLD_CELL_H;for(let j=0;j<6;j++){let x=ix*WORLD_CELL_W+45+rng()*510,y=baseY+100+rng()*320;list.push({type:'coin',x,y,r:9,active:true});}let x=ix*WORLD_CELL_W+90+rng()*420,y=baseY+170+rng()*200;if(iy>0||Math.abs(x)>150)list.push({type:'ring',x,y,r:35,active:true});if(rocket.mode===1)list.push({type:'ring',x:x+100,y:y+90,r:35,active:true});if(rng()<.35)list.push({type:'fuel',x:ix*WORLD_CELL_W+60+rng()*480,y:baseY+180+rng()*220,r:15,active:true});if(rng()<.13)list.push({type:'repair',x:ix*WORLD_CELL_W+80+rng()*440,y:baseY+180+rng()*220,r:15,active:true});for(let j=0;j<1+Math.floor(profile.base/3);j++){let hx=ix*WORLD_CELL_W+65+rng()*470,hy=baseY+160+rng()*250;if((rocket.mode===2||rocket.mode===4)&&hy<230)continue;if(iy===0&&Math.abs(hx)<130)continue;let variant=Math.floor(rng()*3),kind=J.objectKind(hy,rocket.mode,profile.base,variant);list.push({type:'hazard',kind,x:hx,y:hy,originX:hx,originY:hy,r:kind==='plane'?32:kind==='balloon'?25:kind==='satellite'?32:28,active:true,phase:rng()*6,near:false,variant});}if(rocket.body==='earth'&&iy===0){if(ix===-1)list.push(trafficObject('balloon',-265,205));if(ix===0)list.push(trafficObject('plane',280,300));}worldCells.set(id,list);}}
 let keepLeft=left-WORLD_STREAM_MARGIN,keepRight=right+WORLD_STREAM_MARGIN,keepBottom=bottom-WORLD_STREAM_MARGIN,keepTop=top+WORLD_STREAM_MARGIN;
 for(let list of worldCells.values())for(let o of list){if(o.type==='hazard')moveTraffic(o);if(o.x>=keepLeft&&o.x<=keepRight&&o.y>=keepBottom&&o.y<=keepTop)near.push(o);}objects=near;}

function moveTraffic(o){if(o.kind==='plane'){o.direction??=o.variant===1?-1:1;let speed=55+(o.variant||0)*9;o.vx=speed*o.direction;o.vy=1.8*Math.cos(trafficClock*.3+o.phase);if(o.trafficEpoch==null){let phase=((o.phase||0)%(Math.PI*2)+Math.PI*2)%(Math.PI*2)/(Math.PI*2);o.trafficEpoch=trafficClock-phase*(TRAFFIC_HALF_ROUTE*2)/speed;}let travel=-TRAFFIC_HALF_ROUTE+(trafficClock-o.trafficEpoch)*speed;o.x=o.originX+travel*o.direction;o.y=o.originY+Math.sin(trafficClock*.3+o.phase)*6;if(travel>TRAFFIC_HALF_ROUTE){let z=Math.max(.7,cam.zoom||1),left=cam.x-528/z-WORLD_STREAM_MARGIN,right=cam.x+432/z+WORLD_STREAM_MARGIN,startX=o.originX-TRAFFIC_HALF_ROUTE*o.direction;if((o.x<left||o.x>right)&&(startX<left||startX>right)){o.trafficEpoch=trafficClock;o.x=startX;}}}else if(o.kind==='balloon'){o.x=o.originX+Math.sin(trafficClock*.15+o.phase)*16;o.y=o.originY+Math.sin(trafficClock*.22+o.phase)*8;}}
function trafficObject'''
s=sub_once(s,r"function genWorld\(\)\{.*?\n\nfunction moveTraffic\(o\)\{.*?\}\nfunction trafficObject",replacement,'world streaming')
s=s.replace("function trafficObject(kind,x,y){return {type:'hazard',kind,x,y,originX:x,originY:y,r:kind==='plane'?32:25,active:true,phase:0,near:false,variant:0};}","function trafficObject(kind,x,y){return {type:'hazard',kind,x,y,originX:x,originY:y,r:kind==='plane'?32:25,active:true,phase:kind==='plane'?Math.PI:0,near:false,variant:0};}")
p.write_text(s)

print('world background + traffic patch applied')
