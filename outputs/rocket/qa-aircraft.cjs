/* Actual sprite coordinates, both facings, three scales, deterministic phase sheets. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url');
(async()=>{const browser=await require('./browser.cjs').launch({headless:true,channel:'chrome'});try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{requestAnimationFrame=()=>0;});await page.goto(pathToFileURL(path.resolve(__dirname,'../Выше неба.html')).href);
 await page.waitForFunction(()=>window.AircraftTraffic?.state.zipReady&&AircraftTraffic.state.dataReady,null,{polling:50});assert.equal(await page.evaluate(()=>AircraftTraffic.qa().spriteCount),36);
 const report=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=960;c.height=900;c.id='aircraft-diagnostic';document.body.replaceChildren(c);const ctx=c.getContext('2d'),years=AircraftTraffic.eras,lineages=['low_primary','low_multiwing','medium_passenger','medium_cargo','high_fighter','high_experimental'];window.__TRACE_AIRCRAFT=true;window.__AIRCRAFT_ANCHORS=[];let count=0;
 for(const lineage of lineages)for(const year of years)for(const facing of [-1,1])for(const zoom of [.55,1,1.8])for(const time of [0,.011,.033]){const id=lineage+'_'+year;ctx.save();ctx.translate(150,150);ctx.rotate(.19);AircraftTraffic.draw(ctx,{x:0,y:1600,direction:facing,aircraftChoice:{id,lineage}},0,time,zoom);ctx.restore();count++;}
 const anchors=window.__AIRCRAFT_ANCHORS,summary={draws:count,anchors:anchors.length,maxError:Math.max(...anchors.map(a=>a.d)),errors:AircraftTraffic.qa().errors};window.__TRACE_AIRCRAFT=false;
 window.drawAircraft=(time,direction=1)=>{ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle='#143149';ctx.fillRect(0,0,960,900);ctx.font='10px sans-serif';for(let row=0;row<6;row++)for(let col=0;col<6;col++){const lineage=lineages[row],year=years[col],id=lineage+'_'+year;ctx.fillStyle='#dce8e9';ctx.fillText(id,col*160+3,row*145+20);ctx.save();ctx.translate(col*160+80,row*145+90);AircraftTraffic.draw(ctx,{x:0,y:1600,direction,aircraftChoice:{id,lineage}},col,time,1);ctx.restore();}};
 return summary;});
 assert.equal(report.draws,648);assert(report.anchors>1000);assert(report.maxError<.01,'Effect origins match measured physical source landmarks after facing/rotation/scale');assert.deepEqual(report.errors,[]);
 // Inspect actual navigation-light draw calls over an entire 1040ms cycle.
 // Sampling only fillRect(2,2) with nav colors excludes moving props/exhaust.
 const navigationBlink=await page.evaluate(()=>{
  const ctx=document.querySelector('#aircraft-diagnostic').getContext('2d');
  const samplesMs=[0,259,260,519,520,779,780,1039,1040],colors={red:'#ff5b57',green:'#70ef9a',white:'#eefcff'};
  const lineages=['low_primary','low_multiwing','medium_passenger','medium_cargo','high_fighter','high_experimental'];
  const originalFill=ctx.fillRect,originalImage=ctx.drawImage,records=[];let captured=[],body=null,draws=0,maxOriginError=0;
  const project=(m,x,y)=>[m.a*x+m.c*y+m.e,m.b*x+m.d*y+m.f];
  ctx.drawImage=function(image,dx,dy,dw,dh){body={dx,dy,dw,dh,m:this.getTransform()};return originalImage.apply(this,arguments);};
  ctx.fillRect=function(x,y,w,h){if(w===2&&h===2&&Object.values(colors).includes(this.fillStyle))captured.push({x,y,color:this.fillStyle,alpha:this.globalAlpha,m:this.getTransform()});return originalFill.apply(this,arguments);};
  try{
   for(const lineage of lineages)for(const year of AircraftTraffic.eras){
    const id=lineage+'_'+year,meta=AircraftTraffic.profileFor(id),lights=meta.sourcePixels.navLights;
    const item={id,lights:lights.length,samples:[],observedOn:0,observedOff:0};
    for(const facing of [-1,1])for(const zoom of [.55,1,1.8])for(const ms of samplesMs){
     captured=[];body=null;ctx.save();
     try{ctx.setTransform(1,0,0,1,0,0);ctx.translate(170,170);ctx.rotate(.19);AircraftTraffic.draw(ctx,{x:0,y:1600,direction:facing,aircraftChoice:{id,lineage}},0,ms/1000,zoom);}finally{ctx.restore();}
     if(!body)throw Error('Missing body draw '+id);
     if(captured.length!==lights.length)throw Error('Navigation draw count '+id+': '+captured.length+' versus '+lights.length);
     // Independent expected schedule: first260ms ON, next780ms DIM, repeat.
     const on=ms===0||ms===259||ms===1040,expectedAlpha=on?1:.22;
     for(let index=0;index<lights.length;index++){
      const [sourceX,sourceY,color]=lights[index],actual=captured[index];
      if(actual.color!==colors[color])throw Error('Navigation color '+id+'/'+index);
      if(Math.abs(actual.alpha-expectedAlpha)>.005)throw Error('Navigation alpha '+id+'/'+index+' at '+ms+'ms: '+actual.alpha+' expected '+expectedAlpha);
      const localX=body.dx+sourceX/meta.sourceSize[0]*body.dw,localY=body.dy+sourceY/meta.sourceSize[1]*body.dh;
      const expected=project(body.m,localX,localY),drawn=project(actual.m,actual.x+1,actual.y+1),error=Math.hypot(expected[0]-drawn[0],expected[1]-drawn[1]);
      // Light centers are deliberately rounded locally: each axis may shift up to0.5px.
      if(error>Math.SQRT1_2+.0001)throw Error('Navigation origin '+id+'/'+index+' at '+ms+'ms: '+error);
      maxOriginError=Math.max(maxOriginError,error);if(on)item.observedOn++;else item.observedOff++;
     }
     item.samples.push({facing,zoom,ms,state:on?'on':'dim',drawnLights:captured.length});draws++;
    }
    if(lights.length&&(!item.observedOn||!item.observedOff))throw Error('Missing full blink states '+id);
    records.push(item);
   }
  }finally{ctx.fillRect=originalFill;ctx.drawImage=originalImage;}
  return {method:'Actual 2x2 nav-colored fillRect calls, alpha and transformed measured source positions; prop/exhaust changes excluded',cycleMs:1040,samplesMs,draws,maxOriginError,originTolerance:Math.SQRT1_2+.0001,profiles:records};
 });
 assert.equal(navigationBlink.draws,1944);assert.equal(navigationBlink.profiles.length,36);assert(navigationBlink.maxOriginError<=navigationBlink.originTolerance);
 const out=path.resolve(__dirname,'../../work/aircraft');fs.mkdirSync(out,{recursive:true});
 for(const direction of [-1,1])for(let phase=0;phase<5;phase++){await page.evaluate(({t,d})=>drawAircraft(t,d),{t:phase*Math.PI/8/35,d:direction});const png=await page.evaluate(()=>document.querySelector('#aircraft-diagnostic').toDataURL().split(',')[1]);fs.writeFileSync(path.join(out,`facing-${direction}-phase-${phase}.png`),Buffer.from(png,'base64'));}
 const motion=await page.evaluate(()=>{const ctx=document.querySelector('canvas').getContext('2d');drawAircraft(0);const a=ctx.getImageData(0,0,960,300).data;drawAircraft(Math.PI/8/35);const b=ctx.getImageData(0,0,960,300).data;return a.reduce((n,v,i)=>n+(v!==b[i]),0);});assert(motion>100,'Separated low aircraft rotors really move');assert.deepEqual(errors,[]);
 fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({...report,motionChangedChannels:motion,navigationBlink},null,2)+'\n');console.log('Aircraft QA: 36 sprites, 648 transformed draws, '+report.anchors+' measured origins, both facings, 3 scales, 10 phase sheets, full1040ms navigation blink cycle(1944 draws), zero page errors passed.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
