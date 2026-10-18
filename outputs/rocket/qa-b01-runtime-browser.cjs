/* Browser QA for the integrated B01 weather complex: six eras + causal launch motion. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{pathToFileURL}=require('node:url');
const out=path.resolve(__dirname,'../../work/b01-runtime-browser');fs.mkdirSync(out,{recursive:true});
(async()=>{
 const browser=await require('./browser.cjs').launch({headless:true,channel:'chrome'});
 try{
  const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(pathToFileURL(path.resolve(__dirname,'../Выше неба.html')).href);
  await page.waitForFunction(()=>window.Game&&window.BaseInfrastructure&&window.B01WeatherRuntime,{timeout:10000});
  await page.evaluate(()=>{Game.profile.location='earth';Game.profile.infrastructure={owned:['weather'],layout:{weather:'perL1'}};Game.save();Game.goto('home');});
  await page.waitForFunction(()=>B01WeatherRuntime.ready&&B01WeatherRuntime.pose,{timeout:10000});

  const eras=[];
  for(let era=0;era<6;era++){
   await page.evaluate(i=>{Game.profile.base=i;Game.goto('home');},era);
   await page.waitForFunction(i=>B01WeatherRuntime.controller?.era===['e0_1978','e1_1986','e2_1998','e3_2015','e4_2035','e5_2060'][i],era,{timeout:3000});
   await page.waitForTimeout(100);
   const info=await page.evaluate(()=>({
    ready:B01WeatherRuntime.ready,
    era:B01WeatherRuntime.controller?.era,
    state:B01WeatherRuntime.pose?.state,
    legacy:Object.entries(__GAME_ASSETS__).filter(([k])=>k.startsWith('infrastructure/weather/')).every(([,v])=>String(v).startsWith('data:image/svg+xml'))
   }));
   assert(info.ready);assert(info.legacy);assert.equal(info.state,'IDLE');
   const file=path.join(out,`era-${era}-home.png`);await page.locator('#canvas').screenshot({path:file});
   eras.push({...info,sha256:crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')});
  }
  assert.equal(new Set(eras.map(x=>x.era)).size,6);
  assert.equal(new Set(eras.map(x=>x.sha256)).size,6,'six era frames should not be identical');

  await page.evaluate(()=>{Game.profile.base=0;Game.goto('home');Game.start();});
  const states=[];for(let i=0;i<30;i++){await page.waitForTimeout(100);states.push(await page.evaluate(()=>B01WeatherRuntime.pose?.state));}
  assert(states.some(s=>s==='NOTICE'||s==='WORK'),'launch did not trigger NOTICE/WORK');
  assert(states.includes('FINISH')||states.includes('COOLDOWN'),'launch rig never confirmed/completed');
  assert.equal(states.at(-1),'IDLE','rig did not return to IDLE after causal launch sequence');
  await page.locator('#canvas').screenshot({path:path.join(out,'launch-after-cycle.png')});
  assert.deepEqual(errors,[],'page errors during B01 runtime browser QA');
  const report={eras,launchStates:states,errors,result:'pass'};fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');
  console.log('B01 browser QA PASS: six eras render in-game, legacy layer suppressed, launch causal sequence returns to IDLE.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
