/* True portrait flight: preserve 8:5 render scale, crop horizontally around rocket, overlay portrait HUD/controls. */
(function(root){
'use strict';
if(root.PortraitMode?.installed)return;
const game=document.getElementById('game'),canvas=document.getElementById('canvas'),touch=document.getElementById('touch');if(!game||!canvas)return;
const hud=document.createElement('section');hud.id='portraitHud';hud.setAttribute('aria-label','Полетные приборы');hud.innerHTML='<div class="ph-main"></div><button class="ph-pause" aria-label="Пауза">Ⅱ</button><div class="ph-help">Удерживай экран — тяга · веди в стороны — наклон</div>';game.appendChild(hud);
const style=document.createElement('style');style.textContent=`
#portraitHud{display:none;position:absolute;inset:0;pointer-events:none;font:600 14px "Segoe UI",Arial,sans-serif;color:#e9e7d6;z-index:20}
#portraitHud .ph-main{position:absolute;left:max(10px,env(safe-area-inset-left));top:max(10px,env(safe-area-inset-top));display:grid;gap:6px;width:154px}
#portraitHud .ph-chip{background:#071725e8;border:1px solid #8fb3bd45;border-radius:10px;padding:7px 9px;box-shadow:0 2px 9px #0005;line-height:1.15}
#portraitHud .ph-chip b{display:block;font-size:16px;color:#fff}.ph-cyan b{color:#70dfd0}.ph-red b{color:#ed7770}.ph-gold b{color:#efc263}
#portraitHud .ph-pause{pointer-events:auto;position:absolute;right:max(10px,env(safe-area-inset-right));top:max(66px,calc(env(safe-area-inset-top) + 58px));width:48px;height:48px;border-radius:12px;border:1px solid #8fb3bd55;background:#102735e8;color:#efc263;font-size:24px;font-weight:800}
#portraitHud .ph-help{position:absolute;left:50%;bottom:max(12px,env(safe-area-inset-bottom));transform:translateX(-50%);white-space:nowrap;background:#071725dd;border-radius:9px;padding:7px 11px;font-size:12px}
#game.portrait-flight{overflow:hidden;box-shadow:none;background:#080f19}
#game.portrait-flight #portraitHud{display:block}
#game.portrait-flight #touch{display:flex!important;flex-direction:column;bottom:max(62px,calc(env(safe-area-inset-bottom) + 56px));right:max(12px,env(safe-area-inset-right));gap:8px;z-index:22}
#game.portrait-flight #touch button{width:50px;height:50px;border-radius:14px;background:#102735e8}
#game.portrait-flight #fullscreenToggle{right:max(10px,env(safe-area-inset-right));left:auto;top:max(10px,env(safe-area-inset-top));z-index:23;width:48px;height:48px}
`;document.head.appendChild(style);
function vv(){let v=root.visualViewport;return {w:Number(v?.width||root.innerWidth),h:Number(v?.height||root.innerHeight)};}
function portrait(){let v=vv();return Number(root.navigator?.maxTouchPoints||0)>0&&v.h>v.w;}
function flight(){let s=root.Game?.screen;return s==='flight'||s==='crash';}
let active=false,lastW=0,lastH=0,lastScreen='';
function apply(){let v=vv(),want=portrait()&&flight();if(want){active=true;game.classList.add('portrait-flight');game.style.width=v.w+'px';game.style.height=v.h+'px';game.style.left=(v.w/2)+'px';game.style.top=(v.h/2)+'px';game.style.transform='translate(-50%,-50%)';canvas.style.position='absolute';canvas.style.height=v.h+'px';canvas.style.width=(v.h*1.6)+'px';canvas.style.left='50%';canvas.style.top='0';canvas.style.transform='translateX(-50%)';canvas.style.maxWidth='none';}
 else if(active){active=false;game.classList.remove('portrait-flight');canvas.style.position='';canvas.style.height='100%';canvas.style.width='100%';canvas.style.left='';canvas.style.top='';canvas.style.transform='';canvas.style.maxWidth='';let gw=Math.min(v.w,v.h*960/600);game.style.width=gw+'px';game.style.height=(gw*600/960)+'px';game.style.left=(v.w/2)+'px';game.style.top=(v.h/2)+'px';game.style.transform='translate(-50%,-50%)';}
 lastW=v.w;lastH=v.h;lastScreen=root.Game?.screen||'';}
function fmt(n){return Math.max(0,Math.round(Number(n)||0)).toLocaleString('ru-RU');}
function updateHud(){if(!active)return;let g=root.Game,r=g?.rocket,w=g?.weather,main=hud.querySelector('.ph-main');if(!r){main.textContent='';return;}let dangerous=r.vy<-(13+(g.profile?.upgrades?.legs||0)*3);main.innerHTML=`<div class="ph-chip ph-cyan">Высота<b>${(r.y*10/1000).toFixed(1)} км</b></div><div class="ph-chip ${dangerous?'ph-red':''}">Скорость<b>${r.vy>=0?'+':''}${r.vy.toFixed(1)} м/с</b></div><div class="ph-chip ph-gold">Топливо<b>${r.stageIndex+1}/${r.stages.length} ${Math.ceil(r.fuel/r.maxFuel*100)}%</b></div><div class="ph-chip">Корпус<b>${Math.ceil(r.hp/r.maxHp*100)}%</b></div><div class="ph-chip ph-gold">Монеты<b>${fmt(r.coins)}</b></div>${w&&r.y<1400?`<div class="ph-chip">Погода<b>${['Ясно','Облачно','Дождь','Гроза'][w.kind]||'—'}</b></div>`:''}`;}
hud.querySelector('.ph-pause').addEventListener('click',e=>{e.preventDefault();root.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyP',key:'p',bubbles:true}));});
function loop(){let v=vv(),s=root.Game?.screen||'';if(v.w!==lastW||v.h!==lastH||s!==lastScreen)apply();updateHud();requestAnimationFrame(loop);}apply();requestAnimationFrame(loop);
root.PortraitMode={installed:true,isPortrait:portrait,get active(){return active;},apply};
})(window);
