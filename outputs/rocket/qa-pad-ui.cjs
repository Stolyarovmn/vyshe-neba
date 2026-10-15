/* Стартовая опора, реальный отрыв и возвраты из окон. */
const assert=require('node:assert/strict'),path=require('node:path'),{pathToFileURL}=require('node:url'),E=require('./dist/engine');let pw;try{pw=require('playwright');}catch{pw=require(path.join(require('os').homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));}
let p=E.fresh(),r=E.rocket(p);r.angle=Math.PI/2;
for(let i=0;i<120;i++){r.angle=Math.PI/2;E.step(r,p,{thrust:true},1/120,0);}
assert(!r.liftedOff&&r.y===0&&r.vy===0,'Платформа поддерживает ракету до отрыва');
r.angle=0;for(let i=0;i<240;i++)E.step(r,p,{thrust:true},1/120,0);
assert(r.liftedOff&&r.y>25,'Ракета отрывается обычной тягой');
(async()=>{let b=await pw.chromium.launch({channel:'chrome',headless:true});try{let page=await b.newPage({viewport:{width:1440,height:900}}),errors=[];await page.addInitScript(()=>window.requestAnimationFrame=()=>0);page.on('pageerror',e=>errors.push(e.message));await page.goto(pathToFileURL(path.resolve(__dirname,'../Выше неба.html')).href);await page.waitForTimeout(400);
await page.evaluate(()=>{Game.start();let r=Game.rocket;r.launched=true;r.time=2;r.angle=Math.PI/2;for(let i=0;i<120;i++)Game.step(1/120);});assert.equal(await page.evaluate(()=>Game.screen),'flight','Ожидание на площадке не считается аварией');
await page.keyboard.down('KeyW');let airborne=await page.evaluate(()=>{for(let i=0;i<240;i++)Game.step(1/120);return Game.rocket.liftedOff&&Game.rocket.y>25;});await page.keyboard.up('KeyW');assert(airborne);
await page.evaluate(()=>{Game.render();Game.buttons.find(b=>b.id==='flightHelp').fn();Game.render();Game.buttons.find(b=>b.id==='helpBack').fn();});assert.equal(await page.evaluate(()=>Game.screen),'flight','Справка возвращает в полёт');
await page.keyboard.press('KeyP');await page.evaluate(()=>{Game.render();Game.buttons.find(b=>b.id==='helpPause').fn();Game.render();Game.buttons.find(b=>b.id==='helpBack').fn();});assert.equal(await page.evaluate(()=>Game.screen),'pause','Справка из паузы возвращает в паузу');
await page.evaluate(()=>{Game.goto('flight');let r=Game.rocket;r.y=.01;r.vy=-90;r.angle=0;for(let o of Game.objects)o.active=false;Game.step(1/120);});assert.equal(await page.evaluate(()=>Game.screen),'crash','Реальный удар после отрыва сохраняет аварию');
await page.evaluate(()=>{Game.goto('result');Game.render();});assert(!(await page.evaluate(()=>Game.buttons.some(b=>/close|cross/.test(b.id)))),'В результатах нет ложной кнопки закрытия');
await page.evaluate(()=>{Game.profile.base=0;Game.goto('home');Game.render();});await page.screenshot({path:path.resolve(__dirname,'../../work/pad-final.png')});
await page.evaluate(()=>{Game.goto('shop');Game.render();});await page.screenshot({path:path.resolve(__dirname,'../../work/shop-final.png')});assert.deepEqual(errors,[]);console.log('Старт: опора до отрыва, набор высоты, реальный удар; интерфейс: возвраты справки и отсутствие ложного закрытия — пройдены.');}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1;});

