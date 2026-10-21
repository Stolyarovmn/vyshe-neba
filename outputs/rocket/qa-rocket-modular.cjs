/* Regression for the reported monolithic rocket defect: body and fins must stay independent runtime families. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const repo=path.resolve(__dirname,'../..');
const read=rel=>fs.readFileSync(path.join(repo,rel),'utf8');
const json=rel=>JSON.parse(read(rel));
const sha=rel=>crypto.createHash('sha256').update(fs.readFileSync(path.join(repo,rel))).digest('hex');

const stems=['e0_1978','e1_1986','e2_1998','e3_2015','e4_2035','e5_2060'];
const runtime=json('outputs/rocket/runtime-assets.json');
const families=new Map((runtime.canonical_families||[]).map(x=>[x.asset_id,x]));
for(const [asset,family,target] of [
  ['R_BODY','body','world/rocket_modular/body'],
  ['R_FINS','fins','world/rocket_modular/fins'],
]){
  const entry=families.get(asset);
  assert(entry,`${asset} missing from canonical runtime manifest`);
  assert.equal(entry.source,`art/gen/rocket_modular/${family}`);
  assert.equal(entry.target,target);
  assert.deepEqual(entry.include,stems.map(x=>`${x}.png`));

  const promotion=json(`art/gen/rocket_modular/${family}/promotion-manifest.json`);
  const review=json(`art/gen/rocket_modular/${family}/visual_qa.json`);
  assert.equal(promotion.state,'production',`${asset} is not promoted`);
  assert.equal(review.overall_status,'approved',`${asset} visual gate is not approved`);
  assert.equal(promotion.files.length,6,`${asset} must contain six eras`);
  for(const item of promotion.files){
    const rel=`art/gen/rocket_modular/${family}/${item.png}`;
    assert(fs.existsSync(path.join(repo,rel)),`missing production sprite ${rel}`);
    assert.equal(sha(rel),item.sha256,`${rel} differs from promoted SHA-256`);
    assert.equal(review.eras[item.stem]?.status,'approved',`${asset}/${item.stem} visual review missing`);
    assert.equal(review.eras[item.stem]?.sha256,item.sha256,`${asset}/${item.stem} approval SHA mismatch`);
  }
}

const modular=read('live/rocket-modular.js');
assert(modular.includes('images={body:new Map(),fins:new Map()}'),'body/fins image stores must remain separate');
assert(modular.includes('p?.upgrades?.hull'),'body appearance must follow purchased hull upgrade');
assert(modular.includes('p?.upgrades?.fins'),'fin appearance must follow purchased fins upgrade');
assert(modular.includes("o.stageId==='capsule'"),'capsule-only stage must bypass body/fins composition');
assert(modular.includes("if(stage==='booster')"),'booster-stage composition path missing');
assert(modular.includes("load('body',t)")&&modular.includes("load('fins',t)"),'both modular families must preload all tiers');

const index=read('outputs/rocket/dist/index.html');
const vehicle=index.indexOf('<script src="vehicle-art.js"></script>');
const modularTag=index.indexOf('<script src="../../../live/rocket-modular.js"></script>');
const game=index.indexOf('<script src="game.js"></script>');
assert(vehicle>=0&&modularTag>vehicle&&game>modularTag,'rocket-modular.js must wrap RocketVehicle after vehicle-art and before game.js');

const build=read('outputs/rocket/build.cjs');
assert(build.includes("'../../../live/rocket-modular.js':path.join(repo,'live','rocket-modular.js')"),'standalone build must package rocket-modular.js');

console.log('Rocket modular QA PASS: body and fins are separate six-tier canonical families, SHA-bound visual approvals match production, purchased hull/fins select independently, and runtime/standalone wiring is present.');
