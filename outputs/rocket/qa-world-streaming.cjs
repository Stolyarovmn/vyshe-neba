/* Regression for reported mobile flight defects: repeated/rectangular background layers, wrong aircraft altitude, visible traffic pop-in. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url');
let pw;try{pw=require('playwright');}catch{pw=require(path.join(require('os').homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));}
const OUT=path.resolve(__dirname,'../../work/world-streaming');fs.mkdirSync(OUT,{recursive:true});
(async()=>{const b=await pw.chromium.launch({channel:'chrome',headless:true});try{
 const page=await b.newPage({viewport:{width:960,height:600},hasTouch:true,isMobile:true});await page.addInitScript(()=>window.requestAnimationFrame=()=>0);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(pathToFileURL(path.resolve(__dirname,'../Выше неба.html')).href);await page.waitForTimeout(900);
 const result=await page.evaluate(async()=>{
  await WorldSprites.ready;
  for(let i=0;i<40&&!AircraftTraffic.qa().zipReady;i++)await new Promise(r=>setTimeout(r,50));
  const art={};for(const [k,file]of [['routeSky','sky-color-plate.png'],['base','base-static.png']]){const im=new Image();im.src=window.__GAME_ASSETS__[file];await im.decode();art[k]=im;}
  const render=(x,zoom=1)=>{const c=document.createElement('canvas');c.width=960;c.height=600;const q=c.getContext('2d');WorldArt.draw(q,{x,y:300,zoom},{x:0,y:300,mode:0,body:'earth',time:0},Game.profile,art);return q.getImageData(0,0,960,600);};
  const crop=(im,y0,h)=>{const out=new Uint8ClampedArray(im.width*h*4);for(let y=0;y<h;y++)out.set(im.data.subarray(((y+y0)*im.width)*4,((y+y0+1)*im.width)*4),y*im.width*4);return {data:out,width:im.width,height:h};};
  const percentile=(a,p)=>{const s=[...a].sort((x,y)=>x-y),i=Math.max(0,Math.min(s.length-1,Math.floor((s.length-1)*p)));return s[i];};
  const a=crop(render(0),280,300),b=crop(render(1600),280,300);let direct=0,mirror=0,n=0;
  for(let y=0;y<a.height;y+=3)for(let x=0;x<a.width;x+=3){const ia=(y*a.width+x)*4,ib=(y*b.width+x)*4,im=(y*b.width+(b.width-1-x))*4;for(let c=0;c<3;c++){direct+=Math.abs(a.data[ia+c]-b.data[ib+c]);mirror+=Math.abs(a.data[ia+c]-b.data[im+c]);n++;}}
  direct/=n;mirror/=n;
  const seamProbe=(worldEdge)=>{const im=render(worldEdge,.7),sx=480,scores=[];for(let x=sx-10;x<=sx+10;x++){let sum=0,count=0;for(let y=80;y<540;y+=4){const l=(y*im.width+x-1)*4,r=(y*im.width+x)*4;sum+=Math.abs(im.data[l]-im.data[r])+Math.abs(im.data[l+1]-im.data[r+1])+Math.abs(im.data[l+2]-im.data[r+2]);count+=3;}scores.push(sum/count);}const sorted=[...scores].sort((x,y)=>x-y),edge=scores[10],median=sorted[Math.floor(sorted.length/2)];return {worldEdge,edge,median,ratio:edge/(median+1)};};
  const seamProbes=[-2000,-800,800,2000].map(seamProbe);
  // Reproduce the user's horizontal-travel camera. A finite base sky overlay used to tint
  // most of the left side from top to bottom. The true sky must now stay horizontally
  // continuous; only a small number of silhouette columns may differ in the upper band.
  const layer=render(800,.7),upper=[],lower=[];
  for(let x=0;x<layer.width;x+=4){let up=0,un=0,lo=0,ln=0;for(let y=35;y<165;y+=5){const i=(y*layer.width+x)*4;up+=layer.data[i]-layer.data[i+2];un++;}for(let y=260;y<520;y+=7){const i=(y*layer.width+x)*4;lo+=layer.data[i]-layer.data[i+2];ln++;}upper.push(up/un);lower.push(lo/ln);}
  const layerProbe={upperSpread:percentile(upper,.8)-percentile(upper,.2),lowerSpread:percentile(lower,.8)-percentile(lower,.2),upperQ20:percentile(upper,.2),upperQ80:percentile(upper,.8)};
  const altitude=[];for(let era=0;era<6;era++)for(const y of [2400,2600,3000,5000,8400,9000])for(let v=0;v<6;v++)for(const ix of [-3,0,4])if(Journey.objectKind(y,0,era,v,ix,2,1)==='plane')altitude.push({era,y,v,ix});
  const stage=(seed)=>{Game.goto('home');Game.setLaunchSeed(seed);Game.profile.base=5;Game.start();Game.rocket.x=0;Game.rocket.y=300;Game.rocket.vx=0;Game.rocket.vy=0;Game.camera.x=0;Game.camera.y=300;Game.camera.zoom=.7;};
  stage(12345);
  let previousVisible=false,entries=[],maxVisibleJump=0,previousX=null,seenSample=false;
  for(let i=0;i<=1400;i++){const t=i*.1;Game.camera.x=0;Game.camera.y=300;Game.camera.zoom=.7;Game.rocket.x=0;Game.rocket.y=300;Game.renderAt(t);Game.step(0);const p=Game.objects.find(o=>o.type==='hazard'&&o.kind==='plane'&&o.originX===280&&o.originY===300);let visible=false,x=null;if(p){x=Game.project(p.x,p.y).x;visible=x>=0&&x<=960;}if(seenSample&&visible&&!previousVisible)entries.push(x);if(visible&&previousVisible&&previousX!=null)maxVisibleJump=Math.max(maxVisibleJump,Math.abs(x-previousX));previousVisible=visible;previousX=visible?x:null;seenSample=true;}
  let visiblePlanePeak=0;const seedPeaks=[];
  for(const seed of [1,17,101,999,12345,54321,777777,999983]){stage(seed);let peak=0;for(let i=0;i<=160;i++){const t=i*.25;Game.camera.x=0;Game.camera.y=300;Game.camera.zoom=.7;Game.rocket.x=0;Game.rocket.y=300;Game.renderAt(t);Game.step(0);let visiblePlanes=0;for(const o of Game.objects)if(o.type==='hazard'&&o.kind==='plane'){const q=Game.project(o.x,o.y);if(q.x>=0&&q.x<=960&&q.y>=0&&q.y<=600)visiblePlanes++;}peak=Math.max(peak,visiblePlanes);}seedPeaks.push([seed,peak]);visiblePlanePeak=Math.max(visiblePlanePeak,peak);}
  Game.camera.x=0;Game.camera.y=300;Game.camera.zoom=.7;Game.rocket.x=0;Game.rocket.y=300;Game.goto('pause');Game.renderAt(8);
  return {direct,mirror,seamProbes,layerProbe,altitude,entries,maxVisibleJump,visiblePlanePeak,seedPeaks,aircraft:AircraftTraffic.qa()};
 });
 await page.screenshot({path:path.join(OUT,'ground-flight.png')});
 await page.evaluate(()=>{Game.camera.x=800;Game.camera.y=300;Game.camera.zoom=.7;Game.rocket.x=800;Game.rocket.y=300;Game.goto('pause');Game.renderAt(8);});
 await page.screenshot({path:path.join(OUT,'background-layer-split.png')});
 assert(result.direct>4&&result.mirror>4,`Base/background still repeats across world bands: direct=${result.direct.toFixed(2)} mirror=${result.mirror.toFixed(2)}`);
 assert(result.seamProbes.every(s=>s.edge<36&&s.ratio<3.5),`Hard vertical background seam remains: ${JSON.stringify(result.seamProbes)}`);
 assert(result.layerProbe.upperSpread<18,`Finite rectangular base-sky layer still tints the mobile frame: ${JSON.stringify(result.layerProbe)}`);
 assert(result.layerProbe.lowerSpread>8,`Base/landscape disappeared while removing the rectangle: ${JSON.stringify(result.layerProbe)}`);
 assert.deepEqual(result.altitude,[],`Aircraft found above 24 km: ${JSON.stringify(result.altitude.slice(0,8))}`);
 assert(result.visiblePlanePeak<=5,`Aircraft density too high at 3 km across seeds: peak ${result.visiblePlanePeak}, ${JSON.stringify(result.seedPeaks)}`);
 assert(result.entries.length>=2,`Expected repeated aircraft edge entries, got ${JSON.stringify(result.entries)}`);
 assert(result.entries.every(x=>x<120||x>840),`Aircraft popped into visible middle: ${JSON.stringify(result.entries)}`);
 assert(result.maxVisibleJump<30,`Aircraft jumped while visible: ${result.maxVisibleJump}`);
 assert.deepEqual(errors,[]);
 console.log('World streaming QA PASS',JSON.stringify({bandDiff:[result.direct,result.mirror],seams:result.seamProbes,layer:result.layerProbe,visiblePlanePeak:result.visiblePlanePeak,seedPeaks:result.seedPeaks,entries:result.entries,maxVisibleJump:result.maxVisibleJump}));
}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
