/* Regression for reported mobile flight defect: repeated base bands, wrong aircraft altitude, visible traffic pop-in. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url');
let pw;try{pw=require('playwright');}catch{pw=require(path.join(require('os').homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));}
const OUT=path.resolve(__dirname,'../../work/world-streaming');fs.mkdirSync(OUT,{recursive:true});
(async()=>{const b=await pw.chromium.launch({channel:'chrome',headless:true});try{
 const page=await b.newPage({viewport:{width:960,height:600}});await page.addInitScript(()=>window.requestAnimationFrame=()=>0);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(pathToFileURL(path.resolve(__dirname,'../Выше неба.html')).href);await page.waitForTimeout(900);
 const result=await page.evaluate(async()=>{
  await WorldSprites.ready;
  for(let i=0;i<40&&!AircraftTraffic.qa().zipReady;i++)await new Promise(r=>setTimeout(r,50));
  const art={};for(const [k,file]of [['routeSky','sky-color-plate.png'],['base','base-static.png']]){const im=new Image();im.src=window.__GAME_ASSETS__[file];await im.decode();art[k]=im;}
  const render=(x)=>{const c=document.createElement('canvas');c.width=960;c.height=600;const q=c.getContext('2d');WorldArt.draw(q,{x,y:300,zoom:1},{x:0,y:300,mode:0,body:'earth',time:0},Game.profile,art);return q.getImageData(0,280,960,300);};
  const a=render(0),b=render(1600);let direct=0,mirror=0,n=0;
  for(let y=0;y<a.height;y+=3)for(let x=0;x<a.width;x+=3){const ia=(y*a.width+x)*4,ib=(y*b.width+x)*4,im=(y*b.width+(b.width-1-x))*4;for(let c=0;c<3;c++){direct+=Math.abs(a.data[ia+c]-b.data[ib+c]);mirror+=Math.abs(a.data[ia+c]-b.data[im+c]);n++;}}
  direct/=n;mirror/=n;
  const altitude=[];for(let era=0;era<6;era++)for(const y of [2400,2600,3000,5000,8400,9000])for(let v=0;v<6;v++)if(Journey.objectKind(y,0,era,v)==='plane')altitude.push({era,y,v});
  Game.profile.base=5;Game.start();Game.rocket.x=0;Game.rocket.y=300;Game.rocket.vx=0;Game.rocket.vy=0;Game.camera.x=0;Game.camera.y=300;Game.camera.zoom=.7;
  let previousVisible=false,entries=[],maxVisibleJump=0,previousX=null,seenSample=false;
  for(let i=0;i<=1400;i++){const t=i*.1;Game.camera.x=0;Game.camera.y=300;Game.camera.zoom=.7;Game.rocket.x=0;Game.rocket.y=300;Game.renderAt(t);Game.step(0);const p=Game.objects.find(o=>o.type==='hazard'&&o.kind==='plane'&&o.originX===280&&o.originY===300);let visible=false,x=null;if(p){x=Game.project(p.x,p.y).x;visible=x>=0&&x<=960;}if(seenSample&&visible&&!previousVisible)entries.push(x);if(visible&&previousVisible&&previousX!=null)maxVisibleJump=Math.max(maxVisibleJump,Math.abs(x-previousX));previousVisible=visible;previousX=visible?x:null;seenSample=true;}
  Game.camera.x=0;Game.camera.y=300;Game.camera.zoom=.7;Game.rocket.x=0;Game.rocket.y=300;Game.goto('pause');Game.renderAt(8);
  return {direct,mirror,altitude,entries,maxVisibleJump,aircraft:AircraftTraffic.qa()};
 });
 await page.screenshot({path:path.join(OUT,'ground-flight.png')});
 assert(result.direct>4&&result.mirror>4,`Base/background still repeats across world bands: direct=${result.direct.toFixed(2)} mirror=${result.mirror.toFixed(2)}`);
 assert.deepEqual(result.altitude,[],`Aircraft found above 24 km: ${JSON.stringify(result.altitude.slice(0,8))}`);
 assert(result.entries.length>=2,`Expected repeated aircraft edge entries, got ${JSON.stringify(result.entries)}`);
 assert(result.entries.every(x=>x<120||x>840),`Aircraft popped into visible middle: ${JSON.stringify(result.entries)}`);
 assert(result.maxVisibleJump<30,`Aircraft jumped while visible: ${result.maxVisibleJump}`);
 assert.deepEqual(errors,[]);
 console.log('World streaming QA PASS',JSON.stringify({bandDiff:[result.direct,result.mirror],entries:result.entries,maxVisibleJump:result.maxVisibleJump}));
}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
