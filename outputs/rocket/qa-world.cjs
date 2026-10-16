const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url');
const chromium=require('./browser.cjs');
(async()=>{const b=await chromium.launch({headless:true,channel:'chrome'});try{
const page=await b.newPage({viewport:{width:1440,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.addInitScript(()=>{window.requestAnimationFrame=()=>0;});
await page.goto(pathToFileURL(path.resolve(__dirname,'../Выше неба.html')).href);
await page.evaluate(()=>WorldSprites.ready);await page.waitForFunction(()=>AircraftTraffic.state.zipReady&&AircraftTraffic.state.dataReady,null,{polling:50});
assert.equal(await page.evaluate(()=>WorldSprites.qa().count),164);
const anchors=await page.evaluate(()=>Object.entries(WorldSprites.manifest.sprites).filter(([n])=>n.startsWith('pad_')||n.startsWith('terrain_')).every(([n,m])=>m.landingAnchor&&m.landingAnchor[1]>=0&&m.landingAnchor[1]<1));assert(anchors,'Landing surfaces carry measured contact anchors');assert.equal(await page.evaluate(()=>AircraftTraffic.qa().spriteCount),36);
const out=path.resolve(__dirname,'../../work/world');fs.mkdirSync(out,{recursive:true});
for(let era=0;era<6;era++)for(const [body,y] of [['earth',300],['earth',1300],['earth',6400],['moon',80],['mars',80]]){
 await page.evaluate(({era,body,y})=>{Game.profile.base=era;Game.profile.location=body;Game.start();Object.assign(Game.rocket,{x:0,y,vy:0,vx:0,time:3,launched:true,thrust:true});Object.assign(Game.camera,{x:0,y:y-180,zoom:1});Game.step(0);Game.renderAt(2);},{era,body,y});
 await page.locator('canvas').screenshot({path:path.join(out,`${era}-${body}-${y}.png`)});
}
const stable=await page.evaluate(()=>{let c=document.createElement('canvas').getContext('2d'),o={x:100,y:150,originX:100,originY:150,direction:1,variant:0};AircraftTraffic.draw(c,o,3,1,1);let id=o.aircraftChoice.id;for(let i=0;i<20;i++){o.x+=15;o.y+=.2;AircraftTraffic.draw(c,o,3,1+i/60,1);}return id===o.aircraftChoice.id;});assert(stable,'Aircraft generation remains stable during movement');
const shapes=await page.evaluate(()=>{const c=document.createElement('canvas').getContext('2d'),calls=[],original=c.drawImage;c.drawImage=function(im,...a){if(a.length===4)calls.push({name:im.src,w:a[2],h:a[3],iw:im.naturalWidth,ih:im.naturalHeight});return original.call(this,im,...a);};for(let era=0;era<6;era++){for(let kind of ['fuel','repair','magnet','ring','chute'])WorldSprites.item(c,kind,0,0,1,era,0);WorldSprites.parachute(c,era,0);WorldSprites.hazard(c,{kind:'satellite'},era,0,1);}return calls.every(p=>Math.abs(p.w/p.h-p.iw/p.ih)<.0001);});assert(shapes,'Physical item, canopy and panel proportions match source images in all eras');
const debris=await page.evaluate(()=>{let c=document.createElement('canvas').getContext('2d'),n=0,draw=c.drawImage;c.drawImage=function(...a){n++;return draw.apply(this,a);};RocketVehicle.drawDebris(c,{stageId:'booster',era:3});return n;});assert.equal(debris,1,'Detached booster draws only its own physical body');
const motion=await page.evaluate(()=>{let c=document.createElement('canvas');c.width=200;c.height=200;let x=c.getContext('2d');function frame(t){x.clearRect(0,0,200,200);x.save();x.translate(100,100);WorldSprites.hazard(x,{kind:'satellite'},3,t,1.4);x.restore();return x.getImageData(0,0,200,200).data;}let a=frame(0),d=frame(1);return a.reduce((n,v,i)=>n+(v!==d[i]),0);});assert(motion>30,'Solar panels articulate instead of staying frozen');
assert.deepEqual(errors,[]);assert.deepEqual(await page.evaluate(()=>WorldSprites.state.errors),[]);assert.deepEqual(await page.evaluate(()=>AircraftTraffic.state.errors),[]);
console.log('World QA: 164 sprites, 36 aircraft, 30 assembled scenes, stable generation, panel motion, zero page errors passed.');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
