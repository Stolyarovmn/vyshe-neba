/* Earth: continuous sky + weather-reactive ocean + one finite starter island. */
(function(root){
'use strict';
const TOP=6400,BOTTOM=-132,WIDTH=1600,LEFT=-800;
const ISLAND_WORLD_LEFT=-330,ISLAND_WORLD_TOP=420,ISLAND_WORLD_WIDTH=1650,OCEAN_SURFACE_Y=150;
const hash=(x,y)=>{let n=Math.imul(x^73471,y^19283);n=Math.imul(n^(n>>>16),2246822519);return ((n^(n>>>13))>>>0)/4294967296;};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
let atlas=null,islandImage=null;
function earthAtlas(art){
 if(!art.routeSky?.naturalWidth)return null;
 if(atlas)return atlas;
 atlas=document.createElement('canvas');atlas.width=WIDTH;atlas.height=TOP-BOTTOM;
 const c=atlas.getContext('2d');c.imageSmoothingEnabled=false;
 c.drawImage(art.routeSky,0,0,WIDTH,TOP+100);
 const cap=c.createLinearGradient(0,0,0,180);cap.addColorStop(0,'#030818');cap.addColorStop(1,'#03081800');c.fillStyle=cap;c.fillRect(0,0,WIDTH,180);
 return atlas;
}
function islandAsset(){
 if(islandImage)return islandImage;
 islandImage=new Image();
 islandImage.src=root.__GAME_ASSETS__?.['environment/start_island_e0.png']||'assets/environment/start_island_e0.png';
 return islandImage;
}
function color(y){
 let stops=[[0,[44,171,222]],[2000,[16,79,162]],[4500,[5,22,73]],[6400,[3,8,24]],[18000,[3,8,24]]],i=0;
 while(i<stops.length-2&&y>stops[i+1][0])i++;
 let a=stops[i],b=stops[i+1],t=clamp((y-a[0])/(b[0]-a[0]),0,1);
 return a[1].map((v,j)=>Math.round(v+(b[1][j]-v)*t));
}
const mix=(a,b,t)=>a.map((v,i)=>Math.round(v+(b[i]-v)*t));
function waterPalette(weather){
 const rain=clamp(weather?.effectiveRain??weather?.rain??0,0,1);
 const storm=clamp(weather?.effectiveStorm??weather?.storm??0,0,1);
 const cloud=clamp(weather?.effectiveCloud??weather?.cloud??0,0,1);
 const mood=clamp(cloud*.45+rain*.3+storm*.65,0,1);
 return {
  horizon:mix([65,176,207],[43,78,105],mood),
  deep:mix([18,102,156],[18,39,62],mood),
  line:mix([149,221,225],[118,151,161],clamp(mood+.12,0,1)),
  foam:mix([205,239,226],[176,199,199],mood),
  rough:1+rain*1.5+storm*3.5
 };
}
function drawOcean(ctx,cam,r,project,z){
 const q=project(0,OCEAN_SURFACE_Y),y0=clamp(q.y,0,600);
 if(y0>=600)return;
 const pal=waterPalette(r.weather||root.Game?.weather),t=r.time||0,g=ctx.createLinearGradient(0,y0,0,600);
 g.addColorStop(0,`rgb(${pal.horizon})`);g.addColorStop(1,`rgb(${pal.deep})`);ctx.fillStyle=g;ctx.fillRect(0,y0,960,600-y0);
 ctx.save();ctx.globalAlpha=.34+.12*Math.min(1,pal.rough/3);ctx.lineWidth=1;
 for(let row=0;row<18;row++){
  const yy=y0+10+row*Math.max(8,(600-y0)/19),span=18+row*3,phase=(cam.x*.11+t*(12+row*.55))%(span*2);
  ctx.strokeStyle=row%4===0?`rgb(${pal.foam})`:`rgb(${pal.line})`;
  for(let x=-span*2-phase;x<980;x+=span*2){
   ctx.beginPath();ctx.moveTo(x,yy+Math.sin((x+t*25)*.025)*pal.rough);ctx.lineTo(x+span,yy+Math.sin((x+span+t*25)*.025)*pal.rough);ctx.stroke();
  }
 }
 ctx.restore();
}
function draw(ctx,cam,r,p,art){
 let z=cam.zoom||1,local=r.mode===2||r.mode===4,mars=r.mode===4,project=(x,y)=>root.Journey.project(x,y,cam);
 const rect=(x,y,w,h,c)=>{ctx.fillStyle=c;ctx.fillRect(Math.round(x),Math.round(y),Math.ceil(w),Math.ceil(h));};
 ctx.save();ctx.globalAlpha=1;ctx.imageSmoothingEnabled=false;
 for(let sy=0;sy<600;sy+=3){
  let wy=cam.y+(468-sy)/z,c=local?(mars?[24,13,21]:[3,8,24]):color(wy);
  rect(0,sy,960,3,`rgb(${c})`);
 }
 let bottom=cam.y-132/z,top=cam.y+468/z,left=cam.x-528/z,right=cam.x+432/z;
 const stars=()=>{for(let iy=Math.floor(bottom/150)-1;iy<=Math.ceil(top/150)+1;iy++)for(let ix=Math.floor(left/160)-1;ix<=Math.ceil(right/160)+1;ix++)for(let n=0;n<4;n++){
  let wy=iy*150+hash(ix*7+n,iy*11+3)*150;if(!local&&wy<6200)continue;let q=project(ix*160+hash(ix*3+n+19,iy*17)*160,wy),v=145+Math.floor(hash(ix+n,iy)*75)+Math.round(Math.sin((r.time||0)*1.7+hash(ix,iy+n)*6.28)*12);rect(q.x,q.y,2,2,`rgb(${v-15},${v},${Math.min(255,v+25)})`);
 }};
 if(!local){
  const map=earthAtlas(art);
  if(map){
   for(let band=Math.floor((left-LEFT)/WIDTH);band<=Math.floor((right-LEFT)/WIDTH);band++){
    let q=project(LEFT+band*WIDTH,TOP);ctx.save();
    if(Math.abs(band)%2){ctx.translate(q.x+WIDTH*z,q.y);ctx.scale(-1,1);}else ctx.translate(q.x,q.y);
    ctx.drawImage(map,0,0,map.width,map.height,0,0,WIDTH*z,map.height*z);ctx.restore();
   }
  }
  drawOcean(ctx,cam,r,project,z);
  const island=islandAsset(),islandHeight=ISLAND_WORLD_WIDTH*(island.naturalHeight||166)/(island.naturalWidth||384);
  if(island.complete&&island.naturalWidth&&right>ISLAND_WORLD_LEFT&&left<ISLAND_WORLD_LEFT+ISLAND_WORLD_WIDTH){
   const q=project(ISLAND_WORLD_LEFT,ISLAND_WORLD_TOP);
   ctx.drawImage(island,q.x,q.y,ISLAND_WORLD_WIDTH*z,islandHeight*z);
  }
  stars();
  if(r.y>3000){let t=clamp((r.y-3000)/15000,0,1),radius=t*(12+t*54);if(radius>0){let x=790,y=100+Math.sin(r.y*.00011)*28;if(!root.WorldSprites?.sprite(ctx,'moon',x,y,radius*2,radius*2)){ctx.fillStyle='#929dab';ctx.beginPath();ctx.arc(x,y,radius,0,Math.PI*2);ctx.fill();}}}
 }else{
  stars();
  let ground=project(0,0).y,pal=mars?['#bd7951','#9c573d','#713f35','#db9c68']:['#a4a9ad','#858f9c','#616d80','#d7d5c2'];
  if(ground<700){
   if(root.WorldSprites?.state.ready){
    const terrain=mars?'terrain_mars':'terrain_moon',m=root.WorldSprites.manifest.sprites[terrain],span=(m.width-48)*360/m.width;
    for(let ix=Math.floor(left/span)-1;ix<=Math.ceil(right/span)+1;ix++){const q=project(ix*span,0);root.WorldSprites.terrain(ctx,terrain,q.x,q.y,z,680);}
    const q=project(0,0),name=root.WorldSprites.id(mars?'pad_mars':'pad_moon',p.base||0);root.WorldSprites.sprite(ctx,name,q.x,q.y,170*z,undefined,{ay:root.WorldSprites.manifest.sprites[name].landingAnchor[1]});
    for(const side of [-1,1]){let blink=Math.floor((r.time||0)*3)%4===0;rect(q.x+side*72*z,q.y-10*z,2*z,2*z,blink?'#c9efcf':'#586f73');}
   }else{rect(0,ground,960,Math.max(0,680-ground),pal[1]);let q=project(0,0);rect(q.x-80*z,q.y-4*z,160*z,7*z,pal[2]);}
  }
  if(!root.WorldSprites?.sprite(ctx,'earth',780,105,66,66)){ctx.fillStyle='#477cb9';ctx.beginPath();ctx.arc(780,105,33,0,Math.PI*2);ctx.fill();}
 }
 ctx.restore();
}
root.WorldArt={draw,color,qa(){return{island:{left:ISLAND_WORLD_LEFT,top:ISLAND_WORLD_TOP,width:ISLAND_WORLD_WIDTH},oceanSurfaceY:OCEAN_SURFACE_Y,clearWater:waterPalette({}),stormWater:waterPalette({effectiveCloud:1,effectiveRain:1,effectiveStorm:1})};}};
})(typeof window!=='undefined'?window:globalThis);
