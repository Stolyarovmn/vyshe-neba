/* Regression for finite island/ocean, deterministic expansion layout and portrait mobile viewport. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url');
(async()=>{const browser=await require('./browser.cjs').launch({headless:true,channel:'chrome'});try{
 const ctx=await browser.newContext({viewport:{width:430,height:932},isMobile:true,hasTouch:true,deviceScaleFactor:1});const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(pathToFileURL(path.resolve(__dirname,'../Выше неба.html')).href);await page.waitForTimeout(900);
 const report=await page.evaluate(async()=>{
  await WorldSprites.ready;if(WorldIsland.image.decode)try{await WorldIsland.image.decode();}catch{}
  const layout=BaseIslandLayout.validate();BaseIslandLayout.previewAll();BaseIslandLayout.apply();
  const allBuilt={owned:BaseInfrastructure.state().owned.length,layout:Object.keys(BaseInfrastructure.state().layout).length};
  const c=document.createElement('canvas');c.width=960;c.height=600;const x=c.getContext('2d');let islandDraws=0,draw=x.drawImage.bind(x);x.drawImage=function(im,...args){if(im===WorldIsland.image)islandDraws++;return draw(im,...args);};
  const art={};for(const [k,file] of [['routeSky','sky-color-plate.png'],['base','base-static.png']]){let im=new Image();im.src=__GAME_ASSETS__[file];await im.decode();art[k]=im;}
  WorldArt.draw(x,{x:0,y:0,zoom:1},{x:0,y:0,mode:0,body:'earth',time:0,weather:{kind:0,effectiveCloud:0,effectiveRain:0}},Game.profile,art);const near=islandDraws;
  islandDraws=0;WorldArt.draw(x,{x:1700,y:0,zoom:1},{x:1700,y:0,mode:0,body:'earth',time:1,weather:{kind:0,effectiveCloud:0,effectiveRain:0}},Game.profile,art);const far=islandDraws;
  const clear=WorldIsland.waterPalette({kind:0,effectiveCloud:0,effectiveRain:0,effectiveStorm:0}),storm=WorldIsland.waterPalette({kind:3,effectiveCloud:1,effectiveRain:1,effectiveStorm:1});
  Game.goto('flight');await new Promise(r=>setTimeout(r,120));PortraitMode.apply();await new Promise(r=>setTimeout(r,80));let g=document.getElementById('game').getBoundingClientRect(),cv=document.getElementById('canvas').getBoundingClientRect(),style=getComputedStyle(document.getElementById('portraitHud'));
  return {layout,allBuilt,near,far,clear,storm,portrait:{active:PortraitMode.active,game:[g.width,g.height],canvas:[cv.width,cv.height],hud:style.display,transform:document.getElementById('game').style.transform,rocket:!!Game.rocket},bounds:WorldIsland.bounds};
 });
 assert(report.layout.ok,JSON.stringify(report.layout.errors));assert.equal(report.layout.count,14);assert.equal(report.allBuilt.owned,14);assert.equal(report.allBuilt.layout,14);
 assert(report.near>=1,'Island must render near launch');assert.equal(report.far,0,'Island must not repeat after its finite right bound');assert(report.bounds.right<1700);
 assert(report.storm.rough>report.clear.rough,'Storm water must be rougher than clear water');assert(report.storm.deep.reduce((a,b)=>a+b,0)<report.clear.deep.reduce((a,b)=>a+b,0),'Storm water must be darker');
 assert(report.portrait.active,'Portrait mode must activate on touch portrait viewport');assert(report.portrait.game[1]>800&&report.portrait.game[0]>=420,'Portrait game must occupy phone viewport');assert(report.portrait.canvas[0]>report.portrait.game[0]*1.5,'Portrait uses horizontal crop, not stretched landscape');assert.equal(report.portrait.hud,'block');assert(!/rotate\(/.test(report.portrait.transform),'Portrait mode must not rotate whole game');assert(report.portrait.rocket);
 assert.deepEqual(errors,[]);
 const out=path.resolve(__dirname,'../../work/island-portrait');fs.mkdirSync(out,{recursive:true});await page.screenshot({path:path.join(out,'portrait.png'),fullPage:true});fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');console.log('Island/portrait QA PASS',JSON.stringify(report));
 await ctx.close();
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
