/* B01 runtime integration regression: script order, causal events, atlases and standalone build wiring. */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const here=__dirname,dist=path.join(here,'dist');
const read=f=>fs.readFileSync(path.join(dist,f),'utf8');
const fail=m=>{throw new Error('B01_RUNTIME_QA_FAIL: '+m);};
const yes=(v,m)=>{if(!v)fail(m);};

const index=read('index.html'),build=fs.readFileSync(path.join(here,'build.cjs'),'utf8');
const runtime=read('weather-complex-runtime.js'),rigController=read('weather-complex-rig.js');
new vm.Script(runtime,{filename:'weather-complex-runtime.js'});
new vm.Script(rigController,{filename:'weather-complex-rig.js'});

const order=['game.js','weather-complex-rig.js','weather-complex-runtime.js','infrastructure.js'];
let last=-1;for(const f of order){const i=index.indexOf(`<script src="${f}"></script>`);yes(i>=0,'index misses '+f);yes(i>last,'wrong index script order around '+f);last=i;}
for(const f of ['weather-complex-rig.js','weather-complex-runtime.js'])yes(build.includes(`'${f}'`),'standalone build does not inline '+f);

yes(runtime.includes("'launch_prepare'"),'launch_prepare event missing');
yes(runtime.includes("'weather_window_selected'"),'weather_window_selected event missing');
yes(runtime.includes("'weather_preview_cancel'"),'cancel event missing');
yes(runtime.includes("'era_changed'"),'era change integration missing');
yes(runtime.includes("body_eras.png")&&runtime.includes("sensor_eras.png")&&runtime.includes("vane_eras.png")&&runtime.includes("indicator_eras.png"),'part atlases not referenced');
yes(runtime.includes("infrastructure/weather/")&&runtime.includes('TRANSPARENT'),'legacy weather sprite/procedural layer is not suppressed');
yes(runtime.includes('ctx.rotate(angle||0)'),'rigged part rotation missing');
yes(runtime.includes('ctx.setTransform(2,0,0,2,0,0)'),'logical-canvas transform missing');
yes(runtime.includes("controller.state==='WORK'&&controller.stateTime>=1.2"),'event-driven WORK completion guard missing');
yes(!/Math\.sin\([^\n]*\)\s*\*[^\n]*(x|y)/.test(runtime),'unexpected whole-sprite decorative bob pattern');

const rig=JSON.parse(fs.readFileSync(path.join(dist,'assets/placeables/base/weather_complex/parts/rig.json'),'utf8'));
yes(JSON.stringify(rig.canvas)==='[96,122]','rig canvas changed');
yes(JSON.stringify(rig.registration)==='[48,118]','registration changed');
yes(Object.keys(rig.eras).length===6,'expected six eras');
for(const [era,e] of Object.entries(rig.eras)){
 for(const part of ['sensor','vane','indicator']){
  yes(e[part]&&typeof e[part].present==='boolean',`${era}/${part} presence missing`);
  if(e[part].present)yes(Array.isArray(e[part].pivot)&&e[part].pivot.length===2,`${era}/${part} pivot missing`);
 }
}

const ctx={window:{}};ctx.window=ctx;vm.createContext(ctx);vm.runInContext(rigController,ctx);
const C=ctx.WeatherComplexRigController,c=new C(rig,'e0_1978');
yes(c.state==='IDLE','controller not idle initially');
yes(c.dispatch('launch_prepare')===true,'launch_prepare rejected');
for(let i=0;i<20;i++)c.update(.02,{wind:.4});
yes(c.state==='WORK','NOTICE did not reach WORK');
for(let i=0;i<60;i++)c.update(.02,{wind:.4});
yes(c.dispatch('weather_window_selected',{index:0})===true,'selection event rejected');
for(let i=0;i<50;i++)c.update(.02,{wind:.4});
yes(c.state==='IDLE','FINISH/COOLDOWN did not return IDLE');
yes(Math.abs(c.vaneAngle)>0,'wind-reactive vane did not move');

console.log('B01 runtime QA PASS: scripts ordered, standalone build wired, causal rig events present, pivots valid.');
