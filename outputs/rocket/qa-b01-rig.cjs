/* B01 Weather Complex cut-out rig regression checks, E0-E5. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const dist=path.join(__dirname,'dist');
const partRoot=path.join(dist,'assets/placeables/base/weather_complex/parts');
const e0Dir=path.join(partRoot,'e0_1978');
const e0QaPath=path.resolve(__dirname,'../../art/gen/placeables/base/weather_complex/parts/e0_1978/parts_qa.json');
const extractionPath=path.resolve(__dirname,'../../art/gen/placeables/base/weather_complex/parts/part_extraction.json');
const rigPath=path.join(partRoot,'rig.json');
const jsPath=path.join(dist,'b01-rig-qa.js');
const controllerPath=path.join(dist,'weather-complex-rig.js');
function pngSize(file){const b=fs.readFileSync(file);if(b.length<24||b.toString('hex',0,8)!=='89504e470d0a1a0a')throw new Error('bad PNG '+file);return [b.readUInt32BE(16),b.readUInt32BE(20)];}
for(const name of ['body','sensor','vane','indicator']){const f=path.join(e0Dir,name+'.png');if(!fs.existsSync(f))throw new Error('missing '+f);const [w,h]=pngSize(f);if(w!==96||h!==122)throw new Error(`${name} E0: ${w}x${h}, expected 96x122`);const atlas=path.join(partRoot,name+'_eras.png');if(!fs.existsSync(atlas))throw new Error('missing '+atlas);const [aw,ah]=pngSize(atlas);if(aw!==288||ah!==244)throw new Error(`${name} atlas: ${aw}x${ah}, expected 288x244`);}
const e0qa=JSON.parse(fs.readFileSync(e0QaPath,'utf8'));
if(e0qa.reconstruction_pixel_exact!==true)throw new Error('B01 E0 rest reconstruction is not pixel-exact');
const extraction=JSON.parse(fs.readFileSync(extractionPath,'utf8'));
const order=['e0_1978','e1_1986','e2_1998','e3_2015','e4_2035','e5_2060'];
for(const stem of order){const e=extraction.eras?.[stem];if(!e)throw new Error('missing extraction era '+stem);if(e.reconstruction_pixel_exact!==true)throw new Error(stem+' reconstruction not pixel-exact');for(const part of ['sensor','indicator']){if(!e.parts?.[part]?.present||!Array.isArray(e.parts[part].pivot))throw new Error(`${stem} missing measured ${part} pivot`);}}
for(const stem of ['e0_1978','e1_1986','e2_1998','e3_2015'])if(!extraction.eras[stem].parts.vane.present||!Array.isArray(extraction.eras[stem].parts.vane.pivot))throw new Error(stem+' vane must be present and measured');
for(const stem of ['e4_2035','e5_2060'])if(extraction.eras[stem].parts.vane.present!==false||extraction.eras[stem].parts.vane.pivot!==null)throw new Error(stem+' vane must be intentionally absent');
const rig=JSON.parse(fs.readFileSync(rigPath,'utf8'));
if(JSON.stringify(rig.atlas_layout?.order)!==JSON.stringify(order))throw new Error('runtime atlas order mismatch');
for(const stem of order){const src=extraction.eras[stem],dst=rig.eras?.[stem];if(!dst)throw new Error('runtime rig missing '+stem);for(const part of ['sensor','vane','indicator'])if(JSON.stringify(src.parts[part].pivot)!==JSON.stringify(dst[part].pivot)||src.parts[part].present!==dst[part].present)throw new Error(`${stem}/${part} runtime rig drift`);}
const controllerJs=fs.readFileSync(controllerPath,'utf8');const sandbox={window:{},Math,console};vm.createContext(sandbox);new vm.Script(controllerJs,{filename:'weather-complex-rig.js'}).runInContext(sandbox);const Controller=sandbox.window.WeatherComplexRigController;if(typeof Controller!=='function')throw new Error('WeatherComplexRigController not exported');
const c=new Controller(rig,'e0_1978');if(c.state!=='IDLE')throw new Error('initial state must be IDLE');if(!c.dispatch('launch_prepare')||c.state!=='NOTICE')throw new Error('launch_prepare must enter NOTICE');c.update(.25,{wind:.5});if(c.state!=='WORK')throw new Error('NOTICE must advance to WORK');c.update(.6,{wind:.5});if(Math.abs(c.sensorAngle)>.001)throw new Error('WORK midpoint must pass sensor center');if(!c.dispatch('weather_window_selected',{index:1})||c.state!=='FINISH')throw new Error('selection must enter FINISH');c.update(.25,{wind:0});if(c.state!=='COOLDOWN')throw new Error('FINISH must advance to COOLDOWN');c.update(.6,{wind:0});if(c.state!=='IDLE')throw new Error('COOLDOWN must return to IDLE');c.setEra('e4_2035');c.update(.1,{wind:1});if(c.vaneAngle!==0)throw new Error('E4 has no vane and must not synthesize vane motion');c.dispatch('power_off');if(c.state!=='OFF')throw new Error('power_off must enter OFF');
const js=fs.readFileSync(jsPath,'utf8');new vm.Script(js,{filename:'b01-rig-qa.js'});
for(const token of ["drawRigidCell('sensor'","drawRigidCell('vane'","drawCell('indicator'","fetch(ROOT+'rig.json')","controller.dispatch('launch_prepare')","controller.dispatch('weather_window_selected'"])if(!js.includes(token))throw new Error('rig harness missing '+token);
if(js.includes('wholeSpriteAngle')||js.includes('wholeSpriteScale')||js.includes('wholeSpriteBob'))throw new Error('whole-sprite fake motion marker found');
console.log('B01 rig QA: E0-E5 atlases valid; rest reconstructions exact; measured pivots match runtime metadata; causal OFF→IDLE→NOTICE→WORK→FINISH→COOLDOWN contract passes; E4/E5 vane intentionally absent; harness syntax OK.');
