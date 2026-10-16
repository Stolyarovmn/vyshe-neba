/* Physical artwork and articulated attachments; time is supplied by the game. */
(function(root){
'use strict';
const years=[1978,1986,1998,2015,2035,2060],images=new Map();
const state={ready:false,errors:[],draws:0};let manifest={sprites:{}};
const url=k=>root.__GAME_ASSETS__?.[k]||'assets/'+k;
const ready=fetch(url('world/manifest.json')).then(r=>{if(!r.ok)throw Error('world manifest '+r.status);return r.json();}).then(async m=>{
 manifest=m;await Promise.all(Object.keys(m.sprites).map(async name=>{const im=new Image();im.src=url('world/'+name+'.png');await im.decode();images.set(name,im);}));state.ready=true;
}).catch(e=>state.errors.push(String(e)));
function id(name,era){return era==null?name:name+'_'+years[Math.max(0,Math.min(5,era|0))];}
function sprite(ctx,name,x,y,w,h,options={}){const im=images.get(name);if(!im)return false;
 h??=w*im.height/im.width;ctx.save();ctx.translate(x,y);if(options.angle)ctx.rotate(options.angle);ctx.globalAlpha*=options.alpha??1;
 ctx.imageSmoothingEnabled=false;ctx.drawImage(im,-w*(options.ax??.5),-h*(options.ay??.5),w,h);ctx.restore();state.draws++;return true;}
function body(ctx,o){if(!state.ready)return false;let era=o.era||0,t=o.time||0;ctx.filter=o.skin==='wasp'?'hue-rotate(45deg)':o.skin==='arctic'?'hue-rotate(170deg)':o.skin==='cosmos'?'hue-rotate(270deg)':'none';
 const byHeight=(name,y,height)=>{const m=manifest.sprites[name];return sprite(ctx,name,0,y,height*m.width/m.height,height,{ay:m.anchor[1]});};
 const anchorTrace=(name,y,h,drawY)=>{if(!root.__TRACE_WORLD)return;const m=manifest.sprites[name],w=h*m.width/m.height,tx=ctx.getTransform(),p=([x,y])=>[tx.a*x+tx.c*y+tx.e,tx.b*x+tx.d*y+tx.f],sim=p([(m.exhaust[0]-.5)*w,y+(m.exhaust[1]-m.anchor[1])*h]),drawn=p([0,drawY]);(root.__ANCHORS??=[]).push({name:name+'-nozzle',sim,drawn,tol:.5,d:Math.hypot(sim[0]-drawn[0],sim[1]-drawn[1])});};
 const flame=(y,small)=>{if(!o.thrust)return;const length=(small?13:27)*(1+.16*Math.sin(t*43));ctx.save();
 for(let d=0;d<length;d+=2){const taper=(1-d/length),half=Math.max(.5,5*taper+.55*Math.sin(t*61+d*1.4));ctx.fillStyle=era>=4?'#d26c69':'#e4753f';ctx.fillRect(-half,y+d,half*2,2);if(d<length*.8){let core=half*.45;ctx.fillStyle=era>=4?'#a4e6fc':'#ffe1a0';ctx.fillRect(-core,y+d,core*2,2);}}
 ctx.restore();};
 if(o.debris){const name=id(o.stageId==='booster'?'booster':o.stageId==='capsule'?'capsule':'core',era);const height=o.stageId==='booster'?36:o.stageId==='capsule'?35:72;if(o.stageId==='core'){ctx.save();ctx.beginPath();ctx.rect(-40,-34,80,40);ctx.clip();byHeight(name,3,height);ctx.restore();}else byHeight(name,0,height);return true;}
 if(o.stageId==='capsule'){anchorTrace(id('capsule',era),0,35,0);flame(0,true);byHeight(id('capsule',era),0,35);}
 else if(o.stageId==='booster'){anchorTrace(id('booster',era),0,36,0);flame(0,false);byHeight(id('core',era),-32,72);byHeight(id('booster',era),0,36);}
 else{anchorTrace(id('core',era),3,72,3);flame(3,false);byHeight(id('core',era),3,72);}
 const turn=typeof o.maneuver==='number'?o.maneuver:o.maneuver?.turn||0;
 if(Math.abs(turn)>.03&&!o.debris){let side=turn>0?-1:1,yy=o.stageId==='capsule'?-22:o.stageId==='booster'?-78:-43,xx=o.stageId==='capsule'?15:19,len=5+3*Math.sin(t*32)**2;
 ctx.fillStyle='#bbf4ff';ctx.beginPath();ctx.moveTo(side*xx,yy-1);ctx.lineTo(side*(xx+len),yy);ctx.lineTo(side*xx,yy+2);ctx.fill();}
 return true;}
function parachute(ctx,era,time){if(!state.ready)return false;
 const name=id('canopy',era),m=manifest.sprites[name],swing=Math.sin(time*2.7)*4,canopyY=-100,w=80,h=w*m.height/m.width,angle=Math.sin(time*2.7)*.025;
 ctx.save();ctx.strokeStyle='#a7b3ba';ctx.lineWidth=1;
 for(const side of [-1,1]){const lx=side*34,ly=h*.38,tx=swing+lx*Math.cos(angle)-ly*Math.sin(angle),ty=canopyY+lx*Math.sin(angle)+ly*Math.cos(angle);ctx.beginPath();ctx.moveTo(side*7,-28);ctx.quadraticCurveTo(side*20+swing*.3,-53,tx,ty);ctx.stroke();}
 sprite(ctx,name,swing,canopyY,w,undefined,{angle});ctx.restore();return true;}
function item(ctx,type,x,y,scale,era,time=0){let name=type==='boost'?'fuel':type==='chute'?'pack':type;
 if(name==='pack')return sprite(ctx,id('pack',era),x,y,30*scale);
 if(name==='coin'){const width=(.24+.76*Math.abs(Math.cos(time*3)))*15*scale;return sprite(ctx,id(name,era),x,y,width,16*scale);}
 const key=id(name,era),m=manifest.sprites[key],bound=(name==='ring'?76:40)*scale;if(!m)return false;const f=bound/Math.max(m.width,m.height);return sprite(ctx,key,x,y,m.width*f,m.height*f);}
function hazard(ctx,o,era,time,z){if(!state.ready)return false;let kind=o.kind;
 if(kind==='rock')return sprite(ctx,'rock_'+(Math.abs(o.variant||0)%4),0,0,70*z,undefined,{angle:time*.1*(o.variant%2?1:-1)});
 if(kind==='balloon'){
 const base=id('balloon',era),env=manifest.sprites[base+'_envelope'],pod=manifest.sprites[base+'_pod'];
 if(!env||!pod)return sprite(ctx,base,0,0,49*z,90*z);
 const b=env.box,c=pod.box,w=49*z,h=90*z,drift=Math.sin(time*1.6+(o.phase||0))*3*z;
 const ex=((b[0]+b[2])/2-.5)*w,ey=((b[1]+b[3])/2-.5)*h,px=((c[0]+c[2])/2-.5)*w+drift,py=((c[1]+c[3])/2-.5)*h;
 ctx.save();ctx.strokeStyle='#697c8b';ctx.lineWidth=Math.max(.5,z);
 for(const sign of [-1,1]){ctx.beginPath();ctx.moveTo(ex+sign*w*.17,(b[3]-.5)*h);ctx.lineTo(px+sign*w*.05,(c[1]-.5)*h);ctx.stroke();}
 sprite(ctx,base+'_envelope',ex,ey,(b[2]-b[0])*w,(b[3]-b[1])*h);
 sprite(ctx,base+'_pod',px,py,(c[2]-c[0])*w,(c[3]-c[1])*h,{angle:Math.sin(time*1.6+(o.phase||0))*.05});ctx.restore();return true;
 }
 if(kind==='satellite'){
  const m=manifest.sprites[id('satellite',era)],height=38*z*m.height/m.width;
  for(const side of [-1,1]){const joint=m.panelJoints[side<0?0:1];ctx.save();ctx.translate((joint[0]-.5)*38*z,(joint[1]-.5)*height);ctx.rotate(side*(.08+.11*Math.sin(time*.65)));ctx.scale(side,1);sprite(ctx,id('panel',era),0,0,46*z,undefined,{ax:m.panelRoot[0],ay:m.panelRoot[1]});ctx.restore();}
  sprite(ctx,id('satellite',era),0,0,38*z,undefined);ctx.save();ctx.fillStyle=Math.floor(time*3)%4===0?'#e8f3d2':'#5c6a74';ctx.fillRect(-z,-16*z,2*z,2*z);ctx.restore();return true;}
 return false;}
function fragment(ctx,stage,era,variant,w,h){const name=id(stage==='booster'?'booster':'core',era),im=images.get(name);if(!im)return false;
 const sx=im.width*(variant?.5:.2),sy=im.height*.6,sw=im.width*.2,sh=sw*h/w;ctx.save();ctx.imageSmoothingEnabled=false;ctx.drawImage(im,sx,sy,sw,sh,-w/2,-h/2,w,h);ctx.restore();return true;}
function cloud(ctx,index,x,y,w,alpha){return sprite(ctx,'cloud_'+Math.abs(index%4),x,y,w,undefined,{alpha});}
function terrain(ctx,name,x,ground,z,bottom){const im=images.get(name),m=manifest.sprites[name];if(!im||!m)return false;
 const f=360*z/im.width,sx=24,sw=im.width-48,width=sw*f,top=ground-m.landingAnchor[1]*im.height*f;
 ctx.save();ctx.imageSmoothingEnabled=false;
 // Reuse only painted interior rock for depth, never a flat programmer-colour band.
 const sy=Math.floor(im.height*.63),sh=Math.floor(im.height*.25),rowH=sh*f;
 for(let y=ground+28*z;y<bottom;y+=rowH)ctx.drawImage(im,sx,sy,sw,sh,x,y,width+z,rowH+z);
 // Omit the painted end caps; neighbouring interior slices overlap by a logical pixel.
 ctx.drawImage(im,sx,0,sw,im.height-8,x,top,width+z,(im.height-8)*f);ctx.restore();return width;}
function baseDrone(ctx,index,x,y,w,time){const part=manifest.baseDrones?.parts[index];if(!part)return false;const f=w/part.size[0];
 sprite(ctx,part.name,x,y,w);ctx.save();ctx.translate(x-w/2,y-part.size[1]*f/2);
 for(const [i,[sx,sy,r]]of part.fans.entries()){ctx.save();ctx.translate(sx*f,sy*f);ctx.scale(1,.28);ctx.rotate(time*37+i*1.7);ctx.strokeStyle='#97aeb9';ctx.lineWidth=Math.max(.35,f*12);ctx.beginPath();for(let k=0;k<3;k++){const a=k*Math.PI*2/3;ctx.moveTo(0,0);ctx.lineTo(Math.cos(a)*r*f,Math.sin(a)*r*f);}ctx.stroke();ctx.restore();}
 ctx.restore();return true;}
root.WorldSprites={ready,state,years,sprite,item,fragment,body,parachute,hazard,cloud,terrain,baseDrone,id,get manifest(){return manifest;},qa(){return{...state,count:images.size};}};
})(typeof window!=='undefined'?window:globalThis);
