/* Browser QA for integrated B01: six eras, two-window choice, causal launch motion. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{pathToFileURL}=require('node:url');
const out=path.resolve(__dirname,'../../work/b01-runtime-browser');fs.mkdirSync(out,{recursive:true});
(async()=>{const browser=await require('./browser.cjs').launch({headless:true,channel:'chrome'});try{
 const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(pathToFileURL(path.resolve(__dirname,'../Выше неба.html')).href);
 await page.waitForFunction(()=>window.Game&&window.BaseInfrastructure&&window.B01WeatherRuntime&&window.B01WeatherWindow,{timeout:10000});
 await page.evaluate(()=>{Game.profile.location='earth';Game.profile.infrastructure={owned:['weather'],layout:{weather:'perL1'}};Game.save();Game.goto('home');});
 await page.waitForFunction(()=>B01WeatherRuntime.ready&&B01WeatherRuntime.pose,{timeout:10000});
 const eras=[];for(let era=0;era<6;era++){
  await page.evaluate(i=>{Game.profile.base=i;Game.goto('home');},era);
  await page.waitForFunction(i=>B01WeatherRuntime.controller?.era===['e0_1978','e1_1986','e2_1998','e3_2015','e4_2035','e5_2060'][i],era,{timeout:3000});await page.waitForTimeout(100);
  const info=await page.evaluate(()=>({ready:B01WeatherRuntime.ready,era:B01WeatherRuntime.controller?.era,state:B01WeatherRuntime.pose?.state,legacy:Object.entries(__GAME_ASSETS__).filter(([k])=>k.startsWith('infrastructure/weather/')).every(([,v])=>String(v).startsWith('data:image/svg+xml'))}));
  assert(info.ready);assert(info.legacy);assert.equal(info.state,'IDLE');const file=path.join(out,`era-${era}-home.png`);await page.locator('#canvas').screenshot({path:file});eras.push({...info,sha256:crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')});
 }
 assert.equal(new Set(eras.map(x=>x.era)).size,6);assert.equal(new Set(eras.map(x=>x.sha256)).size,6,'six era frames should not be identical');
 await page.evaluate(()=>{Game.profile.base=0;Game.goto('home');Game.start();});
 await page.waitForFunction(()=>B01WeatherWindow.open&&Game.screen==='pause',{timeout:3000});
 const choice=await page.evaluate(()=>({options:B01WeatherWindow.options.map(x=>x.kind),state:B01WeatherRuntime.pose?.state}));assert.equal(choice.options.length,2);assert.notEqual(choice.options[0],choice.options[1]);
 await page.locator('#canvas').screenshot({path:path.join(out,'weather-choice.png')});
 const box=await page.locator('#canvas').boundingBox();const b=await page.evaluate(()=>B01WeatherWindow.bounds[1]);await page.mouse.click(box.x+(b.x+b.w/2)/960*box.width,box.y+(b.y+b.h/2)/600*box.height);
 await page.waitForFunction(()=>!B01WeatherWindow.open&&Game.screen==='flight',{timeout:3000});const selected=await page.evaluate(()=>({kind:Game.weather.kind,expected:B01WeatherWindow.options[1].kind}));assert.equal(selected.kind,selected.expected);
 const states=[];for(let i=0;i<16;i++){await page.waitForTimeout(100);states.push(await page.evaluate(()=>B01WeatherRuntime.pose?.state));}
 assert(states.includes('FINISH')||states.includes('COOLDOWN'),'selection did not trigger FINISH/COOLDOWN');assert.equal(states.at(-1),'IDLE','rig did not return to IDLE after choice');
 await page.locator('#canvas').screenshot({path:path.join(out,'launch-after-cycle.png')});assert.deepEqual(errors,[],'page errors during B01 browser QA');
 fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({eras,choice,selected,launchStates:states,errors,result:'pass'},null,2)+'\n');console.log('B01 browser QA PASS: six eras render, two distinct windows offered once, second window selected, causal rig returns to IDLE.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
