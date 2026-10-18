/* Mobile readability layer: presentation only. Physics, hitboxes and economy stay unchanged. */
(function(root){
'use strict';
if(root.MobileUX?.installed)return;

const GAME_CANVAS_ID='canvas';
const MOBILE_FONT_SCALE=1.22;
const DESKTOP_COIN_SCALE=1.15;
const MOBILE_COIN_SCALE=1.32;
const ROCKET_VISUAL_SCALE=1.10;

function coarse(){try{return !!root.matchMedia?.('(pointer:coarse)').matches;}catch{return false;}}
function mobile(){return coarse();}
function isGameContext(ctx){return ctx?.canvas?.id===GAME_CANVAS_ID;}
function scaledFont(font){
 if(!mobile())return font;
 return String(font).replace(/(\d+(?:\.\d+)?)px/,(_,n)=>`${Math.round(Number(n)*MOBILE_FONT_SCALE*10)/10}px`);
}
function withReadableFont(ctx,fn,args){
 if(!isGameContext(ctx)||!mobile())return fn.apply(ctx,args);
 const before=ctx.font,after=scaledFont(before);
 if(after===before)return fn.apply(ctx,args);
 ctx.font=after;
 try{return fn.apply(ctx,args);}finally{ctx.font=before;}
}

const proto=root.CanvasRenderingContext2D?.prototype;
if(proto){
 const fillText=proto.fillText,strokeText=proto.strokeText,measureText=proto.measureText;
 if(fillText)proto.fillText=function(...args){return withReadableFont(this,fillText,args);};
 if(strokeText)proto.strokeText=function(...args){return withReadableFont(this,strokeText,args);};
 if(measureText)proto.measureText=function(...args){return withReadableFont(this,measureText,args);};
}

if(root.WorldSprites?.item){
 const item=root.WorldSprites.item.bind(root.WorldSprites);
 root.WorldSprites.item=function(ctx,id,x,y,scale=1,...rest){
  const factor=id==='coin'&&isGameContext(ctx)?(mobile()?MOBILE_COIN_SCALE:DESKTOP_COIN_SCALE):1;
  return item(ctx,id,x,y,scale*factor,...rest);
 };
}

if(root.RocketVehicle?.draw){
 const draw=root.RocketVehicle.draw.bind(root.RocketVehicle);
 root.RocketVehicle.draw=function(ctx,options={}){
  if(!isGameContext(ctx))return draw(ctx,options);
  return draw(ctx,{...options,scale:(Number(options.scale)||1)*ROCKET_VISUAL_SCALE});
 };
}

root.MobileUX={
 installed:true,
 isMobile:mobile,
 metrics(){return{
  mobile:mobile(),
  fontScale:mobile()?MOBILE_FONT_SCALE:1,
  coinScale:mobile()?MOBILE_COIN_SCALE:DESKTOP_COIN_SCALE,
  rocketScale:ROCKET_VISUAL_SCALE
 };}
};
})(window);
