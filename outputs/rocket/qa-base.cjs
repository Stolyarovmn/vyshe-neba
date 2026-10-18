/* Native-scale base frames and measured emitter projection; no gameplay changes. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url');
(async()=>{const browser=await require('./browser.cjs').launch({headless:true,channel:'chrome'});try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.addInitScript(()=>requestAnimationFrame=()=>0);await page.goto(pathToFileURL(path.resolve(__dirname,'../Выше неба.html')).href);await page.evaluate(()=>WorldSprites.ready);
 const report=await page.evaluate(async()=>{const art={};for(const [key,file]of [['routeSky','sky-color-plate.png'],['base','base-static.png']]){const im=new Image();im.src=__GAME_ASSETS__[file];await im.decode();art[key]=im;}
  const c=document.createElement('canvas');c.width=960;c.height=600;const ctx=c.getContext('2d'),rig=WorldSprites.manifest.base,radial=ctx.createRadialGradient;let actual=[];ctx.createRadialGradient=function(...a){actual.push([a[0],a[1]]);return radial.apply(this,a);};
  let count=0,maxError=0,remoteEmitters=0;for(let era=0;era<6;era++)for(const zoom of [.55,1,1.8]){const cam={x:0,y:180,zoom};actual=[];WorldArt.draw(ctx,cam,{mode:0,y:300,time:0},{base:era},art);const expected=[];
   for(const a of rig.eras[era].lamps){const ax=150+(a.x-2)*1280/(rig.size[0]/3-4),wy=600-(a.y-2)*800/(rig.size[1]/2-4);const q=Journey.project(-800+ax,wy,cam);expected.push([q.x,q.y]);}
   for(const e of expected){maxError=Math.max(maxError,Math.min(...actual.map(a=>Math.hypot(a[0]-e[0],a[1]-e[1]))));count++;}
   actual=[];WorldArt.draw(ctx,{x:3000,y:180,zoom},{mode:0,y:300,time:0},{base:era},art);remoteEmitters=Math.max(remoteEmitters,actual.length);
  }
  window.baseFrame=(era,time)=>{WorldArt.draw(ctx,{x:0,y:180,zoom:1},{mode:0,y:300,time},{base:era},art);return c.toDataURL().split(',')[1];};
  const frames=[];for(let era=0;era<6;era++)for(let phase=0;phase<9;phase++)frames.push({era,phase,png:baseFrame(era,phase*1.32/8)});
  const a=baseFrame(5,0),b=baseFrame(5,.165);return {count,maxError,remoteEmitters,frames,motion:a!==b,baseSize:[art.base.width,art.base.height]};
 });assert(report.count>=36);assert(report.maxError<.001);assert.equal(report.remoteEmitters,0,'Base emitters must not repeat in remote world bands');assert(report.motion);assert.deepEqual(errors,[]);
 const out=path.resolve(__dirname,'../../work/base');fs.mkdirSync(out,{recursive:true});for(const f of report.frames)fs.writeFileSync(path.join(out,`era-${f.era}-phase-${f.phase}.png`),Buffer.from(f.png,'base64'));delete report.frames;fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');console.log('Base QA: '+report.count+' single-world lamp projections, no remote repeated emitters, 3 zooms, 54 native 960x600 frames, code motion, zero errors passed.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
