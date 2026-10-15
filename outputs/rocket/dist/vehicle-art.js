/* Пиксельная машина с тремя читаемыми ступенями. Координаты — от опор/сопла. */
(function(root){
'use strict';
const colors={dark:'#172536',edge:'#364857',white:'#ecede2',shade:'#a2b6bc',light:'#fff5de',red:'#e84236',redShade:'#a42e35',glass:'#52ced7',glassDark:'#205a76',gold:'#dfae58'};
function draw(ctx,o={}){paint(ctx,o,false);}
function drawDebris(ctx,o={}){paint(ctx,{...o,stageId:o.stageId||'booster',thrust:false,maneuver:0},true);}
function paint(ctx,o,debris){
 let {x=0,y=0,scale=1,angle=0,thrust=false,maneuver=0,stageId='core',skin='',time=0,rocketImage}=o,c=colors;
 ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.scale(scale,scale);ctx.imageSmoothingEnabled=false;
 const r=(x,y,w,h,color)=>{ctx.fillStyle=color;ctx.fillRect(Math.round(x),Math.round(y),Math.ceil(w),Math.ceil(h));};
 const poly=(points,color)=>{ctx.fillStyle=color;ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();ctx.fill();};
 function flame(at,small=false){let pulse=.5+.5*Math.sin(time*43),len=(small?12:23)+Math.floor(pulse*(small?5:15));poly([[-7,at],[7,at],[5,at+7],[3,at+len-4],[0,at+len],[-3,at+len-7],[-5,at+7]],'#e84d35');poly([[-4,at],[4,at],[3,at+9],[0,at+len*.8],[-3,at+8]],'#ffbd54');r(-2,at,4,small?8:12,'#fff4b0');r(-1,at,2,5,'#ecffff');}
 if(root.WorldSprites?.state.ready){root.WorldSprites.body(ctx,{...o,debris});ctx.restore();return;}
 function booster(){
  // Отдельный разгонный блок: широкий цилиндр, кольца, четыре устойчивые опоры.
  poly([[-15,-36],[15,-36],[19,-29],[19,-11],[12,-5],[-12,-5],[-19,-11],[-19,-29]],c.dark);
  r(-15,-33,30,22,c.shade);r(-11,-33,18,22,c.white);r(-7,-32,5,20,c.light);r(-17,-29,34,4,c.redShade);r(-15,-29,30,2,c.red);r(-17,-12,34,4,c.edge);r(-12,-9,24,4,c.dark);r(-8,-7,16,5,c.edge);r(-6,-5,12,4,c.shade);r(-5,-3,10,3,c.dark);
  for(let sign of [-1,1]){poly([[sign*16,-24],[sign*22,-19],[sign*27,-2],[sign*22,-2],[sign*17,-12]],c.dark);poly([[sign*17,-21],[sign*20,-18],[sign*25,-3],[sign*23,-3]],c.red);r(sign<0?-29:21,-2,8,2,c.edge);r(sign<0?-28:22,-2,5,1,c.shade);r(sign<0?-17:13,-24,4,7,c.gold);}
  r(-3,-22,6,7,c.dark);r(-2,-21,4,4,c.glass);r(-12,-16,3,2,c.edge);r(9,-16,3,2,c.edge);
 }
 function core(offset=0){
  ctx.save();ctx.translate(0,offset);
  if(rocketImage?.complete&&rocketImage.naturalWidth){ctx.filter=skin==='wasp'?'hue-rotate(45deg)':skin==='arctic'?'hue-rotate(170deg)':skin==='cosmos'?'hue-rotate(270deg)':'none';ctx.drawImage(rocketImage,200,60,716,1300,-19,-67,38,72);ctx.filter='none';}
  else{poly([[0,-67],[7,-54],[8,-17],[17,0],[9,-3],[5,-9],[-5,-9],[-9,-3],[-17,0],[-8,-17],[-7,-54]],c.dark);poly([[0,-65],[6,-53],[-6,-53]],c.red);r(-6,-51,12,35,c.white);r(4,-50,2,32,c.shade);r(-3,-45,6,7,c.glassDark);r(-2,-44,4,4,c.glass);r(-5,-15,10,7,c.edge);r(-5,-6,10,6,c.dark);}
  ctx.restore();
 }
 function capsule(){ctx.save();ctx.beginPath();ctx.rect(-19,-35,38,35);ctx.clip();core(32);ctx.restore();r(-8,-3,3,3,c.edge);r(5,-3,3,3,c.edge);r(-11,-1,5,2,c.shade);r(6,-1,5,2,c.shade);}

 if(debris){if(stageId==='capsule')capsule();else if(stageId==='core'){ctx.save();ctx.beginPath();ctx.rect(-30,-34,60,42);ctx.clip();core();ctx.restore();}else booster();}
 else if(stageId==='capsule'){if(thrust)flame(0,true);capsule();}
 else if(stageId==='booster'){if(thrust)flame(0);core(-35);booster();}
 else {if(thrust)flame(4);core();}
 // Струя на противоположной стороне создаёт понятный визуальный отклик манёвра.
 let turn=typeof maneuver==='number'?maneuver:(maneuver?.turn||0);if(!debris&&Math.abs(turn)>.03){let side=turn>0?-1:1,yy=stageId==='capsule'?-22:stageId==='booster'?-78:-43,xx=stageId==='capsule'?8:10,len=5+Math.round(Math.abs(Math.sin(time*32))*5);r(side>0?xx:-xx-2,yy,2,4,c.edge);poly([[side*(xx+1),yy+1],[side*(xx+len),yy],[side*(xx+len+3),yy+2],[side*(xx+len),yy+4],[side*(xx+1),yy+3]],'#9ce8ef');r(side>0?xx+2:-xx-len,yy+1,len-1,2,'#e9ffff');}
 ctx.restore();
}
root.RocketVehicle={draw,drawDebris};
})(typeof window!=='undefined'?window:globalThis);

