/* B01 runtime integration regression: script order, causal rig, two-window mechanic and standalone build wiring. */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const here=__dirname,dist=path.join(here,'dist');
const read=f=>fs.readFileSync(path.join(dist,f),'utf8');
const fail=m=>{throw new Error('B01_RUNTIME_QA_FAIL: '+m);};
const yes=(v,m)=>{if(!v)fail(m);};

const index=read('index.html'),build=fs.readFileSync(path.join(here,'build.cjs'),'utf8');
const runtime=read('weather-complex-runtime.js'),windowUi=read('weather-complex-window.js'),rigController=read('weather-complex-rig.js');
for(const [f,src] of [['weather-complex-runtime.js',runtime],['weather-complex-window.js',windowUi],['weather-complex-rig.js',rigController]])new vm.Script(src,{filename:f});

const order=['game.js','weather-complex-rig.js','weather-complex-runtime.js','infrastructure.js','weather-complex-window.js'];
let last=-1;for(const f of order){const i=index.indexOf(`<script src="${f}"></script>`);yes(i>=0,'index misses '+f);yes(i>last,'wrong index script order around '+f);last=i;}
for(const f of ['weather-complex-rig.js','weather-complex-runtime.js','weather-complex-window.js'])yes(build.includes(`'${f}'`),'standalone build does not inline '+f);

yes(runtime.includes("'launch_prepare'"),'launch_prepare event missing');
yes(runtime.includes("'weather_preview_cancel'"),'cancel event missing');
yes(runtime.includes("'era_changed'"),'era change integration missing');
yes(!runtime.includes("controller.state==='WORK'&&controller.stateTime>=1.2"),'runtime must not auto-select a weather window');
yes(runtime.includes("const PARTS=['body','sensor','vane','indicator']")&&runtime.includes("part+'_eras.png'"),'part atlas wiring not referenced');
yes(runtime.includes("infrastructure/weather/")&&runtime.includes('TRANSPARENT'),'legacy weather sprite/procedural layer is not suppressed');
yes(runtime.includes('ctx.rotate(angle||0)'),'rigged part rotation missing');
yes(runtime.includes('ctx.setTransform(2,0,0,2,0,0)'),'logical-canvas transform missing');
yes(!/Math\.sin\([^\n]*\)\s*\*[^\n]*(x|y)/.test(runtime),'unexpected whole-sprite decorative bob pattern');

yes(windowUi.includes("const CARDS=[")&&windowUi.includes("source:'current'")&&windowUi.includes("source:'alternate'"),'two deterministic choices missing');
yes(windowUi.includes("weather_window_selected"),'selection is not connected to rig event');
yes(windowUi.includes("one choice")||windowUi.includes('Нового переброса нет'),'no-reroll contract missing');
yes(windowUi.includes('patchLegacyWeatherEffect'),'legacy wind-reduction compensation missing');
yes(windowUi.includes("def.benefit='Два прогноза следующего запуска · один выбор без reroll'"),'infrastructure benefit text not updated');

const rigPath=path.resolve(here,'../../art/gen/placeables/base/weather_complex/parts/rig.json');
const rig=JSON.parse(fs.readFileSync(rigPath,'utf8'));
yes(JSON.stringify(rig.canvas)==='[96,122]','rig canvas changed');
yes(JSON.stringify(rig.registration)==='[48,118]','registration changed');
yes(Object.keys(rig.eras).length===6,'expected six eras');
for(const [era,e] of Object.entries(rig.eras))for(const part of ['sensor','vane','indicator']){yes(e[part]&&typeof e[part].present==='boolean',`${era}/${part} presence missing`);if(e[part].present)yes(Array.isArray(e[part].pivot)&&e[part].pivot.length===2,`${era}/${part} pivot missing`);}

const ctx={window:{}};ctx.window=ctx;vm.createContext(ctx);vm.runInContext(rigController,ctx);
const C=ctx.WeatherComplexRigController,c=new C(rig,'e0_1978');
yes(c.state==='IDLE','controller not idle initially');yes(c.dispatch('launch_prepare')===true,'launch_prepare rejected');for(let i=0;i<20;i++)c.update(.02,{wind:.4});yes(c.state==='WORK','NOTICE did not reach WORK');for(let i=0;i<60;i++)c.update(.02,{wind:.4});yes(c.state==='WORK','WORK must wait for explicit weather choice');yes(c.dispatch('weather_window_selected',{index:1})===true,'selection event rejected');for(let i=0;i<50;i++)c.update(.02,{wind:.4});yes(c.state==='IDLE','FINISH/COOLDOWN did not return IDLE');yes(Math.abs(c.vaneAngle)>0,'wind-reactive vane did not move');

console.log('B01 runtime QA PASS: scripts ordered, canonical rig metadata wired, two-window/no-reroll mechanic wired, legacy wind bonus neutralized, causal rig waits for explicit choice.');
