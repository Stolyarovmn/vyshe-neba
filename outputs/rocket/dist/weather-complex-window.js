/* B01 weather-window gameplay: exactly two deterministic launch windows, one choice, no reroll. */
'use strict';
(()=>{
const canvas=document.getElementById('canvas'),ctx=canvas?.getContext('2d');
if(!canvas||!ctx)return;
const W=960,H=600;
const NAMES=['ЯСНО','ОБЛАЧНО','ДОЖДЬ','ГРОЗА'];
const DESC=['слабая облачность · спокойный старт','облака · умеренный ветер','осадки · порывистый ветер','гроза · сильные порывы'];
const TARGET={cloud:[0,.55,.85,1],rain:[0,0,.65,1],storm:[0,0,0,1]};
const CARDS=[{x:210,y:230,w:250,h:136},{x:500,y:230,w:250,h:136}];
let open=false,options=null,flightStamp=null,choice=null,last=performance.now();
const G=()=>window.Game,I=()=>window.BaseInfrastructure,R=()=>window.B01WeatherRuntime;

function pick(r){let x=r();return x<.38?0:x<.65?1:x<.89?2:3;}
function prepare(){
 const g=G(),w=g?.weather,r=g?.rocket;if(!g||!w||!r)return null;
 const current=Math.max(0,Math.min(3,Number(w.kind)||0)),rng=window.Journey?.random?.((Number(r.seed)||0)+7301)||Math.random;
 let second=pick(rng);if(second===current)second=(second+1+Math.floor(rng()*3))%4;
 return [{kind:current,source:'current'},{kind:second,source:'alternate'}];
}
function applyKind(kind){
 const w=G()?.weather;if(!w)return;
 kind=Math.max(0,Math.min(3,kind|0));w.kind=kind;w.cloud=TARGET.cloud[kind];w.rain=TARGET.rain[kind];w.storm=TARGET.storm[kind];
 w.effectiveCloud=w.cloud;w.effectiveRain=w.rain;w.effectiveStorm=w.storm;w.wind=0;w.flash=0;
 const extra=typeof w.rng==='function'?w.rng()*22:11;w.next=w.time+18+extra;
}
function choose(index){
 if(!open||!options||!options[index])return false;
 choice=index;applyKind(options[index].kind);R()?.dispatch?.('weather_window_selected',{index});open=false;G()?.goto?.('flight');return true;
}
function maybeOpen(){
 const g=G(),infra=I();if(!g||!infra)return;
 if(['home','result','crash'].includes(g.screen)&&!open)flightStamp=null;
 if(!infra.owned?.('weather')||g.profile?.location!=='earth'||g.screen!=='flight'||!g.rocket)return;
 const stamp=[g.profile?.stats?.flights||0,g.rocket.seed,g.rocket.departure].join(':');if(stamp===flightStamp)return;
 flightStamp=stamp;choice=null;options=prepare();if(!options)return;open=true;g.goto?.('pause');
}

function patchLegacyWeatherEffect(){
 const E=window.RocketEngine,infra=I();if(!E||!infra||E.__b01WeatherWindowPatched)return;
 const step0=E.step;E.step=function(r,p,input,dt,mode){let next=input;
  if(p?.location==='earth'&&infra.owned?.('weather')){const factor=Math.max(.25,1-.15*(infra.effectMultiplier?.('weather')||1));next={...input,wind:(input?.wind||0)/factor};}
  return step0(r,p,next,dt,mode);
 };
 const def=infra.definitions?.find?.(d=>d.id==='weather');if(def){def.benefit='Два прогноза следующего запуска · один выбор без reroll';def.anim='Сканирование окна запуска · флюгер реагирует на ветер';}
 E.__b01WeatherWindowPatched=true;
}

function rect(x,y,w,h,c){ctx.fillStyle=c;ctx.fillRect(Math.round(x),Math.round(y),Math.round(w),Math.round(h));}
function rounded(x,y,w,h,r,fill,stroke){ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=1;ctx.stroke();}}
function text(s,x,y,size=13,c='#e9e7d6',align='left'){ctx.font=`600 ${size}px "Segoe UI",Arial,sans-serif`;ctx.textAlign=align;ctx.textBaseline='top';ctx.fillStyle=c;ctx.fillText(s,Math.round(x),Math.round(y));}
function weatherIcon(kind,cx,cy){ctx.save();ctx.translate(cx,cy);ctx.strokeStyle='#dfe8e3';ctx.fillStyle='#dfe8e3';ctx.lineWidth=2;
 if(kind===0){ctx.beginPath();ctx.arc(0,0,10,0,Math.PI*2);ctx.stroke();for(let i=0;i<8;i++){let a=i*Math.PI/4;ctx.beginPath();ctx.moveTo(Math.cos(a)*15,Math.sin(a)*15);ctx.lineTo(Math.cos(a)*22,Math.sin(a)*22);ctx.stroke();}}
 else{ctx.beginPath();ctx.arc(-8,2,9,Math.PI,Math.PI*2);ctx.arc(2,-2,12,Math.PI,Math.PI*2);ctx.arc(13,3,8,Math.PI,Math.PI*2);ctx.lineTo(-17,4);ctx.stroke();if(kind>=2)for(let i=-10;i<=12;i+=11){ctx.beginPath();ctx.moveTo(i,10);ctx.lineTo(i-4,20);ctx.strokeStyle=kind===3?'#efc263':'#70dfd0';ctx.stroke();}if(kind===3){ctx.beginPath();ctx.moveTo(3,8);ctx.lineTo(-2,20);ctx.lineTo(5,18);ctx.lineTo(0,29);ctx.strokeStyle='#efc263';ctx.stroke();}}
 ctx.restore();}
function draw(){if(!open||!options)return;ctx.save();ctx.setTransform(2,0,0,2,0,0);rect(0,0,W,H,'#06121bcf');rounded(170,140,620,330,20,'#0b1d2aeF','#4d7880');text('МЕТЕОКОМПЛЕКС',480,165,22,'#efc263','center');text('Выбери одно из двух погодных окон следующего запуска',480,197,12,'#b5c6c0','center');
 options.forEach((o,i)=>{let b=CARDS[i];rounded(b.x,b.y,b.w,b.h,14,i===0?'#102c37':'#102735','#537b83');weatherIcon(o.kind,b.x+48,b.y+54);text(i===0?'СЕЙЧАС':'ВТОРОЕ ОКНО',b.x+88,b.y+25,11,'#70dfd0');text(NAMES[o.kind],b.x+88,b.y+49,17,'#e9e7d6');text(DESC[o.kind],b.x+20,b.y+96,10,'#b5c6c0');text(i===0?'1 / Enter':'2',b.x+b.w-18,b.y+112,10,'#efc263','right');});
 text('Окно выбирается один раз. Нового переброса нет.',480,405,11,'#9cafa9','center');ctx.restore();}
function point(e){let b=canvas.getBoundingClientRect(),vw=window.visualViewport?.width||innerWidth,vh=window.visualViewport?.height||innerHeight,rot=matchMedia('(pointer:coarse)').matches&&vh>vw;return rot?{x:(e.clientY-b.top)*W/b.height,y:(b.right-e.clientX)*H/b.width}:{x:(e.clientX-b.left)*W/b.width,y:(e.clientY-b.top)*H/b.height};}
canvas.addEventListener('pointerdown',e=>{if(!open)return;let q=point(e);for(let i=0;i<CARDS.length;i++){let b=CARDS[i];if(q.x>=b.x&&q.x<=b.x+b.w&&q.y>=b.y&&q.y<=b.y+b.h){e.preventDefault();e.stopImmediatePropagation();choose(i);return;}}},{capture:true});
window.addEventListener('keydown',e=>{if(!open)return;if(e.code==='Digit2'||e.code==='Numpad2'){e.preventDefault();e.stopImmediatePropagation();choose(1);}else if(['Digit1','Numpad1','Enter','Escape'].includes(e.code)){e.preventDefault();e.stopImmediatePropagation();choose(0);}},{capture:true});
function tick(now){let dt=Math.min(.1,Math.max(0,(now-last)/1000||0));last=now;patchLegacyWeatherEffect();maybeOpen();draw();requestAnimationFrame(tick);}
window.B01WeatherWindow={get open(){return open;},get options(){return options;},get choice(){return choice;},bounds:CARDS,choose};
requestAnimationFrame(tick);
})();
