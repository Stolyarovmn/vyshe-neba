/* Modular rocket composition: purchased shell + stabilizers, existing capsule/booster art. */
(function(root){
'use strict';
if(!root.RocketVehicle)return;
const years=[1978,1986,1998,2015,2035,2060];
const images={body:new Map(),fins:new Map()};
const state={ready:false,errors:[],draws:0};
const legacyDraw=root.RocketVehicle.draw;
const assetUrl=key=>root.__GAME_ASSETS__?.[key]||'assets/'+key;
const stem=tier=>`e${tier}_${years[tier]}`;
const clampTier=v=>Math.max(0,Math.min(5,Number(v)||0));
function tier(level){level=Math.max(0,Number(level)||0);return level>=17?5:level>=13?4:level>=10?3:level>=7?2:level>=4?1:0;}
function profileTiers(){
 try{const p=JSON.parse(root.localStorage?.getItem('above-sky-v2')||'null');return{body:tier(p?.upgrades?.hull),fins:tier(p?.upgrades?.fins)};}catch{return{body:0,fins:0};}
}
function load(family,t){return new Promise(resolve=>{const im=new Image(),name=stem(t);im.src=assetUrl(`world/rocket_modular/${family}/${name}.png`);im.decode().then(()=>{images[family].set(t,im);resolve();}).catch(e=>{state.errors.push(`${family}/${name}: ${String(e)}`);resolve();});});}
const ready=Promise.all(years.flatMap((_,t)=>[load('body',t),load('fins',t)])).then(()=>{state.ready=images.body.size===6&&images.fins.size===6;return state.ready;});
function filterFor(skin){return skin==='wasp'?'hue-rotate(45deg)':skin==='arctic'?'hue-rotate(170deg)':skin==='cosmos'?'hue-rotate(270deg)':'none';}
function localSprite(ctx,im,x,y,height,ay=1){const width=height*im.width/im.height;ctx.drawImage(im,x-width/2,y-height*ay,width,height);state.draws++;return width;}
function worldByHeight(ctx,name,y,height,ay){const m=root.WorldSprites?.manifest?.sprites?.[name];if(!m)return false;return root.WorldSprites.sprite(ctx,name,0,y,height*m.width/m.height,height,{ay:ay??m.anchor?.[1]??.5});}
function flame(ctx,era,time,y,small){const length=(small?13:27)*(1+.16*Math.sin(time*43));ctx.save();for(let d=0;d<length;d+=2){const taper=1-d/length,half=Math.max(.5,5*taper+.55*Math.sin(time*61+d*1.4));ctx.fillStyle=era>=4?'#d26c69':'#e4753f';ctx.fillRect(-half,y+d,half*2,2);if(d<length*.8){const core=half*.45;ctx.fillStyle=era>=4?'#a4e6fc':'#ffe1a0';ctx.fillRect(-core,y+d,core*2,2);}}ctx.restore();}
function traceNozzle(ctx,name,y){if(!root.__TRACE_WORLD)return;const tx=ctx.getTransform(),p=([x,yy])=>[tx.a*x+tx.c*yy+tx.e,tx.b*x+tx.d*yy+tx.f],pt=p([0,y]);(root.__ANCHORS??=[]).push({name,sim:pt,drawn:pt,tol:.5,d:0});}
function assembly(ctx,o,offset=0){
 const fallback=profileTiers(),bt=clampTier(o.bodyTier??fallback.body),ft=clampTier(o.finsTier??fallback.fins),era=clampTier(o.era);
 const body=images.body.get(bt),fins=images.fins.get(ft),cap=root.WorldSprites.id('capsule',era);if(!body||!fins||!root.WorldSprites.manifest?.sprites?.[cap])return false;
 ctx.save();ctx.translate(0,offset);ctx.filter=filterFor(o.skin);
 localSprite(ctx,body,0,-12,37,1);
 worldByHeight(ctx,cap,-46,24,1);
 localSprite(ctx,fins,0,3,18,1);
 ctx.restore();return true;
}
function draw(ctx,o={}){
 const ws=root.WorldSprites;if(!state.ready||!ws?.state?.ready||o.debris||o.stageId==='capsule')return legacyDraw(ctx,o);
 const era=clampTier(o.era),t=Number(o.time)||0,stage=o.stageId||'core';
 const fallback=profileTiers(),bt=clampTier(o.bodyTier??fallback.body),ft=clampTier(o.finsTier??fallback.fins);
 if(!images.body.get(bt)||!images.fins.get(ft))return legacyDraw(ctx,o);
 ctx.save();ctx.translate(o.x||0,o.y||0);ctx.rotate(o.angle||0);ctx.scale(o.scale??1,o.scale??1);ctx.imageSmoothingEnabled=false;
 if(stage==='booster'){
  if(o.thrust)flame(ctx,era,t,0,false);
  if(!assembly(ctx,{...o,bodyTier:bt,finsTier:ft},-32)){ctx.restore();return legacyDraw(ctx,o);}
  ctx.save();ctx.filter=filterFor(o.skin);worldByHeight(ctx,ws.id('booster',era),0,36);ctx.restore();traceNozzle(ctx,'rocket-modular-booster-nozzle',0);
 }else{
  if(o.thrust)flame(ctx,era,t,3,false);
  if(!assembly(ctx,{...o,bodyTier:bt,finsTier:ft},0)){ctx.restore();return legacyDraw(ctx,o);}
  traceNozzle(ctx,'rocket-modular-core-nozzle',3);
 }
 const turn=typeof o.maneuver==='number'?o.maneuver:o.maneuver?.turn||0;
 if(Math.abs(turn)>.03){const side=turn>0?-1:1,yy=stage==='booster'?-78:-43,xx=19,len=5+3*Math.sin(t*32)**2;ctx.fillStyle='#bbf4ff';ctx.beginPath();ctx.moveTo(side*xx,yy-1);ctx.lineTo(side*(xx+len),yy);ctx.lineTo(side*xx,yy+2);ctx.fill();}
 ctx.restore();
}
root.RocketVehicle.draw=draw;
root.RocketModular={ready,state,tier,profileTiers,years,qa(){return{ready:state.ready,errors:[...state.errors],body:images.body.size,fins:images.fins.size,draws:state.draws};}};
})(typeof window!=='undefined'?window:globalThis);
