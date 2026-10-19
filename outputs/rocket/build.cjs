/* Собирает полностью автономную игру. Нужен только Node.js, без пакетов. */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const repo=path.resolve(__dirname,'../..');
const dist=path.join(__dirname,'dist'),out=path.resolve(__dirname,'..','Выше неба.html');
const runtimeManifestPath=path.join(__dirname,'runtime-assets.json');
const runtimeManifest=JSON.parse(fs.readFileSync(runtimeManifestPath,'utf8'));

let html=fs.readFileSync(path.join(dist,'index.html'),'utf8');
html=html.replace('<link rel="stylesheet" href="style.css">',()=>'<style>'+fs.readFileSync(path.join(dist,'style.css'),'utf8')+'</style>');

const assets={};
const mime={'.png':'image/png','.json':'application/json','.zip':'application/zip'};
function embedFile(abs,logical){
  const ext=path.extname(abs).toLowerCase();
  if(!mime[ext])throw new Error(`Unsupported runtime asset extension: ${abs}`);
  assets[logical.replaceAll('\\','/')]=`data:${mime[ext]};base64,`+fs.readFileSync(abs).toString('base64');
}
function walkLegacy(dir,prefix=''){
  if(!fs.existsSync(dir))return;
  for(const ent of fs.readdirSync(dir,{withFileTypes:true})){
    const abs=path.join(dir,ent.name),rel=(prefix?prefix+'/':'')+ent.name;
    if(ent.isDirectory())walkLegacy(abs,rel);
    else if(mime[path.extname(ent.name).toLowerCase()])embedFile(abs,rel);
  }
}
const legacyRoot=path.resolve(repo,runtimeManifest.legacy_root);
walkLegacy(legacyRoot);
for(const family of runtimeManifest.canonical_families||[]){
  const prefix=family.target.replace(/\/+$/,'')+'/';
  for(const key of Object.keys(assets))if(key.startsWith(prefix))delete assets[key];
  const sourceRoot=path.resolve(repo,family.source);
  for(const rel of family.include||[]){
    const abs=path.resolve(sourceRoot,rel);
    if(!abs.startsWith(sourceRoot+path.sep)&&abs!==sourceRoot)throw new Error(`Asset escapes source root: ${rel}`);
    if(!fs.existsSync(abs))throw new Error(`Missing canonical runtime asset: ${family.asset_id}: ${rel}`);
    embedFile(abs,prefix+rel.replaceAll('\\','/'));
  }
}
html=html.replace('<script src="engine.js"></script>',()=>'<script>window.__GAME_ASSETS__='+JSON.stringify(assets)+';</script><script src="engine.js"></script>');

const jsSources={
  'engine.js':path.join(dist,'engine.js'),
  'journey.js':path.join(dist,'journey.js'),
  'aircraft-runtime.js':path.join(repo,'live','aircraft.js'),
  'world-sprites.js':path.join(repo,'live','world-sprites.js'),
  'world-art.js':path.join(dist,'world-art.js'),
  'content.js':path.join(dist,'content.js'),
  'audio.js':path.join(dist,'audio.js'),
  'vehicle-art.js':path.join(dist,'vehicle-art.js'),
  '../../../live/mobile-ux.js':path.join(repo,'live','mobile-ux.js'),
  '../../../live/portrait-ux.js':path.join(repo,'live','portrait-ux.js'),
  'game.js':path.join(dist,'game.js'),
  'weather-complex-rig.js':path.join(dist,'weather-complex-rig.js'),
  'weather-complex-runtime.js':path.join(dist,'weather-complex-runtime.js'),
  'infrastructure.js':path.join(dist,'infrastructure.js'),
  'weather-complex-window.js':path.join(dist,'weather-complex-window.js')
};
for(const [logical,source] of Object.entries(jsSources)){
  const js=fs.readFileSync(source,'utf8');
  new vm.Script(js,{filename:source});
  const tag='<script src="'+logical+'"></script>';
  if(!html.includes(tag))throw new Error(`Missing script tag in dist/index.html: ${logical}`);
  html=html.replace(tag,()=>'<script>'+js.replace(/<\/script/gi,'<\\/script')+'</script>');
}
fs.writeFileSync(out,html);
process.stdout.write(`Автономная игра собрана: ${out} (runtime assets: ${Object.keys(assets).length})\n`);
