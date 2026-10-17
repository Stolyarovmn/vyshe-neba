/* B01 Weather Complex E0 measured cut-out rig QA.
 * ref2game rule: only real subassemblies move; the whole placeable never bobs/rotates/scales as animation.
 */
'use strict';
(()=>{
const canvas=document.getElementById('rigqa'),ctx=canvas?.getContext('2d');
if(!canvas||!ctx)return;
ctx.imageSmoothingEnabled=false;
const W=96,H=122,REG=[48,118];
const PIVOTS={sensor:[42,29],vane:[48,36],indicator:[57,63]};
const ROOT='assets/placeables/base/weather_complex/parts/e0_1978/';
const names=['body','sensor','vane','indicator'];
const imgs={};
let ready=0,motion=true,showPivots=true,last=performance.now(),clock=0;
for(const name of names){const im=new Image();im.onload=()=>ready++;im.src=ROOT+name+'.png';imgs[name]=im;}
function clear(){ctx.fillStyle='#081018';ctx.fillRect(0,0,canvas.width,canvas.height);}
function panel(x,y,w,h,title){ctx.fillStyle='#0f1d29';ctx.fillRect(x,y,w,h);ctx.strokeStyle='#395464';ctx.strokeRect(x+.5,y+.5,w-1,h-1);ctx.fillStyle='#dce5df';ctx.font='12px monospace';ctx.fillText(title,x+10,y+18);}
function drawImageAt(im,x,y,scale){ctx.drawImage(im,Math.round(x-REG[0]*scale),Math.round(y-REG[1]*scale),Math.round(W*scale),Math.round(H*scale));}
function drawRigidPart(im,pivot,angle,x,y,scale){
 const px=(pivot[0]-REG[0])*scale,py=(pivot[1]-REG[1])*scale;
 ctx.save();ctx.translate(Math.round(x+px),Math.round(y+py));ctx.rotate(angle);
 ctx.drawImage(im,Math.round(-pivot[0]*scale),Math.round(-pivot[1]*scale),Math.round(W*scale),Math.round(H*scale));ctx.restore();
}
function drawPivot(x,y,pivot,scale,color){const px=x+(pivot[0]-REG[0])*scale,py=y+(pivot[1]-REG[1])*scale;ctx.strokeStyle=color;ctx.lineWidth=1;ctx.beginPath();ctx.arc(px,py,4,0,Math.PI*2);ctx.stroke();ctx.beginPath();ctx.moveTo(px-6,py);ctx.lineTo(px+6,py);ctx.moveTo(px,py-6);ctx.lineTo(px,py+6);ctx.stroke();}
function stateAt(t){
 // QA motion only. Sensor and vane are the actual isolated rigid components.
 return motion?{
  sensorAngle:Math.sin(t*.9)*.16,
  vaneAngle:Math.sin(t*.53+.8)*.22,
  indicatorOn:(Math.floor(t*2)%4)===0
 }:{sensorAngle:0,vaneAngle:0,indicatorOn:false};
}
function drawRig(x,y,scale,t,animated){const s=animated?stateAt(t):{sensorAngle:0,vaneAngle:0,indicatorOn:false};
 drawImageAt(imgs.body,x,y,scale);
 drawRigidPart(imgs.sensor,PIVOTS.sensor,s.sensorAngle,x,y,scale);
 drawRigidPart(imgs.vane,PIVOTS.vane,s.vaneAngle,x,y,scale);
 drawImageAt(imgs.indicator,x,y,scale);
 if(s.indicatorOn){const lx=x+(64-REG[0])*scale,ly=y+(63-REG[1])*scale;ctx.fillStyle='#f2b84d';ctx.fillRect(Math.round(lx),Math.round(ly),Math.max(1,Math.round(2*scale)),Math.max(1,Math.round(2*scale)));}
 if(showPivots){drawPivot(x,y,PIVOTS.sensor,scale,'#5fd0ff');drawPivot(x,y,PIVOTS.vane,scale,'#f7bf5c');drawPivot(x,y,PIVOTS.indicator,scale,'#ff6b6b');}
}
function frame(now){const dt=Math.min(.05,(now-last)/1000);last=now;clock+=dt;clear();
 panel(16,16,450,560,'B01 E0 / REST RECONSTRUCTION');panel(494,16,450,560,'B01 E0 / RIG MOTION QA');
 if(ready===names.length){drawRig(242,520,3.2,0,false);drawRig(720,520,3.2,clock,true);ctx.fillStyle='#91a9b2';ctx.font='11px monospace';ctx.fillText('SPACE motion on/off · P pivots',24,594);ctx.fillText('sensor pivot [42,29] · vane [48,36] · indicator [57,63]',24,612);}
 else{ctx.fillStyle='#dce5df';ctx.font='14px monospace';ctx.fillText('Loading B01 rig parts…',24,48);}
 requestAnimationFrame(frame);
}
addEventListener('keydown',e=>{if(e.code==='Space'){motion=!motion;e.preventDefault();}if(e.key==='p'||e.key==='P')showPivots=!showPivots;});
window.B01RigQA={PIVOTS,REG,stateAt};requestAnimationFrame(frame);
})();
