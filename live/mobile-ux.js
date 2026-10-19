/* Mobile readability + portrait flight presentation. Physics, hitboxes and economy stay unchanged. */
(function(root){
'use strict';
if(root.MobileUX?.installed)return;

const GAME_CANVAS_ID='canvas';
const MOBILE_FONT_SCALE=1.22;
const DESKTOP_COIN_SCALE=1.15;
const MOBILE_COIN_SCALE=1.32;
const ROCKET_VISUAL_SCALE=1.10;
const PORTRAIT={w:600,h:960,world:{x:0,y:168,w:600,h:660},source:{x:280,y:60,w:400,h:440}};

function coarse(){try{return !!root.matchMedia?.('(pointer:coarse)').matches;}catch{return false;}}
function touch(){return Number(root.navigator?.maxTouchPoints||0)>0;}
function compact(){return Math.min(Number(root.innerWidth)||9999,Number(root.innerHeight)||9999)<=900;}
function mobile(){return coarse()||(touch()&&compact());}
function portrait(){return mobile()&&Number(root.innerHeight||0)>Number(root.innerWidth||0)*1.15;}
function isGameContext(ctx){return ctx?.canvas?.id===GAME_CANVAS_ID;}
function scaledFont(font){if(!mobile())return font;return String(font).replace(/(\d+(?:\.\d+)?)px/,(_,n)=>`${Math.round(Number(n)*MOBILE_FONT_SCALE*10)/10}px`);}
function withReadableFont(ctx,fn,args){if(!isGameContext(ctx)||!mobile())return fn.apply(ctx,args);const before=ctx.font,after=scaledFont(before);if(after===before)return fn.apply(ctx,args);ctx.font=after;try{return fn.apply(ctx,args);}finally{ctx.font=before;}}

const proto=root.CanvasRenderingContext2D?.prototype;
if(proto){const fillText=proto.fillText,strokeText=proto.strokeText,measureText=proto.measureText;if(fillText)proto.fillText=function(...args){return withReadableFont(this,fillText,args);};if(strokeText)proto.strokeText=function(...args){return withReadableFont(this,strokeText,args);};if(measureText)proto.measureText=function(...args){return withReadableFont(this,measureText,args);};}

if(root.WorldSprites?.item){const item=root.WorldSprites.item.bind(root.WorldSprites);root.WorldSprites.item=function(ctx,id,x,y,scale=1,...rest){const factor=id==='coin'&&isGameContext(ctx)?(mobile()?MOBILE_COIN_SCALE:DESKTOP_COIN_SCALE):1;return item(ctx,id,x,y,scale*factor,...rest);};}
if(root.RocketVehicle?.draw){const draw=root.RocketVehicle.draw.bind(root.RocketVehicle);root.RocketVehicle.draw=function(ctx,options={}){if(!isGameContext(ctx))return draw(ctx,options);return draw(ctx,{...options,scale:(Number(options.scale)||1)*ROCKET_VISUAL_SCALE});};}

let portraitCanvas=null,pctx=null,pauseButton=null,gesture=null,loopStarted=false;
function css(){if(document.getElementById('portraitUxStyle'))return;const s=document.createElement('style');s.id='portraitUxStyle';s.textContent=`
body.portrait-game #game{width:min(100vw,62.5dvh)!important;height:min(100dvh,160vw)!important;max-width:100vw!important;max-height:100dvh!important;aspect-ratio:5/8!important;background:#050c15;}
#portraitCanvas{display:none;position:absolute;inset:0;width:100%;height:100%;image-rendering:pixelated;touch-action:none;user-select:none;z-index:3;background:#07111b;}
body.portrait-game:not(.portrait-flight) #canvas{width:100%!important;height:auto!important;max-width:100%!important;max-height:none!important;top:50%!important;left:0!important;transform:translateY(-50%)!important;}
body.portrait-flight #canvas{position:absolute!important;left:-10000px!important;top:0!important;width:960px!important;height:600px!important;opacity:0!important;pointer-events:none!important;transform:none!important;}
body.portrait-flight #portraitCanvas{display:block;}
body.portrait-game #fullscreenToggle{z-index:8;right:10px;top:10px;}
body.portrait-flight #touch{z-index:8;left:12px!important;right:12px!important;bottom:12px!important;top:auto!important;width:auto!important;display:flex!important;flex-direction:row!important;justify-content:flex-end!important;gap:10px!important;}
body.portrait-flight #touch button{width:64px!important;height:64px!important;min-width:64px!important;}
#portraitPause{display:none;position:absolute;z-index:9;left:12px;top:12px;width:58px;height:58px;border-radius:15px;border:1px solid #5d828b;background:#102633e8;color:#f4e9cf;font:700 26px system-ui;}
body.portrait-flight #portraitPause{display:block;}
`;document.head.appendChild(s);}
function emitKey(code,down){root.dispatchEvent(new KeyboardEvent(down?'keydown':'keyup',{code,key:code,bubbles:true,cancelable:true}));}
function releaseGesture(){if(!gesture)return;emitKey('KeyW',false);emitKey('KeyA',false);emitKey('KeyD',false);emitKey('ArrowUp',false);emitKey('ArrowLeft',false);emitKey('ArrowRight',false);gesture=null;}
function installPointer(){if(!portraitCanvas||portraitCanvas.__portraitPointer)return;portraitCanvas.__portraitPointer=true;
 portraitCanvas.addEventListener('pointerdown',e=>{if(root.Game?.screen!=='flight')return;e.preventDefault();portraitCanvas.setPointerCapture?.(e.pointerId);gesture={id:e.pointerId,x:e.clientX};if(!root.Game?.profile?.settings?.classicControls)emitKey('KeyW',true);});
 portraitCanvas.addEventListener('pointermove',e=>{if(!gesture||gesture.id!==e.pointerId)return;e.preventDefault();const dx=e.clientX-gesture.x,left=dx<-18,right=dx>18;emitKey('KeyA',left);emitKey('ArrowLeft',left);emitKey('KeyD',right);emitKey('ArrowRight',right);});
 for(const ev of ['pointerup','pointercancel','lostpointercapture'])portraitCanvas.addEventListener(ev,e=>{if(gesture&&(!e.pointerId||gesture.id===e.pointerId))releaseGesture();});
}
function ensurePortrait(){if(portraitCanvas)return;css();const game=document.getElementById('game'),src=document.getElementById(GAME_CANVAS_ID);if(!game||!src)return;portraitCanvas=document.createElement('canvas');portraitCanvas.id='portraitCanvas';portraitCanvas.width=PORTRAIT.w;portraitCanvas.height=PORTRAIT.h;portraitCanvas.setAttribute('aria-label','Вертикальный игровой экран');pctx=portraitCanvas.getContext('2d');pctx.imageSmoothingEnabled=false;game.appendChild(portraitCanvas);pauseButton=document.createElement('button');pauseButton.id='portraitPause';pauseButton.type='button';pauseButton.textContent='Ⅱ';pauseButton.setAttribute('aria-label','Пауза');pauseButton.addEventListener('click',()=>{emitKey('KeyP',true);setTimeout(()=>emitKey('KeyP',false),0);});game.appendChild(pauseButton);installPointer();}
function rr(ctx,x,y,w,h,r,fill,stroke){ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=1;ctx.stroke();}}
function label(ctx,s,x,y,size=22,color='#e9e7d6',align='left'){ctx.font=`700 ${size}px system-ui,-apple-system,sans-serif`;ctx.textAlign=align;ctx.textBaseline='middle';ctx.fillStyle=color;ctx.fillText(s,x,y);}
function chip(ctx,title,value,x,y,w,color='#70dfd0'){rr(ctx,x,y,w,58,12,'#0b1b27e8','#466a72');label(ctx,title,x+12,y+18,13,'#9cafa9');label(ctx,value,x+12,y+40,20,color);}
function drawPortraitHud(g){const r=g?.rocket;if(!r)return;const fuel=r.maxFuel?Math.max(0,Math.ceil(r.fuel/r.maxFuel*100)):0;pctx.fillStyle='#07111b';pctx.fillRect(0,0,600,168);chip(pctx,'ВЫСОТА',(r.y*10/1000).toFixed(1)+' км',82,16,112,'#70dfd0');chip(pctx,'СКОРОСТЬ',(r.vy>=0?'+':'')+r.vy.toFixed(1)+' м/с',202,16,144,r.vy<-20?'#ed7770':'#e9e7d6');chip(pctx,'ТОПЛИВО',fuel+'%',354,16,100,'#efc263');chip(pctx,'HP',Math.ceil(r.hp/r.maxHp*100)+'%',462,16,82,'#ed7770');rr(pctx,82,84,462,62,12,'#0b1b27d8','#355963');label(pctx,'МОНЕТЫ  '+Math.floor(r.coins||0),104,115,18,'#efc263');const w=root.Game?.weather,weather=['Ясно','Облачно','Дождь','Гроза'][Number(w?.kind)||0];label(pctx,weather,524,115,16,'#9cafa9','right');
 pctx.fillStyle='#07111b';pctx.fillRect(0,828,600,132);label(pctx,g.profile?.settings?.classicControls?'Веди в стороны · автотяга':'Держи экран — тяга · веди в стороны',20,858,17,'#b6c9c5');label(pctx,'Форсаж · парашют · расходники справа',20,890,14,'#788f90');}
function renderPortrait(){ensurePortrait();const g=root.Game,src=document.getElementById(GAME_CANVAS_ID),on=portrait();document.body.classList.toggle('portrait-game',on);document.body.classList.toggle('portrait-flight',!!(on&&g?.screen==='flight'));if(!on||!g||!src||!portraitCanvas){releaseGesture();return requestAnimationFrame(renderPortrait);}if(g.screen==='flight'){
  pctx.clearRect(0,0,600,960);const sx=PORTRAIT.source.x*(src.width/960),sy=PORTRAIT.source.y*(src.height/600),sw=PORTRAIT.source.w*(src.width/960),sh=PORTRAIT.source.h*(src.height/600);pctx.drawImage(src,sx,sy,sw,sh,PORTRAIT.world.x,PORTRAIT.world.y,PORTRAIT.world.w,PORTRAIT.world.h);drawPortraitHud(g);
 }
 requestAnimationFrame(renderPortrait);
}
function startLoop(){if(loopStarted)return;loopStarted=true;requestAnimationFrame(renderPortrait);}if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',startLoop,{once:true});else startLoop();

root.MobileUX={installed:true,isMobile:mobile,isPortrait:portrait,portraitViewport:PORTRAIT,metrics(){return{mobile:mobile(),portrait:portrait(),fontScale:mobile()?MOBILE_FONT_SCALE:1,coinScale:mobile()?MOBILE_COIN_SCALE:DESKTOP_COIN_SCALE,rocketScale:ROCKET_VISUAL_SCALE,portraitCanvas:portraitCanvas?[portraitCanvas.width,portraitCanvas.height]:null};}};
})(window);
