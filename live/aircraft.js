/* ref2game aircraft runtime: art is static; motion/effects are code and data-driven. */
(function(root){
'use strict';
if(!root.Journey||!root.CanvasRenderingContext2D)return;
const J=root.Journey;
const ERA_YEARS=[1978,1986,1998,2015,2035,2060];
const ZIP_KEY='aircraft/aircraft-sprites-36.zip';
const TRAFFIC_KEY='aircraft/traffic.json';
const EFFECTS_KEY='aircraft/effects.json';
const OLD_PLANE_CROP=[83,148,1613,588];
const DISPLAY_WIDTH={low_primary:98,low_multiwing:98,medium_passenger:118,medium_cargo:120,high_fighter:105,high_experimental:110};
const DEFAULT_TRAFFIC={previousEraMix:.18,experimentalCeilingByEraWorldY:[2000,2100,2200,2300,2400,2400],layers:[
 {id:'safe',min:0,max:30,weights:{}},
 {id:'low',min:30,max:300,weights:{low_primary:.70,low_multiwing:.30}},
 {id:'mixed',min:300,max:600,weights:{medium_cargo:.50,medium_passenger:.35,low_primary:.10,low_multiwing:.05}},
 {id:'cruise',min:600,max:1200,weights:{medium_passenger:.60,medium_cargo:.35,high_fighter:.05}},
 {id:'high',min:1200,max:1800,weights:{high_fighter:.70,high_experimental:.30}},
 {id:'experimental',min:1800,max:2400,weights:{high_experimental:1}}
]};
let traffic=DEFAULT_TRAFFIC,effects=null;
const sprites=new Map(),projection=new Map();
const state={zipReady:false,dataReady:false,lastSprite:null,lastWorldY:0,lastProfile:null,errors:[]};
const assetUrl=(key,fallback)=>root.__GAME_ASSETS__?.[key]||fallback;
const key2=(x,y)=>`${Math.round(x*2)/2},${Math.round(y*2)/2}`;
function h01(x,y,salt=0){let n=(Math.imul((Math.floor(x*8)|0)^salt,374761393)+Math.imul((Math.floor(y*8)|0)+salt,668265263))|0;n=(n^(n>>>13));n=Math.imul(n,1274126177);return((n^(n>>>16))>>>0)/4294967296;}
function currentBase(){try{return Math.max(0,Math.min(5,Number(JSON.parse(localStorage.getItem('above-sky-v2')||'{}').base)||0));}catch{return 0;}}
function layerFor(y){return traffic.layers.find(l=>y>=l.min&&y<l.max)||null;}
function weighted(weights,r){if(!weights)return null;let acc=0;for(const [id,w] of Object.entries(weights)){acc+=w;if(r<acc)return id;}return Object.keys(weights).at(-1)||null;}
function selectedEra(base,x,y){if(base>0&&h01(x,y,77)<(traffic.previousEraMix??.18))return base-1;return base;}
function selectAircraft(x,y,base=currentBase()){
 const layer=layerFor(y); if(!layer||!layer.weights||!Object.keys(layer.weights).length)return null;
 if(layer.eraMin!=null&&base<layer.eraMin)return null;
 if(layer.relativeSpawnChance!=null&&h01(x,y,91)>=layer.relativeSpawnChance)return null;
 let lineage=weighted(layer.weights,h01(x,y,13));
 if(!lineage)return null;
 const era=selectedEra(base,x,y),year=ERA_YEARS[era];
 return {id:`${lineage}_${year}`,lineage,year,era};
}
async function jsonAsset(key,path){try{const r=await fetch(assetUrl(key,path));if(!r.ok)throw new Error(`${path}: ${r.status}`);return await r.json();}catch(e){state.errors.push(String(e));return null;}}
async function inflateRaw(bytes){if(typeof DecompressionStream==='undefined')throw new Error('DecompressionStream unavailable');const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));return await new Response(stream).arrayBuffer();}
async function loadZip(){
 try{
  const r=await fetch(assetUrl(ZIP_KEY,'assets/aircraft/aircraft-sprites-36.zip'));if(!r.ok)throw new Error(`aircraft zip: ${r.status}`);
  const ab=await r.arrayBuffer(),dv=new DataView(ab),td=new TextDecoder();let p=0,count=0,pending=[];
  while(p+30<=ab.byteLength&&dv.getUint32(p,true)===0x04034b50){
   const flags=dv.getUint16(p+6,true),method=dv.getUint16(p+8,true),csize=dv.getUint32(p+18,true),usize=dv.getUint32(p+22,true),nl=dv.getUint16(p+26,true),el=dv.getUint16(p+28,true);
   if(flags&8)throw new Error('ZIP data descriptors are not supported');
   const name=td.decode(new Uint8Array(ab,p+30,nl)),start=p+30+nl+el,comp=ab.slice(start,start+csize);let raw;
   if(method===0)raw=comp;else if(method===8)raw=await inflateRaw(comp);else throw new Error(`ZIP method ${method} is not supported`);
   if(usize&&raw.byteLength!==usize)throw new Error(`ZIP size mismatch for ${name}`);
   if(name.endsWith('.png')){const url=URL.createObjectURL(new Blob([raw],{type:'image/png'})),im=new Image();im.src=url;pending.push(im.decode().then(()=>{sprites.set(name,im);URL.revokeObjectURL(url);}));count++;}
   p=start+csize;
  }
  await Promise.all(pending);
  if(count<36)throw new Error(`aircraft sprites: expected 36, loaded ${count}`);
  state.zipReady=true;
 }catch(e){state.errors.push(String(e));}
}
Promise.all([jsonAsset(TRAFFIC_KEY,'assets/aircraft/traffic.json'),jsonAsset(EFFECTS_KEY,'assets/aircraft/effects.json')]).then(([t,e])=>{if(t)traffic=t;if(e)effects=e;state.dataReady=!!effects;});
loadZip();

const objectKind0=J.objectKind.bind(J);
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
};

function profileFor(id){if(!effects)return null;const name=effects.sprites?.[id];return name?effects.profiles?.[name]||null:null;}
function xy(dx,dy,dw,dh,p){return [dx+p[0]*dw,dy+p[1]*dh];}
function trace(ctx,meta,kind,p,dx,dy,dw,dh){
 if(!root.__TRACE_AIRCRAFT)return;
 const index=meta[kind].indexOf(p),source=meta.sourcePixels?.[kind]?.[index],size=meta.sourceSize;
 if(!source||!size)throw Error('Missing measured aircraft anchor: '+state.lastSprite+'/'+kind+'/'+index);
 const transform=ctx.getTransform(),project=([x,y])=>[transform.a*x+transform.c*y+transform.e,transform.b*x+transform.d*y+transform.f];
 const drawn=project(xy(dx,dy,dw,dh,p)),sim=project([dx+source[0]/size[0]*dw,dy+source[1]/size[1]*dh]);
 (root.__AIRCRAFT_ANCHORS??=[]).push({name:state.lastSprite+'/'+kind+'/'+index,sim,drawn,d:Math.hypot(sim[0]-drawn[0],sim[1]-drawn[1]),tol:.5});
}
function behind(ctx,meta,dx,dy,dw,dh,worldY,now){
 const type=meta.engineType||'';
 if(worldY>=600&&meta.contrailPoints?.length){ctx.save();ctx.lineCap='round';for(const p of meta.contrailPoints){trace(ctx,meta,'contrailPoints',p,dx,dy,dw,dh);const [x,y]=xy(dx,dy,dw,dh,p),len=Math.min(55,14+(worldY-600)/90);ctx.globalAlpha=.12+Math.min(.18,(worldY-600)/8000);ctx.strokeStyle='#e9f5f5';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x-len,y+Math.sin(now*.004+p[1]*9)*1.5);ctx.stroke();}ctx.restore();}
 if(!meta.engines?.length)return;
 ctx.save();ctx.lineCap='round';
 for(const p of meta.engines){trace(ctx,meta,'engines',p,dx,dy,dw,dh);const [x,y]=xy(dx,dy,dw,dh,p);const pulse=.85+.15*Math.sin(now*.018+p[1]*11);
  if(type==='civilJet'){ctx.globalAlpha=.16;ctx.strokeStyle='#b9d7df';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x-10-pulse*3,y+Math.sin(now*.025)*1.5);ctx.stroke();continue;}
  if(type==='earlyJet'||type==='rocketWarm'){ctx.globalAlpha=.72;ctx.fillStyle='#f2a253';ctx.beginPath();ctx.moveTo(x,y-2);ctx.lineTo(x-(type==='rocketWarm'?18:10)*pulse,y);ctx.lineTo(x,y+2);ctx.closePath();ctx.fill();ctx.globalAlpha=.9;ctx.fillStyle='#ffe4a3';ctx.fillRect(x-5*pulse,y-1,4,2);continue;}
  if(type==='fighterJet'){ctx.globalAlpha=.62;ctx.fillStyle='#e56d45';ctx.beginPath();ctx.moveTo(x,y-2);ctx.lineTo(x-12*pulse,y);ctx.lineTo(x,y+2);ctx.closePath();ctx.fill();ctx.globalAlpha=.72;ctx.fillStyle='#8fdff2';ctx.fillRect(x-6*pulse,y-1,4,2);continue;}
  if(type==='modernAfterburner'){ctx.globalAlpha=.64;ctx.fillStyle='#e75b43';ctx.beginPath();ctx.moveTo(x,y-3);ctx.lineTo(x-22*pulse,y);ctx.lineTo(x,y+3);ctx.closePath();ctx.fill();ctx.globalAlpha=.88;ctx.fillStyle='#62d8f2';ctx.beginPath();ctx.moveTo(x,y-1.5);ctx.lineTo(x-15*pulse,y);ctx.lineTo(x,y+1.5);ctx.closePath();ctx.fill();ctx.fillStyle='#eaffff';ctx.fillRect(x-5,y-1,4,2);for(let i=0;i<2;i++){ctx.globalAlpha=.35;ctx.fillStyle=i?'#f28a56':'#9deafa';const q=x-9-i*7;ctx.beginPath();ctx.moveTo(q-2,y);ctx.lineTo(q,y-1.3);ctx.lineTo(q+2,y);ctx.lineTo(q,y+1.3);ctx.fill();}continue;}
  if(type==='plasmaBlue'){ctx.globalAlpha=.58;ctx.fillStyle='#3e9fe6';ctx.beginPath();ctx.moveTo(x,y-3);ctx.lineTo(x-25*pulse,y);ctx.lineTo(x,y+3);ctx.closePath();ctx.fill();ctx.globalAlpha=.9;ctx.fillStyle='#8ff2ff';ctx.beginPath();ctx.moveTo(x,y-1.5);ctx.lineTo(x-18*pulse,y);ctx.lineTo(x,y+1.5);ctx.closePath();ctx.fill();ctx.fillStyle='#f2ffff';ctx.fillRect(x-5,y-1,4,2);}
 }
 ctx.restore();
}
function front(ctx,meta,dx,dy,dw,dh,now){
 ctx.save();ctx.lineCap='round';
 for(const p of meta.propellers||[]){trace(ctx,meta,'propellers',p,dx,dy,dw,dh);const [x,y]=xy(dx,dy,dw,dh,p),r=Math.max(5,p[2]*dh),a=now*.035+p[0]*7;ctx.globalAlpha=.18;ctx.strokeStyle='#e8dfbf';ctx.lineWidth=1.2;ctx.beginPath();ctx.ellipse(x,y,Math.max(2,r*.22),r,0,0,Math.PI*2);ctx.stroke();ctx.globalAlpha=.55;ctx.strokeStyle='#b99a64';ctx.beginPath();ctx.moveTo(x+Math.cos(a)*r*.22,y+Math.sin(a)*r);ctx.lineTo(x-Math.cos(a)*r*.22,y-Math.sin(a)*r);ctx.stroke();ctx.beginPath();ctx.moveTo(x+Math.cos(a+Math.PI/2)*r*.22,y+Math.sin(a+Math.PI/2)*r);ctx.lineTo(x-Math.cos(a+Math.PI/2)*r*.22,y-Math.sin(a+Math.PI/2)*r);ctx.stroke();}
 for(const p of meta.fans||[]){trace(ctx,meta,'fans',p,dx,dy,dw,dh);const [x,y]=xy(dx,dy,dw,dh,p),r=Math.max(2,dh*.045),a=now*.05+p[0]*9;ctx.globalAlpha=.65;ctx.strokeStyle='#b7c8c9';ctx.lineWidth=1;for(let i=0;i<3;i++){const aa=a+i*Math.PI*2/3;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+Math.cos(aa)*r,y+Math.sin(aa)*r);ctx.stroke();}}
 const blink=(Math.floor(now/260)%4)===0;for(const p of meta.navLights||[]){trace(ctx,meta,'navLights',p,dx,dy,dw,dh);const [x,y]=xy(dx,dy,dw,dh,p);let c=p[2]==='red'?'#ff5b57':p[2]==='green'?'#70ef9a':'#eefcff';ctx.globalAlpha=blink?1:.22;ctx.fillStyle=c;ctx.fillRect(Math.round(x)-1,Math.round(y)-1,2,2);}
 ctx.restore();
}
function draw(ctx,o,base,time,zoom=1){
 if(!state.zipReady)return false;
 const originX=o.originX??o.x,originY=o.originY??o.y;
 if(!o.aircraftChoice)o.aircraftChoice=selectAircraft(originX,originY,base);
 const choice=o.aircraftChoice,im=choice&&sprites.get(choice.id+'.png');
 if(!im)return false;
 const w=(DISPLAY_WIDTH[choice.lineage]||110)*zoom,h=w*im.naturalHeight/im.naturalWidth,dx=-w/2,dy=-h/2,meta=profileFor(choice.id),now=time*1000;
 state.lastSprite=choice.id;state.lastWorldY=o.y;state.lastProfile=meta?.engineType||null;
 ctx.save();ctx.scale(o.direction<0?-1:1,1);
 if(meta)behind(ctx,meta,dx,dy,w,h,o.y,now);
 ctx.drawImage(im,dx,dy,w,h);
 if(meta)front(ctx,meta,dx,dy,w,h,now);ctx.restore();return true;
}
root.AircraftTraffic={draw,state,select:selectAircraft,profileFor,eras:ERA_YEARS,qa(){return {spriteCount:sprites.size,dataReady:state.dataReady,zipReady:state.zipReady,errors:[...state.errors],lastSprite:state.lastSprite,lastWorldY:state.lastWorldY,lastProfile:state.lastProfile};}};
})(typeof window!=='undefined'?window:globalThis);
