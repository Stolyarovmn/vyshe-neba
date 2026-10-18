/* Собирает полностью автономную игру. Нужен только Node.js, без пакетов. */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'dist'),out=path.resolve(__dirname,'..','Выше неба.html');
// Canonical runtime sources are mirrored during every build.
for(const [source,target] of [['live/aircraft.js','aircraft-runtime.js'],['live/world-sprites.js','world-sprites.js']])fs.copyFileSync(path.resolve(__dirname,'../..',source),path.join(root,target));
let html=fs.readFileSync(path.join(root,'index.html'),'utf8');
html=html.replace('<link rel="stylesheet" href="style.css">',()=>'<style>'+fs.readFileSync(path.join(root,'style.css'),'utf8')+'</style>');
const assets={};
const mime={'.png':'image/png','.json':'application/json','.zip':'application/zip'};
(function walk(dir,prefix=''){for(const ent of fs.readdirSync(dir,{withFileTypes:true})){const abs=path.join(dir,ent.name),rel=(prefix?prefix+'/':'')+ent.name;if(ent.isDirectory())walk(abs,rel);else{const ext=path.extname(ent.name).toLowerCase();if(mime[ext])assets[rel]=`data:${mime[ext]};base64,`+fs.readFileSync(abs).toString('base64');}}})(path.join(root,'assets'));
html=html.replace('<script src="engine.js"></script>',()=>'<script>window.__GAME_ASSETS__='+JSON.stringify(assets)+';</script><script src="engine.js"></script>');
for(let f of ['engine.js','journey.js','aircraft-runtime.js','world-sprites.js','world-art.js','content.js','audio.js','vehicle-art.js','game.js','weather-complex-rig.js','weather-complex-runtime.js','infrastructure.js']){let js=fs.readFileSync(path.join(root,f),'utf8');new vm.Script(js,{filename:f});html=html.replace('<script src="'+f+'"></script>',()=>'<script>'+js.replace(/<\/script/gi,'<\\/script')+'</script>');}
fs.writeFileSync(out,html);process.stdout.write('Автономная игра собрана: '+out+'\n');
