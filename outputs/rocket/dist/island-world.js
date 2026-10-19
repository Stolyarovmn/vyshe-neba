/* Finite start island over continuous weather-reactive ocean. Code owns water/weather; art owns island terrain. */
(function(root){
'use strict';
if(!root.WorldArt?.draw||root.WorldIsland?.installed)return;
const legacyDraw=root.WorldArt.draw.bind(root.WorldArt);
const W=960,H=600;
const ISLAND={left:-448,top:335,width:1440,height:602,padX:0,padY:0,right:992,bottom:-267};
const WATER={top:130,bottom:-360};
const image=new Image();
image.src=(root.__GAME_ASSETS__?.['environment/start_island/start-island.webp'])||'assets/environment/start_island/start-island.webp';
const stats={draws:0,culls:0};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const mix=(a,b,t)=>a.map((v,i)=>Math.round(v+(b[i]-v)*t));
const rgb=a=>`rgb(${a[0]},${a[1]},${a[2]})`;
function project(x,y,cam){return root.Journey.project(x,y,cam);}
function waterPalette(weather){
 const cloud=clamp(Number(weather?.effectiveCloud??weather?.cloud??0),0,1),rain=clamp(Number(weather?.effectiveRain??weather?.rain??0),0,1),storm=clamp(Number(weather?.effectiveStorm??weather?.storm??0),0,1);
 let top=mix([42,159,196],[53,83,105],cloud*.72),deep=mix([12,82,132],[18,44,67],cloud*.82);
 top=mix(top,[37,69,86],rain*.48+storm*.28);deep=mix(deep,[9,27,43],rain*.42+storm*.38);
 return {top,deep,rough:.22+cloud*.26+rain*.32+storm*.55,shine:(1-cloud)*.48};
}
function drawOcean(ctx,cam,r){
 const z=cam.zoom||1,qTop=project(0,WATER.top,cam),qBottom=project(0,WATER.bottom,cam),y0=Math.max(0,Math.min(H,qTop.y)),y1=Math.max(0,Math.min(H,qBottom.y));
 if(y1<=y0)return;
 const p=waterPalette(r.weather||root.Game?.weather);
 const start=Math.floor(y0/3)*3;for(let sy=start;sy<y1;sy+=3){let wy=cam.y+(468-sy)/z,u=clamp((WATER.top-wy)/(WATER.top-WATER.bottom),0,1);ctx.fillStyle=rgb(mix(p.top,p.deep,u));ctx.fillRect(0,sy,W,3);}
 const t=Number(r.time||0),wind=Number((r.weather||root.Game?.weather)?.wind||0);ctx.save();ctx.globalAlpha=.14+.18*p.rough;ctx.lineWidth=1;
 for(let row=0;row<18;row++){
  const wy=WATER.top-row*28,sy=project(0,wy,cam).y;if(sy<y0||sy>y1)continue;const spacing=70-row*1.5,shift=(t*(9+row*.7)+wind*3+row*31)%spacing;ctx.strokeStyle=row<5?'#b9e4e7':'#83c5d5';
  for(let x=-80+shift;x<W+80;x+=spacing){const len=16+((row*13)%22)*p.rough;ctx.beginPath();ctx.moveTo(x,sy);ctx.lineTo(x+len,sy+Math.sin(t*1.2+row)*1.2);ctx.stroke();}
 }
 if(p.shine>.05){ctx.globalAlpha=p.shine*.22;ctx.fillStyle='#f4cf8d';for(let i=0;i<8;i++){let wy=WATER.top-28-i*17,yy=project(0,wy,cam).y,ww=70-i*5;ctx.fillRect(480-ww/2+Math.sin(t+i)*8,yy,ww,1);}}
 ctx.restore();
}
function drawIsland(ctx,cam){
 if(!image.complete||!image.naturalWidth)return false;
 const z=cam.zoom||1,left=cam.x-528/z,right=cam.x+432/z,bottom=cam.y-132/z,top=cam.y+468/z;
 if(right<ISLAND.left||left>ISLAND.right||top<ISLAND.bottom||bottom>ISLAND.top){stats.culls++;return false;}
 const q=project(ISLAND.left,ISLAND.top,cam);ctx.save();ctx.imageSmoothingEnabled=false;ctx.drawImage(image,q.x,q.y,ISLAND.width*z,ISLAND.height*z);ctx.restore();stats.draws++;return true;
}
function withoutBakedBase(ctx,cam,r,p,art){
 const ws=root.WorldSprites,oldSprite=ws?.sprite;
 if(ws&&oldSprite)ws.sprite=function(c,id,...args){if(String(id).startsWith('city'))return true;return oldSprite.call(ws,c,id,...args);};
 try{legacyDraw(ctx,cam,r,p,{...art,base:null});}finally{if(ws&&oldSprite)ws.sprite=oldSprite;}
}
root.WorldArt.draw=function(ctx,cam,r,p,art){
 if(r.mode===2||r.mode===4)return legacyDraw(ctx,cam,r,p,art);
 withoutBakedBase(ctx,cam,r,p,art);
 drawOcean(ctx,cam,r);
 drawIsland(ctx,cam);
};
root.WorldIsland={installed:true,bounds:{...ISLAND},water:{...WATER},image,waterPalette,stats,resetStats(){stats.draws=0;stats.culls=0;}};
})(window);
