/* Portrait phone flight presentation.
   Keeps the simulation in the canonical 960x600 logical scene, but on a portrait touch phone
   shows a centered, aspect-preserving vertical crop with an upright HUD and touch steering.
   Menus remain upright/contained instead of rotating the whole game sideways. */
(function(root){
'use strict';
if(root.PortraitUX?.installed)return;
const nativeMatchMedia=root.matchMedia?.bind(root);
const touch=()=>Number(root.navigator?.maxTouchPoints||0)>0;
const portrait=()=>touch()&&(root.visualViewport?.height||root.innerHeight)>(root.visualViewport?.width||root.innerWidth);
if(nativeMatchMedia){
 root.matchMedia=function(query){
  const result=nativeMatchMedia(query);
  if(String(query).replace(/\s+/g,'')!=='(pointer:coarse)'||!portrait())return result;
  return {
   matches:false,media:result.media,onchange:null,
   addListener:result.addListener?.bind(result),removeListener:result.removeListener?.bind(result),
   addEventListener:result.addEventListener?.bind(result),removeEventListener:result.removeEventListener?.bind(result),
   dispatchEvent:result.dispatchEvent?.bind(result)
  };
 };
}
const style=document.createElement('style');
style.textContent=`
#portraitHud,#portraitFlightPad{display:none}
@media (orientation:portrait) and (pointer:coarse){
 #game.portrait-flight{
  width:100vw!important;height:100dvh!important;max-width:none!important;aspect-ratio:auto!important;
  left:50%!important;top:50%!important;transform:translate(-50%,-50%)!important;overflow:hidden!important;
  box-shadow:none!important;background:#07131d!important;
 }
 #game.portrait-flight #canvas{
  position:absolute!important;inset:0!important;width:100%!important;height:100%!important;
  object-fit:cover!important;object-position:50% 50%!important;pointer-events:none!important;
 }
 #game.portrait-flight #fullscreenToggle{left:auto!important;right:12px!important;top:12px!important;z-index:30!important}
 #game.portrait-flight #touch{display:flex!important;right:12px!important;bottom:18px!important;z-index:30!important}
 #game.portrait-flight #portraitHud{
  display:grid!important;position:absolute;z-index:30;left:12px;right:64px;top:12px;
  grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;pointer-events:none;
 }
 #portraitHud .pstat{background:#071725d9;border:1px solid #8fb3bd40;border-radius:10px;padding:7px 8px;color:#e9e7d6;font:600 13px "Segoe UI",Arial,sans-serif;min-width:0}
 #portraitHud .pstat b{display:block;color:#70dfd0;font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
 #portraitHud .pstat:nth-child(3) b,#portraitHud .pstat:nth-child(4) b{color:#efc263}
 #game.portrait-flight #portraitFlightPad{
  display:block!important;position:absolute;z-index:20;left:0;right:0;bottom:0;height:55%;
  pointer-events:auto;touch-action:none;background:transparent;
 }
 #portraitFlightPad::after{
  content:"тяга · веди влево / вправо";position:absolute;left:50%;bottom:24px;transform:translateX(-50%);
  color:#d9e7e3aa;background:#07172588;border-radius:10px;padding:6px 10px;font:600 12px "Segoe UI",Arial,sans-serif;
  white-space:nowrap;pointer-events:none;
 }
}
`;
document.head.appendChild(style);
const game=document.getElementById('game'),canvas=document.getElementById('canvas');
const hud=document.createElement('div');hud.id='portraitHud';
hud.innerHTML='<div class="pstat">Высота<b data-p="alt">0 м</b></div><div class="pstat">Скорость<b data-p="speed">0 м/с</b></div><div class="pstat">Топливо<b data-p="fuel">100%</b></div><div class="pstat">Монеты<b data-p="coins">0</b></div>';
game.appendChild(hud);
const pad=document.createElement('div');pad.id='portraitFlightPad';pad.setAttribute('aria-label','Тяга и наклон ракеты');game.appendChild(pad);
const fire=(type,code)=>root.dispatchEvent(new KeyboardEvent(type,{code,bubbles:true}));
let activePointer=null,startX=0,left=false,right=false,thrust=false;
function key(code,on){
 if(code==='ArrowLeft'){if(left===on)return;left=on;}
 if(code==='ArrowRight'){if(right===on)return;right=on;}
 if(code==='ArrowUp'){if(thrust===on)return;thrust=on;}
 fire(on?'keydown':'keyup',code);
}
function release(){key('ArrowUp',false);key('ArrowLeft',false);key('ArrowRight',false);activePointer=null;}
pad.addEventListener('pointerdown',e=>{if(!game.classList.contains('portrait-flight'))return;e.preventDefault();activePointer=e.pointerId;startX=e.clientX;pad.setPointerCapture(e.pointerId);key('ArrowUp',true);});
pad.addEventListener('pointermove',e=>{if(e.pointerId!==activePointer)return;e.preventDefault();const d=e.clientX-startX;key('ArrowLeft',d<-24);key('ArrowRight',d>24);});
for(const ev of ['pointerup','pointercancel','lostpointercapture'])pad.addEventListener(ev,e=>{if(activePointer==null||e.pointerId===activePointer)release();});
function flightScreen(){return ['flight','pause','help','crash','result'].includes(root.Game?.screen);}
function apply(){
 const on=portrait()&&flightScreen();
 game.classList.toggle('portrait-flight',on);
 if(on){
  const vv=root.visualViewport,w=vv?.width||root.innerWidth,h=vv?.height||root.innerHeight;
  game.style.width=w+'px';game.style.height=h+'px';game.style.left=w/2+'px';game.style.top=h/2+'px';game.style.transform='translate(-50%,-50%)';
 }else release();
 const r=root.Game?.rocket;
 if(r){
  hud.querySelector('[data-p=alt]').textContent=(Math.max(0,r.y*10)/1000).toFixed(1)+' км';
  hud.querySelector('[data-p=speed]').textContent=(r.vy>=0?'+':'')+r.vy.toFixed(1)+' м/с';
  hud.querySelector('[data-p=fuel]').textContent=Math.max(0,Math.ceil((r.maxFuel?r.fuel/r.maxFuel:0)*100))+'%';
  hud.querySelector('[data-p=coins]').textContent=String(r.coins||0);
 }
 root.requestAnimationFrame(apply);
}
root.PortraitUX={installed:true,isPortrait:portrait,isFlightPortrait:()=>game.classList.contains('portrait-flight')};
root.requestAnimationFrame(apply);
})(window);
