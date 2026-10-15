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
 for(let iy=Math.floor(bottom/150)-1;iy<=Math.ceil(top/150)+1;iy++)for(let ix=Math.floor(left/160)-1;ix<=Math.ceil(right/160)+1;ix++)for(let n=0;n<4;n++){
  let wy=iy*150+hash(ix*7+n,iy*11+3)*150;if(!local&&wy<6200)continue;let q=project(ix*160+hash(ix*3+n+19,iy*17)*160,wy),v=145+Math.floor(hash(ix+n,iy)*75);rect(q.x,q.y,2,2,`rgb(${v-15},${v},${Math.min(255,v+25)})`);
 }
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
  if(r.y>3000){let t=clamp((r.y-3000)/15000,0,1),radius=t*(12+t*54);if(radius>0){let x=790,y=100+Math.sin(r.y*.00011)*28;ctx.fillStyle='#929dab';ctx.beginPath();ctx.arc(x,y,radius,0,Math.PI*2);ctx.fill();for(let i=0;i<7;i++){let a=i*2.4,d=radius*.65*hash(i,43);ctx.fillStyle='#65758c';ctx.beginPath();ctx.arc(x+Math.cos(a)*d,y+Math.sin(a)*d,Math.max(.3,radius*.14*hash(i,24)),0,Math.PI*2);ctx.fill();}}}
 }else{
  let ground=project(0,0).y,pal=mars?['#bd7951','#9c573d','#713f35','#db9c68']:['#a4a9ad','#858f9c','#616d80','#d7d5c2'];
  if(ground<700){rect(0,ground,960,Math.max(0,680-ground),pal[1]);for(let sx=-12;sx<972;sx+=12){let wx=cam.x+(sx-528)/z,rough=Math.sin(wx*.03)*3+hash(Math.floor(wx/12),34)*5;rect(sx,ground-rough*z,13,10*z,pal[0]);}
   for(let iy=0;iy<12;iy++)for(let ix=Math.floor(left/95)-1;ix<=Math.ceil(right/95)+1;ix++){if(hash(ix,iy+119)>.6)continue;let q=project(ix*95+hash(ix,iy)*50,-25-iy*40-hash(iy,ix)*15),rw=(6+hash(ix+9,iy)*22)*z;ctx.fillStyle=pal[2];ctx.beginPath();ctx.ellipse(q.x,q.y,rw,rw*.3,0,0,Math.PI*2);ctx.fill();rect(q.x-rw*.7,q.y+rw*.15,rw*1.4,2*z,pal[3]);}
   let q=project(0,0);rect(q.x-80*z,q.y-4*z,160*z,7*z,pal[2]);for(let side of [-1,1]){rect(q.x+side*75*z,q.y-27*z,4*z,24*z,pal[0]);rect(q.x+side*75*z-3*z,q.y-29*z,10*z,5*z,'#8fe4ce');}
  }
  ctx.fillStyle=mars?'#a9b7ac':'#477cb9';ctx.beginPath();ctx.arc(780,105,33,0,Math.PI*2);ctx.fill();rect(761,93,21,9,'#9dc7c2');rect(783,110,20,6,'#78a8a8');
 }
 ctx.restore();
}
root.WorldArt={draw,color};
})(typeof window!=='undefined'?window:globalThis);
