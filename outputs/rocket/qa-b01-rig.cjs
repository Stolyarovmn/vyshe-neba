/* B01 Weather Complex cut-out rig regression checks. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const dist=path.join(__dirname,'dist');
const partDir=path.join(dist,'assets/placeables/base/weather_complex/parts/e0_1978');
const qaPath=path.resolve(__dirname,'../../art/gen/placeables/base/weather_complex/parts/e0_1978/parts_qa.json');
const jsPath=path.join(dist,'b01-rig-qa.js');
function pngSize(file){const b=fs.readFileSync(file);if(b.length<24||b.toString('hex',0,8)!=='89504e470d0a1a0a')throw new Error('bad PNG '+file);return [b.readUInt32BE(16),b.readUInt32BE(20)];}
for(const name of ['body','sensor','vane','indicator']){const f=path.join(partDir,name+'.png');if(!fs.existsSync(f))throw new Error('missing '+f);const [w,h]=pngSize(f);if(w!==96||h!==122)throw new Error(`${name}: ${w}x${h}, expected 96x122`);}
const qa=JSON.parse(fs.readFileSync(qaPath,'utf8'));
if(qa.reconstruction_pixel_exact!==true)throw new Error('B01 E0 rest reconstruction is not pixel-exact');
const expect={sensor:[42,29],vane:[48,36],indicator:[57,63]};
for(const [name,p] of Object.entries(expect)){const got=qa.parts?.[name]?.pivot;if(!Array.isArray(got)||got[0]!==p[0]||got[1]!==p[1])throw new Error(`${name}: pivot mismatch ${JSON.stringify(got)}`);}
const js=fs.readFileSync(jsPath,'utf8');new vm.Script(js,{filename:'b01-rig-qa.js'});
for(const token of ['drawRigidPart(imgs.sensor','drawRigidPart(imgs.vane','drawImageAt(imgs.indicator'])if(!js.includes(token))throw new Error('rig harness missing '+token);
if(/ctx\.(scale|rotate)\([^\n]*whole/i.test(js))throw new Error('whole-sprite fake motion marker found');
console.log('B01 rig QA: 4 parts present, 96x122; rest reconstruction exact; measured pivots locked; harness syntax OK.');
