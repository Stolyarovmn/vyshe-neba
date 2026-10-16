/* Единая длинная карта: меняется окно камеры, а не прозрачность сцен. */
(function(root){
'use strict';
const TOP=6400,BOTTOM=-132,WIDTH=1600,LEFT=-800,BASE_FLOOR=600,BASE_LEFT=150;
const hash=(x,y)=>{let n=Math.imul(x^73471,y^19283);n=Math.imul(n^(n>>>16),2246822519);return ((n^(n>>>13))>>>0)/4294967296;};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
let atlas=null,atlasEra=-1;
function earthAtlas(art,era){
 if(!art.routeSky?.naturalWidth||!art.base?.naturalWidth)return null;
 if(atlas&&atlasEra===era)return atlas;
 atlas=document.createElement('canvas');atlas.width=WIDTH;atlas.height=TOP-BOTTOM;
 let c=atlas.getContext('2d');c.imageSmoothingEnabled=false;
 c.drawImage(art.routeSky,0,0,WIDTH,TOP+100);
 let cap=c.createLinearGradient(0,0,0,180);cap.addColorStop(0,'#030818');cap.addColorStop(1,'#03081800');c.fillStyle=cap;c.fillRect(0,0,WIDTH,180);
 let base=document.createElement('canvas');base.width=1280;base.height=800;
 let b=base.getContext('2d'),cw=art.base.naturalWidth/3,ch=art.base.naturalHeight/2;
 b.imageSmoothingEnabled=false;b.drawImage(art.base,era%3*cw+2,Math.floor(era/3)*ch+2,cw-4,ch-4,0,0,1280,800);
 // Пространственный шов запечён в карте выше зданий. База не исчезает по высоте.
 b.globalCompositeOperation='destination-in';let g=b.createLinearGradient(0,0,0,145);g.addColorStop(0,'transparent');g.addColorStop(1,'#fff');b.fillStyle=g;b.fillRect(0,0,1280,800);
 // Нулевая высота проходит по середине бетона, а не по переднему бордюру.
 c.drawImage(base,BASE_LEFT,TOP-BASE_FLOOR);
 c.save();c.translate(BASE_LEFT,0);c.scale(-1,1);c.drawImage(base,0,0,BASE_LEFT,800,0,TOP-BASE_FLOOR,BASE_LEFT,800);c.restore();
 let right=WIDTH-BASE_LEFT-1280;
 c.save();c.translate(2*(BASE_LEFT+1280),0);c.scale(-1,1);c.drawImage(base,1280-right,0,right,800,BASE_LEFT+1280,TOP-BASE_FLOOR,right,800);c.restore();
 atlasEra=era;return atlas;
}
function color(y){let stops=[[0,[44,171,222]],[2000,[16,79,162]],[4500,[5,22,73]],[6400,[3,8,24]],[18000,[3,8,24]]],i=0;while(i<stops.length-2&&y>stops[i+1][0])i++;let a=stops[i],b=stops[i+1],t=clamp((y-a[0])/(b[0]-a[0]),0,1);return a[1].map((v,j)=>Math.round(v+(b[1][j]-v)*t));}
function draw(ctx,cam,r,p,art){
 let z=cam.zoom||1,local=r.mode===2||r.mode===4,mars=r.mode===4,project=(x,y)=>root.Journey.project(x,y,cam);
 const rect=(x,y,w,h,c)=>{ctx.fillStyle=c;ctx.fillRect(Math.round(x),Math.round(y),Math.ceil(w),Math.ceil(h));};
 ctx.save();ctx.globalAlpha=1;ctx.imageSmoothingEnabled=false;
 for(let sy=0;sy<600;sy+=3){let wy=cam.y+(468-sy)/z,c=local?(mars?[24,13,21]:[3,8,24]):color(wy);rect(0,sy,960,3,`rgb(${c})`);}
 let bottom=cam.y-132/z,top=cam.y+468/z,left=cam.x-528/z,right=cam.x+432/z;
 const stars=()=>{for(let iy=Math.floor(bottom/150)-1;iy<=Math.ceil(top/150)+1;iy++)for(let ix=Math.floor(left/160)-1;ix<=Math.ceil(right/160)+1;ix++)for(let n=0;n<4;n++){
  let wy=iy*150+hash(ix*7+n,iy*11+3)*150;if(!local&&wy<6200)continue;let q=project(ix*160+hash(ix*3+n+19,iy*17)*160,wy),v=145+Math.floor(hash(ix+n,iy)*75)+Math.round(Math.sin((r.time||0)*1.7+hash(ix,iy+n)*6.28)*12);rect(q.x,q.y,2,2,`rgb(${v-15},${v},${Math.min(255,v+25)})`);
 }};
 if(!local){let map=earthAtlas(art,p.base||0);if(map){
   let skyHeight=TOP-BASE_FLOOR;
   for(let band=Math.floor((left-LEFT)/WIDTH);band<=Math.floor((right-LEFT)/WIDTH);band++){
    let q=project(LEFT+band*WIDTH,TOP);
    if(band===0){ctx.drawImage(map,q.x,q.y,map.width*z,map.height*z);continue;}
    ctx.save();if(Math.abs(band)%2){ctx.translate(q.x+WIDTH*z,q.y);ctx.scale(-1,1);}else ctx.translate(q.x,q.y);
    ctx.drawImage(map,0,0,WIDTH,skyHeight,0,0,WIDTH*z,skyHeight*z);ctx.restore();
    ctx.save();if(Math.abs(band)%2){ctx.translate(q.x+WIDTH*z,q.y);ctx.scale(-1,1);}else ctx.translate(q.x,q.y);ctx.drawImage(map,0,skyHeight,WIDTH,map.height-skyHeight,0,skyHeight*z,WIDTH*z,(map.height-skyHeight)*z);ctx.restore();
   }
  }
  let floor=project(0,BOTTOM+2).y;if(floor<600){rect(0,floor,960,600-floor,'#28332d');for(let row=Math.floor((BOTTOM-bottom)/18);row>=0;row--)for(let col=Math.floor(left/24);col<=Math.ceil(right/24);col++){let q=project(col*24,BOTTOM-row*18);rect(q.x,q.y,12*z,3*z,hash(col,row)>.5?'#41473b':'#1d2927');}}
  // Stars follow the opaque atmosphere layer, but precede physical celestial bodies.
  const baseRig=root.WorldSprites?.manifest.base;
  if(baseRig&&top>-132&&bottom<600){
   const rig=baseRig.eras[p.base||0],cw=baseRig.size[0]/3,ch=baseRig.size[1]/2,t=r.time||0;
   for(let band=Math.floor((left-LEFT)/WIDTH);band<=Math.floor((right-LEFT)/WIDTH);band++){
    const point=(u,v)=>{const ax=BASE_LEFT+(u-2)*1280/(cw-4),wy=600-(v-2)*800/(ch-4);return project(LEFT+band*WIDTH+(Math.abs(band)%2?WIDTH-ax:ax),wy);};
    for(const [kind,list]of [['lamp',rig.lamps],['beacon',rig.beacons]])for(const [i,a]of list.entries()){
     const q=point(a.x,a.y),on=kind==='lamp'?.85+.15*Math.sin(t*1.3+i):((t+i*.19)%1.32<.18?1:0);
     if(!on)continue;ctx.save();ctx.globalAlpha=on;const radius=(kind==='lamp'?12:5)*z,g=ctx.createRadialGradient(q.x,q.y,0,q.x,q.y,radius);
     g.addColorStop(0,a.suggestedColor+'70');g.addColorStop(1,a.suggestedColor+'00');ctx.fillStyle=g;ctx.fillRect(q.x-radius,q.y-radius,radius*2,radius*2);rect(q.x-z,q.y-z,2*z,z,a.suggestedColor);ctx.restore();
    }
    if((p.base||0)===5)for(const [i,[u,v,w,part]]of root.WorldSprites.manifest.baseDrones.placements.entries()){
     const q=point(u+Math.sin(t*.6+i)*1.5,v+Math.sin(t*1.2+i)*1.2);ctx.save();ctx.translate(q.x,q.y);if(Math.abs(band)%2)ctx.scale(-1,1);root.WorldSprites.baseDrone(ctx,part,0,0,w*z,t+i);ctx.restore();
    }
   }
  }
  stars();
  if(r.y>3000){let t=clamp((r.y-3000)/15000,0,1),radius=t*(12+t*54);if(radius>0){let x=790,y=100+Math.sin(r.y*.00011)*28;if(!root.WorldSprites?.sprite(ctx,'moon',x,y,radius*2,radius*2)){ctx.fillStyle='#929dab';ctx.beginPath();ctx.arc(x,y,radius,0,Math.PI*2);ctx.fill();}}}
  if(root.WorldSprites?.state.ready&&r.y<900){let q=project(0,160);for(const side of [-1,1])root.WorldSprites.sprite(ctx,root.WorldSprites.id('city',p.base||0),q.x+side*480*z,q.y,440*z,undefined,{ay:1,alpha:.25});}
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
root.WorldArt={draw,color};
})(typeof window!=='undefined'?window:globalThis);

