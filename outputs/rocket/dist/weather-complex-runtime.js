/* B01 Weather Complex runtime renderer/integration.
 * ref2game contract: approved cut-out parts move causally; no whole-sprite fake motion.
 */
'use strict';
(()=>{
const canvas=document.getElementById('canvas'),ctx=canvas?.getContext('2d');
if(!canvas||!ctx||!window.WeatherComplexRigController)return;
const ERA_KEYS=['e0_1978','e1_1986','e2_1998','e3_2015','e4_2035','e5_2060'];
const YEARS=[1978,1986,1998,2015,2035,2060];
const ROOT='placeables/base/weather_complex/parts/';
const CELL=[96,122],REG=[48,118];
const PARTS=['body','sensor','vane','indicator'];
const TRANSPARENT='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%221%22 height=%221%22/%3E';
window.__GAME_ASSETS__=window.__GAME_ASSETS__||{};
for(const year of YEARS)window.__GAME_ASSETS__['infrastructure/weather/'+year+'.png']=TRANSPARENT;

let meta=null,controller=null,ready=false,last=performance.now(),lastOwned=null,lastEra=null,lastFlightKey=null,pose=null;
const atlases={};

function assetPath(rel){return window.__GAME_ASSETS__?.[rel]||('assets/'+rel);}
async function load(){
 try{
  const r=await fetch(assetPath(ROOT+'rig.json'));
  if(!r.ok&&!String(r.url).startsWith('data:'))throw new Error('rig '+r.status);
  meta=await r.json();
  controller=new window.WeatherComplexRigController(meta,ERA_KEYS[0]);
  await Promise.all(PARTS.map(part=>new Promise((resolve,reject)=>{
   const im=new Image();atlases[part]=im;im.onload=resolve;im.onerror=()=>reject(new Error('atlas '+part));im.src=assetPath(ROOT+part+'_eras.png');
  })));
  ready=PARTS.every(part=>atlases[part]?.naturalWidth===288&&atlases[part]?.naturalHeight===244);
 }catch(err){
  ready=false;console.warn('B01 weather runtime unavailable:',err);
 }
}

function eraIndex(){return Math.max(0,Math.min(5,Number(window.Game?.profile?.base)||0));}
function eraKey(){return ERA_KEYS[eraIndex()];}
function normalizedWind(){return Math.max(-1,Math.min(1,(Number(window.Game?.weather?.wind)||0)/8));}
function flightKey(){let g=window.Game,r=g?.rocket;if(!g||!r||!['flight','pause','help'].includes(g.screen))return null;return [r.seed,r.departure].join(':');}

function sync(dt){
 const g=window.Game,infra=window.BaseInfrastructure;if(!g||!infra||!controller)return null;
 const own=!!infra.owned?.('weather'),ek=eraKey();
 if(lastOwned!==own){controller.setOwned(own);lastOwned=own;}
 if(lastEra!==ek){controller.dispatch('era_changed',{era:ek});lastEra=ek;}
 const fk=flightKey();
 if(own&&fk&&fk!==lastFlightKey){controller.dispatch('launch_prepare');lastFlightKey=fk;}
 if(lastFlightKey&&!fk&&['home','result','crash'].includes(g.screen)){
  if(controller.state==='NOTICE'||controller.state==='WORK')controller.dispatch('weather_preview_cancel');
  lastFlightKey=null;
 }
 const frozen=g.screen==='pause'||g.screen==='help';
 pose=controller.update(frozen?0:dt,{wind:normalizedWind()});
 if(!frozen&&controller.state==='WORK'&&controller.stateTime>=1.2&&controller.selectedWindow==null){
  controller.dispatch('weather_window_selected',{index:0});
  pose=controller.update(0,{wind:normalizedWind()});
 }
 return pose;
}

function cellSource(index){return [(index%3)*CELL[0],Math.floor(index/3)*CELL[1]];}
function drawCell(part,index,x,y,scale,pivot=null,angle=0){
 const im=atlases[part];if(!im?.complete||!im.naturalWidth)return;
 const [sx,sy]=cellSource(index);
 if(pivot){
  ctx.save();
  ctx.translate(x+(pivot[0]-REG[0])*scale,y+(pivot[1]-REG[1])*scale);
  ctx.rotate(angle||0);
  ctx.drawImage(im,sx,sy,CELL[0],CELL[1],-pivot[0]*scale,-pivot[1]*scale,CELL[0]*scale,CELL[1]*scale);
  ctx.restore();
 }else{
  ctx.drawImage(im,sx,sy,CELL[0],CELL[1],x-REG[0]*scale,y-REG[1]*scale,CELL[0]*scale,CELL[1]*scale);
 }
}

function drawRig(x,y,scale=1){
 if(!ready||!controller||!pose)return false;
 const index=eraIndex(),e=meta?.eras?.[ERA_KEYS[index]];if(!e)return false;
 ctx.save();ctx.imageSmoothingEnabled=false;
 drawCell('body',index,x,y,scale);
 if(e.sensor?.present)drawCell('sensor',index,x,y,scale,e.sensor.pivot,pose.sensorAngle);
 if(e.vane?.present)drawCell('vane',index,x,y,scale,e.vane.pivot,pose.vaneAngle);
 if(e.indicator?.present){
  drawCell('indicator',index,x,y,scale,e.indicator.pivot,0);
  if(pose.indicatorOn){let px=x+(e.indicator.pivot[0]+6-REG[0])*scale,py=y+(e.indicator.pivot[1]-REG[1])*scale;ctx.fillStyle=pose.indicator==='confirm'?'#efc263':'#70dfd0';ctx.fillRect(Math.round(px),Math.round(py),Math.max(1,Math.round(2*scale)),Math.max(1,Math.round(2*scale)));}
 }
 ctx.restore();return true;
}

function placement(){
 const g=window.Game,infra=window.BaseInfrastructure;if(!g||!infra||!infra.owned?.('weather')||g.profile?.location!=='earth')return null;
 if(!['home','flight','crash','result'].includes(g.screen))return null;
 const st=infra.state?.(),sid=st?.layout?.weather,slot=infra.slots?.find?.(s=>s.id===sid);if(!slot)return null;
 let x=slot.x,y=slot.y,scale=slot.zone==='remote'?.78:slot.zone==='perimeter'?.86:slot.zone==='apron'?.94:1;
 if(g.screen==='flight'||g.screen==='crash'||g.screen==='result'){
  const r=g.rocket;if(!r||r.body!=='earth'||r.y>900)return null;
  const wx=(slot.x-480)*1.2,pos=g.project(wx,0);x=pos.x;y=pos.y-4;scale*=g.camera?.zoom||1;
 }
 return{x,y,scale};
}

function tick(now){
 const dt=Math.min(.1,Math.max(0,(now-last)/1000||0));last=now;sync(dt);
 const p=placement();if(p&&ready){ctx.save();ctx.setTransform(2,0,0,2,0,0);ctx.imageSmoothingEnabled=false;drawRig(p.x,p.y,p.scale);ctx.restore();}
 requestAnimationFrame(tick);
}

window.B01WeatherRuntime={
 get ready(){return ready;},get pose(){return pose;},get controller(){return controller;},
 dispatch(event,payload){return controller?.dispatch(event,payload)||false;},
 draw:drawRig,sync,
};
load();requestAnimationFrame(tick);
})();
