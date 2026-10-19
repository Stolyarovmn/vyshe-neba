/* Regression for reported mobile flight defects: finite island/open ocean, weather water, wrong aircraft altitude and visible traffic pop-in. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url');
let pw;try{pw=require('playwright');}catch{pw=require(path.join(require('os').homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));}
const OUT=path.resolve(__dirname,'../../work/world-streaming');fs.mkdirSync(OUT,{recursive:true});
(async()=>{const b=await pw.chromium.launch({channel:'chrome',headless:true});try{
 const page=await b.newPage({viewport:{width:960,height:600},hasTouch:true,isMobile:true});await page.addInitScript(()=>window.requestAnimationFrame=()=>0);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(pathToFileURL(path.resolve(__dirname,'../Выше неба.html')).href);await page.waitForTimeout(900);
 const result=await page.evaluate(async()=>{
  await WorldSprites.ready;await WorldArt.preload();
  for(let i=0;i<40&&!AircraftTraffic.qa().zipReady;i++)await new Promise(r=>setTimeout(r,50));
  const art={};for(const [k,file]of [['routeSky','sky-color-plate.png']]){const im=new Image();im.src=window.__GAME_ASSETS__[file];await im.decode();art[k]=im;}
  const render=(x,y=80,zoom=1)=>{const c=document.createElement('canvas');c.width=960;c.height=600;const q=c.getContext('2d');WorldArt.draw(q,{x,y,zoom},{x,y,mode:0,body:'earth',time:0,weather:{effectiveCloud:0,effectiveRain:0,effectiveStorm:0}},Game.profile,art);return q.getImageData(0,0,960,600);};
  const imageDiff=(a,b,y0=220)=>{let sum=0,n=0;for(let y=y0;y<a.height;y+=3)for(let x=20;x<a.width-20;x+=3){const i=(y*a.width+x)*4;for(let c=0;c<3;c++){sum+=Math.abs(a.data[i+c]-b.data[i+c]);n++;}}return sum/n;};
  const home=render(0,80,.9),far=render(2400,80,.9),farMirror={data:new Uint8ClampedArray(far.data.length),width:far.width,height:far.height};
  for(let y=0;y<far.height;y++)for(let x=0;x<far.width;x++){const a=(y*far.width+x)*4,m=(y*far.width+(far.width-1-x))*4;farMirror.data[m]=far.data[a];farMirror.data[m+1]=far.data[a+1];farMirror.data[m+2]=far.data[a+2];farMirror.data[m+3]=far.data[a+3];}
  const direct=imageDiff(home,far),mirror=imageDiff(home,farMirror),world=WorldArt.qa();
  const altitude=[];for(let era=0;era<6;era++)for(const y of [2400,2600,3000,5000,8400,9000])for(let v=0;v<6;v++)if(Journey.objectKind(y,0,era,v)==='plane')altitude.push({era,y,v});
  const stage=(seed)=>{Game.goto('home');Game.setLaunchSeed(seed);Game.profile.base=5;Game.start();Game.rocket.x=0;Game.rocket.y=300;Game.rocket.vx=0;Game.rocket.vy=0;Game.camera.x=0;Game.camera.y=300;Game.camera.zoom=.7;};
  stage(12345);let previousVisible=false,entries=[],maxVisibleJump=0,previousX=null,seen=false;
  for(let i=0;i<=1400;i++){const t=i*.1;Game.camera.x=0;Game.camera.y=300;Game.camera.zoom=.7;Game.rocket.x=0;Game.rocket.y=300;Game.renderAt(t);Game.step(0);const p=Game.objects.find(o=>o.type==='hazard'&&o.kind==='plane'&&o.originX===280&&o.originY===300);let visible=false,x=null;if(p){x=Game.project(p.x,p.y).x;visible=x>=0&&x<=960;}if(seen&&visible&&!previousVisible)entries.push(x);if(visible&&previousVisible&&previousX!=null)maxVisibleJump=Math.max(maxVisibleJump,Math.abs(x-previousX));previousVisible=visible;previousX=visible?x:null;seen=true;}
  let visiblePlanePeak=0;const seedPeaks=[];
  for(const seed of [1,17,101,999,12345,54321,777777,999983]){stage(seed);let peak=0;for(let i=0;i<=160;i++){const t=i*.25;Game.camera.x=0;Game.camera.y=300;Game.camera.zoom=.7;Game.rocket.x=0;Game.rocket.y=300;Game.renderAt(t);Game.step(0);let visiblePlanes=0;for(const o of Game.objects)if(o.type==='hazard'&&o.kind==='plane'){const q=Game.project(o.x,o.y);if(q.x>=0&&q.x<=960&&q.y>=0&&q.y<=600)visiblePlanes++;}peak=Math.max(peak,visiblePlanes);}seedPeaks.push([seed,peak]);visiblePlanePeak=Math.max(visiblePlanePeak,peak);}
  return {direct,mirror,world,altitude,entries,maxVisibleJump,visiblePlanePeak,seedPeaks,aircraft:AircraftTraffic.qa()};
 });
 await page.evaluate(async()=>{await WorldArt.preload();Game.goto('home');Game.setLaunchSeed(7301);Game.start();Game.rocket.x=0;Game.rocket.y=80;Game.camera.x=0;Game.camera.y=80;Game.camera.zoom=.9;Game.goto('pause');Game.renderAt(8);});await page.screenshot({path:path.join(OUT,'ground-flight.png')});
 await page.evaluate(()=>{Game.camera.x=2400;Game.camera.y=80;Game.rocket.x=2400;Game.rocket.y=80;Game.goto('pause');Game.renderAt(8);});await page.screenshot({path:path.join(OUT,'open-ocean-flight.png')});
 assert(result.world.island.left+result.world.island.width<2000,'Starter island must end before remote-ocean camera');
 assert(result.world.clearWater.deep.join(',')!==result.world.stormWater.deep.join(','),'Ocean palette must react to weather');
 assert(Math.min(result.direct,result.mirror)>4,`Finite island did not separate launch coast from open ocean: direct=${result.direct.toFixed(2)} mirror=${result.mirror.toFixed(2)}`);
 assert.deepEqual(result.altitude,[],`Aircraft found above 24 km: ${JSON.stringify(result.altitude.slice(0,8))}`);
 assert(result.visiblePlanePeak<=5,`Aircraft density too high at 3 km: peak ${result.visiblePlanePeak}, ${JSON.stringify(result.seedPeaks)}`);
 assert(result.entries.length>=2,`Expected repeated aircraft edge entries, got ${JSON.stringify(result.entries)}`);
 assert(result.entries.every(x=>x<120||x>840),`Aircraft popped into visible middle: ${JSON.stringify(result.entries)}`);
 assert(result.maxVisibleJump<30,`Aircraft jumped while visible: ${result.maxVisibleJump}`);
 assert.deepEqual(errors,[]);
 console.log('World streaming QA PASS',JSON.stringify({islandVsOcean:[result.direct,result.mirror],island:result.world.island,visiblePlanePeak:result.visiblePlanePeak,seedPeaks:result.seedPeaks,entries:result.entries,maxVisibleJump:result.maxVisibleJump}));
}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
