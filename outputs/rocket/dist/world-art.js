/* Earth: continuous sky + weather-reactive ocean + one finite start island. */
(function(root){
'use strict';
const TOP=6400,BOTTOM=-132,WIDTH=1600,LEFT=-800;
const SEA_LEVEL=40;
// Candidate geometry is measured against the 486x203 island preview. Launch table is aligned to world x=0 / ground y=0.
const ISLAND_WIDTH=1750,ISLAND_HEIGHT=731,ISLAND_LEFT=-540,ISLAND_TOP=450;
const hash=(x,y)=>{let n=Math.imul(x^73471,y^19283);n=Math.imul(n^(n>>>16),2246822519);return ((n^(n>>>13))>>>0)/4294967296;};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const mix=(a,b,t)=>a.map((v,i)=>Math.round(v+(b[i]-v)*t));
let atlas=null,island=null;
function earthAtlas(art){
 if(!art.routeSky?.naturalWidth)return null;
 if(atlas)return atlas;
 atlas=document.createElement('canvas');atlas.width=WIDTH;atlas.height=TOP-BOTTOM;
 const c=atlas.getContext('2d');c.imageSmoothingEnabled=false;
 c.drawImage(art.routeSky,0,0,WIDTH,TOP+100);
 const cap=c.createLinearGradient(0,0,0,180);cap.addColorStop(0,'#030818');cap.addColorStop(1,'#03081800');c.fillStyle=cap;c.fillRect(0,0,WIDTH,180);
 return atlas;
}
function startIsland(){
 if(island)return island;
 island=new Image();
 island.src=root.__GAME_ASSETS__?.['environment/start_island/e0_preview.png']||'assets/environment/start_island/e0_preview.png';
 return island;
}
function color(y){let stops=[[0,[44,171,222]],[2000,[16,79,162]],[4500,[5,22,73]],[6400,[3,8,24]],[18000,[3,8,24]]],i=0;while(i<stops.length-2&&y>stops[i+1][0])i++;let a=stops[i],b=stops[i+1],t=clamp((y-a[0])/(b[0]-a[0]),0,1);return a[1].map((v,j)=>Math.round(v+(b[1][j]-v)*t));}
function weatherState(){const w=root.Game?.weather;return{cloud:clamp(Number(w?.effectiveCloud)||0,0,1),rain:clamp(Number(w?.effectiveRain)||0,0,1),flash:clamp(Number(w?.flash)||0,0,1),kind:Number(w?.kind)||0};}
function drawOcean(ctx,project,cam,r,left,right,z,rect){
 const w=weatherState(),storm=clamp(Math.max(w.rain,w.cloud*.72)+(w.kind===3?.24:0),0,1);
 const top=project(0,SEA_LEVEL).y;if(top>=600)return;
 const y0=Math.max(0,top),deep=mix([8,91,126],[6,31,55],storm),surface=mix([29,151,177],[22,69,86],storm);
 const g=ctx.createLinearGradient(0,y0,0,600);g.addColorStop(0,`rgb(${surface})`);g.addColorStop(1,`rgb(${deep})`);ctx.fillStyle=g;ctx.fillRect(0,y0,960,600-y0);
 // World-anchored ripples; density and whitecaps grow with rain/storm.
 const rowStep=18,cell=46,t=r.time||0;
 for(let row=0;row<18;row++){
  const wy=SEA_LEVEL-row*rowStep,phase=t*(.7+storm*.9)+row*.61;
  for(let ix=Math.floor(left/cell)-2;ix<=Math.ceil(right/cell)+2;ix++){
   if(hash(ix,row)>0.42+storm*.18)continue;
   const wx=ix*cell+hash(ix*13,row*7)*cell,q=project(wx,wy+Math.sin(phase+ix*.37)*(1.5+storm*3));
   if(q.y<y0-2||q.y>604)continue;
   const len=(7+hash(ix,row+91)*18)*(1+storm*.35),alpha=.13+storm*.20;
   ctx.globalAlpha=alpha;ctx.fillStyle=storm>.62&&hash(ix+7,row)>.72?'#d6edf0':'#8bd2dc';ctx.fillRect(Math.round(q.x-len/2),Math.round(q.y),Math.round(len*z),Math.max(1,Math.round(z)));
  }
 }
 ctx.globalAlpha=1;
 if(w.flash>0){ctx.globalAlpha=w.flash*.14;rect(0,y0,960,600-y0,'#dff8ff');ctx.globalAlpha=1;}
}
function draw(ctx,cam,r,p,art){
 const z=cam.zoom||1,local=r.mode===2||r.mode===4,mars=r.mode===4,project=(x,y)=>root.Journey.project(x,y,cam);
 const rect=(x,y,w,h,c)=>{ctx.fillStyle=c;ctx.fillRect(Math.round(x),Math.round(y),Math.ceil(w),Math.ceil(h));};
 ctx.save();ctx.globalAlpha=1;ctx.imageSmoothingEnabled=false;
 for(let sy=0;sy<600;sy+=3){let wy=cam.y+(468-sy)/z,c=local?(mars?[24,13,21]:[3,8,24]):color(wy);rect(0,sy,960,3,`rgb(${c})`);}
 const bottom=cam.y-132/z,top=cam.y+468/z,left=cam.x-528/z,right=cam.x+432/z;
 const stars=()=>{for(let iy=Math.floor(bottom/150)-1;iy<=Math.ceil(top/150)+1;iy++)for(let ix=Math.floor(left/160)-1;ix<=Math.ceil(right/160)+1;ix++)for(let n=0;n<4;n++){
  const wy=iy*150+hash(ix*7+n,iy*11+3)*150;if(!local&&wy<6200)continue;let q=project(ix*160+hash(ix*3+n+19,iy*17)*160,wy),v=145+Math.floor(hash(ix+n,iy)*75)+Math.round(Math.sin((r.time||0)*1.7+hash(ix,iy+n)*6.28)*12);rect(q.x,q.y,2,2,`rgb(${v-15},${v},${Math.min(255,v+25)})`);
 }};
 if(!local){
  const map=earthAtlas(art);if(map){for(let band=Math.floor((left-LEFT)/WIDTH);band<=Math.floor((right-LEFT)/WIDTH);band++){
   const q=project(LEFT+band*WIDTH,TOP);ctx.save();if(Math.abs(band)%2){ctx.translate(q.x+WIDTH*z,q.y);ctx.scale(-1,1);}else ctx.translate(q.x,q.y);ctx.drawImage(map,0,0,map.width,map.height,0,0,WIDTH*z,map.height*z);ctx.restore();
  }}
  drawOcean(ctx,project,cam,r,left,right,z,rect);
  const im=startIsland();if(im.complete&&im.naturalWidth&&right>ISLAND_LEFT&&left<ISLAND_LEFT+ISLAND_WIDTH){const q=project(ISLAND_LEFT,ISLAND_TOP);ctx.drawImage(im,q.x,q.y,ISLAND_WIDTH*z,ISLAND_HEIGHT*z);}
  stars();
  if(r.y>3000){let t=clamp((r.y-3000)/15000,0,1),radius=t*(12+t*54);if(radius>0){let x=790,y=100+Math.sin(r.y*.00011)*28;if(!root.WorldSprites?.sprite(ctx,'moon',x,y,radius*2,radius*2)){ctx.fillStyle='#929dab';ctx.beginPath();ctx.arc(x,y,radius,0,Math.PI*2);ctx.fill();}}}
 }else{
  stars();
  const ground=project(0,0).y,pal=mars?['#bd7951','#9c573d','#713f35','#db9c68']:['#a4a9ad','#858f9c','#616d80','#d7d5c2'];
  if(ground<700){
   if(root.WorldSprites?.state.ready){const terrain=mars?'terrain_mars':'terrain_moon',m=root.WorldSprites.manifest.sprites[terrain],span=(m.width-48)*360/m.width;for(let ix=Math.floor(left/span)-1;ix<=Math.ceil(right/span)+1;ix++){const q=project(ix*span,0);root.WorldSprites.terrain(ctx,terrain,q.x,q.y,z,680);}const q=project(0,0),name=root.WorldSprites.id(mars?'pad_mars':'pad_moon',p.base||0);root.WorldSprites.sprite(ctx,name,q.x,q.y,170*z,undefined,{ay:root.WorldSprites.manifest.sprites[name].landingAnchor[1]});for(const side of [-1,1]){let blink=Math.floor((r.time||0)*3)%4===0;rect(q.x+side*72*z,q.y-10*z,2*z,2*z,blink?'#c9efcf':'#586f73');}}
   else{rect(0,ground,960,Math.max(0,680-ground),pal[1]);let q=project(0,0);rect(q.x-80*z,q.y-4*z,160*z,7*z,pal[2]);}
  }
  if(!root.WorldSprites?.sprite(ctx,'earth',780,105,66,66)){ctx.fillStyle='#477cb9';ctx.beginPath();ctx.arc(780,105,33,0,Math.PI*2);ctx.fill();}
 }
 ctx.restore();
}
root.WorldArt={draw,color,islandBounds:{left:ISLAND_LEFT,top:ISLAND_TOP,width:ISLAND_WIDTH,height:ISLAND_HEIGHT,seaLevel:SEA_LEVEL}};
})(typeof window!=='undefined'?window:globalThis);
