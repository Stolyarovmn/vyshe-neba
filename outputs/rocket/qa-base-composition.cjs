const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const dist=path.join(__dirname,'dist');
const infraSrc=fs.readFileSync(path.join(dist,'infrastructure.js'),'utf8');
const compositionSrc=fs.readFileSync(path.join(dist,'base-composition.js'),'utf8');
new vm.Script(infraSrc,{filename:'infrastructure.js'});new vm.Script(compositionSrc,{filename:'base-composition.js'});
const noop=()=>{};
const ctx=new Proxy({roundRect:noop,beginPath:noop,fill:noop,stroke:noop,moveTo:noop,lineTo:noop,arc:noop,drawImage:noop,save:noop,restore:noop,setTransform:noop,fillRect:noop,fillText:noop,translate:noop,scale:noop,rotate:noop},{get:(o,k)=>k in o?o[k]:0,set:(o,k,v)=>(o[k]=v,true)});
const canvas={getContext:()=>ctx,addEventListener:noop,getBoundingClientRect:()=>({left:0,top:0,right:960,width:960,height:600})};
const profile={location:'earth',base:5,coins:100000,stats:{flights:0,earned:0},upgrades:{fuel:0,engine:0,legs:0,reserve:0,hull:0,magnet:0,fins:0,parachute:0,booster:0}};
const engine={__infraHooked:false,UPGRADES:Object.keys(profile.upgrades).map(id=>[id,id,'',100,1.1,20]),upgradeLimit:()=>20,rocket:()=>({stages:[{fuel:100,maxFuel:100}],stageIndex:0,fuel:100,maxFuel:100,time:0,boostHeat:0,boosting:false}),step:(r,p,input)=>input,landing:()=>({safe:false,perfect:false,pad:true}),rebuildCost:()=>100,price:()=>100,purchase:()=>false};
const content={shop:[['x','X','',100]],missions:[['m','M','',100,()=>true]]};
const game={profile,screen:'home',rocket:null,result:null,objects:[],camera:{zoom:1},project:(x,y)=>({x:480+x,y:468-y}),save:noop};
let raf=[];
const sandbox={window:{Game:game,RocketEngine:engine,GameContent:content,visualViewport:{width:960,height:600},addEventListener:noop},document:{getElementById:()=>canvas},Image:class{constructor(){this.complete=false;this.naturalWidth=0;}},performance:{now:()=>0},requestAnimationFrame:cb=>raf.push(cb),matchMedia:()=>({matches:false}),innerWidth:960,innerHeight:600,console,Math};
sandbox.window.window=sandbox.window;sandbox.window.document=sandbox.document;
vm.runInNewContext(infraSrc,sandbox,{filename:'infrastructure.js'});
const I=sandbox.window.BaseInfrastructure;assert(I,'BaseInfrastructure export missing');
profile.infrastructure={owned:I.definitions.map(d=>d.id),layout:{},layoutVersion:0};
vm.runInNewContext(compositionSrc,sandbox,{filename:'base-composition.js'});
const C=sandbox.window.BaseComposition;assert(C,'BaseComposition export missing');assert.equal(C.version,2,'unexpected composition version');
C.migrate();
const st=I.state();
assert.equal(st.layoutVersion,C.version,'composition migration did not persist its version');
assert.equal(Object.keys(C.preferredLayout).length,I.definitions.length,'every infrastructure object needs a canonical full-base slot');
const slots=new Map(I.slots.map(s=>[s.id,s])),used=new Set();
for(const d of I.definitions){
 const sid=C.preferredLayout[d.id],slot=slots.get(sid);
 assert(slot,`${d.id}: missing preferred slot ${sid}`);
 assert(d.zone.includes(slot.zone),`${d.id}: slot ${sid} zone ${slot.zone} is incompatible with ${d.zone.join(',')}`);
 assert(!used.has(sid),`${d.id}: preferred slot ${sid} is already occupied`);used.add(sid);
 assert.equal(st.layout[d.id],sid,`${d.id}: full-base migration did not use preferred slot`);
}
const usedSlots=[...used].map(id=>slots.get(id));
for(let a=0;a<usedSlots.length;a++)for(let b=a+1;b<usedSlots.length;b++){
 const A=usedSlots[a],B=usedSlots[b],dist=Math.hypot(A.x-B.x,A.y-B.y);
 assert(dist>=42,`${A.id}/${B.id}: placement centers are too close (${dist.toFixed(1)}px)`);
}
for(const s of usedSlots){
 assert(s.x>=240&&s.x<=870&&s.y>=240&&s.y<=470,`${s.id}: outside starter-island composition envelope at ${s.x},${s.y}`);
 assert(Math.hypot(s.x-480,s.y-468)>=65,`${s.id}: intrudes into the rocket/start-table exclusion zone`);
 const projected=game.project((s.x-480)*1.2,0);
 assert.equal(projected.x,s.x,`${s.id}: launch projection lost horizontal composition`);
 assert.equal(projected.y,s.y,`${s.id}: launch projection lost island depth`);
}

/* The HD island metadata measures the launch-pad center at source px (388,375).
 * With width 1650, that measured point must be screen (480,468), the rocket anchor.
 */
const islandMeta=JSON.parse(fs.readFileSync(path.join(__dirname,'../../art/gen/environment/start_island_hd.meta.json'),'utf8'));
assert.deepEqual(islandMeta.pad_center_px,[388,375],'unexpected HD island pad center');
const [srcW,srcH]=islandMeta.size,scale=1650/srcW,padX=islandMeta.pad_center_px[0],padY=islandMeta.pad_center_px[1];
const islandScreenLeft=480-padX*scale,islandScreenTop=468-padY*scale;
assert(Math.abs((islandScreenLeft+padX*scale)-480)<1e-9,'island pad x no longer aligns with rocket');
assert(Math.abs((islandScreenTop+padY*scale)-468)<1e-9,'island pad y no longer aligns with rocket');

/* Land-mask QA: every canonical building anchor must be on opaque island ground. */
const land=JSON.parse(fs.readFileSync(path.join(__dirname,'../../art/gen/environment/start_island_hd.land.json'),'utf8'));
assert.deepEqual(land.size,[srcW,srcH],'land mask and island source size diverged');
function isLand(screenX,screenY){
 const sx=(screenX-islandScreenLeft)/scale,sy=(screenY-islandScreenTop)/scale;
 const cx=Math.floor(sx/land.cell_px),cy=Math.floor(sy/land.cell_px);
 if(cx<0||cy<0||cx>=land.cols||cy>=land.rows)return false;
 const row=land.land_hex_rows[cy],n=parseInt(row[Math.floor(cx/4)],16),bit=3-(cx%4);
 return !!(n&(1<<bit));
}
for(const [id,sid] of Object.entries(C.preferredLayout)){
 const s=slots.get(sid);assert(isLand(s.x,s.y),`${id}/${sid}: canonical anchor is not on island land at ${s.x},${s.y}`);
}
console.log('Full-base composition QA PASS',JSON.stringify({objects:I.definitions.length,version:C.version,padScreen:[480,468],usedSlots:[...used]}));