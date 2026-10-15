/* Непрерывный маршрут, камера и погода. Проверяются без браузера. */
(function(root){
const smooth=(a,b,x)=>{let t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function random(seed){let t=seed|0;return()=>{t+=0x6D2B79F5;let r=Math.imul(t^t>>>15,1|t);r^=r+Math.imul(r^r>>>7,61|r);return((r^r>>>14)>>>0)/4294967296;};}
function cameraStart(r){return {x:r.x+48,y:r.y-168+168*(1-smooth(0,300,r.y)),zoom:1};}
function followCamera(r,p,c,dt){let speed=Math.hypot(r.vx,r.vy),zoom=Math.max(.7,320/(320+speed));c.zoom+=(zoom-c.zoom)*(1-Math.exp(-dt*2));let lookX=clamp(r.vx/(110+speed)*230,-165,165),lookY=clamp(r.vy/(110+speed)*230,-155,155),ground=168*(1-smooth(0,300,r.y));let x=r.x+(48+lookX)/c.zoom,y=r.y+(-168+lookY+ground)/c.zoom,alpha=1-Math.exp(-dt*8);c.x+=(x-c.x)*alpha;c.y+=(y-c.y)*alpha;
// Страховка от задержек камеры: весь корпус всегда внутри поля, даже после резкого манёвра.
c.x=clamp(c.x,r.x-332/c.zoom,r.x+418/c.zoom);let minFeet=r.stageId==='booster'?165:120;c.y=clamp(c.y,r.y-(468-minFeet)/c.zoom,r.y+52/c.zoom);c.y=Math.max(132/c.zoom-132,c.y);return c;}
function project(x,y,c){return {x:528+(x-c.x)*c.zoom,y:468-(y-c.y)*c.zoom};}
function layerWeights(y){let a=smooth(800,1600,y),b=smooth(4200,5800,y),c=smooth(7400,9600,y);return [1-a,a-b,b-c,c];}
const WAYPOINTS=[{y:300,name:'Над облаками',reward:5},{y:1200,name:'Стратосфера',reward:10},{y:3000,name:'Высотная трасса',reward:15},{y:5000,name:'Серебристые облака',reward:20},{y:8500,name:'Край космоса',reward:30},{y:10000,name:'Орбитальный рубеж',reward:40},{y:14000,name:'Перелёт к Луне',reward:45},{y:18000,name:'Лунное сближение',reward:60}];
function pickWeather(rng){let x=rng();return x<.38?0:x<.65?1:x<.89?2:3;}
function createWeather(seed){let rng=random(seed+3511),kind=pickWeather(rng);return {rng,kind,time:0,next:16+rng()*16,changes:0,cloud:[0,.55,.85,1][kind],rain:[0,0,.65,1][kind],storm:kind===3?1:0,effectiveRain:0,effectiveCloud:0,effectiveStorm:0,wind:0,flash:0,lightningAt:5+rng()*6};}
function updateWeather(w,y,mode,dt){w.time+=dt;if(w.time>=w.next){w.kind=pickWeather(w.rng);w.next=w.time+18+w.rng()*22;w.changes++;}let t=1-Math.exp(-dt/5);w.cloud+=([0,.55,.85,1][w.kind]-w.cloud)*t;w.rain+=([0,0,.65,1][w.kind]-w.rain)*t;w.storm+=((w.kind===3?1:0)-w.storm)*t;let rainZone=(mode===2||mode===4)?0:1-smooth(800,1400,y),cloudZone=mode===2?0:1-smooth(1600,2400,y);w.effectiveRain=w.rain*rainZone;w.effectiveCloud=w.cloud*cloudZone;w.effectiveStorm=w.storm*rainZone;w.wind=(Math.sin(w.time*.35)*2+Math.sin(w.time*.8)*.7)*w.effectiveCloud*3;w.flash=Math.max(0,w.flash-dt);if(w.effectiveStorm>.6&&w.time>w.lightningAt){w.flash=.08;w.lightningAt=w.time+4+w.rng()*6;}return w;}
function objectKind(y,mode,era,variant){if(mode===2||mode===4)return 'rock';if(y<1600)return variant%3===0?'plane':'balloon';if(y<5000)return era<3||variant===0?'balloon':'plane';if(y<8500)return 'rock';return variant%2?'satellite':'rock';}
const api={smooth,clamp,random,cameraStart,followCamera,project,layerWeights,WAYPOINTS,createWeather,updateWeather,objectKind};if(typeof module!=='undefined')module.exports=api;else root.Journey=api;
})(typeof window!=='undefined'?window:globalThis);
