/* Starter-island QA: one finite island, open ocean outside it, weather-reactive water. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url');
(async()=>{const browser=await require('./browser.cjs').launch({headless:true,channel:'chrome'});try{
 const page=await browser.newPage({viewport:{width:960,height:600}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.addInitScript(()=>requestAnimationFrame=()=>0);
 await page.goto(pathToFileURL(path.resolve(__dirname,'../Выше неба.html')).href);await page.waitForTimeout(250);
 const report=await page.evaluate(async()=>{
  const routeSky=new Image();routeSky.src=__GAME_ASSETS__['sky-color-plate.png'];await routeSky.decode();
  const islandProbe=new Image();islandProbe.src=__GAME_ASSETS__['environment/start_island_hd.png'];await islandProbe.decode();
  const art={routeSky},profile=Game.profile,qa=WorldArt.qa();
  const render=async(x,weather,time=2)=>{
   const c=document.createElement('canvas');c.width=960;c.height=600;const ctx=c.getContext('2d');let islandDraws=0;
   const original=ctx.drawImage.bind(ctx);ctx.drawImage=function(im,...args){if(im?.naturalWidth===islandProbe.naturalWidth&&im?.naturalHeight===islandProbe.naturalHeight)islandDraws++;return original(im,...args);};
   const cam={x,y:0,zoom:1},r={x,y:0,mode:0,body:'earth',time,weather};
   WorldArt.draw(ctx,cam,r,profile,art);await new Promise(r=>setTimeout(r,40));WorldArt.draw(ctx,cam,r,profile,art);
   const im=ctx.getImageData(0,0,960,600);
   const lowerMean=[0,0,0];let n=0;for(let yy=340;yy<590;yy+=5)for(let xx=20;xx<940;xx+=5){let i=(yy*960+xx)*4;lowerMean[0]+=im.data[i];lowerMean[1]+=im.data[i+1];lowerMean[2]+=im.data[i+2];n++;}for(let k=0;k<3;k++)lowerMean[k]/=n;
   return {png:c.toDataURL().split(',')[1],islandDraws,lowerMean};
  };
  const clear=await render(0,{effectiveCloud:0,effectiveRain:0,effectiveStorm:0});
  const storm=await render(0,{effectiveCloud:1,effectiveRain:1,effectiveStorm:1});
  const remote=await render(3000,{effectiveCloud:0,effectiveRain:0,effectiveStorm:0});
  const delta=clear.lowerMean.reduce((s,v,i)=>s+Math.abs(v-storm.lowerMean[i]),0);
  return {qa,assetSize:[islandProbe.naturalWidth,islandProbe.naturalHeight],clear,storm,remote,weatherDelta:delta};
 });
 assert(report.qa.island.width>=1500,'Island must reserve enough horizontal build space');
 assert(report.qa.island.left<0&&report.qa.island.left+report.qa.island.width>1000,'Launch origin and future expansion area must fit on the island');
 assert(report.assetSize[0]>=1600&&report.assetSize[1]>=700,`Runtime island must use the HD source, got ${report.assetSize.join('x')}`);
 assert(report.clear.islandDraws>=1,'Starter island was not drawn near launch origin');
 assert.equal(report.remote.islandDraws,0,'Finite starter island must not repeat in remote world bands');
 assert(report.qa.stormWater.rough>report.qa.clearWater.rough*2,'Storm water must be visibly rougher than clear water');
 assert(report.weatherDelta>18,`Water palette did not react enough to weather: delta=${report.weatherDelta}`);
 assert.deepEqual(errors,[]);
 const out=path.resolve(__dirname,'../../work/base');fs.mkdirSync(out,{recursive:true});
 for(const [name,frame]of [['island-clear',report.clear],['island-storm',report.storm],['open-ocean',report.remote]])fs.writeFileSync(path.join(out,name+'.png'),Buffer.from(frame.png,'base64'));
 for(const k of ['clear','storm','remote'])delete report[k].png;
 fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');
 console.log('Starter island QA PASS',JSON.stringify({assetSize:report.assetSize,island:report.qa.island,weatherDelta:report.weatherDelta,rough:[report.qa.clearWater.rough,report.qa.stormWater.rough],draws:[report.clear.islandDraws,report.remote.islandDraws]}));
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
