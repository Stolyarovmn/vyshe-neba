/* B01 Weather Complex measured cut-out rig QA, E0-E5.
 * Motion is driven by WeatherComplexRigController events, not decorative loops.
 */
'use strict';
(()=>{
const canvas=document.getElementById('rigqa'),ctx=canvas?.getContext('2d');
if(!canvas||!ctx)return;
ctx.imageSmoothingEnabled=false;
const W=96,H=122,REG=[48,118],ROOT='assets/placeables/base/weather_complex/parts/';
const ORDER=['e0_1978','e1_1986','e2_1998','e3_2015','e4_2035','e5_2060'];
const ATLASES=['body','sensor','vane','indicator'];
const imgs={};let loaded=0,rig=null,controller=null,eraIndex=0,showPivots=true,last=performance.now(),clock=0,autoDemo=true,cycleId=-1,prepSent=false,selectSent=false;
for(const name of ATLASES){const im=new Image();im.onload=()=>loaded++;im.src=ROOT+name+'_eras.png';imgs[name]=im;}
fetch(ROOT+'rig.json').then(r=>{if(!r.ok)throw new Error('rig.json '+r.status);return r.json();}).then(v=>{rig=v;controller=new WeatherComplexRigController(rig,ORDER[0]);}).catch(err=>{console.error(err);rig={error:String(err)};});
function clear(){ctx.fillStyle='#081018';ctx.fillRect(0,0,canvas.width,canvas.height);}
function panel(x,y,w,h,title){ctx.fillStyle='#0f1d29';ctx.fillRect(x,y,w,h);ctx.strokeStyle='#395464';ctx.strokeRect(x+.5,y+.5,w-1,h-1);ctx.fillStyle='#dce5df';ctx.font='12px monospace';ctx.fillText(title,x+10,y+18);}
function cellRect(index){return[(index%3)*W,Math.floor(index/3)*H,W,H];}
function drawCell(name,index,x,y,scale){const [sx,sy,sw,sh]=cellRect(index);ctx.drawImage(imgs[name],sx,sy,sw,sh,Math.round(x-REG[0]*scale),Math.round(y-REG[1]*scale),Math.round(W*scale),Math.round(H*scale));}
function drawRigidCell(name,index,pivot,angle,x,y,scale){if(!pivot)return;const [sx,sy,sw,sh]=cellRect(index),px=(pivot[0]-REG[0])*scale,py=(pivot[1]-REG[1])*scale;ctx.save();ctx.translate(Math.round(x+px),Math.round(y+py));ctx.rotate(angle);ctx.drawImage(imgs[name],sx,sy,sw,sh,Math.round(-pivot[0]*scale),Math.round(-pivot[1]*scale),Math.round(W*scale),Math.round(H*scale));ctx.restore();}
function drawPivot(x,y,pivot,scale,color){if(!pivot)return;const px=x+(pivot[0]-REG[0])*scale,py=y+(pivot[1]-REG[1])*scale;ctx.strokeStyle=color;ctx.lineWidth=1;ctx.beginPath();ctx.arc(px,py,4,0,Math.PI*2);ctx.stroke();ctx.beginPath();ctx.moveTo(px-6,py);ctx.lineTo(px+6,py);ctx.moveTo(px,py-6);ctx.lineTo(px,py+6);ctx.stroke();}
function drawRig(x,y,scale,pose){const stem=ORDER[eraIndex],e=rig.eras[stem];drawCell('body',eraIndex,x,y,scale);if(e.sensor.present)drawRigidCell('sensor',eraIndex,e.sensor.pivot,pose.sensorAngle||0,x,y,scale);if(e.vane.present)drawRigidCell('vane',eraIndex,e.vane.pivot,pose.vaneAngle||0,x,y,scale);if(e.indicator.present)drawCell('indicator',eraIndex,x,y,scale);if(pose.indicatorOn){const p=e.indicator.pivot,lx=x+(p[0]-REG[0]+6)*scale,ly=y+(p[1]-REG[1])*scale;ctx.fillStyle='#f2b84d';ctx.fillRect(Math.round(lx),Math.round(ly),Math.max(1,Math.round(2*scale)),Math.max(1,Math.round(2*scale)));}if(showPivots){drawPivot(x,y,e.sensor.pivot,scale,'#5fd0ff');drawPivot(x,y,e.vane.pivot,scale,'#f7bf5c');drawPivot(x,y,e.indicator.pivot,scale,'#ff6b6b');}}
function restPose(){return{state:'REST',sensorAngle:0,vaneAngle:0,indicatorOn:false};}
function label(){const stem=ORDER[eraIndex],e=rig?.eras?.[stem];return e?stem.toUpperCase()+' / '+e.year:stem.toUpperCase();}
function driveQaEvents(){if(!autoDemo||!controller)return;const id=Math.floor(clock/4.5),t=clock-id*4.5;if(id!==cycleId){cycleId=id;prepSent=false;selectSent=false;}if(t>=.25&&!prepSent){controller.dispatch('launch_prepare');prepSent=true;}if(t>=2.0&&!selectSent){controller.dispatch('weather_window_selected',{index:id%2});selectSent=true;}}
function frame(now){const dt=Math.min(.05,(now-last)/1000);last=now;clock+=dt;clear();if(controller){driveQaEvents();controller.update(dt,{wind:Math.sin(clock*.35)});}const pose=controller?.pose()||restPose();panel(16,16,450,560,'B01 '+label()+' / REST RECONSTRUCTION');panel(494,16,450,560,'B01 '+label()+' / '+pose.state+' MOTION QA');if(loaded===ATLASES.length&&rig?.eras&&controller){drawRig(242,520,3.2,restPose());drawRig(720,520,3.2,pose);const e=rig.eras[ORDER[eraIndex]];ctx.fillStyle='#91a9b2';ctx.font='11px monospace';ctx.fillText('1-6 / ←→ era · SPACE auto-demo · ENTER preview · S select · P pivots',24,594);ctx.fillText('sensor '+JSON.stringify(e.sensor.pivot)+' · vane '+JSON.stringify(e.vane.pivot)+' · indicator '+JSON.stringify(e.indicator.pivot),24,612);}else{ctx.fillStyle='#dce5df';ctx.font='14px monospace';ctx.fillText(rig?.error?'Rig metadata error: '+rig.error:'Loading B01 E0-E5 rig atlases…',24,48);}requestAnimationFrame(frame);}
function setEra(i){eraIndex=(i+ORDER.length)%ORDER.length;clock=0;cycleId=-1;prepSent=selectSent=false;if(controller)controller.setEra(ORDER[eraIndex]);}
addEventListener('keydown',e=>{if(e.code==='Space'){autoDemo=!autoDemo;e.preventDefault();return;}if(e.key==='p'||e.key==='P'){showPivots=!showPivots;return;}if(e.key==='Enter'){controller?.dispatch('launch_prepare');e.preventDefault();return;}if(e.key==='s'||e.key==='S'){controller?.dispatch('weather_window_selected',{index:0});return;}if(e.key==='ArrowRight'){setEra(eraIndex+1);e.preventDefault();return;}if(e.key==='ArrowLeft'){setEra(eraIndex-1);e.preventDefault();return;}if(/^[1-6]$/.test(e.key)){setEra(Number(e.key)-1);}});
window.B01RigQA={ORDER,REG,setEra,get controller(){return controller;},get eraIndex(){return eraIndex;}};requestAnimationFrame(frame);
})();
